import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Clock, FileText, MapPin, Receipt, Shirt, Trash2, User, Users } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { useAppContext } from '../context/useAppContext';
import { KM_RATE } from '../data';
import { PHASE_CONFIG } from '../constants';
import { calculateDayHours, calculateTotalHours, formatCurrency, formatDateRange, formatShortDate, getDatesBetween, getEventStatus } from '../utils';
import { Button } from '../components/ui/button';
import StatusBadge from '../components/shared/StatusBadge';
import ApprovalStatusDot from '../components/shared/ApprovalStatusDot';
import EventEditModal from '../components/modals/EventEditModal';
import AssignCrewModal from '../components/modals/AssignCrewModal';
import { Event, InvoiceApprovalDocument } from '../types';
import {
  getEventCrew,
  getEventDetailData,
  removeContractorFromEvent,
  subscribeToEventChanges,
} from '../features/events/services/events.service';
import { useInvoiceApprovalsQuery } from '../features/invoices/queries/useInvoiceApprovalsQuery';
import {
  getEventApprovalDocuments,
  getEventPersonApprovalState,
} from '../features/invoices/services/invoice-approval-sync.service';
import { updateTimelogStatus } from '../features/timelogs/services/timelogs.service';

const EMPTY_APPROVAL_DOCUMENTS: InvoiceApprovalDocument[] = [];

const getApprovalDocumentBadgeStatus = (document: InvoiceApprovalDocument) => (
  document.approvalStatus === 'unknown' ? 'needs_review' : document.approvalStatus
);

const getApprovalDocumentPersonLabel = (document: InvoiceApprovalDocument) => {
  const parsedPerson = document.comment
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)[1];

  return parsedPerson || document.supplierName || '-';
};

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
  const [crewPanelTab, setCrewPanelTab] = useState<'assigned' | 'timelogApproval'>('assigned');
  const invoiceApprovalsQuery = useInvoiceApprovalsQuery();

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
  const approvalDocuments = invoiceApprovalsQuery.data ?? EMPTY_APPROVAL_DOCUMENTS;
  const eventApprovalDocuments = useMemo(() => (
    event ? getEventApprovalDocuments(event, approvalDocuments) : []
  ), [approvalDocuments, event]);

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
  const dayTimelogs = eventTab === 'overview'
    ? []
    : eventTimelogs.filter((timelog) => timelog.days.some((day) => day.d === eventTab));
  const canManageEvents = role !== 'crew';
  const eventApprovalTimelogs = canManageEvents
    ? eventTimelogs.filter((timelog) => (
        timelog.status === 'draft'
        || (role === 'crewhead'
          ? timelog.status === 'pending_ch'
          : timelog.status === 'pending_ch' || timelog.status === 'pending_coo')
      ))
    : [];
  const getApprovalStateForPerson = (personName: string) => (
    getEventPersonApprovalState({ event, personName, approvalDocuments })
  );

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

  const handleTimelogApprovalAction = (timelogId: number, action: 'sub' | 'ch' | 'coo' | 'rej') => {
    void updateTimelogStatus(timelogId, action)
      .then(loadDetail)
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : 'Nepodařilo se aktualizovat výkaz.');
      });
  };

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
      <button onClick={() => setSelectedEventId(null)} className="mb-4 flex items-center gap-1 text-xs text-[color:var(--nodu-text-soft)] transition-colors hover:text-[color:var(--nodu-accent)]">
        <ArrowLeft size={14} /> Zpet na Akce
      </button>

      <div className="mb-6 rounded-[30px] border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.98)] p-6 shadow-[0_22px_54px_rgba(47,38,31,0.1)]">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="jn nodu-job-badge px-2 py-0.5 text-sm">{event.job}</span>
              <StatusBadge status={eventStatus} />
            </div>
            <h1 className="text-2xl font-bold text-[color:var(--nodu-text)]">{event.name}</h1>
            <p className="mt-1 text-sm text-[color:var(--nodu-text-soft)]">{formatDateRange(event.startDate, event.endDate)} - {event.city} - {event.client}</p>
            {event.description && <p className="mt-3 max-w-2xl text-xs leading-relaxed text-[color:var(--nodu-text-soft)]">{event.description}</p>}

            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
              {event.contactPerson && (
                <div className="flex items-center gap-1.5 text-[11px] text-[color:var(--nodu-text-soft)]">
                  <User size={12} className="text-[color:var(--nodu-text-soft)]" />
                  <span className="font-medium text-[color:var(--nodu-text)]">Kontakt:</span> {event.contactPerson}
                </div>
              )}
              {event.meetingLocation && (
                <div className="flex items-center gap-1.5 text-[11px] text-[color:var(--nodu-text-soft)]">
                  <MapPin size={12} className="text-[color:var(--nodu-text-soft)]" />
                  <span className="font-medium text-[color:var(--nodu-text)]">Sraz:</span> {event.meetingLocation}
                </div>
              )}
              {event.dresscode && (
                <div className="flex items-center gap-1.5 text-[11px] text-[color:var(--nodu-text-soft)]">
                  <Shirt size={12} className="text-[color:var(--nodu-text-soft)]" />
                  <span className="font-medium text-[color:var(--nodu-text)]">Dresscode:</span> {event.dresscode}
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <Button
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
              variant="outline"
            >
              Pridat uctenku
            </Button>

            {canManageEvents && (
              <>
                <Button onClick={() => setAssigningEvent(event)}>
                  Obsadit crew
                </Button>
                <Button onClick={() => setEditingEvent(event)} variant="outline">
                  Upravit akci
                </Button>
                <Button
                  onClick={() => setDeleteConfirm({ type: 'event', id: event.supabaseId ?? event.id, name: event.name })}
                  variant="outline"
                  className="border-[#e8b4a3] text-[#c45c39] hover:bg-[rgba(212,93,55,0.06)] hover:text-[#c45c39]"
                  title="Smazat akci"
                >
                  <Trash2 size={18} />
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="-mx-6 flex gap-1 border-b border-[color:var(--nodu-border)] px-6">
          <button
            onClick={() => setEventTab('overview')}
            className={`border-b-2 px-4 py-2 text-sm font-medium transition-all ${eventTab === 'overview' ? 'border-[color:var(--nodu-accent)] text-[color:var(--nodu-accent)]' : 'border-transparent text-[color:var(--nodu-text-soft)] hover:text-[color:var(--nodu-text)]'}`}
          >
            Prehled
          </button>
          {days.map((date) => {
            const phasesForDay = getPhasesForDate(date);
            return (
              <button
                key={date}
                onClick={() => setEventTab(date)}
                className={`border-b-2 px-4 py-2 text-sm font-medium transition-all ${eventTab === date ? 'border-[color:var(--nodu-accent)] text-[color:var(--nodu-accent)]' : 'border-transparent text-[color:var(--nodu-text-soft)] hover:text-[color:var(--nodu-text)]'}`}
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
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCrewPanelTab('assigned')}
                      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold transition-all ${crewPanelTab === 'assigned' ? 'border-[color:var(--nodu-accent)] bg-[color:var(--nodu-accent-soft)] text-[color:var(--nodu-accent)]' : 'border-[color:var(--nodu-border)] bg-white text-[color:var(--nodu-text)] hover:border-[color:rgb(var(--nodu-accent-rgb)/0.34)] hover:text-[color:var(--nodu-accent)]'}`}
                    >
                      <Users size={16} className="text-current" />
                      Prirazena Crew ({eventCrew.length})
                    </button>
                    {canManageEvents && (
                      <button
                        type="button"
                        onClick={() => setCrewPanelTab('timelogApproval')}
                        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold transition-all ${crewPanelTab === 'timelogApproval' ? 'border-[color:var(--nodu-accent)] bg-[color:var(--nodu-accent-soft)] text-[color:var(--nodu-accent)]' : 'border-[color:var(--nodu-border)] bg-white text-[color:var(--nodu-text)] hover:border-[color:rgb(var(--nodu-accent-rgb)/0.34)] hover:text-[color:var(--nodu-accent)]'}`}
                      >
                        <FileText size={16} className="text-current" />
                        Schvalovani timelogu ({eventApprovalTimelogs.length})
                      </button>
                    )}
                  </div>

                  {crewPanelTab === 'assigned' || !canManageEvents ? (
                    <div className="overflow-hidden rounded-[24px] border border-[color:var(--nodu-border)] bg-[color:var(--nodu-paper-strong)]">
                      <table className="w-full border-collapse text-left">
                        <thead>
                          <tr className="border-b border-[color:var(--nodu-border)] text-[10px] uppercase tracking-wider text-[color:var(--nodu-text-soft)]">
                            <th className="px-4 py-3 text-left font-medium">Jmeno</th>
                            {event.showDayTypes && <th className="px-4 py-3 text-left font-medium">Faze</th>}
                            <th className="px-4 py-3 text-left font-medium">Hodiny</th>
                            <th className="px-4 py-3 text-right font-medium">Celkem</th>
                            <th className="px-4 py-3 text-right font-medium">Akce</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[color:rgb(var(--nodu-text-rgb)/0.06)]">
                          {eventCrew.map((contractor) => {
                            const timelog = eventTimelogs.find((item) => item.contractorProfileId === contractor.profileId);
                            const hours = timelog ? calculateTotalHours(timelog.days) : 0;
                            const approvalState = getApprovalStateForPerson(contractor.name);

                            return (
                              <tr
                                key={contractor.id}
                                onClick={() => {
                                  if (timelog) setEditingTimelog(timelog);
                                }}
                                className={`bg-white transition-colors hover:bg-[color:var(--nodu-accent-soft)] ${timelog ? 'cursor-pointer' : ''}`}
                              >
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    <div className="av h-7 w-7 text-[10px]" style={{ backgroundColor: contractor.bg, color: contractor.fg }}>{contractor.ii}</div>
                                    <ApprovalStatusDot status={approvalState.status} label={approvalState.label} />
                                    <span className="text-xs font-medium text-[color:var(--nodu-text)]">{contractor.name}</span>
                                  </div>
                                </td>
                                {event.showDayTypes && (
                                  <td className="px-4 py-3">
                                    <div className="flex gap-1">
                                      {PHASE_CONFIG.map((phase) => {
                                        const isActive = timelog?.days.some((day) => day.type === phase.type);
                                        return (
                                          <div key={phase.id} className={`flex h-5 w-5 items-center justify-center rounded border text-[8px] font-black transition-all ${isActive ? `${phase.color} text-white shadow-sm` : 'border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-text-rgb)/0.06)] text-[color:var(--nodu-text-soft)]'}`} title={phase.label}>
                                            {phase.id}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </td>
                                )}
                                <td className="px-4 py-3 text-xs font-semibold text-[color:var(--nodu-text)]">{hours.toFixed(1)}h</td>
                                <td className="px-4 py-3 text-right text-xs font-bold text-[color:var(--nodu-text)]">{formatCurrency(hours * contractor.rate)}</td>
                                <td className="px-4 py-3 text-right">
                                  {canManageEvents && (
                                    <div className="flex items-center justify-end gap-1">
                                      {timelog && (
                                        <button
                                          onClick={(clickEvent) => {
                                            clickEvent.stopPropagation();
                                            setEditingTimelog(timelog);
                                          }}
                                          className="rounded-lg p-1.5 text-[color:var(--nodu-text-soft)] transition-all hover:bg-[color:var(--nodu-success-bg)] hover:text-[color:var(--nodu-success-text)]"
                                          title="Upravit timelog"
                                        >
                                          <FileText size={14} />
                                        </button>
                                      )}
                                      <button
                                        onClick={(clickEvent) => {
                                          clickEvent.stopPropagation();
                                          handleRemoveFromEvent(contractor.profileId);
                                        }}
                                        className="rounded-lg p-1.5 text-[color:var(--nodu-text-soft)] transition-all hover:bg-[color:var(--nodu-error-bg)] hover:text-[color:var(--nodu-error-text)]"
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
                  ) : (
                    <div className="rounded-[24px] border border-[color:var(--nodu-border)] bg-[color:var(--nodu-paper-strong)] p-4">
                      {eventApprovalTimelogs.length > 0 ? (
                        <div className="space-y-3">
                          {eventApprovalTimelogs.map((timelog) => {
                            const contractor = contractors.find((item) => item.profileId === timelog.contractorProfileId);
                            const totalTimelogHours = calculateTotalHours(timelog.days);
                            const amount = contractor ? totalTimelogHours * contractor.rate + timelog.km * KM_RATE : 0;
                            const approveAction = timelog.status === 'draft'
                              ? 'sub'
                              : timelog.status === 'pending_ch' ? 'ch' : 'coo';
                            const approveLabel = timelog.status === 'draft'
                              ? 'Odeslat ke kontrole CH'
                              : timelog.status === 'pending_ch'
                                ? (role === 'coo' ? 'Schvalit za CH' : 'Schvalit a poslat COO')
                                : 'Schvalit';

                            return (
                              <div key={timelog.id} className="rounded-[18px] border border-[color:var(--nodu-border)] bg-white p-4">
                                <div className="mb-3 flex items-start gap-3">
                                  <div className="av h-8 w-8 text-[10px]" style={{ backgroundColor: contractor?.bg ?? '#f3f4f6', color: contractor?.fg ?? '#6b7280' }}>{contractor?.ii ?? '?'}</div>
                                  <div>
                                    <div className="text-sm font-semibold text-[color:var(--nodu-text)]">{contractor?.name ?? 'Neznamy clen crew'}</div>
                                    <StatusBadge status={timelog.status} />
                                  </div>
                                  <div className="ml-auto text-right">
                                    <div className="text-sm font-bold text-[color:var(--nodu-text)]">{totalTimelogHours.toFixed(1)}h</div>
                                    <div className="text-xs font-semibold text-[color:var(--nodu-text-soft)]">{formatCurrency(amount)}</div>
                                  </div>
                                </div>
                                <div className="rounded-xl border border-[color:var(--nodu-border)] bg-[color:var(--nodu-paper-strong)] p-3">
                                  {timelog.days.map((day, index) => (
                                    <div key={`${timelog.id}-${day.d}-${index}`} className="flex items-center gap-3 py-1 text-xs">
                                      <span className="w-16 text-[color:var(--nodu-text-soft)]">{formatShortDate(day.d)}</span>
                                      <span className="font-mono font-semibold text-[color:var(--nodu-text)]">{day.f} - {day.t}</span>
                                      <StatusBadge status={day.type} />
                                      <span className="ml-auto text-[color:var(--nodu-text-soft)]">{calculateDayHours(day.f, day.t).toFixed(1)}h</span>
                                    </div>
                                  ))}
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  <Button size="sm" className="h-8 text-[11px]" onClick={() => handleTimelogApprovalAction(timelog.id, approveAction)}>
                                    {approveLabel}
                                  </Button>
                                  {timelog.status !== 'draft' && (
                                    <Button size="sm" variant="outline" className="h-8 border-[#e8b4a3] text-[11px] text-[#c45c39] hover:bg-[rgba(212,93,55,0.06)] hover:text-[#c45c39]" onClick={() => handleTimelogApprovalAction(timelog.id, 'rej')}>
                                      Zamitnout
                                    </Button>
                                  )}
                                  <Button size="sm" variant="outline" className="ml-auto h-8 text-[11px]" onClick={() => setEditingTimelog(timelog)}>
                                    Upravit
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="rounded-[18px] border border-dashed border-[color:var(--nodu-border)] bg-white px-4 py-10 text-center text-sm text-[color:var(--nodu-text-soft)]">
                          Zadne vykazy teto akce necekaji na schvaleni.
                        </div>
                      )}
                    </div>
                  )}
                </div>

              </div>

              <div className="space-y-4">
                <div className="rounded-[22px] border border-[color:var(--nodu-border)] bg-[color:var(--nodu-paper-strong)] p-4">
                  <h4 className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-[color:var(--nodu-text-soft)]">
                    <FileText size={12} className="text-[color:var(--nodu-text-soft)]" />
                    Schvalovani faktur
                  </h4>
                  {eventApprovalDocuments.length > 0 ? (
                    <div className="overflow-hidden rounded-[16px] border border-[color:rgb(var(--nodu-text-rgb)/0.08)] bg-white">
                      <table className="w-full table-fixed border-collapse text-left">
                        <thead>
                          <tr className="border-b border-[color:rgb(var(--nodu-text-rgb)/0.08)] text-[9px] uppercase tracking-wider text-[color:var(--nodu-text-soft)]">
                            <th className="w-[72%] px-3 py-2 font-medium">Dokument</th>
                            <th className="w-[28%] px-3 py-2 text-right font-medium">Stav</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[color:rgb(var(--nodu-text-rgb)/0.06)]">
                          {eventApprovalDocuments.map((document) => (
                            <tr key={document.id}>
                              <td className="min-w-0 px-3 py-2">
                                <div className="truncate text-[11px] font-semibold text-[color:var(--nodu-text)]">{document.documentName}</div>
                                <div className="mt-0.5 truncate text-[10px] text-[color:var(--nodu-text-soft)]">
                                  {document.invoiceNumber || '-'} · {document.comment.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)[0] || event.name}
                                </div>
                                <div className="mt-1 truncate text-[10px] font-semibold text-[color:var(--nodu-text)]">
                                  {getApprovalDocumentPersonLabel(document)}
                                </div>
                              </td>
                              <td className="px-3 py-2 text-right">
                                <StatusBadge status={getApprovalDocumentBadgeStatus(document)} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="rounded-[16px] border border-dashed border-[color:var(--nodu-border)] bg-white px-3 py-6 text-center text-xs text-[color:var(--nodu-text-soft)]">
                      K teto akci zatim neni sparovany zadny dokument z PowerApps.
                    </div>
                  )}
                </div>

                <div className="rounded-[22px] border border-[color:var(--nodu-success-border)] bg-[color:var(--nodu-success-bg)] p-4">
                  <h4 className="mb-3 text-[10px] font-bold uppercase tracking-wider text-[color:var(--nodu-success-text)]">Financni souhrn</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-[color:var(--nodu-success-text)]">Celkem hodiny</span>
                      <span className="font-bold text-[color:var(--nodu-text)]">{totalHours.toFixed(1)}h</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-[color:var(--nodu-success-text)]">Naklady na crew</span>
                      <span className="font-bold text-[color:var(--nodu-text)]">{formatCurrency(totalCrewCost)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-[color:var(--nodu-success-text)]">Cestovne</span>
                      <span className="font-bold text-[color:var(--nodu-text)]">{formatCurrency(totalTravelCost)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-[color:var(--nodu-success-text)]">Uctenky</span>
                      <span className="font-bold text-[color:var(--nodu-text)]">{formatCurrency(totalReceiptCost)}</span>
                    </div>
                    <div className="mt-2 flex justify-between border-t border-[color:var(--nodu-success-border)] pt-2 text-sm">
                      <span className="font-bold text-[color:var(--nodu-success-text)]">Celkovy rozpocet</span>
                      <span className="font-black text-[color:var(--nodu-text)]">{formatCurrency(totalCrewCost + totalTravelCost + totalReceiptCost)}</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-[22px] border border-[color:var(--nodu-border)] bg-[color:var(--nodu-paper-strong)] p-4">
                  <h4 className="mb-3 text-[10px] font-bold uppercase tracking-wider text-[color:var(--nodu-text-soft)]">Statistiky akce</h4>
                  <div className="space-y-3">
                    <div>
                      <div className="mb-1 flex justify-between text-[11px]">
                        <span className="text-[color:var(--nodu-text-soft)]">Obsazenost</span>
                        <span className="font-semibold text-[color:var(--nodu-text)]">{event.filled}/{event.needed}</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[color:rgb(var(--nodu-text-rgb)/0.08)]">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(100, Math.round((event.filled / event.needed) * 100))}%`,
                            backgroundColor: event.filled >= event.needed ? 'var(--nodu-success-text)' : 'var(--nodu-warning-text)',
                          }}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-xl border border-[color:var(--nodu-border)] bg-white p-2 text-center">
                        <div className="text-[9px] uppercase text-[color:var(--nodu-text-soft)]">Dny</div>
                        <div className="text-sm font-bold text-[color:var(--nodu-text)]">{days.length}</div>
                      </div>
                      <div className="rounded-xl border border-[color:var(--nodu-border)] bg-white p-2 text-center">
                        <div className="text-[9px] uppercase text-[color:var(--nodu-text-soft)]">Vykazy</div>
                        <div className="text-sm font-bold text-[color:var(--nodu-text)]">{eventTimelogs.length}</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-[22px] border border-[color:var(--nodu-border)] bg-[color:var(--nodu-paper-strong)] p-4">
                  <h4 className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-[color:var(--nodu-text-soft)]">
                    <Receipt size={12} className="text-[color:var(--nodu-text-soft)]" />
                    Uctenky ({eventReceipts.length})
                  </h4>
                  <div className="space-y-2">
                    {eventReceipts.slice(0, 4).map((receipt) => {
                      const contractor = contractors.find((item) => item.profileId === receipt.contractorProfileId);
                      return (
                        <div key={receipt.id} className="rounded-xl border border-[color:var(--nodu-border)] bg-white p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-xs font-semibold text-[color:var(--nodu-text)]">{receipt.title}</div>
                              <div className="text-[10px] text-[color:var(--nodu-text-soft)]">{contractor?.name || '-'} - {receipt.vendor}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-xs font-bold text-[color:var(--nodu-text)]">{formatCurrency(receipt.amount)}</div>
                              <StatusBadge status={receipt.status} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {eventReceipts.length === 0 && (
                      <div className="rounded-xl border border-dashed border-[color:var(--nodu-border)] bg-white px-3 py-6 text-center text-xs text-[color:var(--nodu-text-soft)]">
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
                <h3 className="flex items-center gap-2 text-sm font-semibold text-[color:var(--nodu-text)]">
                  <Clock size={16} className="text-[color:var(--nodu-text-soft)]" />
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
                <button className="rounded-xl border border-[color:var(--nodu-border)] bg-white px-3 py-1.5 text-xs font-medium text-[color:var(--nodu-text)] transition-colors hover:bg-[color:var(--nodu-accent-soft)] hover:text-[color:var(--nodu-accent)]">
                  Exportovat Call Sheet
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {dayTimelogs.map((timelog) => {
                  const contractor = contractors.find((item) => item.profileId === timelog.contractorProfileId);
                  if (!contractor) return null;
                  const matchingDays = timelog.days.filter((day) => day.d === eventTab);
                  const approvalState = getApprovalStateForPerson(contractor.name);

                  return (
                    <div key={timelog.id} className="rounded-[22px] border border-[color:var(--nodu-border)] bg-white p-4 shadow-[0_14px_34px_rgba(47,38,31,0.06)] transition-shadow hover:shadow-[0_18px_42px_rgba(47,38,31,0.1)]">
                      <div className="mb-3 flex items-center gap-3">
                        <div className="av h-10 w-10 text-xs" style={{ backgroundColor: contractor.bg, color: contractor.fg }}>{contractor.ii}</div>
                        <div>
                          <div className="flex items-center gap-1.5 text-sm font-bold text-[color:var(--nodu-text)]">
                            <ApprovalStatusDot status={approvalState.status} label={approvalState.label} />
                            {contractor.name}
                          </div>
                          <div className="mt-0.5 flex items-center gap-1.5">
                            <span className="text-[10px] text-[color:var(--nodu-text-soft)]">{contractor.phone}</span>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        {matchingDays.map((day, index) => {
                          const phase = PHASE_CONFIG.find((item) => item.type === day.type);
                          return (
                            <div key={`${timelog.id}-${index}`} className="flex items-center justify-between rounded-xl bg-[color:var(--nodu-paper-strong)] p-2.5">
                              <div className="flex flex-col">
                                <span className="text-[9px] font-bold uppercase text-[color:var(--nodu-text-soft)]">Cas</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-mono font-bold text-[color:var(--nodu-text)]">{day.f} - {day.t}</span>
                                  {phase && (
                                    <span className={`rounded px-1.5 py-0.5 text-[9px] font-black text-white ${phase.color}`}>
                                      {phase.id}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex flex-col text-right">
                                <span className="text-[9px] font-bold uppercase text-[color:var(--nodu-text-soft)]">Hodiny</span>
                                <span className="text-xs font-bold text-[color:var(--nodu-text)]">{calculateDayHours(day.f, day.t).toFixed(1)}h</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {dayTimelogs.length === 0 && (
                  <div className="col-span-full rounded-[24px] border border-dashed border-[color:var(--nodu-border)] bg-[color:var(--nodu-paper-strong)] py-12 text-center text-sm text-[color:var(--nodu-text-soft)]">
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
