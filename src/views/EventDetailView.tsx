import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Clock, FileText, MapPin, Receipt, Shirt, Trash2, User, Users } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { useAppContext } from '../context/useAppContext';
import { KM_RATE } from '../data';
import { PHASE_CONFIG } from '../constants';
import { calculateDayHours, calculateTotalHours, formatCurrency, formatDateRange, getDatesBetween, getEventStatus } from '../utils';
import StatusBadge from '../components/shared/StatusBadge';
import EventEditModal from '../components/modals/EventEditModal';
import AssignCrewModal from '../components/modals/AssignCrewModal';
import { Event } from '../types';
import {
  getEventCrew,
  getEventDetailData,
  removeContractorFromEvent,
  subscribeToEventChanges,
} from '../features/events/services/events.service';

const EventDetailView = () => {
  const {
    role,
    selectedEventId,
    setSelectedEventId,
    eventTab,
    setEventTab,
    setEditingReceipt,
    setDeleteConfirm,
    setEditingTimelog,
  } = useAppContext();
  const [detail, setDetail] = useState(() => getEventDetailData(selectedEventId));
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [assigningEvent, setAssigningEvent] = useState<Event | null>(null);

  const loadDetail = useCallback(() => {
    setDetail(getEventDetailData(selectedEventId));
  }, [selectedEventId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  useEffect(() => subscribeToEventChanges(loadDetail), [loadDetail]);

  useEffect(() => {
    if (selectedEventId && !detail.event) {
      setSelectedEventId(null);
    }
  }, [detail.event, selectedEventId, setSelectedEventId]);

  const event = detail.event;
  if (!event) return null;

  const eventStatus = getEventStatus(event);
  const eventTimelogs = detail.timelogs;
  const eventReceipts = detail.receipts;
  const contractors = detail.contractors;
  const totalHours = eventTimelogs.reduce((sum, timelog) => sum + calculateTotalHours(timelog.days), 0);
  const totalCrewCost = eventTimelogs.reduce((sum, timelog) => {
    const contractor = contractors.find((item) => item.profileId === timelog.contractorProfileId);
    return sum + (contractor ? calculateTotalHours(timelog.days) * contractor.rate : 0);
  }, 0);
  const totalTravelCost = eventTimelogs.reduce((sum, timelog) => sum + timelog.km * KM_RATE, 0);
  const totalReceiptCost = eventReceipts.reduce((sum, receipt) => sum + receipt.amount, 0);
  const days = getDatesBetween(event.startDate, event.endDate);
  const eventCrew = getEventCrew(event.id);
  const canManageEvents = role !== 'crew';

  const getPhasesForDate = (date: string) => (
    event.showDayTypes
      ? PHASE_CONFIG.filter((phase) => (
          event.phaseSchedules?.[phase.type]?.some((slot) => slot.dates.includes(date))
          || event.dayTypes?.[date] === phase.type
        ))
      : []
  );

  const handleRemoveFromEvent = (contractorProfileId: string | undefined) => {
    if (!contractorProfileId) {
      toast.error('Nepodařilo se dohledat UUID identitu člena crew.');
      return;
    }

    void removeContractorFromEvent(event.id, contractorProfileId).catch((error) => {
      toast.error(error instanceof Error ? error.message : 'Nepodařilo se odebrat člena crew.');
    });
  };

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
      <button onClick={() => setSelectedEventId(null)} className="mb-4 flex items-center gap-1 text-xs text-gray-500 transition-colors hover:text-gray-900">
        <ArrowLeft size={14} /> Zpet na Akce
      </button>

      <div className="mb-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="jn px-2 py-0.5 text-sm">{event.job}</span>
              <StatusBadge status={eventStatus} />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">{event.name}</h1>
            <p className="mt-1 text-sm text-gray-500">{formatDateRange(event.startDate, event.endDate)} - {event.city} - {event.client}</p>
            {event.description && <p className="mt-3 max-w-2xl text-xs leading-relaxed text-gray-600">{event.description}</p>}

            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
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
            <button
              onClick={() => setEditingReceipt({
                id: Math.max(0, ...eventReceipts.map((receipt) => receipt.id)) + 1,
                contractorProfileId: undefined,
                eid: event.id,
                job: event.job,
                title: '',
                vendor: '',
                amount: 0,
                paidAt: event.startDate,
                note: '',
                status: 'draft',
              })}
              className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium hover:bg-gray-50"
            >
              Pridat uctenku
            </button>

            {canManageEvents && (
              <>
                <button onClick={() => setAssigningEvent(event)} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm shadow-emerald-200 hover:bg-emerald-700">
                  Obsadit crew
                </button>
                <button onClick={() => setEditingEvent(event)} className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium hover:bg-gray-50">
                  Upravit akci
                </button>
                <button
                  onClick={() => setDeleteConfirm({ type: 'event', id: event.id, name: event.name })}
                  className="rounded-xl border border-red-100 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
                  title="Smazat akci"
                >
                  <Trash2 size={18} />
                </button>
              </>
            )}
          </div>
        </div>

        <div className="-mx-6 flex gap-1 border-b border-gray-100 px-6">
          <button
            onClick={() => setEventTab('overview')}
            className={`border-b-2 px-4 py-2 text-sm font-medium transition-all ${eventTab === 'overview' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            Prehled
          </button>
          {days.map((date) => {
            const phasesForDay = getPhasesForDate(date);
            return (
              <button
                key={date}
                onClick={() => setEventTab(date)}
                className={`border-b-2 px-4 py-2 text-sm font-medium transition-all ${eventTab === date ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              >
                <div className="flex flex-col items-center">
                  <span className="text-[10px] font-bold uppercase opacity-60">{new Date(date).toLocaleDateString('cs-CZ', { weekday: 'short' })}</span>
                  <span className="text-xs font-bold">{new Date(date).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' })}</span>
                  {phasesForDay.length > 0 && (
                    <div className="mt-1 flex gap-1">
                      {phasesForDay.map((phase) => (
                        <div key={`${date}-${phase.id}`} title={phase.label} className={`flex h-4 w-4 items-center justify-center rounded border text-[8px] font-black text-white shadow-sm ${phase.color}`}>
                          {phase.id}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-6">
          {eventTab === 'overview' ? (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="space-y-6 lg:col-span-2">
                <div>
                  <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold">
                    <Users size={16} className="text-gray-400" />
                    Prirazena Crew ({eventCrew.length})
                  </h3>
                  <div className="overflow-hidden rounded-xl border border-gray-100 bg-gray-50">
                    <table className="w-full border-collapse text-left">
                      <thead>
                        <tr className="border-b border-gray-100 text-[10px] uppercase tracking-wider text-gray-400">
                          <th className="px-4 py-3 text-left font-medium">Jmeno</th>
                          {event.showDayTypes && <th className="px-4 py-3 text-left font-medium">Faze</th>}
                          <th className="px-4 py-3 text-left font-medium">Hodiny</th>
                          <th className="px-4 py-3 text-right font-medium">Celkem</th>
                          <th className="px-4 py-3 text-right font-medium">Akce</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {eventCrew.map((contractor) => {
                          const timelog = eventTimelogs.find((item) => item.contractorProfileId === contractor.profileId);
                          const hours = timelog ? calculateTotalHours(timelog.days) : 0;

                          return (
                            <tr key={contractor.id} className="bg-white transition-colors hover:bg-gray-50">
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <div className="av h-7 w-7 text-[10px]" style={{ backgroundColor: contractor.bg, color: contractor.fg }}>{contractor.ii}</div>
                                  <span className="text-xs font-medium">{contractor.name}</span>
                                </div>
                              </td>
                              {event.showDayTypes && (
                                <td className="px-4 py-3">
                                  <div className="flex gap-1">
                                    {PHASE_CONFIG.map((phase) => {
                                      const isActive = timelog?.days.some((day) => day.type === phase.type);
                                      return (
                                        <div key={phase.id} className={`flex h-5 w-5 items-center justify-center rounded border text-[8px] font-black transition-all ${isActive ? `${phase.color} text-white shadow-sm` : 'border-gray-200 bg-gray-100 text-gray-300'}`} title={phase.label}>
                                          {phase.id}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </td>
                              )}
                              <td className="px-4 py-3 text-xs font-semibold">{hours.toFixed(1)}h</td>
                              <td className="px-4 py-3 text-right text-xs font-bold text-gray-900">{formatCurrency(hours * contractor.rate)}</td>
                              <td className="px-4 py-3 text-right">
                                {canManageEvents && (
                                  <div className="flex items-center justify-end gap-1">
                                    {timelog && (
                                      <button
                                        onClick={() => setEditingTimelog(timelog)}
                                        className="rounded-lg p-1.5 text-gray-400 transition-all hover:bg-emerald-50 hover:text-emerald-600"
                                        title="Upravit timelog"
                                      >
                                        <FileText size={14} />
                                      </button>
                                    )}
                                    <button
                                      onClick={() => handleRemoveFromEvent(contractor.profileId)}
                                      className="rounded-lg p-1.5 text-gray-300 transition-all hover:bg-red-50 hover:text-red-600"
                                      title="Odebrat z akce"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                )}
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
                <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
                  <h4 className="mb-3 text-[10px] font-bold uppercase tracking-wider text-emerald-700">Financni souhrn</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-emerald-600">Celkem hodiny</span>
                      <span className="font-bold text-emerald-900">{totalHours.toFixed(1)}h</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-emerald-600">Naklady na crew</span>
                      <span className="font-bold text-emerald-900">{formatCurrency(totalCrewCost)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-emerald-600">Cestovne</span>
                      <span className="font-bold text-emerald-900">{formatCurrency(totalTravelCost)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-emerald-600">Uctenky</span>
                      <span className="font-bold text-emerald-900">{formatCurrency(totalReceiptCost)}</span>
                    </div>
                    <div className="mt-2 flex justify-between border-t border-emerald-200 pt-2 text-sm">
                      <span className="font-bold text-emerald-700">Celkovy rozpocet</span>
                      <span className="font-black text-emerald-900">{formatCurrency(totalCrewCost + totalTravelCost + totalReceiptCost)}</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                  <h4 className="mb-3 text-[10px] font-bold uppercase tracking-wider text-gray-500">Statistiky akce</h4>
                  <div className="space-y-3">
                    <div>
                      <div className="mb-1 flex justify-between text-[11px]">
                        <span>Obsazenost</span>
                        <span className="font-semibold">{event.filled}/{event.needed}</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
                        <div className={`h-full rounded-full ${event.filled >= event.needed ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${Math.min(100, Math.round((event.filled / event.needed) * 100))}%` }} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-lg border border-gray-100 bg-white p-2 text-center">
                        <div className="text-[9px] uppercase text-gray-400">Dny</div>
                        <div className="text-sm font-bold">{days.length}</div>
                      </div>
                      <div className="rounded-lg border border-gray-100 bg-white p-2 text-center">
                        <div className="text-[9px] uppercase text-gray-400">Vykazy</div>
                        <div className="text-sm font-bold">{eventTimelogs.length}</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                  <h4 className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                    <Receipt size={12} className="text-gray-400" />
                    Uctenky ({eventReceipts.length})
                  </h4>
                  <div className="space-y-2">
                    {eventReceipts.slice(0, 4).map((receipt) => {
                      const contractor = contractors.find((item) => item.profileId === receipt.contractorProfileId);
                      return (
                        <div key={receipt.id} className="rounded-lg border border-gray-100 bg-white p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-xs font-semibold text-gray-900">{receipt.title}</div>
                              <div className="text-[10px] text-gray-500">{contractor?.name || '-'} - {receipt.vendor}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-xs font-bold text-gray-900">{formatCurrency(receipt.amount)}</div>
                              <StatusBadge status={receipt.status} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {eventReceipts.length === 0 && (
                      <div className="rounded-lg border border-dashed border-gray-200 bg-white px-3 py-6 text-center text-xs text-gray-400">
                        K teto akci zatim nejsou zadane zadne uctenky.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <Clock size={16} className="text-gray-400" />
                  Crew pro den: {new Date(eventTab).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' })}
                  {event.showDayTypes && (
                    <span className="ml-2 flex gap-1">
                      {getPhasesForDate(eventTab).map((phase) => (
                        <span key={`${eventTab}-${phase.id}`} className={`rounded px-2 py-0.5 text-[10px] font-black text-white shadow-sm ${phase.color}`}>
                          {phase.label.toUpperCase()}
                        </span>
                      ))}
                    </span>
                  )}
                </h3>
                <button className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-200">
                  Exportovat Call Sheet
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {eventTimelogs.filter((timelog) => timelog.days.some((day) => day.d === eventTab)).map((timelog) => {
                  const contractor = contractors.find((item) => item.profileId === timelog.contractorProfileId);
                  if (!contractor) return null;
                  const matchingDays = timelog.days.filter((day) => day.d === eventTab);

                  return (
                    <div key={timelog.id} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
                      <div className="mb-3 flex items-center gap-3">
                        <div className="av h-10 w-10 text-xs" style={{ backgroundColor: contractor.bg, color: contractor.fg }}>{contractor.ii}</div>
                        <div>
                          <div className="text-sm font-bold">{contractor.name}</div>
                          <div className="mt-0.5 flex items-center gap-1.5">
                            <span className="text-[10px] text-gray-500">{contractor.phone}</span>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        {matchingDays.map((day, index) => {
                          const phase = PHASE_CONFIG.find((item) => item.type === day.type);
                          return (
                            <div key={`${timelog.id}-${index}`} className="flex items-center justify-between rounded-lg bg-gray-50 p-2.5">
                              <div className="flex flex-col">
                                <span className="text-[9px] font-bold uppercase text-gray-400">Cas</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-mono font-bold">{day.f} - {day.t}</span>
                                  {phase && (
                                    <span className={`rounded px-1.5 py-0.5 text-[9px] font-black text-white ${phase.color}`}>
                                      {phase.id}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex flex-col text-right">
                                <span className="text-[9px] font-bold uppercase text-gray-400">Hodiny</span>
                                <span className="text-xs font-bold">{calculateDayHours(day.f, day.t).toFixed(1)}h</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {eventTimelogs.filter((timelog) => timelog.days.some((day) => day.d === eventTab)).length === 0 && (
                  <div className="col-span-full rounded-2xl border border-dashed border-gray-200 bg-gray-50 py-12 text-center text-sm text-gray-400">
                    Na tento den neni nikdo naplanovan.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <EventEditModal
        editingEvent={editingEvent}
        onClose={() => setEditingEvent(null)}
        onChange={setEditingEvent}
      />
      <AssignCrewModal
        event={assigningEvent}
        onClose={() => setAssigningEvent(null)}
      />
    </motion.div>
  );
};

export default EventDetailView;
