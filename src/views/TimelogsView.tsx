import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useAppContext } from '../context/AppContext';
import { calculateTotalHours, calculateDayHours, formatShortDate } from '../utils';
import StatusBadge from '../components/shared/StatusBadge';

interface TimelogsViewProps {
  scope?: 'all' | 'mine';
}

const TimelogsView = ({ scope = 'all' }: TimelogsViewProps) => {
  const { filteredTimelogs, findContractor, findEvent, handleTimelogAction, setEditingTimelog, role, timelogFilter, setTimelogFilter } = useAppContext();
  const baseTimelogs = scope === 'mine' ? filteredTimelogs.filter((t) => t.cid === 1) : filteredTimelogs;
  const filtered = timelogFilter === 'all' ? baseTimelogs : baseTimelogs.filter((t) => t.status === timelogFilter);
  const isCrew = role === 'crew';
  const title = scope === 'mine' ? 'Moje timelogy' : 'Timelogy';

  const filterOptions = useMemo(() => {
    const counts = {
      all: baseTimelogs.length,
      draft: baseTimelogs.filter((t) => t.status === 'draft').length,
      pending_ch: baseTimelogs.filter((t) => t.status === 'pending_ch').length,
      pending_coo: baseTimelogs.filter((t) => t.status === 'pending_coo').length,
      approved: baseTimelogs.filter((t) => t.status === 'approved').length,
      invoiced: baseTimelogs.filter((t) => t.status === 'invoiced').length,
      paid: baseTimelogs.filter((t) => t.status === 'paid').length,
      rejected: baseTimelogs.filter((t) => t.status === 'rejected').length,
    };

    return [
      { id: 'all', label: 'Vše', count: counts.all },
      { id: 'draft', label: 'Koncepty', count: counts.draft },
      { id: 'pending_ch', label: 'Čeká CH', count: counts.pending_ch },
      { id: 'pending_coo', label: 'Čeká COO', count: counts.pending_coo },
      { id: 'approved', label: 'Schváleno', count: counts.approved },
      { id: 'invoiced', label: 'Fakturováno', count: counts.invoiced },
      { id: 'paid', label: 'Zaplaceno', count: counts.paid },
      { id: 'rejected', label: 'Zamítnuto', count: counts.rejected },
    ];
  }, [baseTimelogs]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="mb-4">
        <h1 className="text-lg font-semibold mb-3">{title}</h1>
        <div className="flex flex-wrap bg-white border border-gray-200 rounded-lg p-0.5 w-fit gap-1">
          {filterOptions.map((filter) => (
            <button
              key={filter.id}
              onClick={() => setTimelogFilter(filter.id)}
              className={`px-3 py-1 rounded-md text-[11px] font-medium transition-all inline-flex items-center gap-2 ${timelogFilter === filter.id ? 'bg-emerald-50 text-emerald-700 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
            >
              <span>{filter.label}</span>
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${timelogFilter === filter.id ? 'bg-emerald-100' : 'bg-gray-100 text-gray-600'}`}>
                {filter.count}
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-3">
        {filtered.map((t) => {
          const c = findContractor(t.cid);
          const e = findEvent(t.eid);
          if (!c || !e) return null;
          const h = calculateTotalHours(t.days);
          return (
            <div key={t.id} className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
              <div className="flex items-center gap-3 mb-3 pb-3 border-b border-gray-50">
                <div className="av w-8 h-8 text-[10px]" style={{ backgroundColor: c.bg, color: c.fg }}>{c.ii}</div>
                <div className="flex-1">
                  <div className="text-sm font-semibold">{c.name}</div>
                  <div className="flex gap-1.5 items-center mt-0.5"><span className="jn">{e.job}</span><span className="text-xs text-gray-500">{e.name}</span></div>
                </div>
                <StatusBadge status={t.status} />
                <div className="text-right"><div className="text-base font-semibold">{h.toFixed(1)}h</div>{t.km > 0 && <div className="text-[10px] text-gray-500">+ {t.km} km</div>}</div>
              </div>
              <div className="secdiv mb-3">
                {t.days.map((d, idx) => (
                  <div key={idx} className="flex items-center gap-4 text-xs py-1">
                    <span className="text-gray-500 w-20">{formatShortDate(d.d)}</span>
                    <span className="font-semibold font-mono">{d.f} - {d.t}</span>
                    <StatusBadge status={d.type} />
                    <span className="text-gray-500 ml-auto">{calculateDayHours(d.f, d.t).toFixed(1)}h</span>
                  </div>
                ))}
              </div>
              {t.note && <p className="text-xs text-gray-500 mb-3 italic">"{t.note}"</p>}
              <div className="flex gap-2">
                {t.status === 'draft' && (
                  <button onClick={() => handleTimelogAction(t.id, 'sub')} className="px-3 py-1.5 bg-emerald-600 text-white rounded-md text-[11px] hover:bg-emerald-700">
                    Odeslat ke kontrole CH →
                  </button>
                )}
                {t.status === 'pending_ch' && role === 'crewhead' && (
                  <>
                    <button onClick={() => handleTimelogAction(t.id, 'ch')} className="px-3 py-1.5 bg-emerald-600 text-white rounded-md text-[11px] hover:bg-emerald-700">Schválit a poslat COO →</button>
                    <button onClick={() => handleTimelogAction(t.id, 'rej')} className="px-3 py-1.5 border border-red-100 text-red-600 rounded-md text-[11px] hover:bg-red-50">Zamítnout</button>
                  </>
                )}
                {t.status === 'pending_coo' && role === 'coo' && (
                  <>
                    <button onClick={() => handleTimelogAction(t.id, 'coo')} className="px-3 py-1.5 bg-emerald-600 text-white rounded-md text-[11px] hover:bg-emerald-700">Schválit (COO) ✓</button>
                    <button onClick={() => handleTimelogAction(t.id, 'rej')} className="px-3 py-1.5 border border-red-100 text-red-600 rounded-md text-[11px] hover:bg-red-50">Zamítnout</button>
                  </>
                )}
                {(scope === 'mine' || !isCrew) && (
                  <button className="ml-auto px-3 py-1.5 border border-gray-200 rounded-md text-[11px] hover:bg-gray-50" onClick={() => setEditingTimelog(t)}>Upravit</button>
                )}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && <div className="bg-white border border-gray-100 rounded-xl p-10 text-center text-gray-400 text-sm">Žádné záznamy pro tento filtr</div>}
      </div>
    </motion.div>
  );
};

export default TimelogsView;
