import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { useAuth } from '../app/providers/useAuth';
import { useAppContext } from '../context/useAppContext';
import { KM_RATE } from '../data';
import { Contractor, Event, Timelog } from '../types';
import { calculateDayHours, calculateTotalHours, formatCurrency, formatShortDate } from '../utils';
import StatusBadge from '../components/shared/StatusBadge';
import {
  getTimelogDependencies,
  updateTimelogStatus,
} from '../features/timelogs/services/timelogs.service';
import { useTimelogsQuery } from '../features/timelogs/queries/useTimelogsQuery';

interface TimelogsViewProps {
  scope?: 'all' | 'mine';
}

type ViewMode = 'job' | 'people';

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

  const [viewMode, setViewMode] = useState<ViewMode>(scope === 'mine' ? 'people' : 'job');
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

  const baseTimelogs = scope === 'mine'
    ? timelogs.filter((timelog) => timelog.contractorProfileId === currentProfileId)
    : timelogs;
  const filtered = timelogFilter === 'all' ? baseTimelogs : baseTimelogs.filter((timelog) => timelog.status === timelogFilter);
  const isCrew = role === 'crew';
  const title = scope === 'mine' ? 'Moje timelogy' : 'Timelogy';
  const pendingStatusForRole = role === 'crewhead' ? 'pending_ch' : 'pending_coo';

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

  const groupedByJob = useMemo(() => {
    const groups = new Map<string, { job: string; eventName: string; city: string; timelogs: typeof filtered }>();

    filtered.forEach((timelog) => {
      const event = findEvent(timelog.eid);
      if (!event) return;

      const existing = groups.get(event.job) || {
        job: event.job,
        eventName: event.name,
        city: event.city,
        timelogs: [],
      };

      existing.timelogs.push(timelog);
      groups.set(event.job, existing);
    });

    return Array.from(groups.values()).sort((a, b) => a.job.localeCompare(b.job));
  }, [filtered, findEvent]);

  const handleTimelogAction = useCallback((id: number, action: 'sub' | 'ch' | 'coo' | 'rej') => {
    void updateTimelogStatus(id, action).catch((error) => {
      toast.error(error instanceof Error ? error.message : 'Nepodařilo se aktualizovat výkaz.');
    });
  }, []);

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
      {timelog.status === 'draft' && (
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
      {(scope === 'mine' || !isCrew) && (
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
                onClick={() => setViewMode('job')}
                className={`rounded-[14px] px-3.5 py-2 text-[11px] font-medium transition-all ${viewMode === 'job' ? 'bg-[color:rgb(var(--nodu-accent-rgb)/0.12)] text-[color:var(--nodu-accent)] shadow-[inset_0_0_0_1px_rgba(255,128,13,0.16)]' : 'text-[color:var(--nodu-text-soft)] hover:text-[color:var(--nodu-text)]'}`}
              >
                Po Job Number
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

      {scope === 'all' && viewMode === 'job' ? (
        <div className="space-y-4">
          {groupedByJob.map((group) => {
            const totalHours = group.timelogs.reduce((sum, timelog) => sum + calculateTotalHours(timelog.days), 0);
            const totalAmount = group.timelogs.reduce((sum, timelog) => {
              const contractor = findContractor(timelog.contractorProfileId);
              if (!contractor) return sum;
              return sum + (calculateTotalHours(timelog.days) * contractor.rate) + (timelog.km * KM_RATE);
            }, 0);
            const bulkAction = getBulkActionMeta(group.timelogs);

            return (
              <div key={group.job} className="nodu-panel rounded-[28px] p-5">
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
                          {timelog.note && (
                            <p className="min-w-0 flex-1 text-xs italic text-[color:var(--nodu-text-soft)]">"{timelog.note}"</p>
                          )}
                          {(scope === 'mine' || !isCrew) && (
                            <button
                              onClick={() => setEditingTimelog(timelog)}
                              className="ml-auto rounded-xl border border-[color:var(--nodu-border)] px-3 py-1.5 text-[11px] font-medium text-[color:var(--nodu-text)] transition hover:bg-[color:var(--nodu-accent-soft)]"
                            >
                              Upravit
                            </button>
                          )}
                        </div>

                        <div className="flex gap-2">
                          {timelog.status === 'draft' && (
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

          {groupedByJob.length === 0 && (
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

                {timelog.note && <p className="mb-3 text-xs italic text-[color:var(--nodu-text-soft)]">"{timelog.note}"</p>}
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
