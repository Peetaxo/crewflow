import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAppContext } from '../context/AppContext';
import StatusBadge from '../components/shared/StatusBadge';
import CrewDetailView from './CrewDetailView';
import ContractorEditModal from '../components/modals/ContractorEditModal';
import { Contractor } from '../types';
import { getCrew, subscribeToCrewChanges } from '../features/crew/services/crew.service';

const AVATAR_PALETTE = [
  { bg: '#E1F5EE', fg: '#0F6E56' },
  { bg: '#EEEDFE', fg: '#534AB7' },
  { bg: '#E6F1FB', fg: '#185FA5' },
  { bg: '#FAEEDA', fg: '#854F0B' },
  { bg: '#EAF3DE', fg: '#3B6D11' },
];

const createEmptyContractor = (nextId: number): Contractor => {
  const palette = AVATAR_PALETTE[(nextId - 1) % AVATAR_PALETTE.length];

  return {
    id: nextId,
    name: '',
    ii: '',
    bg: palette.bg,
    fg: palette.fg,
    tags: [],
    events: 0,
    rate: 200,
    phone: '',
    email: '',
    ico: '',
    dic: '',
    bank: '',
    city: '',
    billingName: '',
    billingStreet: '',
    billingZip: '',
    billingCity: '',
    billingCountry: 'Ceska republika',
    reliable: false,
    rating: null,
    note: '',
  };
};

const CrewView = () => {
  const {
    selectedContractorId,
    setSelectedContractorId,
    searchQuery,
    setDeleteConfirm,
  } = useAppContext();
  const [editingContractor, setEditingContractor] = useState<Contractor | null>(null);
  const [crew, setCrew] = useState<Contractor[]>([]);

  const loadCrew = useCallback(() => {
    setCrew(getCrew({ search: searchQuery }));
  }, [searchQuery]);

  useEffect(() => {
    loadCrew();
  }, [loadCrew]);

  useEffect(() => subscribeToCrewChanges(loadCrew), [loadCrew]);

  const nextContractorId = useMemo(
    () => Math.max(0, ...crew.map((contractor) => contractor.id)) + 1,
    [crew],
  );

  if (selectedContractorId) {
    return <CrewDetailView />;
  }

  const formatRating = (rating?: number | null) => (
    typeof rating === 'number' ? rating.toFixed(1).replace('.0', '') : 'Bez hodnoceni'
  );

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Crew</h1>
        <button
          onClick={() => setEditingContractor(createEmptyContractor(nextContractorId))}
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-700"
        >
          + Novy clen
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-gray-100 text-[10px] uppercase tracking-wider text-gray-400">
              <th className="px-4 py-3 font-medium">Jmeno</th>
              <th className="px-4 py-3 font-medium">Tagy</th>
              <th className="px-4 py-3 font-medium">Akci</th>
              <th className="px-4 py-3 font-medium">Sazba</th>
              <th className="px-4 py-3 font-medium">ICO / DIC</th>
              <th className="px-4 py-3 font-medium">Kontakt</th>
              <th className="px-4 py-3 text-right font-medium">Akce</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {crew.map((contractor) => (
              <tr
                key={contractor.id}
                className="cursor-pointer transition-colors hover:bg-gray-50"
                onClick={() => setSelectedContractorId(contractor.id)}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="av w-7 h-7 text-[10px]" style={{ backgroundColor: contractor.bg, color: contractor.fg }}>
                      {contractor.ii}
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-gray-900">{contractor.name}</div>
                      <div className="text-[10px] text-gray-500">{contractor.city}</div>
                    </div>
                  </div>
                  <div className="mt-1 text-[10px] text-gray-500">
                    Hodnoceni: {formatRating(contractor.rating)} / 5
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {contractor.tags.includes('Ridic') && <StatusBadge status="bg" label="Ridic" />}
                    {contractor.reliable ? <StatusBadge status="full" label="Spolehlivy" /> : <StatusBadge status="pending_ch" label="Overit" />}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs font-semibold">{contractor.events}</td>
                <td className="px-4 py-3 text-xs font-semibold">{contractor.rate} Kc/h</td>
                <td className="px-4 py-3">
                  <div className="text-xs text-gray-700">{contractor.ico || '-'}</div>
                  <div className="text-[10px] text-gray-400">{contractor.dic || '-'}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="text-xs text-gray-700">{contractor.phone}</div>
                  <div className="text-[10px] text-gray-400">{contractor.email}</div>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        setDeleteConfirm({ type: 'crew', id: contractor.id, name: contractor.name });
                      }}
                      className="rounded-lg p-1.5 text-gray-300 transition-all hover:bg-red-50 hover:text-red-600"
                      title="Smazat"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {crew.length === 0 && (
          <div className="py-12 text-center text-sm text-gray-400">Zadni clenove crew</div>
        )}
      </div>

      <ContractorEditModal
        editingContractor={editingContractor}
        onClose={() => setEditingContractor(null)}
        onChange={setEditingContractor}
      />
    </motion.div>
  );
};

export default CrewView;
