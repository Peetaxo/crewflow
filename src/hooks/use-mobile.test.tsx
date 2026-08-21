import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useIsMobile } from './use-mobile';

let mediaChangeListener: (() => void) | null = null;

function RenderHistory({ values }: { values: boolean[] }) {
  values.push(useIsMobile());
  return null;
}

describe('useIsMobile', () => {
  beforeEach(() => {
    mediaChangeListener = null;
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn(() => ({
        matches: false,
        media: '(max-width: 767px)',
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: (_event: string, listener: () => void) => {
          mediaChangeListener = listener;
        },
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it('reports a narrow viewport as mobile on the first render', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    const values: boolean[] = [];

    render(<RenderHistory values={values} />);

    expect(values[0]).toBe(true);
  });

  it('reports a wide viewport as desktop on the first render', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
    const values: boolean[] = [];

    render(<RenderHistory values={values} />);

    expect(values[0]).toBe(false);
  });

  it('updates after a viewport media change', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
    const values: boolean[] = [];
    render(<RenderHistory values={values} />);

    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    act(() => mediaChangeListener?.());

    expect(values.at(-1)).toBe(true);
  });
});
