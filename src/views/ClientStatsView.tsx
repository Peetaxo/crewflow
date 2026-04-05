import React, { useState, useMemo } from 'react';
import { ArrowLeft, Clock, MapPin, Receipt } from 'lucide-react';
import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, parseISO, subMonths } from 'date-fns';
import { useAppContext } from '../context/AppContext';
import { calculateTotalHours, formatCurrency } from '../utils';
import { KM_RATE } from '../data';

/** Statistiky klienta */
const ClientStatsView = () => {
  const {
    selectedClientIdForStats, setSelectedClientIdForStats,
    clients, events, timelogs, invoices, projects,
    setCurrentTab, setSelectedProjectIdForStats,
    findContractor, darkMode,
  } = useAppContext();

  const client = clients.find(c => c.id === selectedClientIdForStats);

  /* Filtr časového rozsahu */
  const [dateRange, setDateRange] = useState<'1M' | '3M' | '6M' | '1R' | 'all'>('all');
  /* Přepínání grafu */
  const [chartMode, setChartMode] = useState<'time' | 'project'>('time');
  const [chartPeriod, setChartPeriod] = useState<'month' | 'quarter' | 'year'>('month');

  const now = new Date();
  const rangeStart = useMemo(() => {
    if (dateRange === '1M') return subMonths(now, 1);
    if (dateRange === '3M') return subMonths(now, 3);
    if (dateRange === '6M') return subMonths(now, 6);
    if (dateRange === '1R') return subMonths(now, 12);
    return null;
  }, [dateRange]);

  const clientEvents = events.filter(e => client ? e.client === client.name : false);
  const clientTimelogs = timelogs.filter(t => clientEvents.some(e => e.id === t.eid));
  const clientInvoices = useMemo(() => {
    let inv = invoices.filter(i => clientEvents.some(e => e.id === i.eid));
    if (rangeStart) {
      inv = inv.filter(i => i.sentAt && parseISO(i.sentAt) >= rangeStart);
    }
    return inv;
  }, [invoices, clientEvents, rangeStart]);

  const filteredTimelogs = useMemo(() => {
    if (!rangeStart) return clientTimelogs;
    return clientTimelogs.filter(t => {
      const ev = events.find(e => e.id === t.eid);
      return ev && ev.startDate && parseISO(ev.startDate) >= rangeStart;
    });
  }, [clientTimelogs, rangeStart, events]);

  const totalCost = clientInvoices.reduce((sum, i) => sum + i.total, 0);
  const totalHours = filteredTimelogs.reduce((sum, t) => sum + calculateTotalHours(t.days), 0);
  const totalKm = filteredTimelogs.reduce((sum, t) => sum + t.km, 0);

  /* Data pro sloupcový graf — Náklady v čase */
  const timeChartData = useMemo(() => {
    const data: Record<string, { total: number; date: Date }> = {};
    clientInvoices.forEach(inv => {
      if (!inv.sentAt) return;
      const date = parseISO(inv.sentAt);
      let key: string, sortDate: Date;
      if (chartPeriod === 'month') { key = format(date, 'MMM yyyy'); sortDate = new Date(date.getFullYear(), date.getMonth(), 1); }
      else if (chartPeriod === 'quarter') { const q = Math.floor(date.getMonth() / 3); key = `Q${q+1} ${date.getFullYear()}`; sortDate = new Date(date.getFullYear(), q*3, 1); }
      else { key = format(date, 'yyyy'); sortDate = new Date(date.getFullYear(), 0, 1); }
      if (!data[key]) data[key] = { total: 0, date: sortDate };
      data[key].total += inv.total;
    });
    return Object.entries(data).map(([name, { total, date }]) => ({ name, total, date })).sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [clientInvoices, chartPeriod]);

  /* Data pro sloupcový graf — Náklady dle projektu */
  const projectChartData = useMemo(() => {
    if (!client) return [];
    const clientProjects = projects.filter(p => p.client === client.name);
    return clientProjects.map(p => {
      const pInvoices = clientInvoices.filter(i => i.job === p.id);
      return { name: p.name.length > 20 ? p.name.slice(0, 20) + '…' : p.name, total: pInvoices.reduce((s, i) => s + i.total, 0), projectId: p.id };
    }).filter(d => d.total > 0);
  }, [clientInvoices, projects, client]);

  const chartData = chartMode === 'time' ? timeChartData : projectChartData;

  /** Klik na projekt → přesměrovat do sekce Projekty */
  const handleProjectClick = (projectId: string) => {
    setSelectedClientIdForStats(null);
    setSelectedProjectIdForStats(projectId);
    setCurrentTab('projects');
  };

  if (!client) return null;

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
      <button onClick={() => setSelectedClientIdForStats(null)} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 mb-4 transition-colors">
        <ArrowLeft size={14} /> Zpět na Klienty
      </button>

      <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm mb-6">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-1">{client.name}</h1>
            <p className="text-sm text-gray-500">{client.city || '—'} {client.ico ? `· IČO: ${client.ico}` : ''}</p>
          </div>
          {/* Filtr časového rozsahu */}
          <div className="flex gap-1 bg-gray-50 p-1 rounded-lg border border-gray-100">
            {(['1M', '3M', '6M', '1R', 'all'] as const).map(r => (
              <button key={r} onClick={() => setDateRange(r)} className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all ${dateRange === r ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>
                {r === 'all' ? 'Vše' : r}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
            <div className="flex items-center gap-2 mb-2">
              <Receipt size={14} className="text-emerald-600" />
              <span className="text-[9px] font-bold text-emerald-700 uppercase">Náklady Crew</span>
            </div>
            <div className="text-lg font-bold text-emerald-900">{formatCurrency(totalCost)}</div>
          </div>
          <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
            <div className="flex items-center gap-2 mb-2">
              <Clock size={14} className="text-blue-600" />
              <span className="text-[9px] font-bold text-blue-700 uppercase">Hodiny</span>
            </div>
            <div className="text-lg font-bold text-blue-900">{totalHours.toFixed(1)}h</div>
          </div>
          <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
            <div className="flex items-center gap-2 mb-2">
              <MapPin size={14} className="text-amber-600" />
              <span className="text-[9px] font-bold text-amber-700 uppercase">Kilometry</span>
            </div>
            <div className="text-lg font-bold text-amber-900">{totalKm} km</div>
          </div>
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
            <span className="text-[9px] font-bold text-gray-700 uppercase">Akcí celkem</span>
            <div className="text-lg font-bold text-gray-900 mt-2">{clientEvents.length}</div>
          </div>
        </div>

        {/* Sloupcový graf + Projekty vedle sebe */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Sloupcový graf */}
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
            <div className="flex justify-between items-center mb-4">
              <div className="flex gap-1 bg-white p-0.5 rounded-lg border border-gray-100">
                <button onClick={() => setChartMode('time')} className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${chartMode === 'time' ? 'bg-emerald-50 text-emerald-700 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>
                  Náklady v čase
                </button>
                <button onClick={() => setChartMode('project')} className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${chartMode === 'project' ? 'bg-emerald-50 text-emerald-700 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>
                  Dle projektu
                </button>
              </div>
              {chartMode === 'time' && (
                <div className="flex gap-1 bg-white p-0.5 rounded-lg border border-gray-100">
                  {(['month', 'quarter', 'year'] as const).map(p => (
                    <button key={p} onClick={() => setChartPeriod(p)} className={`px-2 py-1 rounded-md text-[10px] font-bold transition-all ${chartPeriod === p ? 'bg-emerald-50 text-emerald-700 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>
                      {p === 'month' ? 'Měsíce' : p === 'quarter' ? 'Kvartály' : 'Roky'}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="h-[250px]">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={darkMode ? "#1f2937" : "#f3f4f6"} />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9ca3af' }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={(v) => `${v/1000}k`} />
                    <Tooltip cursor={{ fill: darkMode ? "#111827" : "#f9fafb" }} contentStyle={{ backgroundColor: darkMode ? '#111827' : '#fff', border: 'none', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }} formatter={(v: number) => [formatCurrency(v), 'Náklady']} />
                    <Bar dataKey="total" fill="#10b981" radius={[4, 4, 0, 0]} barSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-400 text-xs">Žádná data pro zvolené období</div>
              )}
            </div>
          </div>

          {/* Projekty klienta */}
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
            <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-4">Projekty</h3>
            <div className="space-y-3 max-h-[300px] overflow-y-auto">
              {projects.filter(p => p.client === client.name).map(project => {
                const jobEvents = events.filter(e => e.job === project.id);
                const jobTimelogs = timelogs.filter(t => jobEvents.some(e => e.id === t.eid));
                const jobHours = jobTimelogs.reduce((s, t) => s + calculateTotalHours(t.days), 0);
                const jobKm = jobTimelogs.reduce((s, t) => s + t.km, 0);
                const jobInvoices = invoices.filter(i => i.job === project.id);
                const jobRevenue = jobInvoices.reduce((s, i) => s + i.total, 0);

                return (
                  <button key={project.id} onClick={() => handleProjectClick(project.id)} className="w-full text-left p-3 bg-white rounded-xl hover:shadow-md transition-all">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">{project.id}</div>
                        <div className="text-xs font-semibold text-gray-900">{project.name}</div>
                      </div>
                      <div className="text-xs font-bold text-gray-900">{jobRevenue.toLocaleString()} Kč</div>
                    </div>
                    <div className="flex gap-3 text-[10px] text-gray-500">
                      <span className="flex items-center gap-1"><Clock size={10} /> {jobHours.toFixed(1)}h</span>
                      <span className="flex items-center gap-1"><MapPin size={10} /> {jobKm} km</span>
                    </div>
                  </button>
                );
              })}
              {projects.filter(p => p.client === client.name).length === 0 && (
                <div className="text-center py-10">
                  <div className="text-gray-300 mb-2"><Receipt size={32} className="mx-auto" /></div>
                  <p className="text-xs text-gray-500">Žádné projekty u tohoto klienta</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default ClientStatsView;
