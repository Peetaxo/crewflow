import React from 'react';
import { Search, Trash2, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { useAppContext } from '../context/useAppContext';
import { useAuth } from '../app/providers/useAuth';
import { createEmptyProject, formatProjectPeriod, getProjectById, getProjectRows } from '../features/projects/services/projects.service';
import { useProjectDependencies } from '../features/projects/hooks/useProjectDependencies';
import { useEventsQuery } from '../features/events/queries/useEventsQuery';
import { useTimelogsQuery } from '../features/timelogs/queries/useTimelogsQuery';
import { useIsMobile } from '../hooks/use-mobile';
import { formatCurrency } from '../utils';
import ProjectStatsView from './ProjectStatsView';

const ProjectList = () => {
  const { setSelectedProjectIdForStats, setEditingProject, setDeleteConfirm, searchQuery, setSearchQuery, role } = useAppContext();
  const isMobile = useIsMobile();
  // Keep the rows reactive when project data changes.
  useProjectDependencies();
  const eventsQuery = useEventsQuery();
  const timelogsQuery = useTimelogsQuery();
  const canManage = role !== 'crew';
  const projectRows = getProjectRows(searchQuery);
  const loading = eventsQuery.isPending || timelogsQuery.isPending;
  const failedQuery = [eventsQuery, timelogsQuery].find((query) => query.isError);
  const createProject = () => setEditingProject(createEmptyProject());

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-w-0 max-w-full">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="nodu-dashboard-kicker">Project Ledger</div>
          <h1 className="text-2xl font-semibold tracking-[-0.03em] text-[color:var(--nodu-text)]">Projekty</h1>
          <p className="mt-1 text-sm text-[color:var(--nodu-text-soft)]">Akce a náklady pod jedním Job Number.</p>
        </div>
        {canManage && <Button onClick={createProject} aria-label="Nový projekt" title="Nový projekt" size="icon" className="hidden h-10 w-10 shrink-0 text-2xl font-semibold md:inline-flex">+</Button>}
      </div>
      {canManage && <Button onClick={createProject} aria-label="Nový projekt" title="Nový projekt" size="icon" className="nodu-event-mobile-create-fab h-10 w-10 rounded-full text-2xl font-semibold shadow-[0_14px_32px_rgba(255,128,13,0.24)] md:hidden">+</Button>}

      <div className="relative mb-3">
        <label htmlFor="project-search" className="sr-only">Vyhledat projekty</label>
        <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--nodu-text-soft)]" />
        <Input id="project-search" type="search" placeholder="Job Number, název nebo klient" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} className="pl-9 pr-11 [&::-webkit-search-cancel-button]:appearance-none" />
        {searchQuery.length > 0 && <Button type="button" variant="ghost" size="icon" aria-label="Vymazat hledání" title="Vymazat hledání" onClick={() => setSearchQuery('')} className="absolute right-0 top-0"><X size={16} aria-hidden="true" /></Button>}
      </div>
      {!failedQuery && !loading && <p role="status" className="mb-3 text-xs text-[color:var(--nodu-text-soft)]">Zobrazeno: {projectRows.length}</p>}

      {failedQuery ? (
        <div role="alert" className="rounded-2xl border border-[color:var(--nodu-border)] p-5 text-sm">
          <p>{failedQuery.error instanceof Error ? failedQuery.error.message : 'Projekty se nepodařilo načíst.'}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => { void eventsQuery.refetch(); void timelogsQuery.refetch(); }}>Zkusit znovu</Button>
        </div>
      ) : loading ? <p role="status" className="py-10 text-center text-sm text-[color:var(--nodu-text-soft)]">Načítání projektů…</p> : (
        <div role="region" aria-label="Seznam projektů" tabIndex={isMobile ? undefined : 0} className={`min-w-0 max-w-full ${isMobile ? 'overflow-hidden' : 'overflow-x-auto'} rounded-[28px] border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.98)] shadow-[0_18px_42px_rgba(47,38,31,0.08)]`}>
          {isMobile ? (
            <ul className="min-w-0 divide-y divide-[color:rgb(var(--nodu-text-rgb)/0.06)]">
              {projectRows.map((project) => (
                <li key={project.id} className="min-w-0">
                  <button type="button" aria-label={`${project.id} ${project.name} ${project.client || '—'}`} onClick={() => setSelectedProjectIdForStats(project.id)} className="grid w-full min-w-0 grid-cols-[minmax(0,5rem)_minmax(0,1fr)] gap-3 px-4 py-3 text-left text-xs transition-colors hover:bg-[color:rgb(var(--nodu-accent-rgb)/0.04)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--nodu-accent)]">
                    <span className="min-w-0 font-semibold text-[color:var(--nodu-accent)] [overflow-wrap:anywhere]">{project.id}</span>
                    <span className="min-w-0">
                      <span className="block min-w-0 font-semibold text-[color:var(--nodu-text)] [overflow-wrap:anywhere]">{project.name}</span>
                      <span className="mt-1 block min-w-0 text-[color:var(--nodu-text-soft)] [overflow-wrap:anywhere]">{project.client || '—'}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <table className="w-full min-w-[760px] border-collapse text-left">
              <thead><tr className="border-b border-[color:rgb(var(--nodu-text-rgb)/0.08)] text-[10px] uppercase tracking-wider text-[color:var(--nodu-text-soft)]">
                {['Job Number', 'Název', 'Období', 'Klient', 'Počet akcí', 'Náklady Crew', 'Akce'].map((label) => <th key={label} className="whitespace-nowrap px-4 py-3 font-medium">{label}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-[color:rgb(var(--nodu-text-rgb)/0.06)]">
                {projectRows.map((project) => (
                  <tr key={project.id} className="cursor-pointer transition-colors hover:bg-[color:rgb(var(--nodu-accent-rgb)/0.04)]" onClick={() => setSelectedProjectIdForStats(project.id)}>
                    <td className="px-4 py-3 text-xs font-semibold text-[color:var(--nodu-accent)]"><button onClick={(event) => { event.stopPropagation(); setSelectedProjectIdForStats(project.id); }} className="text-left">{project.id}</button></td>
                    <td className="px-4 py-3 text-xs font-semibold text-[color:var(--nodu-text)]">{project.name}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-[color:var(--nodu-text-soft)]">{formatProjectPeriod(project.period)}</td>
                    <td className="px-4 py-3 text-xs text-[color:var(--nodu-text)]">{project.client || '—'}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-[color:var(--nodu-text)]">{project.eventCount}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs font-semibold text-[color:var(--nodu-text)]">{formatCurrency(project.crewCost)}</td>
                    <td className="px-4 py-3 text-right">{canManage ? <div className="flex items-center justify-end gap-1">
                      <Button onClick={(event) => { event.stopPropagation(); const fullProject = getProjectById(project.id); if (fullProject) setEditingProject(fullProject); }} variant="outline" size="sm" className="text-[11px]">Upravit</Button>
                      <button onClick={(event) => { event.stopPropagation(); setDeleteConfirm({ type: 'project', id: project.id, name: project.name }); }} className="rounded-lg p-1.5 text-[color:var(--nodu-text-soft)] hover:text-[#c45c39]" aria-label="Smazat projekt" title="Smazat projekt"><Trash2 size={14} /></button>
                    </div> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {projectRows.length === 0 && <p className="px-6 py-12 text-center text-sm text-[color:var(--nodu-text-soft)]">{searchQuery.trim() ? 'Žádné projekty neodpovídají hledání.' : 'Zatím tu nejsou žádné projekty.'}</p>}
        </div>
      )}
    </motion.div>
  );
};

const ProjectsView = () => {
  const { selectedProjectIdForStats, role } = useAppContext();
  const { currentUserId, currentProfileId, role: authRole } = useAuth();
  if (selectedProjectIdForStats) return <ProjectStatsView />;
  return <ProjectList key={JSON.stringify([currentUserId, currentProfileId, authRole, role])} />;
};
export default ProjectsView;
