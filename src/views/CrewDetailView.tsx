import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, BarChart3, Calendar, CheckCircle2, ChevronDown, ChevronDownCircle, Clock, FileText, Receipt } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { format, parseISO } from 'date-fns';
import { useAppContext } from '../context/AppContext';
import { KM_RATE } from '../data';
import StatusBadge from '../components/shared/StatusBadge';
import ShiftCard from '../components/shared/ShiftCard';
import { calculateTotalHours, formatCurrency, formatShortDate } from '../utils';
import { getCrewDetailData, subscribeToCrewChanges, updateCrew } from '../features/crew/services/crew.service';

const CrewDetailView = () => {
  const {
    selectedContractorProfileId,
    setSelectedContractorProfileId,
    setEditingTimelog,
    darkMode,
  } = useAppContext();
  const [detail, setDetail] = useState(() => getCrewDetailData(selectedContractorProfileId));

  const loadDetail = useCallback(() => {
    setDetail(getCrewDetailData(selectedContractorProfileId));
  }, [selectedContractorProfileId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  useEffect(() => subscribeToCrewChanges(loadDetail), [loadDetail]);

  const [activeTab, setActiveTab] = useState<'upcoming' | 'processing' | 'invoiced' | 'invoices'>('upcoming');
  const [chartPeriod, setChartPeriod] = useState<'month' | 'quarter' | 'year'>('month');
  const [isChartExpanded, setIsChartExpanded] = useState(false);
  const [profileTab, setProfileTab] = useState<'personal' | 'billing'>('personal');
  const [isEditingMeta, setIsEditingMeta] = useState(false);
  const [metaForm, setMetaForm] = useState({ rate: '', note: '' });
  const shiftsScrollRef = useRef<HTMLDivElement | null>(null);
  const [showScrollCue, setShowScrollCue] = useState(false);

  const c = detail.contractor;
  const events = detail.events;
  const projects = detail.projects;
  const cTls = detail.timelogs;
  const cInvoices = detail.invoices;

  useEffect(() => {
    if (!c) return;
    setMetaForm({ rate: String(c.rate), note: c.note ?? '' });
  }, [c]);

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
      data[key].total += inv.total;
    });

    return Object.entries(data)
      .map(([name, { total, date }]) => ({ name, total, date }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [cInvoices, chartPeriod]);

  const saveMeta = () => {
    if (!c) return;
    updateCrew({
      ...c,
      rate: Number(metaForm.rate) || c.rate,
      note: metaForm.note,
    });
    setIsEditingMeta(false);
  };

  const personalRows: [string, string][] = [
    ['Telefon', c.phone || '-'],
    ['E-mail', c.email || '-'],
    ['ICO', c.ico || '-'],
    ['DIC', c.dic || '-'],
    ['C. uctu', c.bank || '-'],
    ['Akci', `${c.events} celkem`],
  ];

  const billingRows: [string, string][] = [
    ['Jmeno / firma', c.billingName || c.name],
    ['Ulice a cislo', c.billingStreet || '-'],
    ['PSC', c.billingZip || '-'],
    ['Mesto', c.billingCity || c.city || '-'],
    ['Stat', c.billingCountry || 'Ceska republika'],
  ];

  useEffect(() => {
    const container = shiftsScrollRef.current;
    if (!container) return;

    const updateScrollCue = () => {
      const canScroll = container.scrollHeight > container.clientHeight + 8;
      const nearBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 12;
      setShowScrollCue(canScroll && !nearBottom);
    };

    const frame = requestAnimationFrame(updateScrollCue);
    container.addEventListener('scroll', updateScrollCue);
    window.addEventListener('resize', updateScrollCue);

    return () => {
      cancelAnimationFrame(frame);
      container.removeEventListener('scroll', updateScrollCue);
      window.removeEventListener('resize', updateScrollCue);
    };
  }, [activeTab, categorized, cInvoices.length]);

  if (!c) return null;

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
      <button
        onClick={() => setSelectedContractorProfileId(null)}
        className="mb-4 flex items-center gap-1 text-xs font-medium text-[var(--nodu-text-soft)] transition-colors hover:text-[var(--nodu-accent)]"
      >
        <ArrowLeft size={14} />
        Zpet na Crew
      </button>

      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: 'Vydelano celkem',
            value: formatCurrency(stats.totalEarned),
            sub: 'Z proplacenych faktur',
            bg: 'bg-white border-[var(--nodu-border)]',
            icon: Receipt,
            iconBg: 'bg-[var(--nodu-success-bg)] text-[var(--nodu-success-text)]',
            labelCls: 'text-[var(--nodu-success-text)]',
            valueCls: 'text-[var(--nodu-text)]',
            subCls: 'text-[var(--nodu-text-soft)]',
          },
          {
            label: 'K vyplaceni',
            value: formatCurrency(stats.toPay),
            sub: 'Odeslane faktury',
            bg: 'bg-white border-[var(--nodu-border)]',
            icon: Clock,
            iconBg: 'bg-[var(--nodu-info-bg)] text-[var(--nodu-info-text)]',
            labelCls: 'text-[var(--nodu-info-text)]',
            valueCls: 'text-[var(--nodu-text)]',
            subCls: 'text-[var(--nodu-text-soft)]',
          },
          {
            label: 'Ke schvaleni',
            value: `${stats.pendingHours.toFixed(1)} h`,
            sub: 'Ceka na schvaleni',
            bg: 'bg-white border-[var(--nodu-border)]',
            icon: CheckCircle2,
            iconBg: 'bg-[var(--nodu-warning-bg)] text-[var(--nodu-warning-text)]',
            labelCls: 'text-[var(--nodu-warning-text)]',
            valueCls: 'text-[var(--nodu-text)]',
            subCls: 'text-[var(--nodu-text-soft)]',
          },
          {
            label: 'Celkem odpracovano',
            value: `${stats.totalHours.toFixed(1)} h`,
            sub: 'Schvalene smeny',
            bg: 'bg-white border-[var(--nodu-border)]',
            icon: Calendar,
            iconBg: 'bg-[rgba(var(--nodu-text-rgb),0.06)] text-[var(--nodu-text-soft)]',
            labelCls: 'text-[var(--nodu-text-soft)]',
            valueCls: 'text-[var(--nodu-text)]',
            subCls: 'text-[var(--nodu-text-soft)]',
          },
        ].map((s) => (
          <div key={s.label} className={`${s.bg} rounded-[22px] border p-4 shadow-[0_16px_34px_rgba(var(--nodu-text-rgb),0.06)]`}>
            <div className="mb-2 flex items-center gap-3">
              <div className={`rounded-lg p-2 ${s.iconBg}`}>
                <s.icon size={18} />
              </div>
              <span className={`text-[10px] font-bold uppercase tracking-wider ${s.labelCls}`}>{s.label}</span>
            </div>
            <div className={`text-2xl font-bold ${s.valueCls}`}>{s.value}</div>
            <p className={`mt-1 text-[10px] ${s.subCls}`}>{s.sub}</p>
          </div>
        ))}
      </div>

      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="space-y-4 lg:w-[32%] lg:flex-none">
          <div className="rounded-[24px] border border-[var(--nodu-border)] bg-white p-5 shadow-[0_18px_40px_rgba(var(--nodu-text-rgb),0.06)]">
            <div className="mb-4 flex items-center gap-3 border-b border-[rgba(var(--nodu-text-rgb),0.06)] pb-4">
              <div className="av h-12 w-12 text-lg" style={{ backgroundColor: c.bg, color: c.fg }}>{c.ii}</div>
              <div>
                <div className="text-base font-semibold text-[var(--nodu-text)]">{c.name}</div>
                <div className="text-xs text-[var(--nodu-text-soft)]">{c.city || 'Bez mesta'}</div>
              </div>
            </div>

            <div className="mb-4 flex flex-wrap gap-1">
              {c.tags.includes('Ridic') && <StatusBadge status="bg" label="Ridic" />}
              {c.reliable ? <StatusBadge status="full" label="Spolehlivy" /> : <StatusBadge status="pending_ch" label="Overit" />}
            </div>

            <div className="mb-4 rounded-xl border border-[var(--nodu-border)] bg-[var(--nodu-paper-strong)] px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-[var(--nodu-text-soft)]">Hodnoceni</div>
              <div className="mt-1 text-sm font-semibold text-[var(--nodu-text)]">
                {typeof c.rating === 'number' ? `${c.rating.toFixed(1).replace('.0', '')} / 5` : 'Bez hodnoceni'}
              </div>
            </div>

            <div className="mb-4 flex gap-1 rounded-xl border border-[var(--nodu-border)] bg-white p-1">
              <button
                onClick={() => setProfileTab('personal')}
                className={`flex-1 rounded-lg py-2 text-[11px] font-medium transition-all ${profileTab === 'personal' ? 'bg-[var(--nodu-accent)] text-white shadow-sm' : 'text-[var(--nodu-text-soft)] hover:bg-[var(--nodu-accent-soft)] hover:text-[var(--nodu-text)]'}`}
              >
                Osobni udaje
              </button>
              <button
                onClick={() => setProfileTab('billing')}
                className={`flex-1 rounded-lg py-2 text-[11px] font-medium transition-all ${profileTab === 'billing' ? 'bg-[var(--nodu-accent)] text-white shadow-sm' : 'text-[var(--nodu-text-soft)] hover:bg-[var(--nodu-accent-soft)] hover:text-[var(--nodu-text)]'}`}
              >
                Fakturacni adresa
              </button>
            </div>

            <div className="space-y-2">
              {(profileTab === 'personal' ? personalRows : billingRows).map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4 border-b border-[rgba(var(--nodu-text-rgb),0.06)] py-1.5 last:border-0">
                  <span className="text-xs text-[var(--nodu-text-soft)]">{label}</span>
                  <span className="text-right text-xs font-semibold text-[var(--nodu-text)]">{value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[24px] border border-[var(--nodu-border)] bg-white p-5 shadow-[0_18px_40px_rgba(var(--nodu-text-rgb),0.06)]">
            <div className="mb-4 flex items-center justify-between border-b border-[rgba(var(--nodu-text-rgb),0.06)] pb-4">
              <h3 className="text-sm font-semibold text-[var(--nodu-text)]">Sazba a poznamka</h3>
              {!isEditingMeta ? (
                <button
                  onClick={() => setIsEditingMeta(true)}
                  className="rounded-xl border border-[var(--nodu-border)] px-3 py-1.5 text-[11px] font-medium text-[var(--nodu-text)] transition hover:bg-[var(--nodu-accent-soft)]"
                >
                  Upravit
                </button>
              ) : null}
            </div>

            {!isEditingMeta ? (
              <div className="space-y-2">
                <div className="flex justify-between border-b border-[rgba(var(--nodu-text-rgb),0.06)] py-1.5">
                  <span className="text-xs text-[var(--nodu-text-soft)]">Sazba</span>
                  <span className="text-xs font-semibold text-[var(--nodu-text)]">{c.rate} Kc/h</span>
                </div>
                <div className="pt-2">
                  <div className="mb-1 text-xs text-[var(--nodu-text-soft)]">Poznamka</div>
                  <div className="min-h-10 text-sm text-[var(--nodu-text)]">{c.note || '-'}</div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <label className="block text-xs text-[var(--nodu-text-soft)]">Sazba
                  <input
                    value={metaForm.rate}
                    onChange={(e) => setMetaForm((prev) => ({ ...prev, rate: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-[var(--nodu-border)] px-3 py-2 text-sm text-[var(--nodu-text)] outline-none focus:border-[var(--nodu-accent)] focus:ring-2 focus:ring-[rgba(var(--nodu-accent-rgb),0.16)]"
                  />
                </label>
                <label className="block text-xs text-[var(--nodu-text-soft)]">Poznamka
                  <textarea
                    value={metaForm.note}
                    onChange={(e) => setMetaForm((prev) => ({ ...prev, note: e.target.value }))}
                    rows={4}
                    className="mt-1 w-full rounded-xl border border-[var(--nodu-border)] px-3 py-2 text-sm text-[var(--nodu-text)] outline-none focus:border-[var(--nodu-accent)] focus:ring-2 focus:ring-[rgba(var(--nodu-accent-rgb),0.16)]"
                  />
                </label>
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => {
                      setMetaForm({ rate: String(c.rate), note: c.note ?? '' });
                      setIsEditingMeta(false);
                    }}
                    className="rounded-xl border border-[var(--nodu-border)] px-4 py-2 text-sm font-medium text-[var(--nodu-text)] hover:bg-[var(--nodu-accent-soft)]"
                  >
                    Zrusit
                  </button>
                  <button
                    onClick={saveMeta}
                    className="rounded-xl bg-[var(--nodu-accent)] px-4 py-2 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(var(--nodu-accent-rgb),0.18)] hover:bg-[#e96f00]"
                  >
                    Ulozit
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="relative flex min-h-0 flex-col rounded-[24px] border border-[var(--nodu-border)] bg-white p-5 shadow-[0_18px_40px_rgba(var(--nodu-text-rgb),0.06)] lg:h-[41rem] lg:flex-1 lg:min-w-0">
          <div className="mb-4">
            <h3 className="mb-3 text-sm font-semibold text-[var(--nodu-text)]">Smeny</h3>
            <div className="flex w-fit flex-wrap items-center gap-2 rounded-xl border border-[var(--nodu-border)] bg-white p-1">
              {[
                { id: 'upcoming' as const, lbl: 'Nadchazejici', count: categorized.upcoming.length },
                { id: 'processing' as const, lbl: 'Zpracovava se', count: categorized.processing.length },
                { id: 'invoiced' as const, lbl: 'Vyuctovane', count: categorized.invoiced.length },
                { id: 'invoices' as const, lbl: 'Faktury', count: cInvoices.length },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition-all ${activeTab === tab.id ? 'bg-[var(--nodu-accent)] text-white shadow-sm' : 'text-[var(--nodu-text-soft)] hover:bg-[var(--nodu-accent-soft)] hover:text-[var(--nodu-text)]'}`}
                >
                  {tab.lbl}
                  {tab.count > 0 && (
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${activeTab === tab.id ? 'bg-white/22' : 'bg-[rgba(var(--nodu-text-rgb),0.06)]'}`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div
            ref={shiftsScrollRef}
            className="min-h-0 flex-1 overflow-y-auto pr-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          >
            <AnimatePresence mode="wait">
              {activeTab !== 'invoices' ? (
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  className="grid grid-cols-1 gap-4 md:grid-cols-2"
                >
                  {categorized[activeTab].map((t) => {
                    const ev = events.find((e) => e.id === t.eid);
                    const pr = projects.find((p) => p.id === ev?.job);
                    if (!ev || !pr) return null;
                    return <ShiftCard key={t.id} timelog={t} event={ev} project={pr} />;
                  })}
                  {categorized[activeTab].length === 0 && (
                    <div className="col-span-full rounded-2xl border border-dashed border-[var(--nodu-border)] bg-[var(--nodu-paper-strong)] py-12 text-center text-sm text-[var(--nodu-text-soft)]">
                      Zadne zaznamy
                    </div>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key="invoices"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  className="space-y-3"
                >
                  {cInvoices.map((inv) => (
                    <div key={inv.id} className="flex items-center justify-between rounded-2xl border border-[var(--nodu-border)] bg-white p-4 shadow-sm">
                      <div className="flex items-center gap-4">
                        <div className="rounded-xl bg-[var(--nodu-accent-soft)] p-2 text-[var(--nodu-accent)]">
                          <Receipt size={20} />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-[var(--nodu-text)]">{inv.id}</div>
                          <div className="text-[10px] text-[var(--nodu-text-soft)]">
                            {inv.job} - {inv.sentAt ? formatShortDate(inv.sentAt) : '-'}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <div className="text-xs font-bold text-[var(--nodu-text)]">{formatCurrency(inv.total)}</div>
                          <div className="text-[10px] text-[var(--nodu-text-soft)]">{inv.hours}h + {inv.km}km</div>
                        </div>
                        <StatusBadge status={inv.status} />
                      </div>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <AnimatePresence>
            {showScrollCue && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                className="pointer-events-none absolute inset-x-5 bottom-5 flex flex-col items-center justify-end"
              >
                <div className="absolute inset-x-0 bottom-0 h-20 rounded-b-xl bg-gradient-to-t from-white via-white/85 to-transparent dark:from-slate-900 dark:via-slate-900/85" />
                <motion.div
                  animate={{ y: [0, 6, 0] }}
                  transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                  className="relative z-10 rounded-full border border-[rgba(var(--nodu-accent-rgb),0.24)] bg-white/95 px-3 py-1.5 text-[11px] font-medium text-[var(--nodu-accent)] shadow-sm"
                >
                  <span className="flex items-center gap-1.5">
                    Posunout niz
                    <ChevronDownCircle size={14} />
                  </span>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="mb-6 overflow-hidden rounded-[24px] border border-[var(--nodu-border)] bg-white shadow-[0_18px_40px_rgba(var(--nodu-text-rgb),0.06)]">
        <div className="border-b border-[rgba(var(--nodu-text-rgb),0.06)] p-4 text-sm font-semibold text-[var(--nodu-text)]">Historie timelogu</div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[rgba(var(--nodu-text-rgb),0.06)] text-left text-[10px] uppercase tracking-wider text-[var(--nodu-text-soft)]">
                <th className="px-4 py-3 font-bold">Akce</th>
                <th className="px-4 py-3 font-bold">Hodiny</th>
                <th className="px-4 py-3 font-bold">Km</th>
                <th className="px-4 py-3 font-bold">Celkem</th>
                <th className="px-4 py-3 font-bold">Status</th>
                <th className="px-4 py-3 font-bold"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgba(var(--nodu-text-rgb),0.06)]">
              {cTls.map((t) => {
                const e = events.find((event) => event.id === t.eid);
                if (!e) return null;
                const hours = calculateTotalHours(t.days);

                return (
                  <tr key={t.id} className="transition-colors hover:bg-[var(--nodu-accent-soft)]">
                    <td className="px-4 py-3">
                      <div className="text-xs font-medium text-[var(--nodu-text)]">{e.name}</div>
                      <div className="font-mono text-[10px] text-[var(--nodu-accent)]">{e.job}</div>
                    </td>
                    <td className="px-4 py-3 text-xs font-semibold text-[var(--nodu-text)]">{hours.toFixed(1)}h</td>
                    <td className="px-4 py-3 text-xs text-[var(--nodu-text-soft)]">{t.km || '-'}</td>
                    <td className="px-4 py-3 text-xs font-bold text-[var(--nodu-text)]">{formatCurrency(hours * c.rate + t.km * KM_RATE)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={t.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => setEditingTimelog(t)} className="rounded p-1 text-[var(--nodu-text-soft)] hover:bg-[var(--nodu-accent-soft)] hover:text-[var(--nodu-accent)]">
                        <FileText size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mb-8 overflow-hidden rounded-[24px] border border-[var(--nodu-border)] bg-white shadow-[0_18px_40px_rgba(var(--nodu-text-rgb),0.06)]">
        <button
          onClick={() => setIsChartExpanded(!isChartExpanded)}
          className="flex w-full items-center justify-between px-6 py-4 transition-colors hover:bg-[var(--nodu-accent-soft)]"
        >
          <div className="flex items-center gap-3">
            <BarChart3 size={18} className="text-[var(--nodu-accent)]" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--nodu-text)]">Fakturace za dane obdobi</h2>
          </div>
          <ChevronDown size={16} className={`text-[var(--nodu-text-soft)] transition-transform duration-300 ${isChartExpanded ? 'rotate-180' : ''}`} />
        </button>

        <AnimatePresence>
          {isChartExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="px-6 pb-6 pt-2">
                <div className="mb-6 flex justify-end">
                  <div className="flex gap-1 rounded-xl border border-[var(--nodu-border)] bg-white p-1">
                    {(['month', 'quarter', 'year'] as const).map((period) => (
                      <button
                        key={period}
                        onClick={() => setChartPeriod(period)}
                        className={`rounded-lg px-3 py-1.5 text-[10px] font-bold uppercase transition-all ${chartPeriod === period ? 'bg-[var(--nodu-accent)] text-white shadow-sm' : 'text-[var(--nodu-text-soft)] hover:bg-[var(--nodu-accent-soft)] hover:text-[var(--nodu-text)]'}`}
                      >
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
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={(v) => `${v / 1000}k`} />
                      <Tooltip
                        cursor={{ fill: darkMode ? '#111827' : '#f9fafb' }}
                        contentStyle={{
                          backgroundColor: darkMode ? '#111827' : '#fff',
                          border: 'none',
                          borderRadius: '12px',
                          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                          fontSize: '12px',
                        }}
                        formatter={(v: number) => [formatCurrency(v), 'Fakturovano']}
                      />
                      <Bar dataKey="total" fill="var(--nodu-accent)" radius={[4, 4, 0, 0]} barSize={40} />
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
