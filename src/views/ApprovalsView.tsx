import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useAppContext } from '../context/AppContext';
import { KM_RATE } from '../data';
import { Contractor, Event, Timelog } from '../types';
import { calculateDayHours, calculateTotalHours, formatCurrency, formatShortDate } from '../utils';
import StatusBadge from '../components/shared/StatusBadge';
import {
  approveAllTimelogsForEvent,
  getTimelogDependencies,
  getTimelogs,
  subscribeToTimelogChanges,
  updateTimelogStatus,
} from '../features/timelogs/services/timelogs.service';

const ApprovalsView = () => {
  const {
    role,
    filteredEvents,
    searchQuery,
    setEditingTimelog,
  } = useAppContext();

  const [timelogs, setTimelogs] = useState<Timelog[]>([]);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [events, setEvents] = useState<Event[]>([]);

  const loadData = useCallback(() => {
    setTimelogs(getTimelogs(searchQuery));

    const dependencies = getTimelogDependencies();
    setContractors(dependencies.contractors);
    setEvents(dependencies.events);
  }, [searchQuery]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => subscribeToTimelogChanges(loadData), [loadData]);

  const findContractor = useCallback((id: number) => (
    contractors.find((contractor) => contractor.id === id) ?? null
  ), [contractors]);

  const findEvent = useCallback((id: number) => (
    events.find((event) => event.id === id) ?? null
  ), [events]);

  const isCrewHead = role === 'crewhead';
  const mine = useMemo(() => (
    timelogs.filter((timelog) => timelog.status === (isCrewHead ? 'pending_ch' : 'pending_coo'))
  ), [isCrewHead, timelogs]);

  const grouped = useMemo(() => {
    if (isCrewHead) return null;

    return filteredEvents.reduce((acc, event) => {
      const eventTimelogs = mine.filter((timelog) => timelog.eid === event.id);
      if (eventTimelogs.length) acc.push({ event, tls: eventTimelogs });
      return acc;
    }, [] as { event: typeof filteredEvents[number]; tls: typeof mine }[]);
  }, [filteredEvents, isCrewHead, mine]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Schvalovani</h1>
          <p className="mt-0.5 text-xs text-gray-500">
            {isCrewHead ? 'CrewHead - vizualni kontrola a predani COO' : 'COO - finalni schvaleni a financni prehled'}
          </p>
        </div>
        <StatusBadge status={mine.length ? (isCrewHead ? 'pending_ch' : 'pending_coo') : 'approved'} label={`${mine.length} ceka`} />
      </div>

      {mine.length === 0 ? (
        <div className="rounded-xl border border-gray-100 bg-white p-12 text-center shadow-sm">
          <div className="mb-3 text-3xl text-emerald-500">✓</div>
          <div className="text-sm font-medium text-gray-900">Vse schvaleno</div>
          <p className="mt-1 text-xs text-gray-500">Zadne cekajici vykazy k vyrizeni.</p>
        </div>
      ) : isCrewHead ? (
        <div className="space-y-3">
          {mine.map((timelog) => {
            const contractor = findContractor(timelog.cid);
            const event = findEvent(timelog.eid);
            if (!contractor || !event) return null;

            const totalHours = calculateTotalHours(timelog.days);

            return (
              <div key={timelog.id} className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-3 border-b border-gray-50 pb-4">
                  <div className="av h-9 w-9 text-xs" style={{ backgroundColor: contractor.bg, color: contractor.fg }}>{contractor.ii}</div>
                  <div>
                    <div className="text-sm font-semibold">{contractor.name}</div>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <span className="jn">{event.job}</span>
                      <span className="text-xs text-gray-500">{event.name}</span>
                    </div>
                  </div>
                  <div className="ml-auto text-right">
                    <div className="text-base font-semibold">{totalHours.toFixed(1)}h = {formatCurrency(totalHours * contractor.rate)}</div>
                    {timelog.km > 0 && <div className="text-[10px] text-gray-500">+ {formatCurrency(timelog.km * KM_RATE)} cestovne</div>}
                  </div>
                </div>
                <div className="secdiv mb-4">
                  {timelog.days.map((day, index) => (
                    <div key={index} className="flex items-center gap-4 py-1 text-xs">
                      <span className="w-20 text-gray-500">{formatShortDate(day.d)}</span>
                      <span className="font-mono font-semibold">{day.f} - {day.t}</span>
                      <StatusBadge status={day.type} />
                      <span className="ml-auto text-gray-500">{calculateDayHours(day.f, day.t).toFixed(1)}h</span>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => updateTimelogStatus(timelog.id, 'ch')} className="rounded-md bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-emerald-700">Schvalit a poslat COO</button>
                  <button onClick={() => updateTimelogStatus(timelog.id, 'rej')} className="rounded-md border border-red-100 px-4 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50">Zamitnout</button>
                  <button onClick={() => setEditingTimelog(timelog)} className="ml-auto rounded-md border border-gray-200 px-4 py-1.5 text-xs font-medium hover:bg-gray-50">Upravit</button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-4">
          {grouped?.map((group) => {
            const totalHours = group.tls.reduce((sum, timelog) => sum + calculateTotalHours(timelog.days), 0);
            const totalAmount = group.tls.reduce((sum, timelog) => {
              const contractor = findContractor(timelog.cid);
              return sum + (contractor ? calculateTotalHours(timelog.days) * contractor.rate + timelog.km * KM_RATE : 0);
            }, 0);

            return (
              <div key={group.event.id} className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-start justify-between border-b border-gray-100 pb-3">
                  <div>
                    <div className="flex items-center gap-2"><span className="jn px-2 py-1 text-sm">{group.event.job}</span><span className="text-base font-semibold">{group.event.name}</span></div>
                    <div className="mt-1.5 text-xs text-gray-500">{formatShortDate(group.event.startDate)} · {group.event.city} · {group.tls.length} kontraktoru</div>
                  </div>
                  <div className="text-right"><div className="text-xl font-semibold">{formatCurrency(totalAmount)}</div><div className="text-xs text-gray-500">{totalHours.toFixed(1)}h celkem</div></div>
                </div>
                <div className="space-y-1">
                  {group.tls.map((timelog) => {
                    const contractor = findContractor(timelog.cid);
                    if (!contractor) return null;
                    const hours = calculateTotalHours(timelog.days);

                    return (
                      <div key={timelog.id} className="flex items-center gap-3 border-b border-gray-50 py-2 last:border-0">
                        <div className="av h-6 w-6 text-[9px]" style={{ backgroundColor: contractor.bg, color: contractor.fg }}>{contractor.ii}</div>
                        <span className="text-xs font-medium">{contractor.name}</span>
                        <div className="flex gap-1">{Array.from(new Set(timelog.days.map((day) => day.type))).map((type) => <StatusBadge key={type} status={type} />)}</div>
                        <span className="text-[10px] text-gray-500">{timelog.days.length} {timelog.days.length === 1 ? 'den' : 'dny'}</span>
                        <span className="ml-auto text-xs font-semibold">{hours.toFixed(1)}h = {formatCurrency(hours * contractor.rate)}{timelog.km > 0 ? ` + ${formatCurrency(timelog.km * KM_RATE)} km` : ''}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 flex gap-2">
                  <button onClick={() => approveAllTimelogsForEvent(group.event.id)} className="rounded-md bg-emerald-600 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-700">Schvalit vse - {group.event.job} ({formatCurrency(totalAmount)})</button>
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
