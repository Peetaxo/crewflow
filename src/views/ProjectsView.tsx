import React, { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Pencil, Plus, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '../components/ui/button';
import { useAppContext } from '../context/useAppContext';
import { ProjectFilter, createEmptyProject, getProjectById, getProjectRows, subscribeToProjectChanges } from '../features/projects/services/projects.service';
import { formatCurrency } from '../utils';
import ProjectStatsView from './ProjectStatsView';

const formatProjectEventCount = (count: number) => {
  if (count === 1) return '1 akce';
  if (count >= 2 && count <= 4) return `${count} akce`;
  return `${count} akcí`;
};

const ProjectsView = () => {
  const {
    selectedProjectIdForStats,
    setSelectedProjectIdForStats,
    setEditingProject,
    setDeleteConfirm,
    projectFilter,
    setProjectFilter,
    searchQuery,
  } = useAppContext();

  const [projectRows, setProjectRows] = useState<ReturnType<typeof getProjectRows>>([]);

  const loadProjects = useCallback(() => {
    setProjectRows(getProjectRows(searchQuery, projectFilter as ProjectFilter));
  }, [searchQuery, projectFilter]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  useEffect(() => subscribeToProjectChanges(loadProjects), [loadProjects]);

  if (selectedProjectIdForStats) {
    return <ProjectStatsView />;
  }

  const openProject = (projectId: string) => setSelectedProjectIdForStats(projectId);

  const editProject = (project: ReturnType<typeof getProjectRows>[number]) => {
    const fullProject = getProjectById(project.id);
    setEditingProject(fullProject ?? {
      id: project.id,
      name: project.name,
      client: project.client,
      note: '',
      createdAt: project.createdAt,
    });
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="nodu-dashboard-kicker">Management</div>
          <h1 className="text-2xl font-semibold tracking-[-0.03em] text-[color:var(--nodu-text)]">Projekty</h1>
          <p className="mt-1 text-sm text-[color:var(--nodu-text-soft)]">Job number a související akce pohromadě.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-[18px] border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.92)] p-1 shadow-[0_12px_28px_rgba(47,38,31,0.08)]">
            {[
              { id: 'all', label: 'Vše' },
              { id: 'upcoming', label: 'Nadcházející' },
              { id: 'past', label: 'Uplynule' },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setProjectFilter(item.id)}
                className={`rounded-md px-3 py-1.5 text-[11px] font-medium transition-all ${
                  projectFilter === item.id
                    ? 'bg-[color:rgb(var(--nodu-accent-rgb)/0.12)] text-[color:var(--nodu-accent)] shadow-[inset_0_0_0_1px_rgba(255,128,13,0.16)]'
                    : 'text-[color:var(--nodu-text-soft)] hover:text-[color:var(--nodu-text)]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <Button
            onClick={() => setEditingProject(createEmptyProject())}
            size="sm"
            className="text-xs"
          >
            <Plus size={14} />
            Nový projekt
          </Button>
        </div>
      </div>

      <div className="space-y-3 lg:hidden">
        {projectRows.map((project) => (
          <article
            key={project.id}
            className="rounded-[26px] border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.98)] p-4 shadow-[0_18px_42px_rgba(47,38,31,0.08)]"
          >
            <button
              type="button"
              className="block w-full text-left"
              onClick={() => openProject(project.id)}
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-2 inline-flex rounded-md border border-[color:rgb(var(--nodu-accent-rgb)/0.24)] bg-[color:rgb(var(--nodu-accent-rgb)/0.08)] px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-[color:var(--nodu-accent)]">
                    {project.id}
                  </div>
                  <h2 className="text-lg font-semibold leading-tight tracking-[-0.02em] text-[color:var(--nodu-text)]">
                    {project.name || project.id}
                  </h2>
                  <p className="mt-1 text-sm font-medium text-[color:var(--nodu-text-soft)]">
                    {project.client || 'Klient není vyplněný'}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-[color:rgb(var(--nodu-text-rgb)/0.06)] px-3 py-1 text-xs font-semibold text-[color:var(--nodu-text)]">
                  {formatProjectEventCount(project.eventCount)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-2xl bg-[color:rgb(var(--nodu-text-rgb)/0.035)] px-3 py-2">
                  <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[color:var(--nodu-text-soft)]">Akce</div>
                  <div className="mt-1 text-sm font-semibold text-[color:var(--nodu-text)]">{formatProjectEventCount(project.eventCount)}</div>
                </div>
                <div className="rounded-2xl bg-[color:rgb(var(--nodu-text-rgb)/0.035)] px-3 py-2">
                  <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[color:var(--nodu-text-soft)]">Crew</div>
                  <div className="mt-1 text-sm font-semibold text-[color:var(--nodu-text)]">{formatCurrency(project.crewCost)}</div>
                </div>
              </div>
            </button>

            <div className="mt-4 flex items-center justify-between gap-2 border-t border-[color:rgb(var(--nodu-text-rgb)/0.08)] pt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-10 flex-1 text-xs"
                onClick={() => openProject(project.id)}
              >
                Otevřít detail
                <ArrowRight size={14} />
              </Button>
              <button
                type="button"
                onClick={() => editProject(project)}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-[color:var(--nodu-border)] bg-white text-[color:var(--nodu-text-soft)] shadow-[0_10px_24px_rgba(47,38,31,0.08)]"
                aria-label={`Upravit projekt ${project.id}`}
              >
                <Pencil size={16} />
              </button>
              <button
                type="button"
                onClick={() => setDeleteConfirm({ type: 'project', id: project.id, name: project.name })}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-[rgba(212,93,55,0.2)] bg-[rgba(212,93,55,0.04)] text-[#c45c39] shadow-[0_10px_24px_rgba(47,38,31,0.06)]"
                aria-label={`Smazat projekt ${project.id}`}
              >
                <Trash2 size={16} />
              </button>
            </div>
          </article>
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-[28px] border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.98)] shadow-[0_18px_42px_rgba(47,38,31,0.08)] lg:block">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-[color:rgb(var(--nodu-text-rgb)/0.08)] text-[10px] uppercase tracking-wider text-[color:var(--nodu-text-soft)]">
              <th className="px-4 py-3 font-medium">Job Number</th>
              <th className="px-4 py-3 font-medium">Nazev</th>
              <th className="px-4 py-3 font-medium">Klient</th>
              <th className="px-4 py-3 font-medium">Pocet akci</th>
              <th className="px-4 py-3 font-medium">Naklady Crew</th>
              <th className="px-4 py-3 font-medium text-right">Akce</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-[color:rgb(var(--nodu-text-rgb)/0.06)]">
            {projectRows.map((project) => (
              <tr
                key={project.id}
                className="cursor-pointer transition-colors hover:bg-[color:rgb(var(--nodu-accent-rgb)/0.04)]"
                onClick={() => openProject(project.id)}
              >
                <td className="px-4 py-3">
                  <div className="text-xs font-semibold text-[color:var(--nodu-accent)]">{project.id}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="text-xs font-semibold text-[color:var(--nodu-text)]">{project.name}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="text-xs text-[color:var(--nodu-text)]">{project.client || '—'}</div>
                </td>
                <td className="px-4 py-3 text-xs font-semibold text-[color:var(--nodu-text)]">{formatProjectEventCount(project.eventCount)}</td>
                <td className="px-4 py-3">
                  <div className="text-xs font-semibold text-[color:var(--nodu-text)]">{formatCurrency(project.crewCost)}</div>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      onClick={(event) => {
                        event.stopPropagation();
                        editProject(project);
                      }}
                      variant="outline"
                      size="sm"
                      className="text-[11px]"
                    >
                      Upravit
                    </Button>
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        setDeleteConfirm({ type: 'project', id: project.id, name: project.name });
                      }}
                      className="rounded-lg p-1.5 text-[color:var(--nodu-text-soft)] transition-all hover:bg-[rgba(212,93,55,0.06)] hover:text-[#c45c39]"
                      title="Smazat projekt"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {projectRows.length === 0 && (
          <div className="px-6 py-12 text-center text-sm text-[color:var(--nodu-text-soft)]">
            Pro zvolený filtr tu zatím nejsou žádné projekty.
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default ProjectsView;
