import React, { useId } from 'react';
import { Check, Copy, Trash2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { cs } from 'date-fns/locale';
import type { Event, Role, Timelog } from '../../../types';
import { getDatesBetween } from '../../../utils';
import { buildEventScheduleDays } from '../services/event-schedule';
import { getEventDetailData } from '../services/events.service';
import { listEventDates } from '../../timelogs/services/timelog-day-ui';
import { Button } from '../../../components/ui/button';

type EventTimelogApprovalMeta = { label: string; className: string; dotClassName: string };
type EventListAccentStyle = React.CSSProperties & { '--event-list-accent'?: string; '--event-list-accent-border'?: string };
export interface EventListOccurrence {
  event: Event;
  date: string;
  kind: 'single' | 'start' | 'continuation' | 'end';
  dayIndex: number;
  dayCount: number;
}
export interface EventCardSelection {
  checked: boolean;
  disabled: boolean;
  reason: string | null;
  onToggle: () => void;
}
type CardDetail = Pick<ReturnType<typeof getEventDetailData>, 'timelogs' | 'crewAssignments' | 'applications' | 'contractors'>;
interface Props {
  occurrence: EventListOccurrence;
  canManageEvents: boolean;
  role: Role;
  currentProfileId?: string | null;
  selection?: EventCardSelection;
  occurrenceKey?: string;
  detail?: CardDetail;
  crewDisplay?: readonly { profileId: string; name: string }[];
  onOpen?: (event: Event) => void;
  onDelete?: (event: Event) => void;
  onCopy?: (event: Event) => void;
  onProfile?: (profileId: string) => void;
  getApplicationDraftTimes?: (event: Event) => { from: string; to: string };
  updateApplicationDraftTime?: (event: Event, field: 'from' | 'to', value: string) => void;
  handleApplyForEvent?: (event: Event) => void;
  handleWithdrawApplication?: (event: Event) => void;
  handleRequestEventWithdrawal?: (event: Event) => void;
}
function CrewChip({ interactive, children, className, title, onClick }: React.ButtonHTMLAttributes<HTMLButtonElement> & { interactive: boolean }) {
  return interactive ? <button type="button" className={className} title={title} onClick={onClick}>{children}</button>
    : <span className={className} title={title}>{children}</span>;
}
const defaultTimes = (event: Event) => ({ from: event.startTime || '08:00', to: event.endTime || '17:00' });
const ignoreDraftTime = () => undefined;
const ignoreApplication = () => undefined;

const EVENT_COLOR_TONES = [
  {
    accentColor: '#c98ca2',
    backgroundColor: '#fff7f8',
    borderColor: '#efced7',
    textColor: '#5b4149',
    metaColor: '#7f6770',
  },
  {
    accentColor: '#88a79c',
    backgroundColor: '#f6fbf8',
    borderColor: '#cfe1da',
    textColor: '#3e554d',
    metaColor: '#687b74',
  },
  {
    accentColor: '#7f9eb8',
    backgroundColor: '#f6fafd',
    borderColor: '#cbddeb',
    textColor: '#3d5267',
    metaColor: '#657789',
  },
  {
    accentColor: '#a391bd',
    backgroundColor: '#fbf8ff',
    borderColor: '#d9d0e8',
    textColor: '#51465f',
    metaColor: '#746982',
  },
  {
    accentColor: '#c79a70',
    backgroundColor: '#fff9f3',
    borderColor: '#ead5c0',
    textColor: '#604a37',
    metaColor: '#826d58',
  },
  {
    accentColor: '#76aaa5',
    backgroundColor: '#f5fbfa',
    borderColor: '#c4dedb',
    textColor: '#375957',
    metaColor: '#627d7a',
  },
] as const;

const getStableEventColorSeed = (event: Event) => {
  if (event.supabaseId) return event.supabaseId;

  return [
    event.projectId,
    event.job,
    event.name,
    event.startDate,
    event.endDate,
  ].filter(Boolean).join('|') || String(event.id);
};

// eslint-disable-next-line react-refresh/only-export-components -- Shared presentation for cards and the existing calendar.
export const getStableEventColorTone = (event: Event) => {
  const seed = getStableEventColorSeed(event);
  let hash = 0;

  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % EVENT_COLOR_TONES.length;
  }

  return EVENT_COLOR_TONES[hash];
};

const getEventListAccentStyle = (event: Event, dayCount: number): EventListAccentStyle | undefined => {
  if (dayCount <= 1) return undefined;

  const tone = getStableEventColorTone(event);

  return {
    '--event-list-accent': tone.accentColor,
    '--event-list-accent-border': tone.borderColor,
  };
};

const formatOccurrenceDate = (date: string) => format(parseISO(date), 'd. M. yyyy', { locale: cs });
const formatEventBoundaryDateTime = (date: string, time?: string) => (
  `${formatOccurrenceDate(date)} · ${time?.trim() || 'čas bude doplněn'}`
);
const formatEventMetaParts = (...parts: Array<string | null | undefined>) => (
  parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(' · ')
);
const formatSingleDayOccurrenceMeta = (date: string, timeLabel: string, client?: string) => (
  formatEventMetaParts(formatOccurrenceDate(date), timeLabel, client)
);

const formatEventDayCount = (dayCount: number) => {
  if (dayCount === 1) return '1 den';
  if (dayCount >= 2 && dayCount <= 4) return `${dayCount} dny`;
  return `${dayCount} dní`;
};

// eslint-disable-next-line react-refresh/only-export-components -- One inclusive occurrence definition for both card views.
export const getListOccurrencesForEvent = (
  event: Event,
  canManageEvents: boolean,
  listStartDate?: string,
): EventListOccurrence[] => {
  const dates = event.scheduleVersion === 2 ? listEventDates(event) : getDatesBetween(event.startDate, event.endDate);
  const dayCount = dates.length || 1;

  if (dayCount === 1 || !dates[0]) {
    return [{
      event,
      date: dates[0] ?? event.startDate,
      kind: 'single',
      dayIndex: 1,
      dayCount,
    }];
  }

  if (!canManageEvents) {
    const occurrenceDate = listStartDate && event.startDate < listStartDate && event.endDate >= listStartDate
      ? listStartDate
      : dates[0];

    return [{
      event,
      date: occurrenceDate,
      kind: 'start',
      dayIndex: 1,
      dayCount,
    }];
  }

  return dates.map((date, index) => ({
    event,
    date,
    kind: index === 0 ? 'start' : (index === dates.length - 1 ? 'end' : 'continuation'),
    dayIndex: index + 1,
    dayCount,
  }));
};

const formatTimelogShift = (from: string, to: string) => `${from} - ${to}`;

const getTimeSortValue = (time: string) => {
  const [hours, minutes] = time.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return Number.MAX_SAFE_INTEGER;
  return hours * 60 + minutes;
};

const getEventOccurrenceTimeLabel = (event: Event, date: string, timelogs: Timelog[] = []) => {
  const timelogTimes = timelogs.flatMap((timelog) => (
    timelog.days
      .filter((day) => day.d === date)
      .map((day) => ({ from: day.f, label: formatTimelogShift(day.f, day.t) }))
  ));
  const uniqueTimelogTimes = Array.from(
    timelogTimes.reduce((acc, shift) => (
      acc.has(shift.label) ? acc : acc.set(shift.label, shift)
    ), new Map<string, { from: string; label: string }>()),
  )
    .map(([, shift]) => shift)
    .sort((a, b) => getTimeSortValue(a.from) - getTimeSortValue(b.from))
    .map((shift) => shift.label);

  if (uniqueTimelogTimes.length > 0) {
    if (uniqueTimelogTimes.length <= 2) return uniqueTimelogTimes.join(', ');
    return `${uniqueTimelogTimes[0]} + ${uniqueTimelogTimes.length - 1} smeny`;
  }

  if (event.scheduleVersion === 2) {
    const plannedTimes = buildEventScheduleDays(event)
      .filter((day) => day.d === date && day.f && day.t)
      .map((day) => formatTimelogShift(day.f, day.t));
    return [...new Set(plannedTimes)].join(', ') || 'Cas neurcen';
  }

  const phaseTimes = event.showDayTypes
    ? Object.values(event.phaseSchedules ?? {})
      .flat()
      .filter((slot) => slot.dates.includes(date))
      .map((slot) => formatTimelogShift(slot.from, slot.to))
    : [];

  const uniquePhaseTimes = [...new Set(phaseTimes)];
  if (uniquePhaseTimes.length > 0) return uniquePhaseTimes.join(', ');
  if (event.startTime && event.endTime) return `${event.startTime} - ${event.endTime}`;
  if (event.startTime) return `od ${event.startTime}`;
  if (event.endTime) return `do ${event.endTime}`;
  return 'Cas neurcen';
};

const getEventTimelogApprovalMeta = (timelogs: Timelog[]): EventTimelogApprovalMeta => {
  if (timelogs.length === 0) {
    return {
      label: 'Casy nezadane',
      className: 'border-[color:rgb(var(--nodu-text-rgb)/0.12)] bg-[color:rgb(var(--nodu-text-rgb)/0.06)] text-[color:var(--nodu-text-soft)]',
      dotClassName: 'bg-[color:rgb(var(--nodu-text-rgb)/0.34)]',
    };
  }

  const statuses = new Set(timelogs.map((timelog) => timelog.status));
  const allApproved = timelogs.every((timelog) => ['approved', 'invoiced', 'paid'].includes(timelog.status));
  if (allApproved) {
    return {
      label: 'Casy schvalene',
      className: 'border-[color:var(--nodu-success-border)] bg-[color:var(--nodu-success-bg)] text-[color:var(--nodu-success-text)]',
      dotClassName: 'bg-[color:var(--nodu-success-text)]',
    };
  }

  if (statuses.has('rejected')) {
    return {
      label: 'Casy k oprave',
      className: 'border-[color:var(--nodu-error-border)] bg-[color:var(--nodu-error-bg)] text-[color:var(--nodu-error-text)]',
      dotClassName: 'bg-[color:var(--nodu-error-text)]',
    };
  }

  if (statuses.has('pending_ch')) {
    return {
      label: 'Ceka CH',
      className: 'border-[color:var(--nodu-warning-border)] bg-[color:var(--nodu-warning-bg)] text-[color:var(--nodu-warning-text)]',
      dotClassName: 'bg-[#f59e0b]',
    };
  }

  if (statuses.has('pending_coo')) {
    return {
      label: 'Ceka COO',
      className: 'border-[color:var(--nodu-info-border)] bg-[color:var(--nodu-info-bg)] text-[color:var(--nodu-info-text)]',
      dotClassName: 'bg-[#2563eb]',
    };
  }

  return {
    label: 'Casy rozepsane',
    className: 'border-[color:rgb(var(--nodu-text-rgb)/0.12)] bg-[color:rgb(var(--nodu-text-rgb)/0.06)] text-[color:var(--nodu-text-soft)]',
    dotClassName: 'bg-[color:rgb(var(--nodu-text-rgb)/0.42)]',
  };
};


export default function EventListCard({ occurrence, canManageEvents, role, currentProfileId, selection, occurrenceKey, detail, crewDisplay,
  onOpen, onDelete, onCopy, onProfile, getApplicationDraftTimes = defaultTimes, updateApplicationDraftTime = ignoreDraftTime,
  handleApplyForEvent = ignoreApplication, handleWithdrawApplication = ignoreApplication, handleRequestEventWithdrawal = ignoreApplication,
}: Props) {
  const reasonId = useId();
  const { event, date: occurrenceDate } = occurrence;
  const eventDetail = detail ?? getEventDetailData(event.supabaseId ?? event.id);
  const eventTimelogs: Timelog[] = eventDetail.timelogs;
  const assignedCrew = (crewDisplay ?? eventDetail.crewAssignments.map((assignment) => ({
    profileId: assignment.contractorProfileId, name: assignment.name,
  }))).map(({ profileId, name }) => ({
    profileId, name,
    approvalMeta: getEventTimelogApprovalMeta(
      eventTimelogs.filter((timelog) => timelog.contractorProfileId === profileId),
    ),
  }));
  const pendingApplications = (eventDetail.applications ?? [])
    .filter((application) => application.status === 'pending')
    .map((application) => {
      const contractor = eventDetail.contractors.find((item) => item.profileId === application.contractorProfileId);
      return contractor ? {
        applicationId: application.id,
        profileId: application.contractorProfileId,
        name: contractor.name,
        plannedFrom: application.plannedFrom,
        plannedTo: application.plannedTo,
      } : null;
    })
      .filter((item) => item !== null);
  const withdrawalRequests = (eventDetail.applications ?? [])
    .filter((application) => application.status === 'withdrawal_requested')
    .map((application) => {
      const contractor = eventDetail.contractors.find((item) => item.profileId === application.contractorProfileId);
      return contractor ? { applicationId: application.id, profileId: application.contractorProfileId, name: contractor.name } : null;
    })
      .filter((item) => item !== null);
  const visiblePendingApplications = canManageEvents
    ? pendingApplications
    : pendingApplications.filter((application) => application.profileId === currentProfileId);
  const visibleWithdrawalRequests = canManageEvents
    ? withdrawalRequests
    : withdrawalRequests.filter((application) => application.profileId === currentProfileId);
  const hasMyPendingApplication = currentProfileId
    ? pendingApplications.some((application) => application.profileId === currentProfileId)
    : false;
  const hasMyWithdrawalRequest = currentProfileId
    ? withdrawalRequests.some((application) => application.profileId === currentProfileId)
    : false;
  const isMeAssigned = currentProfileId
    ? assignedCrew.some((contractor) => contractor.profileId === currentProfileId)
    : false;
  const isFullyStaffed = event.needed > 0 && event.filled >= event.needed;
  const isClosedForApplications = event.status === 'full' || isFullyStaffed;
  const canApplyToEvent = event.status === 'upcoming' && !isClosedForApplications;
  const occurrenceTimeLabel = getEventOccurrenceTimeLabel(event, occurrenceDate, eventTimelogs);
  const isMultiDayOccurrence = occurrence.dayCount > 1;
  const shouldShowMultiDayAccent = canManageEvents && isMultiDayOccurrence;
  const isContinuationOccurrence = occurrence.kind === 'continuation' || occurrence.kind === 'end';
  const approvalMeta = getEventTimelogApprovalMeta(eventTimelogs);
  const listAccentStyle = getEventListAccentStyle(event, occurrence.dayCount);
  const listBorderClass = shouldShowMultiDayAccent
    ? 'border-[color:var(--event-list-accent-border)]'
    : 'border-[color:var(--nodu-border)]';
  const continuationBorderClass = shouldShowMultiDayAccent
    ? 'border-dashed border-[color:var(--event-list-accent-border)]'
    : 'border-dashed border-[color:rgb(var(--nodu-text-rgb)/0.16)]';

  return (
    <div
      key={`${event.supabaseId ?? event.id}-${occurrenceDate}`}
      data-testid="event-list-card"
      data-event-multiday={isMultiDayOccurrence ? 'true' : undefined}
      role={selection ? 'checkbox' : 'button'}
      aria-label={selection ? [event.name, event.job, occurrenceDate].filter(Boolean).join(' · ') : undefined}
      aria-checked={selection?.checked}
      aria-disabled={selection?.disabled}
      aria-describedby={selection?.reason ? reasonId : undefined}
      data-workflow-occurrence={occurrenceKey ?? `${event.supabaseId ?? event.id}|${occurrenceDate}`}
      tabIndex={0}
      style={shouldShowMultiDayAccent ? listAccentStyle : undefined}
      onClick={() => { if (selection) { if (!selection.disabled) selection.onToggle(); } else onOpen?.(event); }}
      onKeyDown={(keyboardEvent) => {
        if (keyboardEvent.target === keyboardEvent.currentTarget && (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ')) {
          keyboardEvent.preventDefault();
          if (selection) { if (!selection.disabled) selection.onToggle(); } else onOpen?.(event);
        }
      }}
      className={` ${selection ? 'nodu-workflow-card' : ''} ${selection?.checked ? 'nodu-workflow-card--checked' : ''} ${selection?.disabled ? 'nodu-workflow-card--disabled' : ''} relative cursor-pointer overflow-hidden rounded-[28px] border transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgb(var(--nodu-accent-rgb)/0.22)] ${
        isContinuationOccurrence
          ? `${continuationBorderClass} bg-[color:rgb(var(--nodu-text-rgb)/0.035)] shadow-none hover:shadow-[0_12px_28px_rgba(47,38,31,0.06)]`
          : `${listBorderClass} bg-[color:rgb(var(--nodu-surface-rgb)/0.98)] shadow-[0_18px_42px_rgba(47,38,31,0.08)] hover:shadow-[0_22px_48px_rgba(47,38,31,0.12)]`
      }`}
    >
      {shouldShowMultiDayAccent && (
        <span
          data-testid="event-list-accent"
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-4 left-0 w-1 rounded-r-full bg-[color:var(--event-list-accent)]"
        />
      )}
      {selection && <span aria-hidden="true" className="nodu-workflow-card__check">{selection.checked ? <Check size={18} /> : null}</span>}
      {canManageEvents && !selection && (
        <button
          onClick={(clickEvent) => {
            clickEvent.stopPropagation();
            onDelete?.(event);
          }}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-[color:var(--nodu-text-soft)] transition-all hover:bg-[rgba(212,93,55,0.06)] hover:text-[#c45c39]"
          title="Smazat akci"
        >
          <Trash2 size={16} />
        </button>
      )}
      <div className="border-b border-[color:rgb(var(--nodu-text-rgb)/0.08)] p-4">
        <div className="grid gap-4 pr-10 md:grid-cols-[minmax(0,1fr)_minmax(280px,0.92fr)]">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2">
              <span className="jn nodu-job-badge px-2 py-0.5 text-[13px] font-semibold">{event.job}</span>
              {canManageEvents && (
                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${approvalMeta.className}`}>
                  {approvalMeta.label}
                </span>
              )}
            </div>
            <h3 className="text-base font-semibold text-[color:var(--nodu-text)]">{event.name}</h3>
            {isMultiDayOccurrence ? (
              <div className="mt-1 space-y-0.5 text-xs text-[color:var(--nodu-text-soft)]">
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                  <span className="min-w-5 text-[10px] font-bold uppercase tracking-[0.14em] text-[color:var(--nodu-text-soft)]">Od</span>
                  <span className="font-medium text-[color:var(--nodu-text)]">{formatEventBoundaryDateTime(event.startDate, event.startTime)}</span>
                </div>
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                  <span className="min-w-5 text-[10px] font-bold uppercase tracking-[0.14em] text-[color:var(--nodu-text-soft)]">Do</span>
                  <span className="font-medium text-[color:var(--nodu-text)]">{formatEventBoundaryDateTime(event.endDate, event.endTime)}</span>
                  <span className="rounded bg-[color:rgb(var(--nodu-text-rgb)/0.08)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-tighter text-[color:var(--nodu-text-soft)]">
                    {formatEventDayCount(occurrence.dayCount)}
                  </span>
                </div>
                <div>{event.client}</div>
              </div>
            ) : (
              <div className="mt-1 flex items-center gap-1.5 text-xs text-[color:var(--nodu-text-soft)]">
                {formatSingleDayOccurrenceMeta(occurrenceDate, occurrenceTimeLabel, event.client)}
              </div>
            )}
          </div>

          <div className="hidden min-h-[72px] border-l border-[color:rgb(var(--nodu-text-rgb)/0.1)] pl-6 md:block">
            {(assignedCrew.length > 0 || visiblePendingApplications.length > 0 || visibleWithdrawalRequests.length > 0) && (
              <div className="flex min-w-0 flex-wrap content-start items-start justify-start gap-1.5 pt-1">
                {assignedCrew.map((contractor) => (
                  <CrewChip interactive={!selection}
                    key={`${event.id}-${contractor.profileId}`}
                    type="button"
                    onClick={(clickEvent) => {
                      clickEvent.stopPropagation();
                      onProfile?.(contractor.profileId);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--nodu-success-border)] bg-[color:var(--nodu-success-bg)] px-2.5 py-1 text-[11px] font-semibold text-[color:var(--nodu-text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] transition hover:bg-[color:var(--nodu-success-bg-hover)]"
                    title={`Casy: ${contractor.approvalMeta.label}`}
                  >
                    {contractor.name}
                    <span className={`h-2 w-2 shrink-0 rounded-full border border-white shadow-[0_0_0_1px_rgba(47,38,31,0.08)] ${contractor.approvalMeta.dotClassName}`} />
                  </CrewChip>
                ))}
                {visiblePendingApplications.map((application) => (
                  <CrewChip interactive={!selection}
                    key={`${event.id}-application-${application.applicationId}`}
                    type="button"
                    onClick={(clickEvent) => {
                      clickEvent.stopPropagation();
                      onProfile?.(application.profileId);
                    }}
                    className="rounded-full border border-[color:rgb(var(--nodu-text-rgb)/0.16)] bg-[color:rgb(var(--nodu-text-rgb)/0.08)] px-2.5 py-1 text-[11px] font-semibold text-[color:var(--nodu-text)] transition hover:bg-[color:rgb(var(--nodu-text-rgb)/0.12)]"
                    title={application.plannedFrom && application.plannedTo ? `Ceka na schvaleni, plan ${application.plannedFrom} - ${application.plannedTo}` : 'Ceka na schvaleni'}
                  >
                    {application.name}
                    {application.plannedFrom && application.plannedTo ? ` · ${application.plannedFrom}-${application.plannedTo}` : ''}
                  </CrewChip>
                ))}
                {visibleWithdrawalRequests.map((application) => (
                  <CrewChip interactive={!selection}
                    key={`${event.id}-withdrawal-${application.applicationId}`}
                    type="button"
                    onClick={(clickEvent) => {
                      clickEvent.stopPropagation();
                      onProfile?.(application.profileId);
                    }}
                    className="rounded-full border border-[color:rgb(var(--nodu-text-rgb)/0.16)] bg-[color:rgb(var(--nodu-text-rgb)/0.08)] px-2.5 py-1 text-[11px] font-semibold text-[color:var(--nodu-text-soft)] transition hover:bg-[color:rgb(var(--nodu-text-rgb)/0.12)]"
                    title="Zadost o odhlaseni"
                  >
                    {application.name} · odhlaseni
                  </CrewChip>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-5 px-4 py-3">
        <div>
          <div className="mb-1 text-[10px] uppercase tracking-wider text-[color:var(--nodu-text-soft)]">Crew obsazeni</div>
          <div className="flex items-center gap-2">
            <div className="h-1 w-20 overflow-hidden rounded-full bg-[color:rgb(var(--nodu-text-rgb)/0.08)]">
              <div
                className={`h-full rounded-full ${isFullyStaffed ? 'bg-[color:var(--nodu-success-text)]' : 'bg-[color:var(--nodu-accent)]'}`}
                style={{ width: `${Math.min(100, Math.round((event.filled / event.needed) * 100))}%` }}
              />
            </div>
            <span className="text-xs font-semibold text-[color:var(--nodu-text)]">{event.filled}/{event.needed}</span>
          </div>
        </div>
        {!selection && <div className="ml-auto flex gap-2">
          {canManageEvents && !selection && (
            <Button
              aria-label="Kopirovat akci na jiny den"
              onClick={(clickEvent) => {
                clickEvent.stopPropagation();
                onCopy?.(event);
              }}
              variant="outline"
              size="sm"
              className="text-[11px]"
            >
              <Copy size={13} />
              Kopirovat
            </Button>
          )}
          {role === 'crew' && !isMeAssigned && !hasMyPendingApplication && canApplyToEvent && (
            event.allowCrewTimeProposal ? (
              <div
                className="flex items-center gap-1 rounded-xl border border-[color:var(--nodu-border)] bg-white px-2 py-1"
                onClick={(clickEvent) => clickEvent.stopPropagation()}
              >
                <input
                  type="time"
                  value={getApplicationDraftTimes(event).from}
                  onChange={(changeEvent) => updateApplicationDraftTime(event, 'from', changeEvent.target.value)}
                  className="w-20 bg-transparent text-[11px] font-semibold text-[color:var(--nodu-text)] outline-none"
                  aria-label="Planovany prichod"
                />
                <span className="text-[color:var(--nodu-text-soft)]">-</span>
                <input
                  type="time"
                  value={getApplicationDraftTimes(event).to}
                  onChange={(changeEvent) => updateApplicationDraftTime(event, 'to', changeEvent.target.value)}
                  className="w-20 bg-transparent text-[11px] font-semibold text-[color:var(--nodu-text)] outline-none"
                  aria-label="Planovany odchod"
                />
              </div>
            ) : null
          )}
          {role === 'crew' && !isMeAssigned && !hasMyPendingApplication && isClosedForApplications && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-[11px]"
              disabled
            >
              Obsazeno
            </Button>
          )}
          {role === 'crew' && !isMeAssigned && !hasMyPendingApplication && canApplyToEvent && (
            <Button
              onClick={(clickEvent) => {
                clickEvent.stopPropagation();
                handleApplyForEvent(event);
              }}
              variant="outline"
              size="sm"
              className="text-[11px]"
            >
              Prihlasit na akci
            </Button>
          )}
          {role === 'crew' && hasMyPendingApplication && (
            <Button
              onClick={(clickEvent) => {
                clickEvent.stopPropagation();
                handleWithdrawApplication(event);
              }}
              variant="outline"
              size="sm"
              className="text-[11px]"
            >
              Odhlasit se z akce
            </Button>
          )}
          {role === 'crew' && isMeAssigned && !hasMyWithdrawalRequest && (
            <Button
              onClick={(clickEvent) => {
                clickEvent.stopPropagation();
                handleRequestEventWithdrawal(event);
              }}
              variant="outline"
              size="sm"
              className="text-[11px]"
            >
              Pozadat o odhlaseni
            </Button>
          )}
          {role === 'crew' && hasMyWithdrawalRequest && (
            <span className="rounded-full border border-[color:rgb(var(--nodu-text-rgb)/0.14)] bg-[color:rgb(var(--nodu-text-rgb)/0.07)] px-3 py-2 text-[11px] font-semibold text-[color:var(--nodu-text-soft)]">
              Odhlaseni ceka na schvaleni
            </span>
          )}
        </div>}
      </div>
      {selection?.reason && <p id={reasonId} className="px-4 pb-3 text-xs text-[color:var(--nodu-text-soft)]">{selection.reason}</p>}
    </div>
  );
}
