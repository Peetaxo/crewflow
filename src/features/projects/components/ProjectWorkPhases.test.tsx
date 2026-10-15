import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ProjectWorkPhases as WorkPhases } from '../services/project-work-phases';
import ProjectWorkPhases from './ProjectWorkPhases';

const phases = (amounts = [0.34, 0.33, 0.33, 0]): WorkPhases => ({
  phases: (['pripravy', 'instal', 'provoz', 'deinstal'] as const).map((type, index) => ({ type, hours: index === 0 ? 0.5 : 1, amount: amounts[index] })),
  unallocated: { hours: 0, amount: 0 }, hasInvoicedAllocation: false, hasUnallocatedInvoiceCosts: false,
});

describe('ProjectWorkPhases', () => {
  it('keeps cent precision and readable Czech hours in four always visible rows', () => {
    render(<ProjectWorkPhases workPhases={phases()} total={1} isPriceIncomplete={false} />);
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(4);
    expect(rows[0]).toHaveTextContent('Přípravy0,5 h0,34 Kč');
    expect(rows[1]).toHaveTextContent('Instal1 h0,33 Kč');
    expect(screen.queryByText('Nerozřazeno')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows an unallocated price with a dash for hours already counted in phase rows', () => {
    const data = phases([0, 0, 0, 0]);
    data.unallocated.amount = 100;
    data.hasUnallocatedInvoiceCosts = true;
    render(<ProjectWorkPhases workPhases={data} total={100} isPriceIncomplete={false} />);
    expect(screen.getByText('Nerozřazeno').closest('li')).toHaveTextContent('Nerozřazeno—100 Kč');
    expect(screen.getByText(/U některých faktur chybí úplné a jednoznačné propojení/)).toBeInTheDocument();
  });

  it('explains a known amount that cannot safely be partitioned into phase prices', () => {
    const data = phases([0, 0, 0, 0]);
    data.unallocated.amount = 1e16;
    render(<ProjectWorkPhases workPhases={data} total={1e16} isPriceIncomplete={false} />);
    expect(screen.getByText('Cenu části práce nelze spolehlivě rozdělit podle fází.')).toBeInTheDocument();
  });

  it('identifies incomplete known prices while retaining actual hours and unknown-phase hours', () => {
    const data = phases([0, 0, 0, 0]);
    data.unallocated.hours = 1.25;
    render(<ProjectWorkPhases workPhases={data} total={0} isPriceIncomplete />);
    expect(screen.getByText('Známá cena práce')).toBeInTheDocument();
    expect(screen.getByText(/Cena práce je neúplná/)).toBeInTheDocument();
    expect(screen.getByText('Nerozřazeno').closest('li')).toHaveTextContent('1,25 h');
    expect(screen.getByText(/Část vykázaných hodin nemá podporovanou fázi/)).toBeInTheDocument();
  });

  it.each([
    { total: 0, amounts: [0, 0, 0, 0] },
    { total: -1, amounts: [-1, 0, 0, 0] },
    { total: 1, amounts: [-1, 2, 0, 0] },
    { total: 5, amounts: [1, 1, 1, 1] },
    { total: Number.NaN, amounts: [Number.NaN, 0, 0, 0] },
    { total: Number.POSITIVE_INFINITY, amounts: [Number.POSITIVE_INFINITY, 0, 0, 0] },
    { total: Number.MAX_VALUE, amounts: [Number.MAX_VALUE, Number.MAX_VALUE, 0, 0] },
  ])('does not draw misleading ratios for zero, signed, unreconciled or unavailable prices %#', ({ total, amounts }) => {
    const { container } = render(<ProjectWorkPhases workPhases={phases(amounts)} total={total} isPriceIncomplete={false} />);
    const chart = screen.getByRole('figure', { name: 'Práce podle fází' });
    expect(within(chart).getAllByRole('listitem')).toHaveLength(4);
    expect(chart.querySelectorAll('[aria-hidden="true"] > span')).toHaveLength(0);
    expect(container.textContent).not.toMatch(/NaN|Infinity/);
    expect(container.innerHTML).not.toMatch(/(?:NaN|Infinity)%/);
  });
});
