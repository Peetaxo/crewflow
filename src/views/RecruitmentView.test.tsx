import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Candidate } from '../types';
import RecruitmentView from './RecruitmentView';

const mocks = vi.hoisted(() => ({
  getCandidates: vi.fn<() => Candidate[]>(),
  refreshCandidatesFromSupabase: vi.fn<() => Promise<void>>(),
  subscribeToCandidateChanges: vi.fn<() => () => void>(),
  advanceCandidate: vi.fn(),
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  },
}));

vi.mock('../features/recruitment/services/candidates.service', () => ({
  advanceCandidate: mocks.advanceCandidate,
  getCandidates: mocks.getCandidates,
  refreshCandidatesFromSupabase: mocks.refreshCandidatesFromSupabase,
  subscribeToCandidateChanges: mocks.subscribeToCandidateChanges,
}));

const candidate: Candidate = {
  id: 1,
  tallySubmissionId: 'Nqo2j10',
  tallyRespondentId: null,
  submittedAt: '2026-05-11 19:03:12+00',
  name: 'David Hora',
  phone: '+420734325088',
  email: '05davidhora05@gmail.com',
  src: 'Tally',
  sourceContent: null,
  isAdult: true,
  hasIco: true,
  hasDrivingLicense: true,
  canDriveVan: false,
  hasEventExperience: false,
  calBooked: true,
  calBookingUid: 'q2yeD8wdEWkehrqfmZTKTb',
  calBookingStatus: 'booked',
  calEventType: 'BOOKING_CREATED',
  stage: 'interview_scheduled',
  interviewAt: '2026-05-13 12:00:00+00',
  note: '',
  rawPayload: null,
};

describe('RecruitmentView', () => {
  beforeEach(() => {
    mocks.getCandidates.mockReturnValue([candidate]);
    mocks.refreshCandidatesFromSupabase.mockImplementation(() => new Promise(() => undefined));
    mocks.subscribeToCandidateChanges.mockReturnValue(() => undefined);
    mocks.advanceCandidate.mockReset();
  });

  it('does not show the Cal.com badge inside candidate cards', () => {
    render(<RecruitmentView />);

    const candidateCard = screen.getByText('David Hora').parentElement;

    expect(candidateCard).not.toBeNull();
    expect(within(candidateCard as HTMLElement).queryByText('Cal.com')).not.toBeInTheDocument();
    expect(within(candidateCard as HTMLElement).getByText('IČO')).toBeInTheDocument();
  });
});
