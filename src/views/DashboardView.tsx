import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronRight, ClipboardCheck, UserPlus, Users } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAppContext } from '../context/useAppContext';
import { Contractor, Event, EventApplication, ReceiptItem, Timelog } from '../types';
import { calculateMealAllowance, calculateTotalHours, formatCurrency, formatDateRange, getDatesBetween, getEventStatus } from '../utils';
import StatCard from '../components/shared/StatCard';
import StatusBadge from '../components/shared/StatusBadge';
import { useIsMobile } from '../hooks/use-mobile';
import {
  getTimelogDependencies,
} from '../features/timelogs/services/timelogs.service';
import { getPendingEventApplications } from '../features/events/services/events.service';
import { useEventsQuery } from '../features/events/queries/useEventsQuery';
import { useTimelogsQuery } from '../features/timelogs/queries/useTimelogsQuery';
import { useReceiptsQuery } from '../features/receipts/queries/useReceiptsQuery';
import { useInvoicesQuery } from '../features/invoices/queries/useInvoicesQuery';

type PendingCrewApplicationViewModel = {
  application: EventApplication;
  event: Event;
  contractor: Contractor;
};

const idsMatch = (left: unknown, right: unknown): boolean => (
  left != null && right != null && String(left) === String(right)
);

const applicationMatchesDashboardEvent = (application: EventApplication, event: Event): boolean => (
  idsMatch(application.eventId, event.id)
  || idsMatch(application.eventId, event.supabaseId)
  || idsMatch(application.eventSupabaseId, event.supabaseId)
  || idsMatch(application.eventSupabaseId, event.id)
);

const DashboardView = () => {
  const {
    role,
    searchQuery,
    setCurrentTab,
    setSelectedEventId,
    setEventTab,
  } = useAppContext();
  const eventsQuery = useEventsQuery();
  const timelogsQuery = useTimelogsQuery();
  const receiptsQuery = useReceiptsQuery();
  const invoicesQuery = useInvoicesQuery();
  const isMobile = useIsMobile();

  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [events, setEvents] = useState<Event[]>([]);

  const loadData = useCallback(() => {
    const dependencies = getTimelogDependencies();
    setContractors(dependencies.contractors ?? []);
    setEvents(eventsQuery.data ?? []);
  }, [eventsQuery.data]);

  useEffect(() => {
    loadData();
  }, [eventsQuery.data, invoicesQuery.data, loadData, timelogsQuery.data, receiptsQuery.data]);

  const findContractor = useCallback((contractorProfileId?: string) => (
    contractorProfileId
      ? contractors.find((contractor) => contractor.profileId === contractorProfileId) ?? null
      : null
  ), [contractors]);

  const filteredEvents = useMemo(() => {
    const safeEvents = eventsQuery.data ?? [];
    const query = searchQuery.trim().toLowerCase();

    if (!query) return safeEvents;

    return safeEvents.filter((event) => (
      event.name.toLowerCase().includes(query) || event.job.toLowerCase().includes(query)
    ));
  }, [eventsQuery.data, searchQuery]);

  const timelogs = useMemo(() => {
    const safeTimelogs = timelogsQuery.data ?? [];
    const query = searchQuery.trim().toLowerCase();

    if (!query) return safeTimelogs;

    return safeTimelogs.filter((timelog) => {
      const event = events.find((item) => item.id === timelog.eid || item.supabaseId === timelog.eid);
      const contractor = findContractor(timelog.contractorProfileId);
      if (!event || !contractor) return false;

      return (
        event.name.toLowerCase().includes(query)
        || event.job.toLowerCase().includes(query)
        || contractor.name.toLowerCase().includes(query)
      );
    });
  }, [events, findContractor, searchQuery, timelogsQuery.data]);

  const receipts = useMemo(() => {
    const safeReceipts = receiptsQuery.data ?? [];
    const query = searchQuery.trim().toLowerCase();

    if (!query) return safeReceipts;

    return safeReceipts.filter((receipt) => {
      const event = events.find((item) => item.id === receipt.eid);
      const contractor = findContractor(receipt.contractorProfileId);
      if (!event || !contractor) return false;

      return (
        receipt.title.toLowerCase().includes(query)
        || receipt.vendor.toLowerCase().includes(query)
        || receipt.job.toLowerCase().includes(query)
        || event.name.toLowerCase().includes(query)
        || contractor.name.toLowerCase().includes(query)
      );
    });
  }, [events, findContractor, receiptsQuery.data, searchQuery]);

  const filteredInvoices = useMemo(() => {
    const safeInvoices = invoicesQuery.data ?? [];
    const query = searchQuery.trim().toLowerCase();

    if (!query) return safeInvoices;

    return safeInvoices.filter((invoice) => {
      const event = invoice.eid ? events.find((item) => item.id === invoice.eid) : null;
      const contractor = findContractor(invoice.contractorProfileId);

      return (
        invoice.id.toLowerCase().includes(query)
        || invoice.job.toLowerCase().includes(query)
        || contractor?.name.toLowerCase().includes(query)
        || event?.name.toLowerCase().includes(query)
        || event?.job.toLowerCase().includes(query)
        || false
      );
    });
  }, [events, findContractor, invoicesQuery.data, searchQuery]);

  const findEvent = useCallback((id: number) => (
    events.find((event) => event.id === id) ?? null
  ), [events]);

  const approvalStatus = role === 'crewhead' ? 'pending_ch' : 'pending_coo';
  const roleLabel = role === 'crewhead' ? 'Pohled CrewHead' : 'Pohled COO';
  const reviewLabel = role === 'crewhead' ? 'Ke kontrole (CH)' : 'Ke schvaleni (COO)';

  const timelogQueue = useMemo(() => (
    timelogs.filter((timelog) => timelog.status === approvalStatus)
  ), [approvalStatus, timelogs]);
  const pendingForMe = timelogQueue.length;
  const pendingInvoices = filteredInvoices.filter((invoice) => invoice.status === 'sent').length;
  const pendingReceipts = receipts.filter((receipt) => receipt.status === 'submitted' || receipt.status === 'approved').length;
  const approvedHours = timelogs
    .filter((timelog) => timelog.status === 'approved' || timelog.status === 'invoiced' || timelog.status === 'paid')
    .reduce((sum, timelog) => sum + calculateTotalHours(timelog.days), 0);
  const actionableEvents = filteredEvents.filter((event) => getEventStatus(event) !== 'past');
  const needsFilling = actionableEvents.filter((event) => event.filled < event.needed).length;
  const openCrewSlots = actionableEvents.reduce((sum, event) => sum + Math.max(0, event.needed - event.filled), 0);
  const incompleteEvents = actionableEvents.filter((event) => (
    !event.address?.trim()
    || (!event.contactProfileId && !event.contactPerson?.trim())
  ));
  const incompleteCrewProfiles = contractors.filter((contractor) => (
    !contractor.phone?.trim()
    || !contractor.email?.trim()
    || !contractor.bank?.trim()
  ));
  const timelogsWaitingForCrew = timelogs.filter((timelog) => timelog.status === 'pending_crew_confirmation');
  const incompleteTotal = incompleteEvents.length + incompleteCrewProfiles.length + timelogsWaitingForCrew.length;
  const upcomingEvents = actionableEvents
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.endDate.localeCompare(b.endDate) || a.name.localeCompare(b.name))
    .slice(0, 10);
  const pendingCrewApplications = useMemo<PendingCrewApplicationViewModel[]>(() => (
    getPendingEventApplications()
      .map((application) => {
        const event = actionableEvents.find((item) => applicationMatchesDashboardEvent(application, item));
        const contractor = findContractor(application.contractorProfileId);

        return event && contractor ? { application, event, contractor } : null;
      })
      .filter((item): item is PendingCrewApplicationViewModel => Boolean(item))
      .sort((a, b) => (
        a.event.startDate.localeCompare(b.event.startDate)
        || a.event.name.localeCompare(b.event.name)
        || a.contractor.name.localeCompare(b.contractor.name)
      ))
  ), [actionableEvents, findContractor]);
  const pendingApplicationEventsCount = new Set(pendingCrewApplications.map((item) => item.event.supabaseId ?? item.event.id)).size;

  const incompletePriorityItems = [
    ...incompleteEvents.slice(0, 2).map((event) => ({
      id: `event-${event.id}`,
      title: event.name,
      detail: !event.address?.trim() ? 'Chybí adresa' : 'Chybí kontakt',
      onClick: () => openEventDetail(event),
    })),
    ...timelogsWaitingForCrew.slice(0, 2).map((timelog) => {
      const event = findEvent(timelog.eid);
      const contractor = findContractor(timelog.contractorProfileId);

      return {
        id: `timelog-${timelog.id}`,
        title: event?.name ?? 'Výkaz práce',
        detail: contractor ? `${contractor.name} čeká na potvrzení` : 'Čeká na potvrzení crew',
        onClick: () => (event ? openEventDetail(event, 'approval') : openTab('timelogs')),
      };
    }),
    ...incompleteCrewProfiles.slice(0, 2).map((contractor) => ({
      id: `crew-${contractor.profileId ?? contractor.id}`,
      title: contractor.name,
      detail: 'Chybí údaje v profilu',
      onClick: () => openTab('crew'),
    })),
  ].slice(0, 3);

  const openEventDetail = (event: Event, tab = 'overview') => {
    setCurrentTab('events');
    setSelectedEventId(event.supabaseId ?? event.id);
    setEventTab(tab);
  };

  const openTab = (tab: string) => {
    setSelectedEventId(null);
    setCurrentTab(tab);
  };

  const formatCount = (value: number, one: string, few: string, many: string) => {
    const label = value === 1 ? one : value >= 2 && value <= 4 ? few : many;
    return `${value} ${label}`;
  };

  const formatIncompleteSummary = (value: number) => {
    if (value === 1) return '1 položka vyžaduje doplnění';
    if (value >= 2 && value <= 4) return `${value} položky vyžadují doplnění`;
    return `${value} položek vyžaduje doplnění`;
  };

  const formatApplicationTimeRange = (application: EventApplication) => {
    if (application.plannedFrom && application.plannedTo) {
      return `${application.plannedFrom}-${application.plannedTo}`;
    }

    if (application.plannedFrom) return `Od ${application.plannedFrom}`;
    if (application.plannedTo) return `Do ${application.plannedTo}`;
    return 'Bez návrhu času';
  };

  const openIncompleteItems = () => {
    if (incompleteEvents.length > 0) {
      openTab('events');
      return;
    }

    if (timelogsWaitingForCrew.length > 0) {
      openTab('timelogs');
      return;
    }

    openTab('crew');
  };

  if (isMobile && (role === 'crewhead' || role === 'coo')) {
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="nodu-management-overview-mobile">
        <header className="nodu-management-overview-header">
          <p className="nodu-dashboard-kicker">Management</p>
          <h1 className="nodu-management-overview-title">Přehled</h1>
          <p className="nodu-management-overview-lead">{role === 'crewhead' ? 'CH pohled' : 'COO pohled'}</p>
        </header>

        <section className="nodu-management-overview-grid" aria-label="Rychlý stav">
          <button type="button" className="nodu-management-overview-tile nodu-management-overview-tile--primary" onClick={() => openTab('timelogs')}>
            <span className="nodu-management-overview-tile-icon"><ClipboardCheck size={18} aria-hidden="true" /></span>
            <span className="nodu-management-overview-tile-label">Ke schválení</span>
            <strong>{formatCount(pendingForMe, 'výkaz', 'výkazy', 'výkazů')}</strong>
            <span>{reviewLabel}</span>
          </button>

          <button type="button" className="nodu-management-overview-tile" onClick={() => openTab('events')}>
            <span className="nodu-management-overview-tile-icon"><Users size={18} aria-hidden="true" /></span>
            <span className="nodu-management-overview-tile-label">Obsazení</span>
            <strong>{formatCount(openCrewSlots, 'volné místo', 'volná místa', 'volných míst')}</strong>
            <span>{needsFilling ? `${needsFilling} akce k řešení` : 'Vše obsazeno'}</span>
          </button>
        </section>

        <section className="nodu-management-overview-strip" aria-label="Další stav">
          <div>
            <span>Faktury</span>
            <strong>{pendingInvoices}</strong>
          </div>
          <div>
            <span>Účtenky</span>
            <strong>{pendingReceipts}</strong>
          </div>
          <div>
            <span>Hodiny</span>
            <strong>{Math.round(approvedHours)}h</strong>
          </div>
        </section>

        {pendingCrewApplications.length > 0 && (
          <section className="nodu-management-overview-section nodu-management-overview-section--compact">
            <div className="nodu-management-overview-section-header">
              <h2>Přihlášky crew</h2>
              <button type="button" onClick={() => openEventDetail(pendingCrewApplications[0].event)}>
                Otevřít
              </button>
            </div>
            <div className="nodu-management-overview-incomplete-summary">
              <strong>{formatCount(pendingCrewApplications.length, 'přihláška čeká', 'přihlášky čekají', 'přihlášek čeká')}</strong>
              <div className="nodu-management-overview-incomplete-chips">
                <span>{formatCount(pendingApplicationEventsCount, 'akce', 'akce', 'akcí')}</span>
              </div>
            </div>
            <div className="nodu-management-overview-list nodu-management-overview-list--compact">
              {pendingCrewApplications.slice(0, 3).map(({ application, event, contractor }) => (
                <button
                  key={application.supabaseId ?? application.id}
                  type="button"
                  className="nodu-management-overview-row nodu-management-overview-row--compact"
                  onClick={() => openEventDetail(event)}
                >
                  <span className="nodu-management-overview-tile-icon"><UserPlus size={18} aria-hidden="true" /></span>
                  <div className="min-w-0 flex-1">
                    <strong>{contractor.name}</strong>
                    <span>{event.name} · {formatApplicationTimeRange(application)}</span>
                  </div>
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="nodu-management-overview-section">
          <div className="nodu-management-overview-section-header">
            <h2>Schvalování</h2>
            <button type="button" onClick={() => openTab('timelogs')}>Otevřít schvalování</button>
          </div>
          <div className="nodu-management-overview-list">
            {timelogQueue.slice(0, 3).map((timelog) => {
              const contractor = findContractor(timelog.contractorProfileId);
              const event = findEvent(timelog.eid);
              if (!contractor || !event) return null;

              const hours = calculateTotalHours(timelog.days);

              return (
                <button key={timelog.id} type="button" className="nodu-management-overview-row" onClick={() => openEventDetail(event, 'approval')}>
                  <div className="av h-9 w-9 text-[11px]" style={{ backgroundColor: contractor.bg, color: contractor.fg }}>
                    {contractor.ii}
                  </div>
                  <div className="min-w-0 flex-1">
                    <strong>{contractor.name}</strong>
                    <span>{event.name}</span>
                  </div>
                  <span className="nodu-management-overview-value">{hours.toFixed(1)}h</span>
                </button>
              );
            })}

            {timelogQueue.length === 0 && (
              <div className="nodu-dashboard-empty">Žádné výkazy k akci</div>
            )}
          </div>
        </section>

        <section className="nodu-management-overview-section">
          <div className="nodu-management-overview-section-header">
            <h2>Nejbližší akce</h2>
            <button type="button" onClick={() => openTab('events')}>Otevřít akce</button>
          </div>
          <div className="nodu-management-overview-list">
            {upcomingEvents.slice(0, 3).map((event) => (
              <button key={event.id} type="button" className="nodu-management-overview-row" onClick={() => openEventDetail(event)}>
                <span className="nodu-management-overview-tile-icon"><CalendarDays size={18} aria-hidden="true" /></span>
                <div className="min-w-0 flex-1">
                  <strong>{event.name}</strong>
                  <span>{formatDateRange(event.startDate, event.endDate)} · {event.filled}/{event.needed}</span>
                </div>
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            ))}

            {upcomingEvents.length === 0 && (
              <div className="nodu-dashboard-empty">Žádné nadcházející akce</div>
            )}
          </div>
        </section>

        <section className="nodu-management-overview-section nodu-management-overview-section--compact">
          <div className="nodu-management-overview-section-header">
            <h2>Rozpracované</h2>
            <button type="button" onClick={openIncompleteItems}>Zobrazit</button>
          </div>
          <div className="nodu-management-overview-incomplete-summary">
            <strong>{formatIncompleteSummary(incompleteTotal)}</strong>
            <div className="nodu-management-overview-incomplete-chips">
              <span>{formatCount(incompleteEvents.length, 'akce', 'akce', 'akcí')}</span>
              <span>{formatCount(incompleteCrewProfiles.length, 'crew profil', 'crew profily', 'crew profilů')}</span>
              <span>{formatCount(timelogsWaitingForCrew.length, 'výkaz', 'výkazy', 'výkazů')}</span>
            </div>
          </div>
          {incompletePriorityItems.length > 0 ? (
            <div className="nodu-management-overview-list nodu-management-overview-list--compact">
              {incompletePriorityItems.map((item) => (
                <button key={item.id} type="button" className="nodu-management-overview-row nodu-management-overview-row--compact" onClick={item.onClick}>
                  <div className="min-w-0 flex-1">
                    <strong>{item.title}</strong>
                    <span>{item.detail}</span>
                  </div>
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              ))}
            </div>
          ) : (
            <div className="nodu-dashboard-empty">Všechno důležité je doplněné</div>
          )}
        </section>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="nodu-dashboard-shell">
      <div className="mb-6">
        <p className="nodu-dashboard-kicker">Pilot overview</p>
        <h1 className="nodu-dashboard-heading">Dashboard</h1>
        <p className="nodu-dashboard-lead">
          {roleLabel} · Duben 2026
        </p>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          label="Vykazy cekaji na me"
          value={pendingForMe}
          sub={reviewLabel}
          cls={pendingForMe ? 'bg-[color:var(--nodu-warning-bg)] text-[color:var(--nodu-warning-text)]' : 'bg-[color:var(--nodu-success-bg)] text-[color:var(--nodu-success-text)]'}
        />
        <StatCard
          label="Faktury v procesu"
          value={pendingInvoices}
          sub="Self-billing"
          cls={pendingInvoices ? 'bg-[color:var(--nodu-warning-bg)] text-[color:var(--nodu-warning-text)]' : 'bg-[color:var(--nodu-success-bg)] text-[color:var(--nodu-success-text)]'}
        />
        <StatCard
          label="Uctenky v procesu"
          value={pendingReceipts}
          sub="Cekaji na schvaleni"
          cls={pendingReceipts ? 'bg-[color:var(--nodu-warning-bg)] text-[color:var(--nodu-warning-text)]' : 'bg-[color:var(--nodu-success-bg)] text-[color:var(--nodu-success-text)]'}
        />
        <StatCard
          label="Schvalene hodiny"
          value={`${Math.round(approvedHours)}h`}
          sub="Tento mesic"
          cls="bg-[color:var(--nodu-success-bg)] text-[color:var(--nodu-success-text)]"
        />
        <StatCard
          label="Akce bez obsazeni"
          value={needsFilling}
          sub="Chybi crew"
          cls={needsFilling ? 'bg-[color:var(--nodu-error-bg)] text-[color:var(--nodu-error-text)]' : 'bg-[color:var(--nodu-success-bg)] text-[color:var(--nodu-success-text)]'}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="nodu-dashboard-panel rounded-[28px] p-5 lg:col-span-3">
          <h2 className="nodu-dashboard-panel-title mb-3">Ke schválení</h2>
          <div className="space-y-1">
            {timelogQueue
              .slice(0, 4)
              .map((timelog) => {
                const contractor = findContractor(timelog.contractorProfileId);
                const event = findEvent(timelog.eid);
                if (!contractor || !event) return null;

                const hours = calculateTotalHours(timelog.days);

                return (
                  <button
                    key={timelog.id}
                    onClick={() => openEventDetail(event, 'approval')}
                    className="nodu-dashboard-row flex w-full items-center gap-3 rounded-[20px] border-b px-3 py-3 text-left transition-colors last:border-0"
                  >
                    <div className="av h-8 w-8 text-[10px]" style={{ backgroundColor: contractor.bg, color: contractor.fg }}>
                      {contractor.ii}
                    </div>
                    <div className="min-width-0 flex-1">
                      <div className="nodu-dashboard-row-title">{contractor.name}</div>
                      <div className="nodu-dashboard-row-meta mt-1 gap-2">
                        <span>{event.name}</span>
                        <span className="jn nodu-job-badge">{event.job}</span>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="nodu-dashboard-row-value">{hours.toFixed(1)}h</div>
                      <div className="text-[11px] text-[color:var(--nodu-text-soft)]">{formatCurrency(hours * contractor.rate + calculateMealAllowance(timelog.days, { enabled: Boolean(event.mealAllowanceEnabled) }))}</div>
                    </div>
                    <div className="nodu-dashboard-action">
                      <ChevronRight size={14} />
                    </div>
                  </button>
                );
              })}

            {timelogQueue.length === 0 && (
              <div className="nodu-dashboard-empty">Zadne vykazy k akci</div>
            )}
          </div>
        </div>

        <div className="nodu-dashboard-panel rounded-[28px] p-5 lg:col-span-2">
          <h2 className="nodu-dashboard-panel-title mb-3">Nadchazejici akce</h2>
          <div className="space-y-3">
            {upcomingEvents.map((event) => (
              <button
                key={event.id}
                onClick={() => openEventDetail(event)}
                className="nodu-dashboard-row block w-full rounded-[22px] border px-3 pb-3 pt-3 text-left transition-colors last:pb-3"
              >
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="jn nodu-job-badge">{event.job}</span>
                  <StatusBadge status={getEventStatus(event)} />
                </div>
                <div className="nodu-dashboard-row-title">{event.name}</div>
                <div className="nodu-dashboard-row-meta mt-0.5 gap-1.5">
                  {formatDateRange(event.startDate, event.endDate)} · {event.city}
                  {event.startDate !== event.endDate && (
                    <span className="nodu-event-meta-badge rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em]">
                      {getDatesBetween(event.startDate, event.endDate).length} dny
                    </span>
                  )}
                </div>
                <div className="nodu-dashboard-progress-track mt-2">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, Math.round((event.filled / event.needed) * 100))}%`,
                      backgroundColor: event.filled >= event.needed ? 'var(--nodu-success-text)' : 'var(--nodu-warning-text)',
                    }}
                  />
                </div>
                <div className="mt-1 text-[10px] text-[color:var(--nodu-text-soft)]">{event.filled}/{event.needed} crew</div>
              </button>
            ))}

            {upcomingEvents.length === 0 && (
              <div className="nodu-dashboard-empty">Zadne nadchazejici akce</div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default DashboardView;
