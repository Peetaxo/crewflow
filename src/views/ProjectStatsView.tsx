import React, { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAppContext } from '../context/useAppContext';
import { useAuth } from '../app/providers/useAuth';
import type { Event } from '../types';
import { formatCurrency } from '../utils';
import { Button } from '../components/ui/button';
import EventEditModal from '../components/modals/EventEditModal';
import { createEmptyEvent } from '../features/events/services/events.service';
import { useEventsQuery } from '../features/events/queries/useEventsQuery';
import { useTimelogsQuery } from '../features/timelogs/queries/useTimelogsQuery';
import { useInvoicesQuery } from '../features/invoices/queries/useInvoicesQuery';
import { useReceiptsQuery } from '../features/receipts/queries/useReceiptsQuery';
import { formatProjectPeriod, getProjectSummary } from '../features/projects/services/projects.service';
import { useProjectDependencies } from '../features/projects/hooks/useProjectDependencies';
import ProjectDocuments, { ProjectQueryMessage } from '../features/projects/components/ProjectDocuments';
import EventDetailView from './EventDetailView';

const sectionClass = 'min-w-0 rounded-[28px] border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.98)] p-5 md:p-6';
const costLabels = [['work', 'Práce'], ['travel', 'Doprava'], ['meals', 'Stravné'], ['receipts', 'Účtenky'], ['total', 'Celkem']] as const;
const stageLabels = [['inProgress', 'Rozpracováno'], ['approved', 'Schváleno'], ['invoiced', 'Vyfakturováno'], ['paid', 'Uhrazeno']] as const;

const ProjectDetail = () => {
  const { selectedProjectIdForStats, setSelectedProjectIdForStats, selectedEventId, setSelectedEventId, setEditingProject, role } = useAppContext();
  const dependencies = useProjectDependencies();
  const eventsQuery = useEventsQuery();
  const timelogsQuery = useTimelogsQuery();
  const invoicesQuery = useInvoicesQuery();
  const receiptsQuery = useReceiptsQuery();
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const summary = getProjectSummary(selectedProjectIdForStats ?? '', {
    ...dependencies,
    events: eventsQuery.data ?? dependencies.events,
    timelogs: timelogsQuery.data ?? dependencies.timelogs,
    invoices: invoicesQuery.data ?? dependencies.invoices,
    receipts: receiptsQuery.data ?? dependencies.receipts,
  });
  const canManage = role !== 'crew';
  const queries = [eventsQuery, timelogsQuery, invoicesQuery, receiptsQuery];
  const failedQuery = queries.find((query) => query.isError);
  const pendingQuery = queries.find((query) => query.isPending || query.data === undefined);
  const costsQuery = failedQuery ?? pendingQuery;
  const backButton = <button onClick={() => setSelectedProjectIdForStats(null)} className="mb-4 flex items-center gap-1 text-xs font-medium text-[color:var(--nodu-text-soft)] hover:text-[color:var(--nodu-accent)]"><ArrowLeft size={14} /> Zpět na projekty</button>;

  if (selectedEventId !== null) return <EventDetailView backLabel="Zpět na projekt" />;
  if (!summary) return <div>{backButton}<p role="alert">Projekt není dostupný.</p></div>;
  const { project } = summary;

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="min-w-0 max-w-full text-[color:var(--nodu-text)]">
      {backButton}
      <div className="space-y-5">
        <section className={sectionClass} aria-labelledby="project-title">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="font-mono text-xs font-semibold text-[color:var(--nodu-accent)]">{project.id}</div>
              <h1 id="project-title" className="mt-1 break-words text-2xl font-semibold tracking-[-0.03em]">{project.name}</h1>
              <p className="mt-1 text-sm text-[color:var(--nodu-text-soft)]">{project.client || '—'}</p>
              <div className="mt-3 text-sm"><span className="mr-2 text-[color:var(--nodu-text-soft)]">Období</span>{eventsQuery.isError ? 'Není dostupné' : eventsQuery.isPending ? 'Načítání…' : formatProjectPeriod(summary.period)}</div>
            </div>
            {canManage && <Button variant="outline" size="sm" onClick={() => setEditingProject(project)}>Upravit projekt</Button>}
          </div>
        </section>

        <section className={sectionClass} aria-labelledby="project-costs-title">
          <h2 id="project-costs-title" className="mb-5 text-lg font-semibold">Náklady projektu</h2>
          {costsQuery ? <ProjectQueryMessage query={costsQuery} loadingLabel="Načítání nákladů" /> : <>
            <dl className="grid grid-cols-2 gap-4 md:grid-cols-5">{costLabels.map(([key, label]) => <div key={key} className={key === 'total' ? 'font-semibold' : ''}><dt className="mb-1 text-xs text-[color:var(--nodu-text-soft)]">{label}</dt><dd className="text-base font-semibold">{formatCurrency(summary.costs[key])}</dd></div>)}</dl>
            <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-[color:var(--nodu-border)] pt-5 md:grid-cols-4">{stageLabels.map(([key, label]) => <div key={key}><dt className="mb-1 text-xs text-[color:var(--nodu-text-soft)]">{label}</dt><dd className="text-base font-semibold">{formatCurrency(summary.stages[key].total)}</dd></div>)}</dl>
            {summary.hasUnknownInvoiceAllocation && <p className="mt-4 text-sm text-[color:var(--nodu-text-soft)]">Některé podíly faktur nejsou známé. Uvedené součty zahrnují pouze známé částky.</p>}
            {summary.hasMissingRates && <p className="mt-4 text-sm text-[color:var(--nodu-text-soft)]">U některých členů Crew chybí sazba. Náklady na práci jsou neúplné.</p>}
          </>}
        </section>

        <section className={sectionClass} aria-labelledby="project-events-title">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 id="project-events-title" className="text-lg font-semibold">Akce projektu</h2>
            {canManage && <Button size="icon" aria-label="Nová akce projektu" title="Nová akce projektu" className="h-9 w-9 text-2xl font-semibold" onClick={() => setEditingEvent({ ...createEmptyEvent(), job: project.id, client: project.client, projectId: project.supabaseId ?? null })}>+</Button>}
          </div>
          <ProjectQueryMessage query={eventsQuery} loadingLabel="Načítání akcí" />
          {!eventsQuery.isPending && !eventsQuery.isError && (summary.events.length ? (
            <div className="max-w-full overflow-x-auto"><table className="w-full min-w-[600px] text-left text-xs">
              <thead><tr className="border-b border-[color:var(--nodu-border)] text-[color:var(--nodu-text-soft)]"><th className="py-3 pr-4">Datum</th><th className="py-3 pr-4">Akce</th><th className="py-3 pr-4">Místo</th><th className="py-3 pr-4">Obsazení</th><th className="py-3">Kontaktní osoba</th></tr></thead>
              <tbody>{summary.events.map((event) => <tr key={event.supabaseId ?? event.id} className="border-b border-[color:var(--nodu-border)] last:border-0">
                <td className="whitespace-nowrap py-3 pr-4">{formatProjectPeriod({ startDate: event.startDate, endDate: event.endDate })}</td>
                <td className="py-3 pr-4"><button className="text-left font-semibold text-[color:var(--nodu-accent)] hover:underline" onClick={() => setSelectedEventId(event.supabaseId ?? event.id)}>{event.name}</button></td>
                <td className="py-3 pr-4">{event.city || event.address || '—'}</td><td className="whitespace-nowrap py-3 pr-4">{event.filled} / {event.needed}</td><td className="py-3">{event.contactPerson || '—'}</td>
              </tr>)}</tbody>
            </table></div>
          ) : <p className="py-4 text-sm text-[color:var(--nodu-text-soft)]">Projekt zatím nemá žádné akce.</p>)}
        </section>

        <ProjectDocuments invoices={summary.invoices} receipts={summary.receipts} events={summary.events} contractors={dependencies.contractors} invoicesQuery={invoicesQuery} receiptsQuery={receiptsQuery} />
      </div>
      {editingEvent && canManage && <EventEditModal key={project.id} editingEvent={editingEvent} onChange={setEditingEvent} onClose={() => setEditingEvent(null)} mode="create" />}
    </motion.div>
  );
};

const ProjectStatsView = () => {
  const { selectedProjectIdForStats, selectedEventId, role } = useAppContext();
  const { currentUserId, currentProfileId, role: authRole, isRoleSwitching } = useAuth();
  // Scope changes unmount dialogs and invalidate pending document requests immediately.
  return <ProjectDetail key={JSON.stringify([selectedProjectIdForStats, selectedEventId, currentUserId, currentProfileId, authRole, role, isRoleSwitching])} />;
};
export default ProjectStatsView;
