// This device-local display preference never grants application access or changes a profile.
const authUuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const preferenceKey = (userId: string) => `nodu:crew-getting-started:v1:${userId}`;

export const isGettingStartedUserId = (value: unknown): value is string => typeof value === 'string' && authUuid.test(value);

export const hasSeenCrewGettingStarted = (userId: string): boolean => {
  if (!isGettingStartedUserId(userId) || typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(preferenceKey(userId)) === 'dismissed';
  } catch {
    // Unavailable storage must not prevent entry into the application.
    return true;
  }
};

export const markCrewGettingStartedSeen = (userId: string): void => {
  if (!isGettingStartedUserId(userId) || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(preferenceKey(userId), 'dismissed');
  } catch {
    // Dismissal still works when a browser blocks storage or its quota is full.
  }
};
