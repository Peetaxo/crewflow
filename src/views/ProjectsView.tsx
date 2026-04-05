import React from 'react';
import { Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAppContext } from '../context/AppContext';
import { calculateTotalHours } from '../utils';
import StatusBadge from '../components/shared/StatusBadge';
import ProjectStatsView from './ProjectStatsView';

/** Pohled na projekty (Job Numbers) */
const ProjectsView = () => {
  const {
    selectedProjectIdForStats, setSelectedProjectIdForStats,
    filteredProjects, events, timelogs, projects,
    setEditingProject, setDeleteConfirm,
    projectFilter, setProjectFilter,
    clients,
  } = useAppContext();

  if (selectedProjectIdForStats) {
    return <ProjectStatsView />;
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="flex justify-between items-center mb-5">
        <h1 className="text-lg font-semibold">Projekty (Job Numbers)</h1>
        <div className="flex gap-2">
          <div className="flex bg-white border border-gray-200 rounded-lg p-0.5 mr-2">
            {[
              { id: 'all', lbl: 'Vše' },
              { id: 'upcoming', lbl: 'Nadcházející' },
              { id: 'past', lbl: 'Uplynulé' },
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setProjectFilter(f.id)}
                className={`px-3 py-1 rounded-md text-[11px] font-medium transition-all ${projectFilter === f.id ? 'bg-emerald-50 text-emerald-700 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
              >
                {f.lbl}
              </button>
            ))}
          </div>
          <button
            onClick={() => setEditingProject({ id: '', name: '', client: '', createdAt: new Date().toISOString().split('T')[0] })}
            className="px-3 py-1.5 bg-emerald-600 text-white rounded-md text-xs font-medium hover:bg-emerald-700 transition-colors"
          >
            + Nový projekt
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredProjects.map(p => {
          const pEvents = events.filter(e => e.job === p.id);
          const now = new Date().toISOString().split('T')[0];
          const isUpcoming = pEvents.some(e => e.startDate >= now);
          const totalHours = timelogs
            .filter(t => pEvents.some(e => e.id === t.eid))
            .reduce((sum, t) => sum + calculateTotalHours(t.days), 0);

          return (
            <div key={p.id} className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow relative group">
              <button
                onClick={() => setDeleteConfirm({ type: 'project', id: p.id, name: p.name })}
                className="absolute top-4 right-4 p-1.5 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                title="Smazat projekt"
              >
                <Trash2 size={16} />
              </button>

              <div className="flex justify-between items-start mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">{p.id}</div>
                    <StatusBadge status={isUpcoming ? 'upcoming' : 'past'} />
                  </div>
                  <h3 className="text-sm font-bold text-gray-900 mt-1">{p.name}</h3>
                  <p className="text-[11px] text-gray-500">{p.client}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-gray-50">
                <div>
                  <div className="text-[9px] text-gray-400 uppercase font-bold">Stav akce</div>
                  <div className="text-xs font-semibold mt-0.5">
                    {pEvents.length > 0 ? (
                      <span className="text-emerald-600">Přiřazeno k akci</span>
                    ) : (
                      <span className="text-amber-600">Volné pro akci</span>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-[9px] text-gray-400 uppercase font-bold">Celkem hodin</div>
                  <div className="text-xs font-semibold mt-0.5">{totalHours.toFixed(1)}h</div>
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <button onClick={() => setEditingProject(p)} className="flex-1 py-1.5 border border-gray-200 rounded-lg text-[11px] font-medium hover:bg-gray-50 transition-colors">
                  Upravit
                </button>
                <button onClick={() => setSelectedProjectIdForStats(p.id)} className="flex-1 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-[11px] font-medium hover:bg-emerald-100 transition-colors">
                  Statistiky →
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
};

export default ProjectsView;
