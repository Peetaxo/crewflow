import { appDataSource } from '../../lib/app-config';

export const isLocalOnboardingPilot = (): boolean => import.meta.env.VITE_ONBOARDING_ENABLED === 'true'
  && appDataSource === 'supabase'
  && /^http:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):55431\/?$/.test(import.meta.env.VITE_SUPABASE_URL ?? '');
