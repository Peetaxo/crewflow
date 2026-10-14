import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

// No dotenv: this suite must never discover the repository's hosted settings.
assert.ok(process.argv[2], 'Pass the isolated demo credentials directory');
const dir = resolve(process.argv[2]);
const config = JSON.parse(await readFile(`${dir}/local-credentials.json`, 'utf8'));
const fixtures = JSON.parse(await readFile(`${dir}/demo-accounts.json`, 'utf8'));
assert.equal(config.API_URL, 'http://127.0.0.1:55321');
const sessions = await Promise.all(['crew', 'other', 'crewhead', 'coo'].map(async key => {
  const account = fixtures.accounts.find(row => row.key === key);
  assert.ok(account.email.endsWith('@crewflow-demo.test'));
  const client = createClient(config.API_URL, config.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email: account.email, password: account.password });
  assert.equal(error, null);
  return { key, account, client };
}));
for (const { key, client, account } of sessions) {
  const snapshot = await client.rpc('get_invoice_billing_snapshot');
  assert.equal(snapshot.error, null, `${key}: billing snapshot RPC exists and authorizes current identity`);
  assert.equal(snapshot.data.version, 1);
  assert.ok(Array.isArray(snapshot.data.statements));
  assert.ok(Array.isArray(snapshot.data.documents));
  if (key === 'crew' || key === 'other') {
    assert.ok(snapshot.data.statements.every(row => row.contractor_id === account.profileId));
  }
  const jobs = await client.rpc('claim_invoice_billing_jobs', { p_limit: 1 });
  assert.equal(jobs.error?.code, '42501', 'Public user cannot claim private durable jobs');
  const direct = await client.from('invoice_billing_statements').insert({ contractor_id: account.profileId });
  assert.equal(direct.error?.code, '42501', 'Statement writes require the authorized RPC');
}
const anonymous = createClient(config.API_URL, config.ANON_KEY, { auth: { persistSession: false } });
assert.equal((await anonymous.rpc('get_invoice_billing_snapshot')).error?.code, '42501');
const historical = await sessions[3].client.from('invoices').select('total_amount,status,invoice_number').eq('invoice_number', 'SF-2026-CREW-D-0001').single();
assert.equal(historical.error, null);
assert.equal(historical.data.total_amount, 2056, 'Existing paid demo invoice remains intact');
assert.equal(historical.data.status, 'paid');
console.log('PASS: local authenticated snapshot, owner isolation, direct-write and job ACLs, historical paid invoice');
