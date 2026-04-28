import type { Candidate, Client, Contractor, Event, FleetReservation, FleetVehicle, Invoice, Project, ReceiptItem, Timelog, TimelogDay } from '@/types';
import type { Database, Json } from './database.types';

type CandidateRow = Database['public']['Tables']['candidates']['Row'];
type ClientRow = Database['public']['Tables']['clients']['Row'];
type EventRow = Database['public']['Tables']['events']['Row'];
type FleetReservationRow = Database['public']['Tables']['fleet_reservations']['Row'];
type FleetVehicleRow = Database['public']['Tables']['fleet_vehicles']['Row'];
type InvoiceRow = Database['public']['Tables']['invoices']['Row'];
type ProfileRow = Database['public']['Tables']['profiles']['Row'];
type ProjectRow = Database['public']['Tables']['projects']['Row'];
type ReceiptRow = Database['public']['Tables']['receipts']['Row'];
type TimelogRow = Database['public']['Tables']['timelogs']['Row'];
type TimelogDayRow = Database['public']['Tables']['timelog_days']['Row'];

function asRecord(value: Json | null): Record<string, unknown> | undefined {
  return value && !Array.isArray(value) && typeof value === 'object' ? value as Record<string, unknown> : undefined;
}

function initials(firstName: string, lastName: string): string {
  return `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase();
}

export function mapCandidate(row: CandidateRow): Candidate {
  return {
    id: Number.NaN,
    name: `${row.first_name} ${row.last_name}`.trim(),
    phone: row.phone ?? '',
    email: row.email ?? '',
    src: row.source ?? '',
    calBooked: Boolean(row.cal_booking_url),
    stage: row.stage,
    interviewAt: row.interview_date,
    note: row.note ?? '',
  };
}

export function mapClient(row: ClientRow): Client {
  return {
    id: Number.NaN,
    supabaseId: row.id,
    name: row.name,
    ico: row.ico ?? '',
    dic: row.dic ?? '',
    street: row.street ?? '',
    zip: row.zip ?? '',
    city: row.city ?? '',
    country: row.country ?? '',
  };
}

export function mapProject(row: ProjectRow, clientName?: string): Project {
  return {
    id: row.job_number,
    supabaseId: row.id,
    name: row.name,
    client: clientName ?? '',
    clientId: row.client_id,
    note: row.note ?? '',
    createdAt: row.created_at,
  };
}

export function mapContractor(row: ProfileRow): Contractor {
  const firstName = row.first_name ?? '';
  const lastName = row.last_name ?? '';

  return {
    id: Number.NaN,
    profileId: row.id,
    userId: row.user_id,
    name: `${firstName} ${lastName}`.trim(),
    ii: initials(firstName, lastName),
    bg: row.avatar_bg ?? '#E0E7FF',
    fg: row.avatar_color ?? '#4338CA',
    tags: row.tags ?? [],
    events: 0,
    rate: Number(row.hourly_rate ?? 0),
    phone: row.phone ?? '',
    email: row.email ?? '',
    ico: row.ico ?? '',
    dic: row.dic ?? '',
    bank: row.bank_account ?? '',
    iban: row.iban ?? '',
    city: row.billing_city ?? '',
    billingName: `${firstName} ${lastName}`.trim(),
    billingStreet: row.billing_street ?? '',
    billingZip: row.billing_zip ?? '',
    billingCity: row.billing_city ?? '',
    billingCountry: row.billing_country ?? '',
    reliable: row.reliable ?? Boolean((row.reliability ?? 0) >= 4),
    rating: row.rating ?? row.reliability ?? null,
    note: row.note ?? '',
  };
}

export function mapEvent(row: EventRow): Event {
  return {
    id: Number.NaN,
    supabaseId: row.id,
    projectId: row.project_id,
    name: row.name,
    job: row.job_number ?? '',
    startDate: row.date_from ?? '',
    endDate: row.date_to ?? '',
    startTime: row.time_from ?? undefined,
    endTime: row.time_to ?? undefined,
    city: row.city ?? '',
    needed: row.crew_needed ?? 0,
    filled: row.crew_filled ?? 0,
    status: row.status,
    client: row.client_name ?? '',
    description: row.description ?? undefined,
    contactPerson: row.contact_person ?? undefined,
    dresscode: row.dresscode ?? undefined,
    meetingLocation: row.meeting_point ?? undefined,
    showDayTypes: row.show_day_types ?? undefined,
    dayTypes: asRecord(row.day_types) as Event['dayTypes'],
    phaseTimes: asRecord(row.phase_times) as Event['phaseTimes'],
    phaseSchedules: asRecord(row.phase_schedules) as Event['phaseSchedules'],
  };
}

export function mapFleetVehicle(row: FleetVehicleRow): FleetVehicle {
  return {
    id: row.slug,
    supabaseId: row.id,
    name: row.name,
    plate: row.plate,
    type: row.type,
    status: row.status,
    capacity: row.capacity,
    inspectionValidUntil: row.inspection_valid_until,
    insuranceValidUntil: row.insurance_valid_until ?? undefined,
    serviceDueAt: row.service_due_at ?? undefined,
    note: row.note ?? '',
  };
}

export function mapFleetReservation(
  row: FleetReservationRow,
  links: {
    localId: number;
    vehicleSlug: string;
    projectJobNumber: string;
    eventId: number | null;
  },
): FleetReservation {
  return {
    id: links.localId,
    supabaseId: row.id,
    vehicleId: links.vehicleSlug,
    projectId: links.projectJobNumber,
    eventId: links.eventId,
    responsibleProfileId: row.responsible_profile_id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    note: row.note ?? '',
    hasConflict: row.has_conflict,
  };
}

export function mapTimelogDay(row: TimelogDayRow): TimelogDay {
  return {
    d: row.date,
    f: row.time_from ?? '',
    t: row.time_to ?? '',
    type: row.day_type,
  };
}

export function mapTimelog(row: TimelogRow, days: TimelogDayRow[] = []): Timelog {
  return {
    id: Number.NaN,
    eid: Number.NaN,
    contractorProfileId: row.contractor_id,
    days: days.map(mapTimelogDay),
    km: Number(row.km ?? 0),
    note: row.note ?? '',
    status: row.status,
  };
}

export function mapInvoice(row: InvoiceRow): Invoice {
  return {
    id: row.id,
    contractorProfileId: row.contractor_id,
    eid: Number.NaN,
    hours: Number(row.total_hours ?? 0),
    hAmt: Number(row.amount_hours ?? 0),
    km: 0,
    kAmt: Number(row.amount_km ?? 0),
    receiptAmt: Number(row.amount_receipts ?? 0),
    total: Number(row.total_amount ?? 0),
    job: row.job_number ?? '',
    invoiceNumber: row.invoice_number ?? undefined,
    issueDate: row.issue_date ?? undefined,
    taxableSupplyDate: row.taxable_supply_date ?? undefined,
    dueDate: row.due_date ?? undefined,
    currency: (row.currency ?? 'CZK') as 'CZK',
    supplierSnapshot: row.supplier_snapshot as Invoice['supplierSnapshot'],
    customerSnapshot: row.customer_snapshot as Invoice['customerSnapshot'],
    pdfPath: row.pdf_path ?? null,
    pdfGeneratedAt: row.pdf_generated_at ?? null,
    status: row.status,
    sentAt: row.sent_at,
  };
}

export function mapReceipt(row: ReceiptRow): ReceiptItem {
  return {
    id: Number.NaN,
    contractorProfileId: row.contractor_id,
    eid: Number.NaN,
    job: row.job_number ?? '',
    title: row.name,
    vendor: row.supplier ?? '',
    amount: Number(row.amount),
    paidAt: row.paid_at ?? '',
    note: row.note ?? '',
    status: row.status,
  };
}
