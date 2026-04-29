/** Uzivatelska role v systemu */
export type Role = 'crew' | 'crewhead' | 'coo';

/** Status akce */
export type EventStatus = 'upcoming' | 'full' | 'past' | 'planning';

/** Typ prace (faze akce) */
export type TimelogType = 'instal' | 'provoz' | 'deinstal';

export interface EventPhaseTime {
  from: string;
  to: string;
}

export interface EventPhaseSlot extends EventPhaseTime {
  id: string;
  dates: string[];
}

/** Akce (event) - konkretni realizace projektu */
export interface Event {
  id: number;
  supabaseId?: string;
  projectId?: string | null;
  name: string;
  /** Job Number - propojeni s projektem */
  job: string;
  startDate: string;
  endDate: string;
  startTime?: string;
  endTime?: string;
  city: string;
  /** Kolik crew clenu je potreba */
  needed: number;
  /** Kolik crew clenu je aktualne obsazeno */
  filled: number;
  status: EventStatus;
  client: string;
  description?: string;
  contactPerson?: string;
  dresscode?: string;
  meetingLocation?: string;
  /** Zobrazovat typy dnů (Instal/Provoz/Deinstal) */
  showDayTypes?: boolean;
  /** Mapovani datum -> typ dne */
  dayTypes?: Record<string, TimelogType>;
  /** Vychozi casy pro jednotlive typy dnů */
  phaseTimes?: Partial<Record<TimelogType, EventPhaseTime>>;
  /** Konkretni bloky casu pro jednotlive typy dnů */
  phaseSchedules?: Partial<Record<TimelogType, EventPhaseSlot[]>>;
}

/** Kontraktor - clen crew */
export interface Contractor {
  id: number;
  profileId?: string;
  userId?: string | null;
  name: string;
  /** Inicialy pro avatar */
  ii: string;
  /** Barva pozadi avataru */
  bg: string;
  /** Barva textu avataru */
  fg: string;
  tags: string[];
  /** Počet akci celkem */
  events: number;
  /** Hodinova sazba v Kc */
  rate: number;
  phone: string;
  email: string;
  ico: string;
  dic: string;
  bank: string;
  iban?: string;
  city: string;
  billingName?: string;
  billingStreet?: string;
  billingZip?: string;
  billingCity?: string;
  billingCountry?: string;
  reliable: boolean;
  rating?: number | null;
  note: string;
}

/** Status vykazu prace */
export type TimelogStatus = 'draft' | 'pending_ch' | 'pending_coo' | 'approved' | 'invoiced' | 'paid' | 'rejected';

/** Jeden den ve vykazu prace */
export interface TimelogDay {
  /** Datum (YYYY-MM-DD) */
  d: string;
  /** Cas od (HH:MM) */
  f: string;
  /** Cas do (HH:MM) */
  t: string;
  type: TimelogType;
}

/** Vykaz prace (timelog) */
export interface Timelog {
  id: number;
  /** ID akce */
  eid: number;
  contractorProfileId?: string;
  days: TimelogDay[];
  /** Cestovne v km */
  km: number;
  note: string;
  status: TimelogStatus;
}

/** Status faktury */
export type InvoiceStatus = 'draft' | 'sent' | 'paid';

export interface InvoiceSupplierSnapshot {
  profileId: string;
  name: string;
  ico: string;
  dic: string | null;
  bankAccount: string;
  iban?: string | null;
  billingStreet: string;
  billingZip: string;
  billingCity: string;
  billingCountry: string;
  vatPayer: false;
}

export interface InvoiceCustomerSnapshot {
  clientId: string;
  name: string;
  ico: string;
  dic: string | null;
  street: string;
  zip: string;
  city: string;
  country: string;
}

/** Faktura */
export interface Invoice {
  id: string;
  contractorProfileId?: string;
  /** ID akce */
  eid: number;
  hours: number;
  /** Částka za hodiny */
  hAmt: number;
  km: number;
  /** Částka za km */
  kAmt: number;
  /** Částka za účtenky */
  receiptAmt?: number;
  total: number;
  /** Job Number */
  job: string;
  /** Vsechny job number zahrnute do billing batch faktury */
  jobNumbers?: string[];
  /** Navazane timelogy zahrnute do faktury */
  timelogIds?: number[];
  /** Navazane uctenky zahrnute do faktury */
  receiptIds?: number[];
  /** Vsechny navazane akce zahrnute do faktury */
  eventIds?: number[];
  invoiceNumber?: string;
  issueDate?: string;
  taxableSupplyDate?: string;
  dueDate?: string;
  currency?: 'CZK';
  supplierSnapshot?: InvoiceSupplierSnapshot;
  customerSnapshot?: InvoiceCustomerSnapshot;
  pdfPath?: string | null;
  pdfGeneratedAt?: string | null;
  status: InvoiceStatus;
  sentAt: string | null;
}

/** Status účtenky */
export type ReceiptStatus = 'draft' | 'submitted' | 'approved' | 'attached' | 'reimbursed' | 'rejected';

/** Účtenka / výdaj crew k akci */
export interface ReceiptItem {
  id: number;
  contractorProfileId?: string;
  eid: number;
  job: string;
  title: string;
  vendor: string;
  amount: number;
  paidAt: string;
  note: string;
  status: ReceiptStatus;
}

/** Faze naboru */
export type RecruitmentStage = 'new' | 'interview_scheduled' | 'decision' | 'accepted' | 'rejected';

/** Kandidat v naboru */
export interface Candidate {
  id: number;
  name: string;
  phone: string;
  email: string;
  /** Zdroj (Tally.so apod.) */
  src: string;
  /** Cal.com booking potvrzen */
  calBooked: boolean;
  stage: RecruitmentStage;
  interviewAt: string | null;
  note: string;
}

export type FleetVehicleStatus = 'available' | 'reserved' | 'service' | 'out_of_order';

export interface FleetVehicle {
  id: string;
  supabaseId?: string;
  name: string;
  plate: string;
  type: string;
  status: FleetVehicleStatus;
  capacity: string;
  inspectionValidUntil: string;
  insuranceValidUntil?: string;
  serviceDueAt?: string;
  note: string;
}

export interface FleetReservation {
  id: number;
  supabaseId?: string;
  vehicleId: string;
  projectId: string;
  eventId: number | null;
  responsibleProfileId: string;
  startsAt: string;
  endsAt: string;
  note: string;
  hasConflict: boolean;
}

export type FleetReservationDraft = Omit<FleetReservation, 'id' | 'hasConflict'> & {
  id?: number;
  hasConflict?: boolean;
};

export interface BudgetPackage {
  id: number;
  supabaseId?: string;
  projectId: string;
  name: string;
  note: string;
  eventIds: number[];
  createdAt: string;
}

export type BudgetPackageDraft = Omit<BudgetPackage, 'id' | 'createdAt'> & {
  id?: number;
  createdAt?: string;
};

export interface BudgetItem {
  id: number;
  supabaseId?: string;
  projectId: string;
  budgetPackageId: number | null;
  eventId: number | null;
  section: string;
  name: string;
  units: string;
  amount: number;
  quantity: number;
  unitPrice: number;
  note: string;
  createdAt: string;
}

export type BudgetItemDraft = Omit<BudgetItem, 'id' | 'createdAt'> & {
  id?: number;
  createdAt?: string;
};

export type WarehouseItemStatus = 'active' | 'draft' | 'maintenance' | 'retired';
export type WarehouseReservationStatus = 'draft' | 'reserved' | 'picked_up' | 'returned' | 'cancelled';

export interface WarehouseItem {
  id: string;
  name: string;
  category: string | null;
  description?: string | null;
  imageUrl: string | null;
  priceCents: number;
  currency: 'CZK';
  pricePeriodLabel: string | null;
  quantityTotal: number;
  ownerClientId?: string | null;
  ownerLabel?: string | null;
  status: WarehouseItemStatus;
  booqableProductId?: string | null;
  booqableProductPath?: string | null;
}

export interface WarehouseReservationItem {
  id: string;
  reservationId: string;
  warehouseItemId: string;
  quantity: number;
  unitPriceCents: number;
  pricePeriodLabel: string | null;
  lineTotalCents: number;
  itemNameSnapshot: string;
}

export interface WarehouseReservation {
  id: string;
  projectId?: string | null;
  projectJobNumber: string;
  eventId?: string | null;
  eventLocalId?: number | null;
  reservedByProfileId?: string | null;
  startsAt: string;
  endsAt: string;
  status: WarehouseReservationStatus;
  note: string;
  totalCents: number;
  currency: 'CZK';
  booqableOrderId?: string | null;
  items: WarehouseReservationItem[];
}

export interface WarehouseCartItemDraft {
  warehouseItemId: string;
  quantity: number;
}

export interface WarehouseReservationDraft {
  projectJobNumber: string;
  projectId?: string | null;
  eventId?: string | null;
  eventLocalId?: number | null;
  reservedByProfileId?: string | null;
  startsAt: string;
  endsAt: string;
  note: string;
  items: WarehouseCartItemDraft[];
}

/** Projekt (Job Number) */
export interface Project {
  /** Job Number jako ID */
  id: string;
  supabaseId?: string;
  name: string;
  client: string;
  clientId?: string | null;
  note?: string;
  createdAt: string;
}

/** Klient */
export interface Client {
  id: number;
  supabaseId?: string;
  name: string;
  ico?: string;
  dic?: string;
  street?: string;
  zip?: string;
  city?: string;
  country?: string;
  note?: string;
}
