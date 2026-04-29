import { describe, expect, it } from 'vitest';

import {
  buildProfilesInsertSql,
  parseBackupDataText,
  profilePayloadFromCrewMember,
} from '../../scripts/crew-import-utils.mjs';

describe('crew import utilities', () => {
  it('parses backupData exported with as const', () => {
    const parsed = parseBackupDataText('export const backupData = {"crew":[{"id":1,"name":"Ada Lovelace"}]} as const;');

    expect(parsed.crew).toEqual([{ id: 1, name: 'Ada Lovelace' }]);
  });

  it('maps a backup crew member to the legacy profiles schema', () => {
    const payload = profilePayloadFromCrewMember({
      id: 42,
      name: 'Barbora Sterbova',
      phone: '775188400',
      email: 'barbora@example.com',
      ico: '',
      dic: '',
      bank: '',
      billingStreet: '',
      billingZip: '',
      billingCity: '',
      billingCountry: 'Ceska republika',
      rate: 240,
      tags: ['Ridic'],
      bg: '#EAF3DE',
      fg: '#3B6D11',
      reliable: true,
      note: 'Role: COO',
    });

    expect(payload).toMatchObject({
      user_id: null,
      first_name: 'Barbora',
      last_name: 'Sterbova',
      phone: '775188400',
      email: 'barbora@example.com',
      hourly_rate: 240,
      tags: ['Ridic'],
      avatar_bg: '#EAF3DE',
      avatar_color: '#3B6D11',
      reliability: 4,
    });
    expect(payload).not.toHaveProperty('rating');
    expect(payload).not.toHaveProperty('reliable');
  });

  it('escapes SQL values and updates existing rows without requiring a unique index', () => {
    const sql = buildProfilesInsertSql([
      profilePayloadFromCrewMember({
        id: 7,
        name: "Jan O'Brien",
        phone: '',
        email: '',
        ico: '',
        dic: '',
        bank: '',
        billingStreet: '',
        billingZip: '',
        billingCity: '',
        billingCountry: 'Ceska republika',
        rate: 200,
        tags: [],
        bg: '#fff',
        fg: '#111',
        reliable: true,
        note: "can't login yet",
      }),
    ]);

    expect(sql).toContain("Jan");
    expect(sql).toContain("O''Brien");
    expect(sql).toContain("can''t login yet");
    expect(sql).toContain('null::uuid');
    expect(sql).toContain('update public.profiles as target');
    expect(sql).toContain('target.user_id = incoming.user_id');
    expect(sql).toContain('lower(target.email) = lower(incoming.email)');
    expect(sql).toContain('target.phone = incoming.phone');
    expect(sql).toContain('where not exists');
  });
});
