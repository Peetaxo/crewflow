/** Shared GoTrue password bounds: Unicode codepoints, then bcrypt UTF-8 bytes. */
export const isValidOnboardingPassword = (password: string): boolean => [...password].length >= 8
  && new TextEncoder().encode(password).length <= 72;
