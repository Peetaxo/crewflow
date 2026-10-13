import { useEffect, useState } from 'react';
import { getProjectDependencies, subscribeToProjectChanges } from '../services/projects.service';

/** Cache the cloned service snapshot and refresh it only when the store changes. */
export const useProjectDependencies = () => {
  const [snapshot, setSnapshot] = useState(getProjectDependencies);
  useEffect(() => {
    const refresh = () => setSnapshot(getProjectDependencies());
    const unsubscribe = subscribeToProjectChanges(refresh);
    refresh();
    return unsubscribe;
  }, []);
  return snapshot;
};
