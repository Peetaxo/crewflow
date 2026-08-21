import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import AppLoadingMark from './AppLoadingMark';

describe('AppLoadingMark', () => {
  it('shows only the accessible animated Nodu mark', () => {
    const { container } = render(<AppLoadingMark />);

    expect(screen.getByRole('status', { name: 'Připravuji aplikaci' })).toBeInTheDocument();
    expect(screen.queryByText(/načítám|připravuji/i)).not.toBeInTheDocument();
    expect(container.querySelectorAll('.nodu-app-loading__ray')).toHaveLength(6);
    expect(container.querySelector('.nodu-app-loading__dot')).toBeInTheDocument();
    expect(container.querySelector('.nodu-app-loading__mark')).toHaveAttribute('aria-hidden', 'true');
  });
});
