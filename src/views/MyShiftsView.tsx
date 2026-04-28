import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar, Clock, CheckCircle2, Receipt } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, parseISO } from 'date-fns';
import { useAuth } from '../app/providers/useAuth';
import { useAppContext } from '../context/useAppContext';
import { Contractor, Event, Invoice, ReceiptItem, Timelog } from '../types';
import { calculateTotalHours, formatCurrency, formatShortDate } from '../utils';
import StatusBadge from '../components/shared/StatusBadge';
import { useEventsQuery } from '../features/events/queries/useEventsQuery';
import ShiftCard from '../components/shared/ShiftCard';
import { useTimelogsQuery } from '../features/timelogs/queries/useTimelogsQuery';
import { useReceiptsQuery } from '../features/receipts/queries/useReceiptsQuery';
import { getProjects, subscribeToProjectChanges } from '../features/projects/services/projects.service';
import { getContractors, subscribeToCrewChanges } from '../features/crew/services/crew.service';
import { useInvoicesQuery } from '../features/invoices/queries/useInvoicesQuery';

const MyShiftsView = () => {
  const { darkMode, searchQuery } = useAppContext();
  const { currentProfileId, profile } = useAuth();
  const eventsQuery = useEventsQuery();
  const timelogsQuery = useTimelogsQuery();
  const receiptsQuery = useReceiptsQuery();
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
  }, [eventsQuery.data, invoicesQuery.data, loadData, timelogsQuery.data, receiptsQuery.data]);

  useEffect(() => subscribeToCrewChanges(loadData), [loadData]);
  useEffect(() => subscribeToProjectChanges(() => setProjects(getProjects() ?? [])), []);
  const events = useMemo(() => eventsQuery.data ?? [], [eventsQuery.data]);
  const timelogs = timelogsQuery.data ?? [];
  const receipts = receiptsQuery.data ?? [];
  const invoices = invoicesQuery.data ?? [];
  const meProfileId = currentProfileId ?? me?.profileId ?? null;
  const displayName = me?.name || [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || 'Crew';
  const myTimelogs = timelogs.filter((timelog) => timelog.contractorProfileId === meProfileId);
  const myInvoices = invoices.filter((invoice) => invoice.contractorProfileId === meProfileId);
  const myReceipts = receipts.filter((receipt) => receipt.contractorProfileId === meProfileId);

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
  }, [searchQuery, categorized, myInvoices, events, projects]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="mb-8 flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-xl font-bold text-[var(--nodu-text)]">Moje smeny</h1>
          <p className="text-sm text-[var(--nodu-text-soft)]">Vitejte zpet, {displayName}</p>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
        {[
          { label: 'Vydelano celkem', value: formatCurrency(stats.totalEarned), sub: 'Z proplacenych faktur', bg: 'bg-white border-[var(--nodu-border)]', icon: Receipt, iconBg: 'bg-[var(--nodu-success-bg)] text-[var(--nodu-success-text)]', labelCls: 'text-[var(--nodu-success-text)]', valueCls: 'text-[var(--nodu-text)]', subCls: 'text-[var(--nodu-text-soft)]' },
          { label: 'K vyplaceni', value: formatCurrency(stats.toPay), sub: 'Odeslane faktury', bg: 'bg-white border-[var(--nodu-border)]', icon: Clock, iconBg: 'bg-[var(--nodu-info-bg)] text-[var(--nodu-info-text)]', labelCls: 'text-[var(--nodu-info-text)]', valueCls: 'text-[var(--nodu-text)]', subCls: 'text-[var(--nodu-text-soft)]' },
          { label: 'Uctenky k proplaceni', value: formatCurrency(stats.receiptToPay), sub: 'Schvalene uctenky', bg: 'bg-white border-[var(--nodu-border)]', icon: Receipt, iconBg: 'bg-[var(--nodu-warning-bg)] text-[var(--nodu-warning-text)]', labelCls: 'text-[var(--nodu-warning-text)]', valueCls: 'text-[var(--nodu-text)]', subCls: 'text-[var(--nodu-text-soft)]' },
          { label: 'Ke schvaleni', value: `${stats.pendingHours.toFixed(1)} h`, sub: 'Ceka na schvaleni', bg: 'bg-white border-[var(--nodu-border)]', icon: CheckCircle2, iconBg: 'bg-[var(--nodu-warning-bg)] text-[var(--nodu-warning-text)]', labelCls: 'text-[var(--nodu-warning-text)]', valueCls: 'text-[var(--nodu-text)]', subCls: 'text-[var(--nodu-text-soft)]' },
          { label: 'Celkem odpracovano', value: `${stats.totalHours.toFixed(1)} h`, sub: 'Schvalene smeny', bg: 'bg-white border-[var(--nodu-border)]', icon: Calendar, iconBg: 'bg-[rgba(var(--nodu-text-rgb),0.06)] text-[var(--nodu-text-soft)]', labelCls: 'text-[var(--nodu-text-soft)]', valueCls: 'text-[var(--nodu-text)]', subCls: 'text-[var(--nodu-text-soft)]' },
        ].map((stat) => (
          <div key={stat.label} className={`${stat.bg} rounded-[22px] border p-4 shadow-[0_16px_34px_rgba(var(--nodu-text-rgb),0.06)]`}>
            <div className="mb-2 flex items-center gap-3">
              <div className={`rounded-lg p-2 ${stat.iconBg}`}>
                <stat.icon size={18} />
              </div>
              <span className={`text-[10px] font-bold uppercase tracking-wider ${stat.labelCls}`}>{stat.label}</span>
            </div>
            <div className={`text-2xl font-bold ${stat.valueCls}`}>{stat.value}</div>
            <p className={`mt-1 text-[10px] ${stat.subCls}`}>{stat.sub}</p>
          </div>
        ))}
      </div>

      <div className="mb-6 space-y-4">
        <div className="flex w-fit flex-nowrap items-center gap-1 overflow-x-auto rounded-xl border border-[var(--nodu-border)] bg-white p-1">
          {[
            { id: 'upcoming' as const, lbl: 'Nadchazejici', count: categorized.upcoming.length },
            { id: 'processing' as const, lbl: 'Zpracovava se', count: categorized.processing.length },
            { id: 'invoiced' as const, lbl: 'Vyuctovane', count: categorized.invoiced.length },
            { id: 'invoices' as const, lbl: 'Moje faktury', count: myInvoices.length },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition-all ${activeTab === tab.id ? 'bg-[var(--nodu-accent)] text-white shadow-sm' : 'text-[var(--nodu-text-soft)] hover:bg-[var(--nodu-accent-soft)] hover:text-[var(--nodu-text)]'}`}
            >
              {tab.lbl}
              {tab.count > 0 && <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${activeTab === tab.id ? 'bg-white/22' : 'bg-[rgba(var(--nodu-text-rgb),0.06)]'}`}>{tab.count}</span>}
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab !== 'invoices' ? (
          <motion.div key={activeTab} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredData[activeTab].map((timelog) => {
              const event = events.find((item) => item.id === timelog.eid);
              const project = projects.find((item) => item.id === event?.job);
              if (!event || !project) return null;
              return <ShiftCard key={timelog.id} timelog={timelog} event={event} project={project} />;
            })}
            {filteredData[activeTab].length === 0 && <div className="col-span-full rounded-2xl border border-dashed border-[var(--nodu-border)] bg-[var(--nodu-paper-strong)] py-12 text-center text-sm text-[var(--nodu-text-soft)]">{searchQuery ? 'Nebyly nalezeny zadne vysledky' : 'Zadne zaznamy'}</div>}
          </motion.div>
        ) : (
          <motion.div key="invoices" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="space-y-3">
            {filteredData.invoices.map((invoice) => (
              <div key={invoice.id} className="flex items-center justify-between rounded-2xl border border-[var(--nodu-border)] bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
                <div className="flex items-center gap-4">
                  <div className="rounded-xl bg-[var(--nodu-accent-soft)] p-2 text-[var(--nodu-accent)]"><Receipt size={20} /></div>
                  <div>
                    <div className="text-xs font-bold text-[var(--nodu-text)]">{invoice.id}</div>
                    <div className="text-[10px] text-[var(--nodu-text-soft)]">{invoice.job} · {invoice.sentAt ? formatShortDate(invoice.sentAt) : '-'}</div>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <div className="text-xs font-bold text-[var(--nodu-text)]">{formatCurrency(invoice.total)}</div>
                    <div className="text-[10px] text-[var(--nodu-text-soft)]">{invoice.hours}h + {invoice.km}km</div>
                  </div>
                  <StatusBadge status={invoice.status} />
                </div>
              </div>
            ))}
            {filteredData.invoices.length === 0 && <div className="rounded-2xl border border-dashed border-[var(--nodu-border)] bg-[var(--nodu-paper-strong)] py-12 text-center text-sm text-[var(--nodu-text-soft)]">{searchQuery ? 'Nebyly nalezeny zadne vysledky' : 'Zatim zadne faktury'}</div>}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-8 rounded-[24px] border border-[var(--nodu-border)] bg-white p-6 shadow-[0_18px_40px_rgba(var(--nodu-text-rgb),0.06)]">
        <div className="mb-6 flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--nodu-text)]">Fakturace za dane obdobi</h2>
            <p className="text-xs text-[var(--nodu-text-soft)]">Prehled vasich prijmu</p>
          </div>
          <div className="flex gap-1 rounded-xl border border-[var(--nodu-border)] bg-white p-1">
            {(['month', 'quarter', 'year'] as const).map((period) => (
              <button key={period} onClick={() => setChartPeriod(period)} className={`rounded-lg px-3 py-1.5 text-[10px] font-bold uppercase transition-all ${chartPeriod === period ? 'bg-[var(--nodu-accent)] text-white shadow-sm' : 'text-[var(--nodu-text-soft)] hover:bg-[var(--nodu-accent-soft)] hover:text-[var(--nodu-text)]'}`}>
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
              <Bar dataKey="total" fill="var(--nodu-accent)" radius={[4, 4, 0, 0]} barSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </motion.div>
  );
};

export default MyShiftsView;
