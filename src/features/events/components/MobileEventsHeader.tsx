import { useLayoutEffect, useRef, useState, type MouseEvent } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, parseISO, startOfMonth, startOfWeek, subMonths } from 'date-fns';
import { cs } from 'date-fns/locale';

export type MobileCrewEventFilter = 'all' | 'open' | 'assigned' | 'pending' | 'full';

const MOBILE_CREW_EVENT_FILTER_OPTIONS = [
  { id: 'all' as const, label: 'Vse' },
  { id: 'open' as const, label: 'Volne' },
  { id: 'assigned' as const, label: 'Moje akce' },
  { id: 'pending' as const, label: 'Cekam' },
  { id: 'full' as const, label: 'Obsazeno' },
];

const MOBILE_CREW_DATE_PICKER_WEEKDAYS = ['PO', 'UT', 'ST', 'CT', 'PA', 'SO', 'NE'];

type Panel = { kind: 'date'; month: Date } | { kind: 'filters' } | null;

interface Props {
  date: string;
  crew: boolean;
  crewFilter: MobileCrewEventFilter;
  eventCount: number;
  selectionActive: boolean;
  onCrewFilterChange: (filter: MobileCrewEventFilter) => void;
  onDateChange: (date: string, click: MouseEvent<HTMLButtonElement>) => void;
}

export default function MobileEventsHeader({ date, crew, crewFilter, eventCount, selectionActive, onCrewFilterChange, onDateChange }: Props) {
  const todayDateKey = format(new Date(), 'yyyy-MM-dd');
  const dateButton = useRef<HTMLButtonElement>(null);
  const [panel, setPanel] = useState<Panel>(null);
  useLayoutEffect(() => setPanel(null), [selectionActive]);

  const days = panel?.kind === 'date' ? eachDayOfInterval({
    start: startOfWeek(startOfMonth(panel.month), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(panel.month), { weekStartsOn: 1 }),
  }) : [];
  const chooseDate = (value: string, click: MouseEvent<HTMLButtonElement>) => {
    if (click.detail === 0) dateButton.current?.focus({ preventScroll: true });
    setPanel(null);
    onDateChange(value, click);
  };

  return <>
    <div className="nodu-mobile-events-header">
      <button
        type="button"
        ref={dateButton}
        aria-label="Vybrat datum akci"
        className={`nodu-mobile-events-header__action nodu-mobile-events-header__action--left ${panel?.kind === 'date' ? 'nodu-mobile-events-header__action--active' : ''}`}
        aria-pressed={panel?.kind === 'date'}
        onClick={() => setPanel(panel?.kind === 'date' ? null : { kind: 'date', month: parseISO(date) })}
      >
        <CalendarDays size={18} />
      </button>
      <h1 className="nodu-mobile-events-header__title">Akce</h1>
      {crew ? <button
        type="button"
        aria-label="Filtrovat akce"
        aria-pressed={panel?.kind === 'filters'}
        className={`nodu-mobile-events-header__action nodu-mobile-events-header__action--right ${panel?.kind === 'filters' ? 'nodu-mobile-events-header__action--active' : ''}`}
        onClick={() => setPanel(panel?.kind === 'filters' ? null : { kind: 'filters' })}
      >
        <Filter size={18} />
      </button> : <span className="nodu-mobile-events-header__action--right" />}
    </div>
    {panel?.kind === 'date' && (
      <div
        className="nodu-mobile-events-date-panel"
        role="dialog"
        aria-label="Vyber data od kdy zobrazit akce"
      >
        <div className="nodu-mobile-events-date-panel__bar">
          <button
            type="button"
            aria-label="Predchozi mesic vyberu akci"
            className="nodu-mobile-events-date-panel__nav"
            onClick={() => setPanel({ kind: 'date', month: subMonths(panel.month, 1) })}
          >
            <ChevronLeft size={15} />
          </button>
          <div className="nodu-mobile-events-date-panel__month">
            {format(panel.month, 'LLLL yyyy', { locale: cs })}
          </div>
          <button
            type="button"
            aria-label="Dalsi mesic vyberu akci"
            className="nodu-mobile-events-date-panel__nav"
            onClick={() => setPanel({ kind: 'date', month: addMonths(panel.month, 1) })}
          >
            <ChevronRight size={15} />
          </button>
        </div>

        <button
          type="button"
          className="mb-3 w-full rounded-xl border border-[color:rgb(var(--nodu-accent-rgb)/0.2)] bg-[color:rgb(var(--nodu-accent-rgb)/0.08)] px-3 py-2 text-xs font-bold text-[color:var(--nodu-accent)]"
          onClick={(click) => chooseDate(todayDateKey, click)}
        >
          Dnes a dál
        </button>

        <div className="nodu-mobile-events-date-panel__weekdays" aria-hidden="true">
          {MOBILE_CREW_DATE_PICKER_WEEKDAYS.map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>

        <div className="nodu-mobile-events-date-panel__grid">
          {days.map((day) => {
            const dayKey = format(day, 'yyyy-MM-dd');
            const isSelectedDay = dayKey === date;
            const isToday = dayKey === todayDateKey;

            return (
              <button
                key={dayKey}
                type="button"
                aria-pressed={isSelectedDay}
                aria-label={`Zobrazit akce od ${format(day, 'd. MMMM yyyy', { locale: cs })}`}
                className={`nodu-mobile-events-date-panel__day ${
                  isSelectedDay ? 'nodu-mobile-events-date-panel__day--selected' : ''
                } ${isToday ? 'nodu-mobile-events-date-panel__day--today' : ''} ${
                  isSameMonth(day, panel.month) ? '' : 'nodu-mobile-events-date-panel__day--outside'
                }`}
                onClick={(click) => chooseDate(dayKey, click)}
              >
                {format(day, 'd.')}
              </button>
            );
          })}
        </div>
      </div>
    )}
    {crew && panel?.kind === 'filters' && (
      <div className="nodu-mobile-events-filter-panel">
        {MOBILE_CREW_EVENT_FILTER_OPTIONS.map((item) => (
          <button
            key={item.id}
            onClick={() => onCrewFilterChange(item.id)}
            className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-all ${
              crewFilter === item.id
                ? 'border-[color:rgb(var(--nodu-accent-rgb)/0.18)] bg-[color:rgb(var(--nodu-accent-rgb)/0.12)] text-[color:var(--nodu-accent)]'
                : 'border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.98)] text-[color:var(--nodu-text-soft)] hover:border-[color:rgb(var(--nodu-accent-rgb)/0.18)] hover:text-[color:var(--nodu-text)]'
            }`}
          >
            {item.label}
          </button>
        ))}
        <span className="text-[11px] font-medium text-[color:var(--nodu-text-soft)]">
          {eventCount} akci
        </span>
      </div>
    )}
  </>;
}
