import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Clock, MapPin, Receipt } from 'lucide-react';
import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, parseISO, subMonths } from 'date-fns';
import { useAppContext } from '../context/useAppContext';
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

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
      <button onClick={() => setSelectedClientIdForStats(null)} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 mb-4 transition-colors">
        <ArrowLeft size={14} /> Zpet na Klienty
      </button>

      <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm mb-6">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-1">{client.name}</h1>
            <p className="text-sm text-gray-500">{client.city || '—'} {client.ico ? `· ICO: ${client.ico}` : ''}</p>
          </div>
          <div className="flex gap-1 bg-gray-50 p-1 rounded-lg border border-gray-100">
            {(['1M', '3M', '6M', '1R', 'all'] as const).map((range) => (
              <button key={range} onClick={() => setDateRange(range)} className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all ${dateRange === range ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>
                {range === 'all' ? 'Vse' : range}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100"><div className="flex items-center gap-2 mb-2"><Receipt size={14} className="text-emerald-600" /><span className="text-[9px] font-bold text-emerald-700 uppercase">Naklady Crew</span></div><div className="text-lg font-bold text-emerald-900">{formatCurrency(totalCost)}</div></div>
          <div className="bg-blue-50 rounded-xl p-4 border border-blue-100"><div className="flex items-center gap-2 mb-2"><Clock size={14} className="text-blue-600" /><span className="text-[9px] font-bold text-blue-700 uppercase">Hodiny</span></div><div className="text-lg font-bold text-blue-900">{totalHours.toFixed(1)}h</div></div>
          <div className="bg-amber-50 rounded-xl p-4 border border-amber-100"><div className="flex items-center gap-2 mb-2"><MapPin size={14} className="text-amber-600" /><span className="text-[9px] font-bold text-amber-700 uppercase">Kilometry</span></div><div className="text-lg font-bold text-amber-900">{totalKm} km</div></div>
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-100"><span className="text-[9px] font-bold text-gray-700 uppercase">Akci celkem</span><div className="text-lg font-bold text-gray-900 mt-2">{clientEvents.length}</div></div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
            <div className="flex justify-between items-center mb-4">
              <div className="flex gap-1 bg-white p-0.5 rounded-lg border border-gray-100">
                <button onClick={() => setChartMode('time')} className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${chartMode === 'time' ? 'bg-emerald-50 text-emerald-700 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>Naklady v case</button>
                <button onClick={() => setChartMode('project')} className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${chartMode === 'project' ? 'bg-emerald-50 text-emerald-700 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>Dle projektu</button>
              </div>
              {chartMode === 'time' && (
                <div className="flex gap-1 bg-white p-0.5 rounded-lg border border-gray-100">
                  {(['month', 'quarter', 'year'] as const).map((period) => (
                    <button key={period} onClick={() => setChartPeriod(period)} className={`px-2 py-1 rounded-md text-[10px] font-bold transition-all ${chartPeriod === period ? 'bg-emerald-50 text-emerald-700 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>
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
                    <Bar dataKey="total" fill="#10b981" radius={[4, 4, 0, 0]} barSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-400 text-xs">Zadna data pro zvolene obdobi</div>
              )}
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
            <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-4">Projekty</h3>
            <div className="space-y-3 max-h-[300px] overflow-y-auto">
              {projects.filter((project) => project.client === client.name).map((project) => {
                const jobEvents = events.filter((event) => event.job === project.id);
                const jobTimelogs = timelogs.filter((timelog) => jobEvents.some((event) => event.id === timelog.eid));
                const jobHours = jobTimelogs.reduce((sum, timelog) => sum + calculateTotalHours(timelog.days), 0);
                const jobKm = jobTimelogs.reduce((sum, timelog) => sum + timelog.km, 0);
                const jobInvoices = invoices.filter((invoice) => invoice.job === project.id);
                const jobRevenue = jobInvoices.reduce((sum, invoice) => sum + invoice.total, 0);

                return (
                  <button key={project.id} onClick={() => handleProjectClick(project.id)} className="w-full text-left p-3 bg-white rounded-xl hover:shadow-md transition-all">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">{project.id}</div>
                        <div className="text-xs font-semibold text-gray-900">{project.name}</div>
                      </div>
                      <div className="text-xs font-bold text-gray-900">{jobRevenue.toLocaleString()} Kc</div>
                    </div>
                    <div className="flex gap-3 text-[10px] text-gray-500">
                      <span className="flex items-center gap-1"><Clock size={10} /> {jobHours.toFixed(1)}h</span>
                      <span className="flex items-center gap-1"><MapPin size={10} /> {jobKm} km</span>
                    </div>
                  </button>
                );
              })}
              {projects.filter((project) => project.client === client.name).length === 0 && (
                <div className="text-center py-10"><div className="text-gray-300 mb-2"><Receipt size={32} className="mx-auto" /></div><p className="text-xs text-gray-500">Zadne projekty u tohoto klienta</p></div>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default ClientStatsView;
