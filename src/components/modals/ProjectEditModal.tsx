import React from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppContext } from '../../context/AppContext';

/** Modal pro úpravu / vytvoření projektu */
const ProjectEditModal = () => {
  const { editingProject, setEditingProject, projects, setProjects, clients } = useAppContext();

  if (!editingProject) return null;

  const handleSave = () => {
    setProjects(prev => {
      const exists = prev.some(p => p.id === editingProject.id);
      return exists
        ? prev.map(p => p.id === editingProject.id ? editingProject : p)
        : [...prev, editingProject];
    });
    setEditingProject(null);
  };

  return (
    <AnimatePresence>
      {editingProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col"
          >
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">
                {projects.some(p => p.id === editingProject.id) ? 'Upravit projekt' : 'Nový projekt'}
              </h3>
              <button onClick={() => setEditingProject(null)} className="p-1 hover:bg-gray-100 rounded-full text-gray-400">
                <X size={20} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Job Number (ID)</label>
                <input
                  type="text"
                  value={editingProject.id}
                  onChange={(e) => setEditingProject({ ...editingProject, id: e.target.value })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
                  placeholder="Např. NEX157"
                  disabled={projects.some(p => p.id === editingProject.id)}
                />
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Název projektu</label>
                <input
                  type="text"
                  value={editingProject.name}
                  onChange={(e) => setEditingProject({ ...editingProject, name: e.target.value })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
                  placeholder="Název akce/projektu"
                />
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Klient</label>
                <select
                  value={editingProject.client}
                  onChange={(e) => setEditingProject({ ...editingProject, client: e.target.value })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
                >
                  <option value="">Vyberte klienta</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Poznámka</label>
                <textarea
                  value={editingProject.note || ''}
                  onChange={(e) => setEditingProject({ ...editingProject, note: e.target.value })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none h-20 resize-none"
                />
              </div>
            </div>

            <div className="p-4 border-t border-gray-100 bg-gray-50 flex gap-3">
              <button
                onClick={() => setEditingProject(null)}
                className="flex-1 py-2.5 border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-white transition-all"
              >
                Zrušit
              </button>
              <button
                onClick={handleSave}
                className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 shadow-lg shadow-emerald-200 transition-all"
              >
                Uložit projekt
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default ProjectEditModal;
