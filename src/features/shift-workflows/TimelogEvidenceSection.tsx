import React from 'react';
import { Check, ChevronLeft, ChevronRight, Plus, Trash2, X } from 'lucide-react';
import { MEAL_CONFIG, PHASE_CONFIG } from '../../constants';
import { KM_RATE } from '../../data';
import { calculateDayHours, calculateMealAllowance, calculateTotalHours, formatCurrency, isOvernightTimeRange, normalizeMealSelection } from '../../utils';
import { buildTimelogChangeSummary } from '../timelogs/services/timelog-change-summary';
import { buildEventScheduleDays } from '../events/services/event-schedule';
import { canEditTimelog, canSeeTimelogNote } from '../timelogs/services/timelog-permissions';
import { buildTimelogCalendarDates, createTimelogDayEntryId, getTimelogDayEntryKey, isDateInEventRange, removeTimelogDayEntry, resolveTimelogDayDefaults, upsertTimelogDay } from '../timelogs/services/timelog-day-ui';
import type { Contractor, Event, Role, Timelog, TimelogDay, TimelogMeal, TimelogType } from '../../types';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { TimelogReportSummary } from './timelog-evidence-presentation';

export interface TimelogEvidenceSectionProps {
  timelog: Timelog;
  event: Event;
  contractor: Contractor;
  role: Role;
  readOnly?: boolean;
  busy?: boolean;
  editorSessionKey: string;
  onChange: (next: Timelog) => void;
}

const formatDateLabel = (date: string) => {
  const [year, month, day] = date.split('-');
  return `${day}.${month}.${year}`;
};

const calendarWeekdayLabels = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];
const calendarMonthLabels = [
  'leden',
  'únor',
  'březen',
  'duben',
  'květen',
  'červen',
  'červenec',
  'srpen',
  'září',
  'říjen',
  'listopad',
  'prosinec',
];

type AddDayCalendarDate = {
  date: string;
  isCurrentMonth: boolean;
};

const parseIsoDateParts = (date: string): { year: number; monthIndex: number; day: number } => {
  const [year, month, day] = date.split('-').map(Number);

  return {
    year,
    monthIndex: month - 1,
    day,
  };
};

const formatIsoDateFromUtc = (date: Date): string => (
  [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-')
);

const shiftCalendarMonth = (date: string, offset: number): string => {
  const { year, monthIndex } = parseIsoDateParts(date);
  const nextDate = new Date(Date.UTC(year, monthIndex + offset, 1));

  return formatIsoDateFromUtc(nextDate);
};

const buildAddDayCalendarDates = (monthDate: string): AddDayCalendarDate[] => {
  const { year, monthIndex } = parseIsoDateParts(monthDate);
  const firstDayOfMonth = new Date(Date.UTC(year, monthIndex, 1));
  const mondayOffset = (firstDayOfMonth.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const cellCount = Math.ceil((mondayOffset + daysInMonth) / 7) * 7;
  const gridStartTime = Date.UTC(year, monthIndex, 1 - mondayOffset);

  return Array.from({ length: cellCount }, (_, index) => {
    const date = new Date(gridStartTime + index * 24 * 60 * 60 * 1000);

    return {
      date: formatIsoDateFromUtc(date),
      isCurrentMonth: date.getUTCMonth() === monthIndex,
    };
  });
};

const formatCalendarMonthLabel = (date: string): string => {
  const { year, monthIndex } = parseIsoDateParts(date);

  return `${calendarMonthLabels[monthIndex]} ${year}`;
};

const normalizeDay = (day: TimelogDay): TimelogDay => ({
  ...day,
  meals: normalizeMealSelection(day),
  meal: normalizeMealSelection(day)[0] ?? null,
  note: day.note ?? '',
});

type TimelogDayEntry = {
  day: TimelogDay;
  entryKey: string;
  index: number;
};

const getTimelogDayEntriesForDate = (
  date: string | null,
  days: TimelogDay[],
): TimelogDayEntry[] => {
  if (!date) return [];

  return days
    .map((day, index): TimelogDayEntry => ({
      day: normalizeDay(day),
      entryKey: getTimelogDayEntryKey(day, index),
      index,
    }))
    .filter((entry) => entry.day.d === date);
};

const createDraftDay = (date: string, event: Event, preferredType?: TimelogType): TimelogDay => ({
  ...resolveTimelogDayDefaults(date, event, preferredType),
  ...(event.scheduleVersion === 2 ? { f: '', t: '' } : {}),
  id: createTimelogDayEntryId(),
});

const getEvidenceCalendarDates = (event: Event, days: TimelogDay[]) => (
  event.scheduleVersion === 2
    ? [...new Set([...buildEventScheduleDays(event), ...days].map((day) => day.d))].sort()
    : buildTimelogCalendarDates(event, days)
);

const phaseOptions: Array<{ value: TimelogType; label: string }> = PHASE_CONFIG.map((phase) => ({
  value: phase.type,
  label: phase.label,
}));
const mealOptions = MEAL_CONFIG.map((meal) => ({
  value: meal.type,
  label: meal.label,
}));

const formatMealLabels = (meals: TimelogMeal[]): string => (
  meals
    .map((meal) => mealOptions.find((option) => option.value === meal)?.label ?? meal)
    .join(' + ')
);

const timeOptionHeight = 40;
const hourOptions = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, '0'));
const minuteOptions = ['00', '15', '30', '45'];

type ActiveTimePicker = 'from' | 'to';

const splitTimeValue = (value: string): { hour: string; minute: string } => {
  const [rawHour = '00', rawMinute = '00'] = value.split(':');
  const paddedHour = rawHour.padStart(2, '0');
  const hour = hourOptions.includes(paddedHour) ? paddedHour : '00';
  const minute = minuteOptions.includes(rawMinute) ? rawMinute : '00';

  return { hour, minute };
};

type TimeFieldProps = {
  label: string;
  value: string;
  isActive: boolean;
  disabled?: boolean;
  onActivate: () => void;
};

const TimeField: React.FC<TimeFieldProps> = ({
  label,
  value,
  isActive,
  disabled = false,
  onActivate,
}) => (
  <div
    className={[
      'nodu-mobile-timelog-time-picker',
      isActive ? 'nodu-mobile-timelog-time-picker--active' : '',
      disabled ? 'nodu-mobile-timelog-time-picker--disabled' : '',
    ].filter(Boolean).join(' ')}
    role="group"
    aria-label={label}
    data-active={isActive ? 'true' : 'false'}
  >
    <div className="nodu-mobile-timelog-time-label text-[10px] uppercase tracking-[0.2em] text-[color:var(--nodu-text-soft)]">
      {label}
    </div>
    <button
      type="button"
      aria-label={`Otevřít výběr času ${label} ${value}`}
      aria-expanded={isActive}
      className="nodu-mobile-timelog-time-trigger"
      disabled={disabled}
      onClick={onActivate}
    >
      <span>{value ? value.replace(/^(\d):/, '0$1:') : '--:--'}</span>
    </button>
  </div>
);

type TimeWheelPickerProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onConfirm: () => void;
};

const TimeWheelPicker: React.FC<TimeWheelPickerProps> = ({
  label,
  value,
  onChange,
  onConfirm,
}) => {
  const hourColumnRef = React.useRef<HTMLDivElement | null>(null);
  const minuteColumnRef = React.useRef<HTMLDivElement | null>(null);
  const userScrollIntent = React.useRef({ hour: false, minute: false });
  const { hour, minute } = splitTimeValue(value);

  React.useEffect(() => {
    if (hourColumnRef.current) {
      hourColumnRef.current.scrollTop = hourOptions.indexOf(hour) * timeOptionHeight;
    }

    if (minuteColumnRef.current) {
      minuteColumnRef.current.scrollTop = minuteOptions.indexOf(minute) * timeOptionHeight;
    }
  }, [hour, minute]);

  const updateTime = (nextHour: string, nextMinute: string) => {
    const nextValue = `${nextHour}:${nextMinute}`;

    if (nextValue !== value) {
      onChange(nextValue);
    }
  };

  const handleColumnScroll = (
    part: 'hour' | 'minute',
    event: React.UIEvent<HTMLDivElement>,
  ) => {
    // Mount/value synchronization also dispatches scroll; it is not a user choice.
    if (!userScrollIntent.current[part]) return;
    const options = part === 'hour' ? hourOptions : minuteOptions;
    const selectedIndex = Math.round(event.currentTarget.scrollTop / timeOptionHeight);
    const nextPartValue = options[Math.max(0, Math.min(options.length - 1, selectedIndex))];

    if (!nextPartValue) return;

    if (part === 'hour') {
      updateTime(nextPartValue, minute);
      return;
    }

    updateTime(hour, nextPartValue);
  };

  const renderColumn = (
    part: 'hour' | 'minute',
    options: string[],
    selectedValue: string,
    columnRef: React.RefObject<HTMLDivElement | null>,
  ) => (
    <div
      ref={columnRef}
      className={[
        'nodu-mobile-timelog-time-column',
        `nodu-mobile-timelog-time-column--${part}`,
      ].join(' ')}
      data-time-part={part}
      onPointerDown={() => { userScrollIntent.current[part] = true; }}
      onTouchStart={() => { userScrollIntent.current[part] = true; }}
      onWheel={() => { userScrollIntent.current[part] = true; }}
      onKeyDown={(event) => {
        if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) {
          userScrollIntent.current[part] = true;
        }
      }}
      onScroll={(event) => handleColumnScroll(part, event)}
    >
      {options.map((option) => {
        const isSelected = option === selectedValue;
        const partLabel = part === 'hour' ? 'hodina' : 'minuta';

        return (
          <button
            key={option}
            type="button"
            aria-label={`${label} ${partLabel} ${option}`}
            aria-pressed={isSelected}
            onClick={() => {
              if (part === 'hour') {
                updateTime(option, minute);
                return;
              }

              updateTime(hour, option);
            }}
            className={[
              'nodu-mobile-timelog-time-option',
              isSelected ? 'nodu-mobile-timelog-time-option--selected' : '',
            ].filter(Boolean).join(' ')}
          >
            {option}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="nodu-mobile-timelog-time-wheel" role="group" aria-label={`Výběr času ${label}`}>
      <div className="nodu-mobile-timelog-time-wheel-selection" aria-hidden="true" />
      <button
        type="button"
        aria-label={`Potvrdit čas ${label}`}
        className="nodu-mobile-timelog-time-confirm"
        onClick={() => {
          if (!value) updateTime(hour, minute);
          onConfirm();
        }}
      >
        <Check size={16} aria-hidden="true" />
      </button>
      {renderColumn('hour', hourOptions, hour, hourColumnRef)}
      {renderColumn('minute', minuteOptions, minute, minuteColumnRef)}
    </div>
  );
};

const EvidenceSectionFields = ({ timelog: editingTimelog, event, contractor, role, readOnly = false, busy = false, onChange }: TimelogEvidenceSectionProps) => {
  const initialDate = editingTimelog.days[0]?.d ?? getEvidenceCalendarDates(event, [])[0] ?? event.startDate;
  const [selection, setSelection] = React.useState(() => ({
    date: initialDate,
    entryKey: getTimelogDayEntriesForDate(initialDate, editingTimelog.days)[0]?.entryKey ?? null,
    emptyDay: createDraftDay(initialDate, event),
  }));
  const [isAddDayCalendarOpen, setIsAddDayCalendarOpen] = React.useState(false);
  const [addDayCandidateDate, setAddDayCandidateDate] = React.useState(initialDate);
  const [addDayMonthDate, setAddDayMonthDate] = React.useState(initialDate);
  const [activeTimePicker, setActiveTimePicker] = React.useState<ActiveTimePicker | null>(null);
  const selectedDate = selection.date;
  const selectedDateEntries = getTimelogDayEntriesForDate(selectedDate, editingTimelog.days);
  const selectedEntry = selectedDateEntries.find((entry) => entry.entryKey === selection.entryKey)
    ?? selectedDateEntries[0] ?? null;
  const draftDay = selectedEntry?.day ?? selection.emptyDay;
  const activeEntryKey = selectedEntry?.entryKey ?? draftDay.id ?? null;
  const currentEntryKey = activeEntryKey;
  const selectedEntryExists = selectedEntry !== null;
  const selectedEntryIndex = selectedDateEntries.findIndex((entry) => entry.entryKey === activeEntryKey);
  const selectedEntryNumber = selectedEntryIndex + 1;
  const calendarDates = getEvidenceCalendarDates(event, editingTimelog.days);
  const addDayPickerDates = buildAddDayCalendarDates(addDayMonthDate);
  const isReadOnly = readOnly || !canEditTimelog(editingTimelog, role);
  const readOnlyCopy = isReadOnly;
  const draftKm = editingTimelog.km;
  const draftNote = editingTimelog.note;
  const draftReviewNote = editingTimelog.reviewNote ?? '';
  const displayDays = editingTimelog.days;
  const mealAllowanceEnabled = Boolean(event.mealAllowanceEnabled);
  const totalHours = calculateTotalHours(displayDays);
  const totalMealAllowance = calculateMealAllowance(displayDays, { enabled: mealAllowanceEnabled });
  const totalCompensation = totalHours * contractor.rate + draftKm * KM_RATE + totalMealAllowance;
  const isCrewHeadCorrection = role === 'crewhead' && editingTimelog.status === 'pending_ch';
  const changeSummary = buildTimelogChangeSummary(editingTimelog);
  const showCrewConfirmationChanges = editingTimelog.status === 'pending_crew_confirmation' && changeSummary.length > 0;
  const showReturnedNotice = editingTimelog.status === 'rejected';
  const correctionNote = editingTimelog.reviewNote?.trim() || '';
  const returnedNote = editingTimelog.reviewNote?.trim() || '';

  const emit = (next: Timelog) => {
    if (!isReadOnly && !busy) onChange(next);
  };
  const updateDraftDay = (nextDay: TimelogDay) => {
    emit({ ...editingTimelog, days: upsertTimelogDay(editingTimelog.days, nextDay, currentEntryKey ?? undefined, { appendIfMissing: true }) });
  };
  const selectCalendarDate = (date: string) => {
    setSelection({ date, entryKey: getTimelogDayEntriesForDate(date, editingTimelog.days)[0]?.entryKey ?? null, emptyDay: createDraftDay(date, event) });
    setActiveTimePicker(null);
    setIsAddDayCalendarOpen(false);
  };
  const selectExistingEntry = (entry: TimelogDayEntry) => {
    setSelection({ date: entry.day.d, entryKey: entry.entryKey, emptyDay: entry.day });
    setActiveTimePicker(null);
  };
  const addRecordForSelectedDate = () => {
    if (isReadOnly || busy) return;
    const nextDay = createDraftDay(selectedDate, event);
    emit({ ...editingTimelog, days: upsertTimelogDay(editingTimelog.days, nextDay, nextDay.id, { appendIfMissing: true }) });
    setSelection({ date: selectedDate, entryKey: nextDay.id!, emptyDay: nextDay });
    setActiveTimePicker(null);
  };
  const deleteSelectedDay = () => {
    if (isReadOnly || busy || !currentEntryKey) return;
    const remainingDays = removeTimelogDayEntry(editingTimelog.days, currentEntryKey);
    const remainingEntries = getTimelogDayEntriesForDate(selectedDate, remainingDays);
    const date = isDateInEventRange(selectedDate, event) || remainingEntries.length
      ? selectedDate : getEvidenceCalendarDates(event, remainingDays)[0] ?? event.startDate;
    const nextEntry = date === selectedDate ? remainingEntries[Math.max(0, Math.min(selectedEntryIndex - 1, remainingEntries.length - 1))]
      : getTimelogDayEntriesForDate(date, remainingDays)[0];
    emit({ ...editingTimelog, days: remainingDays });
    setSelection({ date, entryKey: nextEntry?.entryKey ?? null, emptyDay: nextEntry?.day ?? createDraftDay(date, event) });
    setActiveTimePicker(null);
  };
  const openAddDayCalendar = () => {
    setActiveTimePicker(null);
    setAddDayCandidateDate(selectedDate);
    setAddDayMonthDate(selectedDate);
    setIsAddDayCalendarOpen(true);
  };
  const selectAddDayCandidate = setAddDayCandidateDate;
  const confirmAddDayCandidate = () => {
    if (isReadOnly || busy) return;
    if (calendarDates.includes(addDayCandidateDate)) {
      selectCalendarDate(addDayCandidateDate);
      return;
    }
    const nextDay = createDraftDay(addDayCandidateDate, event);
    emit({ ...editingTimelog, days: [...editingTimelog.days, nextDay] });
    setSelection({ date: addDayCandidateDate, entryKey: nextDay.id!, emptyDay: nextDay });
    setIsAddDayCalendarOpen(false);
  };
  const moveAddDayCalendarMonth = (offset: number) => {
    const nextMonth = shiftCalendarMonth(addDayMonthDate, offset);
    setAddDayMonthDate(nextMonth);
    setAddDayCandidateDate(nextMonth);
  };
  return (
    <fieldset disabled={busy} aria-busy={busy} className="contents">
        <div className="nodu-mobile-timelog-body" style={{ overflowY: 'visible', flex: 'none' }}>
          <div className="nodu-mobile-timelog-summary">
            <div>
              <div className="nodu-mobile-timelog-summary-primary-label text-[10px] uppercase tracking-[0.2em] text-[color:var(--nodu-accent)]">
                Odměna
              </div>
              <div className="nodu-mobile-timelog-summary-secondary-label mt-1 text-sm text-[color:var(--nodu-text-soft)]">
                Celkem hodin
              </div>
            </div>
            <div className="text-right">
              <div className="nodu-mobile-timelog-summary-primary-value text-2xl font-bold text-[color:var(--nodu-text)]">
                {formatCurrency(totalCompensation)}
              </div>
              <div className="nodu-mobile-timelog-summary-secondary-value mt-1 text-sm font-semibold text-[color:var(--nodu-text)]">
                {totalHours.toFixed(1)}h
              </div>
            </div>
          </div>

          {showCrewConfirmationChanges && (
            <div className="nodu-mobile-timelog-change-summary">
              <div className="nodu-mobile-timelog-change-summary-header">
                <span>Upraveno CH</span>
                <span>Čeká na tvoje potvrzení</span>
              </div>
              <div className="nodu-mobile-timelog-change-summary-list">
                {changeSummary.map((change) => (
                  <div key={change} className="nodu-mobile-timelog-change-summary-row">
                    {change}
                  </div>
                ))}
                {correctionNote && (
                  <div className="nodu-mobile-timelog-change-summary-row nodu-mobile-timelog-change-summary-row--note">
                    {correctionNote}
                  </div>
                )}
              </div>
            </div>
          )}

          {showReturnedNotice && (
            <div className="nodu-mobile-timelog-change-summary nodu-mobile-timelog-change-summary--returned">
              <div className="nodu-mobile-timelog-change-summary-header">
                <span>Vráceno k opravě</span>
                <span>Uprav výkaz a odešli ho znovu ke kontrole.</span>
              </div>
              {returnedNote && (
                <div className="nodu-mobile-timelog-change-summary-list">
                  <div className="nodu-mobile-timelog-change-summary-row">
                    {returnedNote}
                  </div>
                </div>
              )}
            </div>
          )}

          {readOnlyCopy ? (
            <TimelogReportSummary
              days={displayDays}
              totalHours={totalHours}
              totalCompensation={totalCompensation}
              km={draftKm}
              note={canSeeTimelogNote(role) ? draftNote : ''}
              mealAllowanceEnabled={mealAllowanceEnabled}
              mealAllowanceTotal={totalMealAllowance}
            />
          ) : (
            <>
              <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="text-[10px] uppercase tracking-[0.22em] text-[color:var(--nodu-text-soft)]">
                Dny
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 rounded-full px-3 text-[11px]"
                disabled={isReadOnly}
                onClick={openAddDayCalendar}
              >
                <Plus size={14} /> Přidat den
              </Button>
            </div>
            {isAddDayCalendarOpen && (
              <div
                role="dialog"
                aria-label="Výběr nového dne"
                className="nodu-mobile-timelog-add-day-picker"
              >
                <div className="nodu-mobile-timelog-add-day-picker-header">
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--nodu-text-soft)]">
                      Vyber den
                    </div>
                    <div className="mt-1 text-sm font-semibold text-[color:var(--nodu-text)]">
                      {addDayCandidateDate ? formatDateLabel(addDayCandidateDate) : 'Bez výběru'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label="Zrušit výběr dne"
                      className="nodu-mobile-timelog-add-day-icon"
                      onClick={() => setIsAddDayCalendarOpen(false)}
                    >
                      <X size={15} />
                    </button>
                    <button
                      type="button"
                      aria-label="Přidat vybraný den"
                      className="nodu-mobile-timelog-add-day-confirm"
                      onClick={confirmAddDayCandidate}
                    >
                      <Check size={16} />
                    </button>
                  </div>
                </div>
                <div className="nodu-mobile-timelog-add-day-month">
                  <button
                    type="button"
                    aria-label="Předchozí měsíc"
                    className="nodu-mobile-timelog-add-day-icon"
                    onClick={() => moveAddDayCalendarMonth(-1)}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <div className="text-sm font-semibold capitalize text-[color:var(--nodu-text)]">
                    {formatCalendarMonthLabel(addDayMonthDate)}
                  </div>
                  <button
                    type="button"
                    aria-label="Další měsíc"
                    className="nodu-mobile-timelog-add-day-icon"
                    onClick={() => moveAddDayCalendarMonth(1)}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
                <div className="nodu-mobile-timelog-add-day-weekdays" aria-hidden="true">
                  {calendarWeekdayLabels.map((day) => (
                    <span key={day}>{day}</span>
                  ))}
                </div>
                <div className="nodu-mobile-timelog-add-day-picker-grid">
                  {addDayPickerDates.map(({ date, isCurrentMonth }) => {
                    const isCandidate = date === addDayCandidateDate;
                    const isEventDate = isDateInEventRange(date, event);
                    const entryCount = editingTimelog.days.filter((day) => day.d === date).length;
                    const isReported = entryCount > 0;

                    return (
                      <button
                        key={date}
                        type="button"
                        aria-label={`Vybrat ${formatDateLabel(date)}`}
                        onClick={() => selectAddDayCandidate(date)}
                        className={[
                          'nodu-mobile-timelog-add-day-cell',
                          isCurrentMonth ? '' : 'nodu-mobile-timelog-add-day-cell--muted',
                          isEventDate ? 'nodu-mobile-timelog-add-day-cell--event' : '',
                          isReported ? 'nodu-mobile-timelog-add-day-cell--reported' : '',
                          isCandidate ? 'nodu-mobile-timelog-add-day-cell--selected' : '',
                        ].filter(Boolean).join(' ')}
                      >
                        <span>{Number(date.slice(-2))}</span>
                        {entryCount > 1 ? (
                          <span className="nodu-mobile-timelog-add-day-cell-count" aria-hidden="true">
                            {entryCount}
                          </span>
                        ) : (
                          (isReported || isEventDate) && (
                            <span className="nodu-mobile-timelog-add-day-cell-dot" aria-hidden="true" />
                          )
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="nodu-mobile-timelog-calendar">
              {calendarDates.map((date) => {
                const isEventDate = isDateInEventRange(date, event);
                const isSelected = date === selectedDate;
                const entryCount = editingTimelog.days.filter((day) => day.d === date).length;
                const isReported = entryCount > 0;

                return (
                  <button
                    key={date}
                    type="button"
                    aria-label={formatDateLabel(date)}
                    onClick={() => selectCalendarDate(date)}
                    className={[
                      'nodu-mobile-timelog-day',
                      isEventDate ? 'nodu-mobile-timelog-day--event' : 'nodu-mobile-timelog-day--outside',
                      isSelected ? 'nodu-mobile-timelog-day--selected' : '',
                      isReported ? 'nodu-mobile-timelog-day--reported' : '',
                    ].filter(Boolean).join(' ')}
                  >
                    <span className="nodu-mobile-timelog-day-number">{date.slice(-2)}</span>
                    <span className="nodu-mobile-timelog-day-month">{date.slice(5, 7)}</span>
                    {entryCount > 1 ? (
                      <span className="nodu-mobile-timelog-day-count" aria-hidden="true">{entryCount}</span>
                    ) : (
                      isReported && <span className="nodu-mobile-timelog-day-dot" aria-hidden="true" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="nodu-mobile-timelog-day-editor" role="group" aria-label="Záznam dne">
            <div className="nodu-mobile-timelog-day-editor-header flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--nodu-text-soft)]">
                  Den
                </div>
                <div className="mt-1 text-lg font-semibold text-[color:var(--nodu-text)]">
                  {formatDateLabel(selectedDate)}
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 shrink-0 rounded-full px-3 text-[11px]"
                onClick={addRecordForSelectedDate}
                disabled={isReadOnly}
              >
                <Plus size={14} /> Přidat Záznam
              </Button>
            </div>
            {selectedDateEntries.length > 0 && (
              <div className="nodu-mobile-timelog-entry-list" aria-label="Záznamy ve dni">
                {selectedDateEntries.map((entry, index) => {
                  const isActive = entry.entryKey === currentEntryKey;
                  const displayDay = isActive ? draftDay : entry.day;
                  const selectedMeals = normalizeMealSelection(displayDay);
                  const isOvernight = isOvernightTimeRange(displayDay.f, displayDay.t);

                  return (
                    <button
                      key={entry.entryKey}
                      type="button"
                      aria-label={`Upravit záznam ${index + 1}`}
                      onClick={() => selectExistingEntry(entry)}
                      className={[
                        'nodu-mobile-timelog-entry-card',
                        isActive ? 'nodu-mobile-timelog-entry-card--active' : '',
                      ].filter(Boolean).join(' ')}
                    >
                      <span className="nodu-mobile-timelog-entry-content">
                        <span className="nodu-mobile-timelog-entry-heading">
                          <span className="nodu-mobile-timelog-entry-title">Záznam {index + 1}</span>
                          {isOvernight && (
                            <span className="nodu-mobile-timelog-overnight-chip">přes půlnoc</span>
                          )}
                        </span>
                        <span className="nodu-mobile-timelog-entry-meta">
                          <span>{displayDay.f} - {displayDay.t}</span>
                          <span className="nodu-mobile-timelog-entry-hours">
                            {calculateDayHours(displayDay.f, displayDay.t).toFixed(1)}h
                          </span>
                        </span>
                      </span>
                      <span className="nodu-mobile-timelog-entry-badges">
                        <span className="nodu-mobile-timelog-entry-phase">
                          {phaseOptions.find((option) => option.value === displayDay.type)?.label ?? displayDay.type}
                        </span>
                        {mealAllowanceEnabled && selectedMeals.length > 0 && (
                          <span className="nodu-mobile-timelog-entry-meal">
                            {formatMealLabels(selectedMeals)}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            <div className="mt-4 grid grid-cols-2 gap-3">
              <TimeField
                label="Od"
                value={draftDay.f}
                isActive={activeTimePicker === 'from'}
                disabled={isReadOnly}
                onActivate={() => setActiveTimePicker((currentPicker) => (
                  currentPicker === 'from' ? null : 'from'
                ))}
              />
              <TimeField
                label="Do"
                value={draftDay.t}
                isActive={activeTimePicker === 'to'}
                disabled={isReadOnly}
                onActivate={() => setActiveTimePicker((currentPicker) => (
                  currentPicker === 'to' ? null : 'to'
                ))}
              />
            </div>
            {activeTimePicker && (
              <TimeWheelPicker
                key={`${selectedDate}:${activeEntryKey}:${activeTimePicker}`}
                label={activeTimePicker === 'from' ? 'Od' : 'Do'}
                value={activeTimePicker === 'from' ? draftDay.f : draftDay.t}
                onConfirm={() => setActiveTimePicker(null)}
                onChange={(nextTime) => updateDraftDay(
                  activeTimePicker === 'from'
                    ? { ...draftDay, f: nextTime }
                    : { ...draftDay, t: nextTime },
                )}
              />
            )}

            <div
              className="mt-3"
              role="group"
              aria-label="Fáze"
            >
              <div className="mb-1 text-[10px] uppercase tracking-[0.2em] text-[color:var(--nodu-text-soft)]">Fáze</div>
              <div className="nodu-mobile-timelog-phase-picker">
                {phaseOptions.map((option) => {
                  const isSelected = draftDay.type === option.value;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={isSelected}
                      disabled={isReadOnly}
                      className={`nodu-mobile-timelog-phase-option ${isSelected ? 'nodu-mobile-timelog-phase-option--active' : ''}`}
                      onClick={() => {
                        const meals = normalizeMealSelection(draftDay);

                        updateDraftDay({
                          ...draftDay,
                          type: option.value,
                          meals,
                          meal: meals[0] ?? null,
                          note: draftDay.note ?? '',
                        });
                      }}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {mealAllowanceEnabled && (
              <div
                className="mt-3"
                role="group"
                aria-label="Jídlo"
              >
                <div className="mb-1 text-[10px] uppercase tracking-[0.2em] text-[color:var(--nodu-text-soft)]">Jídlo</div>
                <div className="nodu-mobile-timelog-meal-picker">
                  {mealOptions.map((option) => {
                    const selectedMeals = normalizeMealSelection(draftDay);
                    const isSelected = selectedMeals.includes(option.value);
                    const nextMeals = isSelected
                      ? selectedMeals.filter((meal) => meal !== option.value)
                      : [...selectedMeals, option.value];

                    return (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={isSelected}
                        disabled={isReadOnly}
                        className={`nodu-mobile-timelog-meal-option ${isSelected ? 'nodu-mobile-timelog-meal-option--active' : ''}`}
                        onClick={() => updateDraftDay({
                          ...draftDay,
                          meals: nextMeals,
                          meal: nextMeals[0] ?? null,
                        })}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <label className="mt-3 block space-y-1 text-[10px] uppercase tracking-[0.2em] text-[color:var(--nodu-text-soft)]">
              <span>Poznámka k záznamu</span>
              <Textarea aria-label="Poznámka k záznamu" value={draftDay.note ?? ''} disabled={isReadOnly}
                onChange={(e) => updateDraftDay({ ...draftDay, note: e.target.value })} />
            </label>
            {selectedEntryExists && (
              <Button type="button" variant="outline" className="mt-4 w-full" onClick={deleteSelectedDay} disabled={isReadOnly}>
                <Trash2 size={16} /> Odebrat Záznam {selectedEntryNumber}
              </Button>
            )}
          </div>

              <div className="nodu-mobile-timelog-report-editor" role="group" aria-label="Výkaz celkem">
            <label className="block space-y-1 text-[10px] uppercase tracking-[0.2em] text-[color:var(--nodu-text-soft)]">
              <span>Cestovné celkem (km)</span>
              <Input
                type="number"
                value={draftKm}
                disabled={isReadOnly}
                onChange={(e) => {
                  const nextKm = Number(e.target.value);

                  emit({ ...editingTimelog, km: nextKm });
                }}
              />
            </label>
            {isCrewHeadCorrection && (
              <div className="nodu-mobile-timelog-note-panel" aria-label="Poznámka Crew">
                <span>Poznámka Crew</span>
                <p>{draftNote.trim() || 'Crew nepřidala poznámku.'}</p>
              </div>
            )}

            <label className="mt-3 block space-y-1 text-[10px] uppercase tracking-[0.2em] text-[color:var(--nodu-text-soft)]">
              <span>{isCrewHeadCorrection ? 'Poznámka pro Crew' : 'Poznámka k výkazu'}</span>
              <Textarea
                aria-label={isCrewHeadCorrection ? 'Poznámka pro Crew' : 'Poznámka k výkazu'}
                value={isCrewHeadCorrection ? draftReviewNote : draftNote}
                disabled={isReadOnly}
                onChange={(e) => {
                  if (isCrewHeadCorrection) {
                    emit({ ...editingTimelog, reviewNote: e.target.value });
                    return;
                  }

                  emit({ ...editingTimelog, note: e.target.value });
                }}
                className="min-h-[76px] resize-none"
                placeholder={isCrewHeadCorrection ? 'Doplňte komentář k úpravě pro člena Crew...' : 'Volitelná poznámka...'}
              />
            </label>

              </div>
            </>
          )}
        </div>

    </fieldset>
  );
};

/** A controlled field section: persistence and modal ownership belong to its caller. */
export default function TimelogEvidenceSection(props: TimelogEvidenceSectionProps) {
  const identity = JSON.stringify([props.editorSessionKey, props.timelog.supabaseId ?? props.timelog.id, props.event.supabaseId ?? props.event.id]);
  return <EvidenceSectionFields key={identity} {...props} />;
}
