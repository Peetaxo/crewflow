import React, { useCallback, useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '../components/ui/button';
import { useAppContext } from '../context/useAppContext';
import { ProjectFilter, createEmptyProject, getProjectById, getProjectRows, subscribeToProjectChanges } from '../features/projects/services/projects.service';
import { formatCurrency } from '../utils';
import StatusBadge from '../components/shared/StatusBadge';
import ProjectStatsView from './ProjectStatsView';

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

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="nodu-dashboard-kicker">Project Ledger</div>
          <h1 className="text-2xl font-semibold tracking-[-0.03em] text-[color:var(--nodu-text)]">Projekty</h1>
          <p className="mt-1 text-sm text-[color:var(--nodu-text-soft)]">Job Number muze mit vice akci a tady je uvidite pohromade.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-[18px] border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.92)] p-1 shadow-[0_12px_28px_rgba(47,38,31,0.08)]">
            {[
              { id: 'all', label: 'Vse' },
              { id: 'upcoming', label: 'Nadchazejici' },
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
            + Novy projekt
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-[28px] border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.98)] shadow-[0_18px_42px_rgba(47,38,31,0.08)]">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-[color:rgb(var(--nodu-text-rgb)/0.08)] text-[10px] uppercase tracking-wider text-[color:var(--nodu-text-soft)]">
              <th className="px-4 py-3 font-medium">Job Number</th>
              <th className="px-4 py-3 font-medium">Nazev</th>
              <th className="px-4 py-3 font-medium">Klient</th>
              <th className="px-4 py-3 font-medium">Stav</th>
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
                onClick={() => setSelectedProjectIdForStats(project.id)}
              >
                <td className="px-4 py-3">
                  <div className="text-xs font-semibold text-[color:var(--nodu-accent)]">{project.id}</div>
                  <div className="text-[10px] text-[color:var(--nodu-text-soft)]">{project.createdAt}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="text-xs font-semibold text-[color:var(--nodu-text)]">{project.name}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="text-xs text-[color:var(--nodu-text)]">{project.client || '—'}</div>
                </td>
                <td className="px-4 py-3">
                  {project.status === 'empty' ? (
                    <span className="inline-flex items-center rounded-full bg-[color:rgb(var(--nodu-text-rgb)/0.08)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--nodu-text-soft)]">
                      Bez akci
                    </span>
                  ) : (
                    <StatusBadge status={project.status} />
                  )}
                </td>
                <td className="px-4 py-3 text-xs font-semibold text-[color:var(--nodu-text)]">{project.eventCount}</td>
                <td className="px-4 py-3">
                  <div className="text-xs font-semibold text-[color:var(--nodu-text)]">{formatCurrency(project.crewCost)}</div>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      onClick={(event) => {
                        event.stopPropagation();
                        const fullProject = getProjectById(project.id);
                        setEditingProject(fullProject ?? {
                          id: project.id,
                          name: project.name,
                          client: project.client,
                          note: '',
                          createdAt: project.createdAt,
                        });
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
            Pro zvoleny filtr tu zatim nejsou zadne projekty.
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default ProjectsView;
