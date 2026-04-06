import React, { useMemo } from 'react';
import { Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAppContext } from '../context/AppContext';
import { formatCurrency, getEventStatus } from '../utils';
import StatusBadge from '../components/shared/StatusBadge';
import ProjectStatsView from './ProjectStatsView';

type ProjectRow = {
  id: string;
  name: string;
  client: string;
  status: 'upcoming' | 'full' | 'past' | 'empty';
  eventCount: number;
  crewCost: number;
  createdAt: string;
};

const ProjectsView = () => {
  const {
    selectedProjectIdForStats, setSelectedProjectIdForStats,
    filteredProjects, events, invoices,
    setEditingProject, setDeleteConfirm,
    projectFilter, setProjectFilter,
  } = useAppContext();

  const projectRows = useMemo<ProjectRow[]>(() => (
    filteredProjects
      .map((project) => {
        const projectEvents = events.filter((event) => event.job === project.id);
        const projectInvoices = invoices.filter((invoice) => invoice.job === project.id);

        const status: ProjectRow['status'] = projectEvents.length === 0
          ? 'empty'
          : projectEvents.some((event) => getEventStatus(event) === 'upcoming')
            ? 'upcoming'
            : projectEvents.some((event) => getEventStatus(event) === 'full')
              ? 'full'
              : 'past';

        return {
          id: project.id,
          name: project.name,
          client: project.client,
          status,
          eventCount: projectEvents.length,
          crewCost: projectInvoices.reduce((sum, invoice) => sum + invoice.total, 0),
          createdAt: project.createdAt,
        };
      })
      .sort((a, b) => {
        const statusOrder = { upcoming: 0, full: 1, empty: 2, past: 3 };
        const statusDiff = statusOrder[a.status] - statusOrder[b.status];
        if (statusDiff !== 0) return statusDiff;
        if (b.eventCount !== a.eventCount) return b.eventCount - a.eventCount;
        return a.id.localeCompare(b.id);
      })
  ), [filteredProjects, events, invoices]);

  if (selectedProjectIdForStats) {
    return <ProjectStatsView />;
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-lg font-semibold">Projekty</h1>
          <p className="mt-1 text-xs text-gray-500">Job Number muze mit vice akci a tady je uvidite pohromade.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-gray-200 bg-white p-0.5">
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
                    ? 'bg-emerald-50 text-emerald-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => setEditingProject({ id: '', name: '', client: '', createdAt: new Date().toISOString().split('T')[0] })}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-700"
          >
            + Novy projekt
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-gray-100 text-[10px] uppercase tracking-wider text-gray-400">
              <th className="px-4 py-3 font-medium">Job Number</th>
              <th className="px-4 py-3 font-medium">Nazev</th>
              <th className="px-4 py-3 font-medium">Klient</th>
              <th className="px-4 py-3 font-medium">Stav</th>
              <th className="px-4 py-3 font-medium">Pocet akci</th>
              <th className="px-4 py-3 font-medium">Naklady Crew</th>
              <th className="px-4 py-3 font-medium text-right">Akce</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-50">
            {projectRows.map((project) => (
              <tr
                key={project.id}
                className="cursor-pointer transition-colors hover:bg-gray-50"
                onClick={() => setSelectedProjectIdForStats(project.id)}
              >
                <td className="px-4 py-3">
                  <div className="text-xs font-semibold text-emerald-700">{project.id}</div>
                  <div className="text-[10px] text-gray-400">{project.createdAt}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="text-xs font-semibold text-gray-900">{project.name}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="text-xs text-gray-700">{project.client || '—'}</div>
                </td>
                <td className="px-4 py-3">
                  {project.status === 'empty' ? (
                    <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                      Bez akci
                    </span>
                  ) : (
                    <StatusBadge status={project.status} />
                  )}
                </td>
                <td className="px-4 py-3 text-xs font-semibold text-gray-900">{project.eventCount}</td>
                <td className="px-4 py-3">
                  <div className="text-xs font-semibold text-gray-900">{formatCurrency(project.crewCost)}</div>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        setEditingProject({
                          id: project.id,
                          name: project.name,
                          client: project.client,
                          createdAt: project.createdAt,
                        });
                      }}
                      className="rounded-lg border border-gray-200 px-2.5 py-1 text-[11px] font-medium transition-colors hover:bg-gray-50"
                    >
                      Upravit
                    </button>
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        setDeleteConfirm({ type: 'project', id: project.id, name: project.name });
                      }}
                      className="rounded-lg p-1.5 text-gray-300 transition-all hover:bg-red-50 hover:text-red-600"
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
          <div className="px-6 py-12 text-center text-sm text-gray-400">
            Pro zvoleny filtr tu zatim nejsou zadne projekty.
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default ProjectsView;
