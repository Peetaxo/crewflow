import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Event } from '../../../types';
import EventListCard, { type EventCardSelection } from './EventListCard';

const event = { id: 21, name: 'Vícedenní', job: 'JOB', startDate: '2026-10-11', endDate: '2026-10-13', needed: 2, filled: 1, status: 'upcoming', client: 'Klient' } as Event;
const detail = { timelogs: [], crewAssignments: [{ eventId: 21, contractorProfileId: 'petr', name: 'Petr' }], applications: [], contractors: [] };
const occurrence = { event, date: '2026-10-12', kind: 'continuation' as const, dayCount: 3, dayIndex: 2 };
function setup(selection?: EventCardSelection) {
  const props = { occurrence, role: 'crewhead' as const, canManageEvents: true, detail, onOpen: vi.fn(), onCopy: vi.fn(), onDelete: vi.fn(), onProfile: vi.fn(), selection };
  return { ...render(<EventListCard {...props} />), props };
}
describe('EventListCard', () => {
  it('keeps the normal card presentation and independent action handlers', () => {
    const { props } = setup(); const card = screen.getByTestId('event-list-card');
    expect(card).toHaveAttribute('data-event-multiday', 'true'); expect(screen.getByTestId('event-list-accent')).toBeInTheDocument(); expect(screen.getByText('3 dny')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Petr' })); expect(props.onProfile).toHaveBeenCalledWith('petr'); expect(props.onOpen).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTitle('Smazat akci')); expect(props.onDelete).toHaveBeenCalledWith(event);
    fireEvent.click(screen.getByRole('button', { name: 'Kopirovat akci na jiny den' })); expect(props.onCopy).toHaveBeenCalledWith(event);
    fireEvent.keyDown(card, { key: 'Enter' }); expect(props.onOpen).toHaveBeenCalledOnce();
  });
  it('uses one checkbox interaction and text crew chips while selecting', () => {
    const selection = { checked: true, disabled: false, reason: null, onToggle: vi.fn() }; const { props } = setup(selection);
    const card = screen.getByRole('checkbox', { name: 'Vícedenní · JOB · 2026-10-12' }); expect(card).toBeChecked(); expect(card).toHaveClass('nodu-workflow-card--checked');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Petr')); expect(selection.onToggle).toHaveBeenCalledOnce();
    fireEvent.keyDown(card, { key: ' ' }); expect(selection.onToggle).toHaveBeenCalledTimes(2);
    expect(props.onOpen).not.toHaveBeenCalled(); expect(props.onProfile).not.toHaveBeenCalled();
  });
  it('explains and prevents a blocked card toggle', () => {
    const selection = { checked: false, disabled: true, reason: 'Schvalování už začalo.', onToggle: vi.fn() }; setup(selection);
    const card = screen.getByRole('checkbox'); expect(card).toHaveAttribute('aria-disabled', 'true'); expect(card).toHaveAccessibleDescription('Schvalování už začalo.');
    fireEvent.click(card); fireEvent.keyDown(card, { key: 'Enter' }); expect(selection.onToggle).not.toHaveBeenCalled();
  });
});
