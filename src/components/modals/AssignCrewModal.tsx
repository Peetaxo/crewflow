import React from 'react';
import { X, Plus, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppContext } from '../../context/AppContext';
import { Timelog } from '../../types';

/** Modal pro obsazení crew na akci */
const AssignCrewModal = () => {
  const {
    assigningCrewToEvent, setAssigningCrewToEvent,
    filteredContractors, timelogs, setTimelogs,
    searchQuery, setSearchQuery, eventTab,
  } = useAppContext();

  if (!assigningCrewToEvent) return null;

  return (
    <AnimatePresence>
      {assigningCrewToEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[80vh]"
          >
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">Obsadit Crew</h3>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">
                  {assigningCrewToEvent.name} · {assigningCrewToEvent.job}
                </p>
              </div>
              <button onClick={() => setAssigningCrewToEvent(null)} className="p-1 hover:bg-gray-100 rounded-full text-gray-400">
                <X size={20} />
              </button>
            </div>

            <div className="p-4 bg-gray-50 border-b border-gray-100">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                <input
                  type="text"
                  placeholder="Hledat v crew..."
                  className="w-full bg-white border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
                  onChange={(e) => setSearchQuery(e.target.value)}
                  value={searchQuery}
                />
              </div>
            </div>

            <div className="overflow-y-auto flex-1 p-2 space-y-1">
              {filteredContractors.map(c => {
                const isAlreadyAssigned = timelogs.some(t => t.eid === assigningCrewToEvent.id && t.cid === c.id);
                return (
                  <button
                    key={c.id}
                    disabled={isAlreadyAssigned}
                    onClick={() => {
                      const initialDays: Timelog['days'] = [];
                      if (eventTab !== 'overview') {
                        const defaultType = assigningCrewToEvent.showDayTypes
                          ? ((assigningCrewToEvent.dayTypes && assigningCrewToEvent.dayTypes[eventTab]) || 'provoz')
                          : 'instal';
                        initialDays.push({ d: eventTab, f: '08:00', t: '17:00', type: defaultType });
                      } else if (assigningCrewToEvent.showDayTypes && assigningCrewToEvent.dayTypes) {
                        Object.entries(assigningCrewToEvent.dayTypes).forEach(([date, type]) => {
                          initialDays.push({ d: date, f: '08:00', t: '17:00', type });
                        });
                        initialDays.sort((a, b) => a.d.localeCompare(b.d));
                      } else if (!assigningCrewToEvent.showDayTypes) {
                        initialDays.push({ d: assigningCrewToEvent.startDate, f: '08:00', t: '17:00', type: 'instal' });
                      }

                      const newTimelog: Timelog = {
                        id: Math.max(0, ...timelogs.map(t => t.id)) + 1,
                        eid: assigningCrewToEvent.id,
                        cid: c.id,
                        days: initialDays,
                        km: 0,
                        note: '',
                        status: 'draft',
                      };
                      setTimelogs(prev => [...prev, newTimelog]);
                    }}
                    className={`w-full flex items-center gap-3 p-2 rounded-xl transition-all text-left ${
                      isAlreadyAssigned ? 'opacity-50 cursor-not-allowed bg-gray-50' : 'hover:bg-emerald-50 group'
                    }`}
                  >
                    <div className="av w-9 h-9 text-[10px]" style={{ backgroundColor: c.bg, color: c.fg }}>{c.ii}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-gray-900 truncate">{c.name}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-gray-500">{c.city}</span>
                        <div className="flex gap-1">
                          {c.tags.slice(0, 2).map(t => (
                            <span key={t} className="px-1 py-0.5 bg-gray-100 text-gray-500 rounded-[4px] text-[8px] uppercase font-bold">{t}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                    {!isAlreadyAssigned ? (
                      <div className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white group-hover:border-emerald-600 transition-all">
                        <Plus size={16} />
                      </div>
                    ) : (
                      <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Přiřazen</div>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="p-4 border-t border-gray-100 bg-gray-50">
              <button
                onClick={() => setAssigningCrewToEvent(null)}
                className="w-full py-2.5 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-800 shadow-lg shadow-gray-200 transition-all"
              >
                Hotovo
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default AssignCrewModal;
