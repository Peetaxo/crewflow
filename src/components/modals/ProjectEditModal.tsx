import React, { useState } from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { useAppContext } from '../../context/useAppContext';
import { getProjectDependencies, saveProject } from '../../features/projects/services/projects.service';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';

const ProjectEditModal = () => {
  const { editingProject, setEditingProject } = useAppContext();
  const [isSaving, setIsSaving] = useState(false);
  const { projects, clients } = getProjectDependencies();

  if (!editingProject) return null;

  const handleSave = async () => {
    if (isSaving) return;

    setIsSaving(true);
    try {
      await saveProject(editingProject);
      setEditingProject(null);
      toast.success('Projekt ulozen.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Projekt se nepodarilo ulozit.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {editingProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="flex w-full max-w-md flex-col overflow-hidden rounded-[28px] border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.98)] shadow-[0_28px_80px_rgba(47,38,31,0.18)]"
          >
            <div className="flex items-center justify-between border-b border-[color:rgb(var(--nodu-text-rgb)/0.08)] p-5">
              <h3 className="text-xl font-semibold tracking-[-0.03em] text-[color:var(--nodu-text)]">
                {projects.some((project) => project.id === editingProject.id) ? 'Upravit projekt' : 'Novy projekt'}
              </h3>
              <button onClick={() => setEditingProject(null)} className="rounded-xl border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.92)] p-2 text-[color:var(--nodu-text-soft)] transition-all hover:border-[color:rgb(var(--nodu-accent-rgb)/0.24)] hover:text-[color:var(--nodu-accent)]">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-[0.22em] text-[color:var(--nodu-text-soft)]">Job Number (ID)</label>
                <Input
                  type="text"
                  value={editingProject.id}
                  onChange={(e) => setEditingProject({ ...editingProject, id: e.target.value })}
                  placeholder="Napr. NEX157"
                  disabled={projects.some((project) => project.id === editingProject.id)}
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-[0.22em] text-[color:var(--nodu-text-soft)]">Nazev projektu</label>
                <Input
                  type="text"
                  value={editingProject.name}
                  onChange={(e) => setEditingProject({ ...editingProject, name: e.target.value })}
                  placeholder="Nazev akce/projektu"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-[0.22em] text-[color:var(--nodu-text-soft)]">Klient</label>
                <select
                  value={editingProject.client}
                  onChange={(e) => setEditingProject({ ...editingProject, client: e.target.value })}
                  className="w-full rounded-xl border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.88)] px-3 py-2 text-sm text-[color:var(--nodu-text)] outline-none focus:border-[color:rgb(var(--nodu-accent-rgb)/0.32)] focus:ring-2 focus:ring-[color:var(--nodu-accent-soft)]"
                >
                  <option value="">Vyberte klienta</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.name}>{client.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-[0.22em] text-[color:var(--nodu-text-soft)]">Poznamka</label>
                <Textarea
                  value={editingProject.note || ''}
                  onChange={(e) => setEditingProject({ ...editingProject, note: e.target.value })}
                  className="h-20 resize-none"
                />
              </div>
            </div>

            <div className="flex gap-3 border-t border-[color:rgb(var(--nodu-text-rgb)/0.08)] bg-[color:rgb(var(--nodu-surface-rgb)/0.92)] p-4">
              <Button
                onClick={() => setEditingProject(null)}
                variant="outline"
                className="flex-1"
              >
                Zrusit
              </Button>
              <Button
                onClick={handleSave}
                disabled={isSaving}
                className="flex-1"
              >
                {isSaving ? 'Ukladam...' : 'Ulozit projekt'}
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default ProjectEditModal;
