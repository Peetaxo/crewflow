import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { useAppContext } from '../context/useAppContext';
import { useAuth } from '../app/providers/useAuth';
import { KM_RATE } from '../data';
import { Contractor, Event, EventId, Timelog } from '../types';
import { calculateDayHours, calculateMealAllowance, calculateTotalHours, formatCurrency, formatShortDate } from '../utils';
import StatusBadge from '../components/shared/StatusBadge';
import {
  fetchEligibleTimelogFinalApprovers,
  getTimelogDependencies,
  resolveTimelogApproval,
  returnTimelogToCrewCorrection,
  sendTimelogToApprovers,
  updateTimelogStatus,
} from '../features/timelogs/services/timelogs.service';
import { useTimelogsQuery } from '../features/timelogs/queries/useTimelogsQuery';
import { canEditTimelog } from '../features/timelogs/services/timelog-permissions';
import { getDefaultTimelogFinalApproverIds, TimelogFinalApprover } from '../features/timelogs/services/timelog-final-approvers';

const ApprovalsView = () => {
  const {
    role,
    filteredEvents,
    searchQuery,
    setEditingTimelog,
  } = useAppContext();
  const { currentProfileId } = useAuth();
  const timelogsQuery = useTimelogsQuery();

  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [approvalDialogTimelog, setApprovalDialogTimelog] = useState<Timelog | null>(null);
  const [eligibleFinalApprovers, setEligibleFinalApprovers] = useState<TimelogFinalApprover[]>([]);
  const [selectedFinalApproverIds, setSelectedFinalApproverIds] = useState<string[]>([]);
  const [returnDialogTimelog, setReturnDialogTimelog] = useState<Timelog | null>(null);
  const [returnNote, setReturnNote] = useState('');

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

  const findEvent = useCallback((id: EventId) => (
    events.find((event) => event.id === id || event.supabaseId === id) ?? null
  ), [events]);

  const timelogs = useMemo(() => {
    const safeTimelogs = timelogsQuery.data ?? [];
    const query = searchQuery.trim().toLowerCase();

    if (!query) return safeTimelogs;

    return safeTimelogs.filter((timelog) => {
      const event = events.find((item) => item.id === timelog.eid || item.supabaseId === timelog.eid);
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

  const findCurrentPendingApproval = useCallback((timelog: Timelog) => (
    timelog.approvals?.find((approval) => approval.status === 'pending' && !approval.supersededAt && approval.approverProfileId === currentProfileId)
    ?? timelog.approvals?.find((approval) => approval.status === 'pending' && !approval.supersededAt)
    ?? null
  ), [currentProfileId]);

  const openFinalApprovalDialog = useCallback((timelog: Timelog) => {
    const event = findEvent(timelog.eid);
    setApprovalDialogTimelog(timelog);
    setEligibleFinalApprovers([]);
    setSelectedFinalApproverIds([]);

    void fetchEligibleTimelogFinalApprovers(timelog, currentProfileId)
      .then((approvers) => {
        setEligibleFinalApprovers(approvers);
        setSelectedFinalApproverIds(getDefaultTimelogFinalApproverIds(event, approvers));
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : 'Nepodařilo se načíst schvalovatele.');
      });
  }, [currentProfileId, findEvent]);

  const confirmFinalApproval = useCallback(() => {
    if (!approvalDialogTimelog || selectedFinalApproverIds.length === 0) return;

    void sendTimelogToApprovers(approvalDialogTimelog.id, selectedFinalApproverIds, '')
      .then(() => {
        setApprovalDialogTimelog(null);
        setSelectedFinalApproverIds([]);
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : 'Nepodařilo se odeslat výkaz ke schválení.');
      });
  }, [approvalDialogTimelog, selectedFinalApproverIds]);

  const confirmReturn = useCallback(() => {
    if (!returnDialogTimelog) return;

    const approval = findCurrentPendingApproval(returnDialogTimelog);
    const update = approval
      ? resolveTimelogApproval(approval.id, 'returned', returnNote)
      : returnTimelogToCrewCorrection(returnDialogTimelog.id, returnNote);

    void update
      .then(() => {
        setReturnDialogTimelog(null);
        setReturnNote('');
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : 'Nepodařilo se vrátit výkaz k opravě.');
      });
  }, [findCurrentPendingApproval, returnDialogTimelog, returnNote]);

  const handleTimelogAction = useCallback((timelog: Timelog, action: 'ch' | 'rej') => {
    if (action === 'ch') {
      openFinalApprovalDialog(timelog);
      return;
    }

    setReturnDialogTimelog(timelog);
    setReturnNote('');
  }, [openFinalApprovalDialog]);

  const handleApproveAll = useCallback((eventId: EventId) => {
    const approvals = mine
      .filter((timelog) => timelog.eid === eventId)
      .map((timelog) => {
        const approval = findCurrentPendingApproval(timelog);
        return approval
          ? resolveTimelogApproval(approval.id, 'approved')
          : updateTimelogStatus(timelog.id, 'coo');
      });

    void Promise.all(approvals).catch((error) => {
      toast.error(error instanceof Error ? error.message : 'Nepodařilo se schválit výkazy.');
    });
  }, [findCurrentPendingApproval, mine]);

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
                    <div className="text-base font-semibold text-[var(--nodu-text)]">{totalHours.toFixed(1)}h = {formatCurrency(totalHours * contractor.rate + calculateMealAllowance(timelog.days, { enabled: Boolean(event.mealAllowanceEnabled) }))}</div>
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
                  <button onClick={() => handleTimelogAction(timelog, 'ch')} className="rounded-xl border border-[var(--nodu-success-border)] bg-[var(--nodu-success-bg)] px-4 py-1.5 text-xs font-semibold text-[var(--nodu-success-text)] shadow-[0_14px_28px_rgba(47,125,79,0.10)] hover:bg-[var(--nodu-success-bg-hover)] hover:shadow-[0_16px_32px_rgba(47,125,79,0.14)]">Schvalit a vybrat schvalovatele</button>
                  <button onClick={() => handleTimelogAction(timelog, 'rej')} className="rounded-xl border border-[var(--nodu-error-border)] px-4 py-1.5 text-xs font-medium text-[var(--nodu-error-text)] hover:bg-[var(--nodu-error-bg)]">Vrátit</button>
                  {canEditTimelog(timelog, role) && (
                    <button onClick={() => setEditingTimelog(timelog)} className="ml-auto rounded-xl border border-[var(--nodu-border)] px-4 py-1.5 text-xs font-medium text-[var(--nodu-text)] hover:bg-[var(--nodu-accent-soft)]">Upravit</button>
                  )}
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
              return sum + (contractor ? calculateTotalHours(timelog.days) * contractor.rate + timelog.km * KM_RATE + calculateMealAllowance(timelog.days, { enabled: Boolean(group.event.mealAllowanceEnabled) }) : 0);
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
                        <span className="ml-auto text-xs font-semibold text-[var(--nodu-text)]">{hours.toFixed(1)}h = {formatCurrency(hours * contractor.rate + calculateMealAllowance(timelog.days, { enabled: Boolean(group.event.mealAllowanceEnabled) }))}{timelog.km > 0 ? ` + ${formatCurrency(timelog.km * KM_RATE)} km` : ''}</span>
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
      {approvalDialogTimelog && (
        <div role="dialog" aria-modal="true" aria-labelledby="approvals-final-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4">
          <div className="w-full max-w-lg rounded-[22px] border border-[var(--nodu-border)] bg-white p-5 shadow-[0_24px_72px_rgba(47,38,31,0.22)]">
            <div className="mb-4 flex items-start gap-3">
              <div>
                <h2 id="approvals-final-title" className="text-lg font-semibold text-[var(--nodu-text)]">Finální schválení výkazu</h2>
                <p className="mt-1 text-sm text-[var(--nodu-text-soft)]">Vyber konkrétní Nodu profil pro finální schválení.</p>
              </div>
              <button type="button" aria-label="Zavřít finální schválení" onClick={() => setApprovalDialogTimelog(null)} className="ml-auto rounded-full p-1.5 text-[var(--nodu-text-soft)] hover:bg-[var(--nodu-accent-soft)]">
                <X size={17} />
              </button>
            </div>
            <div className="space-y-2">
              {eligibleFinalApprovers.map((approver) => (
                <label key={approver.profileId} className="flex cursor-pointer items-center gap-3 rounded-[16px] border border-[var(--nodu-border)] px-3 py-2 text-sm font-medium text-[var(--nodu-text)]">
                  <input
                    type="checkbox"
                    checked={selectedFinalApproverIds.includes(approver.profileId)}
                    onChange={() => setSelectedFinalApproverIds((current) => (
                      current.includes(approver.profileId)
                        ? current.filter((profileId) => profileId !== approver.profileId)
                        : [...current, approver.profileId]
                    ))}
                    className="h-4 w-4 accent-[var(--nodu-accent)]"
                  />
                  <span>{approver.name}</span>
                </label>
              ))}
              {eligibleFinalApprovers.length === 0 && (
                <div className="rounded-[16px] border border-[var(--nodu-error-border)] bg-[var(--nodu-error-bg)] px-3 py-2 text-sm text-[var(--nodu-error-text)]">
                  Není dostupný žádný interní schvalovatel.
                </div>
              )}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setApprovalDialogTimelog(null)} className="rounded-xl border border-[var(--nodu-border)] px-4 py-2 text-xs font-medium">Zrušit</button>
              <button type="button" onClick={confirmFinalApproval} disabled={selectedFinalApproverIds.length === 0} className="rounded-xl border border-[var(--nodu-success-border)] bg-[var(--nodu-success-bg)] px-4 py-2 text-xs font-semibold text-[var(--nodu-success-text)] disabled:opacity-50">Odeslat ke schválení</button>
            </div>
          </div>
        </div>
      )}

      {returnDialogTimelog && (
        <div role="dialog" aria-modal="true" aria-labelledby="approvals-return-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4">
          <div className="w-full max-w-md rounded-[22px] border border-[var(--nodu-border)] bg-white p-5 shadow-[0_24px_72px_rgba(47,38,31,0.22)]">
            <h2 id="approvals-return-title" className="text-lg font-semibold text-[var(--nodu-text)]">Vrátit výkaz k opravě</h2>
            <p className="mt-1 text-sm text-[var(--nodu-text-soft)]">Poznámka je volitelná.</p>
            <label htmlFor="approvals-return-note" className="mt-4 block text-sm font-medium text-[var(--nodu-text)]">Poznámka pro Crew</label>
            <textarea id="approvals-return-note" value={returnNote} onChange={(event) => setReturnNote(event.target.value)} className="mt-2 min-h-24 w-full rounded-[16px] border border-[var(--nodu-border)] px-3 py-2 text-sm" />
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setReturnDialogTimelog(null)} className="rounded-xl border border-[var(--nodu-border)] px-4 py-2 text-xs font-medium">Zrušit</button>
              <button type="button" onClick={confirmReturn} className="rounded-xl border border-[var(--nodu-error-border)] px-4 py-2 text-xs font-semibold text-[var(--nodu-error-text)]">Vrátit k opravě</button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default ApprovalsView;
