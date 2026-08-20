import React from 'react';
import { Plus, Send, Trash2, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import { useAppContext } from '../../context/useAppContext';
import { useIsMobile } from '../../hooks/use-mobile';
import { MEAL_CONFIG, PHASE_CONFIG } from '../../constants';
import { KM_RATE } from '../../data';
import { calculateMealAllowance, calculateTotalHours, formatCurrency, normalizeMealSelection } from '../../utils';
import { getTimelogDependencies, saveTimelog } from '../../features/timelogs/services/timelogs.service';
import { buildTimelogChangeSummary } from '../../features/timelogs/services/timelog-change-summary';
import { canSubmitTimelog } from '../../features/timelogs/services/timelog-permissions';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import MobileTimelogEditModal from './MobileTimelogEditModal';

const TimelogEditModal = () => {
  const {
    editingTimelog,
    setEditingTimelog,
    setCurrentTab,
    setSelectedContractorProfileId,
    role,
  } = useAppContext();
  const isMobile = useIsMobile();

  if (isMobile) {
    return <MobileTimelogEditModal />;
  }

  if (!editingTimelog) return null;

  const { contractors, events } = getTimelogDependencies();
  const contractor = contractors.find((item) => item.profileId === editingTimelog.contractorProfileId)
    ?? null;
  const event = events.find((item) => item.id === editingTimelog.eid || item.supabaseId === editingTimelog.eid) ?? null;
  if (!contractor || !event) return null;

  const totalHours = calculateTotalHours(editingTimelog.days);
  const mealAllowanceEnabled = Boolean(event.mealAllowanceEnabled);
  const totalMealAllowance = calculateMealAllowance(editingTimelog.days, { enabled: mealAllowanceEnabled });
  const isCrewHeadCorrection = role === 'crewhead' && editingTimelog.status === 'pending_ch';
  const isCrewWorkflow = role === 'crew';
  const canSubmitCurrentTimelog = isCrewWorkflow && canSubmitTimelog(editingTimelog, role);
  const changeSummary = buildTimelogChangeSummary(editingTimelog);
  const showCrewConfirmationChanges = editingTimelog.status === 'pending_crew_confirmation' && changeSummary.length > 0;
  const showReturnedNotice = editingTimelog.status === 'rejected';
  const correctionNote = editingTimelog.reviewNote?.trim() || '';
  const returnedNote = editingTimelog.reviewNote?.trim() || '';
  const saveButtonLabel = isCrewHeadCorrection ? 'Odeslat k potvrzení Crew' : 'Uložit změny';
  const submitButtonLabel = editingTimelog.status === 'pending_crew_confirmation'
    ? 'Potvrdit a odeslat'
    : editingTimelog.status === 'rejected'
      ? 'Odeslat znovu'
      : 'Odeslat ke kontrole';
  const openContractorDetail = () => {
    if (!contractor.profileId) return;
    setEditingTimelog(null);
    setSelectedContractorProfileId(contractor.profileId);
    setCurrentTab('crew');
  };

  const submitTimelogForReview = async () => {
    try {
      await saveTimelog({ ...editingTimelog, status: 'pending_ch' });
      setEditingTimelog(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nepodařilo se odeslat výkaz ke kontrole.');
    }
  };

  const resolveExpectedDay = (day: typeof editingTimelog.days[number]) => {
    if (!event.showDayTypes) {
      return {
        type: 'instal',
        f: event.startTime || day.f,
        t: event.endTime || day.t,
      };
    }

    const matchingSlot = event.phaseSchedules?.[day.type]?.find((slot) => slot.dates.includes(day.d));
    const fallbackType = event.dayTypes?.[day.d] || day.type;
    const fallbackSlot = event.phaseSchedules?.[fallbackType]?.find((slot) => slot.dates.includes(day.d));

    return {
      type: matchingSlot ? day.type : fallbackType,
      f: matchingSlot?.from ?? fallbackSlot?.from ?? event.phaseTimes?.[fallbackType]?.from ?? event.startTime ?? day.f,
      t: matchingSlot?.to ?? fallbackSlot?.to ?? event.phaseTimes?.[fallbackType]?.to ?? event.endTime ?? day.t,
    };
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
          <div className="flex items-center justify-between gap-4 border-b border-[color:rgb(var(--nodu-text-rgb)/0.08)] p-5">
            <div>
              <h3 className="text-xl font-semibold tracking-[-0.03em] text-[color:var(--nodu-text)]">Upravit výkaz</h3>
              <p className="mt-1 text-[10px] uppercase tracking-[0.22em] text-[color:var(--nodu-text-soft)]">
                {contractor.name} · {event.name}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {contractor.profileId && (
                <button
                  type="button"
                  onClick={openContractorDetail}
                  className="av h-11 w-11 shrink-0 text-sm font-bold shadow-sm transition hover:ring-2 hover:ring-[rgba(var(--nodu-accent-rgb),0.22)] focus:outline-none focus:ring-2 focus:ring-[rgba(var(--nodu-accent-rgb),0.28)]"
                  style={{ backgroundColor: contractor.bg, color: contractor.fg }}
                  title={`Otevrit detail: ${contractor.name}`}
                  aria-label={`Otevrit detail clena crew ${contractor.name}`}
                >
                  {contractor.ii}
                </button>
              )}
              <button onClick={() => setEditingTimelog(null)} className="rounded-xl border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.92)] p-2 text-[color:var(--nodu-text-soft)] transition-all hover:border-[color:rgb(var(--nodu-accent-rgb)/0.24)] hover:text-[color:var(--nodu-accent)]">
                <X size={20} />
              </button>
            </div>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            <div className="rounded-[22px] border border-[color:rgb(var(--nodu-accent-rgb)/0.18)] bg-[color:rgb(var(--nodu-accent-rgb)/0.08)] p-4">
              <div className="flex items-center justify-between">
                <div className="text-xs uppercase tracking-[0.18em] text-[color:var(--nodu-accent)]">Celkem hodin</div>
                <div className="text-xl font-bold text-[color:var(--nodu-text)]">{totalHours.toFixed(1)}h</div>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <div className="text-xs text-[color:var(--nodu-text-soft)]">Odměna</div>
                <div className="text-sm font-semibold text-[color:var(--nodu-text)]">
                  {formatCurrency(totalHours * contractor.rate + totalMealAllowance)}
                </div>
              </div>
              {editingTimelog.km > 0 && (
                <div className="mt-1 flex items-center justify-between">
                  <div className="text-xs text-[color:var(--nodu-text-soft)]">Cestovné</div>
                  <div className="text-sm font-semibold text-[color:var(--nodu-text)]">
                    {formatCurrency(editingTimelog.km * KM_RATE)}
                  </div>
                </div>
              )}
            </div>

            {showCrewConfirmationChanges && (
              <div className="rounded-[18px] border border-[color:rgb(var(--nodu-accent-rgb)/0.24)] bg-[color:rgb(var(--nodu-accent-rgb)/0.07)] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--nodu-accent)]">
                    Upraveno CH
                  </div>
                  <div className="text-[11px] font-semibold text-[color:var(--nodu-text-soft)]">
                    Čeká na tvoje potvrzení
                  </div>
                </div>
                <div className="mt-2 space-y-1 text-xs font-medium text-[color:var(--nodu-text)]">
                  {changeSummary.map((change) => (
                    <div key={change}>{change}</div>
                  ))}
                  {correctionNote && (
                    <div className="rounded-[12px] bg-[color:rgb(var(--nodu-surface-rgb)/0.72)] px-3 py-2 text-[color:var(--nodu-text)]">
                      {correctionNote}
                    </div>
                  )}
                </div>
              </div>
            )}

            {showReturnedNotice && (
              <div className="rounded-[18px] border border-[color:var(--nodu-error-border)] bg-[color:var(--nodu-error-bg)] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--nodu-error-text)]">
                    Vráceno k opravě
                  </div>
                  <div className="text-[11px] font-semibold text-[color:var(--nodu-text-soft)]">
                    Uprav výkaz a odešli ho znovu ke kontrole.
                  </div>
                </div>
                {returnedNote && (
                  <div className="mt-2 rounded-[14px] bg-[color:rgb(var(--nodu-surface-rgb)/0.76)] px-3 py-2 text-xs font-medium text-[color:var(--nodu-text)]">
                    {returnedNote}
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="mb-2 block text-[10px] uppercase tracking-[0.22em] text-[color:var(--nodu-text-soft)]">Dny</label>
              <div className="space-y-2">
                {editingTimelog.days.map((day, idx) => {
                  const expectedDay = resolveExpectedDay(day);
                  const isDifferent =
                    day.type !== expectedDay.type
                    || day.f !== expectedDay.f
                    || day.t !== expectedDay.t;

                  return (
                    <div
                      key={`${day.d}-${idx}`}
                      className={`rounded-lg border p-2.5 ${
                        isDifferent
                          ? 'border-[color:rgb(var(--nodu-accent-rgb)/0.18)] bg-[color:rgb(var(--nodu-accent-rgb)/0.08)]'
                          : 'border-[color:rgb(var(--nodu-text-rgb)/0.08)] bg-[color:rgb(var(--nodu-surface-rgb)/0.9)]'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Input
                          type="date"
                          value={day.d}
                          onChange={(e) => {
                            const newDays = [...editingTimelog.days];
                            newDays[idx] = { ...newDays[idx], d: e.target.value };
                            setEditingTimelog({ ...editingTimelog, days: newDays });
                          }}
                          className="flex-1 text-xs"
                        />
                        <Input
                          type="time"
                          value={day.f}
                          onChange={(e) => {
                            const newDays = [...editingTimelog.days];
                            newDays[idx] = { ...newDays[idx], f: e.target.value };
                            setEditingTimelog({ ...editingTimelog, days: newDays });
                          }}
                          className="w-24 text-xs"
                        />
                        <span className="text-xs text-[color:var(--nodu-text-soft)]">-</span>
                        <Input
                          type="time"
                          value={day.t}
                          onChange={(e) => {
                            const newDays = [...editingTimelog.days];
                            newDays[idx] = { ...newDays[idx], t: e.target.value };
                            setEditingTimelog({ ...editingTimelog, days: newDays });
                          }}
                          className="w-24 text-xs"
                        />
                        <select
                          value={day.type}
                          onChange={(e) => {
                            const newDays = [...editingTimelog.days];
                            newDays[idx] = { ...newDays[idx], type: e.target.value as typeof day.type };
                            setEditingTimelog({ ...editingTimelog, days: newDays });
                          }}
                          className="w-28 rounded-xl border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.88)] px-2 py-2 text-[10px] text-[color:var(--nodu-text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] outline-none focus:border-[color:rgb(var(--nodu-accent-rgb)/0.32)]"
                        >
                          {PHASE_CONFIG.map((phase) => (
                            <option key={phase.type} value={phase.type}>{phase.label}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => {
                            const newDays = editingTimelog.days.filter((_, dayIndex) => dayIndex !== idx);
                            setEditingTimelog({ ...editingTimelog, days: newDays });
                          }}
                          className="p-1 text-[color:var(--nodu-text-soft)] transition-colors hover:text-[#c45c39]"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      {mealAllowanceEnabled && (
                        <div className="mt-2" role="group" aria-label={`Jídlo ${idx + 1}`}>
                          <div className="mb-1 text-[10px] uppercase tracking-[0.2em] text-[color:var(--nodu-text-soft)]">Jídlo</div>
                          <div className="grid grid-cols-2 gap-2">
                            {MEAL_CONFIG.map((meal) => {
                              const selectedMeals = normalizeMealSelection(day);
                              const isSelected = selectedMeals.includes(meal.type);
                              const nextMeals = isSelected
                                ? selectedMeals.filter((selectedMeal) => selectedMeal !== meal.type)
                                : [...selectedMeals, meal.type];

                              return (
                                <button
                                  key={meal.type}
                                  type="button"
                                  aria-pressed={isSelected}
                                  onClick={() => {
                                    const newDays = [...editingTimelog.days];
                                    newDays[idx] = {
                                      ...newDays[idx],
                                      meals: nextMeals,
                                      meal: nextMeals[0] ?? null,
                                    };
                                    setEditingTimelog({ ...editingTimelog, days: newDays });
                                  }}
                                  className={[
                                    'min-h-10 rounded-xl border px-3 text-xs font-semibold transition',
                                    isSelected
                                      ? 'border-[color:rgb(var(--nodu-accent-rgb)/0.4)] bg-[color:rgb(var(--nodu-accent-rgb)/0.12)] text-[color:var(--nodu-accent)]'
                                      : 'border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.9)] text-[color:var(--nodu-text)] hover:border-[color:rgb(var(--nodu-accent-rgb)/0.22)]',
                                  ].join(' ')}
                                >
                                  {meal.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      <Input
                        value={day.note ?? ''}
                        onChange={(e) => {
                          const newDays = [...editingTimelog.days];
                          newDays[idx] = { ...newDays[idx], note: e.target.value };
                          setEditingTimelog({ ...editingTimelog, days: newDays });
                        }}
                        className="mt-2 text-xs"
                        placeholder="Poznámka ke dni (volitelně)"
                      />
                    </div>
                  );
                })}
                <button
                  onClick={() => {
                    const nextDate = editingTimelog.days.length > 0
                      ? editingTimelog.days[editingTimelog.days.length - 1].d
                      : event.startDate;
                    const defaultType = !event.showDayTypes
                      ? 'instal'
                      : (event.dayTypes?.[nextDate] || 'provoz');
                    const matchingSlot = event.phaseSchedules?.[defaultType]?.find((slot) => slot.dates.includes(nextDate));

                    setEditingTimelog({
                      ...editingTimelog,
                      days: [
                        ...editingTimelog.days,
                        {
                          d: nextDate,
                          f: matchingSlot?.from || event.phaseTimes?.[defaultType]?.from || event.startTime || '08:00',
                          t: matchingSlot?.to || event.phaseTimes?.[defaultType]?.to || event.endTime || '17:00',
                          type: defaultType,
                          note: '',
                        },
                      ],
                    });
                  }}
                  className="flex w-full items-center justify-center gap-1 rounded-[18px] border border-dashed border-[color:rgb(var(--nodu-accent-rgb)/0.26)] py-3 text-xs text-[color:var(--nodu-accent)] transition-colors hover:bg-[color:rgb(var(--nodu-accent-rgb)/0.06)]"
                >
                  <Plus size={14} /> Přidat den
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-[0.22em] text-[color:var(--nodu-text-soft)]">Cestovné (km)</label>
                <Input
                  type="number"
                  value={editingTimelog.km}
                  onChange={(e) => setEditingTimelog({ ...editingTimelog, km: Number(e.target.value) })}
                />
              </div>
            </div>

            {isCrewHeadCorrection && (
              <div className="rounded-2xl border border-[color:rgb(var(--nodu-text-rgb)/0.08)] bg-[color:rgb(var(--nodu-text-rgb)/0.03)] p-3">
                <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.22em] text-[color:var(--nodu-text-soft)]">
                  Poznámka Crew
                </div>
                <p className="text-sm font-semibold text-[color:var(--nodu-text)]">
                  {editingTimelog.note.trim() || 'Crew nepřidala poznámku.'}
                </p>
              </div>
            )}

            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-[0.22em] text-[color:var(--nodu-text-soft)]">
                {isCrewHeadCorrection ? 'Poznámka pro Crew' : 'Poznámka'}
              </label>
              <Textarea
                value={isCrewHeadCorrection ? editingTimelog.reviewNote ?? '' : editingTimelog.note}
                onChange={(e) => setEditingTimelog(isCrewHeadCorrection
                  ? { ...editingTimelog, reviewNote: e.target.value }
                  : { ...editingTimelog, note: e.target.value })}
                className="h-20 resize-none"
                placeholder={isCrewHeadCorrection ? 'Doplňte komentář k úpravě pro člena Crew...' : 'Doplňte detaily...'}
              />
            </div>
          </div>

          <div className="flex gap-3 border-t border-[color:rgb(var(--nodu-text-rgb)/0.08)] bg-[color:rgb(var(--nodu-surface-rgb)/0.92)] p-4">
            <Button
              onClick={() => setEditingTimelog(null)}
              variant="outline"
              className="flex-1"
            >
              Zrušit
            </Button>
            <Button
              onClick={async () => {
                try {
                  await saveTimelog(isCrewHeadCorrection
                    ? { ...editingTimelog, status: 'pending_crew_confirmation' }
                    : editingTimelog);
                  setEditingTimelog(null);
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : 'Nepodařilo se uložit výkaz.');
                }
              }}
              className="flex-1"
            >
              {saveButtonLabel}
            </Button>
            {canSubmitCurrentTimelog && (
              <Button
                onClick={() => { void submitTimelogForReview(); }}
                className="flex-1"
              >
                <Send size={16} /> {submitButtonLabel}
              </Button>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default TimelogEditModal;
