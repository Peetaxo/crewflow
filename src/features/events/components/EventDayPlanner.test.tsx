import React, { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import EventDayPlanner from './EventDayPlanner';
import type { EventFormPlan } from '../services/event-form-state';

const dates = ['2026-09-24', '2026-09-23'];
const Host = ({ initial = {} }: { initial?: EventFormPlan }) => {
  const [plan, setPlan] = useState(initial);
  return <><EventDayPlanner dates={dates} plan={plan} onChange={setPlan} /><output data-testid="plan">{JSON.stringify(plan)}</output></>;
};

describe('EventDayPlanner', () => {
  it('orders Czech calendar days and treats missing days as unknown', () => {
    render(<Host />);
    expect(screen.getAllByRole('group').map((group) => group.getAttribute('aria-label'))).toEqual(['středa 23. 9. 2026', 'čtvrtek 24. 9. 2026']);
    expect(screen.getAllByRole('combobox').map((select) => (select as HTMLSelectElement).value)).toEqual(['', '']);
    expect(screen.getAllByRole('option', { name: 'Zatím neurčeno' })).toHaveLength(2);
    expect(screen.queryByLabelText('Od')).not.toBeInTheDocument();
  });

  it('adds one blank phase, reveals empty clocks and allows repeated phases and overnight times', () => {
    render(<Host />);
    const day = within(screen.getAllByRole('group')[0]);
    fireEvent.change(day.getByRole('combobox'), { target: { value: 'instal' } });
    fireEvent.click(day.getByRole('button', { name: 'Doplnit časy' }));
    expect(day.getByLabelText('Od')).toHaveValue('');
    expect(day.getByLabelText('Do')).toHaveValue('');
    fireEvent.change(day.getByLabelText('Od'), { target: { value: '22:00' } });
    fireEvent.change(day.getByLabelText('Do'), { target: { value: '02:00' } });
    expect(day.getByText('Konec následující den')).toBeInTheDocument();
    fireEvent.click(day.getByRole('button', { name: 'Přidat další fázi' }));
    expect(day.getAllByRole('combobox')).toHaveLength(2);
    fireEvent.change(day.getAllByRole('combobox')[1], { target: { value: 'instal' } });
    expect(JSON.parse(screen.getByTestId('plan').textContent!)['2026-09-23'].phases).toMatchObject([
      { type: 'instal', from: '22:00', to: '02:00' },
      { type: 'instal', from: '', to: '', showTimes: false },
    ]);
  });

  it('retains phases while a day is free and restores them when choosing a phase again', () => {
    render(<Host initial={{ '2026-09-23': { free: false, phases: [{ id: 'old', type: 'pripravy', from: '09:00', to: '10:00', showTimes: true }] } }} />);
    const day = within(screen.getAllByRole('group')[0]);
    expect(day.getByRole('option', { name: 'Přípravy' })).toBeInTheDocument();
    fireEvent.change(day.getByRole('combobox'), { target: { value: 'free' } });
    expect(day.queryByLabelText('Od')).not.toBeInTheDocument();
    expect(day.queryByRole('button', { name: 'Přidat další fázi' })).not.toBeInTheDocument();
    fireEvent.change(day.getByRole('combobox'), { target: { value: 'pripravy' } });
    expect(day.getByLabelText('Od')).toHaveValue('09:00');
    fireEvent.click(day.getByRole('button', { name: 'Odebrat fázi 1' }));
    expect(day.getByRole('combobox')).toHaveValue('');
  });

  it('makes the entire day unknown when switching from a free day with several cached phases', () => {
    render(<Host initial={{ '2026-09-23': { free: true, phases: [
      { id: 'one', type: 'instal', from: '', to: '', showTimes: false },
      { id: 'two', type: 'provoz', from: '', to: '', showTimes: false },
    ] } }} />);
    const day = within(screen.getAllByRole('group')[0]);
    fireEvent.change(day.getByRole('combobox'), { target: { value: '' } });
    expect(day.getByRole('combobox')).toHaveValue('');
    expect(JSON.parse(screen.getByTestId('plan').textContent!)['2026-09-23']).toEqual({ free: false, phases: [] });
  });
});
