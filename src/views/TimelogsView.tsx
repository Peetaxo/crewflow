import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { useAuth } from '../app/providers/useAuth';
import { useAppContext } from '../context/useAppContext';
import { KM_RATE } from '../data';
import { Contractor, Event } from '../types';
import { calculateDayHours, calculateTotalHours, formatCurrency, formatShortDate } from '../utils';
import StatusBadge from '../components/shared/StatusBadge';
import { getLocalAppState } from '../lib/app-data';
import { getContractors, subscribeToCrewChanges } from '../features/crew/services/crew.service';
import { useEventsQuery } from '../features/events/queries/useEventsQuery';
import { useInvoiceApprovalsQuery } from '../features/invoices/queries/useInvoiceApprovalsQuery';
import {
  applyApprovalTimelogPreview,
  buildApprovalTimelogPreview,
  type ApprovalTimelogPreviewRow,
} from '../features/invoices/services/approval-timelog-sync.service';
import {
  getTimelogDependencies,
  updateTimelogStatus,
} from '../features/timelogs/services/timelogs.service';
import { useTimelogsQuery } from '../features/timelogs/queries/useTimelogsQuery';
import { canEditTimelog, canSeeTimelogNote, canSubmitTimelog } from '../features/timelogs/services/timelog-permissions';

interface TimelogsViewProps {
  scope?: 'all' | 'mine';
}

type ViewMode = 'event' | 'people';

const TimelogsView = ({ scope = 'all' }: TimelogsViewProps) => {
  const {
    setEditingTimelog,
    role,
    searchQuery,
    timelogFilter,
    setTimelogFilter,
  } = useAppContext();
  const { currentProfileId } = useAuth();
  const timelogsQuery = useTimelogsQuery();
  const eventsQuery = useEventsQuery();
  const invoiceApprovalsQuery = useInvoiceApprovalsQuery();

  const [viewMode, setViewMode] = useState<ViewMode>(scope === 'mine' ? 'people' : 'event');
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [applyingApprovalRowId, setApplyingApprovalRowId] = useState<string | null>(null);

  const loadDependencies = useCallback(() => {
    const dependencies = getTimelogDependencies();
    setContractors(getContractors());
    setEvents(eventsQuery.data ?? dependencies.events);
  }, [eventsQuery.data]);

  useEffect(() => {
    loadDependencies();
  }, [eventsQuery.data, loadDependencies, timelogsQuery.data]);

  useEffect(() => (
    subscribeToCrewChanges(loadDependencies)
  ), [loadDependencies]);

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

  const baseTimelogs = scope === 'mine'
    ? timelogs.filter((timelog) => timelog.contractorProfileId === currentProfileId)
    : timelogs;
  const filtered = timelogFilter === 'all' ? baseTimelogs : baseTimelogs.filter((timelog) => timelog.status === timelogFilter);
  const isCrew = role === 'crew';
  const title = scope === 'mine' ? 'Schvalování' : 'Timelogy';
  const pendingStatusForRole = role === 'crewhead' ? 'pending_ch' : 'pending_coo';
  const showPowerAppsPreview = scope === 'all' && role === 'coo';
  const showTimelogNotes = canSeeTimelogNote(role);

  const filterOptions = useMemo(() => {
    const counts = {
      all: baseTimelogs.length,
      draft: baseTimelogs.filter((timelog) => timelog.status === 'draft').length,
      pending_ch: baseTimelogs.filter((timelog) => timelog.status === 'pending_ch').length,
      pending_coo: baseTimelogs.filter((timelog) => timelog.status === 'pending_coo').length,
      approved: baseTimelogs.filter((timelog) => timelog.status === 'approved').length,
      invoiced: baseTimelogs.filter((timelog) => timelog.status === 'invoiced').length,
      paid: baseTimelogs.filter((timelog) => timelog.status === 'paid').length,
      rejected: baseTimelogs.filter((timelog) => timelog.status === 'rejected').length,
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

  const groupedByEvent = useMemo(() => {
    const groups = new Map<number, { eventId: number; job: string; eventName: string; city: string; startDate: string; timelogs: typeof filtered }>();

    filtered.forEach((timelog) => {
      const event = findEvent(timelog.eid);
      if (!event) return;

      const existing = groups.get(event.id) || {
        eventId: event.id,
        job: event.job,
        eventName: event.name,
        city: event.city,
        startDate: event.startDate,
        timelogs: [],
      };

      existing.timelogs.push(timelog);
      groups.set(event.id, existing);
    });

    return Array.from(groups.values()).sort((a, b) => {
      const dateDiff = a.startDate.localeCompare(b.startDate);
      if (dateDiff !== 0) return dateDiff;
      return a.eventName.localeCompare(b.eventName);
    });
  }, [filtered, findEvent]);

  const handleTimelogAction = useCallback((id: number, action: 'sub' | 'ch' | 'coo' | 'rej') => {
    void updateTimelogStatus(id, action).catch((error) => {
      toast.error(error instanceof Error ? error.message : 'Nepodařilo se aktualizovat výkaz.');
    });
  }, []);

  const approvalPreviewRows = useMemo(() => {
    if (!showPowerAppsPreview) return [];

    const snapshot = getLocalAppState();
    return buildApprovalTimelogPreview({
      approvalDocuments: invoiceApprovalsQuery.data ?? [],
      events,
      contractors,
      timelogs: timelogsQuery.data ?? [],
      eventCrewAssignments: snapshot.eventCrewAssignments ?? [],
      grasonConfirmations: snapshot.grasonEventConfirmations ?? [],
    });
  }, [contractors, events, invoiceApprovalsQuery.data, showPowerAppsPreview, timelogsQuery.data]);

  const readyApprovalRows = useMemo(
    () => approvalPreviewRows.filter((row) => row.status === 'ready'),
    [approvalPreviewRows],
  );

  const applyApprovalRow = useCallback(async (row: ApprovalTimelogPreviewRow) => {
    try {
      setApplyingApprovalRowId(row.id);
      await applyApprovalTimelogPreview(row, {
        timelogs: getLocalAppState().timelogs ?? timelogsQuery.data ?? [],
      });
      await timelogsQuery.refetch?.();
      toast.success('Timelog byl upraven podle PowerApps.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nepodarilo se aplikovat PowerApps timelog.');
    } finally {
      setApplyingApprovalRowId(null);
    }
  }, [timelogsQuery]);

  const applyReadyApprovalRows = useCallback(async () => {
    if (readyApprovalRows.length === 0) return;

    try {
      setApplyingApprovalRowId('all');
      for (const row of readyApprovalRows) {
        await applyApprovalTimelogPreview(row, {
          timelogs: getLocalAppState().timelogs ?? timelogsQuery.data ?? [],
        });
      }
      await timelogsQuery.refetch?.();
      toast.success(`Aplikovano ${readyApprovalRows.length} PowerApps timelogu.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nepodarilo se aplikovat jasne PowerApps shody.');
    } finally {
      setApplyingApprovalRowId(null);
    }
  }, [readyApprovalRows, timelogsQuery]);

  const runBulkAction = (ids: number[], action: 'ch' | 'coo') => {
    void Promise.all(ids.map((id) => updateTimelogStatus(id, action))).catch((error) => {
      toast.error(error instanceof Error ? error.message : 'Nepodařilo se aktualizovat výkazy.');
    });
  };

  const getBulkActionMeta = (timelogsInGroup: typeof filtered) => {
    const actionableIds = timelogsInGroup
      .filter((timelog) => timelog.status === pendingStatusForRole)
      .map((timelog) => timelog.id);

    if (actionableIds.length === 0 || role === 'crew' || scope === 'mine') return null;

    if (role === 'crewhead') {
      return {
        ids: actionableIds,
        action: 'ch' as const,
        label: `Schválit vše a poslat COO (${actionableIds.length})`,
      };
    }

    return {
      ids: actionableIds,
      action: 'coo' as const,
      label: `Schválit vše (${actionableIds.length})`,
    };
  };

  const renderRowActions = (timelog: typeof filtered[number]) => (
    <div className="flex gap-2">
      {canSubmitTimelog(timelog, role) && (
        <Button
          onClick={() => handleTimelogAction(timelog.id, 'sub')}
          size="sm"
          className="border border-[color:var(--nodu-success-border)] bg-[color:var(--nodu-success-bg)] text-[11px] text-[color:var(--nodu-success-text)] shadow-[0_12px_24px_rgba(47,125,79,0.10)] hover:bg-[color:var(--nodu-success-bg-hover)] hover:shadow-[0_14px_28px_rgba(47,125,79,0.14)] hover:text-[color:var(--nodu-success-text)]"
        >
          Odeslat ke kontrole CH
        </Button>
      )}
      {timelog.status === 'pending_ch' && role === 'crewhead' && (
        <>
          <Button
            onClick={() => handleTimelogAction(timelog.id, 'ch')}
            size="sm"
            className="border border-[color:var(--nodu-success-border)] bg-[color:var(--nodu-success-bg)] text-[11px] text-[color:var(--nodu-success-text)] shadow-[0_12px_24px_rgba(47,125,79,0.10)] hover:bg-[color:var(--nodu-success-bg-hover)] hover:shadow-[0_14px_28px_rgba(47,125,79,0.14)] hover:text-[color:var(--nodu-success-text)]"
          >
            Schválit a poslat COO
          </Button>
          <Button
            onClick={() => handleTimelogAction(timelog.id, 'rej')}
            variant="outline"
            size="sm"
            className="border-[#e8b4a3] text-[#c45c39] hover:bg-[rgba(212,93,55,0.06)] hover:text-[#c45c39] text-[11px]"
          >
            Zamítnout
          </Button>
        </>
      )}
      {timelog.status === 'pending_coo' && role === 'coo' && (
        <>
          <Button
            onClick={() => handleTimelogAction(timelog.id, 'coo')}
            size="sm"
            className="border border-[color:var(--nodu-success-border)] bg-[color:var(--nodu-success-bg)] text-[11px] text-[color:var(--nodu-success-text)] shadow-[0_12px_24px_rgba(47,125,79,0.10)] hover:bg-[color:var(--nodu-success-bg-hover)] hover:shadow-[0_14px_28px_rgba(47,125,79,0.14)] hover:text-[color:var(--nodu-success-text)]"
          >
            Schválit
          </Button>
          <Button
            onClick={() => handleTimelogAction(timelog.id, 'rej')}
            variant="outline"
            size="sm"
            className="border-[#e8b4a3] text-[#c45c39] hover:bg-[rgba(212,93,55,0.06)] hover:text-[#c45c39] text-[11px]"
          >
            Zamítnout
          </Button>
        </>
      )}
      {(scope === 'mine' || !isCrew) && canEditTimelog(timelog, role) && (
        <Button
          onClick={() => setEditingTimelog(timelog)}
          variant="outline"
          size="sm"
          className="ml-auto text-[11px]"
        >
          Upravit
        </Button>
      )}
    </div>
  );

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="mb-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="nodu-dashboard-kicker">Timesheets</div>
            <h1 className="text-2xl font-semibold tracking-[-0.03em] text-[color:var(--nodu-text)]">{title}</h1>
            {scope === 'all' && (
              <p className="mt-1 text-sm text-[color:var(--nodu-text-soft)]">
                Schvalování i detail výkazů na jednom místě.
              </p>
            )}
          </div>

          {scope === 'all' && (
            <div className="inline-flex rounded-[18px] border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.92)] p-1 shadow-[0_12px_28px_rgba(47,38,31,0.08)]">
              <button
                onClick={() => setViewMode('event')}
                className={`rounded-[14px] px-3.5 py-2 text-[11px] font-medium transition-all ${viewMode === 'event' ? 'bg-[color:rgb(var(--nodu-accent-rgb)/0.12)] text-[color:var(--nodu-accent)] shadow-[inset_0_0_0_1px_rgba(255,128,13,0.16)]' : 'text-[color:var(--nodu-text-soft)] hover:text-[color:var(--nodu-text)]'}`}
              >
                Po akci
              </button>
              <button
                onClick={() => setViewMode('people')}
                className={`rounded-[14px] px-3.5 py-2 text-[11px] font-medium transition-all ${viewMode === 'people' ? 'bg-[color:rgb(var(--nodu-accent-rgb)/0.12)] text-[color:var(--nodu-accent)] shadow-[inset_0_0_0_1px_rgba(255,128,13,0.16)]' : 'text-[color:var(--nodu-text-soft)] hover:text-[color:var(--nodu-text)]'}`}
              >
                Po lidech
              </button>
            </div>
          )}
        </div>

        <div className="flex w-fit flex-wrap gap-1 rounded-[18px] border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.92)] p-1 shadow-[0_12px_28px_rgba(47,38,31,0.08)]">
          {filterOptions.map((filter) => (
            <button
              key={filter.id}
              onClick={() => setTimelogFilter(filter.id)}
              className={`inline-flex items-center gap-2 rounded-[14px] px-3 py-2 text-[11px] font-medium transition-all ${timelogFilter === filter.id ? 'bg-[color:rgb(var(--nodu-accent-rgb)/0.12)] text-[color:var(--nodu-accent)] shadow-[inset_0_0_0_1px_rgba(255,128,13,0.16)]' : 'text-[color:var(--nodu-text-soft)] hover:text-[color:var(--nodu-text)]'}`}
            >
              <span>{filter.label}</span>
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${timelogFilter === filter.id ? 'bg-[color:rgb(var(--nodu-accent-rgb)/0.16)]' : 'bg-[color:rgb(var(--nodu-text-rgb)/0.08)] text-[color:var(--nodu-text-soft)]'}`}>
                {filter.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {showPowerAppsPreview && approvalPreviewRows.length > 0 && (
        <div className="nodu-panel mb-5 rounded-[28px] p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-[color:rgb(var(--nodu-text-rgb)/0.08)] pb-3">
            <div>
              <h2 className="text-sm font-semibold text-[color:var(--nodu-text)]">PowerApps timelogy</h2>
              <p className="mt-1 text-xs text-[color:var(--nodu-text-soft)]">
                Navrhy z komentaru schvalenych dokumentu. Nejasne radky zustavaji jen ke kontrole.
              </p>
            </div>
            <Button
              type="button"
              onClick={() => void applyReadyApprovalRows()}
              disabled={readyApprovalRows.length === 0 || applyingApprovalRowId !== null}
              size="sm"
              className="border border-[color:var(--nodu-success-border)] bg-[color:var(--nodu-success-bg)] text-xs text-[color:var(--nodu-success-text)] shadow-[0_14px_28px_rgba(47,125,79,0.10)] hover:bg-[color:var(--nodu-success-bg-hover)] hover:text-[color:var(--nodu-success-text)] disabled:cursor-not-allowed disabled:border-[color:var(--nodu-border)] disabled:bg-[color:rgb(var(--nodu-text-rgb)/0.05)] disabled:text-[color:var(--nodu-text-soft)]"
            >
              {applyingApprovalRowId === 'all' ? 'Aplikuji...' : `Aplikovat jasne shody (${readyApprovalRows.length})`}
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead>
                <tr className="border-b border-[color:rgb(var(--nodu-text-rgb)/0.08)] text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--nodu-text-soft)]">
                  <th className="px-3 py-2">Dokument</th>
                  <th className="px-3 py-2">Osoba</th>
                  <th className="px-3 py-2">Akce</th>
                  <th className="px-3 py-2">Navrh</th>
                  <th className="px-3 py-2">Stav</th>
                  <th className="px-3 py-2 text-right">Akce</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:rgb(var(--nodu-text-rgb)/0.08)]">
                {approvalPreviewRows.map((row) => {
                  const statusLabel = row.status === 'ready'
                    ? 'Jasna shoda'
                    : row.status === 'needs_review'
                      ? 'Ke kontrole'
                      : row.status === 'applied'
                        ? 'Aplikovano'
                        : 'Blokovano';
                  const statusClass = row.status === 'ready'
                    ? 'border-[color:var(--nodu-success-border)] bg-[color:var(--nodu-success-bg)] text-[color:var(--nodu-success-text)]'
                    : row.status === 'needs_review'
                      ? 'border-[color:var(--nodu-warning-border)] bg-[color:var(--nodu-warning-bg)] text-[color:var(--nodu-warning-text)]'
                      : row.status === 'applied'
                        ? 'border-[color:var(--nodu-info-border)] bg-[color:var(--nodu-info-bg)] text-[color:var(--nodu-info-text)]'
                        : 'border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-text-rgb)/0.05)] text-[color:var(--nodu-text-soft)]';

                  return (
                    <tr key={row.id} className="align-top">
                      <td className="px-3 py-3">
                        <div className="font-semibold text-[color:var(--nodu-text)]">{row.documentName}</div>
                        <div className="mt-1 text-[10px] text-[color:var(--nodu-text-soft)]">{row.invoiceNumber || 'bez cisla faktury'}</div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-medium text-[color:var(--nodu-text)]">{row.personName}</div>
                        {row.matchedContractor && (
                          <div className="mt-1 text-[10px] text-[color:var(--nodu-text-soft)]">
                            NODU: {row.matchedContractor.name}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-semibold text-[color:var(--nodu-text)]">{row.matchedEvent?.job ?? row.jobNumber}</div>
                        <div className="mt-1 max-w-[220px] text-[10px] text-[color:var(--nodu-text-soft)]">{row.matchedEvent?.name ?? row.eventName}</div>
                      </td>
                      <td className="px-3 py-3">
                        {row.proposedDays.length > 0 ? (
                          <div className="space-y-1">
                            {row.proposedDays.map((day) => (
                              <div key={`${row.id}-${day.d}-${day.f}-${day.type}`} className="font-mono text-[11px] text-[color:var(--nodu-text)]">
                                {formatShortDate(day.d)} {day.f}-{day.t}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-[color:var(--nodu-text-soft)]">Bez navrhu casu</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold ${statusClass}`}>{statusLabel}</span>
                        <div className="mt-1 max-w-[220px] text-[10px] text-[color:var(--nodu-text-soft)]">{row.reason}</div>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <Button
                          type="button"
                          onClick={() => void applyApprovalRow(row)}
                          disabled={row.status !== 'ready' || applyingApprovalRowId !== null}
                          variant="outline"
                          size="sm"
                          className="text-[11px]"
                        >
                          {applyingApprovalRowId === row.id ? 'Aplikuji...' : 'Aplikovat'}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {scope === 'all' && viewMode === 'event' ? (
        <div className="space-y-4">
          {groupedByEvent.map((group) => {
            const totalHours = group.timelogs.reduce((sum, timelog) => sum + calculateTotalHours(timelog.days), 0);
            const totalAmount = group.timelogs.reduce((sum, timelog) => {
              const contractor = findContractor(timelog.contractorProfileId);
              if (!contractor) return sum;
              return sum + (calculateTotalHours(timelog.days) * contractor.rate) + (timelog.km * KM_RATE);
            }, 0);
            const bulkAction = getBulkActionMeta(group.timelogs);

            return (
              <div key={group.eventId} className="nodu-panel rounded-[28px] p-5">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-[color:rgb(var(--nodu-text-rgb)/0.08)] pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="jn nodu-job-badge px-2 py-1 text-sm">{group.job}</span>
                      <span className="text-base font-semibold text-[color:var(--nodu-text)]">{group.eventName}</span>
                    </div>
                    <div className="mt-1 text-xs text-[color:var(--nodu-text-soft)]">
                      {group.city} · {group.timelogs.length} výkazů
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-xl font-semibold text-[color:var(--nodu-text)]">{formatCurrency(totalAmount)}</div>
                    <div className="text-xs text-[color:var(--nodu-text-soft)]">{totalHours.toFixed(1)}h celkem</div>
                  </div>
                </div>

                <div className="space-y-3">
                  {group.timelogs.map((timelog) => {
                    const contractor = findContractor(timelog.contractorProfileId);
                    const event = findEvent(timelog.eid);
                    if (!contractor || !event) return null;

                    const hours = calculateTotalHours(timelog.days);
                    const phases = Array.from(new Set(timelog.days.map((day) => day.type)));

                    return (
                      <div key={timelog.id} className="rounded-[22px] border border-[color:rgb(var(--nodu-text-rgb)/0.08)] bg-[color:rgb(var(--nodu-surface-rgb)/0.9)] p-4 shadow-[0_12px_28px_rgba(47,38,31,0.06)]">
                        <div className="mb-3 flex flex-wrap items-center gap-3 border-b border-[color:rgb(var(--nodu-text-rgb)/0.08)] pb-3">
                          <div className="av w-8 h-8 text-[10px]" style={{ backgroundColor: contractor.bg, color: contractor.fg }}>
                            {contractor.ii}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-semibold text-[color:var(--nodu-text)]">{contractor.name}</div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-[color:var(--nodu-text-soft)]">
                              <span>{event.name}</span>
                              {phases.map((phase) => <StatusBadge key={`${timelog.id}-${phase}`} status={phase} />)}
                            </div>
                          </div>
                          <StatusBadge status={timelog.status} />
                          <div className="text-right">
                            <div className="text-sm font-semibold text-[color:var(--nodu-text)]">{hours.toFixed(1)}h</div>
                            <div className="text-[11px] text-[color:var(--nodu-text-soft)]">
                              {formatCurrency(hours * contractor.rate)}
                              {timelog.km > 0 ? ` + ${formatCurrency(timelog.km * KM_RATE)}` : ''}
                            </div>
                          </div>
                        </div>

                        <div className="mb-3 space-y-1">
                          {timelog.days.map((day, index) => (
                            <div key={`${timelog.id}-${index}`} className="flex items-center gap-4 py-1 text-xs">
                              <span className="w-20 text-[color:var(--nodu-text-soft)]">{formatShortDate(day.d)}</span>
                              <span className="font-mono font-semibold text-[color:var(--nodu-text)]">{day.f} - {day.t}</span>
                              <StatusBadge status={day.type} />
                              <span className="ml-auto text-[color:var(--nodu-text-soft)]">{calculateDayHours(day.f, day.t).toFixed(1)}h</span>
                            </div>
                          ))}
                        </div>

                        <div className="mb-3 flex items-center gap-3">
                          {showTimelogNotes && timelog.note && (
                            <p className="min-w-0 flex-1 text-xs italic text-[color:var(--nodu-text-soft)]">"{timelog.note}"</p>
                          )}
                          {(scope === 'mine' || !isCrew) && canEditTimelog(timelog, role) && (
                            <button
                              onClick={() => setEditingTimelog(timelog)}
                              className="ml-auto rounded-xl border border-[color:var(--nodu-border)] px-3 py-1.5 text-[11px] font-medium text-[color:var(--nodu-text)] transition hover:bg-[color:var(--nodu-accent-soft)]"
                            >
                              Upravit
                            </button>
                          )}
                        </div>

                        <div className="flex gap-2">
                          {canSubmitTimelog(timelog, role) && (
                            <button
                              onClick={() => handleTimelogAction(timelog.id, 'sub')}
                              className="rounded-xl border border-[color:var(--nodu-success-border)] bg-[color:var(--nodu-success-bg)] px-3 py-1.5 text-[11px] font-semibold text-[color:var(--nodu-success-text)] shadow-[0_12px_24px_rgba(47,125,79,0.10)] transition hover:bg-[color:var(--nodu-success-bg-hover)] hover:shadow-[0_14px_28px_rgba(47,125,79,0.14)]"
                            >
                              Odeslat ke kontrole CH
                            </button>
                          )}
                          {timelog.status === 'pending_ch' && role === 'crewhead' && (
                            <>
                              <button
                                onClick={() => handleTimelogAction(timelog.id, 'ch')}
                                className="rounded-xl border border-[color:var(--nodu-success-border)] bg-[color:var(--nodu-success-bg)] px-3 py-1.5 text-[11px] font-semibold text-[color:var(--nodu-success-text)] shadow-[0_12px_24px_rgba(47,125,79,0.10)] transition hover:bg-[color:var(--nodu-success-bg-hover)] hover:shadow-[0_14px_28px_rgba(47,125,79,0.14)]"
                              >
                                Schválit a poslat COO
                              </button>
                              <button
                                onClick={() => handleTimelogAction(timelog.id, 'rej')}
                                className="rounded-xl border border-[color:var(--nodu-error-border)] px-3 py-1.5 text-[11px] font-medium text-[color:var(--nodu-error-text)] transition hover:bg-[color:var(--nodu-error-bg)]"
                              >
                                Zamítnout
                              </button>
                            </>
                          )}
                          {timelog.status === 'pending_coo' && role === 'coo' && (
                            <>
                              <button
                                onClick={() => handleTimelogAction(timelog.id, 'coo')}
                                className="rounded-xl border border-[color:var(--nodu-success-border)] bg-[color:var(--nodu-success-bg)] px-3 py-1.5 text-[11px] font-semibold text-[color:var(--nodu-success-text)] shadow-[0_12px_24px_rgba(47,125,79,0.10)] transition hover:bg-[color:var(--nodu-success-bg-hover)] hover:shadow-[0_14px_28px_rgba(47,125,79,0.14)]"
                              >
                                Schválit
                              </button>
                              <button
                                onClick={() => handleTimelogAction(timelog.id, 'rej')}
                                className="rounded-xl border border-[color:var(--nodu-error-border)] px-3 py-1.5 text-[11px] font-medium text-[color:var(--nodu-error-text)] transition hover:bg-[color:var(--nodu-error-bg)]"
                              >
                                Zamítnout
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {bulkAction && (
                  <div className="mt-4 flex justify-end">
                    <Button
                      onClick={() => runBulkAction(bulkAction.ids, bulkAction.action)}
                      size="sm"
                      className="border border-[color:var(--nodu-success-border)] bg-[color:var(--nodu-success-bg)] text-xs text-[color:var(--nodu-success-text)] shadow-[0_14px_28px_rgba(47,125,79,0.10)] hover:bg-[color:var(--nodu-success-bg-hover)] hover:shadow-[0_14px_28px_rgba(47,125,79,0.14)] hover:text-[color:var(--nodu-success-text)]"
                    >
                      {bulkAction.label}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}

          {groupedByEvent.length === 0 && (
            <div className="nodu-panel rounded-[24px] p-10 text-center text-sm text-[color:var(--nodu-text-soft)]">
              Žádné záznamy pro tento filtr
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((timelog) => {
            const contractor = findContractor(timelog.contractorProfileId);
            const event = findEvent(timelog.eid);
            if (!contractor || !event) return null;

            const totalHours = calculateTotalHours(timelog.days);

            return (
              <div key={timelog.id} className="nodu-panel rounded-[28px] p-5">
                <div className="mb-3 flex items-center gap-3 border-b border-[color:rgb(var(--nodu-text-rgb)/0.08)] pb-3">
                  <div className="av w-8 h-8 text-[10px]" style={{ backgroundColor: contractor.bg, color: contractor.fg }}>
                    {contractor.ii}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-[color:var(--nodu-text)]">{contractor.name}</div>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <span className="jn nodu-job-badge">{event.job}</span>
                      <span className="text-xs text-[color:var(--nodu-text-soft)]">{event.name}</span>
                    </div>
                  </div>
                  <StatusBadge status={timelog.status} />
                  <div className="text-right">
                    <div className="text-base font-semibold text-[color:var(--nodu-text)]">{totalHours.toFixed(1)}h</div>
                    {timelog.km > 0 && <div className="text-[10px] text-[color:var(--nodu-text-soft)]">+ {timelog.km} km</div>}
                  </div>
                </div>

                <div className="mb-3">
                  {timelog.days.map((day, index) => (
                    <div key={`${timelog.id}-${index}`} className="flex items-center gap-4 py-1 text-xs">
                      <span className="w-20 text-[color:var(--nodu-text-soft)]">{formatShortDate(day.d)}</span>
                      <span className="font-mono font-semibold text-[color:var(--nodu-text)]">{day.f} - {day.t}</span>
                      <StatusBadge status={day.type} />
                      <span className="ml-auto text-[color:var(--nodu-text-soft)]">{calculateDayHours(day.f, day.t).toFixed(1)}h</span>
                    </div>
                  ))}
                </div>

                {showTimelogNotes && timelog.note && <p className="mb-3 text-xs italic text-[color:var(--nodu-text-soft)]">"{timelog.note}"</p>}
                {renderRowActions(timelog)}
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div className="nodu-panel rounded-[24px] p-10 text-center text-sm text-[color:var(--nodu-text-soft)]">
              Žádné záznamy pro tento filtr
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
};

export default TimelogsView;
