import React, { useRef } from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useShiftWorkflowVisualViewport } from './useShiftWorkflowVisualViewport';

const inset = '--nodu-workflow-viewport-inset';
function viewport(height = 532, offsetTop = 0) {
  return Object.assign(new EventTarget(), { height, offsetTop }) as unknown as VisualViewport;
}
let renders = 0;
function Fixture({ active = true, owner = 'one' }: { active?: boolean; owner?: string }) {
  return <Session key={owner} active={active} />;
}
function Session({ active }: { active: boolean }) {
  const container = useRef<HTMLDivElement>(null);
  renders += 1;
  useShiftWorkflowVisualViewport({ container, active });
  return <div ref={container} data-testid="selection">Cards</div>;
}
function installViewport(visible: VisualViewport | undefined = viewport(), layoutHeight = 844) {
  vi.stubGlobal('visualViewport', visible);
  vi.stubGlobal('innerHeight', layoutHeight);
  return visible;
}
afterEach(() => { renders = 0; vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('useShiftWorkflowVisualViewport', () => {
  it.each([
    [844, 844, 0, '0px'],
    [844, 532, 0, '312px'],
    [844, 532, 48, '264px'],
    [844, 844, 48, '0px'],
    [844, 900, 0, '0px'],
    [844, Number.NaN, 0, '0px'],
    [844, 532, Number.POSITIVE_INFINITY, '0px'],
    [Number.NaN, 532, 0, '0px'],
    [Number.MAX_VALUE, -Number.MAX_VALUE, 0, '0px'],
  ])('measures a finite bottom inset for layout=%s visible=%s offset=%s', (layout, height, offset, expected) => {
    installViewport(viewport(height, offset), layout);
    render(<Fixture />);
    expect(screen.getByTestId('selection').style.getPropertyValue(inset)).toBe(expected);
  });

  it('updates on viewport resize, viewport scroll and layout resize without rendering cards again', () => {
    const visible = installViewport()!;
    render(<Fixture />);
    const container = screen.getByTestId('selection');
    const initialRenders = renders;
    Object.assign(visible, { height: 500 });
    act(() => visible.dispatchEvent(new Event('resize')));
    expect(container.style.getPropertyValue(inset)).toBe('344px');
    Object.assign(visible, { offsetTop: 32 });
    act(() => visible.dispatchEvent(new Event('scroll')));
    expect(container.style.getPropertyValue(inset)).toBe('312px');
    vi.stubGlobal('innerHeight', 800);
    act(() => window.dispatchEvent(new Event('resize')));
    expect(container.style.getPropertyValue(inset)).toBe('268px');
    Object.assign(visible, { height: 800, offsetTop: 0 });
    act(() => visible.dispatchEvent(new Event('resize')));
    expect(container.style.getPropertyValue(inset)).toBe('0px');
    expect(renders).toBe(initialRenders);
  });

  it('uses passive listeners and removes the same listeners when leaving the card stage', () => {
    const visible = installViewport()!;
    const added = vi.spyOn(visible, 'addEventListener');
    const removed = vi.spyOn(visible, 'removeEventListener');
    const windowAdded = vi.spyOn(window, 'addEventListener');
    const windowRemoved = vi.spyOn(window, 'removeEventListener');
    const { rerender } = render(<Fixture />);
    const container = screen.getByTestId('selection');
    const resizeListener = added.mock.calls.find(([name]) => name === 'resize')?.[1];
    const scrollListener = added.mock.calls.find(([name]) => name === 'scroll')?.[1];
    expect(resizeListener).toEqual(expect.any(Function));
    expect(added).toHaveBeenCalledWith('resize', resizeListener, { passive: true });
    expect(added).toHaveBeenCalledWith('scroll', scrollListener, { passive: true });
    expect(windowAdded).toHaveBeenCalledWith('resize', resizeListener, { passive: true });
    rerender(<Fixture active={false} />);
    expect(container.style.getPropertyValue(inset)).toBe('');
    expect(removed).toHaveBeenCalledWith('resize', resizeListener);
    expect(removed).toHaveBeenCalledWith('scroll', scrollListener);
    expect(windowRemoved).toHaveBeenCalledWith('resize', resizeListener);
    Object.assign(visible, { height: 300 });
    act(() => visible.dispatchEvent(new Event('resize')));
    expect(container.style.getPropertyValue(inset)).toBe('');
    rerender(<Fixture />);
    expect(container.style.getPropertyValue(inset)).toBe('544px');
  });

  it('retires captured listeners and inline styles with an old selection owner', () => {
    const visible = installViewport()!;
    const added = vi.spyOn(visible, 'addEventListener');
    const { rerender, unmount } = render(<Fixture />);
    const oldContainer = screen.getByTestId('selection');
    const oldListener = added.mock.calls.find(([name]) => name === 'resize')?.[1] as EventListener;
    expect(oldListener).toEqual(expect.any(Function));
    rerender(<Fixture owner="two" />);
    const newContainer = screen.getByTestId('selection');
    expect(oldContainer.style.getPropertyValue(inset)).toBe('');
    Object.assign(visible, { height: 300 });
    act(() => oldListener(new Event('resize')));
    expect(oldContainer.style.getPropertyValue(inset)).toBe('');
    expect(newContainer.style.getPropertyValue(inset)).toBe('312px');
    act(() => visible.dispatchEvent(new Event('resize')));
    expect(newContainer.style.getPropertyValue(inset)).toBe('544px');
    unmount();
    expect(newContainer.style.getPropertyValue(inset)).toBe('');
  });

  it('falls back to the existing CSS position when VisualViewport is unavailable', () => {
    installViewport();
    vi.stubGlobal('visualViewport', undefined);
    const { unmount } = render(<Fixture />);
    const container = screen.getByTestId('selection');
    expect(container.style.getPropertyValue(inset)).toBe('0px');
    unmount();
    expect(container.style.getPropertyValue(inset)).toBe('');
  });

  it('does not measure an inactive card stage', () => {
    installViewport();
    render(<Fixture active={false} />);
    expect(screen.getByTestId('selection').style.getPropertyValue(inset)).toBe('');
  });
});

describe('scoped selection native layout', () => {
  const css = readFileSync(resolve('src/styles/mobile-events.css'), 'utf8');
  it('keeps the native date control inside its grid cell without changing its input type', () => {
    const rule = css.match(/\.nodu-workflow-selection__toolbar input\[type="date"\]\s*\{[^}]*\}/)?.[0] ?? '';
    for (const declaration of ['display: block;', 'width: 100%;', 'max-width: 100%;', 'min-width: 0;', 'box-sizing: border-box;', '-webkit-appearance: none;', 'appearance: none;']) {
      expect(rule).toContain(declaration);
    }
  });
  it('lifts the fixed bar above the keyboard while preserving mobile navigation and safe-area clearance', () => {
    const rule = css.match(/@media \(max-width: 767px\)[\s\S]*?\.nodu-workflow-selection__bar\s*\{[^}]*\}/)?.[0];
    expect(rule).toContain('bottom: max(calc(5.5rem + env(safe-area-inset-bottom)), calc(var(--nodu-workflow-viewport-inset, 0px) + 0.75rem));');
  });
  it('reserves scrollable end space including the keyboard inset so the final card stays reachable', () => {
    const rule = css.match(/\.nodu-workflow-selection\s*\{[^}]*\}/)?.[0];
    expect(rule).toContain('padding-bottom: calc(10rem + env(safe-area-inset-bottom) + var(--nodu-workflow-viewport-inset, 0px));');
  });
});
