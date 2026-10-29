// Complement the rollback SQL regression with real local Auth and PostgREST sessions.
// Usage: node supabase/tests/profile-sensitive-fields.http.mjs PILOT_DIRECTORY
// Uses only fresh synthetic accounts; never emits credentials, passwords, or tokens.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const directory = path.resolve(process.argv[2] ?? '.');
assert.match(path.basename(directory), /^\.crewflow-onboarding-pilot-\d{8}$/);
const configuration = JSON.parse(await readFile(path.join(directory, 'local-credentials.json'), 'utf8'));
assert.equal(configuration.API_URL, 'http://127.0.0.1:55431', 'Only the existing local pilot is supported');
assert.ok(configuration.ANON_KEY && configuration.SERVICE_ROLE_KEY, 'Local keys are required');
const service = configuration.SERVICE_ROLE_KEY;
const createdUsers = [];
const createdProfiles = [];

async function request(endpoint, { token = service, method = 'GET', body } = {}) {
  const response = await fetch(`${configuration.API_URL}${endpoint}`, {
    method,
    redirect: 'error',
    headers: {
      apikey: configuration.ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // Never let a parse diagnostic expose a private response body.
    throw new Error('Local API returned an invalid JSON response');
  }
  return { status: response.status, data };
}

async function snapshot() {
  const state = {};
  for (const table of ['profiles', 'user_roles', 'timelogs', 'timelog_days']) {
    const result = await request(`/rest/v1/${table}?select=*&order=id`);
    assert.equal(result.status, 200, `Could not snapshot ${table}`);
    assert.ok(Array.isArray(result.data), `Invalid snapshot for ${table}`);
    // Fail closed if PostgREST may have truncated the comparison at its default cap.
    assert.ok(result.data.length < 1000, `Snapshot cap reached for ${table}; add pagination before running`);
    state[table] = JSON.stringify(result.data);
  }
  return state;
}

async function account(role = 'crew') {
  const id = randomUUID();
  const email = `${id}@crewflow-onboarding.test`;
  const password = randomBytes(32).toString('base64url');
  // Record the chosen UUID before the request so uncertain responses still get cleanup.
  createdUsers.push(id);
  const created = await request('/auth/v1/admin/users', {
    method: 'POST', body: { id, email, password, email_confirm: true, user_metadata: { role: 'coo' } },
  });
  assert.equal(created.status, 200, 'Synthetic Auth account creation failed');
  assert.equal(created.data.id, id, 'Auth did not retain the synthetic UUID');
  const profile = await request(`/rest/v1/profiles?user_id=eq.${id}&select=*`);
  assert.equal(profile.status, 200, 'Synthetic profile lookup failed');
  assert.equal(profile.data.length, 1, 'Auth must create exactly one synthetic profile');
  const profileId = profile.data[0].id;
  createdProfiles.push(profileId);
  const seeded = await request(`/rest/v1/profiles?id=eq.${profileId}`, { method: 'PATCH', body: { hourly_rate: 425 } });
  assert.equal(seeded.status, 200, 'Service could not initialize the synthetic rate');
  if (role !== 'crew') {
    const grant = await request('/rest/v1/user_roles', { method: 'POST', body: { user_id: id, role } });
    assert.equal(grant.status, 201, 'Could not create the synthetic management role');
  }
  const login = await request('/auth/v1/token?grant_type=password', {
    token: configuration.ANON_KEY, method: 'POST', body: { email, password },
  });
  assert.equal(login.status, 200, 'Synthetic password login failed');
  assert.ok(login.data.access_token, 'Auth did not issue a signed session');
  return { id, profileId, token: login.data.access_token };
}

async function patch(actor, profileId, body) {
  return request(`/rest/v1/profiles?id=eq.${profileId}`, { token: actor.token, method: 'PATCH', body });
}

async function denied(actor, body) {
  const result = await patch(actor, actor.profileId, body);
  assert.equal(result.status, 403, 'Sensitive client update must return HTTP 403');
  assert.equal(result.data.code, '42501', 'Sensitive client update must fail permission checking');
}

const baseline = await snapshot();
let failure;
try {
  const crew = await account();
  const foreign = await account();
  const personal = await patch(crew, crew.profileId, {
    phone: '+420123456789', email: `${crew.id}-contact@crewflow-onboarding.test`,
    bank_account: '123/0100', first_name: 'Personal', hourly_rate: 425, id: crew.profileId, user_id: crew.id,
  });
  assert.equal(personal.status, 200, 'Crew personal fields must remain editable');
  assert.equal(personal.data.length, 1, 'Crew must update exactly its own profile');
  assert.equal(personal.data[0].hourly_rate, 425, 'Personal updates must preserve the rate');
  for (const body of [
    { hourly_rate: 999 }, { hourly_rate: null }, { id: randomUUID() },
    { user_id: null }, { user_id: randomUUID() }, { phone: 'must-rollback', hourly_rate: 999 },
  ]) await denied(crew, body);
  const unchanged = await request(`/rest/v1/profiles?id=eq.${crew.profileId}&select=*`);
  assert.equal(unchanged.status, 200);
  assert.equal(unchanged.data[0].phone, '+420123456789', 'Denied mixed writes must be atomic');
  assert.equal(unchanged.data[0].hourly_rate, 425);
  assert.equal(unchanged.data[0].user_id, crew.id);
  const foreignWrite = await patch(crew, foreign.profileId, { phone: 'foreign-write', hourly_rate: 999 });
  assert.equal(foreignWrite.status, 200, 'Foreign rows should remain filtered by RLS');
  assert.deepEqual(foreignWrite.data, [], 'Crew must not update a foreign profile');

  for (const role of ['crewhead', 'coo']) {
    const manager = await account(role);
    for (const profileId of [crew.profileId, manager.profileId]) {
      const changed = await patch(manager, profileId, { hourly_rate: 650 });
      assert.equal(changed.status, 200, `${role} must retain rate management`);
      assert.equal(changed.data.length, 1);
      assert.equal(changed.data[0].hourly_rate, 650);
    }
    await denied(manager, { id: randomUUID() });
    await denied(manager, { user_id: null });
  }
} catch (error) {
  failure = error;
} finally {
  const cleanupFailures = [];
  for (const id of createdUsers.reverse()) {
    try {
      const result = await request(`/auth/v1/admin/users/${id}`, { method: 'DELETE' });
      assert.ok([200, 404].includes(result.status));
    } catch { cleanupFailures.push('synthetic Auth account'); }
  }
  for (const id of createdProfiles) {
    try {
      const result = await request(`/rest/v1/profiles?id=eq.${id}`, { method: 'DELETE' });
      assert.ok([200, 204].includes(result.status));
    } catch { cleanupFailures.push('synthetic profile'); }
  }
  assert.equal(cleanupFailures.length, 0, 'Synthetic cleanup failed');
  const restored = await snapshot();
  // Report only equality, never the private contents of the snapshots.
  for (const table of Object.keys(baseline)) {
    assert.ok(baseline[table] === restored[table], `Unrelated ${table} changed or a synthetic fixture remains`);
  }
}
if (failure) {
  // API bodies and Auth results must never appear in diagnostics.
  process.stderr.write(`Local HTTP profile regression failed: ${failure instanceof assert.AssertionError ? failure.message.split('\n')[0] : 'request failed'}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('PASS: real local signed crew/CH/COO sessions; personal edits; sensitive/foreign denials; cleanup and unchanged profiles, roles, and history.\n');
}
