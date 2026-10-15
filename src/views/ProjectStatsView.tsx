import React, { useState } from 'react';
import { ArrowLeft, Building2, CalendarDays, PencilLine, Wallet } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAppContext } from '../context/useAppContext';
import { useAuth } from '../app/providers/useAuth';
import type { Event } from '../types';
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
import ProjectCosts from '../features/projects/components/ProjectCosts';
import ProjectEventsSection from '../features/projects/components/ProjectEventsSection';
import '../features/projects/components/project-detail.css';

const sectionClass = 'project-overview-section';

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
  const backButton = <button onClick={() => setSelectedProjectIdForStats(null)} className="mb-4 flex items-center gap-1 text-xs font-medium text-[color:var(--nodu-text-soft)] hover:text-[color:var(--nodu-accent)]"><ArrowLeft size={14} aria-hidden="true" /> Zpět na projekty</button>;

  if (selectedEventId !== null) return <EventDetailView backLabel="Zpět na projekt" />;
  if (!summary) return <div>{backButton}<p role="alert">Projekt není dostupný.</p></div>;
  const { project } = summary;

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="project-overview min-w-0 max-w-full text-[color:var(--nodu-text)]">
      {backButton}
      <div className="space-y-5">
        <section className={sectionClass} aria-labelledby="project-title">
          <div className="project-overview-header">
            <div className="min-w-0">
              <span className="project-job-number">{project.id}</span>
              <h1 id="project-title">{project.name}</h1>
              <div className="project-overview-meta">
                <span><Building2 aria-hidden="true" /><span>{project.client || '—'}</span></span>
                <span><CalendarDays aria-hidden="true" /><span><span className="sr-only">Období: </span>{eventsQuery.isError ? 'Není dostupné' : eventsQuery.isPending ? 'Načítání…' : formatProjectPeriod(summary.period)}</span></span>
              </div>
            </div>
            {canManage && <Button variant="outline" size="sm" className="project-edit-button" onClick={() => setEditingProject(project)}><PencilLine aria-hidden="true" />Upravit projekt</Button>}
          </div>
        </section>

        <section className={sectionClass} aria-labelledby="project-costs-title">
          <div className="project-overview-section-heading"><Wallet aria-hidden="true" /><h2 id="project-costs-title">Náklady projektu</h2></div>
          {costsQuery ? <ProjectQueryMessage query={costsQuery} loadingLabel="Načítání nákladů" /> : <ProjectCosts costs={summary.costs} stages={summary.stages} hasMissingRates={summary.hasMissingRates} hasUnknownInvoiceAllocation={summary.hasUnknownInvoiceAllocation} />}
        </section>

        <ProjectEventsSection events={summary.events} query={eventsQuery} canManage={canManage} onOpen={setSelectedEventId} onCreate={() => setEditingEvent({ ...createEmptyEvent(), job: project.id, client: project.client, projectId: project.supabaseId ?? null })} />

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
