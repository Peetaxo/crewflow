import { Event, Contractor, Timelog, Invoice, Candidate, Project, Client } from './types';

export const INITIAL_EVENTS: Event[] = [
  { id: 1, name: 'Corporate Event Praha', job: 'NEX151', startDate: '2025-04-14', endDate: '2025-04-15', city: 'Praha', needed: 6, filled: 4, status: 'upcoming', client: 'Next Level' },
  { id: 2, name: 'Gala Večer Brno', job: 'NEX148', startDate: '2025-04-22', endDate: '2025-04-23', city: 'Brno', needed: 8, filled: 8, status: 'full', client: 'JCHP' },
  { id: 3, name: 'Konference Ostrava', job: 'NEX143', startDate: '2025-05-05', endDate: '2025-05-05', city: 'Ostrava', needed: 4, filled: 2, status: 'planning', client: 'Next Level' },
  { id: 4, name: 'Firemní Večírek Praha', job: 'NEX156', startDate: '2025-05-15', endDate: '2025-05-15', city: 'Praha', needed: 5, filled: 0, status: 'planning', client: 'JCHP' },
  { id: 5, name: 'Majáles Praha', job: 'MAJ25', startDate: '2025-05-20', endDate: '2025-05-23', city: 'Praha', needed: 20, filled: 12, status: 'planning', client: 'Next Level' },
];

export const INITIAL_PROJECTS: Project[] = [
  { id: 'NEX151', name: 'Nexon Corporate 2025', client: 'Next Level', createdAt: '2025-01-10' },
  { id: 'NEX148', name: 'Gala Brno 2025', client: 'JCHP', createdAt: '2025-01-05' },
  { id: 'NEX143', name: 'Tech Ostrava', client: 'Next Level', createdAt: '2024-12-20' },
  { id: 'NEX156', name: 'Acme Party', client: 'JCHP', createdAt: '2025-02-15' },
  { id: 'MAJ25', name: 'Majáles Praha 2025', client: 'Next Level', createdAt: '2024-11-01' },
];

export const INITIAL_CLIENTS: Client[] = [
  { id: 1, name: 'Next Level', city: 'Praha', ico: '12345678', street: 'Václavské náměstí 1', zip: '110 00', country: 'Česká republika' },
  { id: 2, name: 'JCHP', city: 'Praha', ico: '87654321', street: 'Na Příkopě 12', zip: '110 00', country: 'Česká republika' },
];

export const INITIAL_CONTRACTORS: Contractor[] = [
  { id: 1, name: 'Jan Novák', ii: 'JN', bg: '#E1F5EE', fg: '#0F6E56', tags: ['Řidič', 'Stage'], events: 24, rate: 250, phone: '603 111 222', email: 'jan.novak@email.cz', ico: '12345678', dic: 'CZ12345678', bank: '123456789/0800', city: 'Praha 5', reliable: true, note: 'Zkušený řidič, vždy dochvilný. Výborná komunikace se zákazníky.' },
  { id: 2, name: 'Petra Svobodová', ii: 'PS', bg: '#EEEDFE', fg: '#534AB7', tags: ['Technička', 'Zvuk'], events: 18, rate: 220, phone: '774 333 444', email: 'petra.svobodova@email.cz', ico: '87654321', dic: 'CZ87654321', bank: '987654321/2010', city: 'Praha 10', reliable: true, note: 'Spolehlivá a flexibilní. Preferuje víkendové akce.' },
  { id: 3, name: 'Martin Kovář', ii: 'MK', bg: '#E6F1FB', fg: '#185FA5', tags: ['Řidič', 'Světla'], events: 12, rate: 240, phone: '608 555 666', email: 'martin.kovar@email.cz', ico: '11223344', dic: 'CZ11223344', bank: '111222333/0300', city: 'Brno', reliable: false, note: 'Řidič s vlastním vozem. Občas pomalejší komunikace.' },
  { id: 4, name: 'Lucie Horáková', ii: 'LH', bg: '#FAEEDA', fg: '#854F0B', tags: ['Osvětlení'], events: 8, rate: 200, phone: '721 777 888', email: 'lucie.horakova@email.cz', ico: '55667788', dic: '', bank: '444555666/0600', city: 'Praha 2', reliable: true, note: 'Nová kontraktorka, orientuje se rychle.' },
  { id: 5, name: 'Kateřina Procházková', ii: 'KP', bg: '#EAF3DE', fg: '#3B6D11', tags: ['Stage', 'Koordinace'], events: 31, rate: 230, phone: '775 123 456', email: 'katerina.prochazkova@email.cz', ico: '44332211', dic: 'CZ44332211', bank: '777888999/2700', city: 'Praha 1', reliable: true, note: 'Nejzkušenější kontraktorka. Záloha pro klíčové akce.' },
];

export const INITIAL_TIMELOGS: Timelog[] = [
  { id: 1, eid: 1, cid: 1, days: [{ d: '2025-04-14', f: '08:00', t: '18:00', type: 'instal' }, { d: '2025-04-15', f: '07:00', t: '23:00', type: 'provoz' }], km: 0, note: 'Hlavní stage setup', status: 'approved' },
  { id: 2, eid: 1, cid: 2, days: [{ d: '2025-04-15', f: '10:00', t: '22:00', type: 'provoz' }], km: 0, note: '', status: 'approved' },
  { id: 3, eid: 2, cid: 5, days: [{ d: '2025-04-22', f: '23:00', t: '03:00', type: 'deinstal' }, { d: '2025-04-23', f: '09:00', t: '14:00', type: 'deinstal' }], km: 0, note: 'Odvoz po akci přes noc', status: 'approved' },
  { id: 4, eid: 3, cid: 3, days: [{ d: '2025-05-04', f: '09:00', t: '19:00', type: 'instal' }], km: 180, note: 'Přijíždím vlastním autem z Brna', status: 'draft' },
  { id: 5, eid: 1, cid: 4, days: [{ d: '2025-04-15', f: '12:00', t: '22:00', type: 'provoz' }], km: 0, note: '', status: 'approved' },
  { id: 6, eid: 2, cid: 1, days: [{ d: '2025-04-22', f: '18:00', t: '02:00', type: 'provoz' }], km: 20, note: 'Noční směna', status: 'pending_hoc' },
  { id: 7, eid: 3, cid: 1, days: [{ d: '2025-05-05', f: '08:00', t: '16:00', type: 'provoz' }], km: 0, note: '', status: 'draft' },
  { id: 8, eid: 3, cid: 1, days: [{ d: '2025-01-15', f: '08:00', t: '18:00', type: 'provoz' }], km: 100, note: '', status: 'approved' },
  { id: 9, eid: 1, cid: 1, days: [{ d: '2025-02-10', f: '08:00', t: '20:00', type: 'instal' }, { d: '2025-02-11', f: '08:00', t: '20:00', type: 'provoz' }], km: 150, note: '', status: 'approved' },
  { id: 10, eid: 2, cid: 1, days: [{ d: '2025-03-05', f: '08:00', t: '18:00', type: 'instal' }, { d: '2025-03-06', f: '08:00', t: '18:00', type: 'provoz' }, { d: '2025-03-07', f: '08:00', t: '18:00', type: 'deinstal' }], km: 200, note: '', status: 'approved' },
  { id: 11, eid: 5, cid: 1, days: [{ d: '2024-12-12', f: '08:00', t: '22:00', type: 'instal' }, { d: '2024-12-13', f: '08:00', t: '22:00', type: 'provoz' }, { d: '2024-12-14', f: '08:00', t: '22:00', type: 'deinstal' }], km: 250, note: '', status: 'approved' },
  { id: 12, eid: 4, cid: 1, days: [{ d: '2024-11-20', f: '09:00', t: '17:00', type: 'provoz' }], km: 120, note: '', status: 'approved' },
];

export const INITIAL_INVOICES: Invoice[] = [
  { id: 'FAK-2026-001', cid: 3, eid: 3, hours: 10, hAmt: 2400, km: 180, kAmt: 1008, total: 3408, job: 'NEX143', status: 'paid', sentAt: '2025-05-10T10:00:00Z' },
  { id: 'FAK-2026-002', cid: 5, eid: 2, hours: 10, hAmt: 2300, km: 0, kAmt: 0, total: 2300, job: 'NEX148', status: 'paid', sentAt: '2025-04-25T10:00:00Z' },
  { id: 'FAK-2026-003', cid: 1, eid: 1, hours: 26, hAmt: 6500, km: 0, kAmt: 0, total: 6500, job: 'NEX151', status: 'paid', sentAt: '2025-04-20T10:00:00Z' },
  { id: 'FAK-2025-010', cid: 1, eid: 3, hours: 10, hAmt: 2500, km: 100, kAmt: 560, total: 3060, job: 'NEX143', status: 'paid', sentAt: '2025-01-20T10:00:00Z' },
  { id: 'FAK-2025-011', cid: 1, eid: 1, hours: 24, hAmt: 6000, km: 150, kAmt: 840, total: 6840, job: 'NEX151', status: 'paid', sentAt: '2025-02-15T10:00:00Z' },
  { id: 'FAK-2025-012', cid: 1, eid: 2, hours: 30, hAmt: 7500, km: 200, kAmt: 1120, total: 8620, job: 'NEX148', status: 'paid', sentAt: '2025-03-15T10:00:00Z' },
  { id: 'FAK-2024-099', cid: 1, eid: 5, hours: 42, hAmt: 10500, km: 250, kAmt: 1400, total: 11900, job: 'MAJ25', status: 'paid', sentAt: '2024-12-20T10:00:00Z' },
  { id: 'FAK-2024-098', cid: 1, eid: 4, hours: 8, hAmt: 2000, km: 120, kAmt: 672, total: 2672, job: 'NEX156', status: 'paid', sentAt: '2024-11-25T10:00:00Z' },
  { id: 'FAK-2025-015', cid: 1, eid: 2, hours: 8, hAmt: 2000, km: 20, kAmt: 112, total: 2112, job: 'NEX148', status: 'sent', sentAt: '2025-04-28T10:00:00Z' },
];

export const INITIAL_CANDIDATES: Candidate[] = [
  { id: 1, name: 'Pavel Horák', phone: '603 222 333', email: 'pavel.horak@email.cz', src: 'Tally', calBooked: true, stage: 'interview_scheduled', interviewAt: '2025-04-07 14:00', note: 'Zájem o víkendové akce, má ŘP.' },
  { id: 2, name: 'Eva Klimešová', phone: '776 444 555', email: 'eva.klimesova@email.cz', src: 'Tally', calBooked: false, stage: 'new', interviewAt: null, note: 'Doporučena Kateřinou P.' },
  { id: 3, name: 'Radek Šimek', phone: '602 666 777', email: 'radek.simek@email.cz', src: 'Tally', calBooked: true, stage: 'decision', interviewAt: '2025-04-03 10:00', note: 'Zkušenosti z cateringu.' },
  { id: 4, name: 'Tereza Nováčková', phone: '608 888 999', email: 'tereza.novackova@email.cz', src: 'Tally', calBooked: true, stage: 'accepted', interviewAt: '2025-03-28 11:00', note: 'Nasazena na první akci.' },
];

/** Sazba za km (Kč) — přesunout do nastavení/DB při migraci na Supabase */
export const KM_RATE = 5.60;
