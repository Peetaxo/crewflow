import React, { useState } from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppContext } from '../../context/AppContext';
import { getDatesBetween } from '../../utils';
import { TimelogType } from '../../types';

/** Modal pro úpravu / vytvoření akce */
const EventEditModal = () => {
  const {
    editingEvent, setEditingEvent, handleSaveEvent,
    projects, clients, events,
  } = useAppContext();

  /* Řízený stav pro date range inputy (nahrazuje document.getElementById) */
  const [rangeFrom, setRangeFrom] = useState<Record<string, string>>({});
  const [rangeTo, setRangeTo] = useState<Record<string, string>>({});

  if (!editingEvent) return null;

  const phases = [
    { id: 'I', type: 'instal' as const, color: 'bg-blue-500 border-blue-600', label: 'Instalace' },
    { id: 'P', type: 'provoz' as const, color: 'bg-emerald-500 border-emerald-600', label: 'Provoz' },
    { id: 'D', type: 'deinstal' as const, color: 'bg-orange-500 border-orange-600', label: 'Deinstalace' },
  ];

  return (
    <AnimatePresence>
      {editingEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]"
          >
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Upravit akci</h3>
              <button onClick={() => setEditingEvent(null)} className="p-1 hover:bg-gray-100 rounded-full text-gray-400">
                <X size={20} />
              </button>
            </div>

            <div className="p-5 overflow-y-auto flex-1 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Job Number</label>
                  <select
                    value={editingEvent.job}
                    onChange={(e) => {
                      const p = projects.find(proj => proj.id === e.target.value);
                      setEditingEvent({ ...editingEvent, job: e.target.value, client: p?.client || editingEvent.client });
                    }}
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
                  >
                    <option value="">Vyberte Job Number</option>
                    {projects.map(p => {
                      const isTaken = events.some(e => e.job === p.id && e.id !== editingEvent.id);
                      return (
                        <option key={p.id} value={p.id} disabled={isTaken}>
                          {p.id} - {p.name} {isTaken ? '(Již obsazeno)' : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Název akce</label>
                  <input
                    type="text"
                    value={editingEvent.name}
                    onChange={(e) => setEditingEvent({ ...editingEvent, name: e.target.value })}
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Klient / Firma</label>
                  <select
                    value={editingEvent.client}
                    onChange={(e) => setEditingEvent({ ...editingEvent, client: e.target.value })}
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
                  >
                    <option value="">Vyberte klienta</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Město</label>
                  <input
                    type="text"
                    value={editingEvent.city}
                    onChange={(e) => setEditingEvent({ ...editingEvent, city: e.target.value })}
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Datum začátku</label>
                  <input
                    type="date"
                    value={editingEvent.startDate}
                    onChange={(e) => setEditingEvent({ ...editingEvent, startDate: e.target.value })}
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Datum konce</label>
                  <input
                    type="date"
                    value={editingEvent.endDate}
                    onChange={(e) => setEditingEvent({ ...editingEvent, endDate: e.target.value })}
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>

              {/* Popis, kontakt, dresscode, sraz */}
              <div>
                <label className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Popis akce</label>
                <textarea
                  value={editingEvent.description || ''}
                  onChange={(e) => setEditingEvent({ ...editingEvent, description: e.target.value })}
                  className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm h-16 resize-none"
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Kontaktní osoba</label>
                  <input
                    type="text"
                    value={editingEvent.contactPerson || ''}
                    onChange={(e) => setEditingEvent({ ...editingEvent, contactPerson: e.target.value })}
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Dresscode</label>
                  <input
                    type="text"
                    value={editingEvent.dresscode || ''}
                    onChange={(e) => setEditingEvent({ ...editingEvent, dresscode: e.target.value })}
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Místo srazu</label>
                  <input
                    type="text"
                    value={editingEvent.meetingLocation || ''}
                    onChange={(e) => setEditingEvent({ ...editingEvent, meetingLocation: e.target.value })}
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Potřeba crew</label>
                  <input
                    type="number"
                    value={editingEvent.needed}
                    onChange={(e) => setEditingEvent({ ...editingEvent, needed: Number(e.target.value) })}
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>

              {/* Typy dnů (I-P-D) */}
              <div className="flex items-center gap-2 bg-gray-50 p-3 rounded-xl border border-gray-100">
                <input
                  type="checkbox"
                  id="showDayTypes"
                  checked={editingEvent.showDayTypes || false}
                  onChange={(e) => setEditingEvent({ ...editingEvent, showDayTypes: e.target.checked })}
                  className="w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500"
                />
                <label htmlFor="showDayTypes" className="text-xs font-bold text-gray-700 cursor-pointer select-none">
                  Zobrazovat typy dnů (I-P-D) na akci
                </label>
              </div>

              {editingEvent.showDayTypes && editingEvent.startDate && editingEvent.endDate && (
                <div className="space-y-4 p-4 bg-gray-50 rounded-xl border border-gray-100">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">Nastavení typů dnů (I-P-D)</h4>
                    <button
                      type="button"
                      onClick={() => setEditingEvent({ ...editingEvent, dayTypes: {} })}
                      className="text-[9px] text-red-500 hover:text-red-600 font-bold uppercase"
                    >
                      Vymazat vše
                    </button>
                  </div>

                  {phases.map(phase => (
                    <div key={phase.id} className="bg-white p-3 rounded-lg border border-gray-200 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`w-5 h-5 rounded flex items-center justify-center text-[9px] font-black text-white shadow-sm ${phase.color}`}>
                            {phase.id}
                          </div>
                          <span className="text-xs font-bold text-gray-700">{phase.label}</span>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const newDayTypes = { ...(editingEvent.dayTypes || {}) };
                              getDatesBetween(editingEvent.startDate, editingEvent.endDate).forEach(d => {
                                newDayTypes[d] = phase.type as TimelogType;
                              });
                              setEditingEvent({ ...editingEvent, dayTypes: newDayTypes });
                            }}
                            className="text-[9px] text-emerald-600 hover:text-emerald-700 font-bold uppercase"
                          >
                            Všechny dny
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const newDayTypes = { ...(editingEvent.dayTypes || {}) };
                              Object.keys(newDayTypes).forEach(d => {
                                if (newDayTypes[d] === phase.type) delete newDayTypes[d];
                              });
                              setEditingEvent({ ...editingEvent, dayTypes: newDayTypes });
                            }}
                            className="text-[9px] text-gray-400 hover:text-gray-500 font-bold uppercase"
                          >
                            Zrušit
                          </button>
                        </div>
                      </div>

                      {/* Řízené date range inputy (oprava document.getElementById anti-patternu) */}
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <label className="block text-[9px] text-gray-400 uppercase mb-1">Od</label>
                          <input
                            type="date"
                            min={editingEvent.startDate}
                            max={editingEvent.endDate}
                            value={rangeFrom[phase.id] || ''}
                            onChange={(e) => setRangeFrom(prev => ({ ...prev, [phase.id]: e.target.value }))}
                            className="w-full bg-gray-50 border border-gray-200 rounded px-2 py-1 text-[10px]"
                          />
                        </div>
                        <div className="flex-1">
                          <label className="block text-[9px] text-gray-400 uppercase mb-1">Do</label>
                          <input
                            type="date"
                            min={editingEvent.startDate}
                            max={editingEvent.endDate}
                            value={rangeTo[phase.id] || ''}
                            onChange={(e) => setRangeTo(prev => ({ ...prev, [phase.id]: e.target.value }))}
                            className="w-full bg-gray-50 border border-gray-200 rounded px-2 py-1 text-[10px]"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const from = rangeFrom[phase.id];
                            const to = rangeTo[phase.id];
                            if (!from || !to) return;
                            const newDayTypes = { ...(editingEvent.dayTypes || {}) };
                            getDatesBetween(from, to).forEach(d => {
                              newDayTypes[d] = phase.type as TimelogType;
                            });
                            setEditingEvent({ ...editingEvent, dayTypes: newDayTypes });
                          }}
                          className="mt-4 px-2 py-1 bg-gray-100 rounded text-[9px] font-bold uppercase hover:bg-gray-200"
                        >
                          Použít
                        </button>
                      </div>

                      {/* Vizualizace dnů */}
                      {editingEvent.startDate && editingEvent.endDate && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {getDatesBetween(editingEvent.startDate, editingEvent.endDate).map(d => {
                            const isThisPhase = editingEvent.dayTypes?.[d] === phase.type;
                            return (
                              <button
                                key={d}
                                type="button"
                                onClick={() => {
                                  const newDayTypes = { ...(editingEvent.dayTypes || {}) };
                                  if (isThisPhase) {
                                    delete newDayTypes[d];
                                  } else {
                                    newDayTypes[d] = phase.type as TimelogType;
                                  }
                                  setEditingEvent({ ...editingEvent, dayTypes: newDayTypes });
                                }}
                                className={`w-8 h-8 rounded flex items-center justify-center text-[9px] font-bold border transition-all ${
                                  isThisPhase
                                    ? `${phase.color} text-white shadow-sm`
                                    : 'bg-gray-50 border-gray-200 text-gray-400 hover:border-gray-300'
                                }`}
                                title={`${new Date(d).toLocaleDateString('cs-CZ')} — ${isThisPhase ? phase.label : 'Nenastaveno'}`}
                              >
                                {new Date(d).getDate()}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-gray-100 bg-gray-50 flex gap-3">
              <button
                onClick={() => setEditingEvent(null)}
                className="flex-1 py-2.5 border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-white transition-all"
              >
                Zrušit
              </button>
              <button
                onClick={() => handleSaveEvent(editingEvent)}
                className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 shadow-lg shadow-emerald-200 transition-all"
              >
                Uložit akci
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default EventEditModal;
