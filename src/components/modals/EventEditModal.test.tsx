import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
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
});
