import React, { useState } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event } from '../../types';

const maplibre = vi.hoisted(() => ({ Map: vi.fn(), Marker: vi.fn(), NavigationControl: vi.fn() }));
type MockMap = { center: { lat: number; lng: number }; handlers: Record<string, () => void>; on: ReturnType<typeof vi.fn>; getContainer: ReturnType<typeof vi.fn>; jumpTo: ReturnType<typeof vi.fn> };
const maps: MockMap[] = [];
const saveEvent = vi.fn(async (event: Event) => event);

vi.mock('maplibre-gl', () => {
  maplibre.Map.mockImplementation(function Map({ center, container }: { center: [number, number]; container: HTMLDivElement }) {
    const handlers: Record<string, () => void> = {};
    const attribution = document.createElement('details');
    attribution.className = 'maplibregl-ctrl-attrib';
    const link = document.createElement('a');
    link.href = 'https://openfreemap.org';
    link.textContent = 'OpenFreeMap';
    attribution.append(link);
    container.append(attribution);
    const map: MockMap = {
      center: { lat: center[1], lng: center[0] }, handlers,
      on: vi.fn((name: string, callback: () => void) => { handlers[name] = callback; }),
      getContainer: vi.fn(() => container), jumpTo: vi.fn(),
    };
    maps.push(map);
    return { ...map, addControl: vi.fn(), getCenter: () => map.center, remove: vi.fn(), resize: vi.fn(), triggerRepaint: vi.fn() };
  });
  maplibre.Marker.mockImplementation(function Marker() { return { setLngLat: vi.fn().mockReturnThis(), addTo: vi.fn().mockReturnThis(), remove: vi.fn() }; });
  maplibre.NavigationControl.mockImplementation(function NavigationControl() { return {}; });
  return { ...maplibre, default: maplibre };
});
vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}));
vi.mock('../../features/events/services/events.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../features/events/services/events.service')>();
  return { ...actual, getEventById: () => null, getEventContactOptions: async () => [], getEventFormOptions: () => ({ projects: [], clients: [] }), saveEvent: (event: Event) => saveEvent(event) };
});
vi.mock('../../features/events/services/event-geocoding.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../features/events/services/event-geocoding.service')>();
  return { ...actual, searchFreeEventLocations: async () => [] };
});
vi.mock('../../lib/app-config', () => ({ appDataSource: 'local' }));
vi.mock('../../lib/supabase', () => ({ isSupabaseConfigured: false, supabase: null }));

import EventEditModal from './EventEditModal';

const fixture: Event = { id: 1, supabaseId: 'map-test', name: 'Festival', job: 'JOB1', client: 'Klient', startDate: '2026-09-23', endDate: '2026-09-23', startTime: '08:00', endTime: '17:00', city: 'Praha', address: 'Praha', locationLat: 50.0929, locationLng: 14.4502, needed: 2, filled: 0, status: 'upcoming', scheduleVersion: 2, contactPerson: 'Anna' };
const Host = ({ initial = fixture, onDraft = vi.fn() }: { initial?: Event; onDraft?: (draft: Event) => void }) => {
  const [draft, setDraft] = useState<Event | null>(initial);
  return <EventEditModal editingEvent={draft} onChange={(next) => { setDraft(next); if (next) onDraft(next); }} onClose={() => setDraft(null)} />;
};

describe('event form map preview', () => {
  beforeEach(() => { vi.clearAllMocks(); maps.length = 0; saveEvent.mockImplementation(async (event) => event); });

  it('locks saved coordinates and opens the picker from an accessible preview button', async () => {
    const onDraft = vi.fn();
    render(<Host onDraft={onDraft} />);
    expect(maplibre.Map).toHaveBeenCalledWith(expect.objectContaining({ center: [14.4502, 50.0929], interactive: false }));
    expect(maps[0].on).not.toHaveBeenCalledWith('moveend', expect.any(Function));
    expect(maplibre.Marker).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Vybrat na mapě' })).toBeInTheDocument();
    const opener = screen.getByRole('button', { name: 'Upravit polohu' });
    expect(opener).toHaveAttribute('aria-haspopup', 'dialog');
    expect(opener).toHaveAttribute('type', 'button');
    expect(screen.getByRole('link', { name: 'OpenFreeMap' })).toBeInTheDocument();
    expect(opener.contains(screen.getByRole('link', { name: 'OpenFreeMap' }))).toBe(false);
    fireEvent.wheel(opener, { deltaY: 120 });
    expect(onDraft).not.toHaveBeenCalled();
    act(() => opener.focus());
    fireEvent.click(opener);
    expect(screen.getByRole('dialog', { name: 'Vybrat polohu' })).toBeInTheDocument();
    expect(maplibre.Map).toHaveBeenLastCalledWith(expect.objectContaining({ center: [14.4502, 50.0929], interactive: true }));
    await screen.findByRole('button', { name: 'Potvrdit polohu' });
  });

  it.each(['Zrušit', 'Zavřít výběr polohy', 'Escape'])('preserves coordinates and returns focus after %s', async (method) => {
    const onDraft = vi.fn();
    render(<Host onDraft={onDraft} />);
    const opener = screen.getByRole('button', { name: 'Upravit polohu' });
    act(() => opener.focus());
    fireEvent.click(opener);
    const picker = screen.getByRole('dialog', { name: 'Vybrat polohu' });
    act(() => { maps[1].center = { lat: 49.1951234, lng: 16.6068767 }; maps[1].handlers.moveend(); });
    if (method === 'Escape') fireEvent.keyDown(picker, { key: 'Escape' });
    else fireEvent.click(within(picker).getByRole('button', { name: method }));
    await waitFor(() => expect(opener).toHaveFocus());
    expect(onDraft).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Nová akce' })).toBeInTheDocument();
    expect(maplibre.Map).toHaveBeenCalledTimes(2);
  });

  it('updates the form only on confirmation and keeps the confirmed preview locked', async () => {
    const onDraft = vi.fn();
    render(<Host onDraft={onDraft} />);
    const opener = screen.getByRole('button', { name: 'Upravit polohu' });
    fireEvent.click(opener);
    act(() => { maps[1].center = { lat: 49.1951234, lng: 16.6068767 }; maps[1].handlers.moveend(); });
    expect(onDraft).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Potvrdit polohu' }));
    expect(onDraft).toHaveBeenCalledWith(expect.objectContaining({ locationLat: 49.195123, locationLng: 16.606877 }));
    await waitFor(() => expect(opener).toHaveFocus());
    expect(maps[0].jumpTo).toHaveBeenCalledWith({ center: [16.606877, 49.195123], zoom: 15 });
  });

  it('locks the preview created through the existing map button', async () => {
    const onDraft = vi.fn();
    render(<Host initial={{ ...fixture, locationLat: null, locationLng: null }} onDraft={onDraft} />);
    expect(screen.queryByRole('button', { name: 'Upravit polohu' })).not.toBeInTheDocument();
    const opener = screen.getByRole('button', { name: 'Vybrat na mapě' });
    fireEvent.click(opener);
    expect(maplibre.Map).toHaveBeenCalledWith(expect.objectContaining({ interactive: true }));
    act(() => { maps[0].center = { lat: 49.1951234, lng: 16.6068767 }; maps[0].handlers.moveend(); });
    fireEvent.click(screen.getByRole('button', { name: 'Potvrdit polohu' }));
    expect(onDraft).toHaveBeenCalledWith(expect.objectContaining({ locationLat: 49.195123, locationLng: 16.606877 }));
    expect(screen.getByRole('button', { name: 'Upravit polohu' })).toBeInTheDocument();
    expect(maplibre.Map).toHaveBeenLastCalledWith(expect.objectContaining({ interactive: false }));
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('disables the preview edit action during saving', async () => {
    let completeSave: (() => void) | undefined;
    saveEvent.mockImplementation((event) => new Promise<Event>((resolve) => { completeSave = () => resolve(event); }));
    render(<Host />);
    const edit = screen.getByRole('button', { name: 'Upravit polohu' });
    fireEvent.click(screen.getByRole('button', { name: 'Vytvořit akci' }));
    await waitFor(() => expect(saveEvent).toHaveBeenCalledOnce());
    expect(edit).toBeDisabled();
    fireEvent.click(edit);
    expect(screen.queryByRole('dialog', { name: 'Vybrat polohu' })).not.toBeInTheDocument();
    await act(async () => { completeSave?.(fixture); });
  });
});
