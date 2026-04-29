import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, FileText, Plus, Upload, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  addDays,
  addMonths,
  format,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { cs } from 'date-fns/locale';
import { toast } from 'sonner';
import { useAuth } from '../app/providers/useAuth';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import type { FleetReservation, FleetReservationDraft, FleetVehicleStatus } from '../types';
import {
  createEmptyFleetReservation,
  findFleetReservationConflicts,
  getFleetDependencies,
  getFleetOverviewRows,
  getFleetVehicleDetail,
  saveFleetReservation,
  subscribeToFleetChanges,
} from '../features/fleet/services/fleet.service';

const statusLabels: Record<FleetVehicleStatus, string> = {
  available: 'Volné',
  reserved: 'Rezervované',
  service: 'Servis',
  out_of_order: 'Mimo provoz',
};

const statusClass: Record<FleetVehicleStatus | 'conflict', string> = {
  available: 'border-[color:var(--nodu-success-border)] bg-[color:var(--nodu-success-bg)] text-[color:var(--nodu-success-text)]',
  reserved: 'border-[color:rgb(var(--nodu-accent-rgb)/0.2)] bg-[color:rgb(var(--nodu-accent-rgb)/0.08)] text-[color:var(--nodu-accent)]',
  service: 'border-amber-200 bg-amber-50 text-amber-800',
  out_of_order: 'border-red-200 bg-red-50 text-red-700',
  conflict: 'border-red-200 bg-red-50 text-red-700',
};

const formatDateTime = (value: string) => (
  new Date(value).toLocaleString('cs-CZ', {
    day: 'numeric',
    month: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
);

const toDateInputValue = (value: string) => value.slice(0, 16);

const badgeClass = 'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold';
const labelClass = 'mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--nodu-text-soft)]';
const selectClass = 'h-10 w-full rounded-xl border border-[var(--nodu-border)] bg-white px-3 text-sm text-[var(--nodu-text)] outline-none transition focus:border-[var(--nodu-accent)] focus:ring-2 focus:ring-[rgba(var(--nodu-accent-rgb),0.16)]';
const vehicleCalendarPalette = [
  { backgroundColor: '#fff3e8', borderColor: '#fb923c', color: '#9a3412' },
  { backgroundColor: '#ecfdf5', borderColor: '#34d399', color: '#065f46' },
  { backgroundColor: '#eff6ff', borderColor: '#60a5fa', color: '#1d4ed8' },
  { backgroundColor: '#fdf2f8', borderColor: '#f472b6', color: '#9d174d' },
  { backgroundColor: '#fefce8', borderColor: '#facc15', color: '#854d0e' },
  { backgroundColor: '#f0fdfa', borderColor: '#2dd4bf', color: '#0f766e' },
  { backgroundColor: '#f5f3ff', borderColor: '#a78bfa', color: '#6d28d9' },
  { backgroundColor: '#f8fafc', borderColor: '#94a3b8', color: '#334155' },
];

interface UploadedVehicleDocument {
  id: string;
  name: string;
  addedAt: string;
}

const getStableCalendarDays = (calendarDate: Date) => {
  const start = startOfWeek(startOfMonth(calendarDate), { weekStartsOn: 1 });
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
};

const getVehicleCalendarStyle = (vehicleIndex: number) => (
  vehicleCalendarPalette[vehicleIndex % vehicleCalendarPalette.length]
);

const getCalendarDayClassName = (isCurrentMonth: boolean) => {
  const monthClass = isCurrentMonth
    ? 'border-[color:var(--nodu-border)] bg-white/70'
    : 'border-transparent bg-[color:rgb(var(--nodu-text-rgb)/0.03)] text-[color:var(--nodu-text-soft)]';

  return `min-h-20 rounded-xl border p-2 text-left ${monthClass}`;
};

const getTodayCalendarDayStyle = (isToday: boolean): React.CSSProperties | undefined => (
  isToday
    ? {
      backgroundColor: 'rgb(var(--nodu-accent-rgb) / 0.1)',
      borderColor: 'rgb(var(--nodu-accent-rgb) / 0.42)',
    }
    : undefined
);

const FleetView: React.FC = () => {
  const { currentProfileId } = useAuth();
  const referenceDate = new Date().toISOString().split('T')[0];
  const [, setVersion] = useState(0);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [selectedCalendarReservationId, setSelectedCalendarReservationId] = useState<number | null>(null);
  const [editingReservation, setEditingReservation] = useState<FleetReservationDraft | null>(null);
  const [calendarMonth, setCalendarMonth] = useState<Date | null>(null);
  const [overviewCalendarMonth, setOverviewCalendarMonth] = useState<Date | null>(null);
  const [vehicleDocuments, setVehicleDocuments] = useState<Record<string, UploadedVehicleDocument[]>>({
    'crafter-1': [
      { id: 'doc-crafter-1-stk', name: 'STK protokol 2026.pdf', addedAt: '2026-04-20' },
      { id: 'doc-crafter-1-pojisteni', name: 'Pojistka Crafter 1.pdf', addedAt: '2026-04-18' },
    ],
  });

  const reload = useCallback(() => setVersion((value) => value + 1), []);

  useEffect(() => subscribeToFleetChanges(reload), [reload]);

  const dependencies = getFleetDependencies();
  const rows = getFleetOverviewRows(referenceDate);
  const selectedDetail = selectedVehicleId ? getFleetVehicleDetail(selectedVehicleId, referenceDate) : null;
  const selectedVehicle = selectedDetail?.vehicle ?? null;
  const selectedCalendarReservation = selectedCalendarReservationId
    ? dependencies.reservations.find((reservation) => reservation.id === selectedCalendarReservationId) ?? null
    : null;
  const responsibleProfileId = currentProfileId
    ?? dependencies.contractors[0]?.profileId
    ?? '';

  const openNewReservation = (vehicleId: string) => {
    const draft = createEmptyFleetReservation(vehicleId, responsibleProfileId);
    const now = new Date();
    now.setMinutes(0, 0, 0);
    const end = new Date(now);
    end.setHours(end.getHours() + 8);

    setEditingReservation({
      ...draft,
      startsAt: toDateInputValue(now.toISOString()),
      endsAt: toDateInputValue(end.toISOString()),
    });
  };

  const getProjectLabel = (projectId: string) => {
    const project = dependencies.projects.find((item) => item.id === projectId);
    return project ? project.name : projectId;
  };

  const getProjectMeta = (projectId: string) => {
    const project = dependencies.projects.find((item) => item.id === projectId);
    return {
      name: project ? project.name : projectId,
      jobNumber: project?.id ?? projectId,
    };
  };

  const getEventLabel = (eventId: number | null) => {
    if (!eventId) return 'Bez konkrétní akce';
    const event = dependencies.events.find((item) => item.id === eventId);
    return event ? event.name : 'Akce nenalezena';
  };

  const getResponsibleName = (profileId: string) => (
    dependencies.contractors.find((item) => item.profileId === profileId)?.name ?? 'Neznámá osoba'
  );

  const renderReservationSummary = (reservation: FleetReservation) => {
    const project = getProjectMeta(reservation.projectId);

    return (
      <div>
        <div className="flex flex-wrap items-center gap-2 font-semibold text-[color:var(--nodu-text)]">
          <span>{project.name}</span>
          <span className="rounded-full border border-[color:rgb(var(--nodu-accent-rgb)/0.18)] bg-[color:rgb(var(--nodu-accent-rgb)/0.07)] px-2 py-0.5 text-[10px] font-bold text-[color:var(--nodu-accent)]">
            {project.jobNumber}
          </span>
        </div>
        <div className="mt-0.5 text-[11px] text-[color:var(--nodu-text-soft)]">
          {formatDateTime(reservation.startsAt)} - {formatDateTime(reservation.endsAt)} · {getEventLabel(reservation.eventId)}
        </div>
      </div>
    );
  };

  const renderSelectedReservationDetail = (reservation: FleetReservation, showVehicle = false) => (
    <div
      data-testid="fleet-reservation-overlay"
      className="absolute inset-0 z-20 flex items-center justify-center bg-white/72 p-4 backdrop-blur-[2px]"
      onClick={() => setSelectedCalendarReservationId(null)}
    >
      <div
        role="dialog"
        aria-modal="false"
        aria-labelledby="fleet-selected-reservation-title"
        data-testid="fleet-selected-reservation-detail"
        className="w-full max-w-md rounded-2xl border border-[color:var(--nodu-border)] bg-white p-4 text-left shadow-[0_18px_42px_rgba(47,38,31,0.16)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 id="fleet-selected-reservation-title" className="mb-2 text-sm font-semibold text-[color:var(--nodu-text)]">
              Vybraná rezervace
            </h3>
            {showVehicle && (
              <div className="mb-2 text-[11px] font-semibold text-[color:var(--nodu-text-soft)]">
                Auto: {getVehicleName(reservation.vehicleId)}
              </div>
            )}
            {renderReservationSummary(reservation)}
          </div>
          <div className="flex shrink-0 items-start gap-2">
            {reservation.hasConflict && <span className={`${badgeClass} ${statusClass.conflict}`}>Konflikt</span>}
            <button
              type="button"
              aria-label="Zavřít detail rezervace"
              onClick={() => setSelectedCalendarReservationId(null)}
              className="rounded-full p-1.5 text-[color:var(--nodu-text-soft)] transition hover:bg-[color:var(--nodu-accent-soft)] hover:text-[color:var(--nodu-text)]"
            >
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="mt-2 text-[11px] text-[color:var(--nodu-text-soft)]">
          Odpovědná osoba: {getResponsibleName(reservation.responsibleProfileId)}
        </div>
      </div>
    </div>
  );

  if (selectedDetail && selectedVehicle) {
    const defaultCalendarDate = selectedDetail.upcomingReservations[0]
      ? parseISO(selectedDetail.upcomingReservations[0].startsAt)
      : new Date();
    const calendarDate = calendarMonth ?? defaultCalendarDate;
    const calendarDays = getStableCalendarDays(calendarDate);
    const documents = vehicleDocuments[selectedVehicle.id] ?? [];

    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <button
              type="button"
              onClick={() => {
                setSelectedVehicleId(null);
                setCalendarMonth(null);
                setSelectedCalendarReservationId(null);
              }}
              className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[color:var(--nodu-text-soft)] transition hover:text-[color:var(--nodu-accent)]"
            >
              <ChevronLeft size={14} />
              Zpět na flotilu
            </button>
            <div className="nodu-dashboard-kicker">Detail auta</div>
            <h1 className="text-2xl font-semibold tracking-[-0.03em] text-[color:var(--nodu-text)]">{selectedVehicle.name}</h1>
            <p className="mt-1 text-sm text-[color:var(--nodu-text-soft)]">
              {selectedVehicle.plate} · {selectedVehicle.type} · {selectedVehicle.capacity}
            </p>
          </div>

          <Button onClick={() => openNewReservation(selectedVehicle.id)} size="sm" className="text-xs">
            <span className="inline-flex items-center gap-1.5">
              <Plus size={14} />
              Nová rezervace
            </span>
          </Button>
        </div>

        <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-3">
          {[
            ['Stav', statusLabels[selectedVehicle.status]],
            ['STK', new Date(selectedVehicle.inspectionValidUntil).toLocaleDateString('cs-CZ')],
            ['Servis', selectedVehicle.serviceDueAt ? new Date(selectedVehicle.serviceDueAt).toLocaleDateString('cs-CZ') : 'Bez termínu'],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.98)] p-4">
              <div className="text-[10px] uppercase tracking-wider text-[color:var(--nodu-text-soft)]">{label}</div>
              <div className="mt-2 text-lg font-bold text-[color:var(--nodu-text)]">{value}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-5">
            <section className="relative overflow-hidden rounded-[28px] border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.98)] p-5 shadow-[0_18px_42px_rgba(47,38,31,0.08)]">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <CalendarDays size={16} className="text-[color:var(--nodu-accent)]" />
                <h2 className="text-sm font-semibold text-[color:var(--nodu-text)]">Kalendář dostupnosti</h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Předchozí měsíc"
                  onClick={() => {
                    setCalendarMonth(subMonths(calendarDate, 1));
                    setSelectedCalendarReservationId(null);
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-[color:var(--nodu-border)] text-[color:var(--nodu-text-soft)] transition hover:border-[color:var(--nodu-accent)] hover:text-[color:var(--nodu-accent)]"
                >
                  <ChevronLeft size={15} />
                </button>
                <div className="min-w-28 text-center text-xs font-semibold capitalize text-[color:var(--nodu-text-soft)]">
                  {format(calendarDate, 'LLLL yyyy', { locale: cs })}
                </div>
                <button
                  type="button"
                  aria-label="Další měsíc"
                  onClick={() => {
                    setCalendarMonth(addMonths(calendarDate, 1));
                    setSelectedCalendarReservationId(null);
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-[color:var(--nodu-border)] text-[color:var(--nodu-text-soft)] transition hover:border-[color:var(--nodu-accent)] hover:text-[color:var(--nodu-accent)]"
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-wider text-[color:var(--nodu-text-soft)]">
              {['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'].map((day) => <div key={day}>{day}</div>)}
            </div>
            <div className="mt-2 grid grid-cols-7 gap-1">
              {calendarDays.map((day) => {
                const key = format(day, 'yyyy-MM-dd');
                const isToday = key === referenceDate;
                const dayReservations = selectedDetail.reservations.filter((reservation) => (
                  reservation.startsAt.slice(0, 10) <= key && reservation.endsAt.slice(0, 10) >= key
                ));

                return (
                  <div
                    key={key}
                    data-testid="fleet-detail-calendar-day"
                    data-date={key}
                    data-today={isToday ? 'true' : undefined}
                    className={getCalendarDayClassName(isSameMonth(day, calendarDate))}
                    style={getTodayCalendarDayStyle(isToday)}
                  >
                    <div className="text-[11px] font-semibold">{format(day, 'd')}</div>
                    <div className="mt-1 space-y-1">
                      {dayReservations.slice(0, 2).map((reservation) => (
                        <button
                          type="button"
                          key={reservation.id}
                          onClick={() => setSelectedCalendarReservationId(reservation.id)}
                          className={`block w-full truncate rounded-md px-1.5 py-1 text-left text-[9px] font-semibold transition ring-offset-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--nodu-accent)] ${reservation.hasConflict ? 'bg-red-50 text-red-700' : 'bg-[color:rgb(var(--nodu-accent-rgb)/0.1)] text-[color:var(--nodu-accent)]'}`}
                        >
                          {getProjectLabel(reservation.projectId)}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            {selectedCalendarReservation
              && selectedCalendarReservation.vehicleId === selectedVehicle.id
              && renderSelectedReservationDetail(selectedCalendarReservation)}
            </section>

            <section className="rounded-[24px] border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.98)] p-5 shadow-[0_18px_42px_rgba(47,38,31,0.08)]">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <FileText size={16} className="text-[color:var(--nodu-accent)]" />
                  <h2 className="text-sm font-semibold text-[color:var(--nodu-text)]">Dokumenty auta</h2>
                </div>
                <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-[color:var(--nodu-border)] px-3 py-2 text-xs font-semibold text-[color:var(--nodu-text)] transition hover:border-[color:var(--nodu-accent)] hover:text-[color:var(--nodu-accent)]">
                  <Upload size={14} />
                  Přidat dokument
                  <input
                    aria-label="Přidat dokument"
                    type="file"
                    multiple
                    className="sr-only"
                    onChange={(event) => {
                      const files = Array.from(event.target.files ?? []);
                      if (files.length === 0) return;

                      setVehicleDocuments((current) => ({
                        ...current,
                        [selectedVehicle.id]: [
                          ...(current[selectedVehicle.id] ?? []),
                          ...files.map((file) => ({
                            id: `${selectedVehicle.id}-${file.name}-${file.lastModified}`,
                            name: file.name,
                            addedAt: new Date().toISOString().slice(0, 10),
                          })),
                        ],
                      }));
                      event.target.value = '';
                    }}
                  />
                </label>
              </div>

              <div className="space-y-2">
                {documents.map((document) => (
                  <div key={document.id} className="flex items-center justify-between gap-3 rounded-xl border border-[color:var(--nodu-border)] p-3 text-xs">
                    <span className="min-w-0 truncate font-semibold text-[color:var(--nodu-text)]">{document.name}</span>
                    <span className="shrink-0 text-[color:var(--nodu-text-soft)]">
                      {new Date(document.addedAt).toLocaleDateString('cs-CZ')}
                    </span>
                  </div>
                ))}
                {documents.length === 0 && (
                  <div className="rounded-xl border border-dashed border-[color:var(--nodu-border)] p-4 text-sm text-[color:var(--nodu-text-soft)]">
                    Zatím tu nejsou žádné dokumenty k autu.
                  </div>
                )}
              </div>
            </section>
          </div>

          <section className="rounded-[28px] border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.98)] p-5 shadow-[0_18px_42px_rgba(47,38,31,0.08)]">
            <h2 className="mb-4 text-sm font-semibold text-[color:var(--nodu-text)]">Nadcházející rezervace</h2>
            <div className="space-y-3">
              {selectedDetail.upcomingReservations.map((reservation) => (
                <div key={reservation.id} className="rounded-xl border border-[color:var(--nodu-border)] p-3">
                  <div className="flex items-start justify-between gap-3">
                    {renderReservationSummary(reservation)}
                    {reservation.hasConflict && <span className={`${badgeClass} ${statusClass.conflict}`}>Konflikt</span>}
                  </div>
                  <div className="mt-2 text-[11px] text-[color:var(--nodu-text-soft)]">
                    Odpovědná osoba: {getResponsibleName(reservation.responsibleProfileId)}
                  </div>
                </div>
              ))}
              {selectedDetail.upcomingReservations.length === 0 && (
                <div className="rounded-xl border border-dashed border-[color:var(--nodu-border)] p-5 text-center text-sm text-[color:var(--nodu-text-soft)]">
                  Auto nemá žádnou nadcházející rezervaci.
                </div>
              )}
            </div>

            <div className="mt-7 border-t border-[color:rgb(var(--nodu-text-rgb)/0.08)] pt-5">
              <h2 className="mb-4 text-sm font-semibold text-[color:var(--nodu-text)]">Historie rezervací</h2>
              <div className="space-y-3">
                {selectedDetail.historyReservations.slice(0, 5).map((reservation) => (
                  <div key={reservation.id} className="rounded-xl border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-text-rgb)/0.02)] p-3">
                    <div className="flex items-start justify-between gap-3">
                      {renderReservationSummary(reservation)}
                      {reservation.hasConflict && <span className={`${badgeClass} ${statusClass.conflict}`}>Konflikt</span>}
                    </div>
                    <div className="mt-2 text-[11px] text-[color:var(--nodu-text-soft)]">
                      Odpovědná osoba: {getResponsibleName(reservation.responsibleProfileId)}
                    </div>
                  </div>
                ))}
                {selectedDetail.historyReservations.length === 0 && (
                  <div className="rounded-xl border border-dashed border-[color:var(--nodu-border)] p-4 text-sm text-[color:var(--nodu-text-soft)]">
                    Historie rezervací je zatím prázdná.
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>

        {editingReservation && (
          <FleetReservationModal
            draft={editingReservation}
            onChange={setEditingReservation}
            onClose={() => setEditingReservation(null)}
            onSaved={() => {
              setEditingReservation(null);
              reload();
            }}
          />
        )}
      </motion.div>
    );
  }

  const firstOverviewReservation = rows.find((row) => row.nextReservation)?.nextReservation;
  const defaultOverviewCalendarDate = firstOverviewReservation ? parseISO(firstOverviewReservation.startsAt) : new Date();
  const overviewCalendarDate = overviewCalendarMonth ?? defaultOverviewCalendarDate;
  const overviewCalendarDays = getStableCalendarDays(overviewCalendarDate);
  const overviewCalendarStart = format(overviewCalendarDays[0], 'yyyy-MM-dd');
  const overviewCalendarEnd = format(overviewCalendarDays[overviewCalendarDays.length - 1], 'yyyy-MM-dd');
  const activeCalendarVehicles = dependencies.vehicles.filter((vehicle) => (
    dependencies.reservations.some((reservation) => (
      reservation.vehicleId === vehicle.id
      && reservation.startsAt.slice(0, 10) <= overviewCalendarEnd
      && reservation.endsAt.slice(0, 10) >= overviewCalendarStart
    ))
  ));
  const getVehicleName = (vehicleId: string) => dependencies.vehicles.find((vehicle) => vehicle.id === vehicleId)?.name ?? vehicleId;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="nodu-dashboard-kicker">Operations</div>
          <h1 className="text-2xl font-semibold tracking-[-0.03em] text-[color:var(--nodu-text)]">Flotila</h1>
          <p className="mt-1 text-sm text-[color:var(--nodu-text-soft)]">
            Rezervace aut a provozní přehled dostupnosti pro projekty.
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-[28px] border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.98)] shadow-[0_18px_42px_rgba(47,38,31,0.08)]">
        <table className="w-full min-w-[760px] border-collapse text-left">
          <thead>
            <tr className="border-b border-[color:rgb(var(--nodu-text-rgb)/0.08)] text-[10px] uppercase tracking-wider text-[color:var(--nodu-text-soft)]">
              <th className="px-4 py-3 font-medium">Auto</th>
              <th className="px-4 py-3 font-medium">SPZ</th>
              <th className="px-4 py-3 font-medium">Typ</th>
              <th className="px-4 py-3 font-medium">Nejbližší rezervace</th>
              <th className="px-4 py-3 font-medium">Stav</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:rgb(var(--nodu-text-rgb)/0.06)]">
            {rows.map((row) => {
              const effectiveStatus = row.currentReservation ? 'reserved' : row.vehicle.status;

              return (
                <tr
                  key={row.vehicle.id}
                  tabIndex={0}
                  onClick={() => {
                    setSelectedVehicleId(row.vehicle.id);
                    setCalendarMonth(null);
                    setSelectedCalendarReservationId(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedVehicleId(row.vehicle.id);
                      setCalendarMonth(null);
                      setSelectedCalendarReservationId(null);
                    }
                  }}
                  className={`${row.hasConflict ? 'bg-red-50/40' : ''} cursor-pointer transition-colors hover:bg-[color:rgb(var(--nodu-accent-rgb)/0.04)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--nodu-accent)]`}
                  title={`Otevřít detail ${row.vehicle.name}`}
                >
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-[color:var(--nodu-text)]">{row.vehicle.name}</span>
                      {row.inspectionAlert && (
                        <span className={`${badgeClass} ${row.inspectionAlert.tone === 'danger' ? statusClass.conflict : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                          {row.inspectionAlert.label}
                        </span>
                      )}
                      {row.hasConflict && <span className={`${badgeClass} ${statusClass.conflict}`}>Konflikt</span>}
                    </div>
                    <div className="mt-0.5 text-[11px] text-[color:var(--nodu-text-soft)]">{row.vehicle.capacity}</div>
                  </td>
                  <td className="px-4 py-3 text-xs font-semibold text-[color:var(--nodu-text)]">{row.vehicle.plate}</td>
                  <td className="px-4 py-3 text-xs text-[color:var(--nodu-text)]">{row.vehicle.type}</td>
                  <td className="px-4 py-3 text-xs text-[color:var(--nodu-text)]">
                    {row.nextReservation ? renderReservationSummary(row.nextReservation) : <span className="text-[color:var(--nodu-text-soft)]">Bez rezervace</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`${badgeClass} ${statusClass[effectiveStatus]}`}>
                      {statusLabels[effectiveStatus]}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <section className="relative mt-5 overflow-hidden rounded-[28px] border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.98)] p-5 shadow-[0_18px_42px_rgba(47,38,31,0.08)]">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <CalendarDays size={16} className="text-[color:var(--nodu-accent)]" />
            <h2 className="text-sm font-semibold text-[color:var(--nodu-text)]">Kalendář celé flotily</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Předchozí měsíc flotily"
              onClick={() => {
                setOverviewCalendarMonth(subMonths(overviewCalendarDate, 1));
                setSelectedCalendarReservationId(null);
              }}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[color:var(--nodu-border)] text-[color:var(--nodu-text-soft)] transition hover:border-[color:var(--nodu-accent)] hover:text-[color:var(--nodu-accent)]"
            >
              <ChevronLeft size={15} />
            </button>
            <div className="min-w-28 text-center text-xs font-semibold capitalize text-[color:var(--nodu-text-soft)]">
              {format(overviewCalendarDate, 'LLLL yyyy', { locale: cs })}
            </div>
            <button
              type="button"
              aria-label="Další měsíc flotily"
              onClick={() => {
                setOverviewCalendarMonth(addMonths(overviewCalendarDate, 1));
                setSelectedCalendarReservationId(null);
              }}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[color:var(--nodu-border)] text-[color:var(--nodu-text-soft)] transition hover:border-[color:var(--nodu-accent)] hover:text-[color:var(--nodu-accent)]"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-wider text-[color:var(--nodu-text-soft)]">
          {['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'].map((day) => <div key={day}>{day}</div>)}
        </div>
        <div className="mt-2 grid grid-cols-7 gap-1">
          {overviewCalendarDays.map((day) => {
            const key = format(day, 'yyyy-MM-dd');
            const isToday = key === referenceDate;
            const dayReservations = dependencies.reservations.filter((reservation) => (
              reservation.startsAt.slice(0, 10) <= key && reservation.endsAt.slice(0, 10) >= key
            ));

            return (
              <div
                key={key}
                data-testid="fleet-overview-calendar-day"
                data-date={key}
                data-today={isToday ? 'true' : undefined}
                className={getCalendarDayClassName(isSameMonth(day, overviewCalendarDate))}
                style={getTodayCalendarDayStyle(isToday)}
              >
                <div className="text-[11px] font-semibold">{format(day, 'd')}</div>
                <div className="mt-1 space-y-1">
                  {activeCalendarVehicles.map((vehicle, vehicleSlotIndex) => {
                    const vehicleReservations = dayReservations.filter((reservation) => reservation.vehicleId === vehicle.id);
                    const reservation = vehicleReservations[0];
                    const project = reservation ? getProjectMeta(reservation.projectId) : null;
                    const vehiclePaletteIndex = dependencies.vehicles.findIndex((item) => item.id === vehicle.id);
                    const vehicleStyle = getVehicleCalendarStyle(vehiclePaletteIndex);

                    if (!reservation || !project) {
                      return (
                        <div
                          key={`${key}-${vehicle.id}-empty`}
                          data-testid={`fleet-calendar-slot-${vehicle.id}`}
                          aria-hidden="true"
                          className="h-5 rounded-md"
                        />
                      );
                    }

                    return (
                      <button
                        type="button"
                        key={`${key}-${reservation.id}`}
                        data-testid={`fleet-calendar-slot-${vehicle.id}`}
                        data-fleet-slot={vehicleSlotIndex}
                        data-fleet-reservation={vehicle.id}
                        onClick={() => setSelectedCalendarReservationId(reservation.id)}
                        className="block w-full truncate rounded-md border px-1.5 py-1 text-left text-[9px] font-semibold transition ring-offset-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--nodu-accent)]"
                        style={vehicleStyle}
                        title={`${getVehicleName(reservation.vehicleId)} · ${project.jobNumber} · ${project.name}`}
                        aria-label={`${getVehicleName(reservation.vehicleId)} · ${project.jobNumber} · ${project.name}`}
                      >
                        <span
                          data-testid={`fleet-calendar-reservation-${vehicle.id}`}
                          data-fleet-slot={vehicleSlotIndex}
                          style={vehicleStyle}
                        >
                          {getVehicleName(reservation.vehicleId)} · {project.jobNumber}
                          {reservation.hasConflict && ' · Konflikt'}
                          {vehicleReservations.length > 1 && ` +${vehicleReservations.length - 1}`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        {selectedCalendarReservation && renderSelectedReservationDetail(selectedCalendarReservation, true)}
      </section>
    </motion.div>
  );
};

const FleetReservationModal = ({
  draft,
  onChange,
  onClose,
  onSaved,
}: {
  draft: FleetReservationDraft;
  onChange: (reservation: FleetReservationDraft) => void;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const dependencies = getFleetDependencies();
  const conflicts = findFleetReservationConflicts(draft);
  const projectEvents = dependencies.events.filter((event) => event.job === draft.projectId);

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="flex w-full max-w-2xl flex-col overflow-hidden rounded-[24px] border border-[var(--nodu-border)] bg-white shadow-[var(--nodu-shadow)]"
        >
          <div className="flex items-center justify-between border-b border-[var(--nodu-border)] p-4">
            <h3 className="font-semibold text-[var(--nodu-text)]">Nová rezervace auta</h3>
            <button onClick={onClose} className="rounded-full p-1.5 text-[var(--nodu-text-soft)] transition hover:bg-[var(--nodu-accent-soft)] hover:text-[var(--nodu-text)]">
              <X size={20} />
            </button>
          </div>

          <div className="space-y-4 p-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className={labelClass}>Projekt</label>
                <select
                  value={draft.projectId}
                  onChange={(event) => onChange({ ...draft, projectId: event.target.value, eventId: null })}
                  className={selectClass}
                >
                  <option value="">Vyberte projekt</option>
                  {dependencies.projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.id} - {project.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Akce volitelně</label>
                <select
                  value={draft.eventId ?? 0}
                  onChange={(event) => onChange({ ...draft, eventId: Number(event.target.value) || null })}
                  className={selectClass}
                  disabled={!draft.projectId}
                >
                  <option value={0}>Bez konkrétní akce</option>
                  {projectEvents.map((event) => (
                    <option key={event.id} value={event.id}>
                      {event.name} · {new Date(event.startDate).toLocaleDateString('cs-CZ')}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className={labelClass}>Odpovědná osoba</label>
              <select
                value={draft.responsibleProfileId}
                onChange={(event) => onChange({ ...draft, responsibleProfileId: event.target.value })}
                className={selectClass}
              >
                {dependencies.contractors.map((contractor) => (
                  <option key={contractor.profileId} value={contractor.profileId}>
                    {contractor.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className={labelClass}>Od</label>
                <Input
                  type="datetime-local"
                  value={draft.startsAt}
                  onChange={(event) => onChange({ ...draft, startsAt: event.target.value })}
                />
              </div>
              <div>
                <label className={labelClass}>Do</label>
                <Input
                  type="datetime-local"
                  value={draft.endsAt}
                  onChange={(event) => onChange({ ...draft, endsAt: event.target.value })}
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>Poznámka</label>
              <Textarea
                value={draft.note}
                onChange={(event) => onChange({ ...draft, note: event.target.value })}
                className="h-20 resize-none"
                placeholder="Nakládka, předání auta, palivo..."
              />
            </div>

            {conflicts.length > 0 && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                <div className="mb-1 flex items-center gap-2 font-semibold">
                  <AlertTriangle size={15} />
                  Rezervace se překrývá
                </div>
                Rezervaci můžeš uložit, ale bude označená jako konflikt.
              </div>
            )}
          </div>

          <div className="flex gap-3 border-t border-[var(--nodu-border)] bg-white p-4">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Zrušit
            </Button>
            <Button
              type="button"
              onClick={async () => {
                try {
                  await saveFleetReservation(draft);
                  toast.success(conflicts.length > 0 ? 'Rezervace uložena s konfliktem.' : 'Rezervace uložena.');
                  onSaved();
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : 'Nepodařilo se uložit rezervaci.');
                }
              }}
              className="flex-1"
            >
              Uložit rezervaci
            </Button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default FleetView;
