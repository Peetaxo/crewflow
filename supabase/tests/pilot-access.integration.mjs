/** Exact local pilot only. Creates separately named synthetic fixtures; never changes human passwords. */
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const directory = '/Users/peetax/Projekty/.crewflow-onboarding-pilot-20261020';
const config = JSON.parse(readFileSync(`${directory}/local-credentials.json`, 'utf8'));
assert.equal(config.API_URL, 'http://127.0.0.1:55431');
const run = `access-${Date.now()}-${randomBytes(4).toString('hex')}`;
const q = value => `'${String(value).replaceAll("'", "''")}'`;
const sql = text => execFileSync('docker', ['exec', '-i', 'supabase_db_crewflow-onboarding-pilot-20261020',
  'sh', '-c', 'PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin -d postgres -At -v ON_ERROR_STOP=1'],
{ input: text, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 15000 }).trim();
const rolesBefore = sql('select coalesce(json_agg(r order by user_id,role),\'[]\'::json) from public.user_roles r;');
const client = (key = config.ANON_KEY) => createClient(config.API_URL, key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: (input, init) => {
    assert.equal(new URL(typeof input === 'string' ? input : input.url ?? input).origin, config.API_URL);
    return fetch(input, { ...init, redirect: 'error', signal: AbortSignal.timeout(15000) });
  } },
});
const service = client(config.SERVICE_ROLE_KEY);
const anonymous = client();
const actors = [];
let current = 'fixture setup';
let passed = 0;
async function test(label, operation) { current = label; await operation(); passed++; console.log(`PASS ${label}`); }
async function succeeds(result) {
  const r = await result;
  if (r.error) console.error(`Request failed in ${current}: ${r.error.code ?? r.error.statusCode ?? r.error.name}`);
  assert.equal(r.error, null); return r.data;
}
async function denied(result) { const r = await result; assert.ok(r.error, 'request must fail'); return r.error; }
async function empty(result) { const rows = await succeeds(result); assert.deepEqual(rows, []); }
const metadata = { run, actors: [], eventId: randomUUID(), timelogIds: [randomUUID(), randomUUID()], invoiceIds: [randomUUID(), randomUUID()] };

try {
  for (const [key, role] of [['crewA', 'crew'], ['crewB', 'crew'], ['ch', 'crewhead'], ['coo', 'coo']]) {
    current = `${key} fixture creation`;
    const email = `${run}-${key.toLowerCase()}@crewflow-onboarding.test`;
    const password = randomBytes(24).toString('base64url');
    const created = await succeeds(service.auth.admin.createUser({ email, password, email_confirm: true,
      user_metadata: { first_name: 'Access', last_name: key, role: 'coo' } }));
    assert.ok(created.user.id);
    const id = created.user.id;
    const profiles = await succeeds(service.from('profiles').select('id').eq('user_id', id));
    assert.equal(profiles.length, 1, 'new Auth fixture must have exactly one generated profile');
    const profileId = profiles[0].id;
    assert.deepEqual(await succeeds(service.from('user_roles').select('role').eq('user_id', id)), [{ role: 'crew' }],
      'user-editable metadata cannot provision COO');
    const actor = { key, role, id, profileId, client: client() };
    actors.push(actor); metadata.actors.push({ key, role, id, profileId });
    // Assign only newly created synthetic identities through the privileged fixture client.
    await succeeds(service.from('user_roles').delete().eq('user_id', id));
    await succeeds(service.from('user_roles').insert({ user_id: id, role }));
    await succeeds(actor.client.auth.signInWithPassword({ email, password }));
  }
  writeFileSync(`${directory}/${run}.private.json`, JSON.stringify(metadata, null, 2), { mode: 0o600 });
  const [crewA, crewB] = actors;
  current = 'synthetic operational records';
  sql(`begin;
    insert into public.events(id,name,job_number,date_from,date_to) values(${q(metadata.eventId)},${q(run)},${q(run)},'2099-01-01','2099-01-01');
    ${[crewA, crewB].map((actor, i) => `
      insert into public.event_assignments(event_id,profile_id) values(${q(metadata.eventId)},${q(actor.profileId)});
      insert into public.timelogs(id,event_id,contractor_id,status) values(${q(metadata.timelogIds[i])},${q(metadata.eventId)},${q(actor.profileId)},'draft');
      insert into public.invoices(id,contractor_id,status,invoice_number,pdf_path) values(${q(metadata.invoiceIds[i])},${q(actor.profileId)},'draft',${q(`${run}-${i}`)},${q(`${run}/${i}.pdf`)});
      insert into public.invoice_items(invoice_id,event_id,job_number) values(${q(metadata.invoiceIds[i])},${q(metadata.eventId)},${q(run)});
    `).join('\n')}
    commit;`);
  current = 'synthetic attachment upload';
  const buckets = await succeeds(service.storage.listBuckets());
  if (!buckets.some(bucket => bucket.id === 'invoice-pdfs')) {
    await succeeds(service.storage.createBucket('invoice-pdfs', { public: false, allowedMimeTypes: ['application/pdf'], fileSizeLimit: 10485760 }));
  }
  for (let i = 0; i < 2; i++) await succeeds(service.storage.from('invoice-pdfs').upload(`${run}/${i}.pdf`,
    Buffer.from('%PDF-1.4\n% synthetic access fixture\n%%EOF\n'), { contentType: 'application/pdf' }));

  await test('anon cannot execute self-role endpoint or see protected profiles', async () => {
    assert.equal((await denied(anonymous.rpc('set_current_user_role', { p_role: 'coo' }))).code, '42501');
    await empty(anonymous.from('profiles').select('id').eq('id', crewA.profileId));
  });
  await test('anon cannot read operational rows, attachments, invitations or the crew roster RPC', async () => {
    for (const [table, column, id] of [['timelogs', 'id', metadata.timelogIds[0]],
      ['event_assignments', 'event_id', metadata.eventId], ['invoices', 'id', metadata.invoiceIds[0]],
      ['invoice_items', 'invoice_id', metadata.invoiceIds[0]]]) {
      const result = await anonymous.from(table).select(column).eq(column, id);
      if (result.error) assert.equal(result.error.code, '42501');
      else assert.equal(result.data.length, 0, `${table} anonymous read denied`);
    }
    await denied(anonymous.storage.from('invoice-pdfs').download(`${run}/0.pdf`));
    assert.equal((await denied(anonymous.rpc('crew_onboarding_manual_status', { p_profile_id: crewA.profileId }))).code, '42501');
    assert.equal((await denied(anonymous.rpc('list_event_crew_assignments'))).code, '42501');
  });
  for (const actor of actors) {
    await test(`${actor.key}: self-role RPC denied and stored role unchanged`, async () => {
      assert.equal((await denied(actor.client.rpc('set_current_user_role', { p_role: 'coo' }))).code, '42501');
      const rows = await succeeds(service.from('user_roles').select('role').eq('user_id', actor.id));
      assert.deepEqual(rows, [{ role: actor.role }]);
      const roster = await succeeds(actor.client.rpc('list_event_crew_assignments'));
      assert.ok(roster.some(row => row.profile_id === crewA.profileId), 'authenticated roster read preserved');
    });
  }
  for (const [actor, other, index] of [[crewA, crewB, 0], [crewB, crewA, 1]]) {
    await test(`${actor.key}: direct role writes and Auth identity reassignment denied`, async () => {
      await denied(actor.client.from('user_roles').insert({ user_id: actor.id, role: 'coo' }));
      await empty(actor.client.from('user_roles').update({ role: 'coo' }).eq('user_id', actor.id).select());
      assert.equal((await denied(actor.client.from('profiles').update({ user_id: other.id }).eq('id', actor.profileId))).code, '42501');
      assert.deepEqual(await succeeds(service.from('user_roles').select('role').eq('user_id', actor.id)), [{ role: 'crew' }]);
    });
    await test(`${actor.key}: own rows visible, foreign rows hidden`, async () => {
      for (const [table, ownId, otherId] of [
        ['profiles', actor.profileId, other.profileId],
        ['timelogs', metadata.timelogIds[index], metadata.timelogIds[1 - index]],
        ['invoices', metadata.invoiceIds[index], metadata.invoiceIds[1 - index]],
      ]) {
        assert.equal((await succeeds(actor.client.from(table).select('id').eq('id', ownId))).length, 1, `${table} own read`);
        await empty(actor.client.from(table).select('id').eq('id', otherId));
      }
      assert.equal((await succeeds(actor.client.from('event_assignments').select('profile_id').eq('event_id', metadata.eventId))).length, 1);
      assert.equal((await succeeds(actor.client.from('invoice_items').select('id').eq('invoice_id', metadata.invoiceIds[index]))).length, 1);
      await empty(actor.client.from('invoice_items').select('id').eq('invoice_id', metadata.invoiceIds[1 - index]));
      await empty(actor.client.from('timelogs').update({ note: 'forbidden' }).eq('id', metadata.timelogIds[1 - index]).select());
    });
    await test(`${actor.key}: own attachment readable, foreign attachment denied`, async () => {
      await succeeds(actor.client.storage.from('invoice-pdfs').download(`${run}/${index}.pdf`));
      await denied(actor.client.storage.from('invoice-pdfs').download(`${run}/${1 - index}.pdf`));
    });
    await test(`${actor.key}: profile creation and private invitation helper denied`, async () => {
      assert.equal((await denied(actor.client.from('profiles').insert({ first_name: 'Denied', email: `${run}-denied@crewflow-onboarding.test` }))).code, '42501');
      assert.equal((await denied(actor.client.rpc('crew_onboarding_manual_status', { p_profile_id: other.profileId }))).code, '42501');
    });
  }
  for (const actor of actors.slice(2)) {
    await test(`${actor.key}: management reads and unlinked profile creation preserved`, async () => {
      for (const [table, column, ids] of [['profiles', 'id', [crewA.profileId, crewB.profileId]],
        ['timelogs', 'id', metadata.timelogIds], ['invoices', 'id', metadata.invoiceIds],
        ['event_assignments', 'profile_id', [crewA.profileId, crewB.profileId]]]) {
        assert.equal((await succeeds(actor.client.from(table).select(column).in(column, ids))).length, 2, `${table} management read`);
      }
      const rows = await succeeds(actor.client.from('profiles').insert({ first_name: 'Unlinked', last_name: actor.key,
        email: `${run}-${actor.key}-unlinked@crewflow-onboarding.test` }).select('id,user_id'));
      assert.equal(rows.length, 1); assert.equal(rows[0].user_id, null);
      assert.equal((await denied(actor.client.from('profiles').insert({ first_name: 'Denied', user_id: crewA.id,
        email: `${run}-${actor.key}-identity@crewflow-onboarding.test` }))).code, '42501');
      await succeeds(actor.client.storage.from('invoice-pdfs').download(`${run}/0.pdf`));
      await succeeds(actor.client.storage.from('invoice-pdfs').download(`${run}/1.pdf`));
    });
  }
  await test('existing roles unchanged outside newly created fixtures', async () => {
    const original = JSON.parse(rolesBefore);
    const currentRows = JSON.parse(sql('select coalesce(json_agg(r order by user_id,role),\'[]\'::json) from public.user_roles r;'));
    assert.deepEqual(currentRows.filter(r => !actors.some(a => a.id === r.user_id)), original);
  });
  console.log(`PASS ${passed} API permission groups; synthetic fixture metadata retained privately.`);
} catch (error) {
  console.error(`FAIL ${current}: ${error?.code ?? error?.name ?? 'assertion'}; private values suppressed.`);
  if (error?.code === 'ERR_ASSERTION') console.error(error.stack?.split('\n').slice(1, 3).join('\n'));
  process.exitCode = 1;
} finally {
  for (const actor of actors) await actor.client.auth.signOut({ scope: 'local' });
}
