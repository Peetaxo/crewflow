import React, { useMemo, useState } from 'react';
import { AlertTriangle, Plus, Search, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import { PHASE_CONFIG } from '../../constants';
import { Event, TimelogType } from '../../types';
import { formatDateRange } from '../../utils';
import { getCrew } from '../../features/crew/services/crew.service';
import { assignCrewToEvent, getContractorConflictsForEvent, getEventDetailData } from '../../features/events/services/events.service';

interface AssignCrewModalProps {
  event: Event | null;
  onClose: () => void;
}

const AssignCrewModal = ({ event, onClose }: AssignCrewModalProps) => {
  const [pendingContractorId, setPendingContractorId] = useState<number | null>(null);
  const [selectedPhaseOptions, setSelectedPhaseOptions] = useState<Array<TimelogType | 'all'>>([]);
  const [search, setSearch] = useState('');

  const contractors = useMemo(() => getCrew({ search }), [search]);
  const pendingContractor = useMemo(
    () => contractors.find((contractor) => contractor.id === pendingContractorId) ?? null,
    [contractors, pendingContractorId],
  );

  if (!event) return null;

  const contractorConflicts = getContractorConflictsForEvent(event, contractors);
  const assignedContractorIds = new Set(getEventDetailData(event.id).timelogs.map((timelog) => timelog.cid));

  const assignContractor = (contractorId: number, phaseChoices?: Array<TimelogType | 'all'>) => {
    try {
      assignCrewToEvent(event.id, contractorId, phaseChoices);
      setPendingContractorId(null);
      setSelectedPhaseOptions([]);
      toast.success('Clen crew byl prirazen bez kolize.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nepodarilo se priradit clena crew.');
    }
  };

  const assignmentOptions = [
    ...PHASE_CONFIG.map((phase) => ({
      id: phase.type,
      label: phase.id,
      description: phase.label,
      activeClass: phase.color,
    })),
    { id: 'all' as const, label: 'Vse', description: 'Vsechny typy dnu', activeClass: 'bg-slate-700 border-slate-800 shadow-slate-100' },
  ];

  const isOptionSelected = (optionId: TimelogType | 'all') => {
    if (optionId === 'all') return selectedPhaseOptions.includes('all');
    return selectedPhaseOptions.includes(optionId) || selectedPhaseOptions.includes('all');
  };

  const handleClose = () => {
    setPendingContractorId(null);
    setSelectedPhaseOptions([]);
    setSearch('');
    onClose();
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        >
          <div className="flex items-center justify-between border-b border-gray-100 p-4">
            <div>
              <h3 className="font-semibold text-gray-900">Obsadit crew</h3>
              <p className="mt-0.5 text-[10px] uppercase tracking-wider text-gray-500">
                {event.name} - {event.job}
              </p>
            </div>
            <button onClick={handleClose} className="rounded-full p-1 text-gray-400 hover:bg-gray-100">
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
                onChange={(e) => setSearch(e.target.value)}
                value={search}
              />
            </div>
          </div>

          {event.showDayTypes && pendingContractor && (
            <div className="border-b border-emerald-100 bg-emerald-50 p-4">
              <div className="mb-3 text-xs font-semibold text-emerald-900">
                Kam priradit {pendingContractor.name}?
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
                          nextSelection.includes('instal')
                          && nextSelection.includes('provoz')
                          && nextSelection.includes('deinstal');

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
                  Zrusit vyber faze
                </button>
                <button
                  type="button"
                  onClick={() => assignContractor(pendingContractor.id, selectedPhaseOptions)}
                  disabled={selectedPhaseOptions.length === 0}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-gray-300"
                >
                  Potvrdit prirazeni
                </button>
              </div>
            </div>
          )}

          <div className="flex-1 space-y-1 overflow-y-auto p-2">
            {contractors.map((contractor) => {
              const isAlreadyAssigned = assignedContractorIds.has(contractor.id);
              const conflicts = contractorConflicts.get(contractor.id) || [];
              const hasConflict = conflicts.length > 0;

              return (
                <button
                  key={contractor.id}
                  disabled={isAlreadyAssigned || hasConflict}
                  onClick={() => {
                    if (hasConflict) {
                      toast.error('Tento clen crew ma ve stejnem terminu jinou akci.');
                      return;
                    }

                    if (event.showDayTypes) {
                      setPendingContractorId(contractor.id);
                      setSelectedPhaseOptions([]);
                      return;
                    }

                    assignContractor(contractor.id);
                  }}
                  className={`w-full rounded-xl p-3 text-left transition-all ${
                    isAlreadyAssigned || hasConflict
                      ? 'cursor-not-allowed bg-gray-50'
                      : 'group hover:bg-emerald-50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="av h-9 w-9 text-[10px]" style={{ backgroundColor: contractor.bg, color: contractor.fg }}>{contractor.ii}</div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold text-gray-900">{contractor.name}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2">
                        <span className="text-[10px] text-gray-500">{contractor.city}</span>
                        <div className="flex gap-1">
                          {contractor.tags.includes('Ridic') && (
                            <span className="rounded-[4px] bg-gray-100 px-1 py-0.5 text-[8px] font-bold uppercase text-gray-500">
                              Ridic
                            </span>
                          )}
                          <span className={`rounded-[4px] px-1 py-0.5 text-[8px] font-bold uppercase ${contractor.reliable ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                            {contractor.reliable ? 'Spolehlivy' : 'Overit'}
                          </span>
                        </div>
                      </div>

                      {hasConflict && (
                        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800">
                          <div className="flex items-center gap-1 font-semibold">
                            <AlertTriangle size={12} />
                            Kolize terminu
                          </div>
                          <div className="mt-1 space-y-1">
                            {conflicts.map((conflict, index) => (
                              <div key={`${contractor.id}-${conflict.eventJob}-${index}`}>
                                {conflict.eventJob ? `${conflict.eventJob} - ` : ''}
                                {conflict.eventName}
                                {conflict.startDate && conflict.endDate && (
                                  <span className="text-amber-700"> - {formatDateRange(conflict.startDate, conflict.endDate)}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {!isAlreadyAssigned && !hasConflict ? (
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-emerald-600 transition-all group-hover:border-emerald-600 group-hover:bg-emerald-600 group-hover:text-white">
                        <Plus size={16} />
                      </div>
                    ) : (
                      <div className={`text-[10px] font-bold uppercase tracking-wider ${hasConflict ? 'text-amber-700' : 'text-emerald-600'}`}>
                        {hasConflict ? 'Kolize' : 'Prirazen'}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="border-t border-gray-100 bg-gray-50 p-4">
            <button
              onClick={handleClose}
              className="w-full rounded-xl bg-gray-900 py-2.5 text-sm font-medium text-white shadow-lg shadow-gray-200 transition-all hover:bg-gray-800"
            >
              Hotovo
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default AssignCrewModal;
