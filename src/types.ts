/** Uživatelská role v systému */
export type Role = 'crew' | 'crewhead' | 'coo';

/** Status akce */
export type EventStatus = 'upcoming' | 'full' | 'planning';

/** Typ práce (fáze akce) */
export type TimelogType = 'instal' | 'provoz' | 'deinstal';

export interface EventPhaseTime {
  from: string;
  to: string;
}

export interface EventPhaseSlot extends EventPhaseTime {
  id: string;
  dates: string[];
}

/** Akce (event) — konkrétní realizace projektu */
export interface Event {
  id: number;
  name: string;
  /** Job Number — propojení s projektem */
  job: string;
  startDate: string;
  endDate: string;
  startTime?: string;
  endTime?: string;
  city: string;
  /** Kolik crew členů je potřeba */
  needed: number;
  /** Kolik crew členů je aktuálně obsazeno */
  filled: number;
  status: EventStatus;
  client: string;
  description?: string;
  contactPerson?: string;
  dresscode?: string;
  meetingLocation?: string;
  /** Zobrazovat typy dnů (Instal/Provoz/Deinstal) */
  showDayTypes?: boolean;
  /** Mapování datum -> typ dne */
  dayTypes?: Record<string, TimelogType>;
  /** Výchozí časy pro jednotlivé typy dnů */
  phaseTimes?: Partial<Record<TimelogType, EventPhaseTime>>;
  /** Konkrétní bloky časů pro jednotlivé typy dnů */
  phaseSchedules?: Partial<Record<TimelogType, EventPhaseSlot[]>>;
}

/** Kontraktor — člen crew */
export interface Contractor {
  id: number;
  name: string;
  /** Iniciály pro avatar */
  ii: string;
  /** Barva pozadí avataru */
  bg: string;
  /** Barva textu avataru */
  fg: string;
  tags: string[];
  /** Počet akcí celkem */
  events: number;
  /** Hodinová sazba v Kč */
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
  note: string;
}

/** Status výkazu práce */
export type TimelogStatus = 'draft' | 'pending_ch' | 'pending_coo' | 'approved' | 'invoiced' | 'paid' | 'rejected';

/** Jeden den ve výkazu práce */
export interface TimelogDay {
  /** Datum (YYYY-MM-DD) */
  d: string;
  /** Čas od (HH:MM) */
  f: string;
  /** Čas do (HH:MM) */
  t: string;
  type: TimelogType;
}

/** Výkaz práce (timelog) */
export interface Timelog {
  id: number;
  /** ID akce */
  eid: number;
  /** ID kontraktora */
  cid: number;
  days: TimelogDay[];
  /** Cestovné v km */
  km: number;
  note: string;
  status: TimelogStatus;
}

/** Status faktury */
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'disputed';

/** Faktura */
export interface Invoice {
  id: string;
  /** ID kontraktora */
  cid: number;
  /** ID akce */
  eid: number;
  hours: number;
  /** Částka za hodiny */
  hAmt: number;
  km: number;
  /** Částka za km */
  kAmt: number;
  total: number;
  /** Job Number */
  job: string;
  status: InvoiceStatus;
  sentAt: string | null;
}

/** Fáze náboru */
export type RecruitmentStage = 'new' | 'interview_scheduled' | 'decision' | 'accepted' | 'rejected';

/** Kandidát v náboru */
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
