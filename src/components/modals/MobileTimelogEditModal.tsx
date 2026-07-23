import React from 'react';
import { Check, ChevronLeft, ChevronRight, Plus, Save, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAppContext } from '../../context/useAppContext';
import { KM_RATE } from '../../data';
import { calculateDayHours, calculateTotalHours, formatCurrency, isOvernightTimeRange } from '../../utils';
import { getTimelogDependencies, saveTimelog } from '../../features/timelogs/services/timelogs.service';
import {
  buildTimelogCalendarDates,
  createTimelogDayEntryId,
  getTimelogDayEntryKey,
  isDateInEventRange,
  removeTimelogDayEntry,
  resolveTimelogDayDefaults,
  upsertTimelogDay,
} from '../../features/timelogs/services/timelog-day-ui';
import type { Event, Timelog, TimelogDay, TimelogType } from '../../types';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';

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
  note: day.note ?? '',
});

const getDayValueSignature = (date: string, day: TimelogDay): string => (
  [
    date,
    day.f,
    day.t,
    day.type,
    day.note?.trim() ?? '',
  ].join('|')
);

const getTimelogDraftSignature = (timelog: Timelog): string => JSON.stringify({
  days: timelog.days.map((day) => ({
    id: day.id ?? null,
    d: day.d,
    f: day.f,
    t: day.t,
    type: day.type,
    note: day.note ?? '',
  })),
  km: timelog.km,
  note: timelog.note,
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
  id: createTimelogDayEntryId(),
});

const getSelectedDayDraft = (
  date: string | null,
  days: TimelogDay[],
  event: Event | null,
): TimelogDay | null => {
  if (!date || !event) return null;

  return getTimelogDayEntriesForDate(date, days)[0]?.day ?? createDraftDay(date, event);
};

const getEventDefaultsSignature = (event: Event | null): string => {
  if (!event) return '';

  return JSON.stringify({
    id: event.id,
    startDate: event.startDate,
    endDate: event.endDate,
    startTime: event.startTime,
    endTime: event.endTime,
    showDayTypes: event.showDayTypes,
    dayTypes: event.dayTypes ?? null,
    phaseTimes: event.phaseTimes ?? null,
    phaseSchedules: event.phaseSchedules ?? null,
  });
};

const phaseOptions: Array<{ value: TimelogType; label: string }> = [
  { value: 'instal', label: 'Instal' },
  { value: 'provoz', label: 'Provoz' },
  { value: 'deinstal', label: 'Deinstal' },
];

type AutosaveState = 'idle' | 'pending' | 'saved' | 'error';

const timeOptionHeight = 40;
const autosaveDelayMs = 800;
const hourOptions = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, '0'));
const minuteOptions = ['00', '15', '30', '45'];

type ActiveTimePicker = 'from' | 'to';

const splitTimeValue = (value: string): { hour: string; minute: string } => {
  const [rawHour = '00', rawMinute = '00'] = value.split(':');
  const hour = hourOptions.includes(rawHour) ? rawHour : '00';
  const minute = minuteOptions.includes(rawMinute) ? rawMinute : '00';

  return { hour, minute };
};

type TimeFieldProps = {
  label: string;
  value: string;
  isActive: boolean;
  onActivate: () => void;
};

const TimeField: React.FC<TimeFieldProps> = ({
  label,
  value,
  isActive,
  onActivate,
}) => (
  <div
    className={[
      'nodu-mobile-timelog-time-picker',
      isActive ? 'nodu-mobile-timelog-time-picker--active' : '',
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
      onClick={onActivate}
    >
      <span>{value}</span>
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
        onClick={onConfirm}
      >
        <Check size={16} aria-hidden="true" />
      </button>
      {renderColumn('hour', hourOptions, hour, hourColumnRef)}
      {renderColumn('minute', minuteOptions, minute, minuteColumnRef)}
    </div>
  );
};

const MobileTimelogEditModal: React.FC = () => {
  const {
    editingTimelog,
    setEditingTimelog,
    setCurrentTab,
    setSelectedContractorProfileId,
  } = useAppContext();
  const { contractors, events } = getTimelogDependencies();
  const contractor = editingTimelog
    ? contractors.find((item) => item.profileId === editingTimelog.contractorProfileId) ?? null
    : null;
  const event = editingTimelog ? events.find((item) => item.id === editingTimelog.eid) ?? null : null;
  const initialDate = editingTimelog?.days[0]?.d ?? event?.startDate ?? null;
  const initialEntry = editingTimelog
    ? getTimelogDayEntriesForDate(initialDate, editingTimelog.days)[0] ?? null
    : null;
  const [selectedDate, setSelectedDate] = React.useState<string | null>(initialDate);
  const [activeEntryKey, setActiveEntryKey] = React.useState<string | null>(initialEntry?.entryKey ?? null);
  const [draftDay, setDraftDay] = React.useState<TimelogDay | null>(() => (
    editingTimelog ? getSelectedDayDraft(initialDate, editingTimelog.days, event) : null
  ));
  const [addedCalendarDates, setAddedCalendarDates] = React.useState<string[]>([]);
  const [isAddDayCalendarOpen, setIsAddDayCalendarOpen] = React.useState(false);
  const [addDayCandidateDate, setAddDayCandidateDate] = React.useState(initialDate ?? event?.startDate ?? '');
  const [addDayMonthDate, setAddDayMonthDate] = React.useState(initialDate ?? event?.startDate ?? '');
  const [draftKm, setDraftKm] = React.useState(editingTimelog?.km ?? 0);
  const [draftNote, setDraftNote] = React.useState(editingTimelog?.note ?? '');
  const [activeTimePicker, setActiveTimePicker] = React.useState<ActiveTimePicker | null>(null);
  const [autosaveState, setAutosaveState] = React.useState<AutosaveState>('idle');
  const autosaveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosaveRequestRef = React.useRef(0);
  const lastAutosavedSignatureRef = React.useRef<string | null>(null);
  const calendarDates = React.useMemo(() => (
    editingTimelog && event
      ? buildTimelogCalendarDates(event, [
        ...editingTimelog.days,
        ...addedCalendarDates.map((date): TimelogDay => resolveTimelogDayDefaults(date, event)),
      ])
      : []
  ), [addedCalendarDates, editingTimelog, event]);
  const calendarDateSignature = calendarDates.join('|');
  const eventDefaultsSignature = getEventDefaultsSignature(event);
  const selectedDateEntries = React.useMemo(() => (
    editingTimelog ? getTimelogDayEntriesForDate(selectedDate, editingTimelog.days) : []
  ), [editingTimelog, selectedDate]);
  const addDayPickerDates = React.useMemo(() => (
    buildAddDayCalendarDates(addDayMonthDate || event?.startDate || selectedDate || '1970-01-01')
  ), [addDayMonthDate, event?.startDate, selectedDate]);

  React.useEffect(() => {
    if (!editingTimelog || !event) {
      setSelectedDate(null);
      setActiveEntryKey(null);
      setDraftDay(null);
      return;
    }

    const nextDate = selectedDate && calendarDates.includes(selectedDate)
      ? selectedDate
      : editingTimelog.days[0]?.d ?? event.startDate;
    const nextEntries = getTimelogDayEntriesForDate(nextDate, editingTimelog.days);
    const activeEntry = activeEntryKey
      ? nextEntries.find((entry) => entry.entryKey === activeEntryKey) ?? null
      : null;
    const nextEntry = activeEntry ?? (!activeEntryKey ? nextEntries[0] ?? null : null);

    if (nextDate !== selectedDate) {
      setSelectedDate(nextDate);
      setActiveEntryKey(nextEntry?.entryKey ?? null);
      setDraftDay(nextEntry?.day ?? createDraftDay(nextDate, event));
      return;
    }

    if (nextEntry) {
      setActiveEntryKey(nextEntry.entryKey);
      setDraftDay(nextEntry.day);
      return;
    }

    const nextDraft = createDraftDay(nextDate, event);
    setActiveEntryKey(nextDraft.id ?? null);
    setDraftDay((currentDay) => (
      currentDay?.d === nextDate ? currentDay : nextDraft
    ));
  }, [calendarDateSignature, editingTimelog, eventDefaultsSignature, selectedDate]);

  React.useEffect(() => {
    setDraftKm(editingTimelog?.km ?? 0);
    setDraftNote(editingTimelog?.note ?? '');
  }, [editingTimelog?.id]);

  React.useEffect(() => () => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }
  }, []);

  if (!editingTimelog || !contractor || !event || !selectedDate || !draftDay) return null;

  const currentEntryKey = activeEntryKey ?? draftDay.id ?? null;
  const selectedEntryIndex = currentEntryKey
    ? selectedDateEntries.findIndex((entry) => entry.entryKey === currentEntryKey)
    : -1;
  const selectedEntryExists = selectedEntryIndex >= 0;
  const selectedEntryNumber = selectedEntryExists ? selectedEntryIndex + 1 : null;
  const isNewRecordDraft = !selectedEntryExists && selectedDateEntries.length > 0;
  const isUnsavedAddedDay = addedCalendarDates.includes(selectedDate) && selectedDateEntries.length === 0;
  const baselineSelectedDay = selectedEntryExists
    ? normalizeDay(selectedDateEntries[selectedEntryIndex].day)
    : normalizeDay(resolveTimelogDayDefaults(selectedDate, event));
  const committedDraftDay = {
    ...draftDay,
    note: draftDay.note?.trim() || '',
  };
  const hasDraftChanges = (
    isUnsavedAddedDay
    || isNewRecordDraft
    || getDayValueSignature(selectedDate, committedDraftDay) !== getDayValueSignature(selectedDate, baselineSelectedDay)
  );
  const hasReportChanges = draftKm !== editingTimelog.km || draftNote !== editingTimelog.note;
  const displayDays = hasDraftChanges
    ? upsertTimelogDay(editingTimelog.days, committedDraftDay, currentEntryKey ?? undefined)
    : editingTimelog.days;
  const totalHours = calculateTotalHours(displayDays);

  const openContractorDetail = () => {
    if (!contractor.profileId) return;
    setEditingTimelog(null);
    setSelectedContractorProfileId(contractor.profileId);
    setCurrentTab('crew');
  };

  const buildTimelogWithCurrentDraft = () => {
    if (!hasDraftChanges && !hasReportChanges) {
      return editingTimelog;
    }

    return {
      ...editingTimelog,
      days: displayDays,
      km: draftKm,
      note: draftNote,
    };
  };

  const buildTimelogWithDraftValues = ({
    day = committedDraftDay,
    km = draftKm,
    note = draftNote,
    days,
  }: {
    day?: TimelogDay;
    km?: number;
    note?: string;
    days?: Timelog['days'];
  } = {}): Timelog => ({
    ...editingTimelog,
    days: days ?? upsertTimelogDay(editingTimelog.days, day, currentEntryKey ?? undefined),
    km,
    note,
  });

  const clearAutosaveTimer = () => {
    if (!autosaveTimerRef.current) return;

    clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = null;
  };

  const scheduleAutosave = (nextTimelog: Timelog) => {
    if (nextTimelog.status !== 'draft') {
      return;
    }

    const nextSignature = getTimelogDraftSignature(nextTimelog);

    if (lastAutosavedSignatureRef.current === nextSignature) {
      setAutosaveState('saved');
      return;
    }

    clearAutosaveTimer();
    setAutosaveState('pending');

    autosaveTimerRef.current = setTimeout(() => {
      const requestId = autosaveRequestRef.current + 1;
      autosaveRequestRef.current = requestId;
      autosaveTimerRef.current = null;

      void saveTimelog(nextTimelog)
        .then(() => {
          if (autosaveRequestRef.current !== requestId) return;
          lastAutosavedSignatureRef.current = nextSignature;
          setAutosaveState('saved');
        })
        .catch(() => {
          if (autosaveRequestRef.current !== requestId) return;
          setAutosaveState('error');
        });
    }, autosaveDelayMs);
  };

  const stageCurrentDraft = () => {
    const nextTimelog = buildTimelogWithCurrentDraft();

    if (nextTimelog !== editingTimelog) {
      setEditingTimelog(nextTimelog);
      setAddedCalendarDates((dates) => dates.filter((date) => date !== selectedDate));
    }

    return nextTimelog;
  };

  const selectCalendarDate = (date: string) => {
    const stagedTimelog = stageCurrentDraft();
    const entries = getTimelogDayEntriesForDate(date, stagedTimelog.days);
    const nextEntry = entries[0] ?? null;
    const nextDraft = nextEntry?.day ?? createDraftDay(date, event);

    setSelectedDate(date);
    setActiveEntryKey(nextEntry?.entryKey ?? nextDraft.id ?? null);
    setDraftDay(nextDraft);
    setActiveTimePicker(null);
    setIsAddDayCalendarOpen(false);
  };

  const selectExistingEntry = (entry: TimelogDayEntry) => {
    stageCurrentDraft();
    setActiveEntryKey(entry.entryKey);
    setDraftDay(entry.day);
    setActiveTimePicker(null);
    setIsAddDayCalendarOpen(false);
  };

  const addRecordForSelectedDate = () => {
    const stagedTimelog = stageCurrentDraft();
    const nextDraft = createDraftDay(selectedDate, event, draftDay.type);
    const nextTimelog = {
      ...stagedTimelog,
      days: upsertTimelogDay(stagedTimelog.days, nextDraft, nextDraft.id),
    };

    setEditingTimelog(nextTimelog);
    scheduleAutosave(nextTimelog);
    setActiveEntryKey(nextDraft.id ?? null);
    setDraftDay(nextDraft);
    setActiveTimePicker(null);
  };

  const updateDraftDay = (nextDay: TimelogDay) => {
    setDraftDay(nextDay);
    scheduleAutosave(buildTimelogWithDraftValues({ day: nextDay }));
  };

  const deleteSelectedDay = () => {
    const remainingDays = selectedEntryExists && currentEntryKey
      ? removeTimelogDayEntry(editingTimelog.days, currentEntryKey)
      : editingTimelog.days;
    const remainingEntriesForSelectedDate = getTimelogDayEntriesForDate(selectedDate, remainingDays);
    const shouldKeepSelectedDate = isDateInEventRange(selectedDate, event) || remainingEntriesForSelectedDate.length > 0;
    const fallbackDate = shouldKeepSelectedDate
      ? selectedDate
      : calendarDates.find((date) => date !== selectedDate) ?? event.startDate;
    const nextEntry = fallbackDate === selectedDate && remainingEntriesForSelectedDate.length > 0
      ? remainingEntriesForSelectedDate[Math.max(0, Math.min(selectedEntryIndex - 1, remainingEntriesForSelectedDate.length - 1))]
      : getTimelogDayEntriesForDate(fallbackDate, remainingDays)[0] ?? null;
    const nextDraft = nextEntry?.day ?? createDraftDay(fallbackDate, event);

    const nextTimelog = {
      ...editingTimelog,
      days: remainingDays,
      km: draftKm,
      note: draftNote,
    };

    setEditingTimelog(nextTimelog);
    scheduleAutosave(nextTimelog);
    setAddedCalendarDates((dates) => dates.filter((date) => date !== selectedDate));
    setSelectedDate(fallbackDate);
    setActiveEntryKey(nextEntry?.entryKey ?? nextDraft.id ?? null);
    setDraftDay(nextDraft);
  };

  const addCalendarDay = (date: string) => {
    if (!date) return;

    stageCurrentDraft();
    setAddedCalendarDates((dates) => (
      dates.includes(date) ? dates : [...dates, date]
    ));
    const nextDraft = createDraftDay(date, event);

    setSelectedDate(date);
    setActiveEntryKey(nextDraft.id ?? null);
    setDraftDay(nextDraft);
    setIsAddDayCalendarOpen(false);
  };

  const openAddDayCalendar = () => {
    const nextDate = selectedDate ?? event.startDate;

    setActiveTimePicker(null);
    setAddDayCandidateDate(nextDate);
    setAddDayMonthDate(nextDate);
    setIsAddDayCalendarOpen(true);
  };

  const selectAddDayCandidate = (date: string) => {
    setAddDayCandidateDate(date);
  };

  const confirmAddDayCandidate = () => {
    if (!addDayCandidateDate) return;

    if (calendarDates.includes(addDayCandidateDate)) {
      selectCalendarDate(addDayCandidateDate);
      return;
    }

    addCalendarDay(addDayCandidateDate);
  };

  const moveAddDayCalendarMonth = (offset: number) => {
    const nextMonthDate = shiftCalendarMonth(addDayMonthDate || event.startDate, offset);

    setAddDayMonthDate(nextMonthDate);
    setAddDayCandidateDate(nextMonthDate);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-[color:var(--nodu-paper)]">
      <section className="nodu-mobile-timelog-modal" aria-labelledby="mobile-timelog-title">
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
                className="av h-11 w-11 shrink-0 text-sm font-bold shadow-sm"
                style={{ backgroundColor: contractor.bg, color: contractor.fg }}
                aria-label={`Otevřít detail člena crew ${contractor.name}`}
              >
                {contractor.ii}
              </button>
            )}
            <button
              type="button"
              onClick={() => setEditingTimelog(null)}
              className="nodu-mobile-timelog-icon-button"
              aria-label="Zavřít"
            >
              <X size={20} />
            </button>
          </div>
        </header>

        <div className="nodu-mobile-timelog-body">
          <div className="nodu-mobile-timelog-summary">
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--nodu-accent)]">
                Celkem hodin
              </div>
              <div className="mt-1 text-sm text-[color:var(--nodu-text-soft)]">Odměna</div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-[color:var(--nodu-text)]">{totalHours.toFixed(1)}h</div>
              <div className="mt-1 text-sm font-semibold text-[color:var(--nodu-text)]">
                {formatCurrency(totalHours * contractor.rate + draftKm * KM_RATE)}
              </div>
            </div>
          </div>

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
              >
                <Plus size={14} /> Přidat Záznam
              </Button>
            </div>
            {selectedDateEntries.length > 0 && (
              <div className="nodu-mobile-timelog-entry-list" aria-label="Záznamy ve dni">
                {selectedDateEntries.map((entry, index) => {
                  const isActive = entry.entryKey === currentEntryKey;
                  const displayDay = isActive ? draftDay : entry.day;
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
                      <span className="nodu-mobile-timelog-entry-phase">
                        {phaseOptions.find((option) => option.value === displayDay.type)?.label ?? displayDay.type}
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
                onActivate={() => setActiveTimePicker((currentPicker) => (
                  currentPicker === 'from' ? null : 'from'
                ))}
              />
              <TimeField
                label="Do"
                value={draftDay.t}
                isActive={activeTimePicker === 'to'}
                onActivate={() => setActiveTimePicker((currentPicker) => (
                  currentPicker === 'to' ? null : 'to'
                ))}
              />
            </div>
            {activeTimePicker && (
              <TimeWheelPicker
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

            <label className="mt-3 block space-y-1 text-[10px] uppercase tracking-[0.2em] text-[color:var(--nodu-text-soft)]">
              <span>Fáze</span>
              <select
                aria-label="Fáze"
                value={draftDay.type}
                onChange={(e) => {
                  const nextDefaults = resolveTimelogDayDefaults(selectedDate, event, e.target.value as TimelogType);

                  updateDraftDay({
                    ...nextDefaults,
                    id: draftDay.id,
                    note: draftDay.note ?? '',
                  });
                }}
                className="nodu-mobile-timelog-select"
              >
                {phaseOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            {selectedEntryExists && (
              <Button type="button" variant="outline" className="mt-4 w-full" onClick={deleteSelectedDay}>
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
                onChange={(e) => {
                  const nextKm = Number(e.target.value);

                  setDraftKm(nextKm);
                  scheduleAutosave(buildTimelogWithDraftValues({ km: nextKm }));
                }}
              />
            </label>
            <label className="mt-3 block space-y-1 text-[10px] uppercase tracking-[0.2em] text-[color:var(--nodu-text-soft)]">
              <span>Poznámka k výkazu</span>
              <Textarea
                aria-label="Poznámka k výkazu"
                value={draftNote}
                onChange={(e) => {
                  setDraftNote(e.target.value);
                  scheduleAutosave(buildTimelogWithDraftValues({ note: e.target.value }));
                }}
                className="min-h-[76px] resize-none"
                placeholder="Volitelná poznámka..."
              />
            </label>

            {editingTimelog.status === 'draft' && autosaveState !== 'idle' && (
              <div className="nodu-mobile-timelog-day-feedback" aria-live="polite">
                {autosaveState === 'pending' && 'Ukládám návrh...'}
                {autosaveState === 'saved' && 'Uloženo v návrhu'}
                {autosaveState === 'error' && 'Návrh se nepodařilo uložit'}
              </div>
            )}
          </div>
        </div>

        <footer className="nodu-mobile-timelog-footer">
          <Button
            type="button"
            onClick={async () => {
              try {
                clearAutosaveTimer();
                const timelogToSave = buildTimelogWithCurrentDraft();
                await saveTimelog(timelogToSave);
                setEditingTimelog(null);
              } catch (error) {
                toast.error(error instanceof Error ? error.message : 'Nepodařilo se uložit výkaz.');
              }
            }}
          >
            <Save size={16} /> Uložit výkaz
          </Button>
        </footer>
      </section>
    </div>
  );
};

export default MobileTimelogEditModal;
