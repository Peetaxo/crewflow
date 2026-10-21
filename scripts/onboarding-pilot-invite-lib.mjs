import path from 'node:path';

const syntheticEmail = /^[a-z0-9][a-z0-9._+-]*@crewflow-onboarding\.test$/i;

export function assertPilotTarget({ directory, apiUrl, mailpitUrl, email }) {
  if (!directory || !/^\.crewflow-onboarding-pilot-\d{8}$/.test(path.basename(path.resolve(directory)))) {
    throw new Error('Use a dedicated onboarding pilot directory.');
  }
  if (apiUrl !== 'http://127.0.0.1:55431' || mailpitUrl !== 'http://127.0.0.1:55434') {
    throw new Error('Only the dedicated local onboarding services are supported.');
  }
  if (typeof email !== 'string' || !syntheticEmail.test(email)) {
    throw new Error('Only synthetic onboarding test recipients are supported.');
  }
}

export { renderActivationEmail } from '../supabase/functions/_shared/activation-email.mjs';
