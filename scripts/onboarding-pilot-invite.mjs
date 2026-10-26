import { readFile, writeFile, chmod } from 'node:fs/promises';
import path from 'node:path';
import { assertPilotTarget, renderActivationEmail } from './onboarding-pilot-invite-lib.mjs';

// This deliberately supports only the disposable local pilot. No production delivery.
async function main() {
  const [directoryArgument, ...argumentsList] = process.argv.slice(2);
  if (!directoryArgument || argumentsList.length % 2 !== 0) {
    throw new Error('Usage: node scripts/onboarding-pilot-invite.mjs PILOT_DIR [--email EMAIL] [--profile-id UUID]');
  }
  const options = Object.fromEntries(Array.from({ length: argumentsList.length / 2 }, (_, index) => {
    const name = argumentsList[index * 2];
    if (!['--email', '--profile-id'].includes(name)) throw new Error('Unknown pilot option.');
    return [name, argumentsList[index * 2 + 1]];
  }));
  const directory = path.resolve(directoryArgument);
  const configuration = JSON.parse(await readFile(path.join(directory, 'local-credentials.json'), 'utf8'));
  const email = options['--email'] ?? `mobilni-${Date.now()}@crewflow-onboarding.test`;
  const mailpitUrl = configuration.MAILPIT_URL;
  assertPilotTarget({ directory, apiUrl: configuration.API_URL, mailpitUrl, email });
  const profileId = options['--profile-id'];
  if (profileId && !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(profileId)) {
    throw new Error('Invalid test profile identifier.');
  }
  const response = await fetch(`${configuration.API_URL}/rest/v1/rpc/crew_onboarding_create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: configuration.SERVICE_ROLE_KEY, Authorization: `Bearer ${configuration.SERVICE_ROLE_KEY}` },
    body: JSON.stringify({ p_email: email, p_first_name: 'Mobilní', p_last_name: 'Test', p_phone: null, p_profile_id: profileId ?? null }),
  });
  if (!response.ok) throw new Error(`Local invitation creation failed (HTTP ${response.status}).`);
  const invitation = await response.json();
  if (!invitation || !/^[a-f0-9]{64}$/.test(invitation.token) || invitation.email !== email) {
    throw new Error('Unexpected local invitation response.');
  }
  const activationUrl = `http://127.0.0.1:8096/activate#token=${invitation.token}`;
  const nativeUrl = `nodu-test://activate#token=${invitation.token}`;
  const message = renderActivationEmail({ firstName: 'Mobilní', activationUrl, nativeUrl });
  const delivery = await fetch(`${mailpitUrl}/api/v1/send`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ From: { Email: 'onboarding@nodu.test', Name: 'nodu (test)' }, To: [{ Email: email }], Subject: message.subject, HTML: message.html, Text: message.text }),
  });
  if (!delivery.ok) throw new Error(`Local email capture failed (HTTP ${delivery.status}).`);
  const receipt = await delivery.json();
  const fixturePath = path.join(directory, 'mobile-invitation.private.json');
  await writeFile(fixturePath, JSON.stringify({ ...invitation, activationUrl, nativeUrl, mailMessageId: receipt.ID ?? receipt.Id ?? receipt.id }, null, 2), { mode: 0o600 });
  await chmod(fixturePath, 0o600);
  process.stdout.write(JSON.stringify({ email, profileId: invitation.profileId, expiresAt: invitation.expiresAt, mailbox: mailpitUrl, privateFixture: fixturePath }, null, 2) + '\n');
}

main().catch((error) => {
  // Never include remote bodies, tokens, credentials, or password values in diagnostics.
  process.stderr.write(error instanceof Error && /^((Usage|Unknown|Use a dedicated|Only |Invalid test|Unexpected local|Local invitation|Local email|Unsupported))/.test(error.message)
    ? `${error.message}\n` : 'Local pilot preparation failed. Check the private configuration and local services.\n');
  process.exitCode = 1;
});
