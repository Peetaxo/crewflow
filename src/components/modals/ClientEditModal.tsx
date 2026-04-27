import React from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppContext } from '../../context/AppContext';
import { getClients, saveClient } from '../../features/clients/services/clients.service';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';

const ClientEditModal = () => {
  const { editingClient, setEditingClient } = useAppContext();
  const clients = getClients();

  if (!editingClient) return null;

  const handleSave = () => {
    saveClient(editingClient);
    setEditingClient(null);
  };

  return (
    <AnimatePresence>
      {editingClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="flex w-full max-w-md flex-col overflow-hidden rounded-[28px] border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.98)] shadow-[0_28px_80px_rgba(47,38,31,0.18)]"
          >
            <div className="flex items-center justify-between border-b border-[color:rgb(var(--nodu-text-rgb)/0.08)] p-5">
              <h3 className="text-xl font-semibold tracking-[-0.03em] text-[color:var(--nodu-text)]">
                {clients.some((client) => client.id === editingClient.id) ? 'Upravit klienta' : 'Novy klient'}
              </h3>
              <button onClick={() => setEditingClient(null)} className="rounded-xl border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.92)] p-2 text-[color:var(--nodu-text-soft)] transition-all hover:border-[color:rgb(var(--nodu-accent-rgb)/0.24)] hover:text-[color:var(--nodu-accent)]">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-[0.22em] text-[color:var(--nodu-text-soft)]">Nazev klienta</label>
                <Input
                  type="text"
                  value={editingClient.name}
                  onChange={(e) => setEditingClient({ ...editingClient, name: e.target.value })}
                  placeholder="Nazev spolecnosti"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-[0.22em] text-[color:var(--nodu-text-soft)]">ICO</label>
                  <Input
                    type="text"
                    value={editingClient.ico || ''}
                    onChange={(e) => setEditingClient({ ...editingClient, ico: e.target.value })}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-[0.22em] text-[color:var(--nodu-text-soft)]">DIC</label>
                  <Input
                    type="text"
                    value={editingClient.dic || ''}
                    onChange={(e) => setEditingClient({ ...editingClient, dic: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-[0.22em] text-[color:var(--nodu-text-soft)]">Ulice a c.p.</label>
                <Input
                  type="text"
                  value={editingClient.street || ''}
                  onChange={(e) => setEditingClient({ ...editingClient, street: e.target.value })}
                  placeholder="Ulice 123"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-[0.22em] text-[color:var(--nodu-text-soft)]">PSC</label>
                  <Input
                    type="text"
                    value={editingClient.zip || ''}
                    onChange={(e) => setEditingClient({ ...editingClient, zip: e.target.value })}
                    placeholder="123 45"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-[0.22em] text-[color:var(--nodu-text-soft)]">Mesto</label>
                  <Input
                    type="text"
                    value={editingClient.city || ''}
                    onChange={(e) => setEditingClient({ ...editingClient, city: e.target.value })}
                    placeholder="Mesto"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-[0.22em] text-[color:var(--nodu-text-soft)]">Stat</label>
                <Input
                  type="text"
                  value={editingClient.country || ''}
                  onChange={(e) => setEditingClient({ ...editingClient, country: e.target.value })}
                  placeholder="Ceska republika"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-[0.22em] text-[color:var(--nodu-text-soft)]">Poznamka</label>
                <Textarea
                  value={editingClient.note || ''}
                  onChange={(e) => setEditingClient({ ...editingClient, note: e.target.value })}
                  className="h-20 resize-none"
                />
              </div>
            </div>

            <div className="flex gap-3 border-t border-[color:rgb(var(--nodu-text-rgb)/0.08)] bg-[color:rgb(var(--nodu-surface-rgb)/0.92)] p-4">
              <Button
                onClick={() => setEditingClient(null)}
                variant="outline"
                className="flex-1"
              >
                Zrusit
              </Button>
              <Button
                onClick={handleSave}
                className="flex-1"
              >
                Ulozit klienta
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default ClientEditModal;
