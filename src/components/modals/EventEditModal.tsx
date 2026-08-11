import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Plus, Trash2, X } from 'lucide-react';
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
import EventAddressField from '../../features/events/components/EventAddressField';
import EventLocationPickerModal from '../../features/events/components/EventLocationPickerModal';
import EventMapPreview from '../../features/events/components/EventMapPreview';

interface EventEditModalProps {
  editingEvent: Event | null;
  onClose: () => void;
  onChange: (event: Event | null) => void;
}

const PHASES = [
  { id: 'PR', type: 'pripravy' as const, color: 'bg-slate-500 border-slate-600', label: 'Přípravy' },
  { id: 'I', type: 'instal' as const, color: 'bg-blue-500 border-blue-600', label: 'Instalace' },
  { id: 'P', type: 'provoz' as const, color: 'bg-emerald-500 border-emerald-600', label: 'Provoz' },
  { id: 'D', type: 'deinstal' as const, color: 'bg-orange-500 border-orange-600', label: 'Deinstalace' },
];

const fieldLabelClass = 'mb-1 block text-[10px] uppercase tracking-[0.22em] text-[color:var(--nodu-text-soft)]';
const nativeFieldClass = 'w-full rounded-xl border border-[color:var(--nodu-border)] bg-white px-3 py-2 text-sm text-[color:var(--nodu-text)] outline-none transition-all focus:border-[color:var(--nodu-accent)] focus:ring-2 focus:ring-[color:rgb(var(--nodu-accent-rgb)/0.14)]';
const smallFieldLabelClass = 'mb-1 block text-[9px] uppercase text-[color:var(--nodu-text-soft)]';
const smallNativeFieldClass = 'w-full rounded-lg border border-[color:var(--nodu-border)] bg-white px-2 py-1 text-[10px] text-[color:var(--nodu-text)] outline-none focus:border-[color:var(--nodu-accent)] focus:ring-2 focus:ring-[color:rgb(var(--nodu-accent-rgb)/0.12)]';
const dateTimeOptionHeight = 40;
const dateTimeHourOptions = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, '0'));
const dateTimeMinuteOptions = ['00', '15', '30', '45'];

const createSlotId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

type ActiveDateTimePicker = 'start' | 'end';

type DateTimeDraft = {
  date: string;
  time: string;
};

const parseDateKey = (value: string): Date => {
  const [year = '1970', month = '1', day = '1'] = value.split('-');
  return new Date(Number(year), Number(month) - 1, Number(day));
};

const toDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const isValidDateKey = (value?: string | null): value is string => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const date = parseDateKey(value);
  return date.getFullYear() >= 1900 && toDateKey(date) === value;
};

const getTodayDateKey = (): string => toDateKey(new Date());

const resolveDateKey = (value?: string | null, fallback = getTodayDateKey()): string => (
  isValidDateKey(value) ? value : fallback
);

const normalizeEventDateDefaults = (event: Event): Event => {
  const startDate = resolveDateKey(event.startDate);
  const endDate = resolveDateKey(event.endDate, startDate);

  if (startDate === event.startDate && endDate === event.endDate) return event;

  return {
    ...event,
    startDate,
    endDate,
  };
};

const addDays = (value: string, days: number): string => {
  const date = parseDateKey(resolveDateKey(value));
  date.setDate(date.getDate() + days);
  return toDateKey(date);
};

const formatDateLabel = (value: string): string => {
  const [year = '', month = '', day = ''] = resolveDateKey(value).split('-');
  return `${Number(day)}. ${Number(month)}. ${year}`;
};

const formatDateTimeLabel = (date: string, time: string): string => (
  `${formatDateLabel(date)} · ${time}`
);

const splitTimeValue = (value: string): { hour: string; minute: string } => {
  const [rawHour = '00', rawMinute = '00'] = value.split(':');
  const hour = dateTimeHourOptions.includes(rawHour) ? rawHour : '00';
  const minute = dateTimeMinuteOptions.includes(rawMinute) ? rawMinute : '00';

  return { hour, minute };
};

const compareDateTime = (
  leftDate: string,
  leftTime: string,
  rightDate: string,
  rightTime: string,
): number => `${leftDate}T${leftTime}`.localeCompare(`${rightDate}T${rightTime}`);

const createDateOptions = (selectedDate: string): string[] => (
  Array.from({ length: 31 }, (_, index) => addDays(resolveDateKey(selectedDate), index - 15))
);

type DateTimeFieldProps = {
  label: string;
  date: string;
  time: string;
  isActive: boolean;
  onActivate: () => void;
};

const DateTimeField: React.FC<DateTimeFieldProps> = ({
  label,
  date,
  time,
  isActive,
  onActivate,
}) => {
  const displayValue = formatDateTimeLabel(date, time);

  return (
    <button
      type="button"
      aria-label={`Otevřít výběr termínu ${label} ${displayValue}`}
      aria-expanded={isActive}
      className={[
        'nodu-event-edit-datetime-trigger',
        isActive ? 'nodu-event-edit-datetime-trigger--active' : '',
      ].filter(Boolean).join(' ')}
      onClick={onActivate}
    >
      <span className="nodu-event-edit-datetime-label">{label}</span>
      <span className="nodu-event-edit-datetime-value">{displayValue}</span>
    </button>
  );
};

type DateTimeWheelPickerProps = {
  label: string;
  value: DateTimeDraft;
  onChange: (value: DateTimeDraft) => void;
  onConfirm: () => void;
};

const DateTimeWheelPicker: React.FC<DateTimeWheelPickerProps> = ({
  label,
  value,
  onChange,
  onConfirm,
}) => {
  const dateColumnRef = React.useRef<HTMLDivElement | null>(null);
  const hourColumnRef = React.useRef<HTMLDivElement | null>(null);
  const minuteColumnRef = React.useRef<HTMLDivElement | null>(null);
  const initialDateRef = React.useRef(value.date);
  const isProgrammaticScrollRef = React.useRef(false);
  const isUserScrollRef = React.useRef(false);
  const scrollTimersRef = React.useRef<Partial<Record<'date' | 'hour' | 'minute', number>>>({});
  const dateOptions = React.useMemo(() => createDateOptions(initialDateRef.current), []);
  const { hour, minute } = splitTimeValue(value.time);

  const alignColumn = (
    columnRef: React.RefObject<HTMLDivElement | null>,
    options: string[],
    selectedValue: string,
    behavior: ScrollBehavior = 'auto',
  ) => {
    const column = columnRef.current;
    const selectedIndex = options.indexOf(selectedValue);

    if (!column || selectedIndex < 0) return;

    const top = selectedIndex * dateTimeOptionHeight;

    if (behavior === 'smooth' && typeof column.scrollTo === 'function') {
      column.scrollTo({ top, behavior });
      return;
    }

    column.scrollTop = top;
  };

  React.useEffect(() => {
    if (isUserScrollRef.current) return;

    isProgrammaticScrollRef.current = true;

    alignColumn(dateColumnRef, dateOptions, value.date);
    alignColumn(hourColumnRef, dateTimeHourOptions, hour);
    alignColumn(minuteColumnRef, dateTimeMinuteOptions, minute);

    const releaseProgrammaticScroll = window.setTimeout(() => {
      isProgrammaticScrollRef.current = false;
    }, 80);

    return () => window.clearTimeout(releaseProgrammaticScroll);
  }, [dateOptions, hour, minute, value.date]);

  React.useEffect(() => () => {
    Object.values(scrollTimersRef.current).forEach((timer) => {
      if (timer) window.clearTimeout(timer);
    });
  }, []);

  const updateTime = (nextHour: string, nextMinute: string) => {
    onChange({
      ...value,
      time: `${nextHour}:${nextMinute}`,
    });
  };

  const scheduleColumnSnap = (
    part: 'date' | 'hour' | 'minute',
    column: HTMLDivElement,
    selectedIndex: number,
  ) => {
    const currentTimer = scrollTimersRef.current[part];

    if (currentTimer) {
      window.clearTimeout(currentTimer);
    }

    scrollTimersRef.current[part] = window.setTimeout(() => {
      isProgrammaticScrollRef.current = true;

      const top = selectedIndex * dateTimeOptionHeight;

      if (Math.abs(column.scrollTop - top) > 1) {
        if (typeof column.scrollTo === 'function') {
          column.scrollTo({ top, behavior: 'smooth' });
        } else {
          column.scrollTop = top;
        }
      }

      window.setTimeout(() => {
        isProgrammaticScrollRef.current = false;
        isUserScrollRef.current = false;
      }, 180);
    }, 120);
  };

  const handleColumnScroll = (
    part: 'date' | 'hour' | 'minute',
    event: React.UIEvent<HTMLDivElement>,
  ) => {
    if (isProgrammaticScrollRef.current) return;

    const options = part === 'date'
      ? dateOptions
      : part === 'hour'
        ? dateTimeHourOptions
        : dateTimeMinuteOptions;
    const selectedIndex = Math.round(event.currentTarget.scrollTop / dateTimeOptionHeight);
    const clampedIndex = Math.max(0, Math.min(options.length - 1, selectedIndex));
    const nextPartValue = options[clampedIndex];

    if (!nextPartValue) return;

    isUserScrollRef.current = true;
    scheduleColumnSnap(part, event.currentTarget, clampedIndex);

    if (part === 'date') {
      onChange({ ...value, date: nextPartValue });
      return;
    }

    if (part === 'hour') {
      updateTime(nextPartValue, minute);
      return;
    }

    updateTime(hour, nextPartValue);
  };

  const renderColumn = (
    part: 'date' | 'hour' | 'minute',
    options: string[],
    selectedValue: string,
    columnRef: React.RefObject<HTMLDivElement | null>,
  ) => (
    <div
      ref={columnRef}
      className={[
        'nodu-event-edit-datetime-column',
        `nodu-event-edit-datetime-column--${part}`,
      ].join(' ')}
      onScroll={(event) => handleColumnScroll(part, event)}
    >
      {options.map((option) => {
        const isSelected = option === selectedValue;
        const optionLabel = part === 'date' ? formatDateLabel(option) : option;
        const partLabel = part === 'date' ? 'datum' : part === 'hour' ? 'hodina' : 'minuta';

        return (
          <button
            key={option}
            type="button"
            aria-label={`${label} ${partLabel} ${optionLabel}`}
            aria-pressed={isSelected}
            onClick={() => {
              if (part === 'date') {
                onChange({ ...value, date: option });
                return;
              }

              if (part === 'hour') {
                updateTime(option, minute);
                return;
              }

              updateTime(hour, option);
            }}
            className={[
              'nodu-event-edit-datetime-option',
              isSelected ? 'nodu-event-edit-datetime-option--selected' : '',
            ].filter(Boolean).join(' ')}
          >
            {optionLabel}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="nodu-event-edit-datetime-wheel" role="group" aria-label={`Výběr termínu ${label}`}>
      <div className="nodu-event-edit-datetime-wheel-selection" aria-hidden="true" />
      <button
        type="button"
        aria-label={`Potvrdit termín ${label}`}
        className="nodu-event-edit-datetime-confirm"
        onClick={onConfirm}
      >
        <Check size={16} aria-hidden="true" />
      </button>
      {renderColumn('date', dateOptions, value.date, dateColumnRef)}
      {renderColumn('hour', dateTimeHourOptions, hour, hourColumnRef)}
      {renderColumn('minute', dateTimeMinuteOptions, minute, minuteColumnRef)}
    </div>
  );
};

const EventEditModal = ({
  editingEvent,
  onClose,
  onChange,
}: EventEditModalProps) => {
  const [isProjectMenuOpen, setIsProjectMenuOpen] = useState(false);
  const [isLocationPickerOpen, setIsLocationPickerOpen] = useState(false);
  const [activeDateTimePicker, setActiveDateTimePicker] = useState<ActiveDateTimePicker | null>(null);
  const [dateTimeDraft, setDateTimeDraft] = useState<DateTimeDraft | null>(null);
  const projectMenuRef = useRef<HTMLDivElement | null>(null);
  const { projects, clients, contractors } = useMemo(() => {
    const options = getEventFormOptions();
    return {
      ...options,
      contractors: options.contractors ?? [],
    };
  }, []);
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
  const contactOptions = useMemo(() => (
    contractors
      .filter((contractor) => contractor.profileId)
      .sort((left, right) => left.name.localeCompare(right.name, 'cs'))
  ), [contractors]);

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
    onChange(applyEventDraft(normalizeEventDateDefaults(nextEvent)));
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

  const selectContactProfile = (profileId: string) => {
    if (!editingEvent) return;

    if (!profileId) {
      updateEventDraft({
        ...editingEvent,
        contactProfileId: null,
        contactPerson: '',
        contactPhone: '',
      });
      return;
    }

    const selectedContact = contactOptions.find((contractor) => contractor.profileId === profileId);
    if (!selectedContact) return;

    updateEventDraft({
      ...editingEvent,
      contactProfileId: selectedContact.profileId ?? null,
      contactPerson: selectedContact.name,
      contactPhone: selectedContact.phone,
    });
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

  const formEvent = normalizeEventDateDefaults(editingEvent);

  const allEventDates = formEvent.startDate && formEvent.endDate
    ? getDatesBetween(formEvent.startDate, formEvent.endDate)
    : [];
  const phaseSchedules = normalizeEventSchedules(formEvent);
  const globalFrom = formEvent.startTime || '08:00';
  const globalTo = formEvent.endTime || '17:00';
  const selectedContactProfile = formEvent.contactProfileId
    ? contactOptions.find((contractor) => contractor.profileId === formEvent.contactProfileId) ?? null
    : null;
  const legacyContactName = formEvent.contactPerson?.trim() ?? '';
  const hasLegacyContact = Boolean(legacyContactName && !selectedContactProfile);
  const contactSelectValue = selectedContactProfile?.profileId ?? (hasLegacyContact ? '__legacy_contact__' : '');

  const openDateTimePicker = (picker: ActiveDateTimePicker) => {
    const nextDraft = picker === 'start'
      ? { date: formEvent.startDate, time: globalFrom }
      : { date: formEvent.endDate, time: globalTo };

    setDateTimeDraft(nextDraft);
    setActiveDateTimePicker((currentPicker) => (currentPicker === picker ? null : picker));
  };

  const updateEventDateTime = (picker: ActiveDateTimePicker, nextDraft: DateTimeDraft) => {
    if (picker === 'start') {
      const shouldMoveEnd = compareDateTime(nextDraft.date, nextDraft.time, formEvent.endDate, globalTo) > 0;
      const nextEndDate = shouldMoveEnd ? nextDraft.date : formEvent.endDate;
      const nextEndTime = shouldMoveEnd ? nextDraft.time : globalTo;

      updateEventDraft({
        ...formEvent,
        startDate: nextDraft.date,
        startTime: nextDraft.time,
        endDate: nextEndDate,
        endTime: nextEndTime,
        phaseTimes: formEvent.showDayTypes
          ? createDefaultPhaseTimes(nextDraft.time, nextEndTime)
          : formEvent.phaseTimes,
        phaseSchedules: formEvent.showDayTypes
          ? Object.fromEntries(
              Object.entries(phaseSchedules).map(([phaseType, slots]) => [
                phaseType,
                (slots || []).map((slot) => ({ ...slot, from: nextDraft.time, to: nextEndTime })),
              ]),
            ) as Event['phaseSchedules']
          : formEvent.phaseSchedules,
      });
      return;
    }

    const shouldMoveStart = compareDateTime(nextDraft.date, nextDraft.time, formEvent.startDate, globalFrom) < 0;
    const nextStartDate = shouldMoveStart ? nextDraft.date : formEvent.startDate;
    const nextStartTime = shouldMoveStart ? nextDraft.time : globalFrom;

    updateEventDraft({
      ...formEvent,
      startDate: nextStartDate,
      startTime: nextStartTime,
      endDate: nextDraft.date,
      endTime: nextDraft.time,
      phaseTimes: formEvent.showDayTypes
        ? createDefaultPhaseTimes(nextStartTime, nextDraft.time)
        : formEvent.phaseTimes,
      phaseSchedules: formEvent.showDayTypes
        ? Object.fromEntries(
            Object.entries(phaseSchedules).map(([phaseType, slots]) => [
              phaseType,
              (slots || []).map((slot) => ({ ...slot, from: nextStartTime, to: nextDraft.time })),
            ]),
          ) as Event['phaseSchedules']
        : formEvent.phaseSchedules,
    });
  };

  const confirmDateTimePicker = () => {
    if (!activeDateTimePicker || !dateTimeDraft) return;

    updateEventDateTime(activeDateTimePicker, dateTimeDraft);
    setActiveDateTimePicker(null);
    setDateTimeDraft(null);
  };

  const patchPhaseSlots = (phaseType: TimelogType, updater: (slots: EventPhaseSlot[]) => EventPhaseSlot[]) => {
    const nextSlots = updater((phaseSchedules[phaseType] || []).map((slot) => ({ ...slot, dates: [...slot.dates] })));
    updateEventDraft({
      ...formEvent,
      phaseSchedules: {
        ...phaseSchedules,
        [phaseType]: nextSlots,
      },
      phaseTimes: {
        ...(formEvent.phaseTimes || createDefaultPhaseTimes(globalFrom, globalTo)),
        [phaseType]: {
          from: nextSlots[0]?.from || globalFrom,
          to: nextSlots[0]?.to || globalTo,
        },
      },
    });
  };

  const handleSave = async () => {
    try {
      await saveEvent({ ...formEvent, phaseSchedules });
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nepodarilo se ulozit akci.');
    }
  };

  return (
    <AnimatePresence>
      <div className="nodu-event-edit-layer fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="nodu-event-edit-modal flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-[28px] border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.98)] shadow-[0_28px_80px_rgba(47,38,31,0.18)]"
        >
          <div className="nodu-event-edit-header flex items-center justify-between border-b border-[color:rgb(var(--nodu-text-rgb)/0.08)] p-5">
            <h3 className="text-xl font-semibold tracking-[-0.03em] text-[color:var(--nodu-text)]">Upravit akci</h3>
            <button onClick={onClose} className="rounded-xl border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.92)] p-2 text-[color:var(--nodu-text-soft)] transition-all hover:border-[color:rgb(var(--nodu-accent-rgb)/0.24)] hover:text-[color:var(--nodu-accent)]">
              <X size={20} />
            </button>
          </div>

          <div className="nodu-event-edit-body flex-1 space-y-4 overflow-y-auto p-5">
            <section className="nodu-event-edit-section">
              <div className="nodu-event-edit-section-title">Základ</div>
              <div className="nodu-event-edit-grid nodu-event-edit-grid--primary">
                <div>
                  <label className={fieldLabelClass}>Job Number</label>
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
                  <label className={fieldLabelClass}>Nazev akce</label>
                  <Input
                    type="text"
                    value={editingEvent.name}
                    onChange={(e) => updateEventDraft({ ...editingEvent, name: e.target.value })}
                  />
                </div>
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
              </div>
            </section>

            <section className="nodu-event-edit-section">
              <div className="nodu-event-edit-section-title">Poloha</div>
              <EventAddressField
                value={editingEvent}
                onPickMap={() => setIsLocationPickerOpen(true)}
                onChange={(selection) => updateEventDraft({
                  ...editingEvent,
                  address: selection.address,
                  city: selection.address,
                  placeId: selection.placeId,
                  locationLat: selection.locationLat,
                  locationLng: selection.locationLng,
                })}
              />
              <div className="mt-3 w-full">
                <EventMapPreview
                  address={editingEvent.address || editingEvent.city}
                  locationLat={editingEvent.locationLat}
                  locationLng={editingEvent.locationLng}
                  editable
                  onLocationChange={({ locationLat, locationLng }) => updateEventDraft({
                    ...editingEvent,
                    locationLat,
                    locationLng,
                    placeId: undefined,
                  })}
                />
              </div>
            </section>

            <section className="nodu-event-edit-section">
              <div className="nodu-event-edit-section-title">Termín</div>
              <div className="nodu-event-edit-time-groups">
                <DateTimeField
                  label="Začátek"
                  date={formEvent.startDate}
                  time={globalFrom}
                  isActive={activeDateTimePicker === 'start'}
                  onActivate={() => openDateTimePicker('start')}
                />
                <DateTimeField
                  label="Konec"
                  date={formEvent.endDate}
                  time={globalTo}
                  isActive={activeDateTimePicker === 'end'}
                  onActivate={() => openDateTimePicker('end')}
                />
              </div>
              {activeDateTimePicker && dateTimeDraft && (
                <DateTimeWheelPicker
                  key={activeDateTimePicker}
                  label={activeDateTimePicker === 'start' ? 'Začátek' : 'Konec'}
                  value={dateTimeDraft}
                  onChange={setDateTimeDraft}
                  onConfirm={confirmDateTimePicker}
                />
              )}
            </section>

            <section className="nodu-event-edit-section">
              <div className="nodu-event-edit-section-title">Detaily</div>
              <div>
                <label className={fieldLabelClass}>Popis akce</label>
                <Textarea
                  value={editingEvent.description || ''}
                  onChange={(e) => updateEventDraft({ ...editingEvent, description: e.target.value })}
                  className="h-20 resize-none"
                />
              </div>

              <div className="nodu-event-edit-grid nodu-event-edit-grid--details mt-3">
                <div>
                  <label htmlFor="event-contact-profile" className={fieldLabelClass}>Kontaktní osoba</label>
                  <select
                    id="event-contact-profile"
                    value={contactSelectValue}
                    onChange={(e) => selectContactProfile(e.target.value)}
                    className={nativeFieldClass}
                  >
                    <option value="">Vyberte kontakt</option>
                    {hasLegacyContact && (
                      <option value="__legacy_contact__" disabled>
                        {legacyContactName}
                      </option>
                    )}
                    {contactOptions.map((contractor) => (
                      <option key={contractor.profileId} value={contractor.profileId}>
                        {contractor.name}
                      </option>
                    ))}
                  </select>
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
            </section>

            <section className="nodu-event-edit-section">
              <div className="nodu-event-edit-section-title">Nastavení</div>
              <div className="nodu-event-edit-grid nodu-event-edit-grid--settings">
                <div>
                  <label className={fieldLabelClass}>Potreba crew</label>
                  <input
                    type="number"
                    value={editingEvent.needed}
                    onChange={(e) => updateEventDraft({ ...editingEvent, needed: Number(e.target.value) })}
                    className={nativeFieldClass}
                  />
                </div>
                <div>
                  <label className={fieldLabelClass}>Návrh času</label>
                  <label
                    htmlFor="allowCrewTimeProposal"
                    className="nodu-event-edit-toggle-card"
                  >
                    <span className="text-sm font-semibold leading-snug text-[color:var(--nodu-text)]">
                      {editingEvent.allowCrewTimeProposal ? 'Povolit' : 'Zamitnout'}
                    </span>
                    <input
                      type="checkbox"
                      id="allowCrewTimeProposal"
                      checked={editingEvent.allowCrewTimeProposal || false}
                      onChange={(e) => updateEventDraft({
                        ...editingEvent,
                        allowCrewTimeProposal: e.target.checked,
                      })}
                      className="nodu-event-edit-toggle-input sr-only"
                    />
                    <span className="nodu-event-edit-toggle-track">
                      <span className="nodu-event-edit-toggle-thumb" />
                    </span>
                  </label>
                </div>
                <div>
                  <label className={fieldLabelClass}>Kompenzace jidla</label>
                  <label
                    htmlFor="mealAllowanceEnabled"
                    className="nodu-event-edit-toggle-card"
                  >
                    <span className="text-sm font-semibold leading-snug text-[color:var(--nodu-text)]">
                      Nárok na jídlo
                    </span>
                    <input
                      type="checkbox"
                      id="mealAllowanceEnabled"
                      checked={editingEvent.mealAllowanceEnabled || false}
                      onChange={(e) => updateEventDraft({
                        ...editingEvent,
                        mealAllowanceEnabled: e.target.checked,
                      })}
                      className="nodu-event-edit-toggle-input sr-only"
                    />
                    <span className="nodu-event-edit-toggle-track">
                      <span className="nodu-event-edit-toggle-thumb" />
                    </span>
                  </label>
                </div>
              </div>

            </section>

            {formEvent.showDayTypes && formEvent.startDate && formEvent.endDate && (
              <div className="space-y-4 rounded-[22px] border border-[color:var(--nodu-border)] bg-[color:var(--nodu-paper-strong)] p-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-[10px] font-bold uppercase tracking-[0.22em] text-[color:var(--nodu-text-soft)]">Nastaveni typu dnu (PR-I-P-D)</h4>
                  <button
                    type="button"
                    onClick={() => updateEventDraft({
                      ...formEvent,
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

          <div className="nodu-event-edit-footer flex gap-3 border-t border-[color:rgb(var(--nodu-text-rgb)/0.08)] bg-[color:var(--nodu-paper-strong)] p-4">
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
        {isLocationPickerOpen && (
          <EventLocationPickerModal
            address={editingEvent.address || editingEvent.city}
            initialLocationLat={editingEvent.locationLat}
            initialLocationLng={editingEvent.locationLng}
            onCancel={() => setIsLocationPickerOpen(false)}
            onConfirm={({ locationLat, locationLng }) => {
              updateEventDraft({
                ...editingEvent,
                locationLat,
                locationLng,
                placeId: undefined,
              });
              setIsLocationPickerOpen(false);
            }}
          />
        )}
      </div>
    </AnimatePresence>
  );
};

export default EventEditModal;
