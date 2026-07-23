import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event, Timelog } from '../../types';
import MobileTimelogEditModal from './MobileTimelogEditModal';

const testState = vi.hoisted(() => ({
  editingTimelog: null as Timelog | null,
  cloneDependencies: false,
}));

const testMocks = vi.hoisted(() => ({
  setEditingTimelog: vi.fn(),
  setCurrentTab: vi.fn(),
  setSelectedContractorProfileId: vi.fn(),
  saveTimelog: vi.fn().mockResolvedValue(undefined),
}));

const testData = vi.hoisted(() => ({
  event: {
    id: 1,
    name: 'TEST',
    job: 'JOB-1',
    startDate: '2026-07-13',
    endDate: '2026-07-15',
    startTime: '08:00',
    endTime: '17:00',
    city: 'Praha',
    needed: 2,
    filled: 1,
    status: 'upcoming',
    client: 'NEXTLEVEL',
    showDayTypes: true,
    dayTypes: {
      '2026-07-13': 'instal',
      '2026-07-14': 'provoz',
      '2026-07-15': 'deinstal',
    },
    phaseTimes: {
      instal: { from: '08:00', to: '17:00' },
      provoz: { from: '09:00', to: '18:00' },
      deinstal: { from: '10:00', to: '15:00' },
    },
  } as Event,
}));

vi.mock('../../context/useAppContext', () => ({
  useAppContext: () => ({
    editingTimelog: testState.editingTimelog,
    setEditingTimelog: testMocks.setEditingTimelog,
    setCurrentTab: testMocks.setCurrentTab,
    setSelectedContractorProfileId: testMocks.setSelectedContractorProfileId,
    role: 'crew',
  }),
}));

vi.mock('../../features/timelogs/services/timelogs.service', () => ({
  getTimelogDependencies: () => {
    const event = testState.cloneDependencies
      ? JSON.parse(JSON.stringify(testData.event)) as Event
      : testData.event;

    return {
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
      events: [event],
    };
  },
  saveTimelog: testMocks.saveTimelog,
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}));

const selectTime = (label: 'Od' | 'Do', time: string) => {
  const [hour, minute] = time.split(':');
  const timeField = screen.getByRole('group', { name: label });
  fireEvent.click(within(timeField).getByRole('button', { name: new RegExp(`Otevřít výběr času ${label}`) }));

  const timeWheel = screen.getByRole('group', { name: `Výběr času ${label}` });
  fireEvent.click(within(timeWheel).getByRole('button', { name: `${label} hodina ${hour}` }));
  fireEvent.click(within(timeWheel).getByRole('button', { name: `${label} minuta ${minute}` }));
};

const syncEditingTimelogUpdates = () => {
  testMocks.setEditingTimelog.mockImplementation((nextTimelog: Timelog | null) => {
    testState.editingTimelog = nextTimelog;
  });
};

describe('MobileTimelogEditModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.cloneDependencies = false;
    testState.editingTimelog = {
      id: 1,
      eid: 1,
      contractorProfileId: 'profile-1',
      days: [
        { d: '2026-07-13', f: '08:00', t: '17:00', type: 'instal' },
        { d: '2026-07-14', f: '09:00', t: '18:00', type: 'provoz' },
      ],
      km: 0,
      note: '',
      status: 'draft',
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders a mobile calendar with event days only and an add-day action', () => {
    render(<MobileTimelogEditModal />);

    expect(screen.getByRole('heading', { name: 'Upravit výkaz' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '13.07.2026' })).toHaveClass('nodu-mobile-timelog-day--event');
    expect(screen.queryByRole('button', { name: '12.07.2026' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Přidat den' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Uložit záznam' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Poznámka ke dni')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Zavřít' })).toHaveLength(1);
    expect(screen.getByText('18.0h')).toBeInTheDocument();
    expect(screen.getByText('5 400 Kc')).toBeInTheDocument();
  });

  it('adds a custom calendar day only after confirming the selected date', async () => {
    render(<MobileTimelogEditModal />);

    fireEvent.click(screen.getByRole('button', { name: 'Přidat den' }));

    const addDayPicker = screen.getByRole('dialog', { name: 'Výběr nového dne' });
    expect(addDayPicker).toHaveClass('nodu-mobile-timelog-add-day-picker');
    expect(within(addDayPicker).getAllByRole('button', { name: /^Vybrat / })).toHaveLength(35);
    expect(within(addDayPicker).queryByRole('button', { name: 'Vybrat 03.08.2026' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Datum nového dne')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '20.07.2026' })).not.toBeInTheDocument();

    fireEvent.click(within(addDayPicker).getByRole('button', { name: 'Vybrat 20.07.2026' }));

    expect(within(addDayPicker).getByRole('button', { name: 'Vybrat 20.07.2026' })).toHaveClass('nodu-mobile-timelog-add-day-cell--selected');
    expect(screen.queryByRole('button', { name: '20.07.2026' })).not.toBeInTheDocument();

    fireEvent.click(within(addDayPicker).getByRole('button', { name: 'Vybrat 11.07.2026' }));

    expect(within(addDayPicker).getByRole('button', { name: 'Vybrat 11.07.2026' })).toHaveClass('nodu-mobile-timelog-add-day-cell--selected');
    expect(screen.queryByRole('button', { name: '11.07.2026' })).not.toBeInTheDocument();

    fireEvent.click(within(addDayPicker).getByRole('button', { name: 'Přidat vybraný den' }));

    expect(screen.getByRole('button', { name: '11.07.2026' })).toHaveClass('nodu-mobile-timelog-day--outside');
    expect(screen.getByRole('button', { name: '11.07.2026' })).toHaveClass('nodu-mobile-timelog-day--selected');
    expect(screen.queryByRole('button', { name: '20.07.2026' })).not.toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'Záznam dne' })).queryByText('Mimo akci')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Výběr nového dne' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Uložit výkaz' }));

    await waitFor(() => expect(testMocks.saveTimelog).toHaveBeenCalledWith(expect.objectContaining({
      days: expect.arrayContaining([
        expect.objectContaining({
          d: '2026-07-11',
          f: '09:00',
          t: '18:00',
          type: 'provoz',
        }),
      ]),
    })));
  });

  it('updates one selected day with 15-minute times and the report note on final save', async () => {
    render(<MobileTimelogEditModal />);

    fireEvent.click(screen.getByRole('button', { name: '14.07.2026' }));
    selectTime('Od', '10:15');
    selectTime('Do', '18:45');
    fireEvent.change(screen.getByLabelText('Poznámka k výkazu'), {
      target: { value: 'Telefonicky domluveno' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Uložit výkaz' }));

    await waitFor(() => expect(testMocks.saveTimelog).toHaveBeenCalledWith(expect.objectContaining({
      note: 'Telefonicky domluveno',
      days: expect.arrayContaining([
        expect.objectContaining({
          d: '2026-07-14',
          f: '10:15',
          t: '18:45',
          type: 'provoz',
        }),
      ]),
    })));
    const savedTimelog = testMocks.saveTimelog.mock.calls.at(-1)?.[0] as Timelog;
    expect(savedTimelog.days.find((day) => day.d === '2026-07-14')).not.toMatchObject({
      note: 'Telefonicky domluveno',
    });
  });

  it('offers scrollable quarter-hour time pickers for the start and end time', () => {
    render(<MobileTimelogEditModal />);

    expect(screen.queryByLabelText('Od')).not.toHaveAttribute('type', 'time');
    expect(screen.getByRole('group', { name: 'Od' })).toHaveClass('nodu-mobile-timelog-time-picker');
    expect(screen.getByRole('group', { name: 'Do' })).toHaveClass('nodu-mobile-timelog-time-picker');
    expect(screen.getByRole('group', { name: 'Od' }).querySelector('.nodu-mobile-timelog-time-label')).toHaveTextContent('Od');
    expect(screen.getByRole('group', { name: 'Do' }).querySelector('.nodu-mobile-timelog-time-label')).toHaveTextContent('Do');
    expect(screen.getByRole('button', { name: 'Otevřít výběr času Od 08:00' })).toHaveClass('nodu-mobile-timelog-time-trigger');
    expect(screen.getByRole('button', { name: 'Otevřít výběr času Do 17:00' })).toHaveClass('nodu-mobile-timelog-time-trigger');
    expect(screen.getByRole('group', { name: 'Od' }).querySelector('.nodu-mobile-timelog-time-trigger-icon')).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Výběr času Od' })).not.toBeInTheDocument();

    selectTime('Od', '10:15');
    selectTime('Do', '18:45');

    expect(screen.getByRole('button', { name: 'Otevřít výběr času Od 10:15' })).toHaveTextContent('10:15');
    expect(screen.getByRole('button', { name: 'Otevřít výběr času Do 18:45' })).toHaveTextContent('18:45');
  });

  it('opens an iOS-style hour and quarter-hour minute picker after tapping the time field', () => {
    render(<MobileTimelogEditModal />);

    const startPicker = screen.getByRole('group', { name: 'Od' });

    expect(screen.queryByRole('group', { name: 'Výběr času Od' })).not.toBeInTheDocument();
    fireEvent.click(within(startPicker).getByRole('button', { name: 'Otevřít výběr času Od 08:00' }));

    const timeWheel = screen.getByRole('group', { name: 'Výběr času Od' });
    const hourColumn = timeWheel.querySelector('[data-time-part="hour"]') as HTMLDivElement;
    const minuteColumn = timeWheel.querySelector('[data-time-part="minute"]') as HTMLDivElement;

    expect(timeWheel).toHaveClass('nodu-mobile-timelog-time-wheel');
    expect(timeWheel.querySelectorAll('.nodu-mobile-timelog-time-column')).toHaveLength(2);
    expect(within(timeWheel).getByRole('button', { name: 'Potvrdit čas Od' })).toHaveClass('nodu-mobile-timelog-time-confirm');
    expect(within(timeWheel).getByRole('button', { name: 'Od hodina 08' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(timeWheel).getByRole('button', { name: 'Od minuta 00' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(timeWheel).queryByRole('button', { name: 'Od minuta 10' })).not.toBeInTheDocument();
    expect(hourColumn.scrollTop).toBe(8 * 40);
    expect(minuteColumn.scrollTop).toBe(0);
    minuteColumn.scrollTop = 1 * 40;
    fireEvent.scroll(minuteColumn);

    expect(screen.getByRole('button', { name: 'Otevřít výběr času Od 08:15' })).toHaveTextContent('08:15');

    fireEvent.click(within(timeWheel).getByRole('button', { name: 'Potvrdit čas Od' }));

    expect(screen.queryByRole('group', { name: 'Výběr času Od' })).not.toBeInTheDocument();
  });

  it('keeps edited time values when dependencies are returned as fresh objects', async () => {
    testState.cloneDependencies = true;
    render(<MobileTimelogEditModal />);

    selectTime('Od', '10:15');

    await waitFor(() => expect(screen.getByRole('button', { name: 'Otevřít výběr času Od 10:15' })).toBeInTheDocument());
  });

  it('autosaves draft time changes after the user pauses on a value', async () => {
    vi.useFakeTimers();
    render(<MobileTimelogEditModal />);

    fireEvent.click(screen.getByRole('button', { name: '14.07.2026' }));
    selectTime('Od', '10:15');

    expect(screen.getByText('Ukládám návrh...')).toBeInTheDocument();
    expect(testMocks.saveTimelog).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(799);
    });

    expect(testMocks.saveTimelog).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(testMocks.saveTimelog).toHaveBeenCalledWith(expect.objectContaining({
      status: 'draft',
      days: expect.arrayContaining([
        expect.objectContaining({
          d: '2026-07-14',
          f: '10:15',
          t: '18:00',
        }),
      ]),
    }));
    expect(screen.getByText('Uloženo v návrhu')).toBeInTheDocument();
  });

  it('does not autosave timelogs that are no longer drafts', async () => {
    vi.useFakeTimers();
    testState.editingTimelog = {
      ...testState.editingTimelog!,
      status: 'pending_ch',
    };
    render(<MobileTimelogEditModal />);

    fireEvent.click(screen.getByRole('button', { name: '14.07.2026' }));
    selectTime('Od', '10:15');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(testMocks.saveTimelog).not.toHaveBeenCalled();
    expect(screen.queryByText('Uloženo v návrhu')).not.toBeInTheDocument();
  });

  it('keeps the report note when changing the phase', async () => {
    render(<MobileTimelogEditModal />);

    fireEvent.click(screen.getByRole('button', { name: '14.07.2026' }));
    fireEvent.change(screen.getByLabelText('Poznámka k výkazu'), {
      target: { value: 'Změna fáze po telefonu' },
    });
    fireEvent.change(screen.getByLabelText('Fáze'), { target: { value: 'deinstal' } });
    fireEvent.click(screen.getByRole('button', { name: 'Uložit výkaz' }));

    await waitFor(() => expect(testMocks.saveTimelog).toHaveBeenCalledWith(expect.objectContaining({
      note: 'Změna fáze po telefonu',
      days: expect.arrayContaining([
        expect.objectContaining({
          d: '2026-07-14',
          f: '10:00',
          t: '15:00',
          type: 'deinstal',
        }),
      ]),
    })));
  });

  it('marks an overnight record as work přes půlnoc', () => {
    testState.editingTimelog = {
      ...testState.editingTimelog!,
      days: [
        { id: 'night-entry', d: '2026-07-13', f: '20:00', t: '06:00', type: 'provoz' },
      ],
    };

    render(<MobileTimelogEditModal />);

    const recordCard = screen.getByRole('button', { name: 'Upravit záznam 1' });

    expect(recordCard).toHaveTextContent('20:00 - 06:00');
    expect(recordCard).toHaveTextContent('10.0h');
    expect(recordCard.querySelector('.nodu-mobile-timelog-entry-heading .nodu-mobile-timelog-overnight-chip')).toHaveTextContent('přes půlnoc');
    expect(recordCard.querySelector('.nodu-mobile-timelog-entry-meta .nodu-mobile-timelog-entry-hours')).toHaveTextContent('10.0h');
    expect(recordCard.querySelector('.nodu-mobile-timelog-entry-meta .nodu-mobile-timelog-overnight-chip')).not.toBeInTheDocument();
    expect(screen.getAllByText('10.0h').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('přes půlnoc')).toHaveLength(1);
  });

  it('moves the selected day hours into the record card and places the add-record action in the day header', () => {
    render(<MobileTimelogEditModal />);

    const dayEditor = screen.getByRole('group', { name: 'Záznam dne' });
    const recordCard = screen.getByRole('button', { name: 'Upravit záznam 1' });
    const addRecordButton = within(dayEditor).getByRole('button', { name: 'Přidat Záznam' });

    expect(recordCard).toHaveTextContent('9.0h');
    expect(screen.queryByText('9.0h v tento den')).not.toBeInTheDocument();
    expect(within(dayEditor).queryByText('Akce')).not.toBeInTheDocument();
    expect(within(dayEditor).queryByText('Mimo akci')).not.toBeInTheDocument();
    expect(addRecordButton.closest('.nodu-mobile-timelog-day-editor-header')).toContainElement(addRecordButton);
    expect(screen.queryByRole('button', { name: 'Přidat záznam v tento den' })).not.toBeInTheDocument();
  });

  it('updates the active record card while editing the time draft', () => {
    render(<MobileTimelogEditModal />);

    const recordCard = screen.getByRole('button', { name: 'Upravit záznam 1' });

    expect(recordCard).toHaveTextContent('08:00 - 17:00');
    expect(recordCard).toHaveTextContent('9.0h');

    selectTime('Do', '18:00');

    expect(recordCard).toHaveTextContent('08:00 - 18:00');
    expect(recordCard).toHaveTextContent('10.0h');
  });

  it('shows multiple records under one selected day', () => {
    testState.editingTimelog = {
      ...testState.editingTimelog!,
      days: [
        { id: 'entry-1', d: '2026-07-14', f: '09:00', t: '12:00', type: 'provoz' },
        { id: 'entry-2', d: '2026-07-14', f: '18:00', t: '23:00', type: 'provoz' },
      ],
    };

    render(<MobileTimelogEditModal />);

    const dayButton = screen.getByRole('button', { name: '14.07.2026' });
    expect(dayButton).toHaveTextContent('2');
    expect(screen.getByRole('button', { name: 'Upravit záznam 1' })).toHaveTextContent('09:00 - 12:00');
    expect(screen.getByRole('button', { name: 'Upravit záznam 2' })).toHaveTextContent('18:00 - 23:00');
  });

  it('stages the current record before switching to another record', () => {
    testState.editingTimelog = {
      ...testState.editingTimelog!,
      days: [
        { id: 'entry-1', d: '2026-07-14', f: '09:00', t: '12:00', type: 'provoz' },
        { id: 'entry-2', d: '2026-07-14', f: '18:00', t: '23:00', type: 'provoz' },
      ],
    };

    render(<MobileTimelogEditModal />);

    selectTime('Od', '10:15');
    fireEvent.click(screen.getByRole('button', { name: 'Upravit záznam 2' }));

    expect(testMocks.setEditingTimelog).toHaveBeenCalledWith(expect.objectContaining({
      days: expect.arrayContaining([
        expect.objectContaining({ id: 'entry-1', d: '2026-07-14', f: '10:15', t: '12:00' }),
        expect.objectContaining({ id: 'entry-2', d: '2026-07-14', f: '18:00', t: '23:00' }),
      ]),
    }));
  });

  it('adds a second record for an already reported day', async () => {
    testState.editingTimelog = {
      ...testState.editingTimelog!,
      days: [
        { id: 'entry-1', d: '2026-07-14', f: '09:00', t: '12:00', type: 'provoz' },
      ],
    };

    render(<MobileTimelogEditModal />);

    fireEvent.click(screen.getByRole('button', { name: '14.07.2026' }));
    fireEvent.click(screen.getByRole('button', { name: 'Přidat Záznam' }));

    expect(testMocks.setEditingTimelog).toHaveBeenCalledWith(expect.objectContaining({
      days: expect.arrayContaining([
        expect.objectContaining({ id: 'entry-1', d: '2026-07-14', f: '09:00', t: '12:00' }),
        expect.objectContaining({ d: '2026-07-14', f: '09:00', t: '18:00' }),
      ]),
    }));
    expect(testMocks.setEditingTimelog.mock.calls.at(-1)?.[0].days).toHaveLength(2);

    selectTime('Od', '18:00');
    selectTime('Do', '23:00');
    fireEvent.click(screen.getByRole('button', { name: 'Uložit výkaz' }));

    await waitFor(() => expect(testMocks.saveTimelog).toHaveBeenCalledWith(expect.objectContaining({
      days: expect.arrayContaining([
        expect.objectContaining({ id: 'entry-1', d: '2026-07-14', f: '09:00', t: '12:00' }),
        expect.objectContaining({ d: '2026-07-14', f: '18:00', t: '23:00' }),
      ]),
    })));
    expect(testMocks.saveTimelog.mock.calls.at(-1)?.[0].days).toHaveLength(2);
  });

  it('keeps the newly added record active immediately', () => {
    testState.editingTimelog = {
      ...testState.editingTimelog!,
      days: [
        { id: 'entry-1', d: '2026-07-14', f: '09:00', t: '12:00', type: 'provoz' },
      ],
    };
    syncEditingTimelogUpdates();

    render(<MobileTimelogEditModal />);

    fireEvent.click(screen.getByRole('button', { name: '14.07.2026' }));
    fireEvent.click(screen.getByRole('button', { name: 'Přidat Záznam' }));

    const recordCards = screen.getAllByRole('button', { name: /Upravit záznam/ });
    const activeCards = recordCards.filter((card) => (
      card.classList.contains('nodu-mobile-timelog-entry-card--active')
    ));

    expect(recordCards).toHaveLength(2);
    expect(activeCards).toHaveLength(1);
    expect(activeCards[0]).not.toHaveTextContent('09:00 - 12:00');
  });

  it('selects the previous record after deleting the active record', () => {
    testState.editingTimelog = {
      ...testState.editingTimelog!,
      days: [
        { id: 'entry-1', d: '2026-07-14', f: '09:00', t: '12:00', type: 'provoz' },
        { id: 'entry-2', d: '2026-07-14', f: '13:00', t: '17:00', type: 'provoz' },
        { id: 'entry-3', d: '2026-07-14', f: '18:00', t: '23:00', type: 'provoz' },
      ],
    };
    syncEditingTimelogUpdates();

    render(<MobileTimelogEditModal />);

    fireEvent.click(screen.getByRole('button', { name: 'Upravit záznam 3' }));
    fireEvent.click(screen.getByRole('button', { name: 'Odebrat Záznam 3' }));

    expect(screen.queryByRole('button', { name: 'Upravit záznam 3' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upravit záznam 2' })).toHaveClass('nodu-mobile-timelog-entry-card--active');
    expect(screen.getByRole('button', { name: 'Upravit záznam 2' })).toHaveTextContent('13:00 - 17:00');
    expect(screen.getByRole('button', { name: 'Odebrat Záznam 2' })).toBeInTheDocument();
  });

  it('separates record fields from report-level fields', () => {
    render(<MobileTimelogEditModal />);

    const recordGroup = screen.getByRole('group', { name: 'Záznam dne' });
    const reportGroup = screen.getByRole('group', { name: 'Výkaz celkem' });
    const phaseLabel = screen.getByText('Fáze');
    const kmLabel = screen.getByText('Cestovné celkem (km)');
    const noteLabel = screen.getByText('Poznámka k výkazu');

    expect(recordGroup).toHaveClass('nodu-mobile-timelog-day-editor');
    expect(reportGroup).toHaveClass('nodu-mobile-timelog-report-editor');
    expect(recordGroup).toContainElement(phaseLabel);
    expect(reportGroup).toContainElement(kmLabel);
    expect(reportGroup).toContainElement(noteLabel);
    expect(Boolean(phaseLabel.compareDocumentPosition(kmLabel) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    expect(Boolean(kmLabel.compareDocumentPosition(noteLabel) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  });

  it('saves and closes the timelog', async () => {
    render(<MobileTimelogEditModal />);

    fireEvent.click(screen.getByRole('button', { name: 'Uložit výkaz' }));

    await waitFor(() => expect(testMocks.saveTimelog).toHaveBeenCalledWith(expect.objectContaining({
      id: testState.editingTimelog?.id,
      eid: testState.editingTimelog?.eid,
      days: expect.arrayContaining([
        expect.objectContaining({ d: '2026-07-13', f: '08:00', t: '17:00' }),
      ]),
    })));
    expect(testMocks.setEditingTimelog).toHaveBeenCalledWith(null);
  });

  it('includes the current edited day when saving the whole timelog', async () => {
    render(<MobileTimelogEditModal />);

    selectTime('Od', '10:15');
    selectTime('Do', '18:45');
    fireEvent.click(screen.getByRole('button', { name: 'Uložit výkaz' }));

    await waitFor(() => expect(testMocks.saveTimelog).toHaveBeenCalledWith(expect.objectContaining({
      days: expect.arrayContaining([
        expect.objectContaining({
          d: '2026-07-13',
          f: '10:15',
          t: '18:45',
        }),
      ]),
    })));
    expect(testMocks.setEditingTimelog).toHaveBeenCalledWith(null);
  });
});
