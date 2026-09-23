import React, { useState } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event, EventContactOption } from '../../types';

const fixture: Event = { id: 1, supabaseId: 'draft-a', name: 'Festival', job: 'JOB1', client: 'Klient', startDate: '2026-09-23', endDate: '2026-09-23', startTime: '08:00', endTime: '17:00', city: '', needed: 2, filled: 0, status: 'upcoming', scheduleVersion: 2, contactPerson: 'Historický kontakt', dresscode: 'Černá' };
const options: EventContactOption[] = [
  { profileId: 'coo', name: 'Anna COO', phone: '123', canApproveHours: true },
  { profileId: 'offline', name: 'Petr bez účtu', phone: '456', canApproveHours: false },
];
const saveEvent = vi.fn(async (event: Event) => event);
const getEventContactOptions = vi.fn(async () => options);
const getEventById = vi.fn((_id: unknown): Event | null => null);
vi.mock('../../features/events/services/events.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../features/events/services/events.service')>();
  return { ...actual, getEventContactOptions: () => getEventContactOptions(), getEventById: (id: unknown) => getEventById(id), saveEvent: (event: Event) => saveEvent(event), getEventFormOptions: () => ({ projects: [{ id: 'JOB2', name: 'Nový projekt', client: 'Druhý klient' }], clients: [{ id: 1, name: 'Klient' }, { id: 2, name: 'Druhý klient' }] }) };
});
vi.mock('../../features/events/components/EventMapPreview', () => ({ default: () => <div data-testid="map-preview" /> }));
vi.mock('../../lib/app-config', () => ({ appDataSource: 'local' }));
vi.mock('../../lib/supabase', () => ({ isSupabaseConfigured: false, supabase: null }));
import EventEditModal from './EventEditModal';

const Host = ({ initial = fixture, onClose = vi.fn() }: { initial?: Event; onClose?: () => void }) => {
  const [draft, setDraft] = useState<Event | null>(initial);
  return <EventEditModal editingEvent={draft} onChange={setDraft} onClose={onClose} />;
};
const openPhases = () => {
  fireEvent.click(screen.getByText('Pokročilé nastavení'));
  fireEvent.click(screen.getByLabelText('Rozdělit akci na fáze'));
};

describe('Event form', () => {
  beforeEach(() => { vi.clearAllMocks(); getEventById.mockReturnValue(null); getEventContactOptions.mockResolvedValue(options); saveEvent.mockImplementation(async (event) => event); });

  it('uses a named dialog, visible required contact and optional fields without dresscode or an empty map', async () => {
    render(<Host />);
    expect(screen.getByRole('dialog', { name: 'Nová akce' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vytvořit akci' })).toBeInTheDocument();
    expect(screen.getByLabelText('Kontaktní osoba')).toBeRequired();
    expect(screen.getByLabelText('Popis akce')).toBeVisible();
    expect(screen.getByLabelText('Místo srazu')).toBeVisible();
    expect(screen.queryByLabelText('Dresscode')).not.toBeInTheDocument();
    expect(screen.queryByTestId('map-preview')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Datum akce')).toBeInTheDocument();
    expect(screen.queryByLabelText('Datum konce')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Schvaluje také hodiny')).toBeChecked();
    expect(document.activeElement?.tagName).not.toBe('INPUT');
    await screen.findByRole('option', { name: 'Anna COO' });
  });

  it('looks up canonical UUID alone for create/edit and preserves historical dresscode on save', async () => {
    getEventById.mockReturnValue(fixture);
    render(<Host />);
    expect(screen.getByRole('dialog', { name: 'Upravit akci' })).toBeInTheDocument();
    expect(getEventById).toHaveBeenCalledWith('draft-a');
    fireEvent.click(screen.getByRole('button', { name: 'Uložit akci' }));
    await waitFor(() => expect(saveEvent).toHaveBeenCalledWith(expect.objectContaining({ dresscode: 'Černá', scheduleVersion: 2 })));
  });

  it('autofills project and client while preserving a supplied event name', async () => {
    render(<Host initial={{ ...fixture, name: '', job: '' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Rozbalit projekty' }));
    fireEvent.click(screen.getByRole('button', { name: /JOB2/ }));
    expect(screen.getByLabelText('Název akce')).toHaveValue('Nový projekt');
    expect(screen.getByLabelText('Klient / Firma')).toHaveValue('Druhý klient');
    await screen.findByRole('option', { name: 'Anna COO' });
  });

  it('caches end date and phases across range, global clock and phase toggle changes', async () => {
    render(<Host initial={{ ...fixture, endDate: '2026-09-25' }} />);
    openPhases();
    const day = within(screen.getByRole('group', { name: 'čtvrtek 24. 9. 2026' }));
    fireEvent.change(day.getByRole('combobox'), { target: { value: 'instal' } });
    fireEvent.click(day.getByRole('button', { name: 'Doplnit časy' }));
    fireEvent.change(day.getByLabelText('Od'), { target: { value: '22:00' } });
    fireEvent.change(day.getByLabelText('Do'), { target: { value: '02:00' } });
    fireEvent.click(screen.getByLabelText('Více dní'));
    expect(screen.queryByRole('group', { name: 'čtvrtek 24. 9. 2026' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Začátek'), { target: { value: '10:00' } });
    fireEvent.click(screen.getByLabelText('Více dní'));
    expect(screen.getByLabelText('Datum konce')).toHaveValue('2026-09-25');
    fireEvent.click(screen.getByLabelText('Rozdělit akci na fáze'));
    fireEvent.click(screen.getByLabelText('Rozdělit akci na fáze'));
    const restored = within(screen.getByRole('group', { name: 'čtvrtek 24. 9. 2026' }));
    expect(restored.getByLabelText('Od')).toHaveValue('22:00');
    fireEvent.click(screen.getByRole('button', { name: 'Vytvořit akci' }));
    await waitFor(() => expect(saveEvent).toHaveBeenCalledWith(expect.objectContaining({ phaseSchedules: { instal: [expect.objectContaining({ dates: ['2026-09-24'], from: '22:00', to: '02:00' })] } })));
  });

  it('requires confirmation before discarding saved dates outside the reduced range', async () => {
    render(<Host initial={{ ...fixture, endDate: '2026-09-25', showDayTypes: true, phaseSchedules: { instal: [{ id: 'saved', dates: ['2026-09-25'], from: '', to: '' }] } }} />);
    fireEvent.change(screen.getByLabelText('Datum konce'), { target: { value: '2026-09-24' } });
    fireEvent.click(screen.getByRole('button', { name: 'Vytvořit akci' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('25. 9. 2026');
    fireEvent.click(screen.getByRole('button', { name: 'Pokračovat v úpravách' }));
    expect(saveEvent).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Datum konce'), { target: { value: '2026-09-25' } });
    expect(within(screen.getByRole('group', { name: 'pátek 25. 9. 2026' })).getByRole('combobox')).toHaveValue('instal');
    await screen.findByRole('option', { name: 'Anna COO' });
  });

  it('selects contact snapshots and preserves the separate approver when toggled', async () => {
    render(<Host />);
    await screen.findByRole('option', { name: 'Anna COO' });
    fireEvent.change(screen.getByLabelText('Vybrat kontakt'), { target: { value: 'offline' } });
    expect(screen.getByLabelText('Kontaktní osoba')).toHaveValue('Petr bez účtu');
    expect(screen.getByLabelText('Telefon')).toHaveValue('456');
    expect(screen.getByText('Schvalování bude dostupné po připojení účtu COO.')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Schvaluje také hodiny'));
    fireEvent.change(screen.getByLabelText('Schvalovatel hodin'), { target: { value: 'coo' } });
    fireEvent.click(screen.getByLabelText('Schvaluje také hodiny'));
    fireEvent.click(screen.getByLabelText('Schvaluje také hodiny'));
    expect(screen.getByLabelText('Schvalovatel hodin')).toHaveValue('coo');
    fireEvent.click(screen.getByRole('button', { name: 'Vytvořit akci' }));
    await waitFor(() => expect(saveEvent).toHaveBeenCalledWith(expect.objectContaining({ contactProfileId: 'offline', contactPerson: 'Petr bez účtu', contactPhone: '456', timelogApproverProfileId: 'coo', contactApprovesHours: false })));
  });

  it('shows contact load errors with retry and permits an explicit manual contact', async () => {
    getEventContactOptions.mockRejectedValueOnce(new Error('Kontakty nejsou dostupné.'));
    render(<Host />);
    expect(await screen.findByText('Kontakty nejsou dostupné.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Zkusit znovu' }));
    await screen.findByRole('option', { name: 'Anna COO' });
    fireEvent.change(screen.getByLabelText('Kontaktní osoba'), { target: { value: 'Ručně zadaný kontakt' } });
    fireEvent.click(screen.getByRole('button', { name: 'Vytvořit akci' }));
    await waitFor(() => expect(saveEvent).toHaveBeenCalledWith(expect.objectContaining({ contactProfileId: null, contactPerson: 'Ručně zadaný kontakt' })));
  });

  it('validates required contact and same-day end before persistence', async () => {
    render(<Host initial={{ ...fixture, contactPerson: '', endTime: '07:00' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Vytvořit akci' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Konec akce musí být později než začátek.');
    expect(saveEvent).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Konec'), { target: { value: '09:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Vytvořit akci' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Vyberte nebo doplňte kontaktní osobu.');
    await screen.findByRole('option', { name: 'Anna COO' });
  });

  it('asks before discarding dirty changes on Escape and retains the draft when canceled', async () => {
    const onClose = vi.fn();
    render(<Host onClose={onClose} />);
    fireEvent.change(screen.getByLabelText('Název akce'), { target: { value: 'Upravená akce' } });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.getByRole('alertdialog', { name: 'Zahodit změny?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Pokračovat v úpravách' }));
    expect(screen.getByLabelText('Název akce')).toHaveValue('Upravená akce');
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Zrušit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Zahodit změny' }));
    expect(onClose).toHaveBeenCalledOnce();
    await act(async () => {});
  });

  it('keeps advanced settings expanded when disabling phases', async () => {
    render(<Host initial={{ ...fixture, showDayTypes: true }} />);
    fireEvent.click(screen.getByLabelText('Rozdělit akci na fáze'));
    expect(screen.getByText('Pokročilé nastavení').parentElement).toHaveAttribute('open');
    expect(screen.getByLabelText('Povolit Crew navrhnout čas příchodu a odchodu')).toBeVisible();
    await screen.findByRole('option', { name: 'Anna COO' });
  });

  it('materializes legacy preparation days even when schedules were an empty object', async () => {
    render(<Host initial={{ ...fixture, scheduleVersion: undefined, showDayTypes: true, phaseSchedules: {}, dayTypes: { '2026-09-23': 'pripravy' } }} />);
    const day = within(screen.getByRole('group', { name: 'středa 23. 9. 2026' }));
    expect(day.getByRole('combobox')).toHaveValue('pripravy');
    fireEvent.click(screen.getByRole('button', { name: 'Vytvořit akci' }));
    await waitFor(() => expect(saveEvent).toHaveBeenCalledWith(expect.objectContaining({ scheduleVersion: 2, phaseSchedules: { pripravy: [expect.objectContaining({ dates: ['2026-09-23'] })] } })));
  });

  it('does not replace a cached daily plan when controlled props or global dates change', async () => {
    const onChange = vi.fn();
    const rendered = render(<EventEditModal editingEvent={{ ...fixture, showDayTypes: true }} onChange={onChange} onClose={vi.fn()} />);
    const day = within(screen.getByRole('group', { name: 'středa 23. 9. 2026' }));
    fireEvent.change(day.getByRole('combobox'), { target: { value: 'instal' } });
    rendered.rerender(<EventEditModal editingEvent={{ ...fixture, showDayTypes: true, endDate: '2026-09-24', phaseSchedules: { provoz: [{ id: 'external', dates: ['2026-09-23'], from: '12:00', to: '14:00' }] } }} onChange={onChange} onClose={vi.fn()} />);
    expect(day.getByRole('combobox')).toHaveValue('instal');
    expect(within(screen.getByRole('group', { name: 'čtvrtek 24. 9. 2026' })).getByRole('combobox')).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: 'Vytvořit akci' }));
    await waitFor(() => expect(saveEvent).toHaveBeenCalledWith(expect.objectContaining({ phaseSchedules: { instal: [expect.objectContaining({ dates: ['2026-09-23'], from: '', to: '' })] } })));
  });

  it('resets caches on UUID change even when numeric ID collides, and on closing', async () => {
    const draft = { ...fixture, showDayTypes: true };
    const rendered = render(<EventEditModal editingEvent={draft} onChange={vi.fn()} onClose={vi.fn()} />);
    fireEvent.change(within(screen.getByRole('group', { name: 'středa 23. 9. 2026' })).getByRole('combobox'), { target: { value: 'instal' } });
    rendered.rerender(<EventEditModal editingEvent={{ ...draft, supabaseId: 'draft-b' }} onChange={vi.fn()} onClose={vi.fn()} />);
    expect(within(screen.getByRole('group', { name: 'středa 23. 9. 2026' })).getByRole('combobox')).toHaveValue('');
    rendered.rerender(<EventEditModal editingEvent={null} onChange={vi.fn()} onClose={vi.fn()} />);
    rendered.rerender(<EventEditModal editingEvent={draft} onChange={vi.fn()} onClose={vi.fn()} />);
    expect(within(screen.getByRole('group', { name: 'středa 23. 9. 2026' })).getByRole('combobox')).toHaveValue('');
    expect(saveEvent).not.toHaveBeenCalled();
    await screen.findByRole('option', { name: 'Anna COO' });
  });

  it('persists only active dates after explicit trim confirmation', async () => {
    render(<Host initial={{ ...fixture, endDate: '2026-09-24', showDayTypes: true, phaseSchedules: { instal: [{ id: 'one', dates: ['2026-09-23'], from: '', to: '' }], provoz: [{ id: 'two', dates: ['2026-09-24'], from: '', to: '' }] } }} />);
    fireEvent.click(screen.getByLabelText('Více dní'));
    fireEvent.click(screen.getByRole('button', { name: 'Vytvořit akci' }));
    expect(saveEvent).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Uložit bez těchto dnů' }));
    await waitFor(() => expect(saveEvent).toHaveBeenCalledWith(expect.objectContaining({ phaseSchedules: { instal: [expect.objectContaining({ id: 'one', dates: ['2026-09-23'] })] } })));
  });

  it.each([{ locationLat: NaN, locationLng: 14 }, { locationLat: 91, locationLng: 14 }, { locationLat: 50, locationLng: 181 }, { locationLat: 50, locationLng: null }])('does not render a map preview for invalid coordinates $locationLat $locationLng', async (coordinates) => {
    render(<Host initial={{ ...fixture, ...coordinates }} />);
    expect(screen.queryByTestId('map-preview')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vybrat na mapě' })).toBeInTheDocument();
    await screen.findByRole('option', { name: 'Anna COO' });
  });
});
