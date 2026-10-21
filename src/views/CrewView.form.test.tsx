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

describe('crew member real form rates', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.crew.mockReturnValue([]); mocks.create.mockImplementation(async (value) => value); mocks.update.mockImplementation(async (value) => value); });
  it('opens a new member at 250 Kč/h and saves that value without an invitation', async () => {
    render(<CrewView />); fireEvent.click(screen.getByRole('button', { name: 'Nový člen' }));
    // The existing form has a single rate spinbutton before its rating spinbutton.
    expect(screen.getAllByRole('spinbutton')[0]).toHaveValue(250);
    fireEvent.change(screen.getByPlaceholderText('Jmeno a prijmeni'), { target: { value: 'Nový člověk' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ulozit clena' }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Nový člověk', rate: 250 })));
    expect(mocks.invite).not.toHaveBeenCalled();
  });
  it.each([425, 0])('preserves existing rate %s when editing and saving another field', async (rate) => {
    mocks.crew.mockReturnValue([{ ...person, rate }]); render(<CrewView />);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Možnosti pro Jana Nová' }), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Upravit profil' }));
    expect(screen.getAllByRole('spinbutton')[0]).toHaveValue(rate);
    fireEvent.change(screen.getByPlaceholderText('Jmeno a prijmeni'), { target: { value: 'Jana Upravená' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ulozit clena' }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ name: 'Jana Upravená', rate })));
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
