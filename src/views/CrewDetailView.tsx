import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CalendarDays, CheckCircle2, Mail, MapPin, Phone, Receipt, Star } from 'lucide-react';
import { motion } from 'framer-motion';
import { format, parseISO } from 'date-fns';
import { cs } from 'date-fns/locale';
import { useAppContext } from '../context/useAppContext';
import { Button } from '../components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import ShiftCard from '../components/shared/ShiftCard';
import { formatCurrency } from '../utils';
import { getCrewDetailData, subscribeToCrewChanges } from '../features/crew/services/crew.service';
import { categorizeCrewTimelogs, resolveNextShiftDisplay, resolveShiftProject } from '../features/crew/services/crew-shift-display';
import { findCrewTimelogEvent, getCrewOverviewStats, isCrewTimelogInFilter, type CrewTimelogFilter } from '../features/crew/services/crew-presentation';
import { useSharedApprovals } from '../features/shift-workflows/useSharedApprovals';
import CrewShiftWorkflowManagement from '../features/shift-workflows/CrewShiftWorkflowManagement';
import ShiftWorkflowSummary from '../features/shift-workflows/ShiftWorkflowSummary';
import { CrewInvoiceRecords, CrewTimelogRecords } from '../features/crew/components/CrewDetailRecords';
import CrewProfilePanel from '../features/crew/components/CrewProfilePanel';
import CrewBillingChart from '../features/crew/components/CrewBillingChart';
import CrewInvitationPanel from '../features/onboarding/CrewInvitationPanel';
import type { Event } from '../types';

type DetailTab = 'shifts' | 'timelogs' | 'invoices';
const reportCount = (count: number) => count === 1 ? '1 výkaz' : count >= 2 && count <= 4 ? `${count} výkazy` : `${count} výkazů`;

export default function CrewDetailView() {
  const { role, selectedContractorProfileId, setSelectedContractorProfileId, setCurrentTab, setSelectedEventId, setEventTab, setEditingTimelog, darkMode } = useAppContext();
  const [detail, setDetail] = useState(() => getCrewDetailData(selectedContractorProfileId));
  const loadDetail = useCallback(() => setDetail(getCrewDetailData(selectedContractorProfileId)), [selectedContractorProfileId]);
  useEffect(() => { loadDetail(); }, [loadDetail]);
  useEffect(() => subscribeToCrewChanges(loadDetail), [loadDetail]);
  const { contractor, events, projects, timelogs, invoices } = detail;
  const categorized = useMemo(() => categorizeCrewTimelogs(timelogs, events), [timelogs, events]);
  const stats = useMemo(() => getCrewOverviewStats(timelogs, invoices), [timelogs, invoices]);
  const sharedApprovals = useSharedApprovals(timelogs, events, contractor ? [contractor] : []);
  const [activeTab, setActiveTab] = useState<DetailTab>(() => categorizeCrewTimelogs(detail.timelogs, detail.events).upcoming.length ? 'shifts' : 'timelogs');
  const [reportFilter, setReportFilter] = useState<CrewTimelogFilter>('all');
  const recordsRef = useRef<HTMLDivElement>(null);
  const upcoming = useMemo(() => categorized.upcoming.flatMap((timelog) => {
    const event = findCrewTimelogEvent(timelog, events);
    const project = resolveShiftProject(event, projects);
    const display = event ? resolveNextShiftDisplay(timelog, event) : null;
    return event && project && display ? [{ timelog, event, project, display }] : [];
  }).sort((a, b) => a.display.sortKey.localeCompare(b.display.sortKey)), [categorized.upcoming, events, projects]);
  const nextShift = upcoming[0];
  const visibleReports = timelogs.filter((timelog) => isCrewTimelogInFilter(timelog, reportFilter));
  const openRecords = (tab: DetailTab, filter: CrewTimelogFilter = 'all') => {
    setActiveTab(tab); setReportFilter(filter);
    recordsRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  };
  const openEvent = (event: Event) => { setCurrentTab('events'); setSelectedEventId(event.supabaseId ?? event.id); setEventTab('overview'); };
  const back = <Button type="button" variant="ghost" className="mb-3 -ml-3 min-h-11" onClick={() => setSelectedContractorProfileId(null)}><ArrowLeft size={16} />Zpět na Crew</Button>;
  if (!contractor) return <div>{back}<div className="rounded-[24px] border border-[var(--nodu-border)] bg-white p-6"><h1 className="text-lg font-semibold text-[var(--nodu-text)]">Profil není dostupný</h1><p className="mt-2 text-sm text-[var(--nodu-text-soft)]">Vrať se do seznamu a vyber člověka znovu.</p></div></div>;
  const summaryClass = 'flex min-w-0 flex-col rounded-[22px] border border-[var(--nodu-border)] bg-white p-4 text-left transition hover:border-[var(--nodu-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nodu-accent-soft)]';

  return <CrewShiftWorkflowManagement profileId={contractor.profileId ?? null}>
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-w-0 space-y-5">
      <div>{back}
        <header className="rounded-[24px] border border-[var(--nodu-border)] bg-white p-4 sm:p-6">
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="av h-14 w-14 shrink-0 text-lg" style={{ backgroundColor: contractor.bg, color: contractor.fg }}>{contractor.ii}</div>
            <div className="min-w-0 flex-1"><h1 className="break-words text-xl font-semibold text-[var(--nodu-text)]">{contractor.name}</h1>
              <p className="mt-1 flex items-center gap-1 text-xs text-[var(--nodu-text-soft)]"><MapPin size={13} />{contractor.city || 'Město neuvedeno'}</p>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs"><span className="font-semibold text-[var(--nodu-text)]">{contractor.rate.toLocaleString('cs-CZ')} Kč/h</span>
                {role !== 'crew' && <span className="flex items-center gap-1 text-[var(--nodu-text-soft)]"><Star size={13} className="text-[var(--nodu-accent)]" />{typeof contractor.rating === 'number' ? `${contractor.rating.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} / 10` : 'Bez hodnocení'}</span>}
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {contractor.phone && <Button asChild variant="outline" className="min-h-11"><a href={`tel:${contractor.phone.replace(/[^+\d]/g, '')}`}><Phone size={15} />Zavolat<span className="hidden sm:inline"> · {contractor.phone}</span></a></Button>}
            {contractor.email && <Button asChild variant="outline" className="min-h-11"><a href={`mailto:${contractor.email}`}><Mail size={15} />Napsat e-mail</a></Button>}
            {!contractor.phone && !contractor.email && <p className="text-xs text-[var(--nodu-text-soft)]">Kontakt zatím není vyplněný.</p>}
          </div>
        </header>
        {role === 'coo' && <CrewInvitationPanel profileId={contractor.profileId ?? null} name={contractor.name} email={contractor.email ?? ''} />}
      </div>

      <section aria-label="Aktuální přehled" className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <button type="button" onClick={() => openRecords('shifts')} className={`${summaryClass} col-span-2 lg:col-span-1`}>
          <span className="mb-3 flex items-center gap-2 text-xs text-[var(--nodu-text-soft)]"><CalendarDays size={16} className="text-[var(--nodu-accent)]" />Nejbližší směna</span>
          <span className="break-words text-base font-semibold text-[var(--nodu-text)]">{nextShift ? nextShift.event.name : 'Žádná naplánovaná směna'}</span>
          <span className="mt-1 text-xs text-[var(--nodu-text-soft)]">{nextShift ? `${format(parseISO(nextShift.display.date), 'EEE d. M.', { locale: cs })}${nextShift.display.time ? ` · ${nextShift.display.time}` : ''}` : 'Nadcházející směny se zobrazí tady.'}</span>
        </button>
        <button type="button" onClick={() => openRecords('timelogs', 'pending')} className={summaryClass}>
          <span className="mb-3 flex items-center gap-2 text-xs text-[var(--nodu-text-soft)]"><CheckCircle2 size={16} className="shrink-0 text-[var(--nodu-warning-text)]" />Ke schválení</span>
          <span className="text-lg font-semibold text-[var(--nodu-text)]">{reportCount(stats.pendingCount)}</span><span className="mt-1 text-xs text-[var(--nodu-text-soft)]">{stats.pendingHours.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} h ve schvalování</span>
        </button>
        <button type="button" onClick={() => openRecords('invoices')} className={summaryClass}>
          <span className="mb-3 flex items-center gap-2 text-xs text-[var(--nodu-text-soft)]"><Receipt size={16} className="shrink-0 text-[var(--nodu-info-text)]" />K proplacení</span>
          <span className="break-words text-lg font-semibold text-[var(--nodu-text)]">{formatCurrency(stats.toPayAmount)}</span><span className="mt-1 text-xs text-[var(--nodu-text-soft)]">Odeslané faktury</span>
        </button>
      </section>
      {stats.correctionCount > 0 && <button type="button" onClick={() => openRecords('timelogs', 'corrections')} className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl bg-[var(--nodu-warning-bg)] px-4 py-3 text-left text-xs text-[var(--nodu-warning-text)]"><span>{reportCount(stats.correctionCount)} k opravě nebo potvrzení</span><ArrowRight size={15} className="shrink-0" /></button>}

      <div ref={recordsRef} className="scroll-mt-5 rounded-[24px] border border-[var(--nodu-border)] bg-white p-3 sm:p-5">
        <Tabs value={activeTab} onValueChange={(value) => { setActiveTab(value as DetailTab); setReportFilter('all'); }}>
          <TabsList className="grid h-auto w-full grid-cols-3 gap-1 shadow-none" aria-label="Záznamy člena crew">
            {[{ id: 'shifts', label: 'Směny', count: upcoming.length }, { id: 'timelogs', label: 'Výkazy', count: timelogs.length }, { id: 'invoices', label: 'Faktury', count: invoices.length }].map((tab) => <TabsTrigger key={tab.id} value={tab.id} className="min-h-11 gap-1.5 px-2 text-xs sm:text-sm">{tab.label}<span className="rounded-full bg-[rgba(var(--nodu-text-rgb),0.06)] px-1.5 text-[10px]">{tab.count}</span></TabsTrigger>)}
          </TabsList>
          <TabsContent value="shifts" className="mt-5">
            <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-2">{upcoming.map(({ timelog, event, project }) => <div key={timelog.supabaseId ?? timelog.id} className="min-w-0"><ShiftCard timelog={timelog} event={event} project={project} onClick={() => openEvent(event)} /><ShiftWorkflowSummary event={event} /></div>)}</div>
            {upcoming.length === 0 && <div className="py-10 text-center"><CalendarDays size={25} className="mx-auto mb-3 text-[var(--nodu-text-soft)]" /><h2 className="text-sm font-semibold text-[var(--nodu-text)]">Žádné nadcházející směny</h2><p className="mt-2 text-xs text-[var(--nodu-text-soft)]">Historie práce a rozpracované záznamy jsou ve Výkazech.</p><Button type="button" variant="ghost" className="mt-3 min-h-11" onClick={() => openRecords('timelogs')}>Zobrazit výkazy<ArrowRight size={14} /></Button></div>}
          </TabsContent>
          <TabsContent value="timelogs" className="mt-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-sm font-semibold text-[var(--nodu-text)]">Výkazy a historie práce</h2><select aria-label="Filtrovat výkazy" value={reportFilter} onChange={(event) => setReportFilter(event.target.value as CrewTimelogFilter)} className="min-h-11 rounded-xl border border-[var(--nodu-border)] bg-white px-3 text-xs text-[var(--nodu-text)]"><option value="all">Všechny výkazy</option><option value="pending">Ke schválení</option><option value="corrections">K doplnění a potvrzení</option><option value="approved">Schválené a vyúčtované</option></select></div>
            {visibleReports.length > 0 ? <>{sharedApprovals.cards(visibleReports)}<CrewTimelogRecords timelogs={sharedApprovals.legacyOnly(visibleReports)} events={events} contractor={contractor} role={role} onEdit={setEditingTimelog} /></> : <div className="rounded-2xl border border-dashed border-[var(--nodu-border)] py-10 text-center text-sm text-[var(--nodu-text-soft)]">{timelogs.length ? 'V tomto stavu nejsou žádné výkazy.' : 'Zatím žádné výkazy.'}</div>}
            <p className="mt-4 text-xs text-[var(--nodu-text-soft)]">Schválené hodiny celkem: {stats.approvedHours.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} h</p>
          </TabsContent>
          <TabsContent value="invoices" className="mt-5"><p className="mb-4 text-xs text-[var(--nodu-text-soft)]">Vyplaceno celkem: <span className="font-semibold text-[var(--nodu-text)]">{formatCurrency(stats.paidAmount)}</span> · Z proplacených faktur</p><CrewInvoiceRecords invoices={invoices} /></TabsContent>
        </Tabs>
      </div>
      <CrewProfilePanel key={contractor.profileId ?? contractor.id} contractor={contractor} />
      <CrewBillingChart invoices={invoices} darkMode={darkMode} />
    </motion.div>
  </CrewShiftWorkflowManagement>;
}
