import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, ExternalLink, X } from 'lucide-react';
import { motion } from 'framer-motion';
import {
  addDays,
  addMonths,
  format,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { cs } from 'date-fns/locale';
import { Button } from '../components/ui/button';
import { useAppContext } from '../context/useAppContext';
import {
  CrewCalendarAssignment,
  getCrewCalendarAssignments,
  subscribeToCrewCalendarChanges,
} from '../features/crew/services/crew-calendar.service';

interface CrewShiftCalendarViewProps {
  onBack?: () => void;
}

const getStableCalendarDays = (calendarDate: Date) => {
  const start = startOfWeek(startOfMonth(calendarDate), { weekStartsOn: 1 });
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
};

const toDateKey = (date: Date) => format(date, 'yyyy-MM-dd');

const getAssignmentReferenceDate = (assignments: CrewCalendarAssignment[]) => {
  const todayKey = toDateKey(new Date());
  const upcomingAssignment = [...assignments]
    .filter((assignment) => assignment.dateTo >= todayKey)
    .sort((a, b) => a.dateFrom.localeCompare(b.dateFrom))[0];
  const fallbackAssignment = [...assignments].sort((a, b) => a.dateFrom.localeCompare(b.dateFrom))[0];
  const referenceDate = upcomingAssignment?.dateFrom ?? fallbackAssignment?.dateFrom;

  return referenceDate ? parseISO(referenceDate) : new Date();
};

const getCalendarDayClassName = (isCurrentMonth: boolean) => {
  const monthClass = isCurrentMonth
    ? 'border-[color:var(--nodu-border)] bg-white/75'
    : 'border-transparent bg-[color:rgb(var(--nodu-text-rgb)/0.03)] text-[color:var(--nodu-text-soft)]';

  return `min-h-24 rounded-xl border p-2 text-left sm:min-h-28 ${monthClass}`;
};

const getTodayCalendarDayStyle = (isToday: boolean): React.CSSProperties | undefined => (
  isToday
    ? {
      backgroundColor: 'rgb(var(--nodu-accent-rgb) / 0.1)',
      borderColor: 'rgb(var(--nodu-accent-rgb) / 0.42)',
    }
    : undefined
);

const formatDate = (date: string) => format(parseISO(date), 'd. M. yyyy', { locale: cs });

const formatDateRange = (assignment: CrewCalendarAssignment) => (
  assignment.dateFrom === assignment.dateTo
    ? formatDate(assignment.dateFrom)
    : `${formatDate(assignment.dateFrom)} - ${formatDate(assignment.dateTo)}`
);

const formatAssignmentTime = (assignment: CrewCalendarAssignment) => (
  assignment.timeFrom && assignment.timeTo ? `${assignment.timeFrom} - ${assignment.timeTo}` : 'Čas není zadaný'
);

const CrewShiftCalendarView: React.FC<CrewShiftCalendarViewProps> = ({ onBack }) => {
  const { searchQuery, setCurrentTab, setSelectedEventId, setEventTab } = useAppContext();
  const [version, setVersion] = useState(0);
  const [calendarMonth, setCalendarMonth] = useState<Date | null>(null);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);
  const reload = useCallback(() => setVersion((value) => value + 1), []);

  useEffect(() => subscribeToCrewCalendarChanges(reload), [reload]);

  const assignments = useMemo(() => {
    void version;
    return getCrewCalendarAssignments(searchQuery);
  }, [searchQuery, version]);
  const defaultCalendarDate = useMemo(() => getAssignmentReferenceDate(assignments), [assignments]);
  const calendarDate = calendarMonth ?? defaultCalendarDate;
  const calendarDays = getStableCalendarDays(calendarDate);
  const calendarStart = toDateKey(calendarDays[0]);
  const calendarEnd = toDateKey(calendarDays[calendarDays.length - 1]);
  const todayKey = toDateKey(new Date());
  const selectedAssignment = selectedAssignmentId
    ? assignments.find((assignment) => assignment.id === selectedAssignmentId) ?? null
    : null;
  const visibleAssignments = assignments.filter((assignment) => (
    assignment.dateFrom <= calendarEnd && assignment.dateTo >= calendarStart
  ));
  const visibleCrewCount = new Set(visibleAssignments.map((assignment) => assignment.contractorProfileId)).size;

  const moveMonth = (nextMonth: Date) => {
    setCalendarMonth(nextMonth);
    setSelectedAssignmentId(null);
  };

  const openSelectedEvent = (assignment: CrewCalendarAssignment) => {
    setCurrentTab('events');
    setSelectedEventId(assignment.eventSelectionId);
    setEventTab('overview');
  };

  const renderAssignmentDetail = (assignment: CrewCalendarAssignment) => (
    <div
      data-testid="crew-shift-assignment-overlay"
      className="absolute inset-0 z-20 flex items-center justify-center bg-white/72 p-4 backdrop-blur-[2px]"
      onClick={() => setSelectedAssignmentId(null)}
    >
      <div
        role="dialog"
        aria-modal="false"
        aria-labelledby="crew-shift-assignment-title"
        data-testid="crew-shift-assignment-detail"
        className="w-full max-w-md rounded-2xl border border-[color:var(--nodu-border)] bg-white p-4 text-left shadow-[0_18px_42px_rgba(47,38,31,0.16)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2">
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                style={{ backgroundColor: assignment.contractorBg, color: assignment.contractorFg }}
              >
                {assignment.contractorInitials}
              </div>
              <div className="min-w-0">
                <h3 id="crew-shift-assignment-title" className="text-sm font-semibold text-[color:var(--nodu-text)]">
                  Detail směny
                </h3>
                <div className="truncate text-xs font-semibold text-[color:var(--nodu-text)]">
                  {assignment.contractorName}
                </div>
              </div>
            </div>
          </div>
          <button
            type="button"
            aria-label="Zavřít detail směny"
            onClick={() => setSelectedAssignmentId(null)}
            className="rounded-full p-1.5 text-[color:var(--nodu-text-soft)] transition hover:bg-[color:var(--nodu-accent-soft)] hover:text-[color:var(--nodu-text)]"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-3 space-y-2 text-xs">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--nodu-text-soft)]">Akce</div>
            <div className="mt-0.5 font-semibold text-[color:var(--nodu-text)]">{assignment.eventName}</div>
            <div className="text-[color:var(--nodu-text-soft)]">{assignment.eventJob} · {assignment.eventCity || 'Místo není zadané'}</div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="rounded-xl border border-[color:var(--nodu-border)] p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--nodu-text-soft)]">Datum</div>
              <div className="mt-1 font-semibold text-[color:var(--nodu-text)]">{formatDateRange(assignment)}</div>
            </div>
            <div className="rounded-xl border border-[color:var(--nodu-border)] p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--nodu-text-soft)]">Čas</div>
              <div className="mt-1 font-semibold text-[color:var(--nodu-text)]">{formatAssignmentTime(assignment)}</div>
            </div>
          </div>
        </div>

        <Button
          type="button"
          size="sm"
          onClick={() => openSelectedEvent(assignment)}
          className="mt-4 w-full text-xs"
        >
          <span className="inline-flex items-center gap-1.5">
            <ExternalLink size={14} />
            Otevřít akci
          </span>
        </Button>
      </div>
    </div>
  );

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[color:var(--nodu-text-soft)] transition hover:text-[color:var(--nodu-accent)]"
            >
              <ArrowLeft size={14} />
              Zpět na seznam crew
            </button>
          )}
          <div className="flex items-center gap-2">
            <CalendarDays size={17} className="text-[color:var(--nodu-accent)]" />
            <h1 className="text-lg font-semibold text-[color:var(--nodu-text)]">Kalendář směn</h1>
          </div>
          <p className="mt-1 text-xs text-[color:var(--nodu-text-soft)]">
            {visibleCrewCount > 0
              ? `${visibleCrewCount} lidí na směnách v zobrazeném období.`
              : 'V zobrazeném období nejsou žádné směny.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Předchozí měsíc směn"
            onClick={() => moveMonth(subMonths(calendarDate, 1))}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[color:var(--nodu-border)] text-[color:var(--nodu-text-soft)] transition hover:border-[color:var(--nodu-accent)] hover:text-[color:var(--nodu-accent)]"
          >
            <ChevronLeft size={15} />
          </button>
          <div className="min-w-32 text-center text-xs font-semibold capitalize text-[color:var(--nodu-text-soft)]">
            {format(calendarDate, 'LLLL yyyy', { locale: cs })}
          </div>
          <button
            type="button"
            aria-label="Další měsíc směn"
            onClick={() => moveMonth(addMonths(calendarDate, 1))}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[color:var(--nodu-border)] text-[color:var(--nodu-text-soft)] transition hover:border-[color:var(--nodu-accent)] hover:text-[color:var(--nodu-accent)]"
          >
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

      <section className="relative overflow-hidden rounded-[28px] border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.98)] p-5 shadow-[0_18px_42px_rgba(47,38,31,0.08)]">
        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-wider text-[color:var(--nodu-text-soft)]">
          {['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'].map((day) => <div key={day}>{day}</div>)}
        </div>
        <div className="mt-2 grid grid-cols-7 gap-1">
          {calendarDays.map((day) => {
            const key = toDateKey(day);
            const isToday = key === todayKey;
            const dayAssignments = assignments.filter((assignment) => (
              assignment.dateFrom <= key && assignment.dateTo >= key
            ));

            return (
              <div
                key={key}
                data-testid="crew-shift-calendar-day"
                data-date={key}
                data-today={isToday ? 'true' : undefined}
                className={getCalendarDayClassName(isSameMonth(day, calendarDate))}
                style={getTodayCalendarDayStyle(isToday)}
              >
                <div className="text-[11px] font-semibold">{format(day, 'd')}</div>
                <div className="mt-1 space-y-1">
                  {dayAssignments.slice(0, 4).map((assignment) => (
                    <button
                      type="button"
                      key={`${key}-${assignment.id}`}
                      onClick={() => setSelectedAssignmentId(assignment.id)}
                      className="block h-6 w-full truncate rounded-md border px-1.5 text-left text-[9px] font-semibold transition ring-offset-1 hover:brightness-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--nodu-accent)]"
                      style={{
                        backgroundColor: assignment.contractorBg,
                        borderColor: assignment.contractorFg,
                        color: assignment.contractorFg,
                      }}
                      title={`${assignment.contractorName} · ${assignment.eventName} · ${formatDateRange(assignment)}`}
                      aria-label={`${assignment.contractorName} · ${assignment.eventName} · ${formatDateRange(assignment)}`}
                    >
                      {assignment.contractorName}
                    </button>
                  ))}
                  {dayAssignments.length > 4 && (
                    <div className="h-5 rounded-md bg-[color:rgb(var(--nodu-text-rgb)/0.05)] px-1.5 text-[9px] font-semibold leading-5 text-[color:var(--nodu-text-soft)]">
                      +{dayAssignments.length - 4}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {assignments.length === 0 && (
          <div className="mt-4 rounded-xl border border-dashed border-[color:var(--nodu-border)] p-5 text-center text-sm text-[color:var(--nodu-text-soft)]">
            Žádné směny k zobrazení.
          </div>
        )}

        {selectedAssignment && renderAssignmentDetail(selectedAssignment)}
      </section>
    </motion.div>
  );
};

export default CrewShiftCalendarView;
