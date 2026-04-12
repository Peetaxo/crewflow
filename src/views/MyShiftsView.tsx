import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar, Clock, CheckCircle2, Receipt } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, parseISO } from 'date-fns';
import { useAppContext } from '../context/AppContext';
import { ReceiptItem, Timelog } from '../types';
import { calculateTotalHours, formatCurrency, formatShortDate } from '../utils';
import StatusBadge from '../components/shared/StatusBadge';
import ShiftCard from '../components/shared/ShiftCard';
import { getTimelogs, subscribeToTimelogChanges } from '../features/timelogs/services/timelogs.service';
import { getReceipts, subscribeToReceiptChanges } from '../features/receipts/services/receipts.service';
import { getProjects, subscribeToProjectChanges } from '../features/projects/services/projects.service';

const MyShiftsView = () => {
  const { contractors, invoices, events, darkMode, searchQuery } = useAppContext();
  const [timelogs, setTimelogs] = useState<Timelog[]>([]);
  const [receipts, setReceipts] = useState<ReceiptItem[]>([]);
  const [projects, setProjects] = useState(() => getProjects());
  const me = contractors[0];
  if (!me) return null;

  const [activeTab, setActiveTab] = useState<'upcoming' | 'processing' | 'invoiced' | 'invoices'>('upcoming');
  const [chartPeriod, setChartPeriod] = useState<'month' | 'quarter' | 'year'>('month');

  const loadData = useCallback(() => {
    setTimelogs(getTimelogs());
    setReceipts(getReceipts());
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => subscribeToTimelogChanges(loadData), [loadData]);
  useEffect(() => subscribeToReceiptChanges(loadData), [loadData]);
  useEffect(() => subscribeToProjectChanges(() => setProjects(getProjects())), []);

  const myTimelogs = timelogs.filter((timelog) => timelog.cid === me.id);
  const myInvoices = invoices.filter((invoice) => invoice.cid === me.id);
  const myReceipts = receipts.filter((receipt) => receipt.cid === me.id);

  const categorized = useMemo(() => ({
    upcoming: myTimelogs.filter((timelog) => timelog.status === 'draft'),
    processing: myTimelogs.filter((timelog) => timelog.status === 'pending_ch' || timelog.status === 'pending_coo'),
    invoiced: myTimelogs.filter((timelog) => timelog.status === 'approved' || timelog.status === 'invoiced' || timelog.status === 'paid'),
  }), [myTimelogs]);

  const stats = useMemo(() => ({
    totalEarned: myInvoices.filter((invoice) => invoice.status === 'paid').reduce((sum, invoice) => sum + invoice.total, 0),
    toPay: myInvoices.filter((invoice) => invoice.status === 'sent').reduce((sum, invoice) => sum + invoice.total, 0),
    receiptToPay: myReceipts.filter((receipt) => receipt.status === 'approved').reduce((sum, receipt) => sum + receipt.amount, 0),
    pendingHours: categorized.processing.reduce((sum, timelog) => sum + calculateTotalHours(timelog.days), 0),
    totalHours: categorized.invoiced.reduce((sum, timelog) => sum + calculateTotalHours(timelog.days), 0),
  }), [myInvoices, myReceipts, categorized]);

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
      const event = events.find((item) => item.id === timelog.eid);
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
  }, [searchQuery, categorized, myInvoices, events, projects, myTimelogs]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Moje smeny</h1>
          <p className="text-sm text-gray-500">Vitejte zpet, {me.name}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        {[
          { label: 'Vydelano celkem', value: formatCurrency(stats.totalEarned), sub: 'Z proplacenych faktur', bg: 'bg-emerald-50 border-emerald-100', icon: Receipt, iconBg: 'bg-emerald-100 text-emerald-700', labelCls: 'text-emerald-700', valueCls: 'text-emerald-900', subCls: 'text-emerald-600' },
          { label: 'K vyplaceni', value: formatCurrency(stats.toPay), sub: 'Odeslane faktury', bg: 'bg-blue-50 border-blue-100', icon: Clock, iconBg: 'bg-blue-100 text-blue-700', labelCls: 'text-blue-700', valueCls: 'text-blue-900', subCls: 'text-blue-600' },
          { label: 'Uctenky k proplaceni', value: formatCurrency(stats.receiptToPay), sub: 'Schvalene uctenky', bg: 'bg-amber-50 border-amber-100', icon: Receipt, iconBg: 'bg-amber-100 text-amber-700', labelCls: 'text-amber-700', valueCls: 'text-amber-900', subCls: 'text-amber-600' },
          { label: 'Ke schvaleni', value: `${stats.pendingHours.toFixed(1)} h`, sub: 'Ceka na schvaleni', bg: 'bg-amber-50 border-amber-100', icon: CheckCircle2, iconBg: 'bg-amber-100 text-amber-700', labelCls: 'text-amber-700', valueCls: 'text-amber-900', subCls: 'text-amber-600' },
          { label: 'Celkem odpracovano', value: `${stats.totalHours.toFixed(1)} h`, sub: 'Schvalene smeny', bg: 'bg-gray-50 border-gray-100', icon: Calendar, iconBg: 'bg-gray-200 text-gray-700', labelCls: 'text-gray-700', valueCls: 'text-gray-900', subCls: 'text-gray-500' },
        ].map((stat) => (
          <div key={stat.label} className={`${stat.bg} border rounded-2xl p-4`}>
            <div className="flex items-center gap-3 mb-2">
              <div className={`p-2 rounded-lg ${stat.iconBg}`}>
                <stat.icon size={18} />
              </div>
              <span className={`text-[10px] font-bold uppercase tracking-wider ${stat.labelCls}`}>{stat.label}</span>
            </div>
            <div className={`text-2xl font-bold ${stat.valueCls}`}>{stat.value}</div>
            <p className={`text-[10px] mt-1 ${stat.subCls}`}>{stat.sub}</p>
          </div>
        ))}
      </div>

      <div className="space-y-4 mb-6">
        <div className="flex items-center gap-2 bg-white p-1 border border-gray-100 rounded-xl w-fit">
          {[
            { id: 'upcoming' as const, lbl: 'Nadchazejici', count: categorized.upcoming.length },
            { id: 'processing' as const, lbl: 'Zpracovava se', count: categorized.processing.length },
            { id: 'invoiced' as const, lbl: 'Vyuctovane', count: categorized.invoiced.length },
            { id: 'invoices' as const, lbl: 'Moje faktury', count: myInvoices.length },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${activeTab === tab.id ? 'bg-emerald-50 text-emerald-700 shadow-sm' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              {tab.lbl}
              {tab.count > 0 && <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${activeTab === tab.id ? 'bg-emerald-100' : 'bg-gray-100'}`}>{tab.count}</span>}
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab !== 'invoices' ? (
          <motion.div key={activeTab} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredData[activeTab].map((timelog) => {
              const event = events.find((item) => item.id === timelog.eid);
              const project = projects.find((item) => item.id === event?.job);
              if (!event || !project) return null;
              return <ShiftCard key={timelog.id} timelog={timelog} event={event} project={project} />;
            })}
            {filteredData[activeTab].length === 0 && <div className="col-span-full py-12 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-200 text-sm text-gray-500">{searchQuery ? 'Nebyly nalezeny zadne vysledky' : 'Zadne zaznamy'}</div>}
          </motion.div>
        ) : (
          <motion.div key="invoices" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="space-y-3">
            {filteredData.invoices.map((invoice) => (
              <div key={invoice.id} className="bg-white border border-gray-100 rounded-xl p-4 flex items-center justify-between shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600"><Receipt size={20} /></div>
                  <div>
                    <div className="text-xs font-bold text-gray-900">{invoice.id}</div>
                    <div className="text-[10px] text-gray-500">{invoice.job} • {invoice.sentAt ? formatShortDate(invoice.sentAt) : '—'}</div>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <div className="text-xs font-bold text-gray-900">{formatCurrency(invoice.total)}</div>
                    <div className="text-[10px] text-gray-400">{invoice.hours}h + {invoice.km}km</div>
                  </div>
                  <StatusBadge status={invoice.status} />
                </div>
              </div>
            ))}
            {filteredData.invoices.length === 0 && <div className="py-12 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-200 text-sm text-gray-500">{searchQuery ? 'Nebyly nalezeny zadne vysledky' : 'Zatim zadne faktury'}</div>}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bg-white border border-gray-100 rounded-2xl p-6 mt-8 shadow-sm">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div>
            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Fakturace za dane obdobi</h2>
            <p className="text-xs text-gray-500">Prehled vasich prijmu</p>
          </div>
          <div className="flex gap-1 bg-gray-50 p-1 rounded-lg border border-gray-100">
            {(['month', 'quarter', 'year'] as const).map((period) => (
              <button key={period} onClick={() => setChartPeriod(period)} className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all ${chartPeriod === period ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>
                {period === 'month' ? 'Mesice' : period === 'quarter' ? 'Kvartaly' : 'Roky'}
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
              <Bar dataKey="total" fill="#10b981" radius={[4, 4, 0, 0]} barSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </motion.div>
  );
};

export default MyShiftsView;
