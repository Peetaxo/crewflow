import React, { useCallback, useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAppContext } from '../context/AppContext';
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
      <div className="flex justify-between items-center mb-5">
        <h1 className="text-lg font-semibold">Klienti</h1>
        <button
          onClick={() => setEditingClient(createEmptyClient())}
          className="px-3 py-1.5 bg-emerald-600 text-white rounded-md text-xs font-medium hover:bg-emerald-700 transition-colors"
        >
          + Novy klient
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {clients.map((client) => (
          <div key={client.id} className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow relative group">
            <button
              onClick={() => setDeleteConfirm({ type: 'client', id: client.id, name: client.name })}
              className="absolute top-4 right-4 p-1.5 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
              title="Smazat klienta"
            >
              <Trash2 size={16} />
            </button>

            <div className="flex justify-between items-start mb-3">
              <div>
                <h3 className="text-sm font-bold text-gray-900">{client.name}</h3>
                <p className="text-[11px] text-gray-500">{client.city || '—'}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 mt-4 pt-4 border-t border-gray-50">
              <div>
                <div className="text-[9px] text-gray-400 uppercase font-bold">Pocet akci</div>
                <div className="text-xs font-semibold mt-0.5">{client.eventCount}</div>
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <button onClick={() => setEditingClient(client)} className="flex-1 py-1.5 border border-gray-200 rounded-lg text-[11px] font-medium hover:bg-gray-50 transition-colors">
                Upravit
              </button>
              <button onClick={() => setSelectedClientIdForStats(client.id)} className="flex-1 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-[11px] font-medium hover:bg-emerald-100 transition-colors">
                Statistiky {'->'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
};

export default ClientsView;
