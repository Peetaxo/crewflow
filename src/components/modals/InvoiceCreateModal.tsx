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
  onSubmitSuccess?: () => void;
}

const InvoiceCreateModal = ({ onClose, onDirtyChange, onSubmitSuccess }: InvoiceCreateModalProps) => {
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
        onDirtyChange?.(false);
        onSubmitSuccess?.();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nepodarilo se vytvorit fakturu.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex items-center justify-between rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Vytvorit fakturu</h2>
          <p className="mt-0.5 text-xs text-gray-500">
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
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-white"
          >
            <ArrowLeft size={14} /> Zpet na vyber
          </button>
        )}
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        {selectedContractorKey == null ? (
          <div className="space-y-3">
            {candidates.length === 0 ? (
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-10 text-center text-sm text-gray-500">
                Nikdo ted nema schvalene polozky k fakturaci.
              </div>
            ) : (
              candidates.map((candidate) => (
                <button
                  key={candidate.contractorProfileId ?? candidate.contractorName}
                  type="button"
                  onClick={() => {
                    if (!candidate.contractorProfileId) {
                      return;
                    }
                    setSelectedContractorKey(candidate.contractorProfileId);
                    loadPreview(candidate.contractorProfileId, true);
                  }}
                  className="flex w-full items-center justify-between rounded-xl border border-gray-100 bg-white p-4 text-left shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50"
                >
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                      <UserRound size={16} className="text-emerald-600" />
                      {candidate.contractorName}
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      {candidate.timelogCount} schvalenych timelogu · {candidate.receiptCount} schvalenych uctenek
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-gray-900">{formatCurrency(candidate.totalAmount)}</div>
                    <div className="mt-1 text-[11px] text-emerald-700">Otevrit nahled</div>
                  </div>
                </button>
              ))
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 p-4">
              <div>
                <div className="text-sm font-semibold text-gray-900">{preview?.contractorName ?? 'Neznamy kontraktor'}</div>
                <div className="mt-1 text-xs text-gray-500">
                  Vybrano: {selectedTimelogIds.length} timelogu · {selectedReceiptIds.length} uctenek
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-gray-500">Vybrany soucet</div>
                <div className="text-lg font-semibold text-gray-900">{formatCurrency(selectedTotal)}</div>
              </div>
            </div>

            {(preview?.items ?? []).map((item) => (
              <div key={item.jobNumber} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <div className="jn">{item.jobNumber}</div>
                    <div className="mt-1 text-xs text-gray-500">
                      {item.timelogIds.length} timelogu · {item.receiptIds.length} uctenek
                    </div>
                  </div>
                  <div className="text-right text-sm font-semibold text-gray-900">
                    {formatCurrency(item.totalAmount)}
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-lg bg-gray-50 p-3">
                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-gray-700">
                      <CheckSquare size={14} /> Timelogy
                    </div>
                    <div className="space-y-2">
                      {item.timelogIds.length === 0 && (
                        <div className="text-xs text-gray-400">Bez timelogu</div>
                      )}
                      {item.timelogEntries.map((entry) => {
                        const isSelected = selectedTimelogIds.includes(entry.timelogId);
                        return (
                          <button
                            key={entry.timelogId}
                            type="button"
                            onClick={() => toggleTimelog(entry.timelogId)}
                            className="flex w-full items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-left text-xs hover:bg-emerald-50"
                          >
                            <div className="min-w-0">
                              <div className="truncate font-medium text-gray-800">
                                {entry.jobNumber} · {entry.eventName}
                              </div>
                              <div className="mt-0.5 text-[11px] text-gray-500">
                                {entry.hours}h · {formatCurrency(entry.amountHours + entry.amountKm)}
                              </div>
                            </div>
                            <span
                              className={`inline-flex h-5 w-5 items-center justify-center rounded border text-[11px] font-bold ${
                                isSelected
                                  ? 'border-emerald-600 bg-emerald-600 text-white'
                                  : 'border-gray-300 bg-white text-transparent'
                              }`}
                            >
                              ✓
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="rounded-lg bg-amber-50 p-3">
                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-amber-800">
                      <Receipt size={14} /> Uctenky
                    </div>
                    <div className="space-y-2">
                      {item.receiptIds.length === 0 && (
                        <div className="text-xs text-amber-600/60">Bez uctenek</div>
                      )}
                      {item.receiptIds.map((receiptId) => {
                        const isSelected = selectedReceiptIds.includes(receiptId);
                        return (
                          <button
                            key={receiptId}
                            type="button"
                            onClick={() => toggleReceipt(receiptId)}
                            className="flex w-full items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-left text-xs hover:bg-amber-100"
                          >
                            <span>Uctenka #{receiptId}</span>
                            <span
                              className={`inline-flex h-5 w-5 items-center justify-center rounded border text-[11px] font-bold ${
                                isSelected
                                  ? 'border-emerald-600 bg-emerald-600 text-white'
                                  : 'border-gray-300 bg-white text-transparent'
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

            <div className="flex items-center justify-end gap-3 border-t border-gray-100 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-white"
              >
                Zpet na faktury
              </button>
              <button
                type="button"
                onClick={() => handleCreate(false)}
                disabled={selectedContractorKey == null || isSubmitting || (selectedTimelogIds.length === 0 && selectedReceiptIds.length === 0)}
                className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-white px-4 py-2 text-sm font-medium text-emerald-700 shadow-sm hover:bg-emerald-50 disabled:cursor-not-allowed disabled:border-emerald-100 disabled:text-emerald-300"
              >
                <FilePlus2 size={16} />
                {isSubmitting ? 'Ukladam...' : 'Draft'}
              </button>
              <button
                type="button"
                onClick={() => handleCreate(true)}
                disabled={selectedContractorKey == null || isSubmitting || (selectedTimelogIds.length === 0 && selectedReceiptIds.length === 0)}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm shadow-emerald-200 hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
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
