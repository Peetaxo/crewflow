import React from 'react';
import { motion } from 'framer-motion';
import { useAppContext } from '../context/AppContext';
import { calculateDayHours, calculateTotalHours, formatCurrency, formatShortDate } from '../utils';
import { KM_RATE } from '../data';
import StatusBadge from '../components/shared/StatusBadge';

const ApprovalsView = () => {
  const { role, filteredTimelogs, filteredEvents, findContractor, findEvent, handleTimelogAction, approveAllTimelogs, setEditingTimelog } = useAppContext();
  const isCrewHead = role === 'crewhead';
  const mine = filteredTimelogs.filter((t) => t.status === (isCrewHead ? 'pending_ch' : 'pending_coo'));

  const grouped = !isCrewHead ? filteredEvents.reduce((acc, e) => {
    const eventTimelogs = mine.filter((t) => t.eid === e.id);
    if (eventTimelogs.length) acc.push({ event: e, tls: eventTimelogs });
    return acc;
  }, [] as { event: typeof filteredEvents[0]; tls: typeof mine }[]) : null;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Schvalování</h1>
          <p className="mt-0.5 text-xs text-gray-500">
            {isCrewHead ? 'CrewHead - vizuální kontrola a předání COO' : 'COO - finální schválení a finanční přehled'}
          </p>
        </div>
        <StatusBadge status={mine.length ? (isCrewHead ? 'pending_ch' : 'pending_coo') : 'approved'} label={`${mine.length} čeká`} />
      </div>

      {mine.length === 0 ? (
        <div className="rounded-xl border border-gray-100 bg-white p-12 text-center shadow-sm">
          <div className="mb-3 text-3xl text-emerald-500">✓</div>
          <div className="text-sm font-medium text-gray-900">Vše schváleno</div>
          <p className="mt-1 text-xs text-gray-500">Žádné čekající výkazy k vyřízení.</p>
        </div>
      ) : isCrewHead ? (
        <div className="space-y-3">
          {mine.map((t) => {
            const c = findContractor(t.cid);
            const e = findEvent(t.eid);
            if (!c || !e) return null;
            const h = calculateTotalHours(t.days);
            return (
              <div key={t.id} className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-3 border-b border-gray-50 pb-4">
                  <div className="av h-9 w-9 text-xs" style={{ backgroundColor: c.bg, color: c.fg }}>{c.ii}</div>
                  <div>
                    <div className="text-sm font-semibold">{c.name}</div>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <span className="jn">{e.job}</span>
                      <span className="text-xs text-gray-500">{e.name}</span>
                    </div>
                  </div>
                  <div className="ml-auto text-right">
                    <div className="text-base font-semibold">{h.toFixed(1)}h = {formatCurrency(h * c.rate)}</div>
                    {t.km > 0 && <div className="text-[10px] text-gray-500">+ {formatCurrency(t.km * KM_RATE)} cestovné</div>}
                  </div>
                </div>
                <div className="secdiv mb-4">
                  {t.days.map((d, idx) => (
                    <div key={idx} className="flex items-center gap-4 py-1 text-xs">
                      <span className="w-20 text-gray-500">{formatShortDate(d.d)}</span>
                      <span className="font-mono font-semibold">{d.f} - {d.t}</span>
                      <StatusBadge status={d.type} />
                      <span className="ml-auto text-gray-500">{calculateDayHours(d.f, d.t).toFixed(1)}h</span>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleTimelogAction(t.id, 'ch')} className="rounded-md bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-emerald-700">Schválit a poslat COO →</button>
                  <button onClick={() => handleTimelogAction(t.id, 'rej')} className="rounded-md border border-red-100 px-4 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50">Zamítnout</button>
                  <button onClick={() => setEditingTimelog(t)} className="ml-auto rounded-md border border-gray-200 px-4 py-1.5 text-xs font-medium hover:bg-gray-50">Upravit</button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-4">
          {grouped?.map((g) => {
            const totH = g.tls.reduce((s, t) => s + calculateTotalHours(t.days), 0);
            const totAmt = g.tls.reduce((s, t) => {
              const c = findContractor(t.cid);
              return s + (c ? calculateTotalHours(t.days) * c.rate + t.km * KM_RATE : 0);
            }, 0);
            return (
              <div key={g.event.id} className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-start justify-between border-b border-gray-100 pb-3">
                  <div>
                    <div className="flex items-center gap-2"><span className="jn px-2 py-1 text-sm">{g.event.job}</span><span className="text-base font-semibold">{g.event.name}</span></div>
                    <div className="mt-1.5 text-xs text-gray-500">{formatShortDate(g.event.startDate)} · {g.event.city} · {g.tls.length} kontraktorů</div>
                  </div>
                  <div className="text-right"><div className="text-xl font-semibold">{formatCurrency(totAmt)}</div><div className="text-xs text-gray-500">{totH.toFixed(1)}h celkem</div></div>
                </div>
                <div className="space-y-1">
                  {g.tls.map((t) => {
                    const c = findContractor(t.cid);
                    if (!c) return null;
                    const h = calculateTotalHours(t.days);
                    return (
                      <div key={t.id} className="flex items-center gap-3 border-b border-gray-50 py-2 last:border-0">
                        <div className="av h-6 w-6 text-[9px]" style={{ backgroundColor: c.bg, color: c.fg }}>{c.ii}</div>
                        <span className="text-xs font-medium">{c.name}</span>
                        <div className="flex gap-1">{Array.from(new Set(t.days.map((d) => d.type))).map((type) => <StatusBadge key={type} status={type} />)}</div>
                        <span className="text-[10px] text-gray-500">{t.days.length} {t.days.length === 1 ? 'den' : 'dny'}</span>
                        <span className="ml-auto text-xs font-semibold">{h.toFixed(1)}h = {formatCurrency(h * c.rate)}{t.km > 0 ? ` + ${formatCurrency(t.km * KM_RATE)} km` : ''}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 flex gap-2">
                  <button onClick={() => approveAllTimelogs(g.event.id)} className="rounded-md bg-emerald-600 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-700">Schválit vše - {g.event.job} ({formatCurrency(totAmt)})</button>
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
