import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Clock, Copy, FileText, MapPin, Receipt, Shirt, Trash2, User, Users, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { useAppContext } from '../context/useAppContext';
import { useAuth } from '../app/providers/useAuth';
import { useIsMobile } from '../hooks/use-mobile';
import { KM_RATE } from '../data';
import { PHASE_CONFIG } from '../constants';
import { calculateDayHours, calculateTotalHours, formatCurrency, formatDateRange, formatShortDate, getDatesBetween, getEventStatus } from '../utils';
import { Button } from '../components/ui/button';
import StatusBadge from '../components/shared/StatusBadge';
import EventEditModal from '../components/modals/EventEditModal';
import AssignCrewModal from '../components/modals/AssignCrewModal';
import EventCrewRatingPanel from '../features/crew/components/EventCrewRatingPanel';
import { getCrewRatingsForEvent } from '../features/crew/services/crew-ratings.service';
import { Contractor, Event, InvoiceApprovalDocument, Timelog } from '../types';
import {
  getEventCrew,
  getEventDetailData,
  applyForEvent,
  approveEventApplication,
  approveEventWithdrawal,
  createEventCopy,
  removeContractorFromEvent,
  requestEventWithdrawal,
  subscribeToEventChanges,
  updateEventApplicationStatus,
  withdrawEventApplication,
} from '../features/events/services/events.service';
import { useInvoiceApprovalsQuery } from '../features/invoices/queries/useInvoiceApprovalsQuery';
import { getEventApprovalDocuments } from '../features/invoices/services/invoice-approval-sync.service';
import { updateTimelogStatus } from '../features/timelogs/services/timelogs.service';
import { canCreateTimelog, canEditTimelog } from '../features/timelogs/services/timelog-permissions';

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
  const { currentProfileId } = useAuth();
  const isMobile = useIsMobile();
  const [detail, setDetail] = useState(() => getEventDetailData(selectedEventId));
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [assigningEvent, setAssigningEvent] = useState<Event | null>(null);
  const [applicationDraftTimes, setApplicationDraftTimes] = useState({ from: '', to: '' });
  const [crewPanelTab, setCrewPanelTab] = useState<'assigned' | 'approval'>('assigned');
  const [showWithdrawalConfirm, setShowWithdrawalConfirm] = useState(false);
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

  useEffect(() => {
    if (eventTab === 'approval') {
      setCrewPanelTab('approval');
    }
  }, [eventTab]);

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
  const canManageEvents = role !== 'crew';
  const isCrewRole = role === 'crew';
  const shouldShowCrewRatings = canManageEvents && eventStatus === 'past';
  const eventCrewRatings = shouldShowCrewRatings ? getCrewRatingsForEvent(event.id) : [];
  const currentContractor = currentProfileId
    ? contractors.find((item) => item.profileId === currentProfileId) ?? null
    : null;
  const visibleEventCrew = isCrewRole && currentProfileId
    ? eventCrew.filter((contractor) => contractor.profileId === currentProfileId)
    : eventCrew;
  const assignedCrewProfileIds = new Set(
    eventCrew
      .map((contractor) => contractor.profileId)
      .filter((profileId): profileId is string => Boolean(profileId)),
  );
  const myTimelogs = currentProfileId
    ? eventTimelogs.filter((timelog) => timelog.contractorProfileId === currentProfileId)
    : [];
  const myReceipts = currentProfileId
    ? eventReceipts.filter((receipt) => receipt.contractorProfileId === currentProfileId)
    : [];
  const visibleReceipts = isCrewRole ? myReceipts : eventReceipts;
  const myHours = myTimelogs.reduce((sum, timelog) => sum + calculateTotalHours(timelog.days), 0);
  const myTravelCost = myTimelogs.reduce((sum, timelog) => sum + timelog.km * KM_RATE, 0);
  const myProjectedProfit = myHours * (currentContractor?.rate ?? 0) + myTravelCost;
  const pendingApplications = (detail.applications ?? [])
    .filter((application) => (
      application.status === 'pending'
      && !assignedCrewProfileIds.has(application.contractorProfileId)
    ))
    .map((application) => {
      const contractor = contractors.find((item) => item.profileId === application.contractorProfileId);
      return contractor ? { application, contractor } : null;
    })
    .filter((item): item is { application: typeof detail.applications[number]; contractor: typeof contractors[number] } => Boolean(item));
  const hasMyPendingApplication = currentProfileId
    ? pendingApplications.some(({ application }) => application.contractorProfileId === currentProfileId)
    : false;
  const withdrawalRequests = (detail.applications ?? [])
    .filter((application) => application.status === 'withdrawal_requested')
    .map((application) => {
      const contractor = contractors.find((item) => item.profileId === application.contractorProfileId);
      return contractor ? { application, contractor } : null;
    })
    .filter((item): item is { application: typeof detail.applications[number]; contractor: typeof contractors[number] } => Boolean(item));
  const hasMyWithdrawalRequest = currentProfileId
    ? withdrawalRequests.some(({ application }) => application.contractorProfileId === currentProfileId)
    : false;
  const isMeAssigned = currentProfileId
    ? eventCrew.some((contractor) => contractor.profileId === currentProfileId)
    : false;
  const effectiveDraftTimes = {
    from: applicationDraftTimes.from || event.startTime || '08:00',
    to: applicationDraftTimes.to || event.endTime || '17:00',
  };
  const eventApprovalTimelogs = canManageEvents
    ? eventTimelogs.filter((timelog) => (
        role === 'crewhead'
          ? timelog.status === 'draft' || timelog.status === 'pending_ch'
          : timelog.status === 'pending_coo'
      ))
    : [];

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

  const buildDraftTimelogForCrew = (contractor: Contractor): Timelog | null => {
    if (!contractor.profileId) {
      toast.error('Nepodařilo se dohledat UUID identitu člena crew.');
      return null;
    }

    const eventDates = getDatesBetween(event.startDate, event.endDate);
    if (eventDates.length === 0) {
      toast.error('Akce nemá platné datum pro nový výkaz.');
      return null;
    }

    return {
      id: Math.min(0, ...eventTimelogs.map((item) => item.id)) - 1,
      eid: event.id,
      contractorProfileId: contractor.profileId,
      days: eventDates.map((date) => ({
        d: date,
        f: event.startTime || '08:00',
        t: event.endTime || '17:00',
        type: event.dayTypes?.[date] ?? 'provoz',
      })),
      km: 0,
      note: '',
      status: 'draft',
    };
  };

  const openCrewTimelog = (contractor: Contractor, timelog?: Timelog) => {
    if (timelog) {
      if (!canEditTimelog(timelog, role)) return;
      setEditingTimelog(timelog);
      return;
    }

    if (!canCreateTimelog(role)) return;

    const draftTimelog = buildDraftTimelogForCrew(contractor);
    if (draftTimelog) {
      setEditingTimelog(draftTimelog);
    }
  };

  const handleApplyForEvent = () => {
    if (!currentProfileId) {
      toast.error('Nepodarilo se dohledat prihlaseneho clena crew.');
      return;
    }

    void applyForEvent(event.supabaseId ?? event.id, currentProfileId, event.allowCrewTimeProposal ? effectiveDraftTimes : undefined)
      .then(() => toast.success('Prihlaska na akci byla odeslana ke schvaleni.'))
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : 'Prihlaseni na akci se nepodarilo.');
      });
  };

  const handleWithdrawApplication = () => {
    if (!currentProfileId) {
      toast.error('Nepodarilo se dohledat prihlaseneho clena crew.');
      return;
    }

    void withdrawEventApplication(event.supabaseId ?? event.id, currentProfileId)
      .then(() => toast.success('Odhlaseni z akce bylo ulozeno.'))
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : 'Odhlaseni z akce se nepodarilo.');
      });
  };

  const handleRequestWithdrawal = () => {
    if (!currentProfileId) {
      toast.error('Nepodarilo se dohledat prihlaseneho clena crew.');
      return;
    }

    void requestEventWithdrawal(event.supabaseId ?? event.id, currentProfileId)
      .then(() => toast.success('Zadost o odhlaseni byla odeslana ke schvaleni.'))
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : 'Zadost o odhlaseni se nepodarila.');
      });
  };

  const handleApproveApplication = (applicationId: number) => {
    void approveEventApplication(applicationId)
      .then(() => toast.success('Crew byla prirazena na akci.'))
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : 'Prihlasku se nepodarilo schvalit.');
      });
  };

  const handleRejectApplication = (applicationId: number) => {
    void updateEventApplicationStatus(applicationId, 'rejected')
      .then(() => toast.success('Prihlaska byla zamitnuta.'))
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : 'Prihlasku se nepodarilo zamitnout.');
      });
  };

  const handleApproveWithdrawal = (applicationId: number) => {
    void approveEventWithdrawal(applicationId)
      .then(() => toast.success('Crew byla odhlasena z akce.'))
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : 'Odhlaseni se nepodarilo schvalit.');
      });
  };

  const handleRejectWithdrawal = (applicationId: number) => {
    void updateEventApplicationStatus(applicationId, 'approved')
      .then(() => toast.success('Zadost o odhlaseni byla zamitnuta.'))
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : 'Zadost o odhlaseni se nepodarilo zamitnout.');
      });
  };

  const handleCopyEvent = () => {
    setEditingEvent(createEventCopy(event));
  };

  const handleTimelogApprovalAction = (timelogId: number, action: 'sub' | 'ch' | 'coo' | 'rej') => {
    void updateTimelogStatus(timelogId, action)
      .then(loadDetail)
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : 'Nepodarilo se aktualizovat vykaz.');
      });
  };

  if (isCrewRole && isMobile) {
    const canOpenNewTimelog = Boolean(currentContractor && isMeAssigned && canCreateTimelog(role));
    const ownTimelog = myTimelogs[0];
    const canUseEvidence = Boolean(currentContractor && isMeAssigned && (ownTimelog || canOpenNewTimelog));
    const participationLabel = isMeAssigned
      ? 'Jsi přiřazen'
      : hasMyPendingApplication
        ? 'Čeká na schválení'
        : hasMyWithdrawalRequest
          ? 'Odhlášení čeká'
          : 'Volná akce';
    const mobilePlace = event.city || event.meetingLocation || 'Místo bude doplněno';
    const mobileMeetingLocation = event.meetingLocation?.trim();
    const shouldShowMeetingLocation = Boolean(
      mobileMeetingLocation && mobileMeetingLocation !== mobilePlace,
    );
    const formatMobileBoundaryDate = (date: string) => (
      new Date(date).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' })
    );
    const mobileStartDateTime = `${formatMobileBoundaryDate(event.startDate)} · ${event.startTime || 'čas bude doplněn'}`;
    const mobileEndDateTime = `${formatMobileBoundaryDate(event.endDate)} · ${event.endTime || 'čas bude doplněn'}`;
    const floatingPanelClassName = [
      'nodu-mobile-event-floating-panel',
      isMeAssigned ? 'nodu-mobile-event-floating-panel--actions-only' : '',
      !isMeAssigned ? 'nodu-mobile-event-floating-panel--compact' : '',
    ].filter(Boolean).join(' ');
    const formatMobileCrewHours = (hours: number) => (hours > 0 ? `${hours.toFixed(1)}h` : '0h');
    const handleOpenEvidence = () => {
      if (!currentContractor) return;
      openCrewTimelog(currentContractor, ownTimelog);
    };
    const handleConfirmWithdrawal = () => {
      setShowWithdrawalConfirm(false);
      handleRequestWithdrawal();
    };

    return (
      <motion.div className="nodu-mobile-event-detail" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
        <div className="nodu-mobile-event-scroll">
          <header className="nodu-mobile-event-topbar">
            <button
              type="button"
              onClick={() => setSelectedEventId(null)}
              className="nodu-mobile-event-back"
            >
              <ArrowLeft size={18} />
              <span className="sr-only">Zpět na akce</span>
            </button>
            <span className="nodu-mobile-event-participation-chip">{participationLabel}</span>
          </header>

          <section className="nodu-mobile-event-hero" aria-labelledby="mobile-event-title">
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="jn nodu-job-badge px-2 py-0.5 text-sm">{event.job}</span>
              <StatusBadge status={eventStatus} />
            </div>
            <h1 id="mobile-event-title" className="text-2xl font-bold text-[color:var(--nodu-text)]">{event.name}</h1>
            <div className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--nodu-text-soft)]">
              {event.client}
            </div>
          </section>

          <section className="nodu-mobile-event-map" aria-label={`Mapa akce ${mobilePlace}`}>
            <div className="nodu-mobile-event-map-pin" aria-hidden="true" />
            <span>Otevřít mapu</span>
          </section>

          <section className="nodu-mobile-event-card nodu-mobile-event-info-card" aria-label="Informace k akci">
            <div className="nodu-mobile-event-info-row">
              <MapPin size={18} />
              <div>
                <span className="nodu-mobile-event-info-label">Místo</span>
                <p>{mobilePlace}</p>
              </div>
            </div>
            <div className="nodu-mobile-event-info-row">
              <Clock size={18} />
              <div>
                <span className="nodu-mobile-event-info-label">Datum a čas</span>
                <div className="nodu-mobile-event-date-range">
                  <div>
                    <span>Od</span>
                    <p>{mobileStartDateTime}</p>
                  </div>
                  <div>
                    <span>Do</span>
                    <p>{mobileEndDateTime}</p>
                  </div>
                </div>
              </div>
            </div>
            {event.contactPerson && (
              <div className="nodu-mobile-event-info-row">
                <User size={18} />
                <div>
                  <span className="nodu-mobile-event-info-label">Kontakt</span>
                  <p>{event.contactPerson}</p>
                </div>
              </div>
            )}
            {shouldShowMeetingLocation && (
              <div className="nodu-mobile-event-info-row">
                <MapPin size={18} />
                <div>
                  <span className="nodu-mobile-event-info-label">Sraz</span>
                  <p>{mobileMeetingLocation}</p>
                </div>
              </div>
            )}
          </section>

          {!isMeAssigned && !hasMyPendingApplication && event.allowCrewTimeProposal && (
            <section className="nodu-mobile-event-card" aria-label="Čas přihlášky">
              <div className="grid grid-cols-2 gap-2">
                <label className="nodu-mobile-event-time-field">
                  <span>Od</span>
                  <input
                    type="time"
                    value={effectiveDraftTimes.from}
                    onChange={(changeEvent) => setApplicationDraftTimes((current) => ({ ...current, from: changeEvent.target.value }))}
                    aria-label="Plánovaný příchod"
                  />
                </label>
                <label className="nodu-mobile-event-time-field">
                  <span>Do</span>
                  <input
                    type="time"
                    value={effectiveDraftTimes.to}
                    onChange={(changeEvent) => setApplicationDraftTimes((current) => ({ ...current, to: changeEvent.target.value }))}
                    aria-label="Plánovaný odchod"
                  />
                </label>
              </div>
            </section>
          )}

          {(event.description || event.dresscode) && (
            <section className="nodu-mobile-event-section" aria-labelledby="mobile-event-description-title">
              <h2 id="mobile-event-description-title">Popis akce</h2>
              {event.description && <p>{event.description}</p>}
              {event.dresscode && (
                <p className="mt-2">
                  <span className="font-semibold text-[color:var(--nodu-text)]">Dresscode: </span>
                  {event.dresscode}
                </p>
              )}
            </section>
          )}

          <section className="nodu-mobile-event-section" aria-labelledby="mobile-event-assigned-crew-title">
            <h2 id="mobile-event-assigned-crew-title">Přiřazená crew</h2>
            {eventCrew.length > 0 ? (
              <div className="nodu-mobile-event-crew-list">
                {eventCrew.map((contractor) => {
                  const timelog = eventTimelogs.find((item) => item.contractorProfileId === contractor.profileId);
                  const hours = timelog ? calculateTotalHours(timelog.days) : 0;

                  return (
                    <div key={contractor.id} className="nodu-mobile-event-crew-row">
                      <div className="av h-10 w-10 text-[12px]" style={{ backgroundColor: contractor.bg, color: contractor.fg }}>{contractor.ii}</div>
                      <div>
                        <div className="nodu-mobile-event-crew-name">{contractor.name}</div>
                        <div className="nodu-mobile-event-crew-meta">{formatMobileCrewHours(hours)}</div>
                      </div>
                      {contractor.profileId === currentProfileId && <span className="nodu-mobile-event-crew-chip">Ty</span>}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="nodu-mobile-event-empty-state">Zatím není přiřazená žádná crew.</div>
            )}
          </section>
        </div>

        <div className={floatingPanelClassName} aria-label="Akce k události">
          {isMeAssigned ? (
            <>
              <button
                type="button"
                className="nodu-mobile-event-evidence-button"
                onClick={handleOpenEvidence}
                disabled={!canUseEvidence}
              >
                <FileText size={18} />
                Evidence práce
              </button>
              {!hasMyWithdrawalRequest ? (
                <button
                  type="button"
                  aria-label="Požádat o odhlášení"
                  className="nodu-mobile-event-withdraw-button"
                  onClick={() => setShowWithdrawalConfirm(true)}
                >
                  <X size={22} />
                </button>
              ) : (
                <div className="nodu-mobile-event-withdraw-pending">Odhlášení čeká</div>
              )}
            </>
          ) : hasMyPendingApplication ? (
            <button type="button" className="nodu-mobile-event-evidence-button nodu-mobile-event-evidence-button--secondary" onClick={handleWithdrawApplication}>
              Odhlásit se z akce
            </button>
          ) : (
            <>
              <button type="button" className="nodu-mobile-event-evidence-button nodu-mobile-event-evidence-button--secondary" onClick={handleApplyForEvent}>
                Přihlásit se
              </button>
            </>
          )}
        </div>

        {showWithdrawalConfirm && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-event-withdrawal-title"
            className="nodu-mobile-event-withdrawal-dialog"
          >
            <div className="nodu-mobile-event-withdrawal-panel">
              <h2 id="mobile-event-withdrawal-title">Opravdu požádat o odhlášení?</h2>
              <p>Po odeslání žádosti ji musí schválit CH nebo COO. Do té doby zůstaneš u akce vedený jako přiřazený.</p>
              <div className="nodu-mobile-event-withdrawal-actions">
                <button type="button" className="nodu-mobile-event-withdrawal-cancel" onClick={() => setShowWithdrawalConfirm(false)}>
                  Zůstat na akci
                </button>
                <button type="button" className="nodu-mobile-event-withdrawal-confirm" onClick={handleConfirmWithdrawal}>
                  Požádat
                </button>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    );
  }

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
                contractorProfileId: isCrewRole ? currentProfileId : undefined,
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
                <Button aria-label="Kopirovat akci na jiny den" onClick={handleCopyEvent} variant="outline">
                  <Copy size={16} />
                  Kopirovat
                </Button>
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
            {role === 'crew' && !isMeAssigned && !hasMyPendingApplication && (
              <>
                {event.allowCrewTimeProposal && (
                  <div className="flex items-center gap-1 rounded-xl border border-[color:var(--nodu-border)] bg-white px-2 py-1">
                    <input
                      type="time"
                      value={effectiveDraftTimes.from}
                      onChange={(changeEvent) => setApplicationDraftTimes((current) => ({ ...current, from: changeEvent.target.value }))}
                      className="w-20 bg-transparent text-[11px] font-semibold text-[color:var(--nodu-text)] outline-none"
                      aria-label="Planovany prichod"
                    />
                    <span className="text-[color:var(--nodu-text-soft)]">-</span>
                    <input
                      type="time"
                      value={effectiveDraftTimes.to}
                      onChange={(changeEvent) => setApplicationDraftTimes((current) => ({ ...current, to: changeEvent.target.value }))}
                      className="w-20 bg-transparent text-[11px] font-semibold text-[color:var(--nodu-text)] outline-none"
                      aria-label="Planovany odchod"
                    />
                  </div>
                )}
                <Button onClick={handleApplyForEvent} variant="outline">
                  Prihlasit na akci
                </Button>
              </>
            )}
            {role === 'crew' && hasMyPendingApplication && (
              <Button onClick={handleWithdrawApplication} variant="outline">
                Odhlasit se z akce
              </Button>
            )}
            {role === 'crew' && isMeAssigned && !hasMyWithdrawalRequest && (
              <Button onClick={handleRequestWithdrawal} variant="outline">
                Pozadat o odhlaseni
              </Button>
            )}
            {role === 'crew' && hasMyWithdrawalRequest && (
              <div className="rounded-xl border border-[color:rgb(var(--nodu-text-rgb)/0.14)] bg-[color:rgb(var(--nodu-text-rgb)/0.07)] px-4 py-2 text-xs font-semibold text-[color:var(--nodu-text-soft)]">
                Odhlaseni ceka na schvaleni
              </div>
            )}
          </div>
        </div>

        <div className="-mx-6 flex gap-1 border-b border-[color:var(--nodu-border)] px-6">
          <button
            onClick={() => setEventTab('overview')}
            className={`border-b-2 px-4 py-2 text-sm font-medium transition-all ${eventTab === 'overview' || eventTab === 'approval' ? 'border-[color:var(--nodu-accent)] text-[color:var(--nodu-accent)]' : 'border-transparent text-[color:var(--nodu-text-soft)] hover:text-[color:var(--nodu-text)]'}`}
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
          {eventTab === 'overview' || eventTab === 'approval' ? (
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
                      Prirazena Crew ({visibleEventCrew.length})
                    </button>
                    {canManageEvents && (
                      <button
                        type="button"
                        onClick={() => setCrewPanelTab('approval')}
                        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold transition-all ${crewPanelTab === 'approval' ? 'border-[color:var(--nodu-accent)] bg-[color:var(--nodu-accent-soft)] text-[color:var(--nodu-accent)]' : 'border-[color:var(--nodu-border)] bg-white text-[color:var(--nodu-text)] hover:border-[color:rgb(var(--nodu-accent-rgb)/0.34)] hover:text-[color:var(--nodu-accent)]'}`}
                      >
                        <FileText size={16} className="text-current" />
                        Schvalovani timelogu ({eventApprovalTimelogs.length})
                      </button>
                    )}
                  </div>

                  {crewPanelTab === 'assigned' ? (
                    <>
                      <div className="overflow-hidden rounded-[24px] border border-[color:var(--nodu-border)] bg-[color:var(--nodu-paper-strong)]">
                        <table className="w-full border-collapse text-left">
                          <thead>
                            <tr className="border-b border-[color:var(--nodu-border)] text-[10px] uppercase tracking-wider text-[color:var(--nodu-text-soft)]">
                              <th className="px-4 py-3 text-left font-medium">Jmeno</th>
                              {event.showDayTypes && <th className="px-4 py-3 text-left font-medium">Faze</th>}
                              <th className="px-4 py-3 text-left font-medium">Hodiny</th>
                              {canManageEvents && <th className="px-4 py-3 text-right font-medium">Celkem</th>}
                              <th className="px-4 py-3 text-right font-medium">Akce</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[color:rgb(var(--nodu-text-rgb)/0.06)]">
                            {visibleEventCrew.map((contractor) => {
                              const timelog = eventTimelogs.find((item) => item.contractorProfileId === contractor.profileId);
                              const hours = timelog ? calculateTotalHours(timelog.days) : 0;
                              const canOpenTimelog = timelog ? canEditTimelog(timelog, role) : canCreateTimelog(role);

                              return (
                                <tr
                                  key={contractor.id}
                                  onClick={() => openCrewTimelog(contractor, timelog)}
                                  className={`${canOpenTimelog ? 'cursor-pointer hover:bg-[color:var(--nodu-accent-soft)]' : 'cursor-default'} bg-white transition-colors`}
                                >
                                  <td className="px-4 py-3">
                                    <div className="flex items-center gap-2">
                                      <div className="av h-7 w-7 text-[10px]" style={{ backgroundColor: contractor.bg, color: contractor.fg }}>{contractor.ii}</div>
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
                                  {canManageEvents && (
                                    <td className="px-4 py-3 text-right text-xs font-bold text-[color:var(--nodu-text)]">{formatCurrency(hours * contractor.rate)}</td>
                                  )}
                                  <td className="px-4 py-3 text-right">
                                    {canManageEvents && (
                                      <div className="flex items-center justify-end gap-1">
                                        {canOpenTimelog && (
                                          <button
                                            onClick={(clickEvent) => {
                                              clickEvent.stopPropagation();
                                              openCrewTimelog(contractor, timelog);
                                            }}
                                            className="rounded-lg p-1.5 text-[color:var(--nodu-text-soft)] transition-all hover:bg-[color:var(--nodu-success-bg)] hover:text-[color:var(--nodu-success-text)]"
                                            title={timelog ? 'Upravit timelog' : 'Vytvorit timelog'}
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

                      {shouldShowCrewRatings && (
                        <EventCrewRatingPanel
                          event={event}
                          crew={eventCrew}
                          ratings={eventCrewRatings}
                          ratedByProfileId={currentProfileId}
                        />
                      )}
                    </>
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
                                ? 'Schvalit a poslat COO'
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
                                  {canEditTimelog(timelog, role) && (
                                    <Button size="sm" variant="outline" className="ml-auto h-8 text-[11px]" onClick={() => setEditingTimelog(timelog)}>
                                      Upravit
                                    </Button>
                                  )}
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

                {canManageEvents && (
                  <div>
                    <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold">
                      <Users size={16} className="text-[color:var(--nodu-text-soft)]" />
                      Prihlaseni na akci ({pendingApplications.length})
                    </h3>
                    <div className="overflow-hidden rounded-[24px] border border-[color:var(--nodu-border)] bg-[color:var(--nodu-paper-strong)]">
                      {pendingApplications.length > 0 ? (
                        <table className="w-full border-collapse text-left">
                          <thead>
                            <tr className="border-b border-[color:var(--nodu-border)] text-[10px] uppercase tracking-wider text-[color:var(--nodu-text-soft)]">
                              <th className="px-4 py-3 text-left font-medium">Jmeno</th>
                              <th className="px-4 py-3 text-left font-medium">Plan</th>
                              <th className="px-4 py-3 text-left font-medium">Stav</th>
                              <th className="px-4 py-3 text-right font-medium">Akce</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[color:rgb(var(--nodu-text-rgb)/0.06)]">
                            {pendingApplications.map(({ application, contractor }) => (
                              <tr key={application.id} className="bg-white">
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    <div className="av h-7 w-7 text-[10px]" style={{ backgroundColor: contractor.bg, color: contractor.fg }}>{contractor.ii}</div>
                                    <span className="text-xs font-medium text-[color:var(--nodu-text)]">{contractor.name}</span>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-xs font-semibold text-[color:var(--nodu-text-soft)]">
                                  {application.plannedFrom && application.plannedTo ? `${application.plannedFrom} - ${application.plannedTo}` : '-'}
                                </td>
                                <td className="px-4 py-3">
                                  <span className="rounded-full border border-[color:rgb(var(--nodu-text-rgb)/0.16)] bg-[color:rgb(var(--nodu-text-rgb)/0.08)] px-2.5 py-1 text-[10px] font-semibold text-[color:var(--nodu-text-soft)]">
                                    Ceka na schvaleni
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  {canManageEvents && (
                                    <div className="flex justify-end gap-1.5">
                                      <Button size="sm" className="h-8 text-[11px]" onClick={() => handleApproveApplication(application.id)}>
                                        Schvalit
                                      </Button>
                                      <Button size="sm" variant="outline" className="h-8 border-[#e8b4a3] text-[11px] text-[#c45c39] hover:bg-[rgba(212,93,55,0.06)] hover:text-[#c45c39]" onClick={() => handleRejectApplication(application.id)}>
                                        Zamitnout
                                      </Button>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <div className="rounded-[24px] border border-dashed border-[color:var(--nodu-border)] bg-white px-4 py-10 text-center text-sm text-[color:var(--nodu-text-soft)]">
                          Zadne dalsi prihlasky ke schvaleni.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {canManageEvents && withdrawalRequests.length > 0 && (
                  <div>
                    <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold">
                      <Users size={16} className="text-[color:var(--nodu-text-soft)]" />
                      Zadosti o odhlaseni ({withdrawalRequests.length})
                    </h3>
                    <div className="overflow-hidden rounded-[24px] border border-[color:var(--nodu-border)] bg-[color:var(--nodu-paper-strong)]">
                      <table className="w-full border-collapse text-left">
                        <thead>
                          <tr className="border-b border-[color:var(--nodu-border)] text-[10px] uppercase tracking-wider text-[color:var(--nodu-text-soft)]">
                            <th className="px-4 py-3 text-left font-medium">Jmeno</th>
                            <th className="px-4 py-3 text-left font-medium">Stav</th>
                            <th className="px-4 py-3 text-right font-medium">Akce</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[color:rgb(var(--nodu-text-rgb)/0.06)]">
                          {withdrawalRequests.map(({ application, contractor }) => (
                            <tr key={application.id} className="bg-white">
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <div className="av h-7 w-7 text-[10px]" style={{ backgroundColor: contractor.bg, color: contractor.fg }}>{contractor.ii}</div>
                                  <span className="text-xs font-medium text-[color:var(--nodu-text)]">{contractor.name}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <span className="rounded-full border border-[color:rgb(var(--nodu-text-rgb)/0.16)] bg-[color:rgb(var(--nodu-text-rgb)/0.08)] px-2.5 py-1 text-[10px] font-semibold text-[color:var(--nodu-text-soft)]">
                                  Ceka na schvaleni odhlaseni
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex justify-end gap-1.5">
                                  <Button size="sm" className="h-8 text-[11px]" onClick={() => handleApproveWithdrawal(application.id)}>
                                    Schvalit odhlaseni
                                  </Button>
                                  <Button size="sm" variant="outline" className="h-8 border-[#e8b4a3] text-[11px] text-[#c45c39] hover:bg-[rgba(212,93,55,0.06)] hover:text-[#c45c39]" onClick={() => handleRejectWithdrawal(application.id)}>
                                    Zamitnout
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                {isCrewRole ? (
                  <div className="rounded-[22px] border border-[color:var(--nodu-success-border)] bg-[color:var(--nodu-success-bg)] p-4">
                    <h4 className="mb-3 text-[10px] font-bold uppercase tracking-wider text-[color:var(--nodu-success-text)]">Predpokladany zisk</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-[color:var(--nodu-success-text)]">Moje hodiny</span>
                        <span className="font-bold text-[color:var(--nodu-text)]">{myHours.toFixed(1)}h</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-[color:var(--nodu-success-text)]">Hodinova sazba</span>
                        <span className="font-bold text-[color:var(--nodu-text)]">{formatCurrency(currentContractor?.rate ?? 0)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-[color:var(--nodu-success-text)]">Cestovne</span>
                        <span className="font-bold text-[color:var(--nodu-text)]">{formatCurrency(myTravelCost)}</span>
                      </div>
                      <div className="mt-2 flex justify-between border-t border-[color:var(--nodu-success-border)] pt-2 text-sm">
                        <span className="font-bold text-[color:var(--nodu-success-text)]">Odhad celkem</span>
                        <span className="font-black text-[color:var(--nodu-text)]">{formatCurrency(myProjectedProfit)}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
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
                  </>
                )}

                <div className="rounded-[22px] border border-[color:var(--nodu-border)] bg-[color:var(--nodu-paper-strong)] p-4">
                  <h4 className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-[color:var(--nodu-text-soft)]">
                    <Receipt size={12} className="text-[color:var(--nodu-text-soft)]" />
                    {isCrewRole ? 'Moje uctenky' : 'Uctenky'} ({visibleReceipts.length})
                  </h4>
                  <div className="space-y-2">
                    {visibleReceipts.slice(0, 4).map((receipt) => {
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
                    {visibleReceipts.length === 0 && (
                      <div className="rounded-xl border border-dashed border-[color:var(--nodu-border)] bg-white px-3 py-6 text-center text-xs text-[color:var(--nodu-text-soft)]">
                        {isCrewRole ? 'K teto akci zatim nemate zadane zadne uctenky.' : 'K teto akci zatim nejsou zadane zadne uctenky.'}
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
                {eventTimelogs.filter((timelog) => timelog.days.some((day) => day.d === eventTab)).map((timelog) => {
                  const contractor = contractors.find((item) => item.profileId === timelog.contractorProfileId);
                  if (!contractor) return null;
                  const matchingDays = timelog.days.filter((day) => day.d === eventTab);

                  return (
                    <div key={timelog.id} className="rounded-[22px] border border-[color:var(--nodu-border)] bg-white p-4 shadow-[0_14px_34px_rgba(47,38,31,0.06)] transition-shadow hover:shadow-[0_18px_42px_rgba(47,38,31,0.1)]">
                      <div className="mb-3 flex items-center gap-3">
                        <div className="av h-10 w-10 text-xs" style={{ backgroundColor: contractor.bg, color: contractor.fg }}>{contractor.ii}</div>
                        <div>
                          <div className="flex items-center gap-1.5 text-sm font-bold text-[color:var(--nodu-text)]">
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

                {eventTimelogs.filter((timelog) => timelog.days.some((day) => day.d === eventTab)).length === 0 && (
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
