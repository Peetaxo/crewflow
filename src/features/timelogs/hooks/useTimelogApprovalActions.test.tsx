import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Timelog } from '../../../types';

const { updateTimelogStatuses } = vi.hoisted(() => ({
  updateTimelogStatuses: vi.fn(),
}));

vi.mock('../services/timelogs.service', () => ({
  updateTimelogStatuses,
}));

import { useTimelogApprovalActions } from './useTimelogApprovalActions';

const pendingCooTimelog = (id: number): Timelog => ({
  id,
  eid: 1,
  contractorProfileId: `crew-${id}`,
  days: [{ d: '2026-09-20', f: '08:00', t: '16:00', type: 'provoz' }],
  km: 0,
  note: '',
  status: 'pending_coo',
});

const pendingChTimelog = (id: number): Timelog => ({
  ...pendingCooTimelog(id),
  status: 'pending_ch',
});

const Harness = ({
  timelogs,
  onSuccess,
}: {
  timelogs: Timelog[];
  onSuccess?: () => void;
}) => {
  const actions = useTimelogApprovalActions({
    currentProfileId: 'profile-coo',
    timelogs,
    onSuccess,
  });

  return (
    <>
      <button type="button" onClick={() => actions.execute(timelogs.map((item) => item.id), 'rej')}>Vrátit</button>
      <button type="button" onClick={() => actions.execute(timelogs.map((item) => item.id), 'coo')}>Schválit</button>
      <span data-testid="pending">{String(actions.isPending)}</span>
      {actions.dialog}
    </>
  );
};

describe('useTimelogApprovalActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateTimelogStatuses.mockResolvedValue([]);
  });

  it('requires a trimmed note before returning one or more pending COO reports', async () => {
    render(<Harness timelogs={[pendingCooTimelog(4), pendingCooTimelog(7)]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Vrátit' }));
    const dialog = screen.getByRole('dialog', { name: 'Vrátit výkazy k opravě' });
    fireEvent.change(screen.getByLabelText('Důvod vrácení'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Vrátit výkazy' }));

    expect(updateTimelogStatuses).not.toHaveBeenCalled();
    expect(screen.getByText('Napiš prosím důvod vrácení.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Důvod vrácení'), { target: { value: '  Opravit přestávku.  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Vrátit výkazy' }));

    await waitFor(() => {
      expect(updateTimelogStatuses).toHaveBeenCalledWith([4, 7], 'rej', {
        currentProfileId: 'profile-coo',
        note: 'Opravit přestávku.',
      });
    });
    expect(dialog).not.toBeInTheDocument();
  });

  it('cancels the returned-hours dialog without mutating', () => {
    render(<Harness timelogs={[pendingCooTimelog(4)]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Vrátit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Zrušit' }));

    expect(screen.queryByRole('dialog', { name: 'Vrátit výkaz k opravě' })).not.toBeInTheDocument();
    expect(updateTimelogStatuses).not.toHaveBeenCalled();
  });

  it('keeps the dialog open with pending and error feedback, then closes it on success', async () => {
    let rejectRequest: ((error: Error) => void) | undefined;
    updateTimelogStatuses.mockImplementationOnce(() => new Promise((_, reject) => {
      rejectRequest = reject;
    }));
    const onSuccess = vi.fn();
    render(<Harness timelogs={[pendingCooTimelog(4)]} onSuccess={onSuccess} />);

    fireEvent.click(screen.getByRole('button', { name: 'Vrátit' }));
    fireEvent.change(screen.getByLabelText('Důvod vrácení'), { target: { value: 'Chybí pauza.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Vrátit výkaz' }));

    expect(screen.getByTestId('pending')).toHaveTextContent('true');
    expect(screen.getByRole('button', { name: 'Vracím…' })).toBeDisabled();

    await act(async () => {
      rejectRequest?.(new Error('Síť není dostupná.'));
    });

    expect(screen.getByRole('dialog', { name: 'Vrátit výkaz k opravě' })).toBeInTheDocument();
    expect(screen.getByText('Síť není dostupná.')).toBeInTheDocument();
    expect(screen.getByTestId('pending')).toHaveTextContent('false');

    updateTimelogStatuses.mockResolvedValueOnce([]);
    fireEvent.click(screen.getByRole('button', { name: 'Vrátit výkaz' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Vrátit výkaz k opravě' })).not.toBeInTheDocument();
    });
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('bypasses the note dialog for CH rejection and routes approvals through the central service', async () => {
    const { unmount } = render(<Harness timelogs={[pendingChTimelog(3)]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Vrátit' }));

    await waitFor(() => {
      expect(updateTimelogStatuses).toHaveBeenCalledWith([3], 'rej', {
        currentProfileId: 'profile-coo',
      });
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    unmount();
    vi.clearAllMocks();
    render(<Harness timelogs={[pendingCooTimelog(9)]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Schválit' }));

    await waitFor(() => {
      expect(updateTimelogStatuses).toHaveBeenCalledWith([9], 'coo', {
        currentProfileId: 'profile-coo',
      });
    });
  });

  it('does not write state or call onSuccess after unmount while a request is pending', async () => {
    let resolveRequest: (() => void) | undefined;
    updateTimelogStatuses.mockImplementationOnce(() => new Promise<void>((resolve) => {
      resolveRequest = resolve;
    }));
    const onSuccess = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { unmount } = render(<Harness timelogs={[pendingChTimelog(3)]} onSuccess={onSuccess} />);

    fireEvent.click(screen.getByRole('button', { name: 'Vrátit' }));
    unmount();
    await act(async () => {
      resolveRequest?.();
    });

    expect(onSuccess).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
