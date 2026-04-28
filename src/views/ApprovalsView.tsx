import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { useAppContext } from '../context/useAppContext';
import { KM_RATE } from '../data';
import { Contractor, Event, Timelog } from '../types';
import { calculateDayHours, calculateTotalHours, formatCurrency, formatShortDate } from '../utils';
import StatusBadge from '../components/shared/StatusBadge';
import {
  approveAllTimelogsForEvent,
  getTimelogDependencies,
  updateTimelogStatus,
} from '../features/timelogs/services/timelogs.service';
import { useTimelogsQuery } from '../features/timelogs/queries/useTimelogsQuery';

const ApprovalsView = () => {
  const {
    role,
    filteredEvents,
    searchQuery,
    setEditingTimelog,
  } = useAppContext();
  const timelogsQuery = useTimelogsQuery();

  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [events, setEvents] = useState<Event[]>([]);

  const loadDependencies = useCallback(() => {
    const dependencies = getTimelogDependencies();
    setContractors(dependencies.contractors);
    setEvents(dependencies.events);
  }, []);

  useEffect(() => {
    loadDependencies();
  }, [loadDependencies, timelogsQuery.data]);

  const findContractor = useCallback((contractorProfileId?: string) => (
    contractorProfileId
      ? contractors.find((contractor) => contractor.profileId === contractorProfileId) ?? null
      : null
  ), [contractors]);

  const findEvent = useCallback((id: number) => (
    events.find((event) => event.id === id) ?? null
  ), [events]);

  const timelogs = useMemo(() => {
    const safeTimelogs = timelogsQuery.data ?? [];
    const query = searchQuery.trim().toLowerCase();

    if (!query) return safeTimelogs;

    return safeTimelogs.filter((timelog) => {
      const event = events.find((item) => item.id === timelog.eid);
      const contractor = findContractor(timelog.contractorProfileId);
      if (!event || !contractor) return false;

      return (
        event.name.toLowerCase().includes(query)
        || event.job.toLowerCase().includes(query)
        || contractor.name.toLowerCase().includes(query)
      );
    });
  }, [events, findContractor, searchQuery, timelogsQuery.data]);

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

  const handleTimelogAction = useCallback((timelogId: number, action: 'ch' | 'rej') => {
    void updateTimelogStatus(timelogId, action).catch((error) => {
      toast.error(error instanceof Error ? error.message : 'Nepodařilo se aktualizovat výkaz.');
    });
  }, []);

  const handleApproveAll = useCallback((eventId: number) => {
    void approveAllTimelogsForEvent(eventId).catch((error) => {
      toast.error(error instanceof Error ? error.message : 'Nepodařilo se schválit výkazy.');
    });
  }, []);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-[var(--nodu-text)]">Schvalovani</h1>
          <p className="mt-0.5 text-xs text-[var(--nodu-text-soft)]">
            {isCrewHead ? 'CrewHead - vizualni kontrola a predani COO' : 'COO - finalni schvaleni a financni prehled'}
          </p>
        </div>
        <StatusBadge status={mine.length ? (isCrewHead ? 'pending_ch' : 'pending_coo') : 'approved'} label={`${mine.length} ceka`} />
      </div>

      {mine.length === 0 ? (
        <div className="rounded-[24px] border border-[var(--nodu-border)] bg-white p-12 text-center shadow-[0_18px_40px_rgba(var(--nodu-text-rgb),0.06)]">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-[var(--nodu-success-border)] bg-[var(--nodu-success-bg)] text-xl font-semibold text-[var(--nodu-success-text)]">✓</div>
          <div className="text-sm font-medium text-[var(--nodu-text)]">Vse schvaleno</div>
          <p className="mt-1 text-xs text-[var(--nodu-text-soft)]">Zadne cekajici vykazy k vyrizeni.</p>
        </div>
      ) : isCrewHead ? (
        <div className="space-y-3">
          {mine.map((timelog) => {
            const contractor = findContractor(timelog.contractorProfileId);
            const event = findEvent(timelog.eid);
            if (!contractor || !event) return null;

            const totalHours = calculateTotalHours(timelog.days);

            return (
              <div key={timelog.id} className="rounded-[24px] border border-[var(--nodu-border)] bg-white p-5 shadow-[0_18px_40px_rgba(var(--nodu-text-rgb),0.06)]">
                <div className="mb-4 flex items-center gap-3 border-b border-[rgba(var(--nodu-text-rgb),0.06)] pb-4">
                  <div className="av h-9 w-9 text-xs" style={{ backgroundColor: contractor.bg, color: contractor.fg }}>{contractor.ii}</div>
                  <div>
                    <div className="text-sm font-semibold text-[var(--nodu-text)]">{contractor.name}</div>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <span className="jn">{event.job}</span>
                      <span className="text-xs text-[var(--nodu-text-soft)]">{event.name}</span>
                    </div>
                  </div>
                  <div className="ml-auto text-right">
                    <div className="text-base font-semibold text-[var(--nodu-text)]">{totalHours.toFixed(1)}h = {formatCurrency(totalHours * contractor.rate)}</div>
                    {timelog.km > 0 && <div className="text-[10px] text-[var(--nodu-text-soft)]">+ {formatCurrency(timelog.km * KM_RATE)} cestovne</div>}
                  </div>
                </div>
                <div className="mb-4 rounded-xl border border-[var(--nodu-border)] bg-[var(--nodu-paper-strong)] p-3">
                  {timelog.days.map((day, index) => (
                    <div key={index} className="flex items-center gap-4 py-1 text-xs">
                      <span className="w-20 text-[var(--nodu-text-soft)]">{formatShortDate(day.d)}</span>
                      <span className="font-mono font-semibold text-[var(--nodu-text)]">{day.f} - {day.t}</span>
                      <StatusBadge status={day.type} />
                      <span className="ml-auto text-[var(--nodu-text-soft)]">{calculateDayHours(day.f, day.t).toFixed(1)}h</span>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleTimelogAction(timelog.id, 'ch')} className="rounded-xl border border-[var(--nodu-success-border)] bg-[var(--nodu-success-bg)] px-4 py-1.5 text-xs font-semibold text-[var(--nodu-success-text)] shadow-[0_14px_28px_rgba(47,125,79,0.10)] hover:bg-[var(--nodu-success-bg-hover)] hover:shadow-[0_16px_32px_rgba(47,125,79,0.14)]">Schvalit a poslat COO</button>
                  <button onClick={() => handleTimelogAction(timelog.id, 'rej')} className="rounded-xl border border-[var(--nodu-error-border)] px-4 py-1.5 text-xs font-medium text-[var(--nodu-error-text)] hover:bg-[var(--nodu-error-bg)]">Zamitnout</button>
                  <button onClick={() => setEditingTimelog(timelog)} className="ml-auto rounded-xl border border-[var(--nodu-border)] px-4 py-1.5 text-xs font-medium text-[var(--nodu-text)] hover:bg-[var(--nodu-accent-soft)]">Upravit</button>
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
              const contractor = findContractor(timelog.contractorProfileId);
              return sum + (contractor ? calculateTotalHours(timelog.days) * contractor.rate + timelog.km * KM_RATE : 0);
            }, 0);

            return (
              <div key={group.event.id} className="rounded-[24px] border border-[var(--nodu-border)] bg-white p-5 shadow-[0_18px_40px_rgba(var(--nodu-text-rgb),0.06)]">
                <div className="mb-4 flex items-start justify-between border-b border-[rgba(var(--nodu-text-rgb),0.06)] pb-3">
                  <div>
                    <div className="flex items-center gap-2"><span className="jn px-2 py-1 text-sm">{group.event.job}</span><span className="text-base font-semibold text-[var(--nodu-text)]">{group.event.name}</span></div>
                    <div className="mt-1.5 text-xs text-[var(--nodu-text-soft)]">{formatShortDate(group.event.startDate)} · {group.event.city} · {group.tls.length} kontraktoru</div>
                  </div>
                  <div className="text-right"><div className="text-xl font-semibold text-[var(--nodu-text)]">{formatCurrency(totalAmount)}</div><div className="text-xs text-[var(--nodu-text-soft)]">{totalHours.toFixed(1)}h celkem</div></div>
                </div>
                <div className="space-y-1">
                  {group.tls.map((timelog) => {
                    const contractor = findContractor(timelog.contractorProfileId);
                    if (!contractor) return null;
                    const hours = calculateTotalHours(timelog.days);

                    return (
                      <div key={timelog.id} className="flex items-center gap-3 border-b border-[rgba(var(--nodu-text-rgb),0.06)] py-2 last:border-0">
                        <div className="av h-6 w-6 text-[9px]" style={{ backgroundColor: contractor.bg, color: contractor.fg }}>{contractor.ii}</div>
                        <span className="text-xs font-medium text-[var(--nodu-text)]">{contractor.name}</span>
                        <div className="flex gap-1">{Array.from(new Set(timelog.days.map((day) => day.type))).map((type) => <StatusBadge key={type} status={type} />)}</div>
                        <span className="text-[10px] text-[var(--nodu-text-soft)]">{timelog.days.length} {timelog.days.length === 1 ? 'den' : 'dny'}</span>
                        <span className="ml-auto text-xs font-semibold text-[var(--nodu-text)]">{hours.toFixed(1)}h = {formatCurrency(hours * contractor.rate)}{timelog.km > 0 ? ` + ${formatCurrency(timelog.km * KM_RATE)} km` : ''}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 flex gap-2">
                  <button onClick={() => handleApproveAll(group.event.id)} className="rounded-xl border border-[var(--nodu-success-border)] bg-[var(--nodu-success-bg)] px-4 py-2 text-xs font-semibold text-[var(--nodu-success-text)] shadow-[0_14px_28px_rgba(47,125,79,0.10)] hover:bg-[var(--nodu-success-bg-hover)] hover:shadow-[0_16px_32px_rgba(47,125,79,0.14)]">Schvalit vse - {group.event.job} ({formatCurrency(totalAmount)})</button>
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
