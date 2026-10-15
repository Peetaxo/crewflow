import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ProjectCostBreakdown, ProjectSummary } from '../services/project-summary';
import ProjectCosts from './ProjectCosts';

const zeroCosts: ProjectCostBreakdown = { work: 0, travel: 0, meals: 0, receipts: 0, total: 0 };
const stages: ProjectSummary['stages'] = { inProgress: zeroCosts, approved: zeroCosts, invoiced: zeroCosts, paid: zeroCosts };
const renderCosts = (costs: ProjectCostBreakdown) => render(<ProjectCosts costs={costs} stages={stages} hasMissingRates={false} hasUnknownInvoiceAllocation={false} />);

describe('ProjectCosts totals', () => {
  it('shows the supplied total with transport and meal costs', () => {
    renderCosts({ work: 150, travel: 25, meals: 0, receipts: 25, total: 200 });
    expect(screen.getByText('Celkem').parentElement).toHaveTextContent('200 Kc');
    expect(screen.getByText('Doprava').parentElement).toHaveTextContent('25 Kc');
    expect(screen.getByText('Stravné').parentElement).toHaveTextContent('0 Kc');
  });

  it('represents an empty project with a zero total', () => {
    renderCosts(zeroCosts);
    expect(screen.getByText('Celkem').parentElement).toHaveTextContent('0 Kc');
  });

  it.each([
    { work: Number.NaN, travel: 0, meals: 0, receipts: 0, total: Number.NaN },
    { work: Number.POSITIVE_INFINITY, travel: 0, meals: 0, receipts: 0, total: Number.POSITIVE_INFINITY },
  ])('does not render non-finite amounts %#', (costs) => {
    const { container } = renderCosts(costs);
    expect(container.textContent).not.toMatch(/NaN|Infinity/);
  });
});


it('places the actual work chart directly after Celkem with a work-only subtotal and accessible values', () => {
  const costs = { work: 3500, travel: 500, meals: 300, receipts: 500, total: 4800 };
  render(<ProjectCosts costs={costs} stages={stages} hasMissingRates={false} hasUnknownInvoiceAllocation={false} workPhases={{
    phases: [
      { type: 'pripravy', hours: 1, amount: 350 }, { type: 'instal', hours: 5, amount: 1750 },
      { type: 'provoz', hours: 3, amount: 1050 }, { type: 'deinstal', hours: 1, amount: 350 },
    ], unallocated: { hours: 0, amount: 0 }, hasInvoicedAllocation: true, hasUnallocatedInvoiceCosts: false,
  }} />);
  const chart = screen.getByRole('figure', { name: 'Práce podle fází' });
  expect(chart.previousElementSibling).toContainElement(screen.getByText('Celkem'));
  expect(chart.nextElementSibling).toContainElement(screen.getByText('Doprava', { selector: 'dt' }));
  expect(within(chart).getByText('Cena práce celkem').parentElement).toHaveTextContent('3 500 Kč');
  expect(within(chart).getAllByRole('listitem').map((row) => row.textContent?.replace(/\s/g, ' '))).toEqual([
    'Přípravy1 h350 Kč', 'Instal5 h1 750 Kč', 'Provoz3 h1 050 Kč', 'Deinstal1 h350 Kč',
  ]);
  const bars = Array.from(chart.querySelectorAll('[aria-hidden="true"] > span')) as HTMLElement[];
  expect(bars.map((bar) => bar.style.width)).toEqual(['10%', '50%', '30%', '10%']);
  expect(chart).toHaveTextContent('Vyfakturovaná cena je rozdělena podle skutečně vykázaných hodin.');
});
