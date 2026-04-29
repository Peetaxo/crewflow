export function parseBackupDataText(text) {
  const jsonText = text
    .replace(/^export const backupData = /, '')
    .replace(/\s+as const\s*;?\s*$/, '');

  return JSON.parse(jsonText);
}

export function stableSyntheticUserId(localId) {
  const tail = String(localId).padStart(12, '0');
  return `00000000-0000-4000-8000-${tail}`;
}

function splitName(name) {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) {
    return { firstName: parts[0] ?? '', lastName: '' };
  }

  return {
    firstName: parts.slice(0, -1).join(' '),
    lastName: parts.at(-1),
  };
}

function nullableText(value) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

export function profilePayloadFromCrewMember(member) {
  const { firstName, lastName } = splitName(member.name);

  return {
    user_id: null,
    first_name: firstName || String(member.name ?? '').trim(),
    last_name: lastName,
    phone: nullableText(member.phone),
    email: nullableText(member.email),
    ico: nullableText(member.ico),
    dic: nullableText(member.dic),
    bank_account: nullableText(member.bank),
    iban: nullableText(member.iban),
    billing_street: nullableText(member.billingStreet),
    billing_zip: nullableText(member.billingZip),
    billing_city: nullableText(member.billingCity ?? member.city),
    billing_country: nullableText(member.billingCountry) ?? 'Ceska republika',
    hourly_rate: Number(member.rate) || 0,
    tags: Array.isArray(member.tags) ? member.tags : [],
    avatar_color: nullableText(member.fg),
    avatar_bg: nullableText(member.bg),
    note: nullableText(member.note),
    reliability: member.reliable ? 4 : 1,
  };
}

function sqlLiteral(value, column) {
  if (column === 'user_id') {
    if (value == null) return 'null::uuid';
    return `'${String(value).replaceAll("'", "''")}'::uuid`;
  }

  if (value == null) return 'null';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '0';
  if (Array.isArray(value)) {
    return `array[${value.map(sqlLiteral).join(', ')}]::text[]`;
  }

  return `'${String(value).replaceAll("'", "''")}'`;
}

export function buildProfilesInsertSql(payloads) {
  const columns = [
    'user_id',
    'first_name',
    'last_name',
    'phone',
    'email',
    'ico',
    'dic',
    'bank_account',
    'iban',
    'billing_street',
    'billing_zip',
    'billing_city',
    'billing_country',
    'hourly_rate',
    'tags',
    'avatar_color',
    'avatar_bg',
    'note',
    'reliability',
  ];

  const rows = payloads.map((payload) => (
    `  (${columns.map((column) => sqlLiteral(payload[column], column)).join(', ')})`
  ));

  const updateAssignments = columns
    .filter((column) => column !== 'user_id')
    .map((column) => `${column} = incoming.${column}`)
    .join(',\n    ');

  return [
    'begin;',
    '',
    `with incoming (${columns.join(', ')}) as (`,
    'values',
    `${rows.join(',\n')}`,
    '), updated as (',
    '  update public.profiles as target set',
    `    ${updateAssignments},`,
    '    updated_at = now()',
    '  from incoming',
    '  where (',
    '      target.user_id is not null',
    '      and incoming.user_id is not null',
    '      and target.user_id = incoming.user_id',
    '    )',
    '    or (',
    '      target.email is not null',
    '      and incoming.email is not null',
    '      and lower(target.email) = lower(incoming.email)',
    '    )',
    '    or (',
    '      target.phone is not null',
    '      and incoming.phone is not null',
    '      and target.phone = incoming.phone',
    '    )',
    '  returning target.user_id',
    ')',
    `insert into public.profiles (${columns.join(', ')})`,
    `select ${columns.join(', ')}`,
    'from incoming',
    'where not exists (',
    '  select 1',
    '  from public.profiles as target',
    '  where (',
    '      target.user_id is not null',
    '      and incoming.user_id is not null',
    '      and target.user_id = incoming.user_id',
    '    )',
    '    or (',
    '      target.email is not null',
    '      and incoming.email is not null',
    '      and lower(target.email) = lower(incoming.email)',
    '    )',
    '    or (',
    '      target.phone is not null',
    '      and incoming.phone is not null',
    '      and target.phone = incoming.phone',
    '    )',
    ');',
    '',
    'commit;',
    '',
  ].join('\n');
}
