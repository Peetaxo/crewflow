import { format, parseISO } from 'date-fns';
import { cs } from 'date-fns/locale';
import type { TimelogType } from '../../../types';
import type { EventFormDay, EventFormPhase, EventFormPlan } from '../services/event-form-state';

interface EventDayPlannerProps {
  dates: string[];
  plan: EventFormPlan;
  onChange: (plan: EventFormPlan) => void;
}

const newPhase = (type: TimelogType): EventFormPhase => ({
  id: crypto.randomUUID(), type, from: '', to: '', showTimes: false,
});

export default function EventDayPlanner({ dates, plan, onChange }: EventDayPlannerProps) {
  const hasPreparation = Object.values(plan).some((day) => day.phases.some((phase) => phase.type === 'pripravy'));
  const updateDay = (date: string, day: EventFormDay) => onChange({ ...plan, [date]: day });

  return <div className="event-day-planner">
    {[...dates].sort().map((date) => {
      const day = plan[date] ?? { free: false, phases: [] };
      const dateLabel = format(parseISO(date), 'EEEE d. M. yyyy', { locale: cs });
      const rows = day.free || day.phases.length === 0 ? [null] : day.phases;
      const patchPhase = (index: number, patch: Partial<EventFormPhase>) => updateDay(date, {
        ...day, phases: day.phases.map((phase, i) => i === index ? { ...phase, ...patch } : phase),
      });
      return <section key={date} role="group" aria-label={dateLabel} className="event-day-planner-day">
        <h4>{dateLabel}</h4>
        {rows.map((phase, index) => <div key={phase?.id ?? 'day'} className="event-day-planner-phase" role="region" aria-label={`Fáze ${index + 1} – ${dateLabel}`}>
          <label htmlFor={`phase-${date}-${index}`} className="event-form-label">{index === 0 ? 'Fáze dne' : `Fáze ${index + 1}`}</label>
          <div className="event-form-inline">
            <select id={`phase-${date}-${index}`} value={day.free ? 'free' : phase?.type ?? ''} onChange={(e) => {
              const value = e.target.value;
              if (value === 'free') updateDay(date, { ...day, free: true });
              else if (!value) updateDay(date, { free: false, phases: day.free ? [] : day.phases.filter((_, i) => i !== index) });
              else if (day.free) updateDay(date, {
                free: false,
                phases: day.phases.length ? day.phases.map((item, i) => i === 0 ? { ...item, type: value as TimelogType } : item) : [newPhase(value as TimelogType)],
              });
              else if (phase) patchPhase(index, { type: value as TimelogType });
              else updateDay(date, { free: false, phases: [newPhase(value as TimelogType)] });
            }}>
              <option value="">Zatím neurčeno</option>
              {hasPreparation && <option value="pripravy">Přípravy</option>}
              <option value="instal">Instalace</option>
              <option value="provoz">Provoz</option>
              <option value="deinstal">Deinstalace</option>
              {index === 0 && <option value="free">Volný den</option>}
            </select>
            {phase && !day.free && <button type="button" className="event-form-secondary" aria-label={`Odebrat fázi ${index + 1}`} onClick={() => updateDay(date, { ...day, phases: day.phases.filter((_, i) => i !== index) })}>Odebrat</button>}
          </div>
          {phase && !day.free && (phase.showTimes ? <>
            <div className="event-form-grid">
              <label className="event-form-label">Od<input type="time" value={phase.from} onChange={(e) => patchPhase(index, { from: e.target.value })} /></label>
              <label className="event-form-label">Do<input type="time" value={phase.to} onChange={(e) => patchPhase(index, { to: e.target.value })} /></label>
            </div>
            {phase.from && phase.to && phase.to < phase.from && <p className="event-form-hint">Konec následující den</p>}
          </> : <button type="button" className="event-form-text-button" onClick={() => patchPhase(index, { showTimes: true })}>Doplnit časy</button>)}
        </div>)}
        {!day.free && day.phases.length > 0 && <button type="button" className="event-form-text-button" onClick={() => updateDay(date, { ...day, phases: [...day.phases, newPhase('instal')] })}>Přidat další fázi</button>}
      </section>;
    })}
  </div>;
}
