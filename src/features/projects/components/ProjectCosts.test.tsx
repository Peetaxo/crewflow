import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ProjectCostBreakdown, ProjectSummary } from '../services/project-summary';
import ProjectCosts from './ProjectCosts';

const zeroCosts: ProjectCostBreakdown = { work: 0, travel: 0, meals: 0, receipts: 0, total: 0 };
const stages: ProjectSummary['stages'] = { inProgress: zeroCosts, approved: zeroCosts, invoiced: zeroCosts, paid: zeroCosts };
const renderCosts = (costs: ProjectCostBreakdown) => render(<ProjectCosts costs={costs} stages={stages} hasMissingRates={false} hasUnknownInvoiceAllocation={false} />);

describe('ProjectCosts breakdown', () => {
  it('describes every category and renders proportional segments only for positive amounts', () => {
    renderCosts({ work: 150, travel: 25, meals: 0, receipts: 25, total: 200 });
    const breakdown = screen.getByRole('img', { name: /Rozpad nákladů: Práce 150 Kc, Doprava 25 Kc, Stravné 0 Kc, Účtenky 25 Kc/ });
    const segments = Array.from(breakdown.children) as HTMLElement[];
    expect(segments.map((segment) => segment.style.width)).toEqual(['75%', '12.5%', '12.5%']);
    expect(segments.every((segment) => segment.getAttribute('aria-hidden') === 'true')).toBe(true);
  });

  it('represents an empty project without inventing cost proportions', () => {
    renderCosts(zeroCosts);
    const breakdown = screen.getByRole('img', { name: /Zatím nejsou evidovány žádné náklady/ });
    expect(breakdown.children).toHaveLength(0);
    expect(screen.getByText('Celkem').parentElement).toHaveTextContent('0 Kc');
  });

  it.each([
    { work: -50, travel: 100, meals: 0, receipts: 0, total: 50 },
    { work: 50, travel: 0, meals: 0, receipts: 0, total: 0 },
    { work: 50, travel: 0, meals: 0, receipts: 0, total: 100 },
    { work: Number.NaN, travel: 0, meals: 0, receipts: 0, total: Number.NaN },
    { work: Number.POSITIVE_INFINITY, travel: 0, meals: 0, receipts: 0, total: Number.POSITIVE_INFINITY },
    { work: Number.MAX_VALUE, travel: Number.MAX_VALUE, meals: 0, receipts: 0, total: Number.MAX_VALUE },
  ])('does not draw misleading proportions for non-comparable costs %#', (costs) => {
    const { container } = renderCosts(costs);
    const breakdown = screen.getByRole('img', { name: /Poměrové rozdělení není dostupné/ });
    expect(breakdown.children).toHaveLength(0);
    expect(container.textContent).not.toMatch(/NaN|Infinity/);
    expect(container.innerHTML).not.toMatch(/(?:NaN|Infinity)%/);
  });
});
