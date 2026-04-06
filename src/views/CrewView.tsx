import React from 'react';
import { Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAppContext } from '../context/AppContext';
import StatusBadge from '../components/shared/StatusBadge';
import CrewDetailView from './CrewDetailView';
import { Contractor } from '../types';

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
    billingCountry: 'Česká republika',
    reliable: false,
    note: '',
  };
};

const CrewView = () => {
  const {
    selectedContractorId,
    setSelectedContractorId,
    filteredContractors,
    setDeleteConfirm,
    contractors,
    setEditingContractor,
  } = useAppContext();
  if (selectedContractorId) return <CrewDetailView />;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="flex justify-between items-center mb-5">
        <h1 className="text-lg font-semibold">Crew</h1>
        <button
          onClick={() => setEditingContractor(createEmptyContractor(Math.max(0, ...contractors.map((c) => c.id)) + 1))}
          className="px-3 py-1.5 bg-emerald-600 text-white rounded-md text-xs font-medium hover:bg-emerald-700 transition-colors"
        >
          + Nový člen
        </button>
      </div>
      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="text-[10px] text-gray-400 uppercase tracking-wider border-b border-gray-100">
              <th className="px-4 py-3 font-medium">Jméno</th>
              <th className="px-4 py-3 font-medium">Tagy</th>
              <th className="px-4 py-3 font-medium">Akcí</th>
              <th className="px-4 py-3 font-medium">Sazba</th>
              <th className="px-4 py-3 font-medium">IČO / DIČ</th>
              <th className="px-4 py-3 font-medium">Kontakt</th>
              <th className="px-4 py-3 font-medium text-right">Akce</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filteredContractors.map((c) => (
              <tr
                key={c.id}
                className="hover:bg-gray-50 transition-colors cursor-pointer"
                onClick={() => setSelectedContractorId(c.id)}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="av w-7 h-7 text-[10px]" style={{ backgroundColor: c.bg, color: c.fg }}>{c.ii}</div>
                    <div>
                      <div className="text-xs font-semibold text-gray-900">{c.name}</div>
                      <div className="text-[10px] text-gray-500">{c.city}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {c.tags.map((t) => <StatusBadge key={t} status="bg" label={t} />)}
                    {c.reliable ? <StatusBadge status="full" label="Spolehlivý" /> : <StatusBadge status="pending_ch" label="Ověřit" />}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs font-semibold">{c.events}</td>
                <td className="px-4 py-3 text-xs font-semibold">{c.rate} Kč/h</td>
                <td className="px-4 py-3">
                  <div className="text-xs text-gray-700">{c.ico || '—'}</div>
                  <div className="text-[10px] text-gray-400">{c.dic || '—'}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="text-xs text-gray-700">{c.phone}</div>
                  <div className="text-[10px] text-gray-400">{c.email}</div>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        setDeleteConfirm({ type: 'crew', id: c.id, name: c.name });
                      }}
                      className="p-1.5 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
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
        {filteredContractors.length === 0 && <div className="py-12 text-center text-gray-400 text-sm">Žádní členové crew</div>}
      </div>
    </motion.div>
  );
};

export default CrewView;
