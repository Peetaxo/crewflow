import React from 'react';
import { ArrowLeft, Users, Clock, User, MapPin, Shirt, Trash2, FileText } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAppContext } from '../context/AppContext';
import { calculateTotalHours, calculateDayHours, formatCurrency, formatDateRange, getDatesBetween } from '../utils';
import { KM_RATE } from '../data';
import { PHASE_CONFIG } from '../constants';
import StatusBadge from '../components/shared/StatusBadge';

/** Detail jedné akce */
const EventDetailView = () => {
  const {
    selectedEventId, setSelectedEventId,
    events, timelogs, contractors, setTimelogs,
    findContractor, eventTab, setEventTab,
    setAssigningCrewToEvent, setEditingEvent, setDeleteConfirm,
    setEditingTimelog,
  } = useAppContext();

  const event = events.find(x => x.id === selectedEventId);
  if (!event) return null;

  const eventTimelogs = timelogs.filter(t => t.eid === event.id);
  const totalHours = eventTimelogs.reduce((s, t) => s + calculateTotalHours(t.days), 0);
  const days = getDatesBetween(event.startDate, event.endDate);
  const eventCrew = contractors.filter(c => eventTimelogs.some(t => t.cid === c.id));

  /** Odebrat osobu z akce — smaže její timelog pro tuto akci */
  const handleRemoveFromEvent = (contractorId: number) => {
    setTimelogs(prev => prev.filter(t => !(t.eid === event.id && t.cid === contractorId)));
  };

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
      <button onClick={() => setSelectedEventId(null)} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 mb-4 transition-colors">
        <ArrowLeft size={14} /> Zpět na Akce
      </button>

      <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="jn text-sm px-2 py-0.5">{event.job}</span>
              <StatusBadge status={event.status} />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">{event.name}</h1>
            <p className="text-sm text-gray-500 mt-1">{formatDateRange(event.startDate, event.endDate)} · {event.city} · {event.client}</p>
            {event.description && <p className="text-xs text-gray-600 mt-3 max-w-2xl leading-relaxed">{event.description}</p>}
            <div className="flex flex-wrap gap-x-6 gap-y-2 mt-4">
              {event.contactPerson && (
                <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                  <User size={12} className="text-gray-400" />
                  <span className="font-medium text-gray-700">Kontakt:</span> {event.contactPerson}
                </div>
              )}
              {event.meetingLocation && (
                <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                  <MapPin size={12} className="text-gray-400" />
                  <span className="font-medium text-gray-700">Sraz:</span> {event.meetingLocation}
                </div>
              )}
              {event.dresscode && (
                <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                  <Shirt size={12} className="text-gray-400" />
                  <span className="font-medium text-gray-700">Dresscode:</span> {event.dresscode}
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setAssigningCrewToEvent(event)} className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 shadow-sm shadow-emerald-200">
              Obsadit crew
            </button>
            <button onClick={() => setEditingEvent(event)} className="px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50">
              Upravit akci
            </button>
            <button onClick={() => setDeleteConfirm({ type: 'event', id: event.id, name: event.name })} className="px-4 py-2 border border-red-100 text-red-600 rounded-xl text-sm font-medium hover:bg-red-50 transition-colors" title="Smazat akci">
              <Trash2 size={18} />
            </button>
          </div>
        </div>

        {/* Záložky dnů */}
        <div className="flex gap-1 border-b border-gray-100 -mx-6 px-6">
          <button
            onClick={() => setEventTab('overview')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-all ${eventTab === 'overview' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            Přehled
          </button>
          {days.map(d => {
            const dayType = event.showDayTypes ? event.dayTypes?.[d] : null;
            const phase = dayType ? PHASE_CONFIG.find(p => p.type === dayType) : null;
            return (
              <button key={d} onClick={() => setEventTab(d)} className={`px-4 py-2 text-sm font-medium border-b-2 transition-all ${eventTab === d ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                <div className="flex flex-col items-center">
                  <span className="text-[10px] opacity-60 uppercase font-bold">{new Date(d).toLocaleDateString('cs-CZ', { weekday: 'short' })}</span>
                  <span className="text-xs font-bold">{new Date(d).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' })}</span>
                  {phase && (
                    <div title={phase.label} className={`mt-1 w-4 h-4 rounded flex items-center justify-center text-[8px] font-black border text-white shadow-sm ${phase.color}`}>
                      {phase.id}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-6">
          {eventTab === 'overview' ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                <div>
                  <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                    <Users size={16} className="text-gray-400" />
                    Přiřazená Crew ({eventCrew.length})
                  </h3>
                  <div className="bg-gray-50 rounded-xl overflow-hidden border border-gray-100">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="text-[10px] text-gray-400 uppercase tracking-wider border-b border-gray-100">
                          <th className="px-4 py-3 font-medium text-left">Jméno</th>
                          {event.showDayTypes && <th className="px-4 py-3 font-medium text-left">Fáze</th>}
                          <th className="px-4 py-3 font-medium text-left">Hodiny</th>
                          <th className="px-4 py-3 font-medium text-right">Celkem</th>
                          <th className="px-4 py-3 font-medium text-right">Akce</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {eventCrew.map(c => {
                          const tl = eventTimelogs.find(t => t.cid === c.id);
                          const hours = tl ? calculateTotalHours(tl.days) : 0;
                          return (
                            <tr key={c.id} className="bg-white hover:bg-gray-50 transition-colors">
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <div className="av w-7 h-7 text-[10px]" style={{ backgroundColor: c.bg, color: c.fg }}>{c.ii}</div>
                                  <span className="text-xs font-medium">{c.name}</span>
                                </div>
                              </td>
                              {event.showDayTypes && (
                                <td className="px-4 py-3">
                                  <div className="flex gap-1">
                                    {PHASE_CONFIG.map(phase => {
                                      const isActive = tl?.days.some(td => td.type === phase.type);
                                      return (
                                        <div key={phase.id} className={`w-5 h-5 rounded flex items-center justify-center text-[8px] font-black border transition-all ${isActive ? `${phase.color} text-white shadow-sm` : 'bg-gray-100 border-gray-200 text-gray-300'}`} title={phase.label}>
                                          {phase.id}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </td>
                              )}
                              <td className="px-4 py-3 text-xs font-semibold">{hours.toFixed(1)}h</td>
                              <td className="px-4 py-3 text-right text-xs font-bold text-gray-900">{formatCurrency(hours * c.rate)}</td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  {tl && (
                                    <button
                                      onClick={() => setEditingTimelog(tl)}
                                      className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                                      title="Upravit timelog"
                                    >
                                      <FileText size={14} />
                                    </button>
                                  )}
                                  <button
                                    onClick={() => handleRemoveFromEvent(c.id)}
                                    className="p-1.5 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                    title="Odebrat z akce"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
                  <h4 className="text-[10px] text-emerald-700 uppercase tracking-wider font-bold mb-3">Finanční souhrn</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-emerald-600">Celkem hodiny</span>
                      <span className="font-bold text-emerald-900">{totalHours.toFixed(1)}h</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-emerald-600">Náklady na crew</span>
                      <span className="font-bold text-emerald-900">
                        {formatCurrency(eventTimelogs.reduce((s, t) => {
                          const c = findContractor(t.cid);
                          return s + (c ? calculateTotalHours(t.days) * c.rate : 0);
                        }, 0))}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-emerald-600">Cestovné</span>
                      <span className="font-bold text-emerald-900">{formatCurrency(eventTimelogs.reduce((s, t) => s + t.km * KM_RATE, 0))}</span>
                    </div>
                    <div className="pt-2 mt-2 border-t border-emerald-200 flex justify-between text-sm">
                      <span className="font-bold text-emerald-700">Celkový rozpočet</span>
                      <span className="font-black text-emerald-900">
                        {formatCurrency(eventTimelogs.reduce((s, t) => {
                          const c = findContractor(t.cid);
                          return s + (c ? calculateTotalHours(t.days) * c.rate : 0) + t.km * KM_RATE;
                        }, 0))}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                  <h4 className="text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-3">Statistiky akce</h4>
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-[11px] mb-1">
                        <span>Obsazenost</span>
                        <span className="font-semibold">{event.filled}/{event.needed}</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                        <div className={`h-full rounded-full ${event.filled >= event.needed ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${Math.min(100, Math.round(event.filled / event.needed * 100))}%` }} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-white p-2 rounded-lg border border-gray-100 text-center">
                        <div className="text-[9px] text-gray-400 uppercase">Dny</div>
                        <div className="text-sm font-bold">{days.length}</div>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-gray-100 text-center">
                        <div className="text-[9px] text-gray-400 uppercase">Výkazy</div>
                        <div className="text-sm font-bold">{eventTimelogs.length}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Denní pohled */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Clock size={16} className="text-gray-400" />
                  Crew pro den: {new Date(eventTab).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' })}
                  {(() => {
                    if (!event.showDayTypes) return null;
                    const dayType = event.dayTypes?.[eventTab];
                    const phase = dayType ? PHASE_CONFIG.find(p => p.type === dayType) : null;
                    return phase ? (
                      <span className={`ml-2 px-2 py-0.5 rounded text-[10px] font-black text-white shadow-sm ${phase.color}`}>
                        {phase.label.toUpperCase()}
                      </span>
                    ) : null;
                  })()}
                </h3>
                <button className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-200 transition-colors">
                  Exportovat Call Sheet
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {eventTimelogs.filter(t => t.days.some(d => d.d === eventTab)).map(t => {
                  const c = findContractor(t.cid);
                  if (!c) return null;
                  const day = t.days.find(d => d.d === eventTab)!;
                  return (
                    <div key={t.id} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="av w-10 h-10 text-xs" style={{ backgroundColor: c.bg, color: c.fg }}>{c.ii}</div>
                        <div>
                          <div className="text-sm font-bold">{c.name}</div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] text-gray-500">{c.phone}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between bg-gray-50 rounded-lg p-2.5">
                        <div className="flex flex-col">
                          <span className="text-[9px] text-gray-400 uppercase font-bold">Čas</span>
                          <span className="text-xs font-mono font-bold">{day.f} – {day.t}</span>
                        </div>
                        <div className="flex flex-col text-right">
                          <span className="text-[9px] text-gray-400 uppercase font-bold">Hodiny</span>
                          <span className="text-xs font-bold">{calculateDayHours(day.f, day.t).toFixed(1)}h</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {eventTimelogs.filter(t => t.days.some(d => d.d === eventTab)).length === 0 && (
                  <div className="col-span-full py-12 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-200 text-gray-400 text-sm">
                    Na tento den není nikdo naplánován.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default EventDetailView;
