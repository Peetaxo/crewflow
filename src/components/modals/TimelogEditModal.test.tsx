import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Timelog } from '../../types';
import TimelogEditModal from './TimelogEditModal';

let mockIsMobile = false;
let role = 'crew' as const;
let editingTimelog: Timelog | null = null;
let setEditingTimelogMock = vi.fn();

vi.mock('../../hooks/use-mobile', () => ({
  useIsMobile: () => mockIsMobile,
}));

vi.mock('./MobileTimelogEditModal', () => ({
  default: () => <div data-testid="mobile-timelog-modal" />,
}));

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  },
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}));

vi.mock('../../context/useAppContext', () => ({
  useAppContext: () => ({
    editingTimelog,
    setEditingTimelog: setEditingTimelogMock,
    setCurrentTab: vi.fn(),
    setSelectedContractorProfileId: vi.fn(),
    role,
  }),
}));

vi.mock('../../features/timelogs/services/timelogs.service', () => ({
  getTimelogDependencies: () => ({
    contractors: [
      {
        id: 1,
        profileId: 'profile-1',
        name: 'Petr Heitzer',
        ii: 'PH',
        bg: '#E0E7FF',
        fg: '#4338CA',
        rate: 300,
      },
    ],
    events: [
      {
        id: 1,
        name: 'TEST',
        job: 'JOB-1',
        startDate: '2026-07-13',
        endDate: '2026-07-13',
        startTime: '08:00',
        endTime: '17:00',
        city: 'Praha',
        needed: 1,
        filled: 1,
        status: 'upcoming',
        client: 'NEXTLEVEL',
      },
    ],
  }),
  saveTimelog: vi.fn(),
}));

describe('TimelogEditModal responsive switch', () => {
  beforeEach(() => {
    setEditingTimelogMock = vi.fn();
    mockIsMobile = false;
    role = 'crew';
    editingTimelog = {
      id: 1,
      eid: 1,
      contractorProfileId: 'profile-1',
      days: [{ d: '2026-07-13', f: '08:00', t: '17:00', type: 'instal' }],
      km: 0,
      note: '',
      status: 'draft',
    };
  });

  it('uses the mobile timelog editor for Crew on mobile', () => {
    mockIsMobile = true;

    render(<TimelogEditModal />);

    expect(screen.getByTestId('mobile-timelog-modal')).toBeInTheDocument();
  });

  it('keeps the desktop editor outside the mobile Crew shell', () => {
    render(<TimelogEditModal />);

    expect(screen.queryByTestId('mobile-timelog-modal')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Upravit výkaz' })).toBeInTheDocument();
  });

  it('updates optional notes for individual days in the desktop editor', () => {
    render(<TimelogEditModal />);

    fireEvent.change(screen.getByPlaceholderText('Poznámka ke dni (volitelně)'), {
      target: { value: 'Domluveno telefonicky.' },
    });

    expect(setEditingTimelogMock).toHaveBeenCalledWith(expect.objectContaining({
      days: [
        expect.objectContaining({
          d: '2026-07-13',
          note: 'Domluveno telefonicky.',
        }),
      ],
    }));
  });
});
