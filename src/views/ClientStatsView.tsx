import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Clock, MapPin, Receipt } from 'lucide-react';
import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, parseISO, subMonths } from 'date-fns';
import { useAppContext } from '../context/AppContext';
import { Contractor, Event, Timelog } from '../types';
import { calculateTotalHours, formatCurrency } from '../utils';
import { getTimelogDependencies, getTimelogs, subscribeToTimelogChanges } from '../features/timelogs/services/timelogs.service';
import { getClientById, getClientDependencies, subscribeToClientChanges } from '../features/clients/services/clients.service';

const ClientStatsView = () => {
  const {
    selectedClientIdForStats,
    setSelectedClientIdForStats,
    setCurrentTab,
    setSelectedProjectIdForStats,
    darkMode,
  } = useAppContext();

  const [client, setClient] = useState(() => getClientById(selectedClientIdForStats));
  const [events, setEvents] = useState<Event[]>([]);
  const [invoices, setInvoices] = useState<ReturnType<typeof getClientDependencies>['invoices']>([]);
  const [projects, setProjects] = useState<ReturnType<typeof getClientDependencies>['projects']>([]);
  const [timelogs, setTimelogs] = useState<Timelog[]>([]);
  const [contractors, setContractors] = useState<Contractor[]>([]);

  const loadData = useCallback(() => {
    setClient(getClientById(selectedClientIdForStats));
    const clientDependencies = getClientDependencies();
    setEvents(clientDependencies.events);
    setInvoices(clientDependencies.invoices);
    setProjects(clientDependencies.projects);
    setTimelogs(getTimelogs());
    setContractors(getTimelogDependencies().contractors);
  }, [selectedClientIdForStats]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => subscribeToClientChanges(loadData), [loadData]);
  useEffect(() => subscribeToTimelogChanges(loadData), [loadData]);

  const [dateRange, setDateRange] = useState<'1M' | '3M' | '6M' | '1R' | 'all'>('all');
  const [chartMode, setChartMode] = useState<'time' | 'project'>('time');
  const [chartPeriod, setChartPeriod] = useState<'month' | 'quarter' | 'year'>('month');

  const rangeStart = useMemo(() => {
    const now = new Date();
    if (dateRange === '1M') return subMonths(now, 1);
    if (dateRange === '3M') return subMonths(now, 3);
    if (dateRange === '6M') return subMonths(now, 6);
    if (dateRange === '1R') return subMonths(now, 12);
    return null;
  }, [dateRange]);

  const clientEvents = useMemo(() => (
    events.filter((event) => client ? event.client === client.name : false)
  ), [events, client]);
  const clientTimelogs = useMemo(() => (
    timelogs.filter((timelog) => clientEvents.some((event) => event.id === timelog.eid))
  ), [timelogs, clientEvents]);
  const clientInvoices = useMemo(() => {
    let result = invoices.filter((invoice) => clientEvents.some((event) => event.id === invoice.eid));
    if (rangeStart) {
      result = result.filter((invoice) => invoice.sentAt && parseISO(invoice.sentAt) >= rangeStart);
    }
    return result;
  }, [invoices, clientEvents, rangeStart]);

  const filteredTimelogs = useMemo(() => {
    if (!rangeStart) return clientTimelogs;
    return clientTimelogs.filter((timelog) => {
      const event = events.find((item) => item.id === timelog.eid);
      return event && event.startDate && parseISO(event.startDate) >= rangeStart;
    });
  }, [clientTimelogs, rangeStart, events]);

  const totalCost = clientInvoices.reduce((sum, invoice) => sum + invoice.total, 0);
  const totalHours = filteredTimelogs.reduce((sum, timelog) => sum + calculateTotalHours(timelog.days), 0);
  const totalKm = filteredTimelogs.reduce((sum, timelog) => sum + timelog.km, 0);

  const timeChartData = useMemo(() => {
    const data: Record<string, { total: number; date: Date }> = {};
    clientInvoices.forEach((invoice) => {
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

    return Object.entries(data).map(([name, { total, date }]) => ({ name, total, date })).sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [clientInvoices, chartPeriod]);

  const projectChartData = useMemo(() => {
    if (!client) return [];
    return projects
      .filter((project) => project.client === client.name)
      .map((project) => {
        const projectInvoices = clientInvoices.filter((invoice) => invoice.job === project.id);
        return {
          name: project.name.length > 20 ? `${project.name.slice(0, 20)}...` : project.name,
          total: projectInvoices.reduce((sum, invoice) => sum + invoice.total, 0),
          projectId: project.id,
        };
      })
      .filter((item) => item.total > 0);
  }, [clientInvoices, projects, client]);

  const chartData = chartMode === 'time' ? timeChartData : projectChartData;

  const handleProjectClick = (projectId: string) => {
    setSelectedClientIdForStats(null);
    setSelectedProjectIdForStats(projectId);
    setCurrentTab('projects');
  };

  if (!client) return null;

  const statCards = [
    {
      label: 'Naklady Crew',
      value: formatCurrency(totalCost),
      icon: Receipt,
      tone: 'success',
    },
    {
      label: 'Hodiny',
      value: `${totalHours.toFixed(1)}h`,
      icon: Clock,
      tone: 'info',
    },
    {
      label: 'Kilometry',
      value: `${totalKm} km`,
      icon: MapPin,
      tone: 'warning',
    },
    {
      label: 'Akci celkem',
      value: String(clientEvents.length),
      icon: Receipt,
      tone: 'neutral',
    },
  ] as const;

  const getToneClasses = (tone: typeof statCards[number]['tone']) => {
    if (tone === 'success') return 'bg-[var(--nodu-success-bg)] text-[var(--nodu-success-text)]';
    if (tone === 'info') return 'bg-[var(--nodu-info-bg)] text-[var(--nodu-info-text)]';
    if (tone === 'warning') return 'bg-[var(--nodu-warning-bg)] text-[var(--nodu-warning-text)]';
    return 'bg-[rgba(var(--nodu-text-rgb),0.06)] text-[var(--nodu-text-soft)]';
  };

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
      <button onClick={() => setSelectedClientIdForStats(null)} className="mb-4 flex items-center gap-1 text-xs font-medium text-[var(--nodu-text-soft)] transition-colors hover:text-[var(--nodu-accent)]">
        <ArrowLeft size={14} /> Zpet na Klienty
      </button>

      <div className="mb-6 rounded-[28px] border border-[var(--nodu-border)] bg-white p-6 shadow-[0_18px_40px_rgba(var(--nodu-text-rgb),0.06)]">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <div className="nodu-dashboard-kicker">Client detail</div>
            <h1 className="mb-1 text-2xl font-semibold tracking-[-0.03em] text-[var(--nodu-text)]">{client.name}</h1>
            <p className="text-sm text-[var(--nodu-text-soft)]">{client.city || '—'} {client.ico ? `· ICO: ${client.ico}` : ''}</p>
          </div>
          <div className="flex gap-1 rounded-xl border border-[var(--nodu-border)] bg-white p-1 shadow-[0_12px_28px_rgba(var(--nodu-text-rgb),0.06)]">
            {(['1M', '3M', '6M', '1R', 'all'] as const).map((range) => (
              <button key={range} onClick={() => setDateRange(range)} className={`rounded-lg px-3 py-1.5 text-[10px] font-bold uppercase transition-all ${dateRange === range ? 'bg-[var(--nodu-accent)] text-white shadow-sm' : 'text-[var(--nodu-text-soft)] hover:bg-[var(--nodu-accent-soft)] hover:text-[var(--nodu-text)]'}`}>
                {range === 'all' ? 'Vse' : range}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          {statCards.map((item) => (
            <div key={item.label} className="rounded-[22px] border border-[var(--nodu-border)] bg-white p-4 shadow-[0_14px_30px_rgba(var(--nodu-text-rgb),0.05)]">
              <div className="mb-2 flex items-center gap-2">
                <div className={`rounded-xl p-2 ${getToneClasses(item.tone)}`}>
                  <item.icon size={14} />
                </div>
                <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--nodu-text-soft)]">{item.label}</span>
              </div>
              <div className="text-lg font-bold text-[var(--nodu-text)]">{item.value}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-[24px] border border-[var(--nodu-border)] bg-[var(--nodu-paper-strong)] p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex gap-1 rounded-xl border border-[var(--nodu-border)] bg-white p-1">
                <button onClick={() => setChartMode('time')} className={`rounded-lg px-3 py-1.5 text-[10px] font-bold transition-all ${chartMode === 'time' ? 'bg-[var(--nodu-accent)] text-white shadow-sm' : 'text-[var(--nodu-text-soft)] hover:bg-[var(--nodu-accent-soft)] hover:text-[var(--nodu-text)]'}`}>Naklady v case</button>
                <button onClick={() => setChartMode('project')} className={`rounded-lg px-3 py-1.5 text-[10px] font-bold transition-all ${chartMode === 'project' ? 'bg-[var(--nodu-accent)] text-white shadow-sm' : 'text-[var(--nodu-text-soft)] hover:bg-[var(--nodu-accent-soft)] hover:text-[var(--nodu-text)]'}`}>Dle projektu</button>
              </div>
              {chartMode === 'time' && (
                <div className="flex gap-1 rounded-xl border border-[var(--nodu-border)] bg-white p-1">
                  {(['month', 'quarter', 'year'] as const).map((period) => (
                    <button key={period} onClick={() => setChartPeriod(period)} className={`rounded-lg px-2 py-1 text-[10px] font-bold transition-all ${chartPeriod === period ? 'bg-[var(--nodu-accent)] text-white shadow-sm' : 'text-[var(--nodu-text-soft)] hover:bg-[var(--nodu-accent-soft)] hover:text-[var(--nodu-text)]'}`}>
                      {period === 'month' ? 'Mesice' : period === 'quarter' ? 'Kvartaly' : 'Roky'}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="h-[250px]">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={darkMode ? '#1f2937' : '#f3f4f6'} />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9ca3af' }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={(value) => `${value / 1000}k`} />
                    <Tooltip cursor={{ fill: darkMode ? '#111827' : '#f9fafb' }} contentStyle={{ backgroundColor: darkMode ? '#111827' : '#fff', border: 'none', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }} formatter={(value: number) => [formatCurrency(value), 'Naklady']} />
                    <Bar dataKey="total" fill="var(--nodu-accent)" radius={[4, 4, 0, 0]} barSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-[var(--nodu-text-soft)]">Zadna data pro zvolene obdobi</div>
              )}
            </div>
          </div>

          <div className="rounded-[24px] border border-[var(--nodu-border)] bg-[var(--nodu-paper-strong)] p-4">
            <h3 className="mb-4 text-xs font-bold uppercase tracking-[0.14em] text-[var(--nodu-text-soft)]">Projekty</h3>
            <div className="max-h-[300px] space-y-3 overflow-y-auto pr-1">
              {projects.filter((project) => project.client === client.name).map((project) => {
                const jobEvents = events.filter((event) => event.job === project.id);
                const jobTimelogs = timelogs.filter((timelog) => jobEvents.some((event) => event.id === timelog.eid));
                const jobHours = jobTimelogs.reduce((sum, timelog) => sum + calculateTotalHours(timelog.days), 0);
                const jobKm = jobTimelogs.reduce((sum, timelog) => sum + timelog.km, 0);
                const jobInvoices = invoices.filter((invoice) => invoice.job === project.id);
                const jobRevenue = jobInvoices.reduce((sum, invoice) => sum + invoice.total, 0);

                return (
                  <button key={project.id} onClick={() => handleProjectClick(project.id)} className="w-full rounded-2xl border border-[var(--nodu-border)] bg-white p-3 text-left transition-all hover:border-[rgba(var(--nodu-accent-rgb),0.28)] hover:bg-[var(--nodu-accent-soft)] hover:shadow-[0_14px_30px_rgba(var(--nodu-text-rgb),0.08)]">
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <div>
                        <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--nodu-accent)]">{project.id}</div>
                        <div className="text-xs font-semibold text-[var(--nodu-text)]">{project.name}</div>
                      </div>
                      <div className="text-xs font-bold text-[var(--nodu-text)]">{jobRevenue.toLocaleString()} Kc</div>
                    </div>
                    <div className="flex gap-3 text-[10px] text-[var(--nodu-text-soft)]">
                      <span className="flex items-center gap-1"><Clock size={10} /> {jobHours.toFixed(1)}h</span>
                      <span className="flex items-center gap-1"><MapPin size={10} /> {jobKm} km</span>
                    </div>
                  </button>
                );
              })}
              {projects.filter((project) => project.client === client.name).length === 0 && (
                <div className="py-10 text-center"><div className="mb-2 text-[var(--nodu-text-soft)]"><Receipt size={32} className="mx-auto" /></div><p className="text-xs text-[var(--nodu-text-soft)]">Zadne projekty u tohoto klienta</p></div>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default ClientStatsView;
