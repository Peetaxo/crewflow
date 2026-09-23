import React from 'react';
import { Save, Send, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAppContext } from '../../context/useAppContext';
import { KM_RATE } from '../../data';
import { calculateMealAllowance, calculateTotalHours, normalizeMealSelection } from '../../utils';
import { getTimelogDependencies, saveTimelog } from '../../features/timelogs/services/timelogs.service';
import { canEditTimelog, canSubmitTimelog } from '../../features/timelogs/services/timelog-permissions';
import type { Contractor, Event, Role, Timelog } from '../../types';
import { Button } from '../ui/button';
import TimelogEvidenceSection from '../../features/shift-workflows/TimelogEvidenceSection';
import { TimelogSubmitConfirmationDialog } from '../../features/shift-workflows/timelog-evidence-presentation';

type AutosaveState = 'idle' | 'pending' | 'saved' | 'error';
const autosaveDelayMs = 800;
const mobileTimelogSwipeStartMaxX = 96;
const mobileTimelogSwipeMinDistance = 64;
const mobileTimelogSwipeMaxVerticalDrift = 48;
const mobileTimelogCloseAnimationMs = 180;

const getTimelogDraftSignature = (timelog: Timelog): string => JSON.stringify({
  days: timelog.days.map((day) => ({
    id: day.id ?? null,
    d: day.d,
    f: day.f,
    t: day.t,
    type: day.type,
    meals: normalizeMealSelection(day),
    meal: normalizeMealSelection(day)[0] ?? null,
    note: day.note ?? '',
  })),
  km: timelog.km,
  note: timelog.note,
});

const getReadOnlyTimelogCopy = (status: Timelog['status']) => {
  if (status === 'pending_ch') {
    return {
      title: 'Výkaz je ve schvalování',
      detail: 'Čeká na kontrolu. Úpravy teď nejsou možné.',
    };
  }

  if (status === 'pending_coo') {
    return {
      title: 'Výkaz je ve schvalování',
      detail: 'Čeká na schválení COO. Úpravy teď nejsou možné.',
    };
  }

  if (status === 'approved') {
    return {
      title: 'Výkaz je schválený',
      detail: 'Schválený výkaz už nejde upravovat.',
    };
  }

  if (status === 'invoiced') {
    return {
      title: 'Výkaz je ve faktuře',
      detail: 'Výkaz už je navázaný na fakturaci.',
    };
  }

  if (status === 'paid') {
    return {
      title: 'Výkaz je zaplacený',
      detail: 'Zaplacený výkaz už nejde upravovat.',
    };
  }

  return {
    title: 'Výkaz je zamčený',
    detail: 'Úpravy teď nejsou možné.',
  };
};

type MobileTimelogSessionProps = {
  initialTimelog: Timelog;
  event: Event;
  contractor: Contractor;
  role: Role;
  setEditingTimelog: (next: Timelog | null) => void;
  onContractorDetail: () => void;
};

const MobileTimelogSession = ({ initialTimelog, event, contractor, role, setEditingTimelog, onContractorDetail }: MobileTimelogSessionProps) => {
  const [editingTimelog, setDraft] = React.useState(initialTimelog);
  const latestDraftRef = React.useRef(initialTimelog);
  const [editorSessionKey] = React.useState(() => String(initialTimelog.supabaseId ?? initialTimelog.id));
  const [isSubmitReviewOpen, setIsSubmitReviewOpen] = React.useState(false);
  const [autosaveState, setAutosaveState] = React.useState<AutosaveState>('idle');
  const [isSaving, setIsSaving] = React.useState(false);
  const [timelogSwipeOffset, setTimelogSwipeOffset] = React.useState(0);
  const [timelogSwipePhase, setTimelogSwipePhase] = React.useState<'idle' | 'dragging' | 'closing'>('idle');
  const autosaveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosavePromiseRef = React.useRef<Promise<Timelog | undefined> | null>(null);
  const lastAutosavedSignatureRef = React.useRef<string | null>(null);
  const retiredRef = React.useRef(false);
  const saveInFlightRef = React.useRef(false);
  const timelogSwipeStartRef = React.useRef<{ x: number; y: number } | null>(null);
  const timelogCloseTimeoutRef = React.useRef<number | null>(null);

  const clearAutosaveTimer = React.useCallback(() => {
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = null;
  }, []);
  const closeEditor = React.useCallback(() => {
    retiredRef.current = true;
    clearAutosaveTimer();
    setEditingTimelog(null);
  }, [clearAutosaveTimer, setEditingTimelog]);

  React.useLayoutEffect(() => {
    retiredRef.current = false;
    return () => {
      retiredRef.current = true;
      clearAutosaveTimer();
    };
  }, [clearAutosaveTimer]);

  const persistDraft = () => {
    const previous = autosavePromiseRef.current;
    const pending = (async () => {
      if (previous) await previous;
      if (retiredRef.current || saveInFlightRef.current) return;
      const nextTimelog = latestDraftRef.current;
      const signature = getTimelogDraftSignature(nextTimelog);
      if (lastAutosavedSignatureRef.current === signature) return nextTimelog;
      const savedTimelog = await saveTimelog(nextTimelog);
      if (retiredRef.current) return savedTimelog;
      lastAutosavedSignatureRef.current = signature;
      if (savedTimelog) {
        // Server identity/version may advance, but an old response never replaces newer input.
        const latest = latestDraftRef.current;
        const merged = {
          ...latest,
          id: savedTimelog.id,
          supabaseId: savedTimelog.supabaseId ?? latest.supabaseId,
          updatedAt: savedTimelog.updatedAt ?? latest.updatedAt,
        };
        latestDraftRef.current = merged;
        setDraft(merged);
        setEditingTimelog(merged);
      }
      setAutosaveState(getTimelogDraftSignature(latestDraftRef.current) === signature ? 'saved' : 'pending');
      return savedTimelog;
    })();
    autosavePromiseRef.current = pending;
    void pending.catch(() => {
      if (!retiredRef.current) setAutosaveState('error');
    }).finally(() => {
      if (autosavePromiseRef.current === pending) autosavePromiseRef.current = null;
    });
  };

  const handleChange = (next: Timelog) => {
    if (retiredRef.current || saveInFlightRef.current || !canEditTimelog(next, role)) return;
    latestDraftRef.current = next;
    setDraft(next);
    setEditingTimelog(next);
    if (next.status !== 'draft') return;
    clearAutosaveTimer();
    if (lastAutosavedSignatureRef.current === getTimelogDraftSignature(next)) {
      setAutosaveState('saved');
      return;
    }
    setAutosaveState('pending');
    autosaveTimerRef.current = setTimeout(() => {
      autosaveTimerRef.current = null;
      persistDraft();
    }, autosaveDelayMs);
  };

  const saveCurrentTimelog = async (status?: Timelog['status']) => {
    if (retiredRef.current || saveInFlightRef.current || !canEditTimelog(latestDraftRef.current, role)) return;
    saveInFlightRef.current = true;
    setIsSaving(true);
    clearAutosaveTimer();
    try {
      const pending = autosavePromiseRef.current;
      if (pending) await pending;
      if (retiredRef.current) return;
      const next = { ...latestDraftRef.current, ...(status ? { status } : {}) };
      if (status || getTimelogDraftSignature(next) !== lastAutosavedSignatureRef.current) {
        await saveTimelog(next);
      }
      if (!retiredRef.current) closeEditor();
    } finally {
      saveInFlightRef.current = false;
      if (!retiredRef.current) setIsSaving(false);
    }
  };

  const isReadOnly = !canEditTimelog(editingTimelog, role);
  const readOnlyCopy = isReadOnly ? getReadOnlyTimelogCopy(editingTimelog.status) : null;
  const isCrewWorkflow = role === 'crew';
  const isCrewHeadCorrection = role === 'crewhead' && editingTimelog.status === 'pending_ch';
  const canSubmitCurrentTimelog = canSubmitTimelog(editingTimelog, role);
  const displayDays = editingTimelog.days;
  const draftKm = editingTimelog.km;
  const draftNote = editingTimelog.note;
  const mealAllowanceEnabled = Boolean(event.mealAllowanceEnabled);
  const totalHours = calculateTotalHours(displayDays);
  const totalMealAllowance = calculateMealAllowance(displayDays, { enabled: mealAllowanceEnabled });
  const totalCompensation = totalHours * contractor.rate + draftKm * KM_RATE + totalMealAllowance;
  const saveButtonLabel = isCrewHeadCorrection ? 'Odeslat k potvrzení Crew' : isCrewWorkflow ? 'Uložit výkaz' : 'Uložit změny';
  const submitButtonLabel = editingTimelog.status === 'pending_crew_confirmation' ? 'Potvrdit a odeslat'
    : editingTimelog.status === 'rejected' ? 'Odeslat znovu' : 'Odeslat ke kontrole';
  const submitDialogTitle = editingTimelog.status === 'pending_crew_confirmation' ? 'Potvrdit úpravy?'
    : editingTimelog.status === 'rejected' ? 'Odeslat výkaz znovu?' : 'Odeslat výkaz ke kontrole?';
  const handleSaveDraft = async () => {
    try {
      await saveCurrentTimelog(isCrewHeadCorrection ? 'pending_crew_confirmation' : editingTimelog.status === 'rejected' ? 'draft' : undefined);
    } catch (error) {
      if (!retiredRef.current) toast.error(error instanceof Error ? error.message : 'Nepodařilo se uložit výkaz.');
    }
  };
  const confirmSubmitForReview = async () => {
    try {
      await saveCurrentTimelog('pending_ch');
    } catch (error) {
      if (!retiredRef.current) toast.error(error instanceof Error ? error.message : 'Nepodařilo se odeslat výkaz ke kontrole.');
    }
  };
  const handleSubmitForReview = () => {
    if (submitButtonLabel === 'Odeslat ke kontrole') setIsSubmitReviewOpen(true);
    else void confirmSubmitForReview();
  };
  const openContractorDetail = () => {
    closeEditor();
    onContractorDetail();
  };
  const resetTimelogSwipe = React.useCallback(() => {
    timelogSwipeStartRef.current = null;
    setTimelogSwipeOffset(0);
    setTimelogSwipePhase('idle');
  }, []);

  const scheduleTimelogClose = React.useCallback(() => {
    if (timelogCloseTimeoutRef.current) {
      window.clearTimeout(timelogCloseTimeoutRef.current);
    }

    timelogSwipeStartRef.current = null;
    setTimelogSwipePhase('closing');
    setTimelogSwipeOffset(window.innerWidth || 390);

    timelogCloseTimeoutRef.current = window.setTimeout(() => {
      timelogCloseTimeoutRef.current = null;
      closeEditor();
      setTimelogSwipeOffset(0);
      setTimelogSwipePhase('idle');
    }, mobileTimelogCloseAnimationMs);
  }, [closeEditor]);

  const startTimelogSwipe = React.useCallback((clientX: number, clientY: number) => {
    if (clientX > mobileTimelogSwipeStartMaxX) {
      resetTimelogSwipe();
      return;
    }

    timelogSwipeStartRef.current = { x: clientX, y: clientY };
    setTimelogSwipeOffset(0);
    setTimelogSwipePhase('dragging');
  }, [resetTimelogSwipe]);

  const completeTimelogSwipe = React.useCallback((clientX: number, clientY: number, shouldFinalize = false) => {
    const touchStart = timelogSwipeStartRef.current;

    if (!touchStart) return false;

    const deltaX = clientX - touchStart.x;
    const deltaY = Math.abs(clientY - touchStart.y);

    if (deltaY > mobileTimelogSwipeMaxVerticalDrift) {
      resetTimelogSwipe();
      return false;
    }

    const swipeOffset = Math.max(0, deltaX);
    setTimelogSwipeOffset(Math.min(swipeOffset, window.innerWidth || 390));

    if (shouldFinalize) {
      timelogSwipeStartRef.current = null;
      setTimelogSwipePhase('idle');

      if (deltaX >= mobileTimelogSwipeMinDistance && deltaY <= mobileTimelogSwipeMaxVerticalDrift) {
        scheduleTimelogClose();
        return true;
      }

      setTimelogSwipeOffset(0);
    }

    return swipeOffset > 0;
  }, [resetTimelogSwipe, scheduleTimelogClose]);

  const finishTimelogSwipe = React.useCallback((clientX: number, clientY: number) => {
    completeTimelogSwipe(clientX, clientY, true);
  }, [completeTimelogSwipe]);

  React.useEffect(() => () => {
    if (timelogCloseTimeoutRef.current) {
      window.clearTimeout(timelogCloseTimeoutRef.current);
      timelogCloseTimeoutRef.current = null;
    }
  }, []);

  React.useEffect(() => {
    if (!editingTimelog) return undefined;

    const handleWindowTouchStart = (touchEvent: TouchEvent) => {
      const touch = touchEvent.touches[0];

      if (!touch) {
        resetTimelogSwipe();
        return;
      }

      startTimelogSwipe(touch.clientX, touch.clientY);
    };

    const handleWindowTouchMove = (touchEvent: TouchEvent) => {
      const touch = touchEvent.touches[0];

      if (!touch) return;

      if (completeTimelogSwipe(touch.clientX, touch.clientY)) {
        touchEvent.preventDefault();
      }
    };

    const handleWindowTouchEnd = (touchEvent: TouchEvent) => {
      const touch = touchEvent.changedTouches[0];

      if (!touch) {
        resetTimelogSwipe();
        return;
      }

      finishTimelogSwipe(touch.clientX, touch.clientY);
    };

    const listenerOptions = { capture: true, passive: false } as AddEventListenerOptions;

    window.addEventListener('touchstart', handleWindowTouchStart, listenerOptions);
    window.addEventListener('touchmove', handleWindowTouchMove, listenerOptions);
    window.addEventListener('touchend', handleWindowTouchEnd, listenerOptions);
    window.addEventListener('touchcancel', resetTimelogSwipe, listenerOptions);

    return () => {
      window.removeEventListener('touchstart', handleWindowTouchStart, listenerOptions);
      window.removeEventListener('touchmove', handleWindowTouchMove, listenerOptions);
      window.removeEventListener('touchend', handleWindowTouchEnd, listenerOptions);
      window.removeEventListener('touchcancel', resetTimelogSwipe, listenerOptions);
    };
  }, [
    completeTimelogSwipe,
    editingTimelog,
    finishTimelogSwipe,
    resetTimelogSwipe,
    startTimelogSwipe,
  ]);

  const handleTimelogPointerDown = (pointerEvent: React.PointerEvent<HTMLDivElement>) => {
    if (pointerEvent.pointerType === 'touch') return;

    startTimelogSwipe(pointerEvent.clientX, pointerEvent.clientY);
    if (timelogSwipeStartRef.current && pointerEvent.currentTarget.setPointerCapture) {
      try {
        pointerEvent.currentTarget.setPointerCapture(pointerEvent.pointerId);
      } catch {
        // Browser previews can miss capture for synthetic pointer ids.
      }
    }
  };

  const handleTimelogPointerMove = (pointerEvent: React.PointerEvent<HTMLDivElement>) => {
    if (pointerEvent.pointerType === 'touch') return;

    if (completeTimelogSwipe(pointerEvent.clientX, pointerEvent.clientY)) {
      pointerEvent.preventDefault();
    }
  };

  const handleTimelogPointerUp = (pointerEvent: React.PointerEvent<HTMLDivElement>) => {
    if (pointerEvent.pointerType === 'touch') return;

    finishTimelogSwipe(pointerEvent.clientX, pointerEvent.clientY);
    if (pointerEvent.currentTarget.releasePointerCapture) {
      try {
        pointerEvent.currentTarget.releasePointerCapture(pointerEvent.pointerId);
      } catch {
        // Capture can be gone when the pointer sequence is interrupted.
      }
    }
  };

  const timelogSwipeOpacity = Math.max(0.86, 1 - (timelogSwipeOffset / 900));
  const timelogModalClassName = [
    'nodu-mobile-timelog-modal',
    timelogSwipePhase === 'dragging' ? 'nodu-mobile-timelog-modal--dragging' : '',
    timelogSwipePhase === 'closing' ? 'nodu-mobile-timelog-modal--closing' : '',
  ].filter(Boolean).join(' ');
  const timelogModalStyle = {
    '--nodu-mobile-timelog-swipe-x': `${timelogSwipeOffset}px`,
    '--nodu-mobile-timelog-swipe-opacity': timelogSwipeOpacity.toFixed(3),
    '--nodu-mobile-timelog-swipe-transition': timelogSwipePhase === 'dragging'
      ? 'none'
      : 'transform 180ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms ease',
  } as React.CSSProperties;

  return (
    <div className="nodu-mobile-timelog-layer fixed inset-0 z-[90] flex items-end">
      <div
        className="nodu-mobile-timelog-swipe-edge"
        aria-hidden="true"
        onPointerDown={handleTimelogPointerDown}
        onPointerMove={handleTimelogPointerMove}
        onPointerUp={handleTimelogPointerUp}
        onPointerCancel={resetTimelogSwipe}
      />
      <section
        className={timelogModalClassName}
        style={timelogModalStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-timelog-title"
        onPointerDown={handleTimelogPointerDown}
        onPointerMove={handleTimelogPointerMove}
        onPointerUp={handleTimelogPointerUp}
        onPointerCancel={resetTimelogSwipe}
      >
        <header className="nodu-mobile-timelog-header">
          <div className="min-w-0">
            <h3 id="mobile-timelog-title" className="text-xl font-semibold tracking-[-0.03em] text-[color:var(--nodu-text)]">
              Upravit výkaz
            </h3>
            <p className="mt-1 truncate text-[10px] uppercase tracking-[0.22em] text-[color:var(--nodu-text-soft)]">
              {contractor.name} · {event.name}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {contractor.profileId && (
              <button
                type="button"
                onClick={openContractorDetail}
                disabled={isSaving}
                className="av h-11 w-11 shrink-0 text-sm font-bold shadow-sm"
                style={{ backgroundColor: contractor.bg, color: contractor.fg }}
                aria-label={`Otevřít detail člena crew ${contractor.name}`}
              >
                {contractor.ii}
              </button>
            )}
            <button
              type="button"
              onClick={closeEditor}
              disabled={isSaving}
              className="nodu-mobile-timelog-icon-button"
              aria-label="Zavřít"
            >
              <X size={20} />
            </button>
          </div>
        </header>

        <fieldset disabled={isSaving} aria-busy={isSaving} className="contents">
        <div className="min-h-0 flex-1 overflow-y-auto">
        <TimelogEvidenceSection
          timelog={editingTimelog}
          event={event}
          contractor={contractor}
          role={role}
          readOnly={isReadOnly}
          busy={isSaving}
          editorSessionKey={editorSessionKey}
          onChange={handleChange}
        />
        </div>
        {editingTimelog.status === 'draft' && autosaveState !== 'idle' && (
          <div className="nodu-mobile-timelog-day-feedback" aria-live="polite">
            {autosaveState === 'pending' && 'Ukládám návrh...'}
            {autosaveState === 'saved' && 'Uloženo v návrhu'}
            {autosaveState === 'error' && 'Návrh se nepodařilo uložit'}
          </div>
        )}

        <footer
          className={`nodu-mobile-timelog-footer${canSubmitCurrentTimelog ? ' nodu-mobile-timelog-footer--split' : ''}`}
        >
          {readOnlyCopy ? (
            <div className="nodu-mobile-timelog-readonly-footer" aria-live="polite">
              <span>{readOnlyCopy.title}</span>
              <small>{readOnlyCopy.detail}</small>
            </div>
          ) : (
            <Button
              type="button"
              variant={canSubmitCurrentTimelog ? 'outline' : 'default'}
              onClick={handleSaveDraft}
              disabled={isSaving}
            >
              <Save size={16} /> {saveButtonLabel}
            </Button>
          )}
          {!readOnlyCopy && canSubmitCurrentTimelog && (
            <Button
              type="button"
              onClick={handleSubmitForReview}
              disabled={isSaving}
            >
              <Send size={16} /> {submitButtonLabel}
            </Button>
          )}
        </footer>
        {isSubmitReviewOpen && (
          <TimelogSubmitConfirmationDialog
            title={submitDialogTitle}
            confirmLabel={submitButtonLabel}
            days={displayDays}
            totalHours={totalHours}
            totalCompensation={totalCompensation}
            km={draftKm}
            note={draftNote}
            mealAllowanceEnabled={mealAllowanceEnabled}
            mealAllowanceTotal={totalMealAllowance}
            onClose={() => setIsSubmitReviewOpen(false)}
            onConfirm={confirmSubmitForReview}
          />
        )}
        </fieldset>
      </section>
    </div>
  );
};

const MobileTimelogEditModal: React.FC = () => {
  const { editingTimelog, setEditingTimelog, setCurrentTab, setSelectedContractorProfileId, role } = useAppContext();
  const { contractors, events } = getTimelogDependencies();
  if (!editingTimelog) return null;
  const contractor = contractors.find((item) => item.profileId === editingTimelog.contractorProfileId);
  const event = events.find((item) => item.id === editingTimelog.eid || item.supabaseId === editingTimelog.eid);
  if (!contractor || !event) return null;
  const identity = JSON.stringify([
    role, contractor.profileId, event.supabaseId ?? event.id,
    editingTimelog.status,
  ]);
  return <MobileTimelogSession
    key={identity}
    initialTimelog={editingTimelog}
    event={event}
    contractor={contractor}
    role={role}
    setEditingTimelog={setEditingTimelog}
    onContractorDetail={() => {
      if (!contractor.profileId) return;
      setSelectedContractorProfileId(contractor.profileId);
      setCurrentTab('crew');
    }}
  />;
};

export default MobileTimelogEditModal;
