import React from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppContext } from '../../context/AppContext';
import { calculateTotalHours, calculateDayHours, formatCurrency } from '../../utils';
import { KM_RATE } from '../../data';
import StatusBadge from '../shared/StatusBadge';

/** Modal pro úpravu výkazu (timelogu) */
const TimelogEditModal = () => {
  const {
    editingTimelog, setEditingTimelog, handleSaveTimelog,
    findContractor, findEvent,
  } = useAppContext();

  if (!editingTimelog) return null;

  const contractor = findContractor(editingTimelog.cid);
  const event = findEvent(editingTimelog.eid);
  if (!contractor || !event) return null;

  const totalHours = calculateTotalHours(editingTimelog.days);

  return (
    <AnimatePresence>
      {editingTimelog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
          >
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">Upravit výkaz</h3>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">
                  {contractor.name} · {event.name}
                </p>
              </div>
              <button onClick={() => setEditingTimelog(null)} className="p-1 hover:bg-gray-100 rounded-full text-gray-400">
                <X size={20} />
              </button>
            </div>

            <div className="p-5 overflow-y-auto flex-1 space-y-4">
              {/* Souhrn */}
              <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
                <div className="flex justify-between items-center">
                  <div className="text-xs text-emerald-600">Celkem hodin</div>
                  <div className="text-xl font-bold text-emerald-900">{totalHours.toFixed(1)}h</div>
                </div>
                <div className="flex justify-between items-center mt-1">
                  <div className="text-xs text-emerald-600">Odměna</div>
                  <div className="text-sm font-semibold text-emerald-800">
                    {formatCurrency(totalHours * contractor.rate)}
                  </div>
                </div>
                {editingTimelog.km > 0 && (
                  <div className="flex justify-between items-center mt-1">
                    <div className="text-xs text-emerald-600">Cestovné</div>
                    <div className="text-sm font-semibold text-emerald-800">
                      {formatCurrency(editingTimelog.km * KM_RATE)}
                    </div>
                  </div>
                )}
              </div>

              {/* Dny */}
              <div>
                <label className="block text-[10px] text-gray-500 uppercase tracking-wider mb-2">Dny</label>
                <div className="space-y-2">
                  {editingTimelog.days.map((day, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-gray-50 rounded-lg p-2.5">
                      <input
                        type="date"
                        value={day.d}
                        onChange={(e) => {
                          const newDays = [...editingTimelog.days];
                          const newDate = e.target.value;
                          newDays[idx] = { ...newDays[idx], d: newDate };
                          if (event.showDayTypes && event.dayTypes && event.dayTypes[newDate]) {
                            newDays[idx].type = event.dayTypes[newDate];
                          }
                          setEditingTimelog({ ...editingTimelog, days: newDays });
                        }}
                        className="bg-white border border-gray-200 rounded px-2 py-1 text-xs flex-1"
                      />
                      <input
                        type="time"
                        value={day.f}
                        onChange={(e) => {
                          const newDays = [...editingTimelog.days];
                          newDays[idx] = { ...newDays[idx], f: e.target.value };
                          setEditingTimelog({ ...editingTimelog, days: newDays });
                        }}
                        className="bg-white border border-gray-200 rounded px-2 py-1 text-xs w-20"
                      />
                      <span className="text-gray-400 text-xs">–</span>
                      <input
                        type="time"
                        value={day.t}
                        onChange={(e) => {
                          const newDays = [...editingTimelog.days];
                          newDays[idx] = { ...newDays[idx], t: e.target.value };
                          setEditingTimelog({ ...editingTimelog, days: newDays });
                        }}
                        className="bg-white border border-gray-200 rounded px-2 py-1 text-xs w-20"
                      />
                      <select
                        value={day.type}
                        onChange={(e) => {
                          const newDays = [...editingTimelog.days];
                          newDays[idx] = { ...newDays[idx], type: e.target.value as any };
                          setEditingTimelog({ ...editingTimelog, days: newDays });
                        }}
                        className="bg-white border border-gray-200 rounded px-1 py-1 text-[10px] w-20"
                      >
                        <option value="instal">Instal</option>
                        <option value="provoz">Provoz</option>
                        <option value="deinstal">Deinstal</option>
                      </select>
                      <button
                        onClick={() => {
                          const newDays = editingTimelog.days.filter((_, i) => i !== idx);
                          setEditingTimelog({ ...editingTimelog, days: newDays });
                        }}
                        className="p-1 text-gray-400 hover:text-red-500"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => {
                      let nextDate = event.startDate;
                      if (editingTimelog.days.length > 0) {
                        const lastDate = new Date(editingTimelog.days[editingTimelog.days.length - 1].d);
                        lastDate.setDate(lastDate.getDate() + 1);
                        nextDate = lastDate.toISOString().split('T')[0];
                      }
                      const defaultType = event.showDayTypes
                        ? ((event.dayTypes && event.dayTypes[nextDate]) || 'provoz')
                        : 'instal';
                      setEditingTimelog({
                        ...editingTimelog,
                        days: [...editingTimelog.days, { d: nextDate, f: '08:00', t: '17:00', type: defaultType }],
                      });
                    }}
                    className="w-full py-2 border border-dashed border-gray-300 rounded-lg text-xs text-gray-500 hover:bg-gray-50 flex items-center justify-center gap-1"
                  >
                    <Plus size={14} /> Přidat den
                  </button>
                </div>
              </div>

              {/* Cestovné */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Cestovné (km)</label>
                  <input
                    type="number"
                    value={editingTimelog.km}
                    onChange={(e) => setEditingTimelog({ ...editingTimelog, km: Number(e.target.value) })}
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>

              {/* Poznámka */}
              <div>
                <label className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Poznámka</label>
                <textarea
                  value={editingTimelog.note}
                  onChange={(e) => setEditingTimelog({ ...editingTimelog, note: e.target.value })}
                  className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm h-20 resize-none"
                  placeholder="Doplňte detaily..."
                />
              </div>
            </div>

            <div className="p-4 border-t border-gray-100 bg-gray-50 flex gap-3">
              <button
                onClick={() => setEditingTimelog(null)}
                className="flex-1 py-2 border border-gray-200 rounded-xl text-sm font-medium hover:bg-white"
              >
                Zrušit
              </button>
              <button
                onClick={() => handleSaveTimelog(editingTimelog)}
                className="flex-1 py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 shadow-sm shadow-emerald-200"
              >
                Uložit změny
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default TimelogEditModal;
