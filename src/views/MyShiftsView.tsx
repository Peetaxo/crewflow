import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Calendar, CheckCircle2, Clock, Receipt, WalletCards } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, parseISO } from 'date-fns';
import { useAuth } from '../app/providers/useAuth';
import { useAppContext } from '../context/useAppContext';
import { Contractor, Event, EventId } from '../types';
import { calculateTotalHours, formatCurrency, formatShortDate } from '../utils';
import StatusBadge from '../components/shared/StatusBadge';
import { useEventsQuery } from '../features/events/queries/useEventsQuery';
import ShiftCard from '../components/shared/ShiftCard';
import { useTimelogsQuery } from '../features/timelogs/queries/useTimelogsQuery';
import { getProjects, subscribeToProjectChanges } from '../features/projects/services/projects.service';
import { getContractors, subscribeToCrewChanges } from '../features/crew/services/crew.service';
import { useInvoicesQuery } from '../features/invoices/queries/useInvoicesQuery';
import { categorizeCrewTimelogs, resolveShiftProject } from '../features/crew/services/crew-shift-display';
import MobileSettingsButton from '../components/layout/MobileSettingsButton';

const MyShiftsView = () => {
  const { darkMode, searchQuery, setCurrentTab, setEventTab, setSelectedEventId } = useAppContext();
  const { currentProfileId, profile } = useAuth();
  const eventsQuery = useEventsQuery();
  const timelogsQuery = useTimelogsQuery();
  const invoicesQuery = useInvoicesQuery();
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [projects, setProjects] = useState(() => getProjects() ?? []);
  const me = contractors.find((item) => item.profileId === currentProfileId) ?? null;
  const [activeTab, setActiveTab] = useState<'upcoming' | 'processing' | 'invoiced' | 'invoices'>('upcoming');
  const [chartPeriod, setChartPeriod] = useState<'month' | 'quarter' | 'year'>('month');

  const loadData = useCallback(() => {
    setContractors(getContractors() ?? []);
  }, []);

  useEffect(() => {
    loadData();
  }, [eventsQuery.data, invoicesQuery.data, loadData, timelogsQuery.data]);

  useEffect(() => subscribeToCrewChanges(loadData), [loadData]);
  useEffect(() => subscribeToProjectChanges(() => setProjects(getProjects() ?? [])), []);
  const events = useMemo(() => eventsQuery.data ?? [], [eventsQuery.data]);
  const findEvent = useCallback((eventId: EventId) => (
    events.find((event) => event.id === eventId || event.supabaseId === eventId) ?? null
  ), [events]);
  const timelogs = timelogsQuery.data ?? [];
  const invoices = invoicesQuery.data ?? [];
  const meProfileId = currentProfileId ?? me?.profileId ?? null;
  const displayName = me?.name || [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || 'Crew';
  const myTimelogs = timelogs.filter((timelog) => timelog.contractorProfileId === meProfileId);
  const myInvoices = invoices.filter((invoice) => invoice.contractorProfileId === meProfileId);

  const categorized = useMemo(() => categorizeCrewTimelogs(myTimelogs, events), [myTimelogs, events]);

  const stats = useMemo(() => ({
    totalEarned: myInvoices.filter((invoice) => invoice.status === 'paid').reduce((sum, invoice) => sum + invoice.total, 0),
    toPay: myInvoices.filter((invoice) => invoice.status === 'sent').reduce((sum, invoice) => sum + invoice.total, 0),
    pendingHours: categorized.processing.reduce((sum, timelog) => sum + calculateTotalHours(timelog.days), 0),
    totalHours: categorized.invoiced.reduce((sum, timelog) => sum + calculateTotalHours(timelog.days), 0),
  }), [myInvoices, categorized]);

  const chartData = useMemo(() => {
    const data: Record<string, { total: number; date: Date }> = {};

    myInvoices.forEach((invoice) => {
      if (!invoice.sentAt) return;

      const date = parseISO(invoice.sentAt);
      let key: string;
      let sortDate: Date;

      if (chartPeriod === 'month') {
        key = format(date, 'MMM yyyy');
        sortDate = new Date(date.getFullYear(), date.getMonth(), 1);
      } else if (chartPeriod === 'quarter') {
        const quarter = Math.floor(date.getMonth() / 3);
        key = `Q${quarter + 1} ${date.getFullYear()}`;
        sortDate = new Date(date.getFullYear(), quarter * 3, 1);
      } else {
        key = format(date, 'yyyy');
        sortDate = new Date(date.getFullYear(), 0, 1);
      }

      if (!data[key]) data[key] = { total: 0, date: sortDate };
      data[key].total += invoice.total;
    });

    return Object.entries(data)
      .map(([name, { total, date }]) => ({ name, total, date }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [myInvoices, chartPeriod]);

  const filteredData = useMemo(() => {
    if (!searchQuery) {
      return {
        upcoming: categorized.upcoming,
        processing: categorized.processing,
        invoiced: categorized.invoiced,
        invoices: myInvoices,
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
      upcoming: filterShifts(categorized.upcoming),
      processing: filterShifts(categorized.processing),
      invoiced: filterShifts(categorized.invoiced),
      invoices: myInvoices.filter((invoice) => invoice.id.toLowerCase().includes(query) || invoice.job.toLowerCase().includes(query)),
    };
  }, [searchQuery, categorized, myInvoices, findEvent, projects]);

  const openEventDetail = (event: Event) => {
    setCurrentTab('events');
    setSelectedEventId(event.supabaseId ?? event.id);
    setEventTab('overview');
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

  const overviewStats = [
    {
      label: 'Vyděláno',
      value: formatCurrency(stats.totalEarned),
      sub: 'Proplaceno',
      icon: Receipt,
      tone: 'success',
    },
    {
      label: 'K vyplacení',
      value: formatCurrency(stats.toPay),
      sub: 'Odeslané faktury',
      icon: WalletCards,
      tone: 'info',
    },
    {
      label: 'Ke schválení',
      value: `${stats.pendingHours.toFixed(1)} h`,
      sub: 'Čeká na kontrolu',
      icon: CheckCircle2,
      tone: 'warning',
    },
    {
      label: 'Odpracováno',
      value: `${stats.totalHours.toFixed(1)} h`,
      sub: 'Schváleno',
      icon: Calendar,
      tone: 'neutral',
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

      <div className="nodu-my-shifts-stats-grid">
        {overviewStats.map((stat) => (
          <div key={stat.label} className={`nodu-my-shifts-stat-card nodu-my-shifts-stat-card--${stat.tone}`}>
            <div className="nodu-my-shifts-stat-topline">
              <div className="nodu-my-shifts-stat-icon">
                <stat.icon size={17} aria-hidden="true" />
              </div>
              <span>{stat.label}</span>
            </div>
            <div className="nodu-my-shifts-stat-value">{stat.value}</div>
            <p>{stat.sub}</p>
          </div>
        ))}
      </div>

      <section className="nodu-my-shifts-list-panel" aria-labelledby="my-shifts-list-title">
        <div className="nodu-my-shifts-section-header">
          <div>
            <div className="nodu-my-shifts-kicker">Workflow</div>
            <h2 id="my-shifts-list-title">Směny a výkazy</h2>
          </div>
        </div>

        <div className="nodu-my-shifts-tabs">
          {[
            { id: 'upcoming' as const, lbl: 'Nadcházející', count: categorized.upcoming.length },
            { id: 'processing' as const, lbl: 'Zpracování', count: categorized.processing.length },
            { id: 'invoiced' as const, lbl: 'Vyúčtované', count: categorized.invoiced.length },
            { id: 'invoices' as const, lbl: 'Moje faktury', count: myInvoices.length },
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
          {activeTab !== 'invoices' ? (
            <motion.div key={activeTab} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="nodu-my-shifts-card-grid">
              {filteredData[activeTab].map((timelog) => {
                const event = findEvent(timelog.eid);
                const project = resolveShiftProject(event, projects);
                if (!event || !project) return null;
                return <ShiftCard key={timelog.id} timelog={timelog} event={event} project={project} onClick={() => openEventDetail(event)} />;
              })}
              {filteredData[activeTab].length === 0 && <div className="nodu-my-shifts-empty">{searchQuery ? 'Nebyly nalezeny žádné výsledky' : 'Žádné záznamy'}</div>}
            </motion.div>
          ) : (
            <motion.div key="invoices" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="space-y-3">
              {filteredData.invoices.map((invoice) => (
                <div key={invoice.id} className="nodu-my-shifts-invoice-row">
                  <div className="flex items-center gap-3">
                    <div className="nodu-my-shifts-invoice-icon"><Receipt size={18} aria-hidden="true" /></div>
                    <div>
                      <div className="text-xs font-bold text-[var(--nodu-text)]">{invoice.id}</div>
                      <div className="text-[10px] text-[var(--nodu-text-soft)]">{invoice.job} · {invoice.sentAt ? formatShortDate(invoice.sentAt) : '-'}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-xs font-bold text-[var(--nodu-text)]">{formatCurrency(invoice.total)}</div>
                      <div className="text-[10px] text-[var(--nodu-text-soft)]">{invoice.hours}h + {invoice.km}km</div>
                    </div>
                    <StatusBadge status={invoice.status} />
                  </div>
                </div>
              ))}
              {filteredData.invoices.length === 0 && <div className="nodu-my-shifts-empty">{searchQuery ? 'Nebyly nalezeny žádné výsledky' : 'Zatím žádné faktury'}</div>}
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <div className="nodu-my-shifts-billing-panel">
        <div className="mb-6 flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--nodu-text)]">Fakturace za dané období</h2>
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
              <Tooltip cursor={{ fill: darkMode ? '#111827' : '#f9fafb' }} contentStyle={{ backgroundColor: darkMode ? '#111827' : '#fff', border: 'none', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }} formatter={(value: number) => [formatCurrency(value), 'Fakturovano']} />
              <Bar dataKey="total" fill="var(--nodu-accent)" radius={[4, 4, 0, 0]} barSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </motion.div>
  );
};

export default MyShiftsView;
