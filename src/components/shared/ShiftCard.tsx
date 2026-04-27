import React from 'react';
import { Calendar, Clock } from 'lucide-react';
import { motion } from 'framer-motion';
import { Timelog, Event, Project } from '../../types';
import { formatShortDate, calculateTotalHours } from '../../utils';
import StatusBadge from './StatusBadge';

interface ShiftCardProps {
  timelog: Timelog;
  event: Event;
  project: Project;
}

/** Karta směny — používá se v MyShifts i CrewDetail */
const ShiftCard = ({ timelog, event, project }: ShiftCardProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-[24px] border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.98)] p-4 shadow-[0_18px_42px_rgba(47,38,31,0.08)] transition-shadow hover:shadow-[0_22px_48px_rgba(47,38,31,0.12)]"
    >
      <div className="flex justify-between items-start mb-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--nodu-accent)]">{project.id}</div>
          <h3 className="mt-0.5 text-sm font-bold text-[color:var(--nodu-text)]">{event.name}</h3>
          <p className="text-[11px] text-[color:var(--nodu-text-soft)]">{project.client}</p>
        </div>
        <StatusBadge status={timelog.status} />
      </div>

      <div className="space-y-2 mt-3">
        {timelog.days.map((day, idx) => (
          <div key={idx} className="flex items-center justify-between rounded-lg bg-[color:rgb(var(--nodu-text-rgb)/0.04)] p-2 text-xs">
            <div className="flex items-center gap-2">
              <Calendar size={12} className="text-[color:var(--nodu-text-soft)]" />
              <span className="font-medium text-[color:var(--nodu-text)]">{formatShortDate(day.d)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock size={12} className="text-[color:var(--nodu-text-soft)]" />
              <span className="text-[color:var(--nodu-text)]">{day.f} - {day.t}</span>
              <span className="rounded border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.98)] px-1.5 py-0.5 text-[10px] font-bold uppercase text-[color:var(--nodu-text-soft)]">
                {day.type}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-[color:rgb(var(--nodu-text-rgb)/0.08)] pt-3">
        <div className="text-[10px] font-bold uppercase text-[color:var(--nodu-text-soft)]">Celkem</div>
        <div className="text-xs font-bold text-[color:var(--nodu-text)]">{calculateTotalHours(timelog.days).toFixed(1)} h</div>
      </div>
    </motion.div>
  );
};

export default ShiftCard;
