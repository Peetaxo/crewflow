import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import StatCard from './StatCard';

describe('StatCard', () => {
  it('renders a restrained nodu card with semantic surface and text helpers', () => {
    const { container } = render(
      <StatCard label="Faktury v procesu" value={3} sub="Self-billing" cls="bg-amber-50 text-amber-700" />
    );
    const card = container.firstElementChild as HTMLElement;
    const label = screen.getByText('Faktury v procesu');
    const value = screen.getByText('3');
    const chip = screen.getByText('Self-billing');

    expect(card).toHaveClass('nodu-stat-card');
    expect(card.className).not.toContain('bg-white');
    expect(label).toHaveClass('nodu-stat-label');
    expect(label.className).not.toContain('text-gray-');
    expect(value).toHaveClass('nodu-stat-value');
    expect(value.className).not.toContain('text-gray-');
    expect(chip).toHaveClass('nodu-stat-chip');
    expect(chip).toHaveClass('bg-amber-50', 'text-amber-700');
    expect(container.querySelector('[data-testid="stat-accent-dot"]')).toBeNull();
  });

  it('keeps stat card helpers mapped to nodu tokens for both light and dark themes', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');
    const cardRule = css.match(/\.nodu-stat-card\s*\{[\s\S]*?\}/)?.[0];
    const labelRule = css.match(/\.nodu-stat-label\s*\{[\s\S]*?\}/)?.[0];
    const valueRule = css.match(/\.nodu-stat-value\s*\{[\s\S]*?\}/)?.[0];
    const chipRule = css.match(/\.nodu-stat-chip\s*\{[\s\S]*?\}/)?.[0];

    expect(cardRule).toContain('var(--nodu-surface-rgb)');
    expect(cardRule).toContain('border-color: var(--nodu-border);');
    expect(labelRule).toContain('var(--nodu-text-soft)');
    expect(valueRule).toContain('var(--nodu-text)');
    expect(chipRule).not.toContain('var(--nodu-surface-muted-rgb)');
    expect(chipRule).not.toContain('var(--nodu-text-soft)');
  });
});
