import test from 'node:test';
import assert from 'node:assert/strict';
import { assertPilotTarget, renderActivationEmail } from './onboarding-pilot-invite-lib.mjs';

const target = {
  directory: '/tmp/.crewflow-onboarding-pilot-20261020',
  apiUrl: 'http://127.0.0.1:55431',
  mailpitUrl: 'http://127.0.0.1:55434',
  email: 'mobilni-test@crewflow-onboarding.test',
};

test('accepts only the dedicated local pilot and synthetic recipients', () => {
  assert.doesNotThrow(() => assertPilotTarget(target));
});

for (const [name, replacement] of [
  ['a remote API', { apiUrl: 'https://example.supabase.co' }],
  ['the other local demo', { apiUrl: 'http://127.0.0.1:55321' }],
  ['a remote mailbox', { mailpitUrl: 'https://mail.example.com' }],
  ['a real recipient', { email: 'person@example.com' }],
  ['a lookalike recipient domain', { email: 'person@crewflow-onboarding.test.example.com' }],
  ['a recipient containing a header injection', { email: 'test@crewflow-onboarding.test\r\nBcc: person@example.com' }],
  ['an unrelated working directory', { directory: '/tmp/.crewflow-demo-20261012' }],
  ['missing API configuration', { apiUrl: '' }],
]) {
  test(`rejects ${name} before creating an invitation`, () => {
    assert.throws(() => assertPilotTarget({ ...target, ...replacement }));
  });
}

test('renders the 48-hour invitation with escaped identity and both local activation paths', () => {
  const token = 'a'.repeat(64);
  const activationUrl = `http://127.0.0.1:8096/activate#token=${token}`;
  const nativeUrl = `nodu://activate#token=${token}`;
  const message = renderActivationEmail({ firstName: '<Test & Crew>', activationUrl, nativeUrl });
  assert.match(message.subject, /nodu/);
  assert.match(message.html, /48 hodin/);
  assert.match(message.text, /48 hodin/);
  assert.match(message.html, /&lt;Test &amp; Crew&gt;/);
  assert.ok(!message.html.includes('<Test & Crew>'));
  assert.ok(message.html.includes(`href="${activationUrl}"`));
  assert.ok(message.html.includes(`href="${nativeUrl}"`));
  assert.ok(message.text.includes(activationUrl));
  assert.ok(message.text.includes(nativeUrl));
  assert.ok(!message.html.includes('password='));
});

test('rejects an untrusted activation destination while rendering', () => {
  assert.throws(() => renderActivationEmail({
    firstName: 'Test', activationUrl: 'javascript:alert(1)', nativeUrl: 'nodu://activate',
  }));
});
