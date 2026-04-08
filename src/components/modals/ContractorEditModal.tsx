import React from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { useAppContext } from '../../context/AppContext';

const getInitials = (name: string) => (
  name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
);

const ContractorEditModal = () => {
  const {
    editingContractor,
    setEditingContractor,
    contractors,
    setContractors,
  } = useAppContext();

  if (!editingContractor) return null;

  const isExisting = contractors.some((contractor) => contractor.id === editingContractor.id);

  const handleSave = () => {
    const name = editingContractor.name.trim();

    if (!name) {
      toast.error('Vyplňte jméno člena crew.');
      return;
    }

    if (!editingContractor.city.trim()) {
      toast.error('Vyplňte město.');
      return;
    }

    if (!editingContractor.phone.trim() && !editingContractor.email.trim()) {
      toast.error('Vyplňte alespoň telefon nebo e-mail.');
      return;
    }

    const normalizedContractor = {
      ...editingContractor,
      name,
      ii: getInitials(name),
      city: editingContractor.city.trim(),
      phone: editingContractor.phone.trim(),
      email: editingContractor.email.trim(),
      ico: editingContractor.ico.trim(),
      dic: editingContractor.dic.trim(),
      bank: editingContractor.bank.trim(),
      billingName: editingContractor.billingName?.trim() || name,
      billingStreet: editingContractor.billingStreet?.trim() || '',
      billingZip: editingContractor.billingZip?.trim() || '',
      billingCity: editingContractor.billingCity?.trim() || editingContractor.city.trim(),
      billingCountry: editingContractor.billingCountry?.trim() || 'Česká republika',
      note: editingContractor.note.trim(),
      tags: editingContractor.tags.includes('Ridic') ? ['Ridic'] : [],
      rate: Number(editingContractor.rate) || 0,
    };

    setContractors((prev) => {
      const exists = prev.some((contractor) => contractor.id === normalizedContractor.id);
      return exists
        ? prev.map((contractor) => contractor.id === normalizedContractor.id ? normalizedContractor : contractor)
        : [...prev, normalizedContractor];
    });

    setEditingContractor(null);
    toast.success(isExisting ? 'Člen crew upraven.' : 'Nový člen crew vytvořen.');
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
                {isExisting ? 'Upravit člena crew' : 'Nový člen crew'}
              </h3>
              <button onClick={() => setEditingContractor(null)} className="rounded-full p-1 text-gray-400 hover:bg-gray-100">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4 overflow-y-auto p-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-wider text-gray-500">Jméno</label>
                  <input
                    type="text"
                    value={editingContractor.name}
                    onChange={(e) => setEditingContractor({ ...editingContractor, name: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                    placeholder="Jméno a příjmení"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-wider text-gray-500">Město</label>
                  <input
                    type="text"
                    value={editingContractor.city}
                    onChange={(e) => setEditingContractor({ ...editingContractor, city: e.target.value })}
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
                    onChange={(e) => setEditingContractor({ ...editingContractor, phone: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                    placeholder="777 123 456"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-wider text-gray-500">E-mail</label>
                  <input
                    type="email"
                    value={editingContractor.email}
                    onChange={(e) => setEditingContractor({ ...editingContractor, email: e.target.value })}
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
                    onChange={(e) => setEditingContractor({ ...editingContractor, rate: Number(e.target.value) })}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-wider text-gray-500">ICO</label>
                  <input
                    type="text"
                    value={editingContractor.ico}
                    onChange={(e) => setEditingContractor({ ...editingContractor, ico: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-wider text-gray-500">DIC</label>
                  <input
                    type="text"
                    value={editingContractor.dic}
                    onChange={(e) => setEditingContractor({ ...editingContractor, dic: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-wider text-gray-500">Číslo účtu</label>
                  <input
                    type="text"
                    value={editingContractor.bank}
                    onChange={(e) => setEditingContractor({ ...editingContractor, bank: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                    placeholder="123456789/0800"
                  />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={editingContractor.tags.includes('Ridic')}
                      onChange={(e) => setEditingContractor({
                        ...editingContractor,
                        tags: e.target.checked ? ['Ridic'] : [],
                      })}
                      className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    Označit jako řidiče
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-wider text-gray-500">Fakturační jméno</label>
                  <input
                    type="text"
                    value={editingContractor.billingName || ''}
                    onChange={(e) => setEditingContractor({ ...editingContractor, billingName: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                    placeholder="Jméno nebo firma"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-wider text-gray-500">Fakturační ulice</label>
                  <input
                    type="text"
                    value={editingContractor.billingStreet || ''}
                    onChange={(e) => setEditingContractor({ ...editingContractor, billingStreet: e.target.value })}
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
                    onChange={(e) => setEditingContractor({ ...editingContractor, billingZip: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-wider text-gray-500">Fakturační město</label>
                  <input
                    type="text"
                    value={editingContractor.billingCity || ''}
                    onChange={(e) => setEditingContractor({ ...editingContractor, billingCity: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-wider text-gray-500">Stát</label>
                  <input
                    type="text"
                    value={editingContractor.billingCountry || ''}
                    onChange={(e) => setEditingContractor({ ...editingContractor, billingCountry: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={editingContractor.reliable}
                    onChange={(e) => setEditingContractor({ ...editingContractor, reliable: e.target.checked })}
                    className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  Označit jako spolehlivého člena crew
                </label>

                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-wider text-gray-500">Poznámka</label>
                  <textarea
                    value={editingContractor.note}
                    onChange={(e) => setEditingContractor({ ...editingContractor, note: e.target.value })}
                    className="h-24 w-full resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                    placeholder="Interní poznámka k člověku, zkušenostem nebo dostupnosti"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 border-t border-gray-100 bg-gray-50 p-4">
              <button
                onClick={() => setEditingContractor(null)}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-700 transition-all hover:bg-white"
              >
                Zrušit
              </button>
              <button
                onClick={handleSave}
                className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-medium text-white shadow-lg shadow-emerald-200 transition-all hover:bg-emerald-700"
              >
                Uložit člena
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default ContractorEditModal;
