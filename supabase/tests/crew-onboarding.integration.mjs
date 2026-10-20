/** Disposable local pilot only. Never prints credentials, capability tokens, or passwords. */
import { createClient } from '@supabase/supabase-js';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createActivationHandler } from '../functions/crew-onboarding/handler.ts';

const credentialsPath = process.env.CREW_ONBOARDING_TEST_CREDENTIALS ?? '/Users/peetax/Projekty/.crewflow-onboarding-pilot-20261020/local-credentials.json';
const credentials = JSON.parse(readFileSync(credentialsPath, 'utf8'));
const apiUrl = process.env.CREW_ONBOARDING_TEST_URL ?? credentials.API_URL;
const url = new URL(apiUrl);
if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.protocol !== 'http:' || url.port !== '55431') throw new Error('Only disposable local pilot API port 55431 is allowed');
const dbContainer = 'supabase_db_crewflow-onboarding-pilot-20261020';
const service = createClient(apiUrl, credentials.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const anonymous = createClient(apiUrl, credentials.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const run = randomBytes(6).toString('hex');
const email = (label) => `${run}-${label}@crewflow-onboarding.test`;
const q = (value) => `'${String(value).replaceAll("'", "''")}'`;
const hash = (token) => createHash('sha256').update(token).digest('hex');
const check = (condition, label) => { if (!condition) throw new Error(label); };
let current = 'startup';
let passed = 0;
async function test(label, fn) {
  current = label;
  await fn();
  passed++;
  console.log(`PASS ${label}`);
}
function sql(statement) {
  return execFileSync('docker', ['exec', '-i', dbContainer, 'sh', '-c', 'PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin -d postgres -At -v ON_ERROR_STOP=1'], { input: statement, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}
function scalar(statement) { return JSON.parse(sql(`select coalesce(json_agg(t),'[]'::json) from (${statement}) t;`)); }
function invitation(token) { return scalar(`select * from crew_onboarding_private.invitations where token_hash=${q(hash(token))}`)[0]; }
async function rpc(name, args) {
  const result = await service.rpc(name, args);
  check(!result.error && result.data, 'service RPC succeeded');
  return result.data;
}
async function issue(label, args = {}) {
  const recipient = args.p_email ?? email(label);
  check(recipient.endsWith('@crewflow-onboarding.test'), 'synthetic recipient required');
  const data = await rpc('crew_onboarding_create', { p_email: recipient, p_first_name: 'Ada', p_last_name: 'Crew', p_phone: '+420000000000', ...args });
  check(typeof data.token === 'string' && /^[a-f0-9]{64}$/.test(data.token), 'cryptographic invitation issued');
  return data;
}
async function call(body, headers = {}) {
  const response = await fetch(`${apiUrl}/functions/v1/crew-onboarding`, { method: 'POST', headers: { apikey: credentials.ANON_KEY, 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}
const complete = (token, password) => call({ action: 'complete', token, password });
async function expectError(body, error, headers = {}) {
  const response = await call(body, headers);
  check(response.status >= 400 && response.body.error === error, `expected ${error}`);
}
async function signIn(recipient, password) {
  const client = createClient(apiUrl, credentials.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const result = await client.auth.signInWithPassword({ email: recipient, password });
  return { client, result };
}
function assertActive(token, expectedRate = 250) {
  const i = invitation(token);
  check(i.state === 'consumed' && i.consumed_at && i.claimed_at, 'invitation consumed atomically');
  const rows = scalar(`select p.id,p.user_id,p.hourly_rate,p.email,p.first_name,p.last_name,p.phone from public.profiles p where lower(btrim(p.email))=${q(i.email)}`);
  check(rows.length === 1 && rows[0].id === i.profile_id && rows[0].user_id === i.reserved_user_id && Number(rows[0].hourly_rate) === expectedRate, 'one exact bound profile with preserved rate');
  const users = scalar(`select id,email from auth.users where email=${q(i.email)}`);
  check(users.length === 1 && users[0].id === i.reserved_user_id, 'one reserved Auth identity');
  const roles = scalar(`select role from public.user_roles where user_id=${q(i.reserved_user_id)}`);
  check(roles.length === 1 && roles[0].role === 'crew', 'crew role only');
  check(sql(`select count(*) from crew_onboarding_private.trusted_intents where invitation_id=${q(i.id)};`) === '0', 'trusted intent consumed');
  return i;
}

try {
  if (process.argv.includes('--expect-disabled')) {
    await test('feature disabled before any Auth mutation', async () => {
      const before = sql('select count(*) from auth.users;');
      await expectError({ action: 'complete', token: randomBytes(32).toString('hex'), password: randomBytes(24).toString('hex') }, 'disabled');
      check(sql('select count(*) from auth.users;') === before, 'disabled request creates no Auth user');
    });
  } else {
    await test('malformed, unknown, wrong content-type and disallowed-origin requests', async () => {
      await expectError('{', 'invalid_invitation');
      await expectError({ action: 'preview', token: 'bad' }, 'invalid_invitation');
      await expectError({ action: 'preview', token: randomBytes(32).toString('hex') }, 'invalid_invitation');
      await expectError({ action: 'preview', token: randomBytes(32).toString('hex') }, 'invalid_invitation', { 'content-type': 'text/plain' });
      await expectError({ action: 'preview', token: randomBytes(32).toString('hex') }, 'invalid_invitation', { origin: 'https://untrusted.invalid' });
    });
    let fresh;
    await test('48 hour invitation contains only a token hash and preview has zero mutations', async () => {
      fresh = await issue('fresh', { p_phone: null });
      const before = invitation(fresh.token);
      check(Math.abs(Date.parse(before.expires_at) - Date.parse(before.created_at) - 48 * 3600000) < 1000, '48 hour expiry');
      check(before.token_hash === hash(fresh.token) && !Object.values(before).includes(fresh.token), 'hash stored, raw token absent');
      check(sql(`select count(*) from auth.users where email=${q(fresh.email)};`) === '0', 'issuance creates no Auth user');
      const response = await call({ action: 'preview', token: fresh.token }, { origin: 'http://127.0.0.1:8096' });
      check(response.status === 200 && response.body.data.email === fresh.email && response.body.data.firstName === 'Ada' && response.body.data.phone === '', 'preview contract normalizes null phone to string');
      check(JSON.stringify(before) === JSON.stringify(invitation(fresh.token)), 'preview leaves invitation unchanged');
      check(sql(`select count(*) from auth.users where email=${q(fresh.email)};`) === '0', 'preview creates no Auth user');
      await expectError({ action: 'complete', token: fresh.token, password: 'short' }, 'invalid_password');
      check(invitation(fresh.token).state === 'pending', 'weak password never claims');
    });
    await test('24-to-48-hour window activates exactly one new profile at rate 250', async () => {
      sql(`update crew_onboarding_private.invitations set created_at=clock_timestamp()-interval '30 hours',expires_at=clock_timestamp()+interval '18 hours' where token_hash=${q(hash(fresh.token))};`);
      const password = randomBytes(24).toString('hex');
      const response = await complete(fresh.token, password);
      check(response.status === 200 && response.body.data.status === 'active' && response.body.data.profileId === fresh.profileId, 'activation success contract');
      assertActive(fresh.token);
      const signed = await signIn(fresh.email, password);
      check(!signed.result.error && signed.result.data.session, 'ordinary password sign-in succeeds separately');
      await expectError({ action: 'preview', token: fresh.token }, 'already_active');
      await expectError({ action: 'complete', token: fresh.token, password: randomBytes(24).toString('hex') }, 'already_active');
      const signedAgain = await signIn(fresh.email, password);
      check(!signedAgain.result.error, 'used token never resets password');
      const authenticatedRpc = await signed.client.rpc('crew_onboarding_preview', { p_token_hash: hash(fresh.token) });
      check(Boolean(authenticatedRpc.error), 'authenticated cannot call service helper');
      const directRead = await signed.client.schema('crew_onboarding_private').from('invitations').select('id');
      check(Boolean(directRead.error), 'authenticated cannot read private table');
    });
    await test('explicit existing unbound identity preserves its rate and history', async () => {
      const id = randomUUID(); const recipient = email('existing');
      sql(`insert into public.profiles(id,email,first_name,last_name,phone,hourly_rate,note) values(${q(id)},${q(recipient)},'Original','Identity','unchanged',375,'historical-note');`);
      const noExplicit = await rpc('crew_onboarding_create', { p_email: recipient });
      check(noExplicit.error === 'invalid_invitation', 'implicit matching is refused');
      const existing = await issue('existing', { p_profile_id: id, p_email: recipient, p_first_name: 'Must not overwrite', p_phone: 'Must not overwrite' });
      const response = await complete(existing.token, randomBytes(24).toString('hex'));
      check(response.status === 200, 'existing profile activation');
      assertActive(existing.token, 375);
      const p = scalar(`select first_name,last_name,phone,note from public.profiles where id=${q(id)}`)[0];
      check(p.first_name === 'Original' && p.last_name === 'Identity' && p.phone === 'unchanged' && p.note === 'historical-note', 'identity and history unchanged');
      const bound = await rpc('crew_onboarding_create', { p_email: recipient, p_profile_id: id });
      check(bound.error === 'already_active', 'bound identity rejected');
      const ambiguousEmail = email('ambiguous');
      const a = randomUUID();
      sql(`insert into public.profiles(id,email) values(${q(a)},${q(ambiguousEmail)}),(gen_random_uuid(),${q(ambiguousEmail)});`);
      check((await rpc('crew_onboarding_create', { p_email: ambiguousEmail, p_profile_id: a })).error === 'invalid_invitation', 'ambiguous profiles refused');
    });
    await test('expired and revoked invitations create no Auth identity', async () => {
      const expired = await issue('expired');
      sql(`update crew_onboarding_private.invitations set expires_at=clock_timestamp()-interval '1 second' where token_hash=${q(hash(expired.token))};`);
      await expectError({ action: 'preview', token: expired.token }, 'expired_invitation');
      await expectError({ action: 'complete', token: expired.token, password: randomBytes(24).toString('hex') }, 'expired_invitation');
      const revoked = await issue('revoked');
      await rpc('crew_onboarding_cancel', { p_profile_id: revoked.profileId });
      await expectError({ action: 'preview', token: revoked.token }, 'invalid_invitation');
      await expectError({ action: 'complete', token: revoked.token, password: randomBytes(24).toString('hex') }, 'invalid_invitation');
      check(sql(`select count(*) from auth.users where email in(${q(expired.email)},${q(revoked.email)});`) === '0', 'invalid capabilities create no Auth users');
    });
    await test('concurrent different passwords are first-wins and cannot reset an account', async () => {
      const invite = await issue('race');
      const passwords = [randomBytes(24).toString('hex'), randomBytes(24).toString('hex')];
      const responses = await Promise.all(passwords.map((password) => complete(invite.token, password)));
      const winners = responses.map((response, index) => response.status === 200 ? index : -1).filter((index) => index >= 0);
      check(winners.length === 1, 'exactly one completion wins');
      const winner = winners[0]; const loser = 1 - winner;
      check(['already_active', 'activation_in_progress'].includes(responses[loser].body.error), 'concurrent loser cannot mutate Auth');
      check(!(await signIn(invite.email, passwords[winner])).result.error, 'winner password signs in');
      check(Boolean((await signIn(invite.email, passwords[loser])).result.error), 'loser password cannot sign in');
      await expectError({ action: 'complete', token: invite.token, password: passwords[loser] }, 'already_active');
      check(!(await signIn(invite.email, passwords[winner])).result.error, 'first password remains unchanged');
      assertActive(invite.token);
    });
    await test('untrusted signup metadata cannot bind an existing profile', async () => {
      const target = await issue('metadata-target');
      const attackerEmail = email('metadata-unrelated');
      const created = await service.auth.admin.createUser({ email: attackerEmail, password: randomBytes(24).toString('hex'), email_confirm: true, user_metadata: { profile_id: target.profileId, invitation_token: 'untrusted-value', role: 'coo' } });
      check(!created.error && created.data.user, 'legacy unrelated admin creation preserved');
      check(scalar(`select user_id from public.profiles where id=${q(target.profileId)}`)[0].user_id === null, 'metadata cannot bind target');
      const attacker = scalar(`select id from public.profiles where user_id=${q(created.data.user.id)}`);
      check(attacker.length === 1 && attacker[0].id !== target.profileId, 'legacy account has its own profile');
      const roles = scalar(`select role from public.user_roles where user_id=${q(created.data.user.id)}`);
      check(roles.length === 1 && roles[0].role === 'crew', 'metadata cannot escalate role');
      const reserved = invitation(target.token).reserved_user_id;
      const noIntent = await service.auth.admin.createUser({ id: reserved, email: target.email, password: randomBytes(24).toString('hex'), email_confirm: true, user_metadata: { profile_id: target.profileId } });
      check(Boolean(noIntent.error), 'reserved UUID requires private trusted intent');
      check(sql(`select count(*) from auth.users where id=${q(reserved)};`) === '0', 'rejected trigger rolls back Auth insert');
    });
    await test('claim-time cancellation, reissue and expiry are rechecked inside Auth insert', async () => {
      for (const scenario of ['cancel', 'reissue', 'expire']) {
        const invite = await issue(`claim-${scenario}`);
        const claim = await rpc('crew_onboarding_claim', { p_token_hash: hash(invite.token) });
        check(claim.reservedUserId, 'claim reserves exact UUID');
        if (scenario === 'cancel') await rpc('crew_onboarding_cancel', { p_profile_id: invite.profileId });
        if (scenario === 'reissue') await issue('replacement', { p_email: invite.email, p_profile_id: invite.profileId });
        if (scenario === 'expire') sql(`update crew_onboarding_private.invitations set expires_at=clock_timestamp()-interval '1 second' where token_hash=${q(hash(invite.token))};`);
        const result = await service.auth.admin.createUser({ id: claim.reservedUserId, email: invite.email, password: randomBytes(24).toString('hex'), email_confirm: true });
        check(Boolean(result.error), 'invalidated claim cannot commit Auth insert');
        check(sql(`select count(*) from auth.users where id=${q(claim.reservedUserId)};`) === '0', 'no orphan Auth identity');
        check(scalar(`select user_id from public.profiles where id=${q(invite.profileId)}`)[0].user_id === null, 'original profile remains unbound');
      }
    });
    await test('real Auth transport-loss recovery verifies consumed binding without password reset', async () => {
      const store = {
        preview: async (h) => { const data = await rpc('crew_onboarding_preview', { p_token_hash: h }); return data.error ? data : { data }; },
        claim: async (h) => { const data = await rpc('crew_onboarding_claim', { p_token_hash: h }); return data.error ? data : { data }; },
        verify: async (h, id) => { const data = await rpc('crew_onboarding_verify', { p_token_hash: h, p_reserved_user_id: id }); return data.error ? data : { data }; },
        release: (h, id) => rpc('crew_onboarding_release', { p_token_hash: h, p_claim_id: id }),
      };
      const invite = await issue('reconcile');
      const password = randomBytes(24).toString('hex');
      let creates = 0;
      const lostResponse = createActivationHandler({ enabled: true, allowedOrigins: [], store, auth: {
        createUser: async (attributes) => {
          creates++;
          const result = await service.auth.admin.createUser(attributes);
          check(!result.error, 'real create commits before injected transport loss');
          throw new Error('injected lost response');
        },
        getUserById: (id) => service.auth.admin.getUserById(id),
      } });
      const response = await lostResponse(new Request(`${apiUrl}/functions/v1/crew-onboarding`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'complete', token: invite.token, password }) }));
      const active = await response.json();
      check(response.status === 200 && active.data.profileId === invite.profileId && creates === 1, 'real handler reconciles exact reserved identity after lost create response');
      await expectError({ action: 'complete', token: invite.token, password: randomBytes(24).toString('hex') }, 'already_active');
      check(!(await signIn(invite.email, password)).result.error, 'reconciliation preserves original password');
      assertActive(invite.token);
      const stuck = await issue('ambiguous-absent');
      const lostBeforeCreate = createActivationHandler({ enabled: true, allowedOrigins: [], store, auth: {
        createUser: async () => { throw new Error('injected transport loss before create'); },
        getUserById: (id) => service.auth.admin.getUserById(id),
      } });
      const unavailable = await lostBeforeCreate(new Request(`${apiUrl}/functions/v1/crew-onboarding`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'complete', token: stuck.token, password: randomBytes(24).toString('hex') }) }));
      check(unavailable.status === 503 && (await unavailable.json()).error === 'activation_unavailable', 'absent-user lost response stays unavailable');
      await expectError({ action: 'complete', token: stuck.token, password: randomBytes(24).toString('hex') }, 'activation_in_progress');
      check(sql(`select count(*) from auth.users where email=${q(stuck.email)};`) === '0', 'ambiguous absent claim is never retried');
      const replacement = await issue('recovery-reissue', { p_email: stuck.email, p_profile_id: stuck.profileId });
      check((await complete(replacement.token, randomBytes(24).toString('hex'))).status === 200, 'service reissue recovers absent locked claim');
      assertActive(replacement.token);
    });
    await test('anonymous clients cannot call helpers, read private tables, or publicly sign up', async () => {
      for (const [name, args] of [
        ['crew_onboarding_create', { p_email: email('forbidden') }],
        ['crew_onboarding_preview', { p_token_hash: hash(fresh.token) }],
        ['crew_onboarding_claim', { p_token_hash: hash(fresh.token) }],
        ['crew_onboarding_verify', { p_token_hash: hash(fresh.token), p_reserved_user_id: randomUUID() }],
        ['crew_onboarding_release', { p_token_hash: hash(fresh.token), p_claim_id: randomUUID() }],
        ['crew_onboarding_cancel', { p_profile_id: fresh.profileId }],
      ]) check(Boolean((await anonymous.rpc(name, args)).error), 'anonymous helper denied');
      check(Boolean((await anonymous.schema('crew_onboarding_private').from('invitations').select('id')).error), 'private table unexposed');
      check(Boolean((await anonymous.auth.signUp({ email: email('public-signup'), password: randomBytes(24).toString('hex') })).error), 'pilot does not enable broad registration');
    });
  }
  console.log(`PASS ${passed} local onboarding integration groups`);
} catch {
  console.error(`FAIL ${current}; details suppressed to protect invitation and Auth secrets`);
  process.exitCode = 1;
}
