import React, { useMemo, useState } from 'react';
import { AlertTriangle, Plus, Search, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import { PHASE_CONFIG } from '../../constants';
import { Event, TimelogType } from '../../types';
import { formatDateRange } from '../../utils';
import { getCrew } from '../../features/crew/services/crew.service';
import { assignCrewToEvent, getContractorConflictsForEvent, getEventDetailData } from '../../features/events/services/events.service';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

interface AssignCrewModalProps {
  event: Event | null;
  onClose: () => void;
}

const getContractorSelectionValue = (contractor: { id: number; profileId?: string }) => (
  contractor.profileId ?? `legacy:${contractor.id}`
);

const AssignCrewModal = ({ event, onClose }: AssignCrewModalProps) => {
  const [pendingContractorSelection, setPendingContractorSelection] = useState<string | null>(null);
  const [selectedPhaseOptions, setSelectedPhaseOptions] = useState<Array<TimelogType | 'all'>>([]);
  const [search, setSearch] = useState('');

  const contractors = useMemo(() => getCrew({ search }), [search]);
  const pendingContractor = useMemo(
    () => contractors.find((contractor) => getContractorSelectionValue(contractor) === pendingContractorSelection) ?? null,
    [contractors, pendingContractorSelection],
  );

  if (!event) return null;

  const contractorConflicts = getContractorConflictsForEvent(event, contractors);
  const assignedContractorIds = new Set(getEventDetailData(event.id).timelogs.map((timelog) => (
    timelog.contractorProfileId ?? `legacy:${timelog.cid}`
  )));

  const assignContractor = async (contractorProfileId: string, phaseChoices?: Array<TimelogType | 'all'>) => {
    try {
      await assignCrewToEvent(event.id, contractorProfileId, phaseChoices);
      setPendingContractorSelection(null);
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
    setPendingContractorSelection(null);
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
          className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-[28px] border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.98)] shadow-[0_28px_80px_rgba(47,38,31,0.18)]"
        >
          <div className="flex items-center justify-between border-b border-[color:rgb(var(--nodu-text-rgb)/0.08)] p-5">
            <div>
              <h3 className="text-xl font-semibold tracking-[-0.03em] text-[color:var(--nodu-text)]">Obsadit crew</h3>
              <p className="mt-1 text-[10px] uppercase tracking-[0.22em] text-[color:var(--nodu-text-soft)]">
                {event.name} - {event.job}
              </p>
            </div>
            <button onClick={handleClose} className="rounded-xl border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.92)] p-2 text-[color:var(--nodu-text-soft)] transition-all hover:border-[color:rgb(var(--nodu-accent-rgb)/0.24)] hover:text-[color:var(--nodu-accent)]">
              <X size={20} />
            </button>
          </div>

          <div className="border-b border-[color:rgb(var(--nodu-text-rgb)/0.08)] bg-[color:rgb(var(--nodu-surface-rgb)/0.92)] p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--nodu-text-soft)]" size={14} />
              <Input
                type="text"
                placeholder="Hledat v crew..."
                className="py-2 pl-9 pr-3"
                onChange={(e) => setSearch(e.target.value)}
                value={search}
              />
            </div>
          </div>

          {event.showDayTypes && pendingContractor && (
            <div className="border-b border-[color:var(--nodu-success-border)] bg-[color:var(--nodu-success-bg)] p-4">
              <div className="mb-3 text-xs font-semibold text-[color:var(--nodu-text)]">
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
                        : 'border-[color:var(--nodu-success-border)] bg-white hover:bg-[color:var(--nodu-success-bg-hover)]'
                    }`}
                  >
                    <div className={`text-sm font-bold ${isOptionSelected(option.id) ? 'text-white' : 'text-[color:var(--nodu-success-text)]'}`}>{option.label}</div>
                    <div className={`text-[10px] ${isOptionSelected(option.id) ? 'text-white/90' : 'text-[color:var(--nodu-success-text)]'}`}>{option.description}</div>
                  </button>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setPendingContractorSelection(null);
                    setSelectedPhaseOptions([]);
                  }}
                  className="text-[11px] font-medium text-[color:var(--nodu-text-soft)] hover:text-[color:var(--nodu-text)]"
                >
                  Zrusit vyber faze
                </button>
                <button
                  type="button"
                  onClick={() => pendingContractor?.profileId ? void assignContractor(pendingContractor.profileId, selectedPhaseOptions) : undefined}
                  disabled={selectedPhaseOptions.length === 0}
                  className="rounded-xl border border-[color:var(--nodu-success-border)] bg-[color:var(--nodu-success-bg)] px-4 py-2 text-xs font-semibold text-[color:var(--nodu-success-text)] transition-colors hover:bg-[color:var(--nodu-success-bg-hover)] disabled:cursor-not-allowed disabled:border-[color:var(--nodu-border)] disabled:bg-[color:rgb(var(--nodu-text-rgb)/0.06)] disabled:text-[color:var(--nodu-text-soft)]"
                >
                  Potvrdit prirazeni
                </button>
              </div>
            </div>
          )}

          <div className="flex-1 space-y-1 overflow-y-auto p-2">
            {contractors.map((contractor) => {
              const contractorSelectionValue = getContractorSelectionValue(contractor);
              const isAlreadyAssigned = assignedContractorIds.has(contractorSelectionValue);
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
                      setPendingContractorSelection(contractorSelectionValue);
                      setSelectedPhaseOptions([]);
                      return;
                    }

                    if (contractor.profileId) {
                      void assignContractor(contractor.profileId);
                    }
                  }}
                  className={`w-full rounded-xl p-3 text-left transition-all ${
                    isAlreadyAssigned || hasConflict
                      ? 'cursor-not-allowed bg-[color:rgb(var(--nodu-text-rgb)/0.04)]'
                      : 'group hover:bg-[color:var(--nodu-accent-soft)]'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="av h-9 w-9 text-[10px]" style={{ backgroundColor: contractor.bg, color: contractor.fg }}>{contractor.ii}</div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold text-[color:var(--nodu-text)]">{contractor.name}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2">
                        <span className="text-[10px] text-[color:var(--nodu-text-soft)]">{contractor.city}</span>
                        <div className="flex gap-1">
                          {contractor.tags.includes('Ridic') && (
                            <span className="rounded-[4px] bg-[color:rgb(var(--nodu-text-rgb)/0.06)] px-1 py-0.5 text-[8px] font-bold uppercase text-[color:var(--nodu-text-soft)]">
                              Ridic
                            </span>
                          )}
                          <span className={`rounded-[4px] px-1 py-0.5 text-[8px] font-bold uppercase ${contractor.reliable ? 'bg-[color:var(--nodu-success-bg)] text-[color:var(--nodu-success-text)]' : 'bg-[color:var(--nodu-warning-bg)] text-[color:var(--nodu-warning-text)]'}`}>
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
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[color:var(--nodu-border)] bg-white text-[color:var(--nodu-accent)] transition-all group-hover:border-[color:var(--nodu-accent)] group-hover:bg-[color:var(--nodu-accent)] group-hover:text-white">
                        <Plus size={16} />
                      </div>
                    ) : (
                      <div className={`text-[10px] font-bold uppercase tracking-wider ${hasConflict ? 'text-[color:var(--nodu-warning-text)]' : 'text-[color:var(--nodu-success-text)]'}`}>
                        {hasConflict ? 'Kolize' : 'Prirazen'}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="border-t border-[color:rgb(var(--nodu-text-rgb)/0.08)] bg-[color:var(--nodu-paper-strong)] p-4">
            <button
              onClick={handleClose}
              className="w-full rounded-xl bg-[color:var(--nodu-text)] py-2.5 text-sm font-medium text-white shadow-[0_12px_28px_rgba(47,38,31,0.18)] transition-all hover:bg-[color:rgb(var(--nodu-text-rgb)/0.86)]"
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
