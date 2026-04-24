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

/** Projekt (Job Number) */
export interface Project {
  /** Job Number jako ID */
  id: string;
  name: string;
  client: string;
  note?: string;
  createdAt: string;
}

/** Klient */
export interface Client {
  id: number;
  name: string;
  ico?: string;
  dic?: string;
  street?: string;
  zip?: string;
  city?: string;
  country?: string;
  note?: string;
}
