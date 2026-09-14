import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event, Project, Timelog } from '../../types';
import type { BillingScope, BillingSnapshot } from './billing-groups.model';
import { billingEvents } from './billing-groups.fixtures';
import EventBillingSection, { BillingGroupSummary } from './EventBillingSection';

const boundary = vi.hoisted(() => ({
  value: null as ReturnType<typeof billingValue> | null,
}));

vi.mock('./useBillingGroups', () => ({
  useBillingGroups: () => boundary.value,
}));

const projects: Project[] = [
  { id: 'A', supabaseId: 'pa', name: 'Projekt A', client: 'Klient', createdAt: '2026-01-01' },
  { id: 'B', supabaseId: 'pb', name: 'Projekt B', client: 'Klient', createdAt: '2026-01-01' },
];

const localScope: BillingScope = { source: 'local', userId: 'user-1', profileId: 'profile-1', role: 'crewhead' };
const snapshot: BillingSnapshot = { revision: 2, groups: [{ id: 'festival', name: 'Festival', eventIds: ['local:1', 'local:2'] }] };

function timelog(id: number, eid: number, contractorProfileId: string): Timelog {
  return {
    id,
    eid,
    contractorProfileId,
    days: [{ d: '2026-09-03', f: '08:00', t: '12:00', type: 'pripravy' }],
    km: 0,
    note: '',
    status: id === 1 ? 'draft' : id === 2 ? 'approved' : 'paid',
  };
}

function billingValue(overrides: Partial<{
  scope: BillingScope;
  scopeKey: string;
  ready: boolean;
  data: { snapshot: BillingSnapshot; events: Event[]; timelogs: Timelog[]; projects: Project[] } | undefined;
  isPending: boolean;
  isError: boolean;
  reload: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
}> = {}) {
  const scope = overrides.scope ?? localScope;
  return {
    scope,
    scopeKey: overrides.scopeKey ?? JSON.stringify(['billing-groups', scope.source, scope.userId, scope.profileId, scope.role]),
    ready: overrides.ready ?? true,
    query: {
      data: overrides.data ?? { snapshot, events: billingEvents, timelogs: [], projects },
      isPending: overrides.isPending ?? false,
      isError: overrides.isError ?? false,
    },
    reload: overrides.reload ?? vi.fn().mockResolvedValue({ isSuccess: true }),
    save: overrides.save ?? vi.fn().mockResolvedValue(undefined),
  };
}

describe('BillingGroupSummary', () => {
  it('shows a crew member only their own available local timelog in the grouped event', () => {
    render(
      <BillingGroupSummary
        scope={{ ...localScope, role: 'crew' }}
        group={{ id: 'festival', name: 'Festival', eventIds: ['local:1'] }}
        events={billingEvents}
        timelogs={[timelog(1, 1, 'profile-1'), timelog(2, 1, 'profile-2'), timelog(3, 2, 'profile-1')]}
      />,
    );

    expect(screen.getByText('Festival')).toBeInTheDocument();
    expect(screen.getByText(/Nakládka.*2026-09-03.*A/)).toBeInTheDocument();
    expect(screen.getByText('Výkaz #1 · 4 h')).toBeInTheDocument();
    expect(screen.queryByText('Výkaz #2 · 4 h')).not.toBeInTheDocument();
    expect(screen.queryByText('Výkaz #3 · 4 h')).not.toBeInTheDocument();
    expect(screen.queryByText(/Instal/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('Zobrazují se pouze vaše dostupné výkazy. Propojení samo nevytváří fakturu.')).toBeInTheDocument();
  });

  it('fails closed for a crew member without a profile', () => {
    render(
      <BillingGroupSummary
        scope={{ ...localScope, role: 'crew', profileId: null }}
        group={{ id: 'festival', name: 'Festival', eventIds: ['local:1'] }}
        events={billingEvents}
        timelogs={[timelog(1, 1, 'profile-1')]}
      />,
    );

    expect(screen.getByText(/Nakládka/)).toBeInTheDocument();
    expect(screen.queryByText(/Výkaz #1/)).not.toBeInTheDocument();
  });

  it('matches crew remote timelogs by event UUID only', () => {
    const remoteEvents = billingEvents.map((event, index) => ({ ...event, supabaseId: index === 0 ? 'event-uuid-1' : undefined }));
    render(
      <BillingGroupSummary
        scope={{ source: 'supabase', userId: 'user-1', profileId: 'profile-1', role: 'crew' }}
        group={{ id: 'remote', name: 'Remote', eventIds: ['event-uuid-1', 'missing-uuid'] }}
        events={remoteEvents}
        timelogs={[{ ...timelog(4, 1, 'profile-1'), eventSupabaseId: 'wrong-uuid' }, { ...timelog(5, 99, 'profile-1'), eventSupabaseId: 'event-uuid-1' }]}
      />,
    );

    expect(screen.getByText(/Nakládka/)).toBeInTheDocument();
    expect(screen.queryByText(/Výkaz #4/)).not.toBeInTheDocument();
    expect(screen.getByText('Výkaz #5 · 4 h')).toBeInTheDocument();
    expect(screen.queryByText(/missing-uuid/)).not.toBeInTheDocument();
  });
});

describe('EventBillingSection', () => {
  beforeEach(() => { boundary.value = billingValue(); });
  afterEach(() => { boundary.value = null; vi.clearAllMocks(); });

  it('shows loading, retryable error, and the manager standalone state', async () => {
    boundary.value = billingValue({ isPending: true });
    const view = render(<EventBillingSection event={billingEvents[0]} />);
    expect(screen.getByRole('status')).toHaveTextContent('Načítání společné fakturace…');

    const reload = vi.fn().mockRejectedValue(new Error('offline'));
    boundary.value = billingValue({ data: undefined, isError: true, reload });
    view.rerender(<EventBillingSection event={billingEvents[0]} />);
    expect(screen.getByText('Společnou fakturaci nelze načíst. Akce zůstává dostupná.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Zkusit načíst znovu' }));
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));

    boundary.value = billingValue({ data: { snapshot: { revision: 2, groups: [] }, events: billingEvents, timelogs: [], projects } });
    view.rerender(<EventBillingSection event={billingEvents[0]} />);
    expect(screen.getByText('Tato akce se fakturuje samostatně.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nastavit společnou fakturaci' })).toBeInTheDocument();
  });

  it('hides an ungrouped crew section and fails closed for an unidentified remote event', () => {
    boundary.value = billingValue({ scope: { ...localScope, role: 'crew' }, data: { snapshot: { revision: 2, groups: [] }, events: billingEvents, timelogs: [], projects } });
    const view = render(<EventBillingSection event={billingEvents[0]} />);
    expect(screen.queryByLabelText('Společná fakturace')).not.toBeInTheDocument();

    boundary.value = billingValue({ scope: { ...localScope, source: 'supabase' } });
    view.rerender(<EventBillingSection event={{ ...billingEvents[0], supabaseId: undefined }} />);
    expect(screen.queryByLabelText('Společná fakturace')).not.toBeInTheDocument();
  });

  it('opens the real editor and discards its frozen draft after a scope, event, or readiness change', () => {
    const view = render(<EventBillingSection event={billingEvents[0]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Upravit propojení' }));
    fireEvent.change(screen.getByLabelText('Název skupiny'), { target: { value: 'Rozpracováno' } });
    expect(screen.getByDisplayValue('Rozpracováno')).toBeInTheDocument();

    boundary.value = billingValue({ scope: { ...localScope, userId: 'user-2' } });
    view.rerender(<EventBillingSection event={billingEvents[0]} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Upravit propojení' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    view.rerender(<EventBillingSection event={billingEvents[1]} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Upravit propojení' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    boundary.value = billingValue({ scope: { ...localScope, userId: 'user-2' }, ready: false });
    view.rerender(<EventBillingSection event={billingEvents[1]} />);
    expect(screen.queryByLabelText('Společná fakturace')).not.toBeInTheDocument();
    boundary.value = billingValue({ scope: { ...localScope, userId: 'user-2' } });
    view.rerender(<EventBillingSection event={billingEvents[1]} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps an already-open frozen editor through a same-scope refetch error and recovery', () => {
    const view = render(<EventBillingSection event={billingEvents[0]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Upravit propojení' }));
    fireEvent.change(screen.getByLabelText('Název skupiny'), { target: { value: 'Rozpracováno' } });

    boundary.value = billingValue({ isError: true });
    view.rerender(<EventBillingSection event={billingEvents[0]} />);
    expect(screen.getByDisplayValue('Rozpracováno')).toBeInTheDocument();

    boundary.value = billingValue();
    view.rerender(<EventBillingSection event={billingEvents[0]} />);
    expect(screen.getByDisplayValue('Rozpracováno')).toBeInTheDocument();
  });

  it('reopens a conflict editor from successful reload data before the query observer catches up', async () => {
    const initialData = {
      snapshot: { revision: 1, groups: [{ id: 'festival', name: 'Původní Festival', eventIds: ['local:1', 'local:2'] }] },
      events: billingEvents,
      timelogs: [],
      projects,
    };
    const refreshedData = {
      snapshot: { revision: 2, groups: [{ id: 'festival', name: 'Čerstvý Festival', eventIds: ['local:1'] }] },
      events: billingEvents,
      timelogs: [],
      projects,
    };
    const reload = vi.fn().mockResolvedValue({ isSuccess: true, data: refreshedData });
    const { BillingError } = await import('./billing-groups.model');
    const save = vi.fn()
      .mockRejectedValueOnce(new BillingError('conflict', 'Konflikt'))
      .mockResolvedValueOnce(undefined);
    // Keep the observed query data stale to model React Query notifying this component after refetch resolves.
    boundary.value = billingValue({ data: initialData, reload, save });
    render(<EventBillingSection event={billingEvents[0]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Upravit propojení' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Potvrzuji společnou fakturaci přes více projektů' }));
    fireEvent.click(screen.getByRole('button', { name: 'Uložit propojení' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Zahodit výběr a načíst aktuální data' }));

    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByLabelText('Název skupiny')).toHaveValue('Čerstvý Festival'));
    fireEvent.click(screen.getByRole('button', { name: 'Uložit propojení' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[1][0]).toMatchObject({
      expectedRevision: 2,
      name: 'Čerstvý Festival',
      eventIds: ['local:1'],
    });
  });

  it('keeps a conflict editor closed and exposes retry when its reload fails', async () => {
    const reload = vi.fn().mockResolvedValue({ isSuccess: false });
    const { BillingError } = await import('./billing-groups.model');
    boundary.value = billingValue({ reload, save: vi.fn().mockRejectedValue(new BillingError('conflict', 'Konflikt')) });
    const view = render(<EventBillingSection event={billingEvents[0]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Upravit propojení' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Potvrzuji společnou fakturaci přes více projektů' }));
    fireEvent.click(screen.getByRole('button', { name: 'Uložit propojení' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Zahodit výběr a načíst aktuální data' }));

    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    boundary.value = billingValue({ isError: true });
    view.rerender(<EventBillingSection event={billingEvents[0]} />);
    expect(screen.getByRole('button', { name: 'Zkusit načíst znovu' })).toBeInTheDocument();
  });

  it('does not reopen a newer section when an old conflict reload resolves late', async () => {
    const reloadData = {
      snapshot: { revision: 3, groups: [{ id: 'festival', name: 'Pozdní Festival', eventIds: ['local:1'] }] },
      events: billingEvents,
      timelogs: [],
      projects,
    };
    let resolve!: (value: { isSuccess: boolean; data: typeof reloadData }) => void;
    const reload = vi.fn(() => new Promise<{ isSuccess: boolean; data: typeof reloadData }>((nextResolve) => { resolve = nextResolve; }));
    const { BillingError } = await import('./billing-groups.model');
    boundary.value = billingValue({ reload, save: vi.fn().mockRejectedValue(new BillingError('conflict', 'Konflikt')) });
    const view = render(<EventBillingSection event={billingEvents[0]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Upravit propojení' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Potvrzuji společnou fakturaci přes více projektů' }));
    fireEvent.click(screen.getByRole('button', { name: 'Uložit propojení' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Zahodit výběr a načíst aktuální data' }));

    boundary.value = billingValue({ scope: { ...localScope, userId: 'user-2' } });
    view.rerender(<EventBillingSection event={billingEvents[0]} />);
    await act(async () => { resolve({ isSuccess: true, data: reloadData }); });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
