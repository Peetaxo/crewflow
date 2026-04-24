import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAppContext } from '../context/useAppContext';
import { Contractor, Event, ReceiptItem, Timelog } from '../types';
import { calculateTotalHours, formatCurrency, formatDateRange, getDatesBetween, getEventStatus } from '../utils';
import StatCard from '../components/shared/StatCard';
import StatusBadge from '../components/shared/StatusBadge';
import {
} from '../features/invoices/services/invoices.service';
import {
  getTimelogDependencies,
} from '../features/timelogs/services/timelogs.service';
import { useEventsQuery } from '../features/events/queries/useEventsQuery';
import { useTimelogsQuery } from '../features/timelogs/queries/useTimelogsQuery';
import { useReceiptsQuery } from '../features/receipts/queries/useReceiptsQuery';
import { useInvoicesQuery } from '../features/invoices/queries/useInvoicesQuery';

const DashboardView = () => {
  const {
    role,
    searchQuery,
    setCurrentTab,
    setTimelogFilter,
    setSelectedEventId,
    setEventTab,
  } = useAppContext();
  const eventsQuery = useEventsQuery();
  const timelogsQuery = useTimelogsQuery();
  const receiptsQuery = useReceiptsQuery();
  const invoicesQuery = useInvoicesQuery();

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
      const event = events.find((item) => item.id === timelog.eid);
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
  const needsFilling = filteredEvents.filter((event) => event.filled < event.needed).length;
  const upcomingEvents = filteredEvents
    .filter((event) => getEventStatus(event) !== 'past')
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.endDate.localeCompare(b.endDate) || a.name.localeCompare(b.name))
    .slice(0, 10);

  const openTimelogs = () => {
    setTimelogFilter(approvalStatus);
    setCurrentTab('timelogs');
  };

  const openEventDetail = (eventId: number) => {
    setCurrentTab('events');
    setSelectedEventId(eventId);
    setEventTab('overview');
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="mb-5">
        <h1 className="text-lg font-semibold text-gray-900">Dashboard</h1>
        <p className="mt-0.5 text-xs text-gray-500">{roleLabel} · Duben 2026</p>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          label="Vykazy cekaji na me"
          value={pendingForMe}
          sub={reviewLabel}
          cls={pendingForMe ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}
        />
        <StatCard
          label="Faktury v procesu"
          value={pendingInvoices}
          sub="Self-billing"
          cls={pendingInvoices ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}
        />
        <StatCard
          label="Uctenky v procesu"
          value={pendingReceipts}
          sub="Cekaji na schvaleni"
          cls={pendingReceipts ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}
        />
        <StatCard
          label="Schvalene hodiny"
          value={`${Math.round(approvedHours)}h`}
          sub="Tento mesic"
          cls="bg-emerald-50 text-emerald-700"
        />
        <StatCard
          label="Akce bez obsazeni"
          value={needsFilling}
          sub="Chybi crew"
          cls={needsFilling ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm lg:col-span-3">
          <h2 className="mb-3 text-[13px] font-semibold">Timelogy ke zpracovani</h2>
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
                    onClick={openTimelogs}
                    className="flex w-full items-center gap-3 rounded-lg border-b border-gray-50 py-2 text-left transition-colors hover:bg-gray-50 last:border-0"
                  >
                    <div className="av h-8 w-8 text-[10px]" style={{ backgroundColor: contractor.bg, color: contractor.fg }}>
                      {contractor.ii}
                    </div>
                    <div className="min-width-0 flex-1">
                      <div className="truncate text-xs font-semibold">{contractor.name}</div>
                      <div className="text-[11px] text-gray-500">
                        {event.name} <span className="jn">{event.job}</span>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-xs font-semibold">{hours.toFixed(1)}h</div>
                      <div className="text-[11px] text-gray-500">{formatCurrency(hours * contractor.rate)}</div>
                    </div>
                    <div className="rounded-md p-1.5 text-emerald-600">
                      <ChevronRight size={14} />
                    </div>
                  </button>
                );
              })}

            {timelogQueue.length === 0 && (
              <div className="py-8 text-center text-sm text-gray-400">Zadne vykazy k akci</div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm lg:col-span-2">
          <h2 className="mb-3 text-[13px] font-semibold">Nadchazejici akce</h2>
          <div className="space-y-3">
            {upcomingEvents.map((event) => (
              <button
                key={event.id}
                onClick={() => openEventDetail(event.id)}
                className="block w-full border-b border-gray-50 pb-3 text-left transition-colors hover:bg-gray-50 last:border-0 last:pb-0"
              >
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="jn">{event.job}</span>
                  <StatusBadge status={getEventStatus(event)} />
                </div>
                <div className="truncate text-xs font-semibold">{event.name}</div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-gray-500">
                  {formatDateRange(event.startDate, event.endDate)} · {event.city}
                  {event.startDate !== event.endDate && (
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-tighter text-gray-600">
                      {getDatesBetween(event.startDate, event.endDate).length} dny
                    </span>
                  )}
                </div>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className={`h-full rounded-full ${event.filled >= event.needed ? 'bg-emerald-500' : 'bg-amber-500'}`}
                    style={{ width: `${Math.min(100, Math.round((event.filled / event.needed) * 100))}%` }}
                  />
                </div>
                <div className="mt-1 text-[10px] text-gray-500">{event.filled}/{event.needed} crew</div>
              </button>
            ))}

            {upcomingEvents.length === 0 && (
              <div className="py-8 text-center text-sm text-gray-400">Zadne nadchazejici akce</div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default DashboardView;
