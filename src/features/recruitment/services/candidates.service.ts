import { appDataSource } from '../../../lib/app-config';
import type { Candidate, RecruitmentStage } from '../../../types';
import { getLocalAppState, subscribeToLocalAppState, updateLocalAppState } from '../../../lib/app-data';
import { mapCandidate } from '../../../lib/supabase-mappers';
import { isSupabaseConfigured, supabase } from '../../../lib/supabase';

let candidatesHydrationPromise: Promise<void> | null = null;
let candidatesLoaded = false;

const hydrateCandidatesFromSupabase = async (): Promise<void> => {
  if (appDataSource !== 'supabase' || !supabase || !isSupabaseConfigured) {
    return;
  }

  const { data, error } = await supabase
    .from('candidates')
    .select('*')
    .order('created_at');

  if (error) {
    throw new Error(error.message);
  }

  const supabaseCandidates = (data ?? []).map((row, index) => ({
    ...mapCandidate(row),
    id: index + 1,
  }));

  updateLocalAppState((snapshot) => ({
    ...snapshot,
    candidates: supabaseCandidates,
  }));
};

const ensureSupabaseCandidatesLoaded = () => {
  if (appDataSource !== 'supabase' || !supabase || !isSupabaseConfigured) {
    return;
  }

  if (candidatesLoaded) {
    return;
  }

  if (candidatesHydrationPromise) {
    return;
  }

  candidatesHydrationPromise = hydrateCandidatesFromSupabase()
    .then(() => {
      candidatesLoaded = true;
    })
    .catch((error) => {
      console.warn('Nepodarilo se nacist kandidaty ze Supabase, zustavam na lokalnich datech.', error);
    })
    .finally(() => {
      candidatesHydrationPromise = null;
    });
};

export const getCandidates = (): Candidate[] => {
  ensureSupabaseCandidatesLoaded();
  return getLocalAppState().candidates ?? [];
};

export const advanceCandidate = (id: number): Candidate | null => {
  let nextCandidate: Candidate | null = null;

  updateLocalAppState((snapshot) => {
    const stages: RecruitmentStage[] = ['new', 'interview_scheduled', 'decision', 'accepted'];
    const nextCandidates = snapshot.candidates.map((candidate) => {
      if (candidate.id !== id) return candidate;

      const index = stages.indexOf(candidate.stage);
      if (index < stages.length - 1) {
        nextCandidate = { ...candidate, stage: stages[index + 1] };
        return nextCandidate;
      }

      nextCandidate = candidate;
      return candidate;
    });

    return {
      ...snapshot,
      candidates: nextCandidates,
    };
  });

  return nextCandidate;
};

export const subscribeToCandidateChanges = (listener: () => void): (() => void) => (
  (ensureSupabaseCandidatesLoaded(), subscribeToLocalAppState(() => listener()))
);

export const resetSupabaseCandidatesHydration = () => {
  candidatesHydrationPromise = null;
  candidatesLoaded = false;
};
