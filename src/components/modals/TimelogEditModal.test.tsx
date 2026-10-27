import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event, Role, Timelog } from '../../types';
import TimelogEntry, { LegacyTimelogEditModal as TimelogEditModal } from './TimelogEditModal';

vi.mock('../../features/shift-workflows/SharedTimelogEntry', () => ({ default: () => <div data-testid="shared-evidence-entry" /> }));

let mockIsMobile = false;
let role: Role = 'crew';
let editingTimelog: Timelog | null = null;
let setEditingTimelogMock = vi.fn();
const testMocks = vi.hoisted(() => ({
  saveTimelog: vi.fn(),
  reloadTimelogForEditor: vi.fn(),
  eventOverrides: {} as Partial<Event>,
}));

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
        mealAllowanceEnabled: true,
        ...testMocks.eventOverrides,
      },
    ],
  }),
  saveTimelog: testMocks.saveTimelog,
  reloadTimelogForEditor: testMocks.reloadTimelogForEditor,
}));

describe('TimelogEditModal responsive switch', () => {
  it('routes the global editor through shared evidence before choosing legacy layouts', () => {
    render(<TimelogEntry />);
    expect(screen.getByTestId('shared-evidence-entry')).toBeInTheDocument();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    testMocks.eventOverrides = {};
    setEditingTimelogMock = vi.fn();
    testMocks.saveTimelog.mockResolvedValue(undefined);
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

  it('adds blank v2 multi-day actuals without borrowing whole-event boundaries', () => {
    testMocks.eventOverrides = { scheduleVersion: 2, endDate: '2026-07-15' };
    render(<TimelogEditModal />);
    fireEvent.click(screen.getByRole('button', { name: 'Přidat den' }));
    expect(setEditingTimelogMock).toHaveBeenLastCalledWith(expect.objectContaining({
      days: [editingTimelog!.days[0], expect.objectContaining({ d: '2026-07-13', f: '', t: '' })],
    }));
  });

  it('compares blank v2 actuals against the blank per-date plan', () => {
    testMocks.eventOverrides = { scheduleVersion: 2, endDate: '2026-07-15' };
    editingTimelog!.days = [{ d: '2026-07-13', f: '', t: '', type: 'instal' }];
    const { container } = render(<TimelogEditModal />);
    const row = container.querySelector('input[type="date"]')!.parentElement!.parentElement!;
    expect(row.className).not.toContain('nodu-accent-rgb');
    expect(setEditingTimelogMock).not.toHaveBeenCalled();
  });

  it.each(['crewhead', 'coo'] as const)('uses the mobile timelog editor for %s on mobile', (mobileRole) => {
    mockIsMobile = true;
    role = mobileRole;

    render(<TimelogEditModal />);

    expect(screen.getByTestId('mobile-timelog-modal')).toBeInTheDocument();
  });

  it('keeps the desktop editor outside the mobile Crew shell', () => {
    render(<TimelogEditModal />);

    expect(screen.queryByTestId('mobile-timelog-modal')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Upravit výkaz' })).toBeInTheDocument();
  });

  it('keeps the desktop draft after a conflict and replaces it only on explicit reload', async () => {
    setEditingTimelogMock.mockImplementation((next) => { editingTimelog = next; });
    editingTimelog = { ...editingTimelog!, supabaseId: 'report-1', updatedAt: 'v1' };
    const current = { ...editingTimelog, note: 'Another writer', updatedAt: 'v2' };
    testMocks.saveTimelog.mockRejectedValueOnce(new Error('Výkaz se mezitím změnil.'));
    testMocks.reloadTimelogForEditor
      .mockRejectedValueOnce(new Error('Výkaz se během načítání změnil. Načtěte aktuální verzi znovu.'))
      .mockResolvedValueOnce(current);
    const view = render(<TimelogEditModal />);
    fireEvent.change(screen.getByPlaceholderText('Doplňte detaily...'), { target: { value: 'My unsaved draft' } });
    view.rerender(<TimelogEditModal />);
    fireEvent.click(screen.getByRole('button', { name: 'Uložit změny' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Výkaz se mezitím změnil.'));
    expect(screen.getByDisplayValue('My unsaved draft')).toBeInTheDocument();
    expect(editingTimelog).toMatchObject({ note: 'My unsaved draft', updatedAt: 'v1' });
    expect(testMocks.reloadTimelogForEditor).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Načíst aktuální verzi' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Výkaz se během načítání změnil.'));
    expect(screen.getByDisplayValue('My unsaved draft')).toBeInTheDocument();
    expect(editingTimelog).toMatchObject({ note: 'My unsaved draft', updatedAt: 'v1' });
    fireEvent.click(screen.getByRole('button', { name: 'Načíst aktuální verzi' }));
    await waitFor(() => expect(setEditingTimelogMock).toHaveBeenLastCalledWith(current));
    view.rerender(<TimelogEditModal />);

    expect(screen.getByDisplayValue('Another writer')).toBeInTheDocument();
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

  it('updates optional meal selection for individual days in the desktop editor', () => {
    render(<TimelogEditModal />);

    fireEvent.click(screen.getByRole('button', { name: 'Oběd' }));

    expect(setEditingTimelogMock).toHaveBeenCalledWith(expect.objectContaining({
      days: [
        expect.objectContaining({
          d: '2026-07-13',
          meals: ['obed'],
          meal: 'obed',
        }),
      ],
    }));
  });

  it('shows a returned review note without treating the Crew note as the return reason', () => {
    editingTimelog = {
      ...editingTimelog!,
      status: 'rejected',
      note: 'Crew původní poznámka.',
      reviewNote: 'Chybí pauza po obědě.',
    };

    render(<TimelogEditModal />);

    expect(screen.getByText('Vráceno k opravě')).toBeInTheDocument();
    expect(screen.getByText('Chybí pauza po obědě.')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Crew původní poznámka.')).toBeInTheDocument();
    const returnedNotice = screen.getByText('Vráceno k opravě').parentElement?.parentElement;
    expect(returnedNotice).not.toBeNull();
    expect(within(returnedNotice as HTMLElement).queryByText('Crew původní poznámka.')).not.toBeInTheDocument();
  });

  it('does not show a return reason in the desktop editor when review note is empty', () => {
    editingTimelog = {
      ...editingTimelog!,
      status: 'rejected',
      note: 'Crew původní poznámka.',
      reviewNote: '',
    };

    render(<TimelogEditModal />);

    expect(screen.getByText('Vráceno k opravě')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Crew původní poznámka.')).toBeInTheDocument();
    const returnedNotice = screen.getByText('Vráceno k opravě').parentElement?.parentElement;
    expect(returnedNotice).not.toBeNull();
    expect(within(returnedNotice as HTMLElement).queryByText('Crew původní poznámka.')).not.toBeInTheDocument();
  });

  it('labels CrewHead corrections as sending the report to Crew confirmation', async () => {
    role = 'crewhead';
    editingTimelog = {
      ...editingTimelog!,
      status: 'pending_ch',
    };

    render(<TimelogEditModal />);

    expect(screen.getByRole('button', { name: 'Odeslat k potvrzení Crew' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Uložit změny' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Odeslat k potvrzení Crew' }));

    await waitFor(() => expect(testMocks.saveTimelog).toHaveBeenCalledWith(expect.objectContaining({
      status: 'pending_crew_confirmation',
    })));
  });
});
