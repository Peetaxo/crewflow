import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Plus, Trash2, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import { getDatesBetween } from '../../utils';
import { Event, EventPhaseSlot, TimelogType } from '../../types';
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

const createSlotId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const EventEditModal = ({
  editingEvent,
  onClose,
  onChange,
}: EventEditModalProps) => {
  const [isProjectMenuOpen, setIsProjectMenuOpen] = useState(false);
  const projectMenuRef = useRef<HTMLDivElement | null>(null);
  const { projects, clients } = useMemo(() => getEventFormOptions(), []);

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
          className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        >
          <div className="flex items-center justify-between border-b border-gray-100 p-4">
            <h3 className="font-semibold text-gray-900">Upravit akci</h3>
            <button onClick={onClose} className="rounded-full p-1 text-gray-400 hover:bg-gray-100">
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wider text-gray-500">Job Number</label>
                <div ref={projectMenuRef} className="relative">
                  <div className="flex overflow-hidden rounded-lg border border-gray-200 bg-white focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20">
                    <input
                      type="text"
                      value={editingEvent.job}
                      onChange={(e) => {
                        updateEventDraft({ ...editingEvent, job: e.target.value.toUpperCase() });
                        setIsProjectMenuOpen(true);
                      }}
                      onFocus={() => setIsProjectMenuOpen(true)}
                      placeholder="Napr. NEX300"
                      className="w-full px-3 py-2 text-sm outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setIsProjectMenuOpen((prev) => !prev)}
                      className="border-l border-gray-200 px-3 text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600"
                      aria-label="Rozbalit projekty"
                    >
                      <ChevronDown size={16} className={`transition-transform ${isProjectMenuOpen ? 'rotate-180' : ''}`} />
                    </button>
                  </div>

                  {isProjectMenuOpen && (
                    <div className="absolute z-20 mt-2 max-h-56 w-full overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-lg">
                      {filteredProjects.length > 0 ? (
                        filteredProjects.map((project) => (
                          <button
                            key={project.id}
                            type="button"
                            onClick={() => selectProject(project.id)}
                            className="flex w-full items-start justify-between rounded-lg px-3 py-2 text-left transition-colors hover:bg-gray-50"
                          >
                            <div>
                              <div className="text-sm font-semibold text-gray-900">{project.id}</div>
                              <div className="text-xs text-gray-500">{project.name}</div>
                            </div>
                            <div className="pl-3 text-[10px] font-medium uppercase tracking-wider text-gray-400">
                              {project.client}
                            </div>
                          </button>
                        ))
                      ) : (
                        <div className="px-3 py-2 text-xs text-gray-500">
                          Zadny existujici projekt. Akce vytvori novy projekt automaticky.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wider text-gray-500">Nazev akce</label>
                <input
                  type="text"
                  value={editingEvent.name}
                  onChange={(e) => updateEventDraft({ ...editingEvent, name: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wider text-gray-500">Klient / Firma</label>
                <select
                  value={editingEvent.client}
                  onChange={(e) => updateEventDraft({ ...editingEvent, client: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                >
                  <option value="">Vyberte klienta</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.name}>{client.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wider text-gray-500">Mesto</label>
                <input
                  type="text"
                  value={editingEvent.city}
                  onChange={(e) => updateEventDraft({ ...editingEvent, city: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wider text-gray-500">Datum zacatku</label>
                <input
                  type="date"
                  value={editingEvent.startDate}
                  onChange={(e) => updateEventDraft({ ...editingEvent, startDate: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wider text-gray-500">Datum konce</label>
                <input
                  type="date"
                  value={editingEvent.endDate}
                  onChange={(e) => updateEventDraft({ ...editingEvent, endDate: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wider text-gray-500">Od</label>
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
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wider text-gray-500">Do</label>
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
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wider text-gray-500">Popis akce</label>
              <textarea
                value={editingEvent.description || ''}
                onChange={(e) => updateEventDraft({ ...editingEvent, description: e.target.value })}
                className="h-16 w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wider text-gray-500">Kontaktni osoba</label>
                <input
                  type="text"
                  value={editingEvent.contactPerson || ''}
                  onChange={(e) => updateEventDraft({ ...editingEvent, contactPerson: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wider text-gray-500">Dresscode</label>
                <input
                  type="text"
                  value={editingEvent.dresscode || ''}
                  onChange={(e) => updateEventDraft({ ...editingEvent, dresscode: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wider text-gray-500">Misto srazu</label>
                <input
                  type="text"
                  value={editingEvent.meetingLocation || ''}
                  onChange={(e) => updateEventDraft({ ...editingEvent, meetingLocation: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wider text-gray-500">Potreba crew</label>
                <input
                  type="number"
                  value={editingEvent.needed}
                  onChange={(e) => updateEventDraft({ ...editingEvent, needed: Number(e.target.value) })}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-xl border border-gray-100 bg-gray-50 p-3">
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
                className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
              />
              <label htmlFor="showDayTypes" className="cursor-pointer select-none text-xs font-bold text-gray-700">
                Zobrazovat typy dnu (I-P-D) na akci
              </label>
            </div>

            {editingEvent.showDayTypes && editingEvent.startDate && editingEvent.endDate && (
              <div className="space-y-4 rounded-xl border border-gray-100 bg-gray-50 p-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Nastaveni typu dnu (I-P-D)</h4>
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
                    className="text-[9px] font-bold uppercase text-red-500 hover:text-red-600"
                  >
                    Vymazat vse
                  </button>
                </div>

                {PHASES.map((phase) => (
                  <div key={phase.id} className="space-y-3 rounded-lg border border-gray-200 bg-white p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`flex h-5 w-5 items-center justify-center rounded text-[9px] font-black text-white shadow-sm ${phase.color}`}>
                          {phase.id}
                        </div>
                        <span className="text-xs font-bold text-gray-700">{phase.label}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => patchPhaseSlots(phase.type, (slots) => [
                          ...slots,
                          { id: createSlotId(), from: globalFrom, to: globalTo, dates: [] },
                        ])}
                        className="inline-flex items-center gap-1 text-[10px] font-bold uppercase text-emerald-600 hover:text-emerald-700"
                      >
                        <Plus size={12} /> Pridat cas
                      </button>
                    </div>

                    {(phaseSchedules[phase.type] || []).map((slot, slotIndex) => (
                      <div key={slot.id} className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
                        <div className="flex items-center justify-between">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                            Blok {slotIndex + 1}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => patchPhaseSlots(phase.type, (slots) => (
                                slots.map((currentSlot) => currentSlot.id === slot.id ? { ...currentSlot, dates: [...allEventDates] } : currentSlot)
                              ))}
                              className="text-[9px] font-bold uppercase text-emerald-600 hover:text-emerald-700"
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
                              className="text-[9px] font-bold uppercase text-gray-400 hover:text-gray-500"
                            >
                              {(phaseSchedules[phase.type] || []).length > 1 ? (
                                <span className="inline-flex items-center gap-1"><Trash2 size={10} /> Smazat</span>
                              ) : 'Vyčistit'}
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="mb-1 block text-[9px] uppercase text-gray-400">Od</label>
                            <input
                              type="time"
                              value={slot.from}
                              onChange={(e) => patchPhaseSlots(phase.type, (slots) => (
                                slots.map((currentSlot) => currentSlot.id === slot.id ? { ...currentSlot, from: e.target.value } : currentSlot)
                              ))}
                              className="w-full rounded border border-gray-200 bg-white px-2 py-1 text-[10px]"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-[9px] uppercase text-gray-400">Do</label>
                            <input
                              type="time"
                              value={slot.to}
                              onChange={(e) => patchPhaseSlots(phase.type, (slots) => (
                                slots.map((currentSlot) => currentSlot.id === slot.id ? { ...currentSlot, to: e.target.value } : currentSlot)
                              ))}
                              className="w-full rounded border border-gray-200 bg-white px-2 py-1 text-[10px]"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="mb-2 block text-[9px] uppercase text-gray-400">Dny</label>
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
                                      : 'border-gray-200 bg-white text-gray-400 hover:border-gray-300'
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
              Ulozit akci
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default EventEditModal;
