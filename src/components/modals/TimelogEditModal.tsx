import React from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import { useAppContext } from '../../context/useAppContext';
import { KM_RATE } from '../../data';
import { calculateTotalHours, formatCurrency } from '../../utils';
import { getTimelogDependencies, saveTimelog } from '../../features/timelogs/services/timelogs.service';

const TimelogEditModal = () => {
  const {
    editingTimelog,
    setEditingTimelog,
  } = useAppContext();

  if (!editingTimelog) return null;

  const { contractors, events } = getTimelogDependencies();
  const contractor = contractors.find((item) => item.profileId === editingTimelog.contractorProfileId)
    ?? null;
  const event = events.find((item) => item.id === editingTimelog.eid) ?? null;
  if (!contractor || !event) return null;

  const totalHours = calculateTotalHours(editingTimelog.days);
  const resolveExpectedDay = (day: typeof editingTimelog.days[number]) => {
    if (!event.showDayTypes) {
      return {
        type: 'instal',
        f: event.startTime || day.f,
        t: event.endTime || day.t,
      };
    }

    const matchingSlot = event.phaseSchedules?.[day.type]?.find((slot) => slot.dates.includes(day.d));
    const fallbackType = event.dayTypes?.[day.d] || day.type;
    const fallbackSlot = event.phaseSchedules?.[fallbackType]?.find((slot) => slot.dates.includes(day.d));

    return {
      type: matchingSlot ? day.type : fallbackType,
      f: matchingSlot?.from ?? fallbackSlot?.from ?? event.phaseTimes?.[fallbackType]?.from ?? event.startTime ?? day.f,
      t: matchingSlot?.to ?? fallbackSlot?.to ?? event.phaseTimes?.[fallbackType]?.to ?? event.endTime ?? day.t,
    };
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        >
          <div className="flex items-center justify-between border-b border-gray-100 p-4">
            <div>
              <h3 className="font-semibold text-gray-900">Upravit výkaz</h3>
              <p className="mt-0.5 text-[10px] uppercase tracking-wider text-gray-500">
                {contractor.name} · {event.name}
              </p>
            </div>
            <button onClick={() => setEditingTimelog(null)} className="rounded-full p-1 text-gray-400 hover:bg-gray-100">
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
              <div className="flex items-center justify-between">
                <div className="text-xs text-emerald-600">Celkem hodin</div>
                <div className="text-xl font-bold text-emerald-900">{totalHours.toFixed(1)}h</div>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <div className="text-xs text-emerald-600">Odměna</div>
                <div className="text-sm font-semibold text-emerald-800">
                  {formatCurrency(totalHours * contractor.rate)}
                </div>
              </div>
              {editingTimelog.km > 0 && (
                <div className="mt-1 flex items-center justify-between">
                  <div className="text-xs text-emerald-600">Cestovné</div>
                  <div className="text-sm font-semibold text-emerald-800">
                    {formatCurrency(editingTimelog.km * KM_RATE)}
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="mb-2 block text-[10px] uppercase tracking-wider text-gray-500">Dny</label>
              <div className="space-y-2">
                {editingTimelog.days.map((day, idx) => {
                  const expectedDay = resolveExpectedDay(day);
                  const isDifferent =
                    day.type !== expectedDay.type
                    || day.f !== expectedDay.f
                    || day.t !== expectedDay.t;

                  return (
                    <div
                      key={`${day.d}-${idx}`}
                      className={`flex items-center gap-2 rounded-lg border p-2.5 ${
                        isDifferent
                          ? 'border-amber-200 bg-amber-50'
                          : 'border-transparent bg-gray-50'
                      }`}
                    >
                      <input
                        type="date"
                        value={day.d}
                        onChange={(e) => {
                          const newDays = [...editingTimelog.days];
                          newDays[idx] = { ...newDays[idx], d: e.target.value };
                          setEditingTimelog({ ...editingTimelog, days: newDays });
                        }}
                        className="flex-1 rounded border border-gray-200 bg-white px-2 py-1 text-xs"
                      />
                      <input
                        type="time"
                        value={day.f}
                        onChange={(e) => {
                          const newDays = [...editingTimelog.days];
                          newDays[idx] = { ...newDays[idx], f: e.target.value };
                          setEditingTimelog({ ...editingTimelog, days: newDays });
                        }}
                        className="w-20 rounded border border-gray-200 bg-white px-2 py-1 text-xs"
                      />
                      <span className="text-xs text-gray-400">-</span>
                      <input
                        type="time"
                        value={day.t}
                        onChange={(e) => {
                          const newDays = [...editingTimelog.days];
                          newDays[idx] = { ...newDays[idx], t: e.target.value };
                          setEditingTimelog({ ...editingTimelog, days: newDays });
                        }}
                        className="w-20 rounded border border-gray-200 bg-white px-2 py-1 text-xs"
                      />
                      <select
                        value={day.type}
                        onChange={(e) => {
                          const newDays = [...editingTimelog.days];
                          newDays[idx] = { ...newDays[idx], type: e.target.value as typeof day.type };
                          setEditingTimelog({ ...editingTimelog, days: newDays });
                        }}
                        className="w-24 rounded border border-gray-200 bg-white px-1 py-1 text-[10px]"
                      >
                        <option value="instal">Instal</option>
                        <option value="provoz">Provoz</option>
                        <option value="deinstal">Deinstal</option>
                      </select>
                      <button
                        onClick={() => {
                          const newDays = editingTimelog.days.filter((_, dayIndex) => dayIndex !== idx);
                          setEditingTimelog({ ...editingTimelog, days: newDays });
                        }}
                        className="p-1 text-gray-400 hover:text-red-500"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })}
                <button
                  onClick={() => {
                    const nextDate = editingTimelog.days.length > 0
                      ? editingTimelog.days[editingTimelog.days.length - 1].d
                      : event.startDate;
                    const defaultType = !event.showDayTypes
                      ? 'instal'
                      : (event.dayTypes?.[nextDate] || 'provoz');
                    const matchingSlot = event.phaseSchedules?.[defaultType]?.find((slot) => slot.dates.includes(nextDate));

                    setEditingTimelog({
                      ...editingTimelog,
                      days: [
                        ...editingTimelog.days,
                        {
                          d: nextDate,
                          f: matchingSlot?.from || event.phaseTimes?.[defaultType]?.from || event.startTime || '08:00',
                          t: matchingSlot?.to || event.phaseTimes?.[defaultType]?.to || event.endTime || '17:00',
                          type: defaultType,
                        },
                      ],
                    });
                  }}
                  className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 py-2 text-xs text-gray-500 hover:bg-gray-50"
                >
                  <Plus size={14} /> Přidat den
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wider text-gray-500">Cestovné (km)</label>
                <input
                  type="number"
                  value={editingTimelog.km}
                  onChange={(e) => setEditingTimelog({ ...editingTimelog, km: Number(e.target.value) })}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wider text-gray-500">Poznámka</label>
              <textarea
                value={editingTimelog.note}
                onChange={(e) => setEditingTimelog({ ...editingTimelog, note: e.target.value })}
                className="h-20 w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                placeholder="Doplňte detaily..."
              />
            </div>
          </div>

          <div className="flex gap-3 border-t border-gray-100 bg-gray-50 p-4">
            <button
              onClick={() => setEditingTimelog(null)}
              className="flex-1 rounded-xl border border-gray-200 py-2 text-sm font-medium hover:bg-white"
            >
              Zrušit
            </button>
            <button
              onClick={async () => {
                try {
                  await saveTimelog(editingTimelog);
                  setEditingTimelog(null);
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : 'Nepodařilo se uložit výkaz.');
                }
              }}
              className="flex-1 rounded-xl bg-emerald-600 py-2 text-sm font-medium text-white shadow-sm shadow-emerald-200 hover:bg-emerald-700"
            >
              Uložit změny
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default TimelogEditModal;
