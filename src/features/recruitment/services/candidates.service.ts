import type { Candidate, RecruitmentStage } from '../../../types';
import { getLocalAppState, subscribeToLocalAppState, updateLocalAppState } from '../../../lib/app-data';

export const getCandidates = (): Candidate[] => getLocalAppState().candidates;

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
  subscribeToLocalAppState(() => listener())
);
