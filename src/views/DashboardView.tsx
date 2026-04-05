import React from 'react';
import { ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAppContext } from '../context/AppContext';
import { calculateTotalHours, formatCurrency, formatDateRange, getDatesBetween } from '../utils';
import StatCard from '../components/shared/StatCard';
import StatusBadge from '../components/shared/StatusBadge';

/** Dashboard — hlavní přehled */
const DashboardView = () => {
  const {
    role, filteredTimelogs, filteredInvoices, filteredEvents,
    findContractor, findEvent, setCurrentTab,
  } = useAppContext();

  const pendingForMe = filteredTimelogs.filter(t =>
    t.status === (role === 'hoc' ? 'pending_hoc' : 'pending_coo')
  ).length;

  const pendingInvoices = filteredInvoices.filter(i => i.status === 'draft').length;

  const approvedHours = filteredTimelogs
    .filter(t => t.status === 'approved' || t.status === 'invoiced')
    .reduce((sum, t) => sum + calculateTotalHours(t.days), 0);

  const needsFilling = filteredEvents.filter(e => e.filled < e.needed).length;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="mb-5">
        <h1 className="text-lg font-semibold text-gray-900">Dashboard</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          {role === 'hoc' ? 'Pohled Head of Crew' : 'Pohled COO'} · Duben 2025
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard
          label="Výkazy čeká na mě"
          value={pendingForMe}
          sub={role === 'hoc' ? 'Ke kontrole (HoC)' : 'Ke schválení (COO)'}
          cls={pendingForMe ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}
        />
        <StatCard
          label="Faktury ke generování"
          value={pendingInvoices}
          sub="Self-billing"
          cls={pendingInvoices ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}
        />
        <StatCard
          label="Schválené hodiny"
          value={`${Math.round(approvedHours)}h`}
          sub="Tento měsíc"
          cls="bg-emerald-50 text-emerald-700"
        />
        <StatCard
          label="Akce bez obsazení"
          value={needsFilling}
          sub="Chybí crew"
          cls={needsFilling ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Timelogy ke zpracování */}
        <div className="lg:col-span-3 bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
          <h2 className="text-[13px] font-semibold mb-3">Timelogy ke zpracování</h2>
          <div className="space-y-1">
            {filteredTimelogs
              .filter(t => t.status === (role === 'hoc' ? 'pending_hoc' : 'pending_coo'))
              .slice(0, 4)
              .map(t => {
                const c = findContractor(t.cid);
                const e = findEvent(t.eid);
                if (!c || !e) return null;
                const hours = calculateTotalHours(t.days);
                return (
                  <div key={t.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                    <div className="av w-8 h-8 text-[10px]" style={{ backgroundColor: c.bg, color: c.fg }}>{c.ii}</div>
                    <div className="flex-1 min-width-0">
                      <div className="text-xs font-semibold truncate">{c.name}</div>
                      <div className="text-[11px] text-gray-500">{e.name} <span className="jn">{e.job}</span></div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-semibold">{hours.toFixed(1)}h</div>
                      <div className="text-[11px] text-gray-500">{formatCurrency(hours * c.rate)}</div>
                    </div>
                    <button onClick={() => setCurrentTab('approvals')} className="p-1.5 hover:bg-gray-50 rounded-md text-emerald-600">
                      <ChevronRight size={14} />
                    </button>
                  </div>
                );
              })}
            {filteredTimelogs.filter(t => t.status === (role === 'hoc' ? 'pending_hoc' : 'pending_coo')).length === 0 && (
              <div className="text-center text-gray-400 py-8 text-sm">Žádné výkazy k akci</div>
            )}
          </div>
        </div>

        {/* Nadcházející akce */}
        <div className="lg:col-span-2 bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
          <h2 className="text-[13px] font-semibold mb-3">Nadcházející akce</h2>
          <div className="space-y-3">
            {filteredEvents.map(e => (
              <div key={e.id} className="pb-3 border-b border-gray-50 last:border-0 last:pb-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="jn">{e.job}</span>
                  <StatusBadge status={e.status} />
                </div>
                <div className="text-xs font-semibold truncate">{e.name}</div>
                <div className="text-[11px] text-gray-500 mt-0.5 flex items-center gap-1.5">
                  {formatDateRange(e.startDate, e.endDate)} · {e.city}
                  {e.startDate !== e.endDate && (
                    <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-[9px] font-bold uppercase tracking-tighter">
                      {getDatesBetween(e.startDate, e.endDate).length} dny
                    </span>
                  )}
                </div>
                <div className="mt-2 bg-gray-100 rounded-full h-1 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${e.filled >= e.needed ? 'bg-emerald-500' : 'bg-amber-500'}`}
                    style={{ width: `${Math.min(100, Math.round(e.filled / e.needed * 100))}%` }}
                  />
                </div>
                <div className="text-[10px] text-gray-500 mt-1">{e.filled}/{e.needed} crew</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default DashboardView;
