import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CrewView from './CrewView';

const mocks = vi.hoisted(() => ({ crew: vi.fn(), create: vi.fn(), update: vi.fn(), invite: vi.fn() }));
vi.mock('../features/onboarding/services/invitations.service', () => ({ createCrewInvitation: mocks.invite }));
vi.mock('../context/useAppContext', () => ({ useAppContext: () => ({ role: 'coo', selectedContractorProfileId: null, searchQuery: '', setSelectedContractorProfileId: vi.fn(), setDeleteConfirm: vi.fn() }) }));
vi.mock('../features/crew/services/crew.service', () => ({ getCrew: mocks.crew, createCrew: mocks.create, updateCrew: mocks.update, subscribeToCrewChanges: () => () => {} }));
vi.mock('../features/crew/services/crew-ratings.service', () => ({ upsertCrewRating: vi.fn() }));
vi.mock('../features/crew/useCrewActivity', () => ({ useCrewActivity: () => ({ data: {}, status: 'ready' }) }));
vi.mock('./CrewDetailView', () => ({ default: () => null }));
vi.mock('./CrewShiftCalendarView', () => ({ default: () => null }));
vi.mock('framer-motion', () => ({ AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>, motion: { div: ({ children }: { children: React.ReactNode }) => <div>{children}</div> } }));
const person = { id: 1, name: 'Jana Nová', ii: 'JN', bg: '#fff', fg: '#000', tags: [], events: 0, rate: 425, phone: '', email: '', ico: '', dic: '', bank: '', city: '', reliable: false, rating: null, note: '' };

describe('crew member real form names and rates', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.crew.mockReturnValue([]); mocks.create.mockImplementation(async (value) => value); mocks.update.mockImplementation(async (value) => value); });
  it('keeps surname-first typing in its field and saves both names at 250 Kč/h without an invitation', async () => {
    render(<CrewView />); fireEvent.click(screen.getByRole('button', { name: 'Nový člen' }));
    // The existing form has a single rate spinbutton before its rating spinbutton.
    expect(screen.getAllByRole('spinbutton')[0]).toHaveValue(250);
    const firstName = screen.getByRole('textbox', { name: 'Jméno', exact: true });
    const lastName = screen.getByRole('textbox', { name: 'Příjmení', exact: true });
    expect(firstName).toHaveAttribute('autocomplete', 'given-name');
    expect(lastName).toHaveAttribute('autocomplete', 'family-name');
    fireEvent.change(lastName, { target: { value: 'van der Berg' } });
    expect(firstName).toHaveValue('');
    expect(lastName).toHaveValue('van der Berg');
    fireEvent.change(firstName, { target: { value: 'Anna Marie' } });
    expect(lastName).toHaveValue('van der Berg');
    fireEvent.click(screen.getByRole('button', { name: 'Ulozit clena' }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Anna Marie van der Berg', firstName: 'Anna Marie', lastName: 'van der Berg', rate: 250 })));
    expect(mocks.invite).not.toHaveBeenCalled();
  });
  it.each([425, 0])('preserves existing rate %s when editing and saving another field', async (rate) => {
    mocks.crew.mockReturnValue([{ ...person, rate }]); render(<CrewView />);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Možnosti pro Jana Nová' }), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Upravit profil' }));
    expect(screen.getAllByRole('spinbutton')[0]).toHaveValue(rate);
    expect(screen.getByRole('textbox', { name: 'Jméno', exact: true })).toHaveValue('Jana');
    expect(screen.getByRole('textbox', { name: 'Příjmení', exact: true })).toHaveValue('Nová');
    fireEvent.change(screen.getByPlaceholderText('Praha'), { target: { value: 'Brno' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ulozit clena' }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ name: 'Jana Nová', city: 'Brno', rate })));
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('preserves structured compound names when another field is edited', async () => {
    mocks.crew.mockReturnValue([{ ...person, name: 'Anna Marie van der Berg', firstName: 'Anna Marie', lastName: 'van der Berg' }]);
    render(<CrewView />);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Možnosti pro Anna Marie van der Berg' }), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Upravit profil' }));
    expect(screen.getByRole('textbox', { name: 'Jméno', exact: true })).toHaveValue('Anna Marie');
    expect(screen.getByRole('textbox', { name: 'Příjmení', exact: true })).toHaveValue('van der Berg');
    fireEvent.change(screen.getByPlaceholderText('Praha'), { target: { value: 'Brno' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ulozit clena' }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ name: 'Anna Marie van der Berg', firstName: 'Anna Marie', lastName: 'van der Berg', city: 'Brno' })));
  });

  it.each([
    { label: 'Jméno', firstName: '', lastName: 'van der Berg', name: 'van der Berg' },
    { label: 'Příjmení', firstName: 'Anna Marie', lastName: '', name: 'Anna Marie' },
  ])('keeps the other component in place when $label is cleared', async ({ label, firstName, lastName, name }) => {
    mocks.crew.mockReturnValue([{ ...person, name: 'Anna Marie van der Berg', firstName: 'Anna Marie', lastName: 'van der Berg' }]);
    render(<CrewView />);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Možnosti pro Anna Marie van der Berg' }), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Upravit profil' }));
    fireEvent.change(screen.getByRole('textbox', { name: label, exact: true }), { target: { value: '' } });
    expect(screen.getByRole('textbox', { name: 'Jméno', exact: true })).toHaveValue(firstName);
    expect(screen.getByRole('textbox', { name: 'Příjmení', exact: true })).toHaveValue(lastName);
    fireEvent.click(screen.getByRole('button', { name: 'Ulozit clena' }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ firstName, lastName, name })));
  });
});
