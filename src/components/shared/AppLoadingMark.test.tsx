import { readFileSync } from 'node:fs';
import { render, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import AppLoadingMark from './AppLoadingMark';

describe('AppLoadingMark', () => {
  it('keeps the document logo mounted from first paint through consecutive loading stages', () => {
    const page = new DOMParser().parseFromString(readFileSync('index.html', 'utf8'), 'text/html');
    const fixture = document.createElement('div');
    fixture.innerHTML = page.body.innerHTML;
    document.body.append(fixture);
    try {
      const root = fixture.querySelector<HTMLElement>('#root')!;
      const artwork = fixture.querySelector('.nodu-app-loading__mark');
      expect(artwork).toHaveAttribute('aria-hidden', 'true');
      expect(artwork?.querySelectorAll('.nodu-app-loading__ray')).toHaveLength(6);
      const requests = fixture.querySelector<HTMLElement>('#nodu-loading-status')!;
      const view = render(<AppLoadingMark key="links" />, { container: root });
      expect(within(requests).getByRole('status', { name: 'Připravuji aplikaci' })).toBeInTheDocument();
      view.rerender(<AppLoadingMark key="auth" />);
      expect(fixture.querySelector('.nodu-app-loading__mark')).toBe(artwork);
      view.rerender(<main>Akce</main>);
      expect(requests).toBeEmptyDOMElement();
      expect(root).toHaveTextContent('Akce');
    } finally {
      fixture.remove();
    }
  });
});
