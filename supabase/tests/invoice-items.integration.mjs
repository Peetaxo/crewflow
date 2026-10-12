import { strict as assert } from 'node:assert';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

// Only the isolated disposable demo may be used for the direct-write rejection probes.
assert.ok(process.argv[2], 'Pass the disposable demo directory');
const demoDir = resolve(process.argv[2]);
const credentials = JSON.parse(await readFile(`${demoDir}/local-credentials.json`, 'utf8'));
const fixtures = JSON.parse(await readFile(`${demoDir}/demo-accounts.json`, 'utf8'));
const url = new URL(credentials.API_URL);
assert.equal(url.protocol, 'http:');
assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname), 'Tests require an isolated local backend');

async function login(key) {
  const account = fixtures.accounts.find((candidate) => candidate.key === key);
  assert.ok(account?.email.endsWith('@crewflow-demo.test'), 'Only disposable demo accounts are allowed');
  const client = createClient(credentials.API_URL, credentials.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const result = await client.auth.signInWithPassword({ email: account.email, password: account.password });
  if (result.error) throw result.error;
  return { client, account };
}

const [coo, crew, crewhead, other] = await Promise.all(['coo', 'crew', 'crewhead', 'other'].map(login));
const invoiceResult = await coo.client.from('invoices').select('*').eq('contractor_id', crew.account.profileId).single();
if (invoiceResult.error) throw invoiceResult.error;
const invoice = invoiceResult.data;
assert.equal(invoice.invoice_number, 'SF-2026-CREW-D-0001');
assert.equal(invoice.total_amount, 2056, 'Use the existing disposable demo invoice');
const before = await coo.client.from('invoice_items').select('*').eq('invoice_id', invoice.id).order('id');
if (before.error) throw before.error;
assert.ok(before.data.length > 0, 'The demo invoice must have persisted items');

for (const [role, session] of [['owner Crew', crew], ['CH', crewhead], ['COO', coo]]) {
  const own = await session.client.from('invoice_items').select('*').eq('invoice_id', invoice.id).order('id');
  if (own.error) throw own.error;
  assert.deepEqual(own.data, before.data, `${role} must read the complete stored invoice breakdown`);
}
const foreign = await other.client.from('invoice_items').select('*').eq('invoice_id', invoice.id);
assert.equal(foreign.error, null);
assert.deepEqual(foreign.data, [], 'Other Crew must not read another contractor\'s items');
const unfiltered = await other.client.from('invoice_items').select('*');
assert.equal(unfiltered.error, null);
assert.deepEqual(unfiltered.data, [], 'Removing the client invoice filter must not expose foreign items');

const anonymous = createClient(credentials.API_URL, credentials.ANON_KEY, { auth: { persistSession: false } });
const anonymousRead = await anonymous.from('invoice_items').select('*');
assert.equal(anonymousRead.error?.code, '42501', 'Anonymous callers must not read invoice items');

const item = before.data[0];
for (const [role, session] of [['owner Crew', crew], ['Other Crew', other], ['CH', crewhead], ['COO', coo]]) {
  const updated = await session.client.from('invoice_items').update({ km: item.km + 1 }).eq('id', item.id);
  assert.equal(updated.error?.code, '42501', `${role} must not directly change invoice items`);
  const inserted = await session.client.from('invoice_items').insert({ ...item, id: crypto.randomUUID() });
  assert.equal(inserted.error?.code, '42501', `${role} must not directly insert invoice items`);
  const deleted = await session.client.from('invoice_items').delete().eq('id', item.id);
  assert.equal(deleted.error?.code, '42501', `${role} must not directly delete invoice items`);
}
const after = await coo.client.from('invoice_items').select('*').eq('invoice_id', invoice.id).order('id');
if (after.error) throw after.error;
assert.deepEqual(after.data, before.data, 'Read access and rejected write probes must not change stored items');
const summary = {
  result: 'passed', invoiceNumber: invoice.invoice_number, totalCZK: invoice.total_amount,
  kilometers: before.data.reduce((sum, row) => sum + Number(row.km), 0),
  travelCZK: invoice.amount_km,
  allowedReads: ['owner Crew', 'CH', 'COO'], deniedReads: ['Other Crew', 'anonymous'],
  deniedDirectWrites: ['insert', 'update', 'delete'], storedItemsUnchanged: true,
};
await writeFile(`${demoDir}/invoice-items-integration.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
