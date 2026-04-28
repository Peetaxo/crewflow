import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { useAuth } from '../app/providers/useAuth';
import { useAppContext } from '../context/useAppContext';
import { Contractor, Event, ReceiptItem } from '../types';
import { formatCurrency, formatShortDate } from '../utils';
import StatusBadge from '../components/shared/StatusBadge';
import {
  createEmptyReceipt,
  getReceiptDependencies,
  updateReceiptStatus,
} from '../features/receipts/services/receipts.service';
import { useReceiptsQuery } from '../features/receipts/queries/useReceiptsQuery';

interface ReceiptsViewProps {
  scope?: 'all' | 'mine';
}

const ReceiptsView = ({ scope = 'all' }: ReceiptsViewProps) => {
  const {
    role,
    searchQuery,
    setEditingReceipt,
    setDeleteConfirm,
  } = useAppContext();
  const { currentProfileId } = useAuth();
  const receiptsQuery = useReceiptsQuery();
  const [events, setEvents] = useState<Event[]>([]);
  const [contractors, setContractors] = useState<Contractor[]>([]);

  const loadDependencies = useCallback(() => {
    const dependencies = getReceiptDependencies();
    setEvents(dependencies.events);
    setContractors(dependencies.contractors);
  }, []);

  useEffect(() => {
    loadDependencies();
  }, [loadDependencies, receiptsQuery.data]);

  const findEvent = useCallback((id: number) => (
    events.find((event) => event.id === id) ?? null
  ), [events]);

  const findContractor = useCallback((contractorProfileId?: string) => (
    contractorProfileId
      ? contractors.find((contractor) => contractor.profileId === contractorProfileId) ?? null
      : null
  ), [contractors]);

  const receipts = useMemo(() => {
    const safeReceipts = receiptsQuery.data ?? [];
    const query = searchQuery.trim().toLowerCase();

    if (!query) return safeReceipts;

    return safeReceipts.filter((receipt) => {
      const event = events.find((item) => item.id === receipt.eid);
      const contractor = findContractor(receipt.contractorProfileId);
      if (!event || !contractor) return false;

      return (
        receipt.title.toLowerCase().includes(query)
        || receipt.vendor.toLowerCase().includes(query)
        || receipt.job.toLowerCase().includes(query)
        || event.name.toLowerCase().includes(query)
        || contractor.name.toLowerCase().includes(query)
      );
    });
  }, [events, findContractor, receiptsQuery.data, searchQuery]);

  const isCrew = role === 'crew';
  const baseReceipts = scope === 'mine'
    ? receipts.filter((receipt) => receipt.contractorProfileId === currentProfileId)
    : receipts;
  const title = scope === 'mine' ? 'Moje účtenky' : 'Účtenky';

  const stats = useMemo(() => ({
    total: baseReceipts.reduce((sum, receipt) => sum + receipt.amount, 0),
    submitted: baseReceipts.filter((receipt) => receipt.status === 'submitted').length,
    approved: baseReceipts.filter((receipt) => receipt.status === 'approved').length,
    reimbursed: baseReceipts.filter((receipt) => receipt.status === 'reimbursed').length,
  }), [baseReceipts]);

  const handleReceiptAction = useCallback((receiptId: number, action: 'submit' | 'approve' | 'reimburse' | 'reject') => {
    void updateReceiptStatus(receiptId, action).catch((error) => {
      toast.error(error instanceof Error ? error.message : 'Nepodařilo se aktualizovat účtenku.');
    });
  }, []);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="nodu-dashboard-kicker">Expenses</div>
          <h1 className="text-2xl font-semibold tracking-[-0.03em] text-[color:var(--nodu-text)]">{title}</h1>
          <p className="mt-1 text-sm text-[color:var(--nodu-text-soft)]">
            Výdaje crew přiřazené ke konkrétní akci a projektu.
          </p>
        </div>

        <Button
          onClick={() => setEditingReceipt(createEmptyReceipt(
            currentProfileId ?? contractors[0]?.profileId,
          ))}
          size="sm"
          className="text-xs"
        >
          <span className="inline-flex items-center gap-1.5">
            <Plus size={14} />
            Nová účtenka
          </span>
        </Button>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-4">
        {[
          { label: 'Celkem', value: formatCurrency(stats.total), tone: 'bg-[color:rgb(var(--nodu-accent-rgb)/0.08)] border-[color:rgb(var(--nodu-accent-rgb)/0.18)] text-[color:var(--nodu-text)]' },
          { label: 'Ke schválení', value: stats.submitted, tone: 'bg-[color:rgb(var(--nodu-accent-rgb)/0.08)] border-[color:rgb(var(--nodu-accent-rgb)/0.18)] text-[color:var(--nodu-text)]' },
          { label: 'Schválené', value: stats.approved, tone: 'bg-[color:rgb(var(--nodu-text-rgb)/0.05)] border-[color:rgb(var(--nodu-text-rgb)/0.08)] text-[color:var(--nodu-text)]' },
          { label: 'Proplacené', value: stats.reimbursed, tone: 'bg-[color:rgb(var(--nodu-text-rgb)/0.05)] border-[color:rgb(var(--nodu-text-rgb)/0.08)] text-[color:var(--nodu-text)]' },
        ].map((item) => (
          <div key={item.label} className={`rounded-xl border p-4 ${item.tone}`}>
            <div className="text-[10px] uppercase tracking-wider text-[color:var(--nodu-text-soft)]">{item.label}</div>
            <div className="mt-2 text-xl font-bold">{item.value}</div>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-[28px] border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.98)] shadow-[0_18px_42px_rgba(47,38,31,0.08)]">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-[color:rgb(var(--nodu-text-rgb)/0.08)] text-[10px] uppercase tracking-wider text-[color:var(--nodu-text-soft)]">
              <th className="px-4 py-3 font-medium">Účtenka</th>
              <th className="px-4 py-3 font-medium">Akce</th>
              <th className="px-4 py-3 font-medium">Crew</th>
              <th className="px-4 py-3 font-medium">Datum</th>
              <th className="px-4 py-3 font-medium">Částka</th>
              <th className="px-4 py-3 font-medium">Stav</th>
              <th className="px-4 py-3 font-medium text-right">Akce</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:rgb(var(--nodu-text-rgb)/0.06)]">
            {baseReceipts.map((receipt) => {
              const event = findEvent(receipt.eid);
              const contractor = findContractor(receipt.contractorProfileId);

              return (
                <tr key={receipt.id} className="transition-colors hover:bg-[color:rgb(var(--nodu-accent-rgb)/0.04)]">
                  <td className="px-4 py-3">
                    <div className="text-xs font-semibold text-[color:var(--nodu-text)]">{receipt.title}</div>
                    <div className="text-[10px] text-[color:var(--nodu-text-soft)]">{receipt.vendor || 'Bez dodavatele'}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-xs font-semibold text-[color:var(--nodu-text)]">{event?.name || 'Bez akce'}</div>
                    <div className="text-[10px] text-[color:var(--nodu-text-soft)]">{receipt.job}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-xs text-[color:var(--nodu-text)]">{contractor?.name || '—'}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-[color:var(--nodu-text)]">{formatShortDate(receipt.paidAt)}</td>
                  <td className="px-4 py-3 text-xs font-semibold text-[color:var(--nodu-text)]">{formatCurrency(receipt.amount)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={receipt.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {(scope === 'mine' || isCrew) && (receipt.status === 'draft' || receipt.status === 'rejected') && (
                        <>
                          <Button
                            onClick={() => setEditingReceipt(receipt)}
                            variant="outline"
                            size="sm"
                            className="text-[11px]"
                          >
                            Upravit
                          </Button>
                          <Button
                            onClick={() => handleReceiptAction(receipt.id, 'submit')}
                            size="sm"
                            className="text-[11px]"
                          >
                            Odeslat
                          </Button>
                        </>
                      )}

                      {!isCrew && scope === 'all' && receipt.status === 'submitted' && (
                        <>
                          <Button
                            onClick={() => handleReceiptAction(receipt.id, 'approve')}
                            size="sm"
                            className="border-[color:var(--nodu-success-border)] bg-[color:var(--nodu-success-bg)] text-[11px] text-[color:var(--nodu-success-text)] shadow-[0_10px_24px_rgba(45,108,78,0.1)] hover:bg-[color:var(--nodu-success-bg-hover)]"
                          >
                            Schválit
                          </Button>
                          <Button
                            onClick={() => handleReceiptAction(receipt.id, 'reject')}
                            variant="outline"
                            size="sm"
                            className="border-[#e8b4a3] text-[#c45c39] hover:bg-[rgba(212,93,55,0.06)] hover:text-[#c45c39] text-[11px]"
                          >
                            Zamítnout
                          </Button>
                        </>
                      )}

                      {!isCrew && scope === 'all' && receipt.status === 'approved' && (
                        <Button
                          onClick={() => handleReceiptAction(receipt.id, 'reimburse')}
                          size="sm"
                          className="border-[color:var(--nodu-success-border)] bg-[color:var(--nodu-success-bg)] text-[11px] text-[color:var(--nodu-success-text)] shadow-[0_10px_24px_rgba(45,108,78,0.1)] hover:bg-[color:var(--nodu-success-bg-hover)]"
                        >
                          Proplatit
                        </Button>
                      )}

                      <button
                        onClick={() => setDeleteConfirm({ type: 'receipt', id: receipt.id, name: receipt.title })}
                        className="rounded-lg p-1.5 text-[color:var(--nodu-text-soft)] transition-all hover:bg-[rgba(212,93,55,0.06)] hover:text-[#c45c39]"
                        title="Smazat účtenku"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {baseReceipts.length === 0 && (
          <div className="px-6 py-12 text-center text-sm text-[color:var(--nodu-text-soft)]">
            Zatím tu nejsou žádné účtenky.
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default ReceiptsView;
