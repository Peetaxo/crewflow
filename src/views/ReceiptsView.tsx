import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAuth } from '../app/providers/AuthProvider';
import { useAppContext } from '../context/AppContext';
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
  const { currentContractorId, currentProfileId } = useAuth();
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

  const findContractor = useCallback((id: number) => (
    contractors.find((contractor) => contractor.id === id) ?? null
  ), [contractors]);

  const receipts = useMemo(() => {
    const safeReceipts = receiptsQuery.data ?? [];
    const query = searchQuery.trim().toLowerCase();

    if (!query) return safeReceipts;

    return safeReceipts.filter((receipt) => {
      const event = events.find((item) => item.id === receipt.eid);
      const contractor = contractors.find((item) => item.id === receipt.cid);
      if (!event || !contractor) return false;

      return (
        receipt.title.toLowerCase().includes(query)
        || receipt.vendor.toLowerCase().includes(query)
        || receipt.job.toLowerCase().includes(query)
        || event.name.toLowerCase().includes(query)
        || contractor.name.toLowerCase().includes(query)
      );
    });
  }, [contractors, events, receiptsQuery.data, searchQuery]);

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

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-lg font-semibold">{title}</h1>
          <p className="mt-1 text-xs text-gray-500">
            Výdaje crew přiřazené ke konkrétní akci a projektu.
          </p>
        </div>

        <button
          onClick={() => setEditingReceipt(createEmptyReceipt(currentContractorId ?? (isCrew ? 1 : contractors[0]?.id || 1)))}
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-700"
        >
          <span className="inline-flex items-center gap-1.5">
            <Plus size={14} />
            Nová účtenka
          </span>
        </button>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-4">
        {[
          { label: 'Celkem', value: formatCurrency(stats.total), tone: 'bg-emerald-50 border-emerald-100 text-emerald-900' },
          { label: 'Ke schválení', value: stats.submitted, tone: 'bg-amber-50 border-amber-100 text-amber-900' },
          { label: 'Schválené', value: stats.approved, tone: 'bg-blue-50 border-blue-100 text-blue-900' },
          { label: 'Proplacené', value: stats.reimbursed, tone: 'bg-teal-50 border-teal-100 text-teal-900' },
        ].map((item) => (
          <div key={item.label} className={`rounded-xl border p-4 ${item.tone}`}>
            <div className="text-[10px] uppercase tracking-wider opacity-70">{item.label}</div>
            <div className="mt-2 text-xl font-bold">{item.value}</div>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-gray-100 text-[10px] uppercase tracking-wider text-gray-400">
              <th className="px-4 py-3 font-medium">Účtenka</th>
              <th className="px-4 py-3 font-medium">Akce</th>
              <th className="px-4 py-3 font-medium">Crew</th>
              <th className="px-4 py-3 font-medium">Datum</th>
              <th className="px-4 py-3 font-medium">Částka</th>
              <th className="px-4 py-3 font-medium">Stav</th>
              <th className="px-4 py-3 font-medium text-right">Akce</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {baseReceipts.map((receipt) => {
              const event = findEvent(receipt.eid);
              const contractor = findContractor(receipt.cid);

              return (
                <tr key={receipt.id} className="transition-colors hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="text-xs font-semibold text-gray-900">{receipt.title}</div>
                    <div className="text-[10px] text-gray-500">{receipt.vendor || 'Bez dodavatele'}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-xs font-semibold text-gray-900">{event?.name || 'Bez akce'}</div>
                    <div className="text-[10px] text-gray-500">{receipt.job}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-xs text-gray-700">{contractor?.name || '—'}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-700">{formatShortDate(receipt.paidAt)}</td>
                  <td className="px-4 py-3 text-xs font-semibold text-gray-900">{formatCurrency(receipt.amount)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={receipt.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {(scope === 'mine' || isCrew) && (receipt.status === 'draft' || receipt.status === 'rejected') && (
                        <>
                          <button
                            onClick={() => setEditingReceipt(receipt)}
                            className="rounded-lg border border-gray-200 px-2.5 py-1 text-[11px] font-medium hover:bg-gray-50"
                          >
                            Upravit
                          </button>
                          <button
                            onClick={() => updateReceiptStatus(receipt.id, 'submit')}
                            className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-emerald-700"
                          >
                            Odeslat
                          </button>
                        </>
                      )}

                      {!isCrew && scope === 'all' && receipt.status === 'submitted' && (
                        <>
                          <button
                            onClick={() => updateReceiptStatus(receipt.id, 'approve')}
                            className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-emerald-700"
                          >
                            Schválit
                          </button>
                          <button
                            onClick={() => updateReceiptStatus(receipt.id, 'reject')}
                            className="rounded-lg border border-red-100 px-2.5 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50"
                          >
                            Zamítnout
                          </button>
                        </>
                      )}

                      {!isCrew && scope === 'all' && receipt.status === 'approved' && (
                        <button
                          onClick={() => updateReceiptStatus(receipt.id, 'reimburse')}
                          className="rounded-lg bg-teal-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-teal-700"
                        >
                          Proplatit
                        </button>
                      )}

                      <button
                        onClick={() => setDeleteConfirm({ type: 'receipt', id: receipt.id, name: receipt.title })}
                        className="rounded-lg p-1.5 text-gray-300 transition-all hover:bg-red-50 hover:text-red-600"
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
          <div className="px-6 py-12 text-center text-sm text-gray-400">
            Zatím tu nejsou žádné účtenky.
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default ReceiptsView;
