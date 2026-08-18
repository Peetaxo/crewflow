import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event } from '../../types';

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const event: Event = {
  id: 1,
  name: 'Ploom PopUp - Metropole Zlicin',
  job: 'JTI001',
  startDate: '2026-04-20',
  endDate: '2026-04-20',
  startTime: '20:00',
  endTime: '01:00',
  city: 'Praha',
  needed: 2,
  filled: 2,
  status: 'upcoming',
  client: 'NextLevel s.r.o.',
};

describe('EventEditModal', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('shows the current event client even when client options are not hydrated yet', async () => {
    vi.doMock('../../features/events/services/events.service', () => ({
      applyEventDraft: (nextEvent: Event) => nextEvent,
      createDefaultPhaseTimes: (from: string, to: string) => ({
        instal: { from, to },
        provoz: { from, to },
        deinstal: { from, to },
      }),
      getEventFormOptions: () => ({
        projects: [{ id: 'JTI001', name: 'JTI', client: 'NextLevel s.r.o.' }],
        clients: [],
      }),
      normalizeEventSchedules: () => ({}),
      saveEvent: vi.fn(),
    }));

    const { default: EventEditModal } = await import('./EventEditModal');

    const { container } = render(
      <EventEditModal
        editingEvent={event}
        onClose={vi.fn()}
        onChange={vi.fn()}
      />,
    );

    const clientSelect = container.querySelector('select') as HTMLSelectElement;

    expect(clientSelect.value).toBe('NextLevel s.r.o.');
    expect(screen.getByRole('option', { name: 'NextLevel s.r.o.' })).toBeInTheDocument();
  });

  it('uses Adresa as the event location field and keeps legacy city in sync', async () => {
    vi.doMock('../../features/events/services/events.service', () => ({
      applyEventDraft: (nextEvent: Event) => nextEvent,
      createDefaultPhaseTimes: (from: string, to: string) => ({
        instal: { from, to },
        provoz: { from, to },
        deinstal: { from, to },
      }),
      getEventFormOptions: () => ({
        projects: [{ id: 'JTI001', name: 'JTI', client: 'NextLevel s.r.o.' }],
        clients: [{ id: 1, name: 'NextLevel s.r.o.' }],
      }),
      normalizeEventSchedules: () => ({}),
      saveEvent: vi.fn(),
    }));

    const onChange = vi.fn();
    const { default: EventEditModal } = await import('./EventEditModal');

    render(
      <EventEditModal
        editingEvent={{
          ...event,
          address: 'Rohanske nabrezi 678/23, Praha',
          placeId: 'ChIJ-event-place',
          locationLat: 50.0929,
          locationLng: 14.4502,
        }}
        onClose={vi.fn()}
        onChange={onChange}
      />,
    );

    expect(screen.getByText('Adresa')).toBeInTheDocument();
    expect(screen.queryByText('Mesto')).not.toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue('Rohanske nabrezi 678/23, Praha'), {
      target: { value: 'Roudnice nad Labem' },
    });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      address: 'Roudnice nad Labem',
      city: 'Roudnice nad Labem',
      placeId: undefined,
      locationLat: null,
      locationLng: null,
    }));
  });

  it('rejects a native same-render double click and keeps the draft UUID after failure', async () => {
    const pending = createDeferred<Event>();
    const saveEvent = vi.fn(() => pending.promise);
    const toastError = vi.fn();
    const onClose = vi.fn();
    vi.doMock('sonner', () => ({ toast: { error: toastError } }));
    vi.doMock('../../features/events/services/events.service', () => ({
      applyEventDraft: (nextEvent: Event) => nextEvent,
      createDefaultPhaseTimes: (from: string, to: string) => ({
        instal: { from, to },
        provoz: { from, to },
        deinstal: { from, to },
      }),
      getEventFormOptions: () => ({ projects: [], clients: [] }),
      normalizeEventSchedules: () => ({}),
      saveEvent,
    }));
    const { default: EventEditModal } = await import('./EventEditModal');

    render(
      <EventEditModal
        editingEvent={{ ...event, supabaseId: 'event-client-uuid' }}
        onClose={onClose}
        onChange={vi.fn()}
      />,
    );

    const saveButton = screen.getByRole('button', { name: 'Ulozit akci' });
    const closeButton = screen.getByRole('button', { name: 'Zrusit' });
    act(() => {
      saveButton.click();
      saveButton.click();
    });

    expect(saveEvent).toHaveBeenCalledOnce();
    expect(saveEvent).toHaveBeenCalledWith(expect.objectContaining({
      supabaseId: 'event-client-uuid',
    }));
    expect(saveButton).toBeDisabled();
    expect(closeButton).toBeDisabled();
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => {
      pending.reject(new Error('Akci se nepodařilo uložit.'));
      await Promise.resolve();
    });

    expect(toastError).toHaveBeenCalledWith('Akci se nepodařilo uložit.');
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Ulozit akci' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Zrusit' })).toBeEnabled();
  });

  it('locks every native draft control while saving the current UUID', async () => {
    const pending = createDeferred<Event>();
    const saveEvent = vi.fn(() => pending.promise);
    const onChange = vi.fn();
    const onClose = vi.fn();
    const phaseSchedules = {
      instal: [{ id: 'instal-slot', from: '20:00', to: '01:00', dates: ['2026-04-20'] }],
      provoz: [{ id: 'provoz-slot', from: '20:00', to: '01:00', dates: [] }],
      deinstal: [{ id: 'deinstal-slot', from: '20:00', to: '01:00', dates: [] }],
    };
    vi.doMock('../../features/events/services/events.service', () => ({
      applyEventDraft: (nextEvent: Event) => nextEvent,
      createDefaultPhaseTimes: (from: string, to: string) => ({
        instal: { from, to },
        provoz: { from, to },
        deinstal: { from, to },
      }),
      getEventFormOptions: () => ({ projects: [], clients: [] }),
      normalizeEventSchedules: () => phaseSchedules,
      saveEvent,
    }));
    const { default: EventEditModal } = await import('./EventEditModal');
    const rendered = render(
      <EventEditModal
        editingEvent={{
          ...event,
          supabaseId: 'event-client-uuid',
          showDayTypes: true,
          phaseSchedules,
        }}
        onClose={onClose}
        onChange={onChange}
      />,
    );

    act(() => {
      screen.getByRole('button', { name: 'Ulozit akci' }).click();
    });
    await waitFor(() => expect(saveEvent).toHaveBeenCalledOnce());

    act(() => {
      (rendered.container.querySelector('#allowCrewTimeProposal') as HTMLInputElement).click();
      screen.getAllByRole('button', { name: 'Pridat cas' })[0].click();
    });
    expect(onChange).not.toHaveBeenCalled();

    const nativeControls = Array.from(rendered.container.querySelectorAll(
      'button, input, select, textarea',
    ));
    nativeControls.forEach((control) => expect(control).toBeDisabled());

    await act(async () => {
      pending.resolve({ ...event, supabaseId: 'event-client-uuid' });
      await Promise.resolve();
    });

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('waits for address resolution and saves the resolved draft', async () => {
    const saveEvent = vi.fn(async (nextEvent: Event) => nextEvent);
    const onClose = vi.fn();
    vi.doMock('../../features/events/components/EventAddressField', () => ({
      default: ({ onChange, onResolvingChange }: {
        onChange: (selection: {
          address: string;
          placeId: string;
          locationLat: number;
          locationLng: number;
        }) => void;
        onResolvingChange?: (isResolving: boolean) => void;
      }) => (
        <div>
          <button type="button" onClick={() => onResolvingChange?.(true)}>
            Start address resolution
          </button>
          <button
            type="button"
            onClick={() => {
              onChange({
                address: 'Rohanské nábřeží 678/23, 186 00 Praha 8',
                placeId: 'place-1',
                locationLat: 50.0929,
                locationLng: 14.4502,
              });
              onResolvingChange?.(false);
            }}
          >
            Finish address resolution
          </button>
        </div>
      ),
    }));
    vi.doMock('../../features/events/services/events.service', () => ({
      applyEventDraft: (nextEvent: Event) => nextEvent,
      createDefaultPhaseTimes: (from: string, to: string) => ({
        instal: { from, to },
        provoz: { from, to },
        deinstal: { from, to },
      }),
      getEventFormOptions: () => ({ projects: [], clients: [] }),
      normalizeEventSchedules: () => ({}),
      saveEvent,
    }));
    const { default: EventEditModal } = await import('./EventEditModal');
    const DraftHost = () => {
      const [draft, setDraft] = React.useState<Event>({
        ...event,
        supabaseId: 'event-client-uuid',
        address: 'Roh',
      });
      return <EventEditModal editingEvent={draft} onClose={onClose} onChange={setDraft} />;
    };
    render(<DraftHost />);

    fireEvent.click(screen.getByRole('button', { name: 'Start address resolution' }));
    const saveButton = screen.getByRole('button', { name: 'Ulozit akci' });
    expect(saveButton).toBeDisabled();
    saveButton.click();
    expect(saveEvent).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Finish address resolution' }));
    await waitFor(() => expect(saveButton).toBeEnabled());
    fireEvent.click(saveButton);

    await waitFor(() => expect(saveEvent).toHaveBeenCalledOnce());
    expect(saveEvent).toHaveBeenCalledWith(expect.objectContaining({
      address: 'Rohanské nábřeží 678/23, 186 00 Praha 8',
      city: 'Rohanské nábřeží 678/23, 186 00 Praha 8',
      placeId: 'place-1',
      locationLat: 50.0929,
      locationLng: 14.4502,
    }));
  });

  it('reuses materialized phase schedule IDs across unchanged retries and recomputes after schedule edits', async () => {
    const firstSave = createDeferred<Event>();
    const saveEvent = vi.fn()
      .mockImplementationOnce(() => firstSave.promise)
      .mockRejectedValue(new Error('Akci se nepodařilo uložit.'));
    const toastError = vi.fn();
    vi.doMock('sonner', () => ({ toast: { error: toastError } }));
    vi.doMock('../../lib/app-config', () => ({ appDataSource: 'local' }));
    vi.doMock('../../lib/supabase', () => ({ isSupabaseConfigured: false, supabase: null }));
    vi.doMock('../../features/events/services/events.service', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../../features/events/services/events.service')>();
      return {
        ...actual,
        getEventFormOptions: () => ({ projects: [], clients: [] }),
        saveEvent,
      };
    });
    const { default: EventEditModal } = await import('./EventEditModal');

    const DraftHost = () => {
      const [draft, setDraft] = React.useState<Event>({
        ...event,
        supabaseId: 'event-client-uuid',
        phaseSchedules: undefined,
      });
      return <EventEditModal editingEvent={draft} onClose={vi.fn()} onChange={setDraft} />;
    };
    render(<DraftHost />);

    fireEvent.click(screen.getByRole('button', { name: 'Ulozit akci' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ulozit akci' })).toBeDisabled());
    await act(async () => {
      firstSave.reject(new Error('Akci se nepodařilo uložit.'));
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ulozit akci' })).toBeEnabled());
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Ulozit akci' }));
      await Promise.resolve();
    });

    const firstSchedules = saveEvent.mock.calls[0][0].phaseSchedules;
    const secondSchedules = saveEvent.mock.calls[1][0].phaseSchedules;
    expect(secondSchedules).toEqual(firstSchedules);

    fireEvent.change(screen.getByDisplayValue('20:00'), { target: { value: '21:00' } });
    await waitFor(() => expect(screen.getByDisplayValue('21:00')).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Ulozit akci' }));
      await Promise.resolve();
    });

    const editedSchedules = saveEvent.mock.calls[2][0].phaseSchedules;
    expect(editedSchedules).not.toEqual(secondSchedules);
    expect(editedSchedules?.instal?.[0]).toMatchObject({ from: '21:00' });
  });

  it('does not finish UI work after a pending event save is unmounted', async () => {
    const pending = createDeferred<Event>();
    const saveEvent = vi.fn(() => pending.promise);
    const toastError = vi.fn();
    const onClose = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.doMock('sonner', () => ({ toast: { error: toastError } }));
    vi.doMock('../../features/events/services/events.service', () => ({
      applyEventDraft: (nextEvent: Event) => nextEvent,
      createDefaultPhaseTimes: (from: string, to: string) => ({
        instal: { from, to },
        provoz: { from, to },
        deinstal: { from, to },
      }),
      getEventFormOptions: () => ({ projects: [], clients: [] }),
      normalizeEventSchedules: () => ({}),
      saveEvent,
    }));
    const { default: EventEditModal } = await import('./EventEditModal');
    const rendered = render(
      <EventEditModal
        editingEvent={{ ...event, supabaseId: 'event-client-uuid' }}
        onClose={onClose}
        onChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Ulozit akci' }));
    rendered.unmount();
    await act(async () => {
      pending.reject(new Error('Akci se nepodařilo uložit.'));
      await Promise.resolve();
    });

    expect(toastError).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(consoleError.mock.calls.flat().join(' ')).not.toMatch(/unmounted/i);
    consoleError.mockRestore();
  });

  it('does not let an old save completion close or lock a newer draft UUID', async () => {
    const pending = createDeferred<Event>();
    const saveEvent = vi.fn(() => pending.promise);
    const toastError = vi.fn();
    const onClose = vi.fn();
    vi.doMock('sonner', () => ({ toast: { error: toastError } }));
    vi.doMock('../../features/events/services/events.service', () => ({
      applyEventDraft: (nextEvent: Event) => nextEvent,
      createDefaultPhaseTimes: (from: string, to: string) => ({
        instal: { from, to },
        provoz: { from, to },
        deinstal: { from, to },
      }),
      getEventFormOptions: () => ({ projects: [], clients: [] }),
      normalizeEventSchedules: () => ({}),
      saveEvent,
    }));
    const { default: EventEditModal } = await import('./EventEditModal');
    const rendered = render(
      <EventEditModal
        editingEvent={{ ...event, supabaseId: 'event-client-uuid-a' }}
        onClose={onClose}
        onChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Ulozit akci' }));
    rendered.rerender(
      <EventEditModal
        editingEvent={{ ...event, id: 2, supabaseId: 'event-client-uuid-b' }}
        onClose={onClose}
        onChange={vi.fn()}
      />,
    );
    await act(async () => {
      pending.resolve({ ...event, supabaseId: 'event-client-uuid-a' });
      await Promise.resolve();
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Ulozit akci' })).toBeEnabled();
  });

  it('keeps the committed draft request active when a different UUID render is suspended', async () => {
    const pending = createDeferred<Event>();
    const saveEvent = vi.fn(() => pending.promise);
    const onClose = vi.fn();
    const suspendedRender = new Promise<never>(() => undefined);
    vi.doMock('../../features/events/components/EventAddressField', () => ({
      default: ({ value }: { value: Pick<Event, 'address' | 'city'> }) => {
        if (value.address === 'suspend-render') throw suspendedRender;
        return <input aria-label="Adresa" value={value.address ?? value.city} readOnly />;
      },
    }));
    vi.doMock('../../features/events/services/events.service', () => ({
      applyEventDraft: (nextEvent: Event) => nextEvent,
      createDefaultPhaseTimes: (from: string, to: string) => ({
        instal: { from, to },
        provoz: { from, to },
        deinstal: { from, to },
      }),
      getEventFormOptions: () => ({ projects: [], clients: [] }),
      normalizeEventSchedules: () => ({}),
      saveEvent,
    }));
    const { default: EventEditModal } = await import('./EventEditModal');
    const draftA = { ...event, supabaseId: 'event-client-uuid-a', address: 'draft-a' };
    const rendered = render(
      <React.Suspense fallback={<div>Suspended draft</div>}>
        <EventEditModal editingEvent={draftA} onClose={onClose} onChange={vi.fn()} />
      </React.Suspense>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Ulozit akci' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ulozit akci' })).toBeDisabled());
    await act(async () => {
      rendered.rerender(
        <React.Suspense fallback={<div>Suspended draft</div>}>
          <EventEditModal
            editingEvent={{ ...event, id: 2, supabaseId: 'event-client-uuid-b', address: 'suspend-render' }}
            onClose={onClose}
            onChange={vi.fn()}
          />
        </React.Suspense>,
      );
      await Promise.resolve();
    });
    expect(screen.getByText('Suspended draft')).toBeInTheDocument();

    await act(async () => {
      pending.resolve(draftA);
      await Promise.resolve();
    });
    rendered.rerender(
      <React.Suspense fallback={<div>Suspended draft</div>}>
        <EventEditModal editingEvent={draftA} onClose={onClose} onChange={vi.fn()} />
      </React.Suspense>,
    );

    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Ulozit akci' })).toBeEnabled();
  });

  it('preserves committed schedule IDs when a different UUID render is suspended', async () => {
    const pending = createDeferred<Event>();
    const saveEvent = vi.fn()
      .mockImplementationOnce(() => pending.promise)
      .mockRejectedValue(new Error('Akci se nepodařilo uložit.'));
    const toastError = vi.fn();
    const suspendedRender = new Promise<never>(() => undefined);
    vi.doMock('sonner', () => ({ toast: { error: toastError } }));
    vi.doMock('../../lib/app-config', () => ({ appDataSource: 'local' }));
    vi.doMock('../../lib/supabase', () => ({ isSupabaseConfigured: false, supabase: null }));
    vi.doMock('../../features/events/components/EventAddressField', () => ({
      default: ({ value }: { value: Pick<Event, 'address' | 'city'> }) => {
        if (value.address === 'suspend-render') throw suspendedRender;
        return <input aria-label="Adresa" value={value.address ?? value.city} readOnly />;
      },
    }));
    vi.doMock('../../features/events/services/events.service', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../../features/events/services/events.service')>();
      return {
        ...actual,
        getEventFormOptions: () => ({ projects: [], clients: [] }),
        saveEvent,
      };
    });
    const { default: EventEditModal } = await import('./EventEditModal');
    const draftA = {
      ...event,
      supabaseId: 'event-client-uuid-a',
      address: 'draft-a',
      phaseSchedules: undefined,
    };
    const rendered = render(
      <React.Suspense fallback={<div>Suspended draft</div>}>
        <EventEditModal editingEvent={draftA} onClose={vi.fn()} onChange={vi.fn()} />
      </React.Suspense>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Ulozit akci' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ulozit akci' })).toBeDisabled());
    const firstSchedules = saveEvent.mock.calls[0][0].phaseSchedules;
    await act(async () => {
      rendered.rerender(
        <React.Suspense fallback={<div>Suspended draft</div>}>
          <EventEditModal
            editingEvent={{ ...draftA, id: 2, supabaseId: 'event-client-uuid-b', address: 'suspend-render' }}
            onClose={vi.fn()}
            onChange={vi.fn()}
          />
        </React.Suspense>,
      );
      await Promise.resolve();
    });
    expect(screen.getByText('Suspended draft')).toBeInTheDocument();

    await act(async () => {
      pending.reject(new Error('Akci se nepodařilo uložit.'));
      await Promise.resolve();
    });
    rendered.rerender(
      <React.Suspense fallback={<div>Suspended draft</div>}>
        <EventEditModal editingEvent={draftA} onClose={vi.fn()} onChange={vi.fn()} />
      </React.Suspense>,
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ulozit akci' })).toBeEnabled());
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Ulozit akci' }));
      await Promise.resolve();
    });

    expect(toastError).toHaveBeenCalled();
    expect(saveEvent.mock.calls[1][0].phaseSchedules).toEqual(firstSchedules);
  });
});
