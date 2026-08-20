import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowRight, Calendar, CheckCircle2, Clock, WalletCards } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, parseISO } from 'date-fns';
import { useAuth } from '../app/providers/useAuth';
import { useAppContext } from '../context/useAppContext';
import { KM_RATE } from '../data';
import { Contractor, Event, EventId, Timelog } from '../types';
import { calculateMealAllowance, calculateTotalHours, formatCurrency, formatShortDate } from '../utils';
import { useEventsQuery } from '../features/events/queries/useEventsQuery';
import ShiftCard from '../components/shared/ShiftCard';
import { useTimelogsQuery } from '../features/timelogs/queries/useTimelogsQuery';
import { getProjects, subscribeToProjectChanges } from '../features/projects/services/projects.service';
import { getContractors, subscribeToCrewChanges } from '../features/crew/services/crew.service';
import { categorizeCrewTimelogs, resolveShiftProject } from '../features/crew/services/crew-shift-display';
import MobileSettingsButton from '../components/layout/MobileSettingsButton';
import { buildTimelogChangeSummary } from '../features/timelogs/services/timelog-change-summary';

const formatActionRequiredCount = (count: number) => {
  if (count === 1) return '1 výkaz čeká na tebe';
  if (count >= 2 && count <= 4) return `${count} výkazy čekají na tebe`;
  return `${count} výkazů čeká na tebe`;
};

const getActionRequiredLabel = (status: Timelog['status']) => (
  status === 'pending_crew_confirmation'
    ? 'Čeká na tvoje potvrzení'
    : 'Vráceno k opravě'
);

type ChartPeriod = 'month' | 'quarter' | 'year';
type CrewOverviewTimelogTab = 'drafts' | 'processing' | 'invoiced';

const isEarnedTimelog = (timelog: Timelog) => (
  timelog.status === 'approved'
  || timelog.status === 'invoiced'
  || timelog.status === 'paid'
);

const getChartBucket = (date: Date, period: ChartPeriod): { key: string; sortDate: Date } => {
  if (period === 'month') {
    return {
      key: format(date, 'MMM yyyy'),
      sortDate: new Date(date.getFullYear(), date.getMonth(), 1),
    };
  }

  if (period === 'quarter') {
    const quarter = Math.floor(date.getMonth() / 3);
    return {
      key: `Q${quarter + 1} ${date.getFullYear()}`,
      sortDate: new Date(date.getFullYear(), quarter * 3, 1),
    };
  }

  return {
    key: format(date, 'yyyy'),
    sortDate: new Date(date.getFullYear(), 0, 1),
  };
};

const formatActionRequiredEventDate = (event: Event) => {
  const start = parseISO(event.startDate);

  if (!event.endDate || event.endDate === event.startDate) {
    return format(start, 'd. M. yyyy');
  }

  const end = parseISO(event.endDate);
  return `${format(start, 'd. M.')} - ${format(end, 'd. M. yyyy')}`;
};

const calculateTimelogPayoutAmount = (timelog: Timelog, contractor: Contractor | null, event: Event | null): number => {
  if (!contractor) return 0;

  const hours = calculateTotalHours(timelog.days);
  const amountHours = Math.round(hours * contractor.rate);
  const amountKm = Math.round(timelog.km * KM_RATE);
  const amountMeals = Math.round(calculateMealAllowance(timelog.days, { enabled: Boolean(event?.mealAllowanceEnabled) }));

  return amountHours + amountKm + amountMeals;
};

const MyShiftsView = () => {
  const {
    darkMode,
    searchQuery,
    setCurrentTab,
    setEditingTimelog,
    setEventTab,
    setSelectedEventId,
    setTimelogFilter,
  } = useAppContext();
  const { currentProfileId, profile } = useAuth();
  const eventsQuery = useEventsQuery();
  const timelogsQuery = useTimelogsQuery();
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [projects, setProjects] = useState(() => getProjects() ?? []);
  const me = contractors.find((item) => item.profileId === currentProfileId) ?? null;
  const [activeTab, setActiveTab] = useState<CrewOverviewTimelogTab>('drafts');
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>('month');

  const loadData = useCallback(() => {
    setContractors(getContractors() ?? []);
  }, []);

  useEffect(() => {
    loadData();
  }, [eventsQuery.data, loadData, timelogsQuery.data]);

  useEffect(() => subscribeToCrewChanges(loadData), [loadData]);
  useEffect(() => subscribeToProjectChanges(() => setProjects(getProjects() ?? [])), []);
  const events = useMemo(() => eventsQuery.data ?? [], [eventsQuery.data]);
  const findEvent = useCallback((eventId: EventId) => (
    events.find((event) => event.id === eventId || event.supabaseId === eventId) ?? null
  ), [events]);
  const timelogs = timelogsQuery.data ?? [];
  const meProfileId = currentProfileId ?? me?.profileId ?? null;
  const displayName = me?.name || [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || 'Crew';
  const myTimelogs = timelogs.filter((timelog) => timelog.contractorProfileId === meProfileId);

  const categorized = useMemo(() => categorizeCrewTimelogs(myTimelogs, events), [myTimelogs, events]);

  const stats = useMemo(() => {
    const earnedTimelogs = myTimelogs.filter(isEarnedTimelog);
    const pendingApprovalTimelogs = myTimelogs.filter((timelog) => timelog.status === 'pending_ch' || timelog.status === 'pending_coo');

    const calculateTimelogAmount = (timelog: Timelog) => (
      calculateTimelogPayoutAmount(timelog, me, findEvent(timelog.eid))
    );

    const earnedAmount = earnedTimelogs.reduce((sum, timelog) => sum + calculateTimelogAmount(timelog), 0);
    const pendingApprovalAmount = pendingApprovalTimelogs.reduce((sum, timelog) => sum + calculateTimelogAmount(timelog), 0);

    return {
      earnedAmount,
      pendingApprovalAmount,
    };
  }, [myTimelogs, me, findEvent]);

  const chartData = useMemo(() => {
    const data: Record<string, { total: number; date: Date }> = {};

    const addAmount = (dateValue: string, amount: number) => {
      const date = parseISO(dateValue);
      if (Number.isNaN(date.getTime())) return;

      const { key, sortDate } = getChartBucket(date, chartPeriod);
      if (!data[key]) data[key] = { total: 0, date: sortDate };
      data[key].total += amount;
    };

    myTimelogs.filter(isEarnedTimelog).forEach((timelog) => {
      const event = findEvent(timelog.eid);

      if (!me || timelog.days.length === 0) {
        const fallbackDate = timelog.days[0]?.d ?? event?.startDate;
        if (fallbackDate) addAmount(fallbackDate, calculateTimelogPayoutAmount(timelog, me, event));
        return;
      }

      timelog.days.forEach((day, index) => {
        const amountHours = Math.round(calculateTotalHours([day]) * me.rate);
        const amountMeals = Math.round(calculateMealAllowance([day], { enabled: Boolean(event?.mealAllowanceEnabled) }));
        const amountKm = index === 0 ? Math.round(timelog.km * KM_RATE) : 0;

        addAmount(day.d, amountHours + amountMeals + amountKm);
      });
    });

    return Object.entries(data)
      .map(([name, { total, date }]) => ({ name, total, date }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [myTimelogs, chartPeriod, me, findEvent]);

  const filteredData = useMemo(() => {
    if (!searchQuery) {
      return {
        drafts: categorized.drafts,
        processing: categorized.processing,
        invoiced: categorized.invoiced,
      };
    }

    const query = searchQuery.toLowerCase();

    const filterShifts = (list: typeof myTimelogs) => list.filter((timelog) => {
      const event = findEvent(timelog.eid);
      const project = projects.find((item) => item.id === event?.job);
      return (
        event?.name.toLowerCase().includes(query)
        || project?.id.toLowerCase().includes(query)
        || project?.client.toLowerCase().includes(query)
      );
    });

    return {
      drafts: filterShifts(categorized.drafts),
      processing: filterShifts(categorized.processing),
      invoiced: filterShifts(categorized.invoiced),
    };
  }, [searchQuery, categorized, findEvent, projects]);

  const openEventDetail = (event: Event) => {
    setCurrentTab('events');
    setSelectedEventId(event.supabaseId ?? event.id);
    setEventTab('overview');
  };

  const openTimelogResolution = (timelog: Timelog) => {
    setTimelogFilter(timelog.status);
    setEditingTimelog(timelog);
  };

  const nextShift = useMemo(() => (
    categorized.upcoming
      .flatMap((timelog) => {
        const event = findEvent(timelog.eid);
        const project = resolveShiftProject(event, projects);
        if (!event || !project) return [];

        return [{
          timelog,
          event,
          project,
          hours: calculateTotalHours(timelog.days),
        }];
      })
      .sort((a, b) => {
        const firstDate = `${a.event.startDate}T${a.event.startTime ?? a.timelog.days[0]?.f ?? '00:00'}`;
        const secondDate = `${b.event.startDate}T${b.event.startTime ?? b.timelog.days[0]?.f ?? '00:00'}`;

        return firstDate.localeCompare(secondDate);
      })[0] ?? null
  ), [categorized.upcoming, findEvent, projects]);

  const actionRequiredTimelogs = useMemo(() => (
    myTimelogs
      .filter((timelog) => timelog.status === 'rejected' || timelog.status === 'pending_crew_confirmation')
      .flatMap((timelog) => {
        const event = findEvent(timelog.eid);
        const project = resolveShiftProject(event, projects);
        if (!event || !project) return [];

        return [{
          timelog,
          event,
          project,
          hours: calculateTotalHours(timelog.days),
          changeSummary: buildTimelogChangeSummary(timelog),
        }];
      })
      .sort((a, b) => {
        if (a.timelog.status !== b.timelog.status) {
          return a.timelog.status === 'rejected' ? -1 : 1;
        }

        return a.event.startDate.localeCompare(b.event.startDate);
      })
  ), [findEvent, myTimelogs, projects]);

  const overviewStats = [
    {
      label: 'Vyděláno',
      value: formatCurrency(stats.earnedAmount),
      sub: 'Finálně schváleno',
      icon: WalletCards,
      tone: 'info',
      targetTab: 'invoiced' as const,
    },
    {
      label: 'Ke schválení',
      value: formatCurrency(stats.pendingApprovalAmount),
      sub: 'Čeká na kontrolu',
      icon: CheckCircle2,
      tone: 'warning',
      targetTab: 'processing' as const,
    },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="nodu-my-shifts-shell">
      <div className="nodu-my-shifts-hero">
        <div className="min-w-0">
          <div className="nodu-my-shifts-kicker">Crew</div>
          <h1 className="nodu-my-shifts-title">Přehled</h1>
          <p className="nodu-my-shifts-lead">Vítejte zpět, {displayName}</p>
        </div>
        <MobileSettingsButton />
      </div>

      <section className="nodu-my-shifts-next-card" aria-labelledby="my-shifts-next-title">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="nodu-my-shifts-kicker">Nejbližší směna</div>
            <h2 id="my-shifts-next-title" className="nodu-my-shifts-next-title">
              {nextShift ? nextShift.event.name : 'Zatím žádná směna'}
            </h2>
            <p className="nodu-my-shifts-next-sub">
              {nextShift ? nextShift.project.client : 'Nové možnosti najdete v akcích.'}
            </p>
          </div>
          {nextShift && (
            <span className="nodu-my-shifts-job-chip">{nextShift.project.id}</span>
          )}
        </div>

        {nextShift ? (
          <>
            <div className="nodu-my-shifts-next-meta">
              <span>
                <Calendar size={15} aria-hidden="true" />
                {formatShortDate(nextShift.event.startDate)} · {nextShift.event.startTime ?? nextShift.timelog.days[0]?.f}
              </span>
              <span>
                <Clock size={15} aria-hidden="true" />
                {nextShift.hours.toFixed(1)} h v evidenci
              </span>
            </div>
            <button type="button" className="nodu-my-shifts-primary-action" onClick={() => openEventDetail(nextShift.event)}>
              Otevřít akci <ArrowRight size={16} aria-hidden="true" />
            </button>
          </>
        ) : (
          <button type="button" className="nodu-my-shifts-primary-action" onClick={() => setCurrentTab('events')}>
            Procházet akce <ArrowRight size={16} aria-hidden="true" />
          </button>
        )}
      </section>

      {actionRequiredTimelogs.length > 0 && (
        <section className="nodu-my-shifts-action-panel" aria-labelledby="my-shifts-action-title">
          <div className="nodu-my-shifts-action-header">
            <div className="nodu-my-shifts-action-icon">
              <AlertCircle size={18} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="nodu-my-shifts-kicker">Vyžaduje akci</div>
              <h2 id="my-shifts-action-title">Výkazy k dořešení</h2>
            </div>
            <span>{actionRequiredTimelogs.length}</span>
          </div>
          <p className="nodu-my-shifts-action-copy">{formatActionRequiredCount(actionRequiredTimelogs.length)}</p>
          <div className="nodu-my-shifts-action-list">
            {actionRequiredTimelogs.map(({ timelog, event, project, hours, changeSummary }) => {
              const returnedReason = timelog.reviewNote?.trim() || '';

              return (
                <button
                key={timelog.id}
                type="button"
                className="nodu-my-shifts-action-row"
                aria-label={timelog.status === 'rejected' ? `Otevřít vrácený výkaz ${event.name}` : `Otevřít výkaz k potvrzení ${event.name}`}
                onClick={() => openTimelogResolution(timelog)}
              >
                <div className="min-w-0">
                  <div className="nodu-my-shifts-action-row-title">{event.name}</div>
                  <div className="nodu-my-shifts-action-row-meta">
                    {formatActionRequiredEventDate(event)}
                  </div>
                  <div className="nodu-my-shifts-action-row-meta">
                    {project.client} · {hours.toFixed(1)} h
                  </div>
                  {timelog.status === 'rejected' && returnedReason && (
                    <div className="nodu-my-shifts-action-row-note">{returnedReason}</div>
                  )}
                  {timelog.status === 'pending_crew_confirmation' && changeSummary[0] && (
                    <div className="nodu-my-shifts-action-row-note">{changeSummary[0]}</div>
                  )}
                </div>
                <span>{getActionRequiredLabel(timelog.status)}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <div className="nodu-my-shifts-stats-grid">
        {overviewStats.map((stat) => (
          <button
            key={stat.label}
            type="button"
            className={`nodu-my-shifts-stat-card nodu-my-shifts-stat-card--${stat.tone}`}
            aria-label={`${stat.label}: ${stat.value}. ${stat.sub}`}
            onClick={() => setActiveTab(stat.targetTab)}
          >
            <div className="nodu-my-shifts-stat-topline">
              <div className="nodu-my-shifts-stat-icon">
                <stat.icon size={17} aria-hidden="true" />
              </div>
              <span>{stat.label}</span>
            </div>
            <div className="nodu-my-shifts-stat-value">{stat.value}</div>
            <p>{stat.sub}</p>
          </button>
        ))}
      </div>

      <section className="nodu-my-shifts-list-panel" aria-labelledby="my-shifts-list-title">
        <div className="nodu-my-shifts-section-header">
          <div>
            <div className="nodu-my-shifts-kicker">Workflow</div>
            <h2 id="my-shifts-list-title">Výkazy</h2>
          </div>
        </div>

        <div className="nodu-my-shifts-tabs">
          {[
            { id: 'drafts' as const, lbl: 'Rozpracované', count: categorized.drafts.length },
            { id: 'processing' as const, lbl: 'Ke kontrole', count: categorized.processing.length },
            { id: 'invoiced' as const, lbl: 'Vyúčtované', count: categorized.invoiced.length },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`nodu-my-shifts-tab ${activeTab === tab.id ? 'nodu-my-shifts-tab--active' : ''}`}
            >
              {tab.lbl}
              {tab.count > 0 && <span>{tab.count}</span>}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div key={activeTab} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="nodu-my-shifts-card-grid">
            {filteredData[activeTab].map((timelog) => {
              const event = findEvent(timelog.eid);
              const project = resolveShiftProject(event, projects);
              if (!event || !project) return null;
              return <ShiftCard key={timelog.id} timelog={timelog} event={event} project={project} onClick={() => openEventDetail(event)} />;
            })}
            {filteredData[activeTab].length === 0 && <div className="nodu-my-shifts-empty">{searchQuery ? 'Nebyly nalezeny žádné výsledky' : 'Žádné záznamy'}</div>}
          </motion.div>
        </AnimatePresence>
      </section>

      <div className="nodu-my-shifts-billing-panel">
        <div className="mb-6 flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--nodu-text)]">Příjmy za období</h2>
            <p className="text-xs text-[var(--nodu-text-soft)]">Přehled vašich příjmů</p>
          </div>
          <div className="flex gap-1 rounded-xl border border-[var(--nodu-border)] bg-white p-1">
            {(['month', 'quarter', 'year'] as const).map((period) => (
              <button key={period} onClick={() => setChartPeriod(period)} className={`rounded-lg px-3 py-1.5 text-[10px] font-bold uppercase transition-all ${chartPeriod === period ? 'bg-[var(--nodu-accent)] text-white shadow-sm' : 'text-[var(--nodu-text-soft)] hover:bg-[var(--nodu-accent-soft)] hover:text-[var(--nodu-text)]'}`}>
                {period === 'month' ? 'Měsíce' : period === 'quarter' ? 'Kvartály' : 'Roky'}
              </button>
            ))}
          </div>
        </div>
        <div className="h-[250px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={darkMode ? '#1f2937' : '#f3f4f6'} />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9ca3af' }} dy={10} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={(value) => `${value / 1000}k`} />
              <Tooltip cursor={{ fill: darkMode ? '#111827' : '#f9fafb' }} contentStyle={{ backgroundColor: darkMode ? '#111827' : '#fff', border: 'none', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }} formatter={(value: number) => [formatCurrency(value), 'Příjem']} />
              <Bar dataKey="total" fill="var(--nodu-accent)" radius={[4, 4, 0, 0]} barSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </motion.div>
  );
};

export default MyShiftsView;
