import React, { useMemo, useState } from 'react';
import { Plus, Search, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import { useAppContext } from '../../context/AppContext';
import { PHASE_CONFIG } from '../../constants';
import { EventPhaseSlot, Timelog, TimelogType } from '../../types';
import { getDatesBetween } from '../../utils';

/** Modal pro obsazení crew na akci */
const AssignCrewModal = () => {
  const {
    assigningCrewToEvent,
    setAssigningCrewToEvent,
    filteredContractors,
    timelogs,
    setTimelogs,
    searchQuery,
    setSearchQuery,
  } = useAppContext();

  const [pendingContractorId, setPendingContractorId] = useState<number | null>(null);
  const [selectedPhaseOptions, setSelectedPhaseOptions] = useState<Array<TimelogType | 'all'>>([]);

  const pendingContractor = useMemo(
    () => filteredContractors.find((contractor) => contractor.id === pendingContractorId) ?? null,
    [filteredContractors, pendingContractorId],
  );

  if (!assigningCrewToEvent) return null;

  const eventDates = getDatesBetween(assigningCrewToEvent.startDate, assigningCrewToEvent.endDate);
  const defaultFrom = assigningCrewToEvent.startTime || '08:00';
  const defaultTo = assigningCrewToEvent.endTime || '17:00';
  const phaseSchedules = assigningCrewToEvent.phaseSchedules || {};

  const buildTimelogDays = (phaseChoices?: Array<TimelogType | 'all'>): Timelog['days'] => {
    if (!assigningCrewToEvent.showDayTypes) {
      return eventDates.map((date) => ({
        d: date,
        f: defaultFrom,
        t: defaultTo,
        type: 'instal' as TimelogType,
      }));
    }

    const dayTypes = assigningCrewToEvent.dayTypes || {};
    if (!phaseChoices || phaseChoices.length === 0) return [];

    const includesAll = phaseChoices.includes('all');
    const selectedTypes = phaseChoices.filter((choice): choice is TimelogType => choice !== 'all');
    const activeTypes = includesAll ? PHASE_CONFIG.map((phase) => phase.type) : selectedTypes;

    const scheduledDays = activeTypes.flatMap((phaseType) => {
      const slots = phaseSchedules[phaseType] || [];

      if (slots.length === 0) {
        return eventDates
          .filter((date) => dayTypes[date] === phaseType)
          .map((date) => ({
            d: date,
            f: assigningCrewToEvent.phaseTimes?.[phaseType]?.from || defaultFrom,
            t: assigningCrewToEvent.phaseTimes?.[phaseType]?.to || defaultTo,
            type: phaseType,
          }));
      }

      return slots.flatMap((slot: EventPhaseSlot) => slot.dates.map((date) => ({
        d: date,
        f: slot.from || defaultFrom,
        t: slot.to || defaultTo,
        type: phaseType,
      })));
    });

    return scheduledDays
      .filter((day) => eventDates.includes(day.d))
      .sort((a, b) => `${a.d}${a.f}${a.type}`.localeCompare(`${b.d}${b.f}${b.type}`));
  };

  const assignContractor = (contractorId: number, phaseChoices?: Array<TimelogType | 'all'>) => {
    const initialDays = buildTimelogDays(phaseChoices);

    if (initialDays.length === 0) {
      toast.error('Pro vybranou fázi nejsou na akci žádné dny.');
      return;
    }

    const newTimelog: Timelog = {
      id: Math.max(0, ...timelogs.map((t) => t.id)) + 1,
      eid: assigningCrewToEvent.id,
      cid: contractorId,
      days: initialDays,
      km: 0,
      note: '',
      status: 'draft',
    };

    setTimelogs((prev) => [...prev, newTimelog]);
    setPendingContractorId(null);
    setSelectedPhaseOptions([]);
  };

  const assignmentOptions = [
    ...PHASE_CONFIG.map((phase) => ({
      id: phase.type,
      label: phase.id,
      description: phase.label,
      activeClass: phase.color,
    })),
    { id: 'all' as const, label: 'Vše', description: 'Všechny typy dnů', activeClass: 'bg-slate-700 border-slate-800 shadow-slate-100' },
  ];

  const isOptionSelected = (optionId: TimelogType | 'all') => {
    if (optionId === 'all') return selectedPhaseOptions.includes('all');
    return selectedPhaseOptions.includes(optionId) || selectedPhaseOptions.includes('all');
  };

  return (
    <AnimatePresence>
      {assigningCrewToEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-gray-100 p-4">
              <div>
                <h3 className="font-semibold text-gray-900">Obsadit Crew</h3>
                <p className="mt-0.5 text-[10px] uppercase tracking-wider text-gray-500">
                  {assigningCrewToEvent.name} · {assigningCrewToEvent.job}
                </p>
              </div>
              <button
                onClick={() => {
                  setPendingContractorId(null);
                  setAssigningCrewToEvent(null);
                }}
                className="rounded-full p-1 text-gray-400 hover:bg-gray-100"
              >
                <X size={20} />
              </button>
            </div>

            <div className="border-b border-gray-100 bg-gray-50 p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                <input
                  type="text"
                  placeholder="Hledat v crew..."
                  className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  onChange={(e) => setSearchQuery(e.target.value)}
                  value={searchQuery}
                />
              </div>
            </div>

            {assigningCrewToEvent.showDayTypes && pendingContractor && (
              <div className="border-b border-emerald-100 bg-emerald-50 p-4">
                <div className="mb-3 text-xs font-semibold text-emerald-900">
                  Kam přiřadit {pendingContractor.name}?
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {assignmentOptions.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => {
                        setSelectedPhaseOptions((prev) => {
                          if (option.id === 'all') {
                            return prev.includes('all') ? [] : ['all', 'instal', 'provoz', 'deinstal'];
                          }

                          const withoutAll = prev.filter((item) => item !== 'all');
                          const nextSelection = withoutAll.includes(option.id)
                            ? withoutAll.filter((item) => item !== option.id)
                            : [...withoutAll, option.id];

                          const includesEveryPhase =
                            nextSelection.includes('instal') &&
                            nextSelection.includes('provoz') &&
                            nextSelection.includes('deinstal');

                          return includesEveryPhase
                            ? ['all', 'instal', 'provoz', 'deinstal']
                            : nextSelection;
                        });
                      }}
                      className={`rounded-xl border px-3 py-2 text-center transition-colors ${
                        isOptionSelected(option.id)
                          ? `${option.activeClass} text-white shadow-sm`
                          : 'border-emerald-100 bg-white hover:border-emerald-300 hover:bg-emerald-100/40'
                      }`}
                    >
                      <div className={`text-sm font-bold ${isOptionSelected(option.id) ? 'text-white' : 'text-emerald-700'}`}>{option.label}</div>
                      <div className={`text-[10px] ${isOptionSelected(option.id) ? 'text-white/90' : 'text-emerald-600'}`}>{option.description}</div>
                    </button>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setPendingContractorId(null);
                      setSelectedPhaseOptions([]);
                    }}
                    className="text-[11px] font-medium text-gray-500 hover:text-gray-700"
                  >
                    Zrušit výběr fáze
                  </button>
                  <button
                    type="button"
                    onClick={() => assignContractor(pendingContractor.id, selectedPhaseOptions)}
                    disabled={selectedPhaseOptions.length === 0}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-gray-300"
                  >
                    Potvrdit přiřazení
                  </button>
                </div>
              </div>
            )}

            <div className="flex-1 space-y-1 overflow-y-auto p-2">
              {filteredContractors.map((c) => {
                const isAlreadyAssigned = timelogs.some((t) => t.eid === assigningCrewToEvent.id && t.cid === c.id);

                return (
                  <button
                    key={c.id}
                    disabled={isAlreadyAssigned}
                    onClick={() => {
                      if (assigningCrewToEvent.showDayTypes) {
                        setPendingContractorId(c.id);
                        setSelectedPhaseOptions([]);
                        return;
                      }

                      assignContractor(c.id);
                    }}
                    className={`w-full rounded-xl p-2 text-left transition-all ${isAlreadyAssigned ? 'cursor-not-allowed bg-gray-50 opacity-50' : 'group hover:bg-emerald-50'}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="av h-9 w-9 text-[10px]" style={{ backgroundColor: c.bg, color: c.fg }}>{c.ii}</div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-bold text-gray-900">{c.name}</div>
                        <div className="mt-0.5 flex items-center gap-2">
                          <span className="text-[10px] text-gray-500">{c.city}</span>
                          <div className="flex gap-1">
                            {c.tags.slice(0, 2).map((tag) => (
                              <span key={tag} className="rounded-[4px] bg-gray-100 px-1 py-0.5 text-[8px] font-bold uppercase text-gray-500">
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                      {!isAlreadyAssigned ? (
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-emerald-600 transition-all group-hover:border-emerald-600 group-hover:bg-emerald-600 group-hover:text-white">
                          <Plus size={16} />
                        </div>
                      ) : (
                        <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">Přiřazen</div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="border-t border-gray-100 bg-gray-50 p-4">
              <button
                onClick={() => {
                  setPendingContractorId(null);
                  setAssigningCrewToEvent(null);
                }}
                className="w-full rounded-xl bg-gray-900 py-2.5 text-sm font-medium text-white shadow-lg shadow-gray-200 transition-all hover:bg-gray-800"
              >
                Hotovo
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default AssignCrewModal;
