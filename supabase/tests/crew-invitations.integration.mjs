/** Dedicated local pilot only. Output is intentionally limited to safe test labels and fixture IDs. */
import { createClient } from '@supabase/supabase-js';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, chmodSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { createInvitationsHandler } from '../functions/crew-invitations/handler.ts';

const directory = process.env.CREW_INVITATIONS_TEST_DIRECTORY ?? '/Users/peetax/Projekty/.crewflow-onboarding-pilot-20261020';
if (realpathSync(directory) !== '/Users/peetax/Projekty/.crewflow-onboarding-pilot-20261020') throw new Error('Only the exact disposable pilot directory is allowed');
const credentials = JSON.parse(readFileSync(path.join(directory, 'local-credentials.json'), 'utf8'));
const apiUrl = process.env.CREW_INVITATIONS_TEST_URL ?? credentials.API_URL;
if (apiUrl !== 'http://127.0.0.1:55431' || credentials.MAILPIT_URL !== 'http://127.0.0.1:55434') throw new Error('Only the dedicated API and capture mailbox are allowed');
const dbContainer = 'supabase_db_crewflow-onboarding-pilot-20261020';
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(apiUrl, credentials.SERVICE_ROLE_KEY, options);
const anon = createClient(apiUrl, credentials.ANON_KEY, options);
const run = randomBytes(6).toString('hex');
const email = (label) => `${run}-${label}@crewflow-onboarding.test`;
const synthetic = (value) => /^[a-z0-9][a-z0-9._+-]*@crewflow-onboarding\.test$/.test(value);
const q = (value) => `'${String(value).replaceAll("'", "''")}'`;
const hash = (token) => createHash('sha256').update(token).digest('hex');
let failedAssertion = '';
const check = (condition, label) => { if (!condition) { failedAssertion = label; throw new Error('assertion'); } };
const sql = (statement) => execFileSync('docker', ['exec', '-i', dbContainer, 'sh', '-c', 'PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin -d postgres -At -v ON_ERROR_STOP=1'], { input: statement, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const rows = (statement) => JSON.parse(sql(`select coalesce(json_agg(t),'[]'::json) from (${statement}) t;`));
async function rpc(name, args) { const result = await service.rpc(name, args); check(!result.error && result.data, 'RPC transport'); return result.data; }
async function user(label) {
  const recipient = email(label); check(synthetic(recipient), 'synthetic Auth fixture');
  const password = randomBytes(24).toString('hex');
  const result = await service.auth.admin.createUser({ email: recipient, password, email_confirm: true });
  check(!result.error && result.data.user, 'synthetic Auth fixture created');
  return { email: recipient, password, userId: result.data.user.id };
}
async function signIn(fixture) {
  check(synthetic(fixture.email), 'synthetic sign-in only');
  const client = createClient(apiUrl, credentials.ANON_KEY, options);
  const result = await client.auth.signInWithPassword({ email: fixture.email, password: fixture.password });
  check(!result.error && result.data.session, 'ordinary sign-in');
  return { client, token: result.data.session.access_token };
}
function profile(label, rate) {
  const id = randomUUID(); const recipient = email(label); check(synthetic(recipient), 'synthetic profile');
  const rateColumn = rate === undefined ? '' : ',hourly_rate'; const rateValue = rate === undefined ? '' : `,${Number(rate)}`;
  sql(`insert into public.profiles(id,email,first_name,last_name,note${rateColumn}) values(${q(id)},${q(recipient)},'Manual','Invitation','preserve-history'${rateValue});`);
  return { profileId: id, email: recipient };
}
const input = (p, extra = {}) => ({ action: 'invite', profileId: p.profileId, expectedEmail: p.email, requestId: randomUUID(), expectedInvitationId: null, replaceExisting: false, ...extra });
const prepare = (body) => rpc('crew_onboarding_manual_prepare', { p_profile_id: body.profileId, p_expected_email: body.expectedEmail, p_request_id: body.requestId, p_expected_invitation_id: body.expectedInvitationId, p_replace_existing: body.replaceExisting });
const status = (id) => rpc('crew_onboarding_manual_status', { p_profile_id: id });
const capture = (body, token) => rpc('crew_onboarding_manual_capture', { p_profile_id: body.profileId, p_request_id: body.requestId, p_token_hash: hash(token) });
const cancel = (body, token) => rpc('crew_onboarding_manual_cancel', { p_profile_id: body.profileId, p_request_id: body.requestId, p_token_hash: hash(token) });
const inviteRow = (id) => rows(`select * from crew_onboarding_private.invitations where id=${q(id)}`)[0];
const safeStatus = (result) => {
  check(JSON.stringify(Object.keys(result).sort()) === JSON.stringify(['profileId','email','state','invitationId','expiresAt'].sort()), 'exact safe status fields');
  check(synthetic(result.email) && !JSON.stringify(result).includes('token'), 'safe synthetic status');
};
async function mailboxCount(recipient) {
  check(synthetic(recipient), 'synthetic mailbox lookup');
  const response = await fetch(`${credentials.MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${recipient}`)}`, { redirect: 'error' });
  check(response.ok, 'mailbox read'); const body = await response.json(); return body.messages_count;
}
async function call(body, token, headers = {}) {
  const response = await fetch(`${apiUrl}/functions/v1/crew-invitations`, { method: 'POST', headers: { apikey: credentials.ANON_KEY, 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body), redirect: 'error' });
  return { status: response.status, body: await response.json() };
}
let current = 'startup'; let passed = 0;
async function test(label, fn) { current = label; await fn(); passed++; console.log(`PASS ${label}`); }
try {
  if (process.argv.includes('--setup')) {
    const operatorPath = path.join(directory, 'manual-invitation-operator.private.json');
    let operator;
    try { operator = JSON.parse(readFileSync(operatorPath, 'utf8')); } catch { operator = await user('manual-operator'); }
    check(synthetic(operator.email) && operator.userId !== '872ee197-4ae0-4da9-a671-615511bace59', 'separate synthetic operator');
    const identity = await service.auth.admin.getUserById(operator.userId);
    check(!identity.error && identity.data.user?.email === operator.email, 'operator fixture identity matches');
    sql(`delete from public.user_roles where user_id=${q(operator.userId)}; insert into public.user_roles(user_id,role) values(${q(operator.userId)},'coo');`);
    const target = operator.target ?? profile('ui-target');
    writeFileSync(operatorPath, JSON.stringify({ ...operator, target }, null, 2), { mode: 0o600 }); chmodSync(operatorPath, 0o600);
    await signIn(operator);
    console.log(JSON.stringify({ operatorId: operator.userId, operatorEmail: operator.email, target, privateFixture: operatorPath }));
  } else if (process.argv.includes('--expect-disabled')) {
    await test('HTTP feature disabled with no privileged dependency use', async () => {
      const before = sql('select count(*) from auth.users;');
      check((await call({ action: 'status', profileId: randomUUID() })).body.error === 'disabled', 'disabled envelope');
      check(sql('select count(*) from auth.users;') === before, 'no Auth mutation');
    });
  } else {
    // This group intentionally fails before the new migration is installed.
    await test('manual SQL helpers exist and enforce private grants', async () => {
      sql(readFileSync(new URL('./crew-invitations-access.sql', import.meta.url), 'utf8'));
    });
    const operator = JSON.parse(readFileSync(path.join(directory, 'manual-invitation-operator.private.json'), 'utf8'));
    check(synthetic(operator.email) && operator.userId !== '872ee197-4ae0-4da9-a671-615511bace59', 'separate synthetic operator');
    const identity = await service.auth.admin.getUserById(operator.userId);
    check(!identity.error && identity.data.user?.email === operator.email, 'operator fixture identity matches');
    const signed = await signIn(operator);
    await test('anonymous invalid nonallowlisted and self-promotion attempts cannot manage invitations', async () => {
      const p = profile('denied'); const body = input(p);
      check((await call(body)).body.error === 'unauthorized', 'no bearer');
      check((await call(body, 'invalid')).body.error === 'unauthorized', 'invalid bearer');
      check((await call(body, credentials.ANON_KEY)).body.error === 'unauthorized', 'anon key not user');
      const outsider = await user('outsider'); const outsiderSession = await signIn(outsider);
      check((await call(body, outsiderSession.token)).body.error === 'forbidden', 'nonallowlisted');
      const metadata = await outsiderSession.client.auth.updateUser({ data: { role: 'coo' } }); check(!metadata.error, 'untrusted metadata updated');
      check((await call(body, outsiderSession.token)).body.error === 'forbidden', 'metadata cannot authorize');
      const promoted = await outsiderSession.client.rpc('set_current_user_role', { p_role: 'coo' });
      check(promoted.error?.code === '42501', 'self-promotion is denied by the server');
      check(rows(`select role from public.user_roles where user_id=${q(outsider.userId)}`)[0]?.role === 'crew', 'denied self-promotion preserves crew role');
      // Exercise the separate allowlist boundary using only privileged fixture provisioning.
      sql(`update public.user_roles set role='coo' where user_id=${q(outsider.userId)};`);
      try { check((await call(body, outsiderSession.token)).body.error === 'forbidden', 'administratively provisioned COO not allowlisted'); }
      finally { sql(`update public.user_roles set role='crew' where user_id=${q(outsider.userId)};`); }
      sql(`delete from public.user_roles where user_id=${q(operator.userId)}; insert into public.user_roles(user_id,role) values(${q(operator.userId)},'crew');`);
      try { check((await call(body, signed.token)).body.error === 'forbidden', 'allowlisted crew denied'); }
      finally { sql(`delete from public.user_roles where user_id=${q(operator.userId)}; insert into public.user_roles(user_id,role) values(${q(operator.userId)},'coo');`); }
      check((await status(p.profileId)).state === 'not_invited', 'denied never prepares');
    });
    await test('HTTP validates origin exact JSON size UUID and synthetic recipient', async () => {
      const p = profile('invalid'); const body = input(p);
      for (const [request, headers, error] of [
        [body, { origin: 'https://evil.test' }, 'forbidden'], ['{', {}, 'invalid_request'],
        [{ ...body, profileId: 'bad' }, {}, 'invalid_request'], [{ ...body, extra: true }, {}, 'invalid_request'],
        [' '.repeat(5000), {}, 'invalid_request'], [{ ...body, expectedEmail: 'real@example.com' }, {}, 'test_only'],
      ]) check((await call(request, signed.token, headers)).body.error === error, 'safe input error');
      check((await call({ action: 'status', profileId: randomUUID() }, signed.token)).body.error === 'profile_unavailable', 'missing profile');
      const missing = profile('missing'); sql(`update public.profiles set email=null where id=${q(missing.profileId)};`);
      check((await call({ action: 'status', profileId: missing.profileId }, signed.token)).body.error === 'missing_email', 'missing email');
      const real = profile('real'); sql(`update public.profiles set email='real@example.com' where id=${q(real.profileId)};`);
      check((await call({ action: 'status', profileId: real.profileId }, signed.token)).body.error === 'test_only', 'stored real email refused');
    });
    await test('ordinary Auth HTTP captures exactly one escaped 48h message without creating Auth', async () => {
      const p = profile('http-success', 375); const body = input(p);
      sql(`update public.profiles set first_name='<Ada & Crew>' where id=${q(p.profileId)};`);
      const before = rows(`select * from public.profiles where id=${q(p.profileId)}`)[0];
      const result = await call(body, signed.token, { origin: 'http://127.0.0.1:8096' });
      check(result.status === 200 && result.body.data.state === 'pending', 'HTTP capture success'); safeStatus(result.body.data);
      const i = inviteRow(result.body.data.invitationId);
      check(i.manual_request_id === body.requestId && i.mail_captured_at && i.state === 'pending', 'exact capture acknowledged');
      check(Math.abs(Date.parse(i.expires_at) - Date.parse(i.created_at) - 48*3600000)<1000, '48 hour expiry');
      check(sql(`select count(*) from auth.users where email=${q(p.email)};`) === '0', 'invite creates no Auth user');
      check(JSON.stringify(before) === JSON.stringify(rows(`select * from public.profiles where id=${q(p.profileId)}`)[0]), 'rate identity history unchanged');
      check(await mailboxCount(p.email) === 1, 'one mailbox message');
      const replay = await call(body, signed.token); check(replay.status === 200 && replay.body.data.invitationId === i.id, 'captured request replay');
      check(await mailboxCount(p.email) === 1, 'replay never sends again');
      const mail = await (await fetch(`${credentials.MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${p.email}`)}`)).json();
      const message = await (await fetch(`${credentials.MAILPIT_URL}/api/v1/message/${mail.messages[0].ID}`)).json();
      check(message.HTML.includes('&lt;Ada &amp; Crew&gt;') && message.Text.includes('48 hodin') && message.HTML.includes('nodu-test://activate#token='), 'safe complete shared email');
      const rawToken = /activate#token=([a-f0-9]{64})/.exec(message.HTML)[1];
      check(hash(rawToken) === i.token_hash && !Object.values(i).includes(rawToken), 'raw token only in mailbox');
    });
    await test('edited recipient never inherits old captured delivery and replacements keep optimistic protection', async () => {
      const p = profile('email-before'); const original = input(p);
      const first = await call(original, signed.token); check(first.status === 200 && first.body.data.state === 'pending', 'original captured invitation');
      const oldId = first.body.data.invitationId; const oldRow = inviteRow(oldId);
      const mailbox = await (await fetch(`${credentials.MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${p.email}`)}`)).json();
      const message = await (await fetch(`${credentials.MAILPIT_URL}/api/v1/message/${mailbox.messages[0].ID}`)).json();
      const oldToken = /activate#token=([a-f0-9]{64})/.exec(message.HTML)[1];
      const edited = { ...p, email: email('email-after') };
      sql(`update public.profiles set email=${q(edited.email)} where id=${q(p.profileId)};`);
      const changed = await call({ action: 'status', profileId: p.profileId }, signed.token);
      check(changed.status === 200 && changed.body.data.state === 'not_invited' && changed.body.data.email === edited.email, 'edited address is not invited');
      check(changed.body.data.invitationId === oldId && changed.body.data.expiresAt === null, 'old version retained without attributing old expiry');
      check(JSON.stringify(inviteRow(oldId)) === JSON.stringify(oldRow), 'status does not revoke or mutate old invitation');
      const preview = await fetch(`${apiUrl}/functions/v1/crew-onboarding`, { method: 'POST', headers: { apikey: credentials.ANON_KEY, 'content-type': 'application/json' }, body: JSON.stringify({ action: 'preview', token: oldToken }) });
      check(preview.status >= 400 && (await preview.json()).error === 'invalid_invitation', 'old token cannot preview changed identity');
      check((await call(input(p, { expectedInvitationId: oldId, replaceExisting: true }), signed.token)).body.error === 'invitation_changed', 'stale old email refused');
      check((await call(input(edited), signed.token)).body.error === 'invitation_changed', 'implicit new email replacement refused');
      const attempts = [input(edited, { expectedInvitationId: oldId, replaceExisting: true }), input(edited, { expectedInvitationId: oldId, replaceExisting: true })];
      const results = await Promise.all(attempts.map((body) => call(body, signed.token)));
      const winner = results.findIndex((result) => result.status === 200);
      check(winner >= 0 && results.filter((result) => result.status === 200).length === 1 && results.some((result) => result.body.error === 'invitation_changed'), 'one explicit changed-email replacement wins');
      const replacement = results[winner].body.data;
      check(replacement.state === 'pending' && replacement.email === edited.email && replacement.invitationId !== oldId, 'new recipient capture acknowledged');
      check(inviteRow(oldId).state === 'revoked', 'old recipient capability revoked');
      check(await mailboxCount(p.email) === 1 && await mailboxCount(edited.email) === 1, 'one capture per recipient');
      check((await call(attempts[winner], signed.token)).body.data.invitationId === replacement.invitationId, 'changed-email request replays safely');
      check(await mailboxCount(edited.email) === 1, 'changed-email replay never sends again');
      check((await capture(original, oldToken)).error === 'invitation_changed' && (await cancel(original, oldToken)).error === 'invitation_changed', 'old sender cannot acknowledge or cancel replacement');
    });
    await test('email edits preserve claiming and linked-account protections', async () => {
      const p = profile('claim-email-before'); const body = input(p); const prepared = await prepare(body);
      const claim = await rpc('crew_onboarding_claim', { p_token_hash: hash(prepared.token) }); check(claim.reservedUserId, 'claim reserved before edit');
      const edited = { ...p, email: email('claim-email-after') };
      sql(`update public.profiles set email=${q(edited.email)} where id=${q(p.profileId)};`);
      check((await status(p.profileId)).state === 'activation_in_progress', 'email edit never masks a claim');
      check((await prepare(input(edited, { expectedInvitationId: prepared.invitationId, replaceExisting: true }))).error === 'activation_in_progress', 'edited claiming profile cannot be replaced');
      const active = await user('active-email-before');
      const linked = rows(`select id from public.profiles where user_id=${q(active.userId)}`)[0];
      const activeEmail = email('active-email-after');
      sql(`update public.profiles set email=${q(activeEmail)} where id=${q(linked.id)};`);
      check((await status(linked.id)).state === 'active', 'email edit never masks a linked account');
      check((await prepare(input({ profileId: linked.id, email: activeEmail }))).error === 'already_active', 'edited active profile cannot be invited');
    });
    await test('new omitted default is 250 while explicit zero custom and history stay intact', async () => {
      for (const [label, rate] of [['default', undefined], ['zero', 0], ['custom', 399]]) {
        const p = profile(label, rate); const before = rows(`select * from public.profiles where id=${q(p.profileId)}`)[0];
        check(Number(before.hourly_rate) === (rate ?? 250), 'default and explicit rate');
        const body = input(p); const prepared = await prepare(body); check(prepared.token, 'prepared');
        check(JSON.stringify(before) === JSON.stringify(rows(`select * from public.profiles where id=${q(p.profileId)}`)[0]), 'all saved profile fields preserved');
        check((await cancel(body, prepared.token)).status === 'revoked', 'cleanup own preparation');
      }
    });
    await test('preparing replay cannot resend or move a request to another profile', async () => {
      const p = profile('preparing'); const body = input(p); const prepared = await prepare(body);
      check(prepared.state === 'preparing' && prepared.token, 'new preparing capability');
      check((await prepare(body)).error === 'invitation_in_progress', 'preparing replay unavailable');
      const other = profile('other-request'); check((await prepare(input(other, { requestId: body.requestId }))).error === 'invitation_changed', 'same UUID cannot target another profile');
      check((await status(other.profileId)).state === 'not_invited', 'no other invitation');
      await cancel(body, prepared.token);
      check((await prepare(body)).error === 'invitation_changed', 'revoked request cannot resurrect');
    });
    await test('stale email version and concurrent initial requests cannot revoke the winner', async () => {
      const p = profile('race'); const a = input(p); const b = input(p);
      check((await prepare({ ...a, expectedEmail: email('stale') })).error === 'invitation_changed', 'stale expected email');
      const results = await Promise.all([prepare(a), prepare(b)]); const winner = results.find((r) => r.token);
      check(results.filter((r) => r.token).length === 1 && results.some((r) => r.error === 'invitation_changed'), 'one initial request wins');
      check(inviteRow(winner.invitationId).state === 'pending', 'winner never revoked');
      const winningBody = results[0].token ? a : b;
      await capture(winningBody, winner.token);
      check((await prepare(input(p))).error === 'invitation_changed', 'stale null version refused');
      check((await prepare(input(p, { expectedInvitationId: winner.invitationId }))).error === 'invitation_changed', 'explicit replacement required');
    });
    await test('concurrent replacements have one winner and old acknowledgement cancellation cannot touch it', async () => {
      const p = profile('replace'); const original = input(p); const first = await prepare(original);
      const a = input(p, { expectedInvitationId: first.invitationId, replaceExisting: true });
      const b = input(p, { expectedInvitationId: first.invitationId, replaceExisting: true });
      const results = await Promise.all([prepare(a), prepare(b)]); const winner = results.find((r) => r.token);
      check(results.filter((r) => r.token).length === 1 && results.some((r) => r.error === 'invitation_changed'), 'one replacement wins');
      check(inviteRow(first.invitationId).state === 'revoked', 'old capability revoked');
      check((await capture(original, first.token)).error === 'invitation_changed', 'old acknowledgement rejected');
      check((await cancel(original, first.token)).error === 'invitation_changed', 'old cancellation rejected');
      check(inviteRow(winner.invitationId).state === 'pending' && !inviteRow(winner.invitationId).mail_captured_at, 'new invitation untouched');
      check((await prepare(original)).error === 'invitation_changed', 'old UUID cannot resurrect');
    });
    await test('expired preparing is recoverable only by exact explicit replacement', async () => {
      const p = profile('expired'); const body = input(p); const prepared = await prepare(body);
      sql(`update crew_onboarding_private.invitations set expires_at=clock_timestamp()-interval '1 second' where id=${q(prepared.invitationId)};`);
      check((await status(p.profileId)).state === 'expired', 'expired status');
      check((await capture(body, prepared.token)).error === 'invitation_changed', 'expired acknowledgement rejected');
      const replacement = await prepare(input(p, { expectedInvitationId: prepared.invitationId, replaceExisting: true }));
      check(replacement.token && replacement.invitationId !== prepared.invitationId, 'explicit recovery');
    });
    await test('claiming and active accounts reject re-invitation without role password or history changes', async () => {
      const p = profile('claiming'); const body = input(p); const prepared = await prepare(body);
      const claim = await rpc('crew_onboarding_claim', { p_token_hash: hash(prepared.token) }); check(claim.reservedUserId, 'claim reserved');
      check((await status(p.profileId)).state === 'activation_in_progress', 'claim status');
      check((await prepare(input(p, { expectedInvitationId: prepared.invitationId, replaceExisting: true }))).error === 'activation_in_progress', 'claim replacement denied');
      check((await cancel(body, prepared.token)).error === 'invitation_changed', 'capture failure never cancels a claim');
      const password = randomBytes(24).toString('hex');
      const activated = await service.auth.admin.createUser({ id: claim.reservedUserId, email: p.email, password, email_confirm: true }); check(!activated.error, 'existing activation semantics');
      const before = rows(`select * from public.profiles where id=${q(p.profileId)}`)[0];
      check((await status(p.profileId)).state === 'active', 'active status');
      check((await prepare(input(p))).error === 'already_active', 'active reinvite denied');
      await signIn({ email: p.email, password });
      check(JSON.stringify(before) === JSON.stringify(rows(`select * from public.profiles where id=${q(p.profileId)}`)[0]), 'active profile unchanged');
    });
    await test('real SQL capture failure transport loss and replacement during failure cancel only exact preparation', async () => {
      const dependencies = {
        enabled: true, apiUrl, mailpitUrl: credentials.MAILPIT_URL, allowedOrigins: [], allowedInviterIds: [operator.userId],
        auth: { getUser: (token) => service.auth.getUser(token), hasCooRole: async (id) => { const result = await service.from('user_roles').select('role').eq('user_id', id).eq('role','coo'); return !result.error && result.data.length === 1; } },
        store: {
          status: async (id) => { const data = await status(id); return data.error ? data : { data }; },
          prepare: async (body) => { const data = await prepare(body); return data.error ? data : { data }; },
          capture: async (id, requestId, tokenHash) => { const data = await rpc('crew_onboarding_manual_capture', { p_profile_id: id, p_request_id: requestId, p_token_hash: tokenHash }); return data.error ? data : { data }; },
          cancel: (id, requestId, tokenHash) => rpc('crew_onboarding_manual_cancel', { p_profile_id: id, p_request_id: requestId, p_token_hash: tokenHash }),
        }, mail: { send: async () => false },
      };
      for (const scenario of ['reject', 'lost-capture-response', 'newer-replacement']) {
        const p = profile(`failure-${scenario}`); let newer;
        const handler = createInvitationsHandler({ ...dependencies,
          store: { ...dependencies.store, ...(scenario === 'lost-capture-response' ? { capture: async (id, requestId, tokenHash) => { await dependencies.store.capture(id, requestId, tokenHash); throw new Error('injected lost response'); } } : {}) },
          mail: { send: async () => {
            if (scenario === 'reject') return false;
            if (scenario === 'newer-replacement') { const old = await status(p.profileId); newer = await prepare(input(p, { expectedInvitationId: old.invitationId, replaceExisting: true })); throw new Error('injected transport failure'); }
            return true;
          } },
        });
        const response = await handler(new Request(`${apiUrl}/functions/v1/crew-invitations`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${signed.token}` }, body: JSON.stringify(input(p)) }));
        check(response.status === 503 && (await response.json()).error === 'delivery_unavailable', 'safe capture failure');
        if (newer) check((await status(p.profileId)).invitationId === newer.invitationId && inviteRow(newer.invitationId).state === 'pending', 'newer preparation preserved');
        else check((await status(p.profileId)).state === 'not_invited', 'only failed capability revoked');
        check(sql(`select count(*) from auth.users where email=${q(p.email)};`) === '0', 'failure creates no Auth identity');
      }
    });
    await test('anonymous and authenticated clients cannot call any manual helper', async () => {
      const p = profile('rpc-denial');
      for (const client of [anon, signed.client]) for (const [name,args] of [
        ['crew_onboarding_manual_status',{ p_profile_id:p.profileId }],
        ['crew_onboarding_manual_prepare',{ p_profile_id:p.profileId,p_expected_email:p.email,p_request_id:randomUUID(),p_expected_invitation_id:null,p_replace_existing:false }],
        ['crew_onboarding_manual_capture',{ p_profile_id:p.profileId,p_request_id:randomUUID(),p_token_hash:'a'.repeat(64) }],
        ['crew_onboarding_manual_cancel',{ p_profile_id:p.profileId,p_request_id:randomUUID(),p_token_hash:'a'.repeat(64) }],
      ]) check(Boolean((await client.rpc(name,args)).error), 'client direct helper denied');
      check(Boolean((await anon.auth.signUp({ email: email('public-signup'), password: randomBytes(24).toString('hex') })).error), 'public signup remains disabled');
    });
    console.log(`PASS ${passed} local manual invitation integration groups`);
  }
} catch {
  console.error(`FAIL ${current}${failedAssertion ? ` (${failedAssertion})` : ''}; details suppressed to protect invitation and Auth secrets`);
  process.exitCode = 1;
}
