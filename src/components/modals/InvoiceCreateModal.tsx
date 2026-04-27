import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckSquare, FilePlus2, Receipt, UserRound } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { formatCurrency } from '../../utils';
import {
  createInvoiceFromSelection,
  getInvoiceCreateCandidates,
  getInvoiceCreatePreview,
  sendInvoice,
  type InvoiceCreateCandidate,
  type InvoiceCreatePreview,
} from '../../features/invoices/services/invoices.service';
import { useInvoicesQuery } from '../../features/invoices/queries/useInvoicesQuery';
import { useTimelogsQuery } from '../../features/timelogs/queries/useTimelogsQuery';
import { useReceiptsQuery } from '../../features/receipts/queries/useReceiptsQuery';

interface InvoiceCreateModalProps {
  onClose: () => void;
  onDirtyChange?: (isDirty: boolean) => void;
}

const InvoiceCreateModal = ({ onClose, onDirtyChange }: InvoiceCreateModalProps) => {
  const invoicesQuery = useInvoicesQuery();
  const timelogsQuery = useTimelogsQuery();
  const receiptsQuery = useReceiptsQuery();
  const [selectedContractorKey, setSelectedContractorKey] = useState<string | null>(null);
  const [selectedTimelogIds, setSelectedTimelogIds] = useState<number[]>([]);
  const [selectedReceiptIds, setSelectedReceiptIds] = useState<number[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadPreview = useCallback((contractorKey: string | null, resetSelection = true) => {
    if (contractorKey == null) {
      setSelectedTimelogIds([]);
      setSelectedReceiptIds([]);
      return;
    }

    const nextPreview = getInvoiceCreatePreview(contractorKey);
    const nextTimelogIds = nextPreview?.timelogIds ?? [];
    const nextReceiptIds = nextPreview?.receiptIds ?? [];

    setSelectedTimelogIds((current) => (
      resetSelection
        ? nextTimelogIds
        : current.filter((id) => nextTimelogIds.includes(id))
    ));
    setSelectedReceiptIds((current) => (
      resetSelection
        ? nextReceiptIds
        : current.filter((id) => nextReceiptIds.includes(id))
      ));
  }, []);

  const candidates = useMemo<InvoiceCreateCandidate[]>(
    () => {
      void invoicesQuery.data;
      void receiptsQuery.data;
      void timelogsQuery.data;
      return getInvoiceCreateCandidates();
    },
    [invoicesQuery.data, receiptsQuery.data, timelogsQuery.data],
  );

  const preview = useMemo<InvoiceCreatePreview | null>(
    () => {
      void invoicesQuery.data;
      void receiptsQuery.data;
      void timelogsQuery.data;
      return selectedContractorKey == null ? null : getInvoiceCreatePreview(selectedContractorKey);
    },
    [invoicesQuery.data, receiptsQuery.data, selectedContractorKey, timelogsQuery.data],
  );

  useEffect(() => {
    if (selectedContractorKey != null) {
      loadPreview(selectedContractorKey, false);
    }
  }, [loadPreview, preview, selectedContractorKey]);

  const isDirty = selectedContractorKey !== null;

  useEffect(() => {
    onDirtyChange?.(isDirty);
    return () => {
      onDirtyChange?.(false);
    };
  }, [isDirty, onDirtyChange]);

  const selectedTotal = useMemo(() => {
    if (!preview) return 0;
    return preview.items.reduce((sum, item) => {
      const timelogTotal = item.timelogEntries.reduce((timelogSum, entry) => (
        selectedTimelogIds.includes(entry.timelogId)
          ? timelogSum + entry.amountHours + entry.amountKm
          : timelogSum
      ), 0);
      const receiptTotal = item.receiptEntries.reduce((receiptSum, entry) => (
        selectedReceiptIds.includes(entry.receiptId)
          ? receiptSum + entry.amount
          : receiptSum
      ), 0);

      return sum + timelogTotal + receiptTotal;
    }, 0);
  }, [preview, selectedReceiptIds, selectedTimelogIds]);

  const toggleTimelog = (timelogId: number) => {
    setSelectedTimelogIds((current) => (
      current.includes(timelogId)
        ? current.filter((id) => id !== timelogId)
        : [...current, timelogId]
    ));
  };

  const toggleReceipt = (receiptId: number) => {
    setSelectedReceiptIds((current) => (
      current.includes(receiptId)
        ? current.filter((id) => id !== receiptId)
        : [...current, receiptId]
    ));
  };

  const handleCreate = async (sendImmediately: boolean) => {
    if (selectedContractorKey == null) return;

    try {
      setIsSubmitting(true);
      const created = await createInvoiceFromSelection(
        selectedContractorKey,
        selectedTimelogIds,
        selectedReceiptIds,
      );

      if (created && sendImmediately) {
        await sendInvoice(created.id);
      }

      if (created) {
        onClose();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nepodarilo se vytvorit fakturu.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex items-center justify-between rounded-[24px] border border-[var(--nodu-border)] bg-white p-5 shadow-[0_18px_40px_rgba(var(--nodu-text-rgb),0.06)]">
        <div>
          <h2 className="text-lg font-semibold text-[var(--nodu-text)]">Vytvorit fakturu</h2>
          <p className="mt-0.5 text-xs text-[var(--nodu-text-soft)]">
            {selectedContractorKey == null
              ? 'Vyber kontraktora pripraveneho k fakturaci.'
              : 'Zkontroluj a pripadne uprav vyber polozek pred vytvorenim faktury.'}
          </p>
        </div>
        {selectedContractorKey != null && (
          <button
            type="button"
            onClick={() => {
              setSelectedContractorKey(null);
              loadPreview(null);
            }}
            className="inline-flex items-center gap-1 rounded-xl border border-[var(--nodu-border)] px-3 py-2 text-xs font-medium text-[var(--nodu-text)] transition hover:bg-[var(--nodu-accent-soft)]"
          >
            <ArrowLeft size={14} /> Zpet na vyber
          </button>
        )}
      </div>

      <div className="rounded-[24px] border border-[var(--nodu-border)] bg-white p-5 shadow-[0_18px_40px_rgba(var(--nodu-text-rgb),0.06)]">
        {selectedContractorKey == null ? (
          <div className="space-y-3">
            {candidates.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--nodu-border)] bg-[var(--nodu-paper-strong)] p-10 text-center text-sm text-[var(--nodu-text-soft)]">
                Nikdo ted nema schvalene polozky k fakturaci.
              </div>
            ) : (
              candidates.map((candidate) => (
                <button
                  key={candidate.contractorId}
                  type="button"
                  onClick={() => {
                    const contractorKey = candidate.contractorProfileId ?? `legacy:${candidate.contractorId}`;
                    setSelectedContractorKey(contractorKey);
                    loadPreview(contractorKey, true);
                  }}
                  className="flex w-full items-center justify-between rounded-2xl border border-[var(--nodu-border)] bg-white p-4 text-left shadow-sm transition hover:border-[rgba(var(--nodu-accent-rgb),0.35)] hover:bg-[var(--nodu-accent-soft)]"
                >
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-[var(--nodu-text)]">
                      <UserRound size={16} className="text-[var(--nodu-accent)]" />
                      {candidate.contractorName}
                    </div>
                    <div className="mt-1 text-xs text-[var(--nodu-text-soft)]">
                      {candidate.timelogCount} schvalenych timelogu · {candidate.receiptCount} schvalenych uctenek
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-[var(--nodu-text)]">{formatCurrency(candidate.totalAmount)}</div>
                    <div className="mt-1 text-[11px] font-semibold text-[var(--nodu-accent)]">Otevrit nahled</div>
                  </div>
                </button>
              ))
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-2xl border border-[var(--nodu-border)] bg-[var(--nodu-paper-strong)] p-4">
              <div>
                <div className="text-sm font-semibold text-[var(--nodu-text)]">{preview?.contractorName ?? 'Neznamy kontraktor'}</div>
                <div className="mt-1 text-xs text-[var(--nodu-text-soft)]">
                  Vybrano: {selectedTimelogIds.length} timelogu · {selectedReceiptIds.length} uctenek
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-[var(--nodu-text-soft)]">Vybrany soucet</div>
                <div className="text-lg font-semibold text-[var(--nodu-text)]">{formatCurrency(selectedTotal)}</div>
              </div>
            </div>

            {(preview?.items ?? []).map((item) => (
              <div key={item.jobNumber} className="rounded-2xl border border-[var(--nodu-border)] bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <div className="jn">{item.jobNumber}</div>
                    <div className="mt-1 text-xs text-[var(--nodu-text-soft)]">
                      {item.timelogIds.length} timelogu · {item.receiptIds.length} uctenek
                    </div>
                  </div>
                  <div className="text-right text-sm font-semibold text-[var(--nodu-text)]">
                    {formatCurrency(item.totalAmount)}
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-[var(--nodu-border)] bg-[var(--nodu-paper-strong)] p-3">
                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-[var(--nodu-text)]">
                      <CheckSquare size={14} /> Timelogy
                    </div>
                    <div className="space-y-2">
                      {item.timelogIds.length === 0 && (
                        <div className="text-xs text-[var(--nodu-text-soft)]">Bez timelogu</div>
                      )}
                      {item.timelogEntries.map((entry) => {
                        const isSelected = selectedTimelogIds.includes(entry.timelogId);
                        return (
                          <button
                            key={entry.timelogId}
                            type="button"
                            onClick={() => toggleTimelog(entry.timelogId)}
                            className="flex w-full items-center justify-between gap-3 rounded-xl border border-transparent bg-white px-3 py-2 text-left text-xs transition hover:border-[rgba(var(--nodu-accent-rgb),0.22)] hover:bg-[var(--nodu-accent-soft)]"
                          >
                            <div className="min-w-0">
                              <div className="truncate font-medium text-[var(--nodu-text)]">
                                {entry.jobNumber} · {entry.eventName}
                              </div>
                              <div className="mt-0.5 text-[11px] text-[var(--nodu-text-soft)]">
                                {entry.hours}h · {formatCurrency(entry.amountHours + entry.amountKm)}
                              </div>
                            </div>
                            <span
                              className={`inline-flex h-5 w-5 items-center justify-center rounded border text-[11px] font-bold ${
                                isSelected
                                  ? 'border-[var(--nodu-accent)] bg-[var(--nodu-accent)] text-white'
                                  : 'border-[var(--nodu-border)] bg-white text-transparent'
                              }`}
                            >
                              ✓
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="rounded-xl border border-[rgba(var(--nodu-accent-rgb),0.18)] bg-[var(--nodu-accent-soft)] p-3">
                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-[var(--nodu-text)]">
                      <Receipt size={14} /> Uctenky
                    </div>
                    <div className="space-y-2">
                      {item.receiptIds.length === 0 && (
                        <div className="text-xs text-[var(--nodu-text-soft)]">Bez uctenek</div>
                      )}
                      {item.receiptIds.map((receiptId) => {
                        const isSelected = selectedReceiptIds.includes(receiptId);
                        return (
                          <button
                            key={receiptId}
                            type="button"
                            onClick={() => toggleReceipt(receiptId)}
                            className="flex w-full items-center justify-between gap-3 rounded-xl border border-transparent bg-white px-3 py-2 text-left text-xs transition hover:border-[rgba(var(--nodu-accent-rgb),0.22)]"
                          >
                            <span>Uctenka #{receiptId}</span>
                            <span
                              className={`inline-flex h-5 w-5 items-center justify-center rounded border text-[11px] font-bold ${
                                isSelected
                                  ? 'border-[var(--nodu-accent)] bg-[var(--nodu-accent)] text-white'
                                  : 'border-[var(--nodu-border)] bg-white text-transparent'
                              }`}
                            >
                              ✓
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            <div className="flex items-center justify-end gap-3 border-t border-[var(--nodu-border)] pt-4">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-[var(--nodu-border)] px-4 py-2 text-sm font-medium text-[var(--nodu-text)] hover:bg-[var(--nodu-accent-soft)]"
              >
                Zpet na faktury
              </button>
              <button
                type="button"
                onClick={() => handleCreate(false)}
                disabled={selectedContractorKey == null || isSubmitting || (selectedTimelogIds.length === 0 && selectedReceiptIds.length === 0)}
                className="inline-flex items-center gap-2 rounded-xl border border-[rgba(var(--nodu-accent-rgb),0.28)] bg-white px-4 py-2 text-sm font-medium text-[var(--nodu-accent)] shadow-sm hover:bg-[var(--nodu-accent-soft)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <FilePlus2 size={16} />
                {isSubmitting ? 'Ukladam...' : 'Draft'}
              </button>
              <button
                type="button"
                onClick={() => handleCreate(true)}
                disabled={selectedContractorKey == null || isSubmitting || (selectedTimelogIds.length === 0 && selectedReceiptIds.length === 0)}
                className="inline-flex items-center gap-2 rounded-xl bg-[var(--nodu-accent)] px-4 py-2 text-sm font-semibold text-white shadow-[0_16px_32px_rgba(var(--nodu-accent-rgb),0.18)] hover:bg-[#e96f00] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <FilePlus2 size={16} />
                {isSubmitting ? 'Vytvarim...' : 'Vytvorit a poslat'}
              </button>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default InvoiceCreateModal;
