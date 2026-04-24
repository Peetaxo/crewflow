import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import StatCard from './StatCard';

describe('StatCard', () => {
  it('renders a restrained nodu card without decorative orange dots', () => {
    const { container } = render(
      <StatCard label="Faktury v procesu" value={3} sub="Self-billing" cls="bg-amber-50 text-amber-700" />
    );

    expect(screen.getByText('Faktury v procesu')).toHaveClass('text-[10px]');
    expect(screen.getByText('3')).toHaveClass('text-gray-950');
    expect(screen.getByText('Self-billing')).toHaveClass('nodu-stat-chip');
    expect(container.querySelector('[data-testid="stat-accent-dot"]')).toBeNull();
  });
});
