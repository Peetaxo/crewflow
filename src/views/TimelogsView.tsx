import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useAppContext } from '../context/AppContext';
import { KM_RATE } from '../data';
import { Contractor, Event, Timelog } from '../types';
import { calculateDayHours, calculateTotalHours, formatCurrency, formatShortDate } from '../utils';
import StatusBadge from '../components/shared/StatusBadge';
import {
  getTimelogDependencies,
  getTimelogs,
  subscribeToTimelogChanges,
  updateTimelogStatus,
} from '../features/timelogs/services/timelogs.service';

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

  const [viewMode, setViewMode] = useState<ViewMode>(scope === 'mine' ? 'people' : 'job');
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

  const baseTimelogs = scope === 'mine' ? timelogs.filter((timelog) => timelog.cid === 1) : timelogs;
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

  const runBulkAction = (ids: number[], action: 'ch' | 'coo') => {
    ids.forEach((id) => updateTimelogStatus(id, action));
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
        <button
          onClick={() => updateTimelogStatus(timelog.id, 'sub')}
          className="px-3 py-1.5 rounded-md bg-emerald-600 text-[11px] text-white hover:bg-emerald-700"
        >
          Odeslat ke kontrole CH
        </button>
      )}
      {timelog.status === 'pending_ch' && role === 'crewhead' && (
        <>
          <button
            onClick={() => updateTimelogStatus(timelog.id, 'ch')}
            className="px-3 py-1.5 rounded-md bg-emerald-600 text-[11px] text-white hover:bg-emerald-700"
          >
            Schválit a poslat COO
          </button>
          <button
            onClick={() => updateTimelogStatus(timelog.id, 'rej')}
            className="px-3 py-1.5 rounded-md border border-red-100 text-[11px] text-red-600 hover:bg-red-50"
          >
            Zamítnout
          </button>
        </>
      )}
      {timelog.status === 'pending_coo' && role === 'coo' && (
        <>
          <button
            onClick={() => updateTimelogStatus(timelog.id, 'coo')}
            className="px-3 py-1.5 rounded-md bg-emerald-600 text-[11px] text-white hover:bg-emerald-700"
          >
            Schválit
          </button>
          <button
            onClick={() => updateTimelogStatus(timelog.id, 'rej')}
            className="px-3 py-1.5 rounded-md border border-red-100 text-[11px] text-red-600 hover:bg-red-50"
          >
            Zamítnout
          </button>
        </>
      )}
      {(scope === 'mine' || !isCrew) && (
        <button
          onClick={() => setEditingTimelog(timelog)}
          className="ml-auto px-3 py-1.5 rounded-md border border-gray-200 text-[11px] hover:bg-gray-50"
        >
          Upravit
        </button>
      )}
    </div>
  );

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="mb-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold">{title}</h1>
            {scope === 'all' && (
              <p className="mt-0.5 text-xs text-gray-500">
                Schvalování i detail výkazů na jednom místě.
              </p>
            )}
          </div>

          {scope === 'all' && (
            <div className="flex rounded-lg border border-gray-200 bg-white p-0.5">
              <button
                onClick={() => setViewMode('job')}
                className={`px-3 py-1 text-[11px] font-medium rounded-md ${viewMode === 'job' ? 'bg-emerald-50 text-emerald-700' : 'text-gray-500 hover:text-gray-900'}`}
              >
                Po Job Number
              </button>
              <button
                onClick={() => setViewMode('people')}
                className={`px-3 py-1 text-[11px] font-medium rounded-md ${viewMode === 'people' ? 'bg-emerald-50 text-emerald-700' : 'text-gray-500 hover:text-gray-900'}`}
              >
                Po lidech
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-1 rounded-lg border border-gray-200 bg-white p-0.5 w-fit">
          {filterOptions.map((filter) => (
            <button
              key={filter.id}
              onClick={() => setTimelogFilter(filter.id)}
              className={`inline-flex items-center gap-2 rounded-md px-3 py-1 text-[11px] font-medium transition-all ${timelogFilter === filter.id ? 'bg-emerald-50 text-emerald-700 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
            >
              <span>{filter.label}</span>
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${timelogFilter === filter.id ? 'bg-emerald-100' : 'bg-gray-100 text-gray-600'}`}>
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
              const contractor = findContractor(timelog.cid);
              if (!contractor) return sum;
              return sum + (calculateTotalHours(timelog.days) * contractor.rate) + (timelog.km * KM_RATE);
            }, 0);
            const bulkAction = getBulkActionMeta(group.timelogs);

            return (
              <div key={group.job} className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="jn px-2 py-1 text-sm">{group.job}</span>
                      <span className="text-base font-semibold text-gray-900">{group.eventName}</span>
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      {group.city} · {group.timelogs.length} výkazů
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-xl font-semibold text-gray-900">{formatCurrency(totalAmount)}</div>
                    <div className="text-xs text-gray-500">{totalHours.toFixed(1)}h celkem</div>
                  </div>
                </div>

                <div className="space-y-3">
                  {group.timelogs.map((timelog) => {
                    const contractor = findContractor(timelog.cid);
                    const event = findEvent(timelog.eid);
                    if (!contractor || !event) return null;

                    const hours = calculateTotalHours(timelog.days);
                    const phases = Array.from(new Set(timelog.days.map((day) => day.type)));

                    return (
                      <div key={timelog.id} className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                        <div className="mb-3 flex flex-wrap items-center gap-3 border-b border-gray-100 pb-3">
                          <div className="av w-8 h-8 text-[10px]" style={{ backgroundColor: contractor.bg, color: contractor.fg }}>
                            {contractor.ii}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-semibold">{contractor.name}</div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
                              <span>{event.name}</span>
                              {phases.map((phase) => <StatusBadge key={`${timelog.id}-${phase}`} status={phase} />)}
                            </div>
                          </div>
                          <StatusBadge status={timelog.status} />
                          <div className="text-right">
                            <div className="text-sm font-semibold">{hours.toFixed(1)}h</div>
                            <div className="text-[11px] text-gray-500">
                              {formatCurrency(hours * contractor.rate)}
                              {timelog.km > 0 ? ` + ${formatCurrency(timelog.km * KM_RATE)}` : ''}
                            </div>
                          </div>
                        </div>

                        <div className="mb-3 space-y-1">
                          {timelog.days.map((day, index) => (
                            <div key={`${timelog.id}-${index}`} className="flex items-center gap-4 py-1 text-xs">
                              <span className="w-20 text-gray-500">{formatShortDate(day.d)}</span>
                              <span className="font-mono font-semibold">{day.f} - {day.t}</span>
                              <StatusBadge status={day.type} />
                              <span className="ml-auto text-gray-500">{calculateDayHours(day.f, day.t).toFixed(1)}h</span>
                            </div>
                          ))}
                        </div>

                        <div className="mb-3 flex items-center gap-3">
                          {timelog.note && (
                            <p className="min-w-0 flex-1 text-xs italic text-gray-500">"{timelog.note}"</p>
                          )}
                          {(scope === 'mine' || !isCrew) && (
                            <button
                              onClick={() => setEditingTimelog(timelog)}
                              className="ml-auto rounded-md border border-gray-200 px-3 py-1.5 text-[11px] hover:bg-gray-50"
                            >
                              Upravit
                            </button>
                          )}
                        </div>

                        <div className="flex gap-2">
                          {timelog.status === 'draft' && (
                            <button
                              onClick={() => updateTimelogStatus(timelog.id, 'sub')}
                              className="px-3 py-1.5 rounded-md bg-emerald-600 text-[11px] text-white hover:bg-emerald-700"
                            >
                              Odeslat ke kontrole CH
                            </button>
                          )}
                          {timelog.status === 'pending_ch' && role === 'crewhead' && (
                            <>
                              <button
                                onClick={() => updateTimelogStatus(timelog.id, 'ch')}
                                className="px-3 py-1.5 rounded-md bg-emerald-600 text-[11px] text-white hover:bg-emerald-700"
                              >
                                Schválit a poslat COO
                              </button>
                              <button
                                onClick={() => updateTimelogStatus(timelog.id, 'rej')}
                                className="px-3 py-1.5 rounded-md border border-red-100 text-[11px] text-red-600 hover:bg-red-50"
                              >
                                Zamítnout
                              </button>
                            </>
                          )}
                          {timelog.status === 'pending_coo' && role === 'coo' && (
                            <>
                              <button
                                onClick={() => updateTimelogStatus(timelog.id, 'coo')}
                                className="px-3 py-1.5 rounded-md bg-emerald-600 text-[11px] text-white hover:bg-emerald-700"
                              >
                                Schválit
                              </button>
                              <button
                                onClick={() => updateTimelogStatus(timelog.id, 'rej')}
                                className="px-3 py-1.5 rounded-md border border-red-100 text-[11px] text-red-600 hover:bg-red-50"
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
                    <button
                      onClick={() => runBulkAction(bulkAction.ids, bulkAction.action)}
                      className="rounded-md bg-emerald-600 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-700"
                    >
                      {bulkAction.label}
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {groupedByJob.length === 0 && (
            <div className="rounded-xl border border-gray-100 bg-white p-10 text-center text-sm text-gray-400">
              Žádné záznamy pro tento filtr
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((timelog) => {
            const contractor = findContractor(timelog.cid);
            const event = findEvent(timelog.eid);
            if (!contractor || !event) return null;

            const totalHours = calculateTotalHours(timelog.days);

            return (
              <div key={timelog.id} className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                <div className="mb-3 flex items-center gap-3 border-b border-gray-50 pb-3">
                  <div className="av w-8 h-8 text-[10px]" style={{ backgroundColor: contractor.bg, color: contractor.fg }}>
                    {contractor.ii}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold">{contractor.name}</div>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <span className="jn">{event.job}</span>
                      <span className="text-xs text-gray-500">{event.name}</span>
                    </div>
                  </div>
                  <StatusBadge status={timelog.status} />
                  <div className="text-right">
                    <div className="text-base font-semibold">{totalHours.toFixed(1)}h</div>
                    {timelog.km > 0 && <div className="text-[10px] text-gray-500">+ {timelog.km} km</div>}
                  </div>
                </div>

                <div className="mb-3">
                  {timelog.days.map((day, index) => (
                    <div key={`${timelog.id}-${index}`} className="flex items-center gap-4 py-1 text-xs">
                      <span className="w-20 text-gray-500">{formatShortDate(day.d)}</span>
                      <span className="font-mono font-semibold">{day.f} - {day.t}</span>
                      <StatusBadge status={day.type} />
                      <span className="ml-auto text-gray-500">{calculateDayHours(day.f, day.t).toFixed(1)}h</span>
                    </div>
                  ))}
                </div>

                {timelog.note && <p className="mb-3 text-xs italic text-gray-500">"{timelog.note}"</p>}
                {renderRowActions(timelog)}
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div className="rounded-xl border border-gray-100 bg-white p-10 text-center text-sm text-gray-400">
              Žádné záznamy pro tento filtr
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
};

export default TimelogsView;
