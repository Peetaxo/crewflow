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
      className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow"
    >
      <div className="flex justify-between items-start mb-3">
        <div>
          <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">{project.id}</div>
          <h3 className="text-sm font-bold text-gray-900 mt-0.5">{event.name}</h3>
          <p className="text-[11px] text-gray-500">{project.client}</p>
        </div>
        <StatusBadge status={timelog.status} />
      </div>

      <div className="space-y-2 mt-3">
        {timelog.days.map((day, idx) => (
          <div key={idx} className="flex items-center justify-between text-xs p-2 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-2">
              <Calendar size={12} className="text-gray-400" />
              <span className="font-medium">{formatShortDate(day.d)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock size={12} className="text-gray-400" />
              <span>{day.f} - {day.t}</span>
              <span className="text-[10px] px-1.5 py-0.5 bg-white border border-gray-200 rounded text-gray-500 uppercase font-bold">
                {day.type}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-between items-center mt-4 pt-3 border-t border-gray-50">
        <div className="text-[10px] text-gray-400 uppercase font-bold">Celkem</div>
        <div className="text-xs font-bold text-gray-900">{calculateTotalHours(timelog.days).toFixed(1)} h</div>
      </div>
    </motion.div>
  );
};

export default ShiftCard;
