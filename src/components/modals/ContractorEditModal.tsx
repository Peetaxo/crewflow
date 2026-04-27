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
  const labelClass = 'mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--nodu-text-soft)]';
  const inputClass = 'w-full rounded-xl border border-[var(--nodu-border)] bg-white px-3 py-2 text-sm text-[var(--nodu-text)] outline-none transition focus:border-[var(--nodu-accent)] focus:ring-2 focus:ring-[rgba(var(--nodu-accent-rgb),0.16)]';
  const checkClass = 'rounded border-[var(--nodu-border)] text-[var(--nodu-accent)] focus:ring-[var(--nodu-accent)]';

  const handleSave = () => {
    try {
      if (isExisting) {
        updateCrew(editingContractor);
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
            className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-[24px] border border-[var(--nodu-border)] bg-white shadow-[var(--nodu-shadow)]"
          >
            <div className="flex items-center justify-between border-b border-[var(--nodu-border)] p-4">
              <h3 className="font-semibold text-[var(--nodu-text)]">
                {isExisting ? 'Upravit clena crew' : 'Novy clen crew'}
              </h3>
              <button onClick={onClose} className="rounded-full p-1.5 text-[var(--nodu-text-soft)] transition hover:bg-[var(--nodu-accent-soft)] hover:text-[var(--nodu-text)]">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4 overflow-y-auto p-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className={labelClass}>Jmeno</label>
                  <input
                    type="text"
                    value={editingContractor.name}
                    onChange={(e) => onChange({ ...editingContractor, name: e.target.value })}
                    className={inputClass}
                    placeholder="Jmeno a prijmeni"
                  />
                </div>
                <div>
                  <label className={labelClass}>Mesto</label>
                  <input
                    type="text"
                    value={editingContractor.city}
                    onChange={(e) => onChange({ ...editingContractor, city: e.target.value })}
                    className={inputClass}
                    placeholder="Praha"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className={labelClass}>Telefon</label>
                  <input
                    type="text"
                    value={editingContractor.phone}
                    onChange={(e) => onChange({ ...editingContractor, phone: e.target.value })}
                    className={inputClass}
                    placeholder="777 123 456"
                  />
                </div>
                <div>
                  <label className={labelClass}>E-mail</label>
                  <input
                    type="email"
                    value={editingContractor.email}
                    onChange={(e) => onChange({ ...editingContractor, email: e.target.value })}
                    className={inputClass}
                    placeholder="jmeno@email.cz"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <label className={labelClass}>Sazba / hod</label>
                  <input
                    type="number"
                    min="0"
                    value={editingContractor.rate}
                    onChange={(e) => onChange({ ...editingContractor, rate: Number(e.target.value) })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>ICO</label>
                  <input
                    type="text"
                    value={editingContractor.ico}
                    onChange={(e) => onChange({ ...editingContractor, ico: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>DIC</label>
                  <input
                    type="text"
                    value={editingContractor.dic}
                    onChange={(e) => onChange({ ...editingContractor, dic: e.target.value })}
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className={labelClass}>Cislo uctu</label>
                  <input
                    type="text"
                    value={editingContractor.bank}
                    onChange={(e) => onChange({ ...editingContractor, bank: e.target.value })}
                    className={inputClass}
                    placeholder="123456789/0800"
                  />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-sm text-[var(--nodu-text)]">
                    <input
                      type="checkbox"
                      checked={editingContractor.tags.includes('Ridic')}
                      onChange={(e) => onChange({
                        ...editingContractor,
                        tags: e.target.checked ? ['Ridic'] : [],
                      })}
                      className={checkClass}
                    />
                    Oznacit jako ridice
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className={labelClass}>Fakturacni jmeno</label>
                  <input
                    type="text"
                    value={editingContractor.billingName || ''}
                    onChange={(e) => onChange({ ...editingContractor, billingName: e.target.value })}
                    className={inputClass}
                    placeholder="Jmeno nebo firma"
                  />
                </div>
                <div>
                  <label className={labelClass}>Fakturacni ulice</label>
                  <input
                    type="text"
                    value={editingContractor.billingStreet || ''}
                    onChange={(e) => onChange({ ...editingContractor, billingStreet: e.target.value })}
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <label className={labelClass}>PSC</label>
                  <input
                    type="text"
                    value={editingContractor.billingZip || ''}
                    onChange={(e) => onChange({ ...editingContractor, billingZip: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Fakturacni mesto</label>
                  <input
                    type="text"
                    value={editingContractor.billingCity || ''}
                    onChange={(e) => onChange({ ...editingContractor, billingCity: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Stat</label>
                  <input
                    type="text"
                    value={editingContractor.billingCountry || ''}
                    onChange={(e) => onChange({ ...editingContractor, billingCountry: e.target.value })}
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="space-y-4">
                <label className="flex items-center gap-2 text-sm text-[var(--nodu-text)]">
                  <input
                    type="checkbox"
                    checked={editingContractor.reliable}
                    onChange={(e) => onChange({ ...editingContractor, reliable: e.target.checked })}
                    className={checkClass}
                  />
                  Oznacit jako spolehliveho clena crew
                </label>

                <div>
                  <label className={labelClass}>Hodnoceni 1-5</label>
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
                    className={`${inputClass} mb-4`}
                    placeholder="napr. 4.5"
                  />
                  <label className={labelClass}>Poznamka</label>
                  <textarea
                    value={editingContractor.note}
                    onChange={(e) => onChange({ ...editingContractor, note: e.target.value })}
                    className={`${inputClass} h-24 resize-none`}
                    placeholder="Interni poznamka k cloveku, zkusenostem nebo dostupnosti"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 border-t border-[var(--nodu-border)] bg-white p-4">
              <button
                onClick={onClose}
                className="flex-1 rounded-xl border border-[var(--nodu-border)] py-2.5 text-sm font-medium text-[var(--nodu-text)] transition-all hover:bg-[var(--nodu-accent-soft)]"
              >
                Zrusit
              </button>
              <button
                onClick={handleSave}
                className="flex-1 rounded-xl bg-[var(--nodu-accent)] py-2.5 text-sm font-semibold text-white shadow-[0_16px_32px_rgba(var(--nodu-accent-rgb),0.18)] transition-all hover:bg-[#e96f00]"
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
