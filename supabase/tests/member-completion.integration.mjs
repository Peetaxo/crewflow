/**
 * Disposable local pilot only. Run with:
 * node supabase/tests/member-completion.integration.mjs [--credentials /exact/pilot/local-credentials.json]
 * Add --profile-insert-access to stop after scoped profile INSERT RLS checks.
 * The INSERT cases require the reviewed profiles_management_insert_unlinked
 * migration. This runner never installs or changes a database policy.
 * Passwords, sessions, invitation tokens and captured messages remain in memory.
 * Every run leaves its own completion-* synthetic fixture available for audit.
 */
import { createClient } from '@supabase/supabase-js';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';

const PILOT_DIRECTORY = '/Users/peetax/Projekty/.crewflow-onboarding-pilot-20261020';
const API_URL = 'http://127.0.0.1:55431';
const MAILPIT_URL = 'http://127.0.0.1:55434';
const WEB_URL = 'http://127.0.0.1:8096';
const DB_CONTAINER = 'supabase_db_crewflow-onboarding-pilot-20261020';
const HUMAN_PROFILE_ID = '933f4420-c17c-432b-8ced-9ccaf646de59';
const HUMAN_USER_ID = '872ee197-4ae0-4da9-a671-615511bace59';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const SYNTHETIC = /^[a-z0-9][a-z0-9._+-]*@crewflow-onboarding\.test$/;
const RECOVERY_TOKEN = /^[A-Za-z0-9_-]{20,512}$/;
let current = 'guarded local preflight';
let failedAssertion = '';
let passed = 0;

const check = (condition, label) => {
  if (!condition) { failedAssertion = label; throw new Error('private test detail suppressed'); }
};
const synthetic = (email) => check(typeof email === 'string' && SYNTHETIC.test(email), 'synthetic recipient guard');
const q = (value) => `'${String(value).replaceAll("'", "''")}'`;
const digest = (token) => createHash('sha256').update(token).digest('hex');
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const password8 = () => `Aa1!${randomBytes(3).toString('base64url')}`;
const password7 = () => `Aa1!${randomBytes(2).toString('base64url')}`;

async function test(label, operation) {
  current = label;
  failedAssertion = '';
  await operation();
  passed++;
  console.log(`PASS ${label}`);
}

function privateJson(file, expectedPath) {
  check(realpathSync(file) === expectedPath, 'exact private fixture path');
  const status = statSync(file);
  check(status.isFile() && (status.mode & 0o077) === 0, 'private fixture file permissions');
  return JSON.parse(readFileSync(file, 'utf8'));
}

function sql(statement) {
  return execFileSync('docker', [
    'exec', '-i', DB_CONTAINER, 'sh', '-c',
    'PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin -d postgres -At -v ON_ERROR_STOP=1',
  ], { input: statement, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 15000 }).trim();
}
function rows(statement) {
  return JSON.parse(sql(`select coalesce(json_agg(t),'[]'::json) from (${statement}) t;`));
}

async function main() {
  const allArgs = process.argv.slice(2);
  const profileInsertOnly = allArgs.includes('--profile-insert-access');
  check(allArgs.filter((arg) => arg === '--profile-insert-access').length <= 1, 'one scoped access flag');
  const args = allArgs.filter((arg) => arg !== '--profile-insert-access');
  check(args.length === 0 || (args.length === 2 && args[0] === '--credentials'), 'supported local runner arguments');
  check(realpathSync(PILOT_DIRECTORY) === PILOT_DIRECTORY, 'exact disposable pilot directory');
  const expectedCredentials = path.join(PILOT_DIRECTORY, 'local-credentials.json');
  const credentials = privateJson(args[1] ?? expectedCredentials, expectedCredentials);
  check(credentials.API_URL === API_URL && credentials.MAILPIT_URL === MAILPIT_URL, 'exact local API and Mailpit URLs');
  check(typeof credentials.ANON_KEY === 'string' && credentials.ANON_KEY.length > 20
    && typeof credentials.SERVICE_ROLE_KEY === 'string' && credentials.SERVICE_ROLE_KEY.length > 20, 'local keys available privately');
  const operatorPath = path.join(PILOT_DIRECTORY, 'manual-invitation-operator.private.json');
  const operator = privateJson(operatorPath, operatorPath);
  synthetic(operator.email);
  check(UUID.test(operator.userId) && operator.userId !== HUMAN_USER_ID
    && typeof operator.password === 'string' && operator.password.length > 0, 'existing synthetic operator identity');

  const run = `completion-${Date.now()}-${randomBytes(4).toString('hex')}`;
  const fixture = {
    profileId: randomUUID(), email: `${run}-member@crewflow-onboarding.test`,
    first_name: 'Completion', last_name: 'Pilot', city: 'Brno', hourly_rate: 250,
    note: `${run} preserve-history`,
  };
  const unknownEmail = `${run}-unknown@crewflow-onboarding.test`;
  synthetic(fixture.email); synthetic(unknownEmail);
  check(fixture.profileId !== HUMAN_PROFILE_ID && fixture.email !== operator.email, 'separate new synthetic member');
  const guardFixture = () => {
    synthetic(fixture.email);
    check(fixture.email.startsWith(`${run}-`) && UUID.test(fixture.profileId)
      && fixture.profileId !== HUMAN_PROFILE_ID && fixture.userId !== HUMAN_USER_ID
      && fixture.userId !== operator.userId, 'exact disposable fixture guard');
  };

  // Even SDK requests cannot follow redirects or leave the two exact local origins.
  const guardedFetch = async (input, init = {}) => {
    const target = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    check(target.origin === API_URL && !target.username && !target.password
      && (target.pathname.startsWith('/auth/v1/') || target.pathname.startsWith('/rest/v1/')), 'SDK local request guard');
    return fetch(input, { ...init, redirect: 'error', signal: AbortSignal.timeout(15000) });
  };
  const client = (key = credentials.ANON_KEY) => createClient(API_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: `completion-${randomUUID()}` },
    global: { fetch: guardedFetch },
  });
  const service = client(credentials.SERVICE_ROLE_KEY);
  const operatorClient = client();

  async function edge(name, body, token) {
    check(['crew-invitations', 'crew-onboarding'].includes(name), 'fixed Edge Function guard');
    if (name === 'crew-invitations') {
      guardFixture();
      check(body.profileId === fixture.profileId && (!body.expectedEmail || body.expectedEmail === fixture.email), 'fixture invitation request guard');
    }
    const response = await fetch(`${API_URL}/functions/v1/${name}`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { apikey: credentials.ANON_KEY, 'content-type': 'application/json', origin: WEB_URL,
        ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  }
  async function mailbox(email) {
    synthetic(email);
    check(email === fixture.email || email === unknownEmail, 'fixture mailbox guard');
    const response = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`, {
      redirect: 'error', signal: AbortSignal.timeout(15000),
    });
    check(response.ok, 'local Mailpit search');
    const body = await response.json();
    check(Number.isInteger(body.messages_count) && Array.isArray(body.messages), 'Mailpit search shape');
    return body;
  }
  async function waitForMail(email, count) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const result = await mailbox(email);
      if (result.messages_count === count) return result;
      check(result.messages_count < count, 'no duplicate captured messages');
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    check(false, 'expected captured message arrived');
  }
  async function message(id, listing) {
    check(typeof id === 'string' && /^[a-zA-Z0-9-]{1,100}$/.test(id)
      && listing.messages.some((entry) => entry.ID === id), 'captured fixture message ID');
    const response = await fetch(`${MAILPIT_URL}/api/v1/message/${encodeURIComponent(id)}`, {
      redirect: 'error', signal: AbortSignal.timeout(15000),
    });
    check(response.ok, 'private captured message read');
    const body = await response.json();
    check(typeof body.HTML === 'string' && typeof body.Text === 'string', 'captured message parts');
    return body;
  }
  async function signIn(email, password) {
    synthetic(email);
    check(email === operator.email || email === fixture.email, 'fixture password login guard');
    const isolated = client();
    return { client: isolated, result: await isolated.auth.signInWithPassword({ email, password }) };
  }
  const authRows = (email) => { synthetic(email); return rows(`select id,email from auth.users where email=${q(email)}`); };
  const profileRow = () => {
    guardFixture();
    const result = rows(`select * from public.profiles where id=${q(fixture.profileId)} and email=${q(fixture.email)}`);
    check(result.length === 1, 'one exact synthetic profile'); return result[0];
  };
  const invitationRow = () => {
    guardFixture();
    const result = rows(`select * from crew_onboarding_private.invitations where id=${q(fixture.invitationId)} and profile_id=${q(fixture.profileId)} and email=${q(fixture.email)}`);
    check(result.length === 1, 'one exact synthetic invitation'); return result[0];
  };
  const roleRows = () => {
    guardFixture(); check(UUID.test(fixture.userId), 'activated fixture user ID');
    return rows(`select * from public.user_roles where user_id=${q(fixture.userId)} order by id`);
  };
  const protectedSnapshot = () => ({
    humanProfiles: rows(`select * from public.profiles where id=${q(HUMAN_PROFILE_ID)} or user_id=${q(HUMAN_USER_ID)} order by id`),
    humanAuth: rows(`select id,email,created_at from auth.users where id=${q(HUMAN_USER_ID)}`),
    humanRoles: rows(`select * from public.user_roles where user_id=${q(HUMAN_USER_ID)} order by id`),
    operatorProfiles: rows(`select * from public.profiles where user_id=${q(operator.userId)} order by id`),
    operatorRoles: rows(`select * from public.user_roles where user_id=${q(operator.userId)} order by id`),
  });
  let preserved, operatorSession, invitationBeforeCompletion, activatedProfile, activatedRoles;
  const assertOperatorSession = async () => {
    const result = await operatorClient.auth.getSession();
    check(!result.error && same(result.data.session, operatorSession), 'main operator session remains unchanged');
  };
  const assertActivated = () => {
    const profile = profileRow();
    const identities = authRows(fixture.email);
    check(profile.user_id === fixture.userId && Number(profile.hourly_rate) === 250
      && profile.first_name === fixture.first_name && profile.last_name === fixture.last_name
      && profile.billing_city === fixture.city && profile.note === fixture.note, 'same profile identity history and rate');
    check(identities.length === 1 && identities[0].id === fixture.userId, 'exactly one created Auth account');
    const roles = roleRows();
    check(roles.length === 1 && roles[0].role === 'crew', 'exactly one crew role');
    const invitation = invitationRow();
    check(invitation.state === 'consumed' && invitation.reserved_user_id === fixture.userId
      && invitation.consumed_at && invitation.claimed_at, 'invitation consumed with exact binding');
    check(sql(`select count(*) from crew_onboarding_private.trusted_intents where invitation_id=${q(fixture.invitationId)};`) === '0', 'private creation intent consumed');
  };

  await test('exact local guards and existing operator password login', async () => {
    const identity = await service.auth.admin.getUserById(operator.userId);
    check(!identity.error && identity.data.user?.email === operator.email, 'existing operator identity matches privately');
    const signed = await operatorClient.auth.signInWithPassword({ email: operator.email, password: operator.password });
    check(!signed.error && signed.data.session?.user.id === operator.userId, 'ordinary existing operator password login');
    operatorSession = signed.data.session;
    preserved = protectedSnapshot();
    check(preserved.humanProfiles.some((row) => row.id === HUMAN_PROFILE_ID && row.user_id === HUMAN_USER_ID)
      && preserved.humanAuth.length === 1, 'original human binding present before test');
    const response = await guardedFetch(`${API_URL}/auth/v1/settings`, { headers: { apikey: credentials.ANON_KEY } });
    check(response.ok && (await response.json()).disable_signup === true, 'public account registration remains disabled');
    check(authRows(fixture.email).length === 0 && authRows(unknownEmail).length === 0, 'fresh synthetic emails have no accounts');
  });

  await test('service inserts a fresh unbound member profile at rate 250', async () => {
    guardFixture();
    const result = await service.from('profiles').insert({
      id: fixture.profileId, email: fixture.email, first_name: fixture.first_name, last_name: fixture.last_name,
      billing_city: fixture.city, hourly_rate: fixture.hourly_rate, note: fixture.note,
    }).select('id,user_id').single();
    check(!result.error && result.data?.id === fixture.profileId && result.data.user_id === null, 'fresh unbound profile inserted');
    const stored = profileRow();
    check(stored.user_id === null && Number(stored.hourly_rate) === 250 && stored.note === fixture.note, 'unbound identity rate and note preserved');
    check((await mailbox(fixture.email)).messages_count === 0, 'new member mailbox initially empty');
  });

  let activationToken;
  const inviteRequest = { action: 'invite', profileId: fixture.profileId, expectedEmail: fixture.email,
    requestId: randomUUID(), expectedInvitationId: null, replaceExisting: false };
  await test('real invitation endpoint captures one current 48 hour native test link', async () => {
    const status = await edge('crew-invitations', { action: 'status', profileId: fixture.profileId }, operatorSession.access_token);
    check(status.status === 200 && status.body.data?.state === 'not_invited'
      && status.body.data.invitationId === null, 'fresh optimistic invitation version');
    inviteRequest.expectedInvitationId = status.body.data.invitationId;
    const result = await edge('crew-invitations', inviteRequest, operatorSession.access_token);
    check(result.status === 200 && result.body.data?.state === 'pending'
      && result.body.data.email === fixture.email && result.body.data.profileId === fixture.profileId
      && UUID.test(result.body.data.invitationId), 'real invitation captured');
    fixture.invitationId = result.body.data.invitationId;
    invitationBeforeCompletion = invitationRow();
    check(invitationBeforeCompletion.manual_request_id === inviteRequest.requestId && invitationBeforeCompletion.mail_captured_at
      && Math.abs(Date.parse(invitationBeforeCompletion.expires_at) - Date.parse(invitationBeforeCompletion.created_at) - 48 * 3600000) < 1000, 'one captured request with 48 hour expiry');
    check(authRows(fixture.email).length === 0 && profileRow().user_id === null, 'invitation alone creates no account');
    const listing = await waitForMail(fixture.email, 1);
    const mail = await message(listing.messages[0].ID, listing);
    const native = [...mail.HTML.matchAll(/href="(nodu-test:\/\/activate#token=([a-f0-9]{64}))"/g)];
    const web = [...mail.HTML.matchAll(/href="(http:\/\/127\.0\.0\.1:8096\/activate#token=([a-f0-9]{64}))"/g)];
    check(native.length === 1 && web.length === 1 && native[0][2] === web[0][2]
      && !`${mail.HTML}${mail.Text}`.includes('nodu://activate') && mail.Text.includes('48 hodin'), 'one matching native test and fixed local web capability');
    activationToken = native[0][2];
    check(invitationBeforeCompletion.token_hash === digest(activationToken)
      && !Object.values(invitationBeforeCompletion).includes(activationToken), 'only capability hash stored');
    check(sql(`select count(*) from crew_onboarding_private.invitations where profile_id=${q(fixture.profileId)} and state='pending';`) === '1', 'one current pending invitation');
    const replay = await edge('crew-invitations', inviteRequest, operatorSession.access_token);
    check(replay.status === 200 && replay.body.data?.invitationId === fixture.invitationId
      && (await mailbox(fixture.email)).messages_count === 1, 'request replay never duplicates current mail');
  });

  const firstPassword = password8();
  await test('real onboarding preview rejects seven and accepts exactly eight ASCII characters', async () => {
    const before = profileRow();
    const preview = await edge('crew-onboarding', { action: 'preview', token: activationToken });
    check(preview.status === 200 && preview.body.data?.email === fixture.email
      && preview.body.data.firstName === fixture.first_name && preview.body.data.lastName === fixture.last_name, 'preview resolves exact intended member');
    check(same(before, profileRow()) && same(invitationBeforeCompletion, invitationRow())
      && authRows(fixture.email).length === 0, 'preview leaves profile invitation and Auth unchanged');
    const shortPassword = password7();
    check(shortPassword.length === 7 && firstPassword.length === 8 && Buffer.byteLength(firstPassword, 'utf8') === 8, 'exact ASCII password boundaries generated privately');
    const rejected = await edge('crew-onboarding', { action: 'complete', token: activationToken, password: shortPassword });
    check(rejected.status === 422 && rejected.body.error === 'invalid_password', 'seven character activation rejected');
    check(same(invitationBeforeCompletion, invitationRow()) && authRows(fixture.email).length === 0
      && profileRow().user_id === null, 'short activation creates no account or claim');
    const result = await edge('crew-onboarding', { action: 'complete', token: activationToken, password: firstPassword });
    check(result.status === 200 && result.body.data?.status === 'active'
      && result.body.data.profileId === fixture.profileId && result.body.data.email === fixture.email, 'exactly eight character activation accepted');
    fixture.userId = invitationRow().reserved_user_id;
    check(UUID.test(fixture.userId), 'exact reserved account identified');
    assertActivated(); activatedProfile = profileRow(); activatedRoles = roleRows();
    const signed = await signIn(fixture.email, firstPassword);
    check(!signed.result.error && signed.result.data.session?.user.id === fixture.userId, 'new member ordinary password login');
    const reused = await edge('crew-onboarding', { action: 'complete', token: activationToken, password: password8() });
    check(reused.status === 409 && reused.body.error === 'already_active', 'consumed activation cannot reset password');
    await assertOperatorSession();
    check(same(preserved, protectedSnapshot()), 'human and operator profile bindings remain unchanged');
  });

  // These calls use ordinary bearer sessions. The service key only reads audit state
  // and temporarily adds/removes crewhead on this run's exact synthetic account.
  const crewLogin = await signIn(fixture.email, firstPassword);
  check(!crewLogin.result.error && crewLogin.result.data.user?.id === fixture.userId, 'genuine new member session for RLS checks');
  const crewClient = crewLogin.client;
  const insertedProfiles = [];
  const accessPayload = (label, linked = false) => {
    guardFixture();
    const payload = { id: randomUUID(), email: `${run}-${label}@crewflow-onboarding.test`,
      first_name: 'Completion', last_name: 'RLS', billing_city: 'Brno', hourly_rate: 250,
      note: `${run} profile-insert-access`, ...(linked ? { user_id: fixture.userId } : {}) };
    synthetic(payload.email);
    check(payload.id !== HUMAN_PROFILE_ID && payload.email.startsWith(`${run}-`), 'fresh RLS fixture payload only');
    return payload;
  };
  const attemptInsert = (actor, payload) => {
    synthetic(payload.email);
    check(payload.email.startsWith(`${run}-`) && UUID.test(payload.id)
      && payload.id !== HUMAN_PROFILE_ID && (!payload.user_id || payload.user_id === fixture.userId), 'exact RLS insert fixture guard');
    return actor.from('profiles').insert(payload).select('id,user_id,email,hourly_rate').single();
  };
  const expectInsertDenied = async (actor, label, linked = false) => {
    const payload = accessPayload(label, linked);
    const result = await attemptInsert(actor, payload);
    check(result.error?.code === '42501' && result.data === null, 'unauthorized profile insert rejected specifically by RLS');
    check(sql(`select count(*) from public.profiles where id=${q(payload.id)} or email=${q(payload.email)};`) === '0', 'denied insertion leaves no profile');
    check(authRows(payload.email).length === 0, 'denied profile insert creates no Auth identity');
  };
  const expectUnlinkedInsert = async (actor, label) => {
    const payload = accessPayload(label);
    const result = await attemptInsert(actor, payload);
    if (result.error?.code === '42501') check(false, 'genuine management unlinked INSERT denied by RLS (42501)');
    check(!result.error && result.data?.id === payload.id && result.data.user_id === null
      && result.data.email === payload.email && Number(result.data.hourly_rate) === 250, 'genuine management creates only an unlinked profile');
    const stored = rows(`select user_id,first_name,last_name,billing_city,hourly_rate,note from public.profiles where id=${q(payload.id)} and email=${q(payload.email)}`);
    check(stored.length === 1 && stored[0].user_id === null && stored[0].first_name === payload.first_name
      && stored[0].last_name === payload.last_name && stored[0].billing_city === payload.billing_city
      && Number(stored[0].hourly_rate) === 250 && stored[0].note === payload.note, 'management insertion preserves intended profile data');
    check(authRows(payload.email).length === 0, 'unlinked management insert never creates an Auth account');
    insertedProfiles.push(payload.id);
  };

  await test('anonymous crew and linked identity inserts are denied by profile RLS', async () => {
    const anonymousClient = client();
    check((await anonymousClient.auth.getSession()).data.session === null, 'anonymous access test has no session');
    check(same(roleRows(), activatedRoles) && activatedRoles.length === 1 && activatedRoles[0].role === 'crew', 'crew access test has only genuine crew role');
    await expectInsertDenied(anonymousClient, 'anon-unlinked');
    await expectInsertDenied(anonymousClient, 'anon-linked', true);
    await expectInsertDenied(crewClient, 'crew-unlinked');
    await expectInsertDenied(crewClient, 'crew-linked', true);
    await expectInsertDenied(operatorClient, 'coo-linked', true);
    const originalRole = activatedRoles[0];
    check(UUID.test(originalRole.id) && originalRole.user_id === fixture.userId && originalRole.role === 'crew', 'exact synthetic crew role snapshot before no-role case');
    try {
      guardFixture();
      const removed = await service.from('user_roles').delete()
        .eq('id', originalRole.id).eq('user_id', fixture.userId).eq('role', 'crew').select('id');
      check(!removed.error && removed.data?.length === 1 && removed.data[0].id === originalRole.id
        && roleRows().length === 0, 'only exact synthetic crew role temporarily removed');
      const identity = await crewClient.auth.getUser();
      check(!identity.error && identity.data.user?.id === fixture.userId, 'no-role denial uses genuine authenticated member');
      await expectInsertDenied(crewClient, 'no-role-unlinked');
      await expectInsertDenied(crewClient, 'no-role-linked', true);
    } finally {
      guardFixture();
      if (!roleRows().some((row) => row.id === originalRole.id)) {
        const restored = await service.from('user_roles').insert(originalRole);
        check(!restored.error, 'exact original synthetic crew role restored');
      }
      check(same(roleRows(), activatedRoles) && same(profileRow(), activatedProfile)
        && profileRow().user_id === fixture.userId, 'no-role finally restores exact role row and preserves profile binding');
    }
    check(same(preserved, protectedSnapshot()), 'denied inserts preserve protected identities');
  });

  await test('genuine COO can insert an unlinked member through the Data API', async () => {
    const roles = rows(`select role from public.user_roles where user_id=${q(operator.userId)} order by role`);
    check(roles.some((row) => row.role === 'coo'), 'existing operator has actual database COO role');
    await expectUnlinkedInsert(operatorClient, 'coo-unlinked');
    await assertOperatorSession();
  });

  await test('genuine crewhead can insert unlinked profiles while linked identities remain denied', async () => {
    guardFixture();
    check(same(roleRows(), activatedRoles), 'only fresh fixture roles may change temporarily');
    const added = await service.from('user_roles').insert({ user_id: fixture.userId, role: 'crewhead' })
      .select('id,user_id,role').single();
    check(!added.error && UUID.test(added.data?.id) && added.data.user_id === fixture.userId
      && added.data.role === 'crewhead', 'temporary crewhead role belongs only to exact synthetic account');
    try {
      const roles = roleRows();
      check(roles.some((row) => row.role === 'crewhead') && !roles.some((row) => row.role === 'coo'), 'genuine crewhead database role without COO');
      await expectInsertDenied(crewClient, 'crewhead-linked', true);
      await expectUnlinkedInsert(crewClient, 'crewhead-unlinked');
    } finally {
      guardFixture();
      const removed = await service.from('user_roles').delete()
        .eq('id', added.data.id).eq('user_id', fixture.userId).eq('role', 'crewhead').select('id');
      check(!removed.error && removed.data?.length === 1 && removed.data[0].id === added.data.id
        && same(roleRows(), activatedRoles) && same(profileRow(), activatedProfile)
        && profileRow().user_id === fixture.userId, 'temporary synthetic crewhead role removed exactly with binding preserved');
    }
    check(insertedProfiles.length === 2 && same(preserved, protectedSnapshot()), 'only two permitted unlinked fixtures created and protected identities preserved');
    await assertOperatorSession();
  });

  if (profileInsertOnly) {
    assertActivated();
    check(same(profileRow(), activatedProfile) && same(roleRows(), activatedRoles), 'scoped RLS checks preserve member profile rate and crew role');
    console.log(`PASS ${passed} local profile insert access integration groups`);
    return;
  }

  let recoveryHash;
  await test('anonymous recovery gives the same generic confirmation without creating unknown accounts', async () => {
    guardFixture(); synthetic(unknownEmail);
    const beforeMail = await mailbox(fixture.email);
    check(beforeMail.messages_count === 1 && (await mailbox(unknownEmail)).messages_count === 0, 'recovery starts with exact fixture mailbox state');
    const knownClient = client(); const unknownClient = client();
    check((await knownClient.auth.getSession()).data.session === null
      && (await unknownClient.auth.getSession()).data.session === null, 'recovery requests use isolated anonymous clients');
    const known = await knownClient.auth.resetPasswordForEmail(fixture.email);
    const unknown = await unknownClient.auth.resetPasswordForEmail(unknownEmail);
    check(!known.error && !unknown.error && same(known.data, {}) && same(known.data, unknown.data), 'known and unknown SDK recovery confirmations are identical');
    const captured = await waitForMail(fixture.email, 2);
    const fresh = captured.messages.filter((entry) => !beforeMail.messages.some((old) => old.ID === entry.ID));
    check(fresh.length === 1, 'one new captured recovery message');
    const mail = await message(fresh[0].ID, captured);
    const native = [...mail.HTML.matchAll(/href="(nodu-test:\/\/reset-password#token_hash=([A-Za-z0-9_-]{20,512}))"/g)];
    const web = [...mail.HTML.matchAll(/href="(http:\/\/127\.0\.0\.1:8096\/reset-password#token_hash=([A-Za-z0-9_-]{20,512}))"/g)];
    check(native.length === 1 && web.length === 1 && native[0][2] === web[0][2]
      && !mail.HTML.includes('/auth/v1/verify') && !mail.HTML.includes('nodu://reset-password'), 'custom recovery template has only fixed local and native test destinations');
    recoveryHash = native[0][2]; check(RECOVERY_TOKEN.test(recoveryHash), 'private recovery hash shape');
    check(authRows(unknownEmail).length === 0 && (await mailbox(unknownEmail)).messages_count === 0
      && sql(`select count(*) from public.profiles where email=${q(unknownEmail)};`) === '0', 'unknown recovery creates no user profile or email');
    assertActivated(); await assertOperatorSession();
  });

  let secondPassword = password8();
  while (secondPassword === firstPassword) secondPassword = password8();
  await test('isolated recovery verifies exact identity and preserves its session for password retry', async () => {
    guardFixture(); check(RECOVERY_TOKEN.test(recoveryHash), 'fixture recovery hash guard');
    const recoveryClient = client();
    const verified = await recoveryClient.auth.verifyOtp({ token_hash: recoveryHash, type: 'recovery' });
    check(!verified.error && verified.data.session?.user.id === fixture.userId
      && verified.data.user?.email === fixture.email, 'recovery hash verifies only exact member identity');
    await assertOperatorSession();
    const rejected = await recoveryClient.auth.updateUser({ password: password7() });
    check(rejected.error?.code === 'weak_password' && [400, 422].includes(rejected.error.status), 'Auth minimum rejects seven character recovery password');
    const retained = await recoveryClient.auth.getSession();
    check(!retained.error && retained.data.session?.user.id === fixture.userId, 'verified recovery session survives weak password retry');
    const unchanged = await signIn(fixture.email, firstPassword);
    check(!unchanged.result.error && unchanged.result.data.user?.id === fixture.userId, 'rejected update preserves original password');
    check(secondPassword.length === 8 && Buffer.byteLength(secondPassword, 'utf8') === 8, 'new exactly eight character password generated privately');
    const changed = await recoveryClient.auth.updateUser({ password: secondPassword });
    check(!changed.error && changed.data.user?.id === fixture.userId, 'same verified recovery client accepts exactly eight characters');
    const oldLogin = await signIn(fixture.email, firstPassword);
    check(Boolean(oldLogin.result.error) && oldLogin.result.data.session === null, 'old member password no longer signs in');
    const newLogin = await signIn(fixture.email, secondPassword);
    check(!newLogin.result.error && newLogin.result.data.session?.user.id === fixture.userId, 'new member password signs in normally');
    assertActivated();
    check(same(profileRow(), activatedProfile) && same(roleRows(), activatedRoles), 'recovery preserves exact profile roles and rate');
    await assertOperatorSession();
  });

  await test('used and invalid recovery hashes safely reject without another account', async () => {
    for (const token of [recoveryHash, randomBytes(32).toString('hex')]) {
      check(RECOVERY_TOKEN.test(token), 'bounded recovery capability guard');
      const isolated = client();
      const result = await isolated.auth.verifyOtp({ token_hash: token, type: 'recovery' });
      check(Boolean(result.error) && [400, 401, 403, 422].includes(result.error.status)
        && result.data.session === null && result.data.user === null, 'used or invalid recovery hash rejected safely');
      check((await isolated.auth.getSession()).data.session === null, 'rejected recovery never authenticates isolated client');
    }
    assertActivated(); await assertOperatorSession();
  });

  await test('only the new fixture recovery timestamp can be expired safely', async () => {
    guardFixture(); check(UUID.test(fixture.userId), 'fixture expiry mutation exact account guard');
    const prior = rows(`select recovery_sent_at from auth.users where id=${q(fixture.userId)} and email=${q(fixture.email)}`);
    check(prior.length === 1, 'exact fixture recovery timestamp saved privately');
    const generated = await service.auth.admin.generateLink({ type: 'recovery', email: fixture.email });
    check(!generated.error && generated.data.user?.id === fixture.userId
      && generated.data.user.email === fixture.email && generated.data.properties?.verification_type === 'recovery'
      && RECOVERY_TOKEN.test(generated.data.properties.hashed_token), 'bounded recovery capability for existing exact fixture only');
    const exactFixture = `id=${q(fixture.userId)} and email=${q(fixture.email)}
      and email like ${q(`${run}-%@crewflow-onboarding.test`)}
      and id<>${q(HUMAN_USER_ID)} and id<>${q(operator.userId)}`;
    try {
      // This changes one synthetic account timestamp, never Auth settings or the global clock.
      const expired = sql(`with changed as (
        update auth.users set recovery_sent_at=clock_timestamp()-interval '8 days'
        where ${exactFixture} returning id
      ) select count(*) from changed;`);
      check(expired === '1', 'exactly one new synthetic recovery timestamp backdated');
      const isolated = client();
      const result = await isolated.auth.verifyOtp({ token_hash: generated.data.properties.hashed_token, type: 'recovery' });
      check(Boolean(result.error) && [400, 401, 403, 422].includes(result.error.status)
        && result.data.session === null, 'expired recovery hash rejected');
      check((await isolated.auth.getSession()).data.session === null, 'expired recovery never authenticates');
    } finally {
      // Restoring the timestamp must not revive the disposable expiry-test capability.
      const savedTimestamp = prior[0].recovery_sent_at === null ? 'null' : `${q(prior[0].recovery_sent_at)}::timestamptz`;
      const restored = sql(`with changed as (
        update auth.users set recovery_sent_at=${savedTimestamp},recovery_token=''
        where ${exactFixture} returning id
      ) select count(*) from changed;`);
      check(restored === '1', 'exactly one fixture recovery timestamp restored and expiry token invalidated');
    }
    const restored = rows(`select recovery_sent_at from auth.users where ${exactFixture}`);
    check(same(prior, restored), 'fixture original recovery timestamp restored');
    const invalidated = await client().auth.verifyOtp({ token_hash: generated.data.properties.hashed_token, type: 'recovery' });
    check(Boolean(invalidated.error) && invalidated.data.session === null, 'restoring fixture timestamp cannot revive expiry-test hash');
    const signed = await signIn(fixture.email, secondPassword);
    check(!signed.result.error && signed.result.data.user?.id === fixture.userId, 'expiry test preserves new password');
    check((await mailbox(fixture.email)).messages_count === 2, 'bounded generated expiry link never sends another email');
  });

  await test('final member identity rate roles and original human binding remain exact', async () => {
    assertActivated();
    check(same(profileRow(), activatedProfile) && same(roleRows(), activatedRoles), 'final member profile roles and rate unchanged');
    check(authRows(unknownEmail).length === 0 && (await mailbox(unknownEmail)).messages_count === 0, 'unknown recovery never creates an account or mail');
    check(same(preserved, protectedSnapshot()), 'original human and existing operator profiles and roles unchanged');
    await assertOperatorSession();
  });
  console.log(`PASS ${passed} local member completion integration groups`);
}

main().catch(() => {
  // Assertion labels are source-controlled constants. No provider, SQL, fetch or filesystem error is printed.
  console.error(`FAIL ${current}; ${failedAssertion || 'private request details suppressed'}`);
  process.exitCode = 1;
});
