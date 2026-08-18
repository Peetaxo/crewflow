export const createStableDraftUuid = (): string => {
  const uuid = globalThis.crypto?.randomUUID();
  if (!uuid) throw new Error('Stable draft UUID is unavailable');
  return uuid;
};
