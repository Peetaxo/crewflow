import React, { useCallback, useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '../components/ui/button';
import { useAppContext } from '../context/useAppContext';
import { createEmptyClient, getClientCards, subscribeToClientChanges } from '../features/clients/services/clients.service';
import ClientStatsView from './ClientStatsView';

const ClientsView = () => {
  const {
    selectedClientIdForStats,
    setEditingClient,
    setDeleteConfirm,
    setSelectedClientIdForStats,
    searchQuery,
  } = useAppContext();

  const [clients, setClients] = useState<ReturnType<typeof getClientCards>>([]);

  const loadClients = useCallback(() => {
    setClients(getClientCards(searchQuery));
  }, [searchQuery]);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  useEffect(() => subscribeToClientChanges(loadClients), [loadClients]);

  if (selectedClientIdForStats) {
    return <ClientStatsView />;
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <div className="nodu-dashboard-kicker">Client Directory</div>
          <h1 className="text-2xl font-semibold tracking-[-0.03em] text-[color:var(--nodu-text)]">Klienti</h1>
        </div>
        <Button
          onClick={() => setEditingClient(createEmptyClient())}
          size="sm"
          className="text-xs"
        >
          + Novy klient
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {clients.map((client) => (
          <div key={client.id} className="relative rounded-[28px] border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.98)] p-5 shadow-[0_18px_42px_rgba(47,38,31,0.08)] transition-shadow hover:shadow-[0_22px_48px_rgba(47,38,31,0.12)]">
            <button
              onClick={() => setDeleteConfirm({ type: 'client', id: client.id, name: client.name })}
              className="absolute top-4 right-4 rounded-lg p-1.5 text-[color:var(--nodu-text-soft)] hover:bg-[rgba(212,93,55,0.06)] hover:text-[#c45c39] transition-all"
              title="Smazat klienta"
            >
              <Trash2 size={16} />
            </button>

            <div className="flex justify-between items-start mb-3">
              <div>
                <h3 className="text-sm font-bold text-[color:var(--nodu-text)]">{client.name}</h3>
                <p className="text-[11px] text-[color:var(--nodu-text-soft)]">{client.city || '—'}</p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 border-t border-[color:rgb(var(--nodu-text-rgb)/0.08)] pt-4">
              <div>
                <div className="text-[9px] uppercase font-bold text-[color:var(--nodu-text-soft)]">Pocet akci</div>
                <div className="mt-0.5 text-xs font-semibold text-[color:var(--nodu-text)]">{client.eventCount}</div>
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <Button onClick={() => setEditingClient(client)} variant="outline" size="sm" className="flex-1 text-[11px]">
                Upravit
              </Button>
              <Button onClick={() => setSelectedClientIdForStats(client.id)} variant="secondary" size="sm" className="flex-1 text-[11px]">
                Statistiky {'->'}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
};

export default ClientsView;
