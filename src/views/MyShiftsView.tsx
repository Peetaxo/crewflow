import React, { useState, useMemo } from 'react';
import { Calendar, Clock, CheckCircle2, Receipt, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, parseISO } from 'date-fns';
import { useAppContext } from '../context/AppContext';
import { calculateTotalHours, formatCurrency, formatShortDate } from '../utils';
import StatusBadge from '../components/shared/StatusBadge';
import ShiftCard from '../components/shared/ShiftCard';

const MyShiftsView = () => {
  const { contractors, timelogs, invoices, events, projects, darkMode } = useAppContext();
  const me = contractors[0];
  if (!me) return null;

  const [activeTab, setActiveTab] = useState<'upcoming' | 'processing' | 'invoiced' | 'invoices'>('upcoming');
  const [chartPeriod, setChartPeriod] = useState<'month' | 'quarter' | 'year'>('month');
  const [localSearch, setLocalSearch] = useState('');

  const myTimelogs = timelogs.filter(t => t.cid === me.id);
  const myInvoices = invoices.filter(i => i.cid === me.id);

  const categorized = useMemo(() => ({
    upcoming: myTimelogs.filter(t => t.status === 'draft'),
    processing: myTimelogs.filter(t => t.status === 'pending_hoc' || t.status === 'pending_coo'),
    invoiced: myTimelogs.filter(t => t.status === 'approved' || t.status === 'invoiced' || t.status === 'paid'),
  }), [myTimelogs]);

  const stats = useMemo(() => ({
    totalEarned: myInvoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.total, 0),
    toPay: myInvoices.filter(i => i.status === 'sent').reduce((s, i) => s + i.total, 0),
    pendingHours: categorized.processing.reduce((s, t) => s + calculateTotalHours(t.days), 0),
    totalHours: categorized.invoiced.reduce((s, t) => s + calculateTotalHours(t.days), 0),
  }), [myInvoices, categorized]);

  const chartData = useMemo(() => {
    const data: Record<string, { total: number; date: Date }> = {};
    myInvoices.forEach(inv => {
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
  }, [myInvoices, chartPeriod]);

  const filteredData = useMemo(() => {
    const q = localSearch.toLowerCase();
    const filterShifts = (list: typeof myTimelogs) => list.filter(t => {
      const ev = events.find(e => e.id === t.eid);
      const pr = projects.find(p => p.id === ev?.job);
      return ev?.name.toLowerCase().includes(q) || pr?.id.toLowerCase().includes(q) || pr?.client.toLowerCase().includes(q);
    });
    return {
      upcoming: filterShifts(categorized.upcoming),
      processing: filterShifts(categorized.processing),
      invoiced: filterShifts(categorized.invoiced),
      invoices: myInvoices.filter(i => i.id.toLowerCase().includes(q) || i.job.toLowerCase().includes(q)),
    };
  }, [localSearch, categorized, myInvoices, events, projects]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div><h1 className="text-xl font-bold text-gray-900">Moje směny</h1><p className="text-sm text-gray-500">Vítejte zpět, {me.name}</p></div>
      </div>

      {/* 1) Statistiky nahoře */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Vyděláno celkem', value: formatCurrency(stats.totalEarned), sub: 'Z proplacených faktur', bg: 'bg-emerald-50 border-emerald-100', icon: Receipt, iconBg: 'bg-emerald-100 text-emerald-700', labelCls: 'text-emerald-700', valueCls: 'text-emerald-900', subCls: 'text-emerald-600' },
          { label: 'K vyplacení', value: formatCurrency(stats.toPay), sub: 'Odeslané faktury', bg: 'bg-blue-50 border-blue-100', icon: Clock, iconBg: 'bg-blue-100 text-blue-700', labelCls: 'text-blue-700', valueCls: 'text-blue-900', subCls: 'text-blue-600' },
          { label: 'Ke schválení', value: `${stats.pendingHours.toFixed(1)} h`, sub: 'Čeká na schválení', bg: 'bg-amber-50 border-amber-100', icon: CheckCircle2, iconBg: 'bg-amber-100 text-amber-700', labelCls: 'text-amber-700', valueCls: 'text-amber-900', subCls: 'text-amber-600' },
          { label: 'Celkem odpracováno', value: `${stats.totalHours.toFixed(1)} h`, sub: 'Schválené směny', bg: 'bg-gray-50 border-gray-100', icon: Calendar, iconBg: 'bg-gray-200 text-gray-700', labelCls: 'text-gray-700', valueCls: 'text-gray-900', subCls: 'text-gray-500' },
        ].map(s => (
          <div key={s.label} className={`${s.bg} border rounded-2xl p-4`}>
            <div className="flex items-center gap-3 mb-2"><div className={`p-2 rounded-lg ${s.iconBg}`}><s.icon size={18} /></div><span className={`text-[10px] font-bold uppercase tracking-wider ${s.labelCls}`}>{s.label}</span></div>
            <div className={`text-2xl font-bold ${s.valueCls}`}>{s.value}</div>
            <p className={`text-[10px] mt-1 ${s.subCls}`}>{s.sub}</p>
          </div>
        ))}
      </div>

      {/* 2) Záložky uprostřed */}
      <div className="space-y-4 mb-6">
        <div className="flex items-center gap-2 bg-white p-1 border border-gray-100 rounded-xl w-fit">
          {[
            { id: 'upcoming' as const, lbl: 'Nadcházející', count: categorized.upcoming.length },
            { id: 'processing' as const, lbl: 'Zpracovává se', count: categorized.processing.length },
            { id: 'invoiced' as const, lbl: 'Vyúčtované', count: categorized.invoiced.length },
            { id: 'invoices' as const, lbl: 'Moje faktury', count: myInvoices.length },
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${activeTab === tab.id ? 'bg-emerald-50 text-emerald-700 shadow-sm' : 'text-gray-500 hover:bg-gray-50'}`}>
              {tab.lbl}
              {tab.count > 0 && <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${activeTab === tab.id ? 'bg-emerald-100' : 'bg-gray-100'}`}>{tab.count}</span>}
            </button>
          ))}
        </div>
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
          <input type="text" placeholder="Hledat v aktuální sekci..." value={localSearch} onChange={(e) => setLocalSearch(e.target.value)} className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-100 rounded-xl text-xs shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all" />
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab !== 'invoices' ? (
          <motion.div key={activeTab} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredData[activeTab].map(t => {
              const ev = events.find(e => e.id === t.eid);
              const pr = projects.find(p => p.id === ev?.job);
              if (!ev || !pr) return null;
              return <ShiftCard key={t.id} timelog={t} event={ev} project={pr} />;
            })}
            {filteredData[activeTab].length === 0 && <div className="col-span-full py-12 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-200 text-sm text-gray-500">{localSearch ? 'Nebyly nalezeny žádné výsledky' : 'Žádné záznamy'}</div>}
          </motion.div>
        ) : (
          <motion.div key="invoices" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="space-y-3">
            {filteredData.invoices.map(inv => (
              <div key={inv.id} className="bg-white border border-gray-100 rounded-xl p-4 flex items-center justify-between shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600"><Receipt size={20} /></div>
                  <div><div className="text-xs font-bold text-gray-900">{inv.id}</div><div className="text-[10px] text-gray-500">{inv.job} • {inv.sentAt ? formatShortDate(inv.sentAt) : '—'}</div></div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right"><div className="text-xs font-bold text-gray-900">{formatCurrency(inv.total)}</div><div className="text-[10px] text-gray-400">{inv.hours}h + {inv.km}km</div></div>
                  <StatusBadge status={inv.status} />
                </div>
              </div>
            ))}
            {filteredData.invoices.length === 0 && <div className="py-12 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-200 text-sm text-gray-500">{localSearch ? 'Nebyly nalezeny žádné výsledky' : 'Zatím žádné faktury'}</div>}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3) Graf dole */}
      <div className="bg-white border border-gray-100 rounded-2xl p-6 mt-8 shadow-sm">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div><h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Fakturace za dané období</h2><p className="text-xs text-gray-500">Přehled vašich příjmů</p></div>
          <div className="flex gap-1 bg-gray-50 p-1 rounded-lg border border-gray-100">
            {(['month', 'quarter', 'year'] as const).map(p => (
              <button key={p} onClick={() => setChartPeriod(p)} className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all ${chartPeriod === p ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>
                {p === 'month' ? 'Měsíce' : p === 'quarter' ? 'Kvartály' : 'Roky'}
              </button>
            ))}
          </div>
        </div>
        <div className="h-[250px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={darkMode ? "#1f2937" : "#f3f4f6"} />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9ca3af' }} dy={10} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={(v) => `${v/1000}k`} />
              <Tooltip cursor={{ fill: darkMode ? "#111827" : "#f9fafb" }} contentStyle={{ backgroundColor: darkMode ? '#111827' : '#fff', border: 'none', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }} formatter={(v: number) => [formatCurrency(v), 'Fakturováno']} />
              <Bar dataKey="total" fill="#10b981" radius={[4, 4, 0, 0]} barSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </motion.div>
  );
};

export default MyShiftsView;
