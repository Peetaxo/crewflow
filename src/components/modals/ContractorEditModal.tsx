import React from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Contractor } from '../../types';
import { createCrew, getCrew, updateCrew } from '../../features/crew/services/crew.service';

interface ContractorEditModalProps {
  editingContractor: Contractor | null;
  onClose: () => void;
  onChange: (contractor: Contractor | null) => void;
}

const ContractorEditModal = ({
  editingContractor,
  onClose,
  onChange,
}: ContractorEditModalProps) => {
  if (!editingContractor) return null;

  const isExisting = getCrew().some((contractor) => contractor.id === editingContractor.id);

  const handleSave = async () => {
    try {
      if (isExisting) {
        await updateCrew(editingContractor);
      } else {
        createCrew(editingContractor);
      }

      onClose();
      toast.success(isExisting ? 'Clen crew upraven.' : 'Novy clen crew vytvoren.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nepodarilo se ulozit clena crew.');
    }
  };

  return (
    <AnimatePresence>
      {editingContractor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-gray-100 p-4">
              <h3 className="font-semibold text-gray-900">
                {isExisting ? 'Upravit clena crew' : 'Novy clen crew'}
              </h3>
              <button onClick={onClose} className="rounded-full p-1 text-gray-400 hover:bg-gray-100">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4 overflow-y-auto p-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-wider text-gray-500">Jmeno</label>
                  <input
                    type="text"
                    value={editingContractor.name}
                    onChange={(e) => onChange({ ...editingContractor, name: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                    placeholder="Jmeno a prijmeni"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-wider text-gray-500">Mesto</label>
                  <input
                    type="text"
                    value={editingContractor.city}
                    onChange={(e) => onChange({ ...editingContractor, city: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                    placeholder="Praha"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-wider text-gray-500">Telefon</label>
                  <input
                    type="text"
                    value={editingContractor.phone}
                    onChange={(e) => onChange({ ...editingContractor, phone: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                    placeholder="777 123 456"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-wider text-gray-500">E-mail</label>
                  <input
                    type="email"
                    value={editingContractor.email}
                    onChange={(e) => onChange({ ...editingContractor, email: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                    placeholder="jmeno@email.cz"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-wider text-gray-500">Sazba / hod</label>
                  <input
                    type="number"
                    min="0"
                    value={editingContractor.rate}
                    onChange={(e) => onChange({ ...editingContractor, rate: Number(e.target.value) })}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-wider text-gray-500">ICO</label>
                  <input
                    type="text"
                    value={editingContractor.ico}
                    onChange={(e) => onChange({ ...editingContractor, ico: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-wider text-gray-500">DIC</label>
                  <input
                    type="text"
                    value={editingContractor.dic}
                    onChange={(e) => onChange({ ...editingContractor, dic: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-wider text-gray-500">Cislo uctu</label>
                  <input
                    type="text"
                    value={editingContractor.bank}
                    onChange={(e) => onChange({ ...editingContractor, bank: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                    placeholder="123456789/0800"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-wider text-gray-500">IBAN</label>
                  <input
                    type="text"
                    value={editingContractor.iban ?? ''}
                    onChange={(e) => onChange({ ...editingContractor, iban: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                    placeholder="CZ57 5500 0000 0010 2484 5897"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={editingContractor.tags.includes('Ridic')}
                      onChange={(e) => onChange({
                        ...editingContractor,
                        tags: e.target.checked ? ['Ridic'] : [],
                      })}
                      className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    Oznacit jako ridice
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-wider text-gray-500">Fakturacni jmeno</label>
                  <input
                    type="text"
                    value={editingContractor.billingName || ''}
                    onChange={(e) => onChange({ ...editingContractor, billingName: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                    placeholder="Jmeno nebo firma"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-wider text-gray-500">Fakturacni ulice</label>
                  <input
                    type="text"
                    value={editingContractor.billingStreet || ''}
                    onChange={(e) => onChange({ ...editingContractor, billingStreet: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-wider text-gray-500">PSC</label>
                  <input
                    type="text"
                    value={editingContractor.billingZip || ''}
                    onChange={(e) => onChange({ ...editingContractor, billingZip: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-wider text-gray-500">Fakturacni mesto</label>
                  <input
                    type="text"
                    value={editingContractor.billingCity || ''}
                    onChange={(e) => onChange({ ...editingContractor, billingCity: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-wider text-gray-500">Stat</label>
                  <input
                    type="text"
                    value={editingContractor.billingCountry || ''}
                    onChange={(e) => onChange({ ...editingContractor, billingCountry: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={editingContractor.reliable}
                    onChange={(e) => onChange({ ...editingContractor, reliable: e.target.checked })}
                    className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  Oznacit jako spolehliveho clena crew
                </label>

                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-wider text-gray-500">Hodnoceni 1-5</label>
                  <input
                    type="number"
                    min="1"
                    max="5"
                    step="0.5"
                    value={editingContractor.rating ?? ''}
                    onChange={(e) => onChange({
                      ...editingContractor,
                      rating: e.target.value === '' ? null : Number(e.target.value),
                    })}
                    className="mb-4 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                    placeholder="napr. 4.5"
                  />
                  <label className="mb-1 block text-[10px] uppercase tracking-wider text-gray-500">Poznamka</label>
                  <textarea
                    value={editingContractor.note}
                    onChange={(e) => onChange({ ...editingContractor, note: e.target.value })}
                    className="h-24 w-full resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                    placeholder="Interni poznamka k cloveku, zkusenostem nebo dostupnosti"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 border-t border-gray-100 bg-gray-50 p-4">
              <button
                onClick={onClose}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-700 transition-all hover:bg-white"
              >
                Zrusit
              </button>
              <button
                onClick={handleSave}
                className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-medium text-white shadow-lg shadow-emerald-200 transition-all hover:bg-emerald-700"
              >
                Ulozit clena
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default ContractorEditModal;
