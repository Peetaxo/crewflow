import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Contractor } from '../../types';
import { createCrew, getCrew, updateCrew } from '../../features/crew/services/crew.service';
import { upsertCrewRating } from '../../features/crew/services/crew-ratings.service';
import { resolveCrewName } from '../../features/crew/services/crew-name';

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

  const portalContainer = document.querySelector<HTMLElement>('.nodu-app-shell') ?? document.body;
  const isExisting = getCrew().some((contractor) => contractor.id === editingContractor.id);
  const { firstName, lastName } = resolveCrewName(editingContractor);
  const labelClass = 'mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--nodu-text-soft)]';
  const inputClass = 'w-full rounded-xl border border-[var(--nodu-border)] bg-white px-3 py-2 text-sm text-[var(--nodu-text)] outline-none transition focus:border-[var(--nodu-accent)] focus:ring-2 focus:ring-[rgba(var(--nodu-accent-rgb),0.16)]';
  const checkClass = 'rounded border-[var(--nodu-border)] text-[var(--nodu-accent)] focus:ring-[var(--nodu-accent)]';

  const handleNameChange = (nextFirstName: string, nextLastName: string) => {
    onChange({
      ...editingContractor,
      firstName: nextFirstName,
      lastName: nextLastName,
      name: `${nextFirstName.trim()} ${nextLastName.trim()}`.trim(),
    });
  };

  const handleSave = async () => {
    try {
      const savedContractor = isExisting
        ? await updateCrew(editingContractor)
        : await createCrew(editingContractor);

      if (savedContractor.profileId && editingContractor.rating != null) {
        await upsertCrewRating({
          profileId: savedContractor.profileId,
          source: 'initial',
          rating: editingContractor.rating,
          note: '',
          ratedByProfileId: null,
        });
      }

      onClose();
      toast.success(isExisting ? 'Clen crew upraven.' : 'Novy clen crew vytvoren.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nepodarilo se ulozit clena crew.');
    }
  };

  return createPortal(
    <AnimatePresence>
      {editingContractor && (
        <div className="fixed inset-0 z-[100] overflow-hidden bg-white">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex h-dvh w-full flex-col overflow-hidden bg-white"
            style={{ paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)' }}
          >
            <div className="shrink-0 border-b border-[var(--nodu-border)] px-5 pb-4 pt-[calc(1rem+env(safe-area-inset-top))]">
              <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4">
                <h3 className="font-semibold text-[var(--nodu-text)]">
                  {isExisting ? 'Upravit clena crew' : 'Novy clen crew'}
                </h3>
                <button type="button" aria-label="Zavřít formulář člena" onClick={onClose} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--nodu-text-soft)] transition hover:bg-[var(--nodu-accent-soft)] hover:text-[var(--nodu-text)]">
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <div className="mx-auto w-full max-w-3xl space-y-4 p-5">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label htmlFor="contractor-first-name" className={labelClass}>Jméno</label>
                    <input
                      id="contractor-first-name"
                      type="text"
                      autoComplete="given-name"
                      value={firstName}
                      onChange={(e) => handleNameChange(e.target.value, lastName)}
                      className={inputClass}
                      placeholder="Jméno"
                    />
                  </div>
                  <div>
                    <label htmlFor="contractor-last-name" className={labelClass}>Příjmení</label>
                    <input
                      id="contractor-last-name"
                      type="text"
                      autoComplete="family-name"
                      value={lastName}
                      onChange={(e) => handleNameChange(firstName, e.target.value)}
                      className={inputClass}
                      placeholder="Příjmení"
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
                    <label className={labelClass}>Uvodni hodnoceni 0-10</label>
                    <input
                      type="number"
                      min="0"
                      max="10"
                      step="1"
                      value={editingContractor.rating ?? ''}
                      onChange={(e) => onChange({
                        ...editingContractor,
                        rating: e.target.value === '' ? null : Number(e.target.value),
                      })}
                      className={`${inputClass} mb-4`}
                      placeholder="napr. 8"
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
            </div>

            <div className="shrink-0 border-t border-[var(--nodu-border)] bg-white px-5 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <div className="mx-auto flex w-full max-w-3xl gap-3">
                <button
                  onClick={onClose}
                  className="min-h-11 flex-1 rounded-xl border border-[var(--nodu-border)] py-2.5 text-sm font-medium text-[var(--nodu-text)] transition-all hover:bg-[var(--nodu-accent-soft)]"
                >
                  Zrusit
                </button>
                <button
                  onClick={handleSave}
                  className="min-h-11 flex-1 rounded-xl bg-[var(--nodu-accent)] py-2.5 text-sm font-semibold text-white shadow-[0_16px_32px_rgba(var(--nodu-accent-rgb),0.18)] transition-all hover:bg-[#e96f00]"
                >
                  Ulozit clena
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    portalContainer,
  );
};

export default ContractorEditModal;
