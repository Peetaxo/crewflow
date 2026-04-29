import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Plus, Trash2, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import { getDatesBetween } from '../../utils';
import { Event, EventPhaseSlot, TimelogType } from '../../types';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import {
  applyEventDraft,
  createDefaultPhaseTimes,
  getEventFormOptions,
  normalizeEventSchedules,
  saveEvent,
} from '../../features/events/services/events.service';

interface EventEditModalProps {
  editingEvent: Event | null;
  onClose: () => void;
  onChange: (event: Event | null) => void;
}

const PHASES = [
  { id: 'I', type: 'instal' as const, color: 'bg-blue-500 border-blue-600', label: 'Instalace' },
  { id: 'P', type: 'provoz' as const, color: 'bg-emerald-500 border-emerald-600', label: 'Provoz' },
  { id: 'D', type: 'deinstal' as const, color: 'bg-orange-500 border-orange-600', label: 'Deinstalace' },
];

const fieldLabelClass = 'mb-1 block text-[10px] uppercase tracking-[0.22em] text-[color:var(--nodu-text-soft)]';
const nativeFieldClass = 'w-full rounded-xl border border-[color:var(--nodu-border)] bg-white px-3 py-2 text-sm text-[color:var(--nodu-text)] outline-none transition-all focus:border-[color:var(--nodu-accent)] focus:ring-2 focus:ring-[color:rgb(var(--nodu-accent-rgb)/0.14)]';
const smallFieldLabelClass = 'mb-1 block text-[9px] uppercase text-[color:var(--nodu-text-soft)]';
const smallNativeFieldClass = 'w-full rounded-lg border border-[color:var(--nodu-border)] bg-white px-2 py-1 text-[10px] text-[color:var(--nodu-text)] outline-none focus:border-[color:var(--nodu-accent)] focus:ring-2 focus:ring-[color:rgb(var(--nodu-accent-rgb)/0.12)]';

const createSlotId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const EventEditModal = ({
  editingEvent,
  onClose,
  onChange,
}: EventEditModalProps) => {
  const [isProjectMenuOpen, setIsProjectMenuOpen] = useState(false);
  const projectMenuRef = useRef<HTMLDivElement | null>(null);
  const { projects, clients } = useMemo(() => getEventFormOptions(), []);
  const clientOptions = useMemo(() => {
    if (!editingEvent?.client || clients.some((client) => client.name === editingEvent.client)) {
      return clients;
    }

    return [
      ...clients,
      {
        id: -1,
        name: editingEvent.client,
      },
    ];
  }, [clients, editingEvent?.client]);

  const filteredProjects = useMemo(() => {
    const query = editingEvent?.job.trim().toLowerCase() ?? '';
    if (!query) return projects;

    return projects.filter((project) => (
      project.id.toLowerCase().includes(query)
      || project.name.toLowerCase().includes(query)
      || project.client.toLowerCase().includes(query)
    ));
  }, [editingEvent?.job, projects]);

  const updateEventDraft = (nextEvent: Event) => {
    onChange(applyEventDraft(nextEvent));
  };

  const selectProject = (projectId: string) => {
    if (!editingEvent) return;

    const project = projects.find((item) => item.id === projectId);
    if (!project) return;

    updateEventDraft({
      ...editingEvent,
      job: project.id,
      name: editingEvent.name.trim() ? editingEvent.name : project.name,
      client: project.client || editingEvent.client,
    });
    setIsProjectMenuOpen(false);
  };

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!projectMenuRef.current?.contains(event.target as Node)) {
        setIsProjectMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  if (!editingEvent) return null;

  const allEventDates = editingEvent.startDate && editingEvent.endDate
    ? getDatesBetween(editingEvent.startDate, editingEvent.endDate)
    : [];
  const phaseSchedules = normalizeEventSchedules(editingEvent);
  const globalFrom = editingEvent.startTime || '08:00';
  const globalTo = editingEvent.endTime || '17:00';

  const patchPhaseSlots = (phaseType: TimelogType, updater: (slots: EventPhaseSlot[]) => EventPhaseSlot[]) => {
    const nextSlots = updater((phaseSchedules[phaseType] || []).map((slot) => ({ ...slot, dates: [...slot.dates] })));
    updateEventDraft({
      ...editingEvent,
      phaseSchedules: {
        ...phaseSchedules,
        [phaseType]: nextSlots,
      },
      phaseTimes: {
        ...(editingEvent.phaseTimes || createDefaultPhaseTimes(globalFrom, globalTo)),
        [phaseType]: {
          from: nextSlots[0]?.from || globalFrom,
          to: nextSlots[0]?.to || globalTo,
        },
      },
    });
  };

  const handleSave = async () => {
    try {
      await saveEvent({ ...editingEvent, phaseSchedules });
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nepodarilo se ulozit akci.');
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-[28px] border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.98)] shadow-[0_28px_80px_rgba(47,38,31,0.18)]"
        >
          <div className="flex items-center justify-between border-b border-[color:rgb(var(--nodu-text-rgb)/0.08)] p-5">
            <h3 className="text-xl font-semibold tracking-[-0.03em] text-[color:var(--nodu-text)]">Upravit akci</h3>
            <button onClick={onClose} className="rounded-xl border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.92)] p-2 text-[color:var(--nodu-text-soft)] transition-all hover:border-[color:rgb(var(--nodu-accent-rgb)/0.24)] hover:text-[color:var(--nodu-accent)]">
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-[0.22em] text-[color:var(--nodu-text-soft)]">Job Number</label>
                <div ref={projectMenuRef} className="relative">
                  <div className="flex overflow-hidden rounded-xl border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.88)] focus-within:ring-2 focus-within:ring-[color:var(--nodu-accent-soft)]">
                    <Input
                      type="text"
                      value={editingEvent.job}
                      onChange={(e) => {
                        updateEventDraft({ ...editingEvent, job: e.target.value.toUpperCase() });
                        setIsProjectMenuOpen(true);
                      }}
                      onFocus={() => setIsProjectMenuOpen(true)}
                      placeholder="Napr. NEX300"
                      className="w-full border-0 bg-transparent shadow-none focus-visible:ring-0"
                    />
                    <button
                      type="button"
                      onClick={() => setIsProjectMenuOpen((prev) => !prev)}
                      className="border-l border-[color:rgb(var(--nodu-text-rgb)/0.08)] px-3 text-[color:var(--nodu-text-soft)] transition-colors hover:bg-[color:rgb(var(--nodu-accent-rgb)/0.08)] hover:text-[color:var(--nodu-accent)]"
                      aria-label="Rozbalit projekty"
                    >
                      <ChevronDown size={16} className={`transition-transform ${isProjectMenuOpen ? 'rotate-180' : ''}`} />
                    </button>
                  </div>

                  {isProjectMenuOpen && (
                    <div className="absolute z-20 mt-2 max-h-56 w-full overflow-y-auto rounded-[22px] border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.98)] p-1 shadow-[0_18px_42px_rgba(47,38,31,0.16)]">
                      {filteredProjects.length > 0 ? (
                        filteredProjects.map((project) => (
                          <button
                            key={project.id}
                            type="button"
                            onClick={() => selectProject(project.id)}
                            className="flex w-full items-start justify-between rounded-[16px] px-3 py-2 text-left transition-colors hover:bg-[color:rgb(var(--nodu-accent-rgb)/0.08)]"
                          >
                            <div>
                              <div className="text-sm font-semibold text-[color:var(--nodu-text)]">{project.id}</div>
                              <div className="text-xs text-[color:var(--nodu-text-soft)]">{project.name}</div>
                            </div>
                            <div className="pl-3 text-[10px] font-medium uppercase tracking-wider text-[color:var(--nodu-text-soft)]">
                              {project.client}
                            </div>
                          </button>
                        ))
                      ) : (
                        <div className="px-3 py-2 text-xs text-[color:var(--nodu-text-soft)]">
                          Zadny existujici projekt. Akce vytvori novy projekt automaticky.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-[0.22em] text-[color:var(--nodu-text-soft)]">Nazev akce</label>
                <Input
                  type="text"
                  value={editingEvent.name}
                  onChange={(e) => updateEventDraft({ ...editingEvent, name: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={fieldLabelClass}>Klient / Firma</label>
                <select
                  value={editingEvent.client}
                  onChange={(e) => updateEventDraft({ ...editingEvent, client: e.target.value })}
                  className={nativeFieldClass}
                >
                  <option value="">Vyberte klienta</option>
                  {clientOptions.map((client) => (
                    <option key={client.id} value={client.name}>{client.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={fieldLabelClass}>Mesto</label>
                <input
                  type="text"
                  value={editingEvent.city}
                  onChange={(e) => updateEventDraft({ ...editingEvent, city: e.target.value })}
                  className={nativeFieldClass}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={fieldLabelClass}>Datum zacatku</label>
                <input
                  type="date"
                  value={editingEvent.startDate}
                  onChange={(e) => updateEventDraft({ ...editingEvent, startDate: e.target.value })}
                  className={nativeFieldClass}
                />
              </div>
              <div>
                <label className={fieldLabelClass}>Datum konce</label>
                <input
                  type="date"
                  value={editingEvent.endDate}
                  onChange={(e) => updateEventDraft({ ...editingEvent, endDate: e.target.value })}
                  className={nativeFieldClass}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={fieldLabelClass}>Od</label>
                <input
                  type="time"
                  value={globalFrom}
                  onChange={(e) => updateEventDraft({
                    ...editingEvent,
                    startTime: e.target.value,
                    phaseTimes: editingEvent.showDayTypes ? createDefaultPhaseTimes(e.target.value, globalTo) : editingEvent.phaseTimes,
                    phaseSchedules: editingEvent.showDayTypes
                      ? Object.fromEntries(
                          Object.entries(phaseSchedules).map(([phaseType, slots]) => [
                            phaseType,
                            (slots || []).map((slot) => ({ ...slot, from: e.target.value })),
                          ]),
                        ) as Event['phaseSchedules']
                      : editingEvent.phaseSchedules,
                  })}
                  className={nativeFieldClass}
                />
              </div>
              <div>
                <label className={fieldLabelClass}>Do</label>
                <input
                  type="time"
                  value={globalTo}
                  onChange={(e) => updateEventDraft({
                    ...editingEvent,
                    endTime: e.target.value,
                    phaseTimes: editingEvent.showDayTypes ? createDefaultPhaseTimes(globalFrom, e.target.value) : editingEvent.phaseTimes,
                    phaseSchedules: editingEvent.showDayTypes
                      ? Object.fromEntries(
                          Object.entries(phaseSchedules).map(([phaseType, slots]) => [
                            phaseType,
                            (slots || []).map((slot) => ({ ...slot, to: e.target.value })),
                          ]),
                        ) as Event['phaseSchedules']
                      : editingEvent.phaseSchedules,
                  })}
                  className={nativeFieldClass}
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-[0.22em] text-[color:var(--nodu-text-soft)]">Popis akce</label>
              <Textarea
                value={editingEvent.description || ''}
                onChange={(e) => updateEventDraft({ ...editingEvent, description: e.target.value })}
                className="h-16 resize-none"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={fieldLabelClass}>Kontaktni osoba</label>
                <input
                  type="text"
                  value={editingEvent.contactPerson || ''}
                  onChange={(e) => updateEventDraft({ ...editingEvent, contactPerson: e.target.value })}
                  className={nativeFieldClass}
                />
              </div>
              <div>
                <label className={fieldLabelClass}>Dresscode</label>
                <input
                  type="text"
                  value={editingEvent.dresscode || ''}
                  onChange={(e) => updateEventDraft({ ...editingEvent, dresscode: e.target.value })}
                  className={nativeFieldClass}
                />
              </div>
              <div>
                <label className={fieldLabelClass}>Misto srazu</label>
                <input
                  type="text"
                  value={editingEvent.meetingLocation || ''}
                  onChange={(e) => updateEventDraft({ ...editingEvent, meetingLocation: e.target.value })}
                  className={nativeFieldClass}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={fieldLabelClass}>Potreba crew</label>
                <input
                  type="number"
                  value={editingEvent.needed}
                  onChange={(e) => updateEventDraft({ ...editingEvent, needed: Number(e.target.value) })}
                  className={nativeFieldClass}
                />
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-[18px] border border-[color:var(--nodu-border)] bg-[color:var(--nodu-paper-strong)] p-3">
              <input
                type="checkbox"
                id="showDayTypes"
                checked={editingEvent.showDayTypes || false}
                onChange={(e) => updateEventDraft({
                  ...editingEvent,
                  showDayTypes: e.target.checked,
                  phaseTimes: e.target.checked
                    ? (editingEvent.phaseTimes || createDefaultPhaseTimes(globalFrom, globalTo))
                    : editingEvent.phaseTimes,
                  phaseSchedules: e.target.checked
                    ? (editingEvent.phaseSchedules || normalizeEventSchedules(editingEvent))
                    : editingEvent.phaseSchedules,
                })}
                className="h-4 w-4 rounded border-[color:var(--nodu-border)] text-[color:var(--nodu-accent)] focus:ring-[color:var(--nodu-accent)]"
              />
              <label htmlFor="showDayTypes" className="cursor-pointer select-none text-xs font-bold text-[color:var(--nodu-text)]">
                Zobrazovat typy dnu (I-P-D) na akci
              </label>
            </div>

            {editingEvent.showDayTypes && editingEvent.startDate && editingEvent.endDate && (
              <div className="space-y-4 rounded-[22px] border border-[color:var(--nodu-border)] bg-[color:var(--nodu-paper-strong)] p-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-[10px] font-bold uppercase tracking-[0.22em] text-[color:var(--nodu-text-soft)]">Nastaveni typu dnu (I-P-D)</h4>
                  <button
                    type="button"
                    onClick={() => updateEventDraft({
                      ...editingEvent,
                      phaseSchedules: Object.fromEntries(
                        PHASES.map((phase) => [
                          phase.type,
                          (phaseSchedules[phase.type] || []).map((slot) => ({ ...slot, dates: [] })),
                        ]),
                      ) as Event['phaseSchedules'],
                    })}
                    className="text-[9px] font-bold uppercase text-[color:var(--nodu-error-text)] hover:opacity-80"
                  >
                    Vymazat vse
                  </button>
                </div>

                {PHASES.map((phase) => (
                  <div key={phase.id} className="space-y-3 rounded-[18px] border border-[color:var(--nodu-border)] bg-white p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`flex h-5 w-5 items-center justify-center rounded text-[9px] font-black text-white shadow-sm ${phase.color}`}>
                          {phase.id}
                        </div>
                        <span className="text-xs font-bold text-[color:var(--nodu-text)]">{phase.label}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => patchPhaseSlots(phase.type, (slots) => [
                          ...slots,
                          { id: createSlotId(), from: globalFrom, to: globalTo, dates: [] },
                        ])}
                        className="inline-flex items-center gap-1 text-[10px] font-bold uppercase text-[color:var(--nodu-accent)] hover:opacity-80"
                      >
                        <Plus size={12} /> Pridat cas
                      </button>
                    </div>

                    {(phaseSchedules[phase.type] || []).map((slot, slotIndex) => (
                      <div key={slot.id} className="space-y-3 rounded-xl border border-[color:var(--nodu-border)] bg-[color:var(--nodu-paper-strong)] p-3">
                        <div className="flex items-center justify-between">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--nodu-text-soft)]">
                            Blok {slotIndex + 1}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => patchPhaseSlots(phase.type, (slots) => (
                                slots.map((currentSlot) => currentSlot.id === slot.id ? { ...currentSlot, dates: [...allEventDates] } : currentSlot)
                              ))}
                              className="text-[9px] font-bold uppercase text-[color:var(--nodu-accent)] hover:opacity-80"
                            >
                              Vsechny dny
                            </button>
                            <button
                              type="button"
                              onClick={() => patchPhaseSlots(phase.type, (slots) => (
                                slots.length > 1
                                  ? slots.filter((currentSlot) => currentSlot.id !== slot.id)
                                  : [{ ...slot, dates: [] }]
                              ))}
                              className="text-[9px] font-bold uppercase text-[color:var(--nodu-text-soft)] hover:text-[color:var(--nodu-text)]"
                            >
                              {(phaseSchedules[phase.type] || []).length > 1 ? (
                                <span className="inline-flex items-center gap-1"><Trash2 size={10} /> Smazat</span>
                              ) : 'Vyčistit'}
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className={smallFieldLabelClass}>Od</label>
                            <input
                              type="time"
                              value={slot.from}
                              onChange={(e) => patchPhaseSlots(phase.type, (slots) => (
                                slots.map((currentSlot) => currentSlot.id === slot.id ? { ...currentSlot, from: e.target.value } : currentSlot)
                              ))}
                              className={smallNativeFieldClass}
                            />
                          </div>
                          <div>
                            <label className={smallFieldLabelClass}>Do</label>
                            <input
                              type="time"
                              value={slot.to}
                              onChange={(e) => patchPhaseSlots(phase.type, (slots) => (
                                slots.map((currentSlot) => currentSlot.id === slot.id ? { ...currentSlot, to: e.target.value } : currentSlot)
                              ))}
                              className={smallNativeFieldClass}
                            />
                          </div>
                        </div>

                        <div>
                          <label className="mb-2 block text-[9px] uppercase text-[color:var(--nodu-text-soft)]">Dny</label>
                          <div className="flex flex-wrap gap-1">
                            {allEventDates.map((date) => {
                              const isSelected = slot.dates.includes(date);
                              return (
                                <button
                                  key={`${slot.id}-${date}`}
                                  type="button"
                                  onClick={() => patchPhaseSlots(phase.type, (slots) => (
                                    slots.map((currentSlot) => {
                                      if (currentSlot.id !== slot.id) return currentSlot;
                                      return {
                                        ...currentSlot,
                                        dates: isSelected
                                          ? currentSlot.dates.filter((currentDate) => currentDate !== date)
                                          : [...currentSlot.dates, date].sort(),
                                      };
                                    })
                                  ))}
                                  className={`h-8 w-8 rounded border text-[9px] font-bold transition-all ${
                                    isSelected
                                      ? `${phase.color} text-white shadow-sm`
                                      : 'border-[color:var(--nodu-border)] bg-white text-[color:var(--nodu-text-soft)] hover:border-[color:rgb(var(--nodu-accent-rgb)/0.28)] hover:text-[color:var(--nodu-accent)]'
                                  }`}
                                  title={`${new Date(date).toLocaleDateString('cs-CZ')} - ${phase.label}`}
                                >
                                  {new Date(date).getDate()}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-3 border-t border-[color:rgb(var(--nodu-text-rgb)/0.08)] bg-[color:var(--nodu-paper-strong)] p-4">
            <button
              onClick={onClose}
              className="flex-1 rounded-xl border border-[color:var(--nodu-border)] bg-white py-2.5 text-sm font-medium text-[color:var(--nodu-text)] transition-all hover:bg-[color:var(--nodu-accent-soft)] hover:text-[color:var(--nodu-accent)]"
            >
              Zrusit
            </button>
            <button
              onClick={handleSave}
              className="flex-1 rounded-xl border border-[color:var(--nodu-success-border)] bg-[color:var(--nodu-success-bg)] py-2.5 text-sm font-medium text-[color:var(--nodu-success-text)] shadow-[0_12px_30px_rgba(45,108,78,0.12)] transition-all hover:bg-[color:var(--nodu-success-bg-hover)]"
            >
              Ulozit akci
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default EventEditModal;
