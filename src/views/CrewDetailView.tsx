import React, { useState, useMemo } from 'react';
import { ArrowLeft, FileText, Receipt, Clock, Calendar, CheckCircle2, BarChart3, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, parseISO } from 'date-fns';
import { useAppContext } from '../context/AppContext';
import { calculateTotalHours, formatCurrency, formatShortDate } from '../utils';
import { KM_RATE } from '../data';
import StatusBadge from '../components/shared/StatusBadge';
import ShiftCard from '../components/shared/ShiftCard';

const CrewDetailView = () => {
  const { selectedContractorId, setSelectedContractorId, contractors, setContractors, timelogs, invoices, events, projects, findEvent, setEditingTimelog, darkMode } = useAppContext();
  const c = contractors.find((x) => x.id === selectedContractorId);
  if (!c) return null;

  const [activeTab, setActiveTab] = useState<'upcoming' | 'processing' | 'invoiced' | 'invoices'>('upcoming');
  const [chartPeriod, setChartPeriod] = useState<'month' | 'quarter' | 'year'>('month');
  const [isChartExpanded, setIsChartExpanded] = useState(false);
  const [profileTab, setProfileTab] = useState<'personal' | 'billing'>('personal');
  const [isEditingMeta, setIsEditingMeta] = useState(false);
  const [metaForm, setMetaForm] = useState({ rate: String(c.rate), note: c.note ?? '' });

  const cTls = timelogs.filter((t) => t.cid === selectedContractorId);
  const cInvoices = invoices.filter((i) => i.cid === selectedContractorId);

  const categorized = useMemo(() => ({
    upcoming: cTls.filter((t) => t.status === 'draft'),
    processing: cTls.filter((t) => t.status === 'pending_ch' || t.status === 'pending_coo'),
    invoiced: cTls.filter((t) => t.status === 'approved' || t.status === 'invoiced' || t.status === 'paid'),
  }), [cTls]);

  const stats = useMemo(() => ({
    totalEarned: cInvoices.filter((i) => i.status === 'paid').reduce((s, i) => s + i.total, 0),
    toPay: cInvoices.filter((i) => i.status === 'sent').reduce((s, i) => s + i.total, 0),
    pendingHours: categorized.processing.reduce((s, t) => s + calculateTotalHours(t.days), 0),
    totalHours: categorized.invoiced.reduce((s, t) => s + calculateTotalHours(t.days), 0),
  }), [cInvoices, categorized]);

  const chartData = useMemo(() => {
    const data: Record<string, { total: number; date: Date }> = {};
    cInvoices.forEach((inv) => {
      if (!inv.sentAt) return;
      const date = parseISO(inv.sentAt);
      let key: string, sortDate: Date;
      if (chartPeriod === 'month') { key = format(date, 'MMM yyyy'); sortDate = new Date(date.getFullYear(), date.getMonth(), 1); }
      else if (chartPeriod === 'quarter') { const q = Math.floor(date.getMonth() / 3); key = `Q${q + 1} ${date.getFullYear()}`; sortDate = new Date(date.getFullYear(), q * 3, 1); }
      else { key = format(date, 'yyyy'); sortDate = new Date(date.getFullYear(), 0, 1); }
      if (!data[key]) data[key] = { total: 0, date: sortDate };
      data[key].total += inv.total;
    });
    return Object.entries(data).map(([name, { total, date }]) => ({ name, total, date })).sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [cInvoices, chartPeriod]);

  const saveMeta = () => {
    setContractors((prev) => prev.map((contractor) => (
      contractor.id === c.id
        ? { ...contractor, rate: Number(metaForm.rate) || contractor.rate, note: metaForm.note }
        : contractor
    )));
    setIsEditingMeta(false);
  };

  const personalRows: [string, string][] = [
    ['Telefon', c.phone],
    ['E-mail', c.email],
    ['IČO', c.ico],
    ['DIČ', c.dic || '—'],
    ['Č. účtu', c.bank],
    ['Akcí', `${c.events} celkem`],
  ];

  const billingRows: [string, string][] = [
    ['Jméno / firma', c.billingName || c.name],
    ['Ulice a číslo', c.billingStreet || '—'],
    ['PSČ', c.billingZip || '—'],
    ['Město', c.billingCity || c.city || '—'],
    ['Stát', c.billingCountry || 'Česká republika'],
  ];

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
      <button onClick={() => setSelectedContractorId(null)} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 mb-4 transition-colors">
        <ArrowLeft size={14} /> Zpět na Crew
      </button>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Vyděláno celkem', value: formatCurrency(stats.totalEarned), sub: 'Z proplacených faktur', bg: 'bg-emerald-50 border-emerald-100', icon: Receipt, iconBg: 'bg-emerald-100 text-emerald-700', labelCls: 'text-emerald-700', valueCls: 'text-emerald-900', subCls: 'text-emerald-600' },
          { label: 'K vyplacení', value: formatCurrency(stats.toPay), sub: 'Odeslané faktury', bg: 'bg-blue-50 border-blue-100', icon: Clock, iconBg: 'bg-blue-100 text-blue-700', labelCls: 'text-blue-700', valueCls: 'text-blue-900', subCls: 'text-blue-600' },
          { label: 'Ke schválení', value: `${stats.pendingHours.toFixed(1)} h`, sub: 'Čeká na schválení', bg: 'bg-amber-50 border-amber-100', icon: CheckCircle2, iconBg: 'bg-amber-100 text-amber-700', labelCls: 'text-amber-700', valueCls: 'text-amber-900', subCls: 'text-amber-600' },
          { label: 'Celkem odpracováno', value: `${stats.totalHours.toFixed(1)} h`, sub: 'Schválené směny', bg: 'bg-gray-50 border-gray-100', icon: Calendar, iconBg: 'bg-gray-200 text-gray-700', labelCls: 'text-gray-700', valueCls: 'text-gray-900', subCls: 'text-gray-500' },
        ].map((s) => (
          <div key={s.label} className={`${s.bg} border rounded-2xl p-4`}>
            <div className="flex items-center gap-3 mb-2">
              <div className={`p-2 rounded-lg ${s.iconBg}`}><s.icon size={18} /></div>
              <span className={`text-[10px] font-bold uppercase tracking-wider ${s.labelCls}`}>{s.label}</span>
            </div>
            <div className={`text-2xl font-bold ${s.valueCls}`}>{s.value}</div>
            <p className={`text-[10px] mt-1 ${s.subCls}`}>{s.sub}</p>
          </div>
        ))}
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3 lg:items-stretch">
        <div className="flex h-full flex-col gap-4">
          <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-4 pb-4 border-b border-gray-50">
              <div className="av w-12 h-12 text-lg" style={{ backgroundColor: c.bg, color: c.fg }}>{c.ii}</div>
              <div>
                <div className="text-base font-semibold">{c.name}</div>
                <div className="text-xs text-gray-500">{c.city}</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-1 mb-4">
              {c.tags.map((t) => <StatusBadge key={t} status="bg" label={t} />)}
              {c.reliable ? <StatusBadge status="full" label="Spolehlivý" /> : <StatusBadge status="pending_ch" label="Ověřit" />}
            </div>
            <div className="flex bg-white border border-gray-200 rounded-lg p-0.5 gap-1 mb-4">
              <button onClick={() => setProfileTab('personal')} className={`flex-1 py-2 rounded-md text-[11px] font-medium transition-all ${profileTab === 'personal' ? 'bg-emerald-50 text-emerald-700 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}>Osobní údaje</button>
              <button onClick={() => setProfileTab('billing')} className={`flex-1 py-2 rounded-md text-[11px] font-medium transition-all ${profileTab === 'billing' ? 'bg-emerald-50 text-emerald-700 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}>Fakturační adresa</button>
            </div>
            <div className="space-y-2">
              {(profileTab === 'personal' ? personalRows : billingRows).map(([l, v]) => (
                <div key={l} className="flex justify-between py-1.5 border-b border-gray-50 last:border-0 gap-4">
                  <span className="text-xs text-gray-500">{l}</span>
                  <span className="text-xs font-semibold text-right">{v}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex-1 rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-50">
              <h3 className="text-sm font-semibold">Sazba a poznámka</h3>
              {!isEditingMeta ? (
                <button onClick={() => setIsEditingMeta(true)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-[11px] font-medium hover:bg-gray-50">Upravit</button>
              ) : null}
            </div>

            {!isEditingMeta ? (
              <div className="space-y-2">
                <div className="flex justify-between py-1.5 border-b border-gray-50">
                  <span className="text-xs text-gray-500">Sazba</span>
                  <span className="text-xs font-semibold">{c.rate} Kč/h</span>
                </div>
                <div className="pt-2">
                  <div className="text-xs text-gray-500 mb-1">Poznámka</div>
                  <div className="text-sm text-gray-700 min-h-10">{c.note || '—'}</div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <label className="block text-xs text-gray-600">Sazba
                  <input value={metaForm.rate} onChange={(e) => setMetaForm((prev) => ({ ...prev, rate: e.target.value }))} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                </label>
                <label className="block text-xs text-gray-600">Poznámka
                  <textarea value={metaForm.note} onChange={(e) => setMetaForm((prev) => ({ ...prev, note: e.target.value }))} rows={4} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                </label>
                <div className="flex justify-end gap-3">
                  <button onClick={() => { setMetaForm({ rate: String(c.rate), note: c.note ?? '' }); setIsEditingMeta(false); }} className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50">Zrušit</button>
                  <button onClick={saveMeta} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700">Uložit</button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-2 flex min-h-0 flex-col self-stretch rounded-xl border border-gray-100 bg-white p-5 shadow-sm lg:h-[34rem]">
          <div className="mb-4">
            <h3 className="text-sm font-semibold mb-3">Směny</h3>
            <div className="flex flex-wrap items-center gap-2 bg-white p-1 border border-gray-100 rounded-xl w-fit">
              {[
                { id: 'upcoming' as const, lbl: 'Nadcházející', count: categorized.upcoming.length },
                { id: 'processing' as const, lbl: 'Zpracovává se', count: categorized.processing.length },
                { id: 'invoiced' as const, lbl: 'Vyúčtované', count: categorized.invoiced.length },
                { id: 'invoices' as const, lbl: 'Faktury', count: cInvoices.length },
              ].map((tab) => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${activeTab === tab.id ? 'bg-emerald-50 text-emerald-700 shadow-sm' : 'text-gray-500 hover:bg-gray-50'}`}>
                  {tab.lbl}
                  {tab.count > 0 && <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${activeTab === tab.id ? 'bg-emerald-100' : 'bg-gray-100'}`}>{tab.count}</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden pr-1">
            <AnimatePresence mode="wait">
              {activeTab !== 'invoices' ? (
                <motion.div key={activeTab} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {categorized[activeTab].map((t) => {
                    const ev = events.find((e) => e.id === t.eid);
                    const pr = projects.find((p) => p.id === ev?.job);
                    if (!ev || !pr) return null;
                    return <ShiftCard key={t.id} timelog={t} event={ev} project={pr} />;
                  })}
                  {categorized[activeTab].length === 0 && <div className="col-span-full py-12 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-200 text-sm text-gray-500">Žádné záznamy</div>}
                </motion.div>
              ) : (
                <motion.div key="invoices" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="space-y-3">
                  {cInvoices.map((inv) => (
                    <div key={inv.id} className="bg-white border border-gray-100 rounded-xl p-4 flex items-center justify-between shadow-sm">
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
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm mb-6">
        <div className="p-4 border-b border-gray-50 font-semibold text-sm">Historie timelogů</div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="text-left text-[10px] uppercase tracking-wider text-gray-400 border-b border-gray-50">
              <th className="px-4 py-3 font-bold">Akce</th><th className="px-4 py-3 font-bold">Hodiny</th><th className="px-4 py-3 font-bold">Km</th><th className="px-4 py-3 font-bold">Celkem</th><th className="px-4 py-3 font-bold">Status</th><th className="px-4 py-3 font-bold"></th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {cTls.map((t) => {
                const e = findEvent(t.eid);
                if (!e) return null;
                const h = calculateTotalHours(t.days);
                return (
                  <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3"><div className="text-xs font-medium text-gray-900">{e.name}</div><div className="text-[10px] text-gray-400 font-mono">{e.job}</div></td>
                    <td className="px-4 py-3 text-xs font-semibold">{h.toFixed(1)}h</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{t.km || '—'}</td>
                    <td className="px-4 py-3 text-xs font-bold text-gray-900">{formatCurrency(h * c.rate + t.km * KM_RATE)}</td>
                    <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
                    <td className="px-4 py-3 text-right"><button onClick={() => setEditingTimelog(t)} className="p-1 hover:bg-gray-100 rounded text-gray-400"><FileText size={14} /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden mb-8 shadow-sm">
        <button onClick={() => setIsChartExpanded(!isChartExpanded)} className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
          <div className="flex items-center gap-3"><BarChart3 size={18} className="text-emerald-600" /><h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Fakturace za dané období</h2></div>
          <ChevronDown size={16} className={`text-gray-400 transition-transform duration-300 ${isChartExpanded ? 'rotate-180' : ''}`} />
        </button>
        <AnimatePresence>
          {isChartExpanded && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="px-6 pb-6 pt-2">
                <div className="flex justify-end mb-6">
                  <div className="flex gap-1 bg-gray-50 p-1 rounded-lg border border-gray-100">
                    {(['month', 'quarter', 'year'] as const).map((p) => (
                      <button key={p} onClick={() => setChartPeriod(p)} className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all ${chartPeriod === p ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>
                        {p === 'month' ? 'Měsíce' : p === 'quarter' ? 'Kvartály' : 'Roky'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={darkMode ? '#1f2937' : '#f3f4f6'} />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9ca3af' }} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={(v) => `${v / 1000}k`} />
                      <Tooltip cursor={{ fill: darkMode ? '#111827' : '#f9fafb' }} contentStyle={{ backgroundColor: darkMode ? '#111827' : '#fff', border: 'none', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }} formatter={(v: number) => [formatCurrency(v), 'Fakturováno']} />
                      <Bar dataKey="total" fill="#10b981" radius={[4, 4, 0, 0]} barSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default CrewDetailView;
