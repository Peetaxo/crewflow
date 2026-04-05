import React from 'react';
import { motion } from 'framer-motion';
import { useAppContext } from '../context/AppContext';
import { calculateTotalHours, calculateDayHours, formatCurrency, formatShortDate } from '../utils';
import { KM_RATE } from '../data';
import StatusBadge from '../components/shared/StatusBadge';

const ApprovalsView = () => {
  const { role, filteredTimelogs, filteredEvents, findContractor, findEvent, handleTimelogAction, approveAllTimelogs, setEditingTimelog } = useAppContext();
  const mine = filteredTimelogs.filter(t => t.status === (role === 'hoc' ? 'pending_hoc' : 'pending_coo'));

  const grouped = role === 'coo' ? filteredEvents.reduce((acc, e) => {
    const et = mine.filter(t => t.eid === e.id);
    if (et.length) acc.push({ event: e, tls: et });
    return acc;
  }, [] as { event: typeof filteredEvents[0]; tls: typeof mine }[]) : null;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="flex justify-between items-center mb-5">
        <div><h1 className="text-lg font-semibold">Schvalování</h1><p className="text-xs text-gray-500 mt-0.5">{role === 'hoc' ? 'Head of Crew – vizuální kontrola a předání COO' : 'COO – finanční přehled a finální schválení'}</p></div>
        <StatusBadge status={mine.length ? 'pending_hoc' : 'approved'} label={`${mine.length} čeká`} />
      </div>

      {mine.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-xl p-12 text-center shadow-sm">
          <div className="text-3xl mb-3 text-emerald-500">✓</div>
          <div className="text-sm font-medium text-gray-900">Vše schváleno</div>
          <p className="text-xs text-gray-500 mt-1">Žádné čekající výkazy k vyřízení.</p>
        </div>
      ) : role === 'hoc' ? (
        <div className="space-y-3">
          {mine.map(t => {
            const c = findContractor(t.cid);
            const e = findEvent(t.eid);
            if (!c || !e) return null;
            const h = calculateTotalHours(t.days);
            return (
              <div key={t.id} className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
                <div className="flex items-center gap-3 mb-4 pb-4 border-b border-gray-50">
                  <div className="av w-9 h-9 text-xs" style={{ backgroundColor: c.bg, color: c.fg }}>{c.ii}</div>
                  <div><div className="text-sm font-semibold">{c.name}</div><div className="flex gap-1.5 items-center mt-0.5"><span className="jn">{e.job}</span><span className="text-xs text-gray-500">{e.name}</span></div></div>
                  <div className="ml-auto text-right"><div className="text-base font-semibold">{h.toFixed(1)}h = {formatCurrency(h * c.rate)}</div>{t.km > 0 && <div className="text-[10px] text-gray-500">+ {formatCurrency(t.km * KM_RATE)} cestovné</div>}</div>
                </div>
                <div className="secdiv mb-4">
                  {t.days.map((d, idx) => (
                    <div key={idx} className="flex items-center gap-4 text-xs py-1">
                      <span className="text-gray-500 w-20">{formatShortDate(d.d)}</span>
                      <span className="font-semibold font-mono">{d.f} – {d.t}</span>
                      <StatusBadge status={d.type} />
                      <span className="text-gray-500 ml-auto">{calculateDayHours(d.f, d.t).toFixed(1)}h</span>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleTimelogAction(t.id, 'hoc')} className="px-4 py-1.5 bg-emerald-600 text-white rounded-md text-xs font-medium hover:bg-emerald-700">Schválit a poslat COO →</button>
                  <button onClick={() => handleTimelogAction(t.id, 'rej')} className="px-4 py-1.5 border border-red-100 text-red-600 rounded-md text-xs font-medium hover:bg-red-50">Zamítnout</button>
                  <button onClick={() => setEditingTimelog(t)} className="px-4 py-1.5 border border-gray-200 rounded-md text-xs font-medium hover:bg-gray-50 ml-auto">Upravit</button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-4">
          {grouped?.map(g => {
            const totH = g.tls.reduce((s, t) => s + calculateTotalHours(t.days), 0);
            const totAmt = g.tls.reduce((s, t) => { const c = findContractor(t.cid); return s + (c ? calculateTotalHours(t.days) * c.rate + t.km * KM_RATE : 0); }, 0);
            return (
              <div key={g.event.id} className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
                <div className="flex justify-between items-start mb-4 pb-3 border-b border-gray-100">
                  <div><div className="flex items-center gap-2"><span className="jn text-sm px-2 py-1">{g.event.job}</span><span className="text-base font-semibold">{g.event.name}</span></div><div className="text-xs text-gray-500 mt-1.5">{formatShortDate(g.event.startDate)} · {g.event.city} · {g.tls.length} kontraktorů</div></div>
                  <div className="text-right"><div className="text-xl font-semibold">{formatCurrency(totAmt)}</div><div className="text-xs text-gray-500">{totH.toFixed(1)}h celkem</div></div>
                </div>
                <div className="space-y-1">
                  {g.tls.map(t => {
                    const c = findContractor(t.cid);
                    if (!c) return null;
                    const h = calculateTotalHours(t.days);
                    return (
                      <div key={t.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                        <div className="av w-6 h-6 text-[9px]" style={{ backgroundColor: c.bg, color: c.fg }}>{c.ii}</div>
                        <span className="text-xs font-medium">{c.name}</span>
                        <div className="flex gap-1">{Array.from(new Set(t.days.map(d => d.type))).map(type => <StatusBadge key={type} status={type} />)}</div>
                        <span className="text-[10px] text-gray-500">{t.days.length} {t.days.length === 1 ? 'den' : 'dny'}</span>
                        <span className="ml-auto text-xs font-semibold">{h.toFixed(1)}h = {formatCurrency(h * c.rate)}{t.km > 0 ? ` + ${formatCurrency(t.km * KM_RATE)} km` : ''}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="flex gap-2 mt-4">
                  <button onClick={() => approveAllTimelogs(g.event.id)} className="px-4 py-2 bg-emerald-600 text-white rounded-md text-xs font-medium hover:bg-emerald-700">Schválit vše – {g.event.job} ({formatCurrency(totAmt)})</button>
                  <button className="px-4 py-2 border border-red-100 text-red-600 rounded-md text-xs font-medium hover:bg-red-50">Zamítnout</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
};

export default ApprovalsView;
