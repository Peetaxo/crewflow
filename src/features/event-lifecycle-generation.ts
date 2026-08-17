let lifecycleSnapshotGeneration = 0;
const lifecycleMutationTails = new Map<string, Promise<void>>();

export const getLifecycleSnapshotGeneration = (): number => lifecycleSnapshotGeneration;

export const advanceLifecycleSnapshotGeneration = (): number => {
  lifecycleSnapshotGeneration += 1;
  return lifecycleSnapshotGeneration;
};

export const runLifecycleDataMutation = async <T>(
  requestedKeys: string[],
  mutation: () => Promise<T>,
): Promise<T> => {
  const keys = [...new Set(['lifecycle:global', ...requestedKeys])].sort();
  const predecessors = keys.map((key) => lifecycleMutationTails.get(key) ?? Promise.resolve());
  let release!: () => void;
  const released = new Promise<void>((resolve) => { release = resolve; });
  const reservation = Promise.all(predecessors).then(() => released);
  keys.forEach((key) => lifecycleMutationTails.set(key, reservation));

  await Promise.all(predecessors);
  try {
    return await mutation();
  } finally {
    release();
    keys.forEach((key) => {
      if (lifecycleMutationTails.get(key) === reservation) {
        lifecycleMutationTails.delete(key);
      }
    });
  }
};
