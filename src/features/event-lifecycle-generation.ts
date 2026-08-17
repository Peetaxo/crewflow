let lifecycleSnapshotGeneration = 0;

export const getLifecycleSnapshotGeneration = (): number => lifecycleSnapshotGeneration;

export const advanceLifecycleSnapshotGeneration = (): number => {
  lifecycleSnapshotGeneration += 1;
  return lifecycleSnapshotGeneration;
};
