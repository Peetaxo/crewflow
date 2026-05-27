import { appDataSource } from '../../../lib/app-config';
import type { Candidate, RecruitmentStage } from '../../../types';
import { getLocalAppState, subscribeToLocalAppState, updateLocalAppState } from '../../../lib/app-data';
import { mapCandidate } from '../../../lib/supabase-mappers';
import { isSupabaseConfigured, supabase } from '../../../lib/supabase';

let candidatesHydrationPromise: Promise<void> | null = null;
let candidatesLoaded = false;

const stageRank: Record<RecruitmentStage, number> = {
  new: 0,
  interview_scheduled: 1,
  decision: 2,
  accepted: 3,
  rejected: 4,
};

const normalizeText = (value: string): string => (
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
);

const normalizeEmail = (value: string): string => value.trim().toLowerCase();

const normalizePhone = (value: string): string => value.replace(/[^\d+]/g, '');

const hasTallyData = (candidate: Candidate): boolean => Boolean(candidate.tallySubmissionId || candidate.tallyRespondentId || candidate.rawPayload);

const hasCalData = (candidate: Candidate): boolean => Boolean(candidate.calBooked || candidate.calBookingUid || candidate.interviewAt);

const firstFilled = (...values: Array<string | null | undefined>): string => (
  values.find((value) => Boolean(value?.trim()))?.trim() ?? ''
);

const firstDefined = <T>(...values: Array<T | null | undefined>): T | null => {
  for (const value of values) {
    if (value != null) return value;
  }

  return null;
};

const mergeNotes = (left: string, right: string): string => {
  const notes = [left.trim(), right.trim()].filter(Boolean);
  return Array.from(new Set(notes)).join('\n');
};

const shouldMergeCandidates = (left: Candidate, right: Candidate): boolean => {
  if (left.tallySubmissionId && left.tallySubmissionId === right.tallySubmissionId) return true;
  if (left.calBookingUid && left.calBookingUid === right.calBookingUid) return true;

  const leftEmail = normalizeEmail(left.email);
  const rightEmail = normalizeEmail(right.email);
  if (leftEmail && leftEmail === rightEmail) return true;

  const leftPhone = normalizePhone(left.phone);
  const rightPhone = normalizePhone(right.phone);
  if (leftPhone && leftPhone === rightPhone) return true;

  const sameName = normalizeText(left.name) === normalizeText(right.name);
  if (!sameName || !normalizeText(left.name)) return false;

  return (hasTallyData(left) && hasCalData(right)) || (hasCalData(left) && hasTallyData(right));
};

const mergeCandidates = (left: Candidate, right: Candidate): Candidate => {
  const primary = stageRank[right.stage] > stageRank[left.stage] ? right : left;
  const secondary = primary === right ? left : right;
  const calCandidate = hasCalData(right) ? right : hasCalData(left) ? left : primary;
  const tallyCandidate = hasTallyData(right) ? right : hasTallyData(left) ? left : primary;

  return {
    ...secondary,
    ...primary,
    id: primary.id,
    tallySubmissionId: firstFilled(tallyCandidate.tallySubmissionId, primary.tallySubmissionId, secondary.tallySubmissionId) || null,
    tallyRespondentId: firstFilled(tallyCandidate.tallyRespondentId, primary.tallyRespondentId, secondary.tallyRespondentId) || null,
    submittedAt: firstFilled(tallyCandidate.submittedAt, primary.submittedAt, secondary.submittedAt) || null,
    name: firstFilled(primary.name, secondary.name),
    phone: firstFilled(tallyCandidate.phone, primary.phone, secondary.phone),
    email: firstFilled(calCandidate.email, primary.email, secondary.email),
    src: hasTallyData(tallyCandidate) ? 'Tally' : firstFilled(primary.src, secondary.src),
    sourceContent: firstFilled(tallyCandidate.sourceContent, primary.sourceContent, secondary.sourceContent) || null,
    isAdult: firstDefined(tallyCandidate.isAdult, primary.isAdult, secondary.isAdult),
    hasIco: firstDefined(tallyCandidate.hasIco, primary.hasIco, secondary.hasIco),
    hasDrivingLicense: firstDefined(tallyCandidate.hasDrivingLicense, primary.hasDrivingLicense, secondary.hasDrivingLicense),
    canDriveVan: firstDefined(tallyCandidate.canDriveVan, primary.canDriveVan, secondary.canDriveVan),
    hasEventExperience: firstDefined(tallyCandidate.hasEventExperience, primary.hasEventExperience, secondary.hasEventExperience),
    calBooked: left.calBooked || right.calBooked,
    calBookingUid: firstFilled(calCandidate.calBookingUid, primary.calBookingUid, secondary.calBookingUid) || null,
    calBookingStatus: firstFilled(calCandidate.calBookingStatus, primary.calBookingStatus, secondary.calBookingStatus) || null,
    calEventType: firstFilled(calCandidate.calEventType, primary.calEventType, secondary.calEventType) || null,
    stage: primary.stage,
    interviewAt: firstFilled(calCandidate.interviewAt, primary.interviewAt, secondary.interviewAt) || null,
    note: mergeNotes(tallyCandidate.note, calCandidate.note),
    rawPayload: tallyCandidate.rawPayload ?? primary.rawPayload ?? secondary.rawPayload ?? null,
  };
};

const mergeDuplicateCandidates = (candidates: Candidate[]): Candidate[] => {
  const merged: Candidate[] = [];

  candidates.forEach((candidate) => {
    const index = merged.findIndex((current) => shouldMergeCandidates(current, candidate));
    if (index === -1) {
      merged.push(candidate);
      return;
    }

    merged[index] = mergeCandidates(merged[index], candidate);
  });

  return merged;
};

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

  const supabaseCandidates = mergeDuplicateCandidates((data ?? []).map(mapCandidate))
    .map((candidate, index) => ({
      ...candidate,
      id: index + 1,
    }));

  updateLocalAppState((snapshot) => ({
    ...snapshot,
    candidates: supabaseCandidates,
  }));
};

export const refreshCandidatesFromSupabase = async (): Promise<void> => {
  candidatesHydrationPromise = hydrateCandidatesFromSupabase()
    .then(() => {
      candidatesLoaded = true;
    })
    .finally(() => {
      candidatesHydrationPromise = null;
    });

  await candidatesHydrationPromise;
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

  candidatesHydrationPromise = refreshCandidatesFromSupabase()
    .catch((error) => {
      console.warn('Nepodarilo se nacist kandidaty ze Supabase, zustavam na lokalnich datech.', error);
    })
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
