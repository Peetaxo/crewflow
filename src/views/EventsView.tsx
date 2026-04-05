import React from 'react';
import { Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAppContext } from '../context/AppContext';
import { calculateTotalHours, formatDateRange, getDatesBetween } from '../utils';
import StatusBadge from '../components/shared/StatusBadge';
import EventDetailView from './EventDetailView';

const EventsView = () => {
  const {
    role,
    selectedEventId, setSelectedEventId,
    filteredEvents, timelogs,
    setEditingEvent, setAssigningCrewToEvent, setDeleteConfirm,
    setEventTab, events,
  } = useAppContext();

  const canManageEvents = role !== 'crew';

  if (selectedEventId) {
    return <EventDetailView />;
  }

  const groupedEvents = filteredEvents.reduce((acc, e) => {
    const date = e.startDate;
    if (!acc[date]) acc[date] = [];
    acc[date].push(e);
    return acc;
  }, {} as Record<string, typeof filteredEvents>);

  const sortedDates = Object.keys(groupedEvents).sort();

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="flex justify-between items-center mb-5">
        <h1 className="text-lg font-semibold">Akce</h1>
        {canManageEvents && (
          <button
            onClick={() => setEditingEvent({
              id: Math.max(0, ...events.map((e) => e.id)) + 1,
              name: '', job: '', startDate: '', endDate: '', startTime: '08:00', endTime: '17:00', city: '',
              needed: 1, filled: 0, status: 'planning', client: '', showDayTypes: false,
            })}
            className="px-3 py-1.5 bg-emerald-600 text-white rounded-md text-xs font-medium hover:bg-emerald-700 transition-colors"
          >
            + Nova akce
          </button>
        )}
      </div>

      <div className="space-y-6">
        {sortedDates.map((date) => (
          <div key={date} className="space-y-3">
            <div className="flex items-center gap-4 py-4">
              <div className="h-px flex-1 bg-gray-200"></div>
              <span className="text-[11px] font-bold text-gray-500 uppercase tracking-[0.15em]">
                {new Date(date).toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'long' })}
              </span>
              <div className="h-px flex-1 bg-gray-200"></div>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {groupedEvents[date].map((e) => {
                const eventTimelogs = timelogs.filter((t) => t.eid === e.id);
                const totalHours = eventTimelogs.reduce((s, t) => s + calculateTotalHours(t.days), 0);
                const daysCount = getDatesBetween(e.startDate, e.endDate).length;

                return (
                  <div key={e.id} className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow relative group">
                    {canManageEvents && (
                      <button
                        onClick={() => setDeleteConfirm({ type: 'event', id: e.id, name: e.name })}
                        className="absolute top-4 right-4 p-1.5 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                        title="Smazat akci"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                    <div className="p-4 border-b border-gray-50">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="jn text-[13px] font-semibold px-2 py-0.5">{e.job}</span>
                        <StatusBadge status={e.status} />
                      </div>
                      <h3 className="text-base font-semibold text-gray-900">{e.name}</h3>
                      <div className="text-xs text-gray-500 mt-1 flex items-center gap-1.5">
                        {formatDateRange(e.startDate, e.endDate)} · {e.city} · {e.client}
                        {daysCount > 1 && (
                          <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-[9px] font-bold uppercase tracking-tighter">
                            {daysCount} dny
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="px-4 py-3 flex items-center gap-5">
                      <div>
                        <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Crew obsazeni</div>
                        <div className="flex items-center gap-2">
                          <div className="w-20 bg-gray-100 rounded-full h-1 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${e.filled >= e.needed ? 'bg-emerald-500' : 'bg-amber-500'}`}
                              style={{ width: `${Math.min(100, Math.round(e.filled / e.needed * 100))}%` }}
                            />
                          </div>
                          <span className="text-xs font-semibold">{e.filled}/{e.needed}</span>
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Timelogy</div>
                        <div className="text-xs font-semibold">{eventTimelogs.length} zaz. · {totalHours.toFixed(1)}h</div>
                      </div>
                      <div className="ml-auto flex gap-2">
                        {canManageEvents && (
                          <button
                            onClick={() => setAssigningCrewToEvent(e)}
                            className="px-3 py-1 border border-gray-200 rounded-md text-[11px] hover:bg-gray-50"
                          >
                            Obsadit crew →
                          </button>
                        )}
                        <button
                          onClick={() => { setSelectedEventId(e.id); setEventTab('overview'); }}
                          className="px-3 py-1 border border-gray-200 rounded-md text-[11px] hover:bg-gray-50"
                        >
                          Detail
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
};

export default EventsView;
