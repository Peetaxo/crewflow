import { describe, expect, it } from 'vitest';
import type { Contractor, Invoice, Timelog } from '../../../types';
import { filterCrewMembers, formatCrewActivity, getCrewOverviewStats } from './crew-presentation';

const person = { id: 1, name: 'Jiří Dvořák', city: 'České Budějovice', phone: '+420 777 123 456', email: 'jiri@example.cz' } as Contractor;
const report = (status: Timelog['status']): Timelog => ({ id: 1, eid: 1, status, km: 0, note: '', days: [{ d: '2026-10-01', f: '08:00', t: '10:00', type: 'instal' }] });

describe('crew presentation', () => {
  it('searches identity and contacts without accents and combines local/global search', () => {
    expect(filterCrewMembers([person], 'jiri', 'budejovice')).toEqual([person]);
    expect(filterCrewMembers([person], '777123')).toEqual([person]);
    expect(filterCrewMembers([person], 'example.cz')).toEqual([person]);
    expect(filterCrewMembers([person], 'jiri', 'praha')).toEqual([]);
  });
  it('separates approval, corrections, approved hours and invoice payment states', () => {
    const stats = getCrewOverviewStats(['draft', 'pending_ch', 'pending_coo', 'rejected', 'pending_crew_confirmation', 'approved', 'invoiced', 'paid'].map((s) => report(s as Timelog['status'])), [
      { status: 'paid', total: 1000 }, { status: 'sent', total: 500 }, { status: 'draft', total: 900 },
    ] as Invoice[]);
    expect(stats).toEqual({ paidAmount: 1000, toPayAmount: 500, pendingCount: 2, pendingHours: 4, correctionCount: 2, approvedHours: 6 });
  });
  it('formats activity in Prague calendar days and distinguishes missing/invalid times', () => {
    const now = new Date('2026-10-12T08:00:00Z');
    expect(formatCrewActivity('2026-10-11T23:30:00Z', now)).toBe('Dnes');
    expect(formatCrewActivity('2026-10-11T08:00:00Z', now)).toBe('Včera');
    expect(formatCrewActivity('2026-10-09T08:00:00Z', now)).toBe('Před 3 dny');
    expect(formatCrewActivity(null, now)).toBe('Zatím bez aktivity');
    expect(formatCrewActivity('invalid', now)).toBe('Aktivita nedostupná');
    expect(formatCrewActivity('2026-10-15T08:00:00Z', now)).toBe('Aktivita nedostupná');
  });
});
