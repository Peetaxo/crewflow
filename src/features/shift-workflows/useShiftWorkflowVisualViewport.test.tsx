import React, { useRef } from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useShiftWorkflowVisualViewport } from './useShiftWorkflowVisualViewport';

const inset = '--nodu-workflow-viewport-inset';
const viewportTop = '--nodu-workflow-viewport-top';
const toolbarHeight = '--nodu-workflow-toolbar-height';
const toolbarLeft = '--nodu-workflow-toolbar-left';
const toolbarWidth = '--nodu-workflow-toolbar-width';
const headerProperties = [toolbarHeight, toolbarLeft, toolbarWidth];
let geometry = { height: 187, left: 16, width: 361 };
const rect = (height: number) => ({ x: geometry.left, y: -36, top: -36, bottom: height - 36,
  left: geometry.left, right: geometry.left + geometry.width, width: geometry.width, height, toJSON: () => ({}) });
function viewport(height = 532, offsetTop = 0) {
  return Object.assign(new EventTarget(), { height, offsetTop }) as unknown as VisualViewport;
}
let renders = 0;
let barHeight = 64;
function Fixture({ active = true, owner = 'one', footer = false }: { active?: boolean; owner?: string; footer?: boolean }) {
  return <Session key={owner} active={active} footer={footer} />;
}
function Session({ active, footer }: { active: boolean; footer: boolean }) {
  const container = useRef<HTMLDivElement>(null);
  renders += 1;
  useShiftWorkflowVisualViewport({ container, active });
  return <main data-testid="scroll-root"><div ref={container} data-testid="selection">
    <div data-workflow-toolbar-space ref={(element) => { if (element) element.getBoundingClientRect = () => rect(300); }}>
      <div data-workflow-toolbar ref={(element) => { if (element) element.getBoundingClientRect = () => rect(geometry.height); }}>
        <label>Search<input type="search" /></label><label>Date<input type="date" /></label>
      </div>
    </div>Cards
    {footer && <div data-workflow-bar ref={(element) => { if (element) element.getBoundingClientRect = () => rect(barHeight); }}>Selection bar</div>}
  </div></main>;
}
function installViewport(visible: VisualViewport | undefined = viewport(), layoutHeight = 844) {
  vi.stubGlobal('visualViewport', visible);
  vi.stubGlobal('innerHeight', layoutHeight);
  return visible;
}
function installMobile(matches = true) {
  const media = Object.assign(new EventTarget(), { matches, media: '(max-width: 767px)' });
  vi.stubGlobal('matchMedia', () => media);
  return media;
}
function installResizeObserver() {
  const observations: { notify: () => void; disconnect: ReturnType<typeof vi.fn>; elements: Element[] }[] = [];
  vi.stubGlobal('ResizeObserver', class {
    disconnect = vi.fn();
    elements: Element[] = [];
    constructor(callback: () => void) { observations.push({ notify: callback, disconnect: this.disconnect, elements: this.elements }); }
    observe(element: Element) { this.elements.push(element); }
  });
  return observations;
}
const focus = (element: HTMLElement) => act(() => element.focus());
const expectReleasedHeader = (container: HTMLElement) => {
  expect(container).not.toHaveAttribute('data-workflow-keyboard-header');
  headerProperties.forEach((property) => expect(container.style.getPropertyValue(property)).toBe(''));
};
afterEach(() => { renders = 0; barHeight = 64; geometry = { height: 187, left: 16, width: 361 }; vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('useShiftWorkflowVisualViewport', () => {
  it('measures actual floating-bar clearance without changing the page viewport or rendering pixel state', () => {
    installMobile(); installViewport(); const observations = installResizeObserver();
    const { rerender } = render(<Fixture footer />); const container = screen.getByTestId('selection');
    const root = screen.getByTestId('scroll-root'); root.scrollTop = 71;
    expect(container.style.getPropertyValue('--nodu-workflow-bar-height')).toBe('64px');
    const initialRenders = renders; barHeight = 96; act(() => observations[0].notify());
    expect(container.style.getPropertyValue('--nodu-workflow-bar-height')).toBe('96px');
    expect(renders).toBe(initialRenders); expect(root.scrollTop).toBe(71); expect(root.style.height).toBe('');
    rerender(<Fixture footer active={false} />); expect(container.style.getPropertyValue('--nodu-workflow-bar-height')).toBe('');
    expect(observations[0].disconnect).toHaveBeenCalledOnce();
    barHeight = 120; act(() => observations[0].notify()); expect(container.style.getPropertyValue('--nodu-workflow-bar-height')).toBe('');
  });
  it('fixes the mobile keyboard header using its measured flow space through native viewport pan and nested scroll', () => {
    installMobile();
    const visible = installViewport(viewport(818), 818)!;
    vi.stubGlobal('scrollY', 56);
    render(<Fixture />);
    const container = screen.getByTestId('selection');
    const root = screen.getByTestId('scroll-root');
    root.scrollTop = 706;
    focus(screen.getByRole('searchbox'));
    expectReleasedHeader(container);
    const initialRenders = renders;
    Object.assign(visible, { height: 471, offsetTop: 55.65625 });
    act(() => visible.dispatchEvent(new Event('resize')));
    expect(container).toHaveAttribute('data-workflow-keyboard-header');
    expect(container.style.getPropertyValue(toolbarHeight)).toBe('187px');
    expect(container.style.getPropertyValue(toolbarLeft)).toBe('16px');
    expect(container.style.getPropertyValue(toolbarWidth)).toBe('361px');
    expect(container.style.getPropertyValue(inset)).toBe('347px');
    expect(container.style.getPropertyValue(viewportTop)).toBe('55.65625px');
    geometry = { height: 205, left: 20, width: 353 };
    act(() => root.dispatchEvent(new Event('scroll')));
    expect(container.style.getPropertyValue(toolbarHeight)).toBe('205px');
    expect(container.style.getPropertyValue(toolbarLeft)).toBe('20px');
    expect(container.style.getPropertyValue(toolbarWidth)).toBe('353px');
    Object.assign(visible, { offsetTop: 80 });
    act(() => visible.dispatchEvent(new Event('scroll')));
    expect(container.style.getPropertyValue(viewportTop)).toBe('80px');
    expect(container.style.getPropertyValue(inset)).toBe('347px');
    expect(root.scrollTop).toBe(706);
    expect(renders).toBe(initialRenders);
  });

  it('supports native date focus and keeps flow space through blur until keyboard dismissal restores the viewport', () => {
    installMobile();
    const visible = installViewport(viewport(471, 55.65625), 818)!;
    const observations = installResizeObserver();
    render(<Fixture />);
    const container = screen.getByTestId('selection');
    expectReleasedHeader(container);
    focus(screen.getByLabelText('Date'));
    expect(container).toHaveAttribute('data-workflow-keyboard-header');
    act(() => screen.getByLabelText('Date').blur());
    act(() => visible.dispatchEvent(new Event('scroll')));
    expect(container.style.getPropertyValue(toolbarHeight)).toBe('187px');
    Object.assign(visible, { height: 818, offsetTop: 0 });
    act(() => visible.dispatchEvent(new Event('resize')));
    expectReleasedHeader(container);
    expect(observations[0].disconnect).toHaveBeenCalledOnce();
    geometry.height = 220;
    act(() => observations[0].notify());
    expectReleasedHeader(container);
  });

  it('updates actual toolbar dimensions without a ResizeObserver feedback loop and retires queued work with its owner', () => {
    installMobile(); installViewport();
    const observations = installResizeObserver();
    const windowAdded = vi.spyOn(window, 'addEventListener');
    const windowRemoved = vi.spyOn(window, 'removeEventListener');
    const { rerender, unmount } = render(<Fixture />);
    focus(screen.getByRole('searchbox'));
    const oldContainer = screen.getByTestId('selection');
    expect(oldContainer).toHaveAttribute('data-workflow-keyboard-header');
    const oldObservation = observations[0];
    expect(oldObservation.elements).toEqual([
      oldContainer.querySelector('[data-workflow-toolbar]'), oldContainer.querySelector('[data-workflow-toolbar-space]'),
    ]);
    const initialRenders = renders;
    geometry.height = 215;
    act(() => oldObservation.notify());
    expect(oldContainer.style.getPropertyValue(toolbarHeight)).toBe('215px');
    const writes = vi.spyOn(oldContainer.style, 'setProperty');
    act(() => oldObservation.notify());
    expect(writes).not.toHaveBeenCalled();
    expect(renders).toBe(initialRenders);
    const capture = windowAdded.mock.calls.find(([name, , options]) => name === 'scroll' && typeof options === 'object' && options?.capture);
    expect(capture?.[2]).toEqual({ capture: true, passive: true });
    const oldScroll = capture?.[1] as EventListener;
    rerender(<Fixture owner="two" />);
    const newContainer = screen.getByTestId('selection');
    expect(oldObservation.disconnect).toHaveBeenCalledOnce();
    expect(windowRemoved).toHaveBeenCalledWith('scroll', oldScroll, true);
    expectReleasedHeader(oldContainer);
    expectReleasedHeader(newContainer);
    geometry.height = 230;
    act(() => { oldObservation.notify(); oldScroll(new Event('scroll')); });
    expectReleasedHeader(oldContainer);
    expectReleasedHeader(newContainer);
    focus(screen.getByRole('searchbox'));
    expect(newContainer.style.getPropertyValue(toolbarHeight)).toBe('230px');
    rerender(<Fixture owner="two" active={false} />);
    expectReleasedHeader(newContainer);
    expect(observations[1].disconnect).toHaveBeenCalledOnce();
    act(() => observations[1].notify());
    expectReleasedHeader(newContainer);
    unmount();
  });

  it.each([
    ['desktop', false, viewport(), 844, true],
    ['uncovered viewport', true, viewport(844), 844, true],
    ['invalid viewport', true, viewport(Number.NaN), 844, true],
    ['unsupported viewport', true, undefined, 844, true],
    ['inactive stage', true, viewport(), 844, false],
  ] as const)('preserves normal toolbar flow for %s', (_name, mobile, visible, layoutHeight, active) => {
    installMobile(mobile); installViewport(visible, layoutHeight);
    if (!visible) vi.stubGlobal('visualViewport', undefined);
    render(<Fixture active={active} />);
    focus(screen.getByRole('searchbox'));
    expectReleasedHeader(screen.getByTestId('selection'));
  });

  it('releases the mobile fixed header when the layout changes to desktop and resumes on mobile', () => {
    const mobile = installMobile(); installViewport();
    render(<Fixture />);
    focus(screen.getByRole('searchbox'));
    const container = screen.getByTestId('selection');
    expect(container).toHaveAttribute('data-workflow-keyboard-header');
    Object.assign(mobile, { matches: false });
    act(() => mobile.dispatchEvent(new Event('change')));
    expectReleasedHeader(container);
    Object.assign(mobile, { matches: true });
    act(() => mobile.dispatchEvent(new Event('change')));
    expect(container).toHaveAttribute('data-workflow-keyboard-header');
  });

  it.each([
    [844, 844, 0, '0px', '0px'],
    [844, 532, 0, '312px', '0px'],
    [844, 532, 48, '312px', '48px'],
    [844, 844, 48, '0px', '48px'],
    [844, 900, 0, '0px', '0px'],
    [844, Number.NaN, 48, '0px', '48px'],
    [844, 532, Number.POSITIVE_INFINITY, '312px', '0px'],
    [Number.NaN, 532, 0, '0px', '0px'],
    [Number.MAX_VALUE, -Number.MAX_VALUE, 0, '0px', '0px'],
    [844, 532, -16, '312px', '0px'],
    [844, 532, Number.NaN, '312px', '0px'],
  ])('measures finite bottom and top offsets for layout=%s visible=%s offset=%s', (layout, height, offset, expected, expectedTop) => {
    installViewport(viewport(height, offset), layout);
    render(<Fixture />);
    expect(screen.getByTestId('selection').style.getPropertyValue(inset)).toBe(expected);
    expect(screen.getByTestId('selection').style.getPropertyValue(viewportTop)).toBe(expectedTop);
  });

  it('preserves fixed-bar clearance through the measured iOS keyboard viewport pan', () => {
    const visible = installViewport(viewport(471, 55.65625), 818)!;
    render(<Fixture />);
    const container = screen.getByTestId('selection');
    expect(container.style.getPropertyValue(inset)).toBe('347px');
    expect(container.style.getPropertyValue(viewportTop)).toBe('55.65625px');
    Object.assign(visible, { offsetTop: 80 });
    act(() => visible.dispatchEvent(new Event('scroll')));
    expect(container.style.getPropertyValue(inset)).toBe('347px');
    expect(container.style.getPropertyValue(viewportTop)).toBe('80px');
  });

  it('updates on viewport resize, viewport scroll and layout resize without rendering cards again', () => {
    const visible = installViewport()!;
    render(<Fixture />);
    const container = screen.getByTestId('selection');
    const initialRenders = renders;
    Object.assign(visible, { height: 500 });
    act(() => visible.dispatchEvent(new Event('resize')));
    expect(container.style.getPropertyValue(inset)).toBe('344px');
    expect(container.style.getPropertyValue(viewportTop)).toBe('0px');
    Object.assign(visible, { offsetTop: 32 });
    act(() => visible.dispatchEvent(new Event('scroll')));
    expect(container.style.getPropertyValue(inset)).toBe('344px');
    expect(container.style.getPropertyValue(viewportTop)).toBe('32px');
    vi.stubGlobal('innerHeight', 800);
    act(() => window.dispatchEvent(new Event('resize')));
    expect(container.style.getPropertyValue(inset)).toBe('300px');
    expect(container.style.getPropertyValue(viewportTop)).toBe('32px');
    Object.assign(visible, { height: 800, offsetTop: 0 });
    act(() => visible.dispatchEvent(new Event('resize')));
    expect(container.style.getPropertyValue(inset)).toBe('0px');
    expect(container.style.getPropertyValue(viewportTop)).toBe('0px');
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
    expect(container.style.getPropertyValue(viewportTop)).toBe('');
    expect(removed).toHaveBeenCalledWith('resize', resizeListener);
    expect(removed).toHaveBeenCalledWith('scroll', scrollListener);
    expect(windowRemoved).toHaveBeenCalledWith('resize', resizeListener);
    Object.assign(visible, { height: 300 });
    act(() => visible.dispatchEvent(new Event('resize')));
    expect(container.style.getPropertyValue(inset)).toBe('');
    expect(container.style.getPropertyValue(viewportTop)).toBe('');
    rerender(<Fixture />);
    expect(container.style.getPropertyValue(inset)).toBe('544px');
    expect(container.style.getPropertyValue(viewportTop)).toBe('0px');
  });

  it('retires captured listeners and inline styles with an old selection owner', () => {
    const visible = installViewport(viewport(532, 20))!;
    const added = vi.spyOn(visible, 'addEventListener');
    const { rerender, unmount } = render(<Fixture />);
    const oldContainer = screen.getByTestId('selection');
    const oldListener = added.mock.calls.find(([name]) => name === 'resize')?.[1] as EventListener;
    expect(oldListener).toEqual(expect.any(Function));
    rerender(<Fixture owner="two" />);
    const newContainer = screen.getByTestId('selection');
    expect(oldContainer.style.getPropertyValue(inset)).toBe('');
    expect(oldContainer.style.getPropertyValue(viewportTop)).toBe('');
    Object.assign(visible, { height: 300, offsetTop: 64 });
    act(() => oldListener(new Event('resize')));
    expect(oldContainer.style.getPropertyValue(inset)).toBe('');
    expect(oldContainer.style.getPropertyValue(viewportTop)).toBe('');
    expect(newContainer.style.getPropertyValue(inset)).toBe('312px');
    expect(newContainer.style.getPropertyValue(viewportTop)).toBe('20px');
    act(() => visible.dispatchEvent(new Event('resize')));
    expect(newContainer.style.getPropertyValue(inset)).toBe('544px');
    expect(newContainer.style.getPropertyValue(viewportTop)).toBe('64px');
    unmount();
    expect(newContainer.style.getPropertyValue(inset)).toBe('');
    expect(newContainer.style.getPropertyValue(viewportTop)).toBe('');
  });

  it('falls back to the existing CSS position when VisualViewport is unavailable', () => {
    installViewport();
    vi.stubGlobal('visualViewport', undefined);
    const { unmount } = render(<Fixture />);
    const container = screen.getByTestId('selection');
    expect(container.style.getPropertyValue(inset)).toBe('0px');
    expect(container.style.getPropertyValue(viewportTop)).toBe('0px');
    unmount();
    expect(container.style.getPropertyValue(inset)).toBe('');
    expect(container.style.getPropertyValue(viewportTop)).toBe('');
  });

  it('does not measure an inactive card stage', () => {
    installViewport();
    render(<Fixture active={false} />);
    expect(screen.getByTestId('selection').style.getPropertyValue(inset)).toBe('');
    expect(screen.getByTestId('selection').style.getPropertyValue(viewportTop)).toBe('');
  });
});

describe('scoped selection native layout', () => {
  const css = readFileSync(resolve('src/styles/mobile-events.css'), 'utf8');
  it('keeps the normal sticky toolbar wrapper below the native safe area and panned visual viewport', () => {
    const mobileRule = css.match(/@media \(max-width: 767px\)[\s\S]*?\.nodu-workflow-selection__toolbar-space\s*\{[^}]*\}/)?.[0] ?? '';
    expect(mobileRule).toContain('top: calc(env(safe-area-inset-top) + var(--nodu-workflow-viewport-top, 0px));');
    const desktopRule = css.match(/\.nodu-workflow-selection__toolbar-space\s*\{[^}]*\}/)?.[0] ?? '';
    expect(desktopRule).toContain('position: sticky;');
    expect(desktopRule).toContain('top: 0;');
    const toolbarRule = css.match(/\.nodu-workflow-selection__toolbar\s*\{[^}]*\}/)?.[0];
    expect(toolbarRule).toContain('position: relative;');
  });
  it('uses fixed mobile keyboard positioning with measured width and an equal flow reserve', () => {
    const mobile = css.slice(css.indexOf('@media (max-width: 767px)', css.indexOf('.nodu-workflow-selection {')));
    const rule = mobile.match(/\.nodu-workflow-selection\[data-workflow-keyboard-header\] \.nodu-workflow-selection__toolbar\s*\{[^}]*\}/)?.[0] ?? '';
    expect(rule).toContain('position: fixed;');
    expect(rule).toContain('top: calc(env(safe-area-inset-top) + var(--nodu-workflow-viewport-top, 0px));');
    expect(rule).toContain('left: var(--nodu-workflow-toolbar-left);');
    expect(rule).toContain('width: var(--nodu-workflow-toolbar-width);');
    const reserve = mobile.match(/\.nodu-workflow-selection\[data-workflow-keyboard-header\] \.nodu-workflow-selection__toolbar-space\s*\{[^}]*\}/)?.[0];
    expect(reserve).toContain('height: var(--nodu-workflow-toolbar-height);');
    expect(mobile.match(/(?:^|\n) {2}\.nodu-workflow-selection__toolbar\s*\{[^}]*\}/)?.[0]).toContain('padding-top: 3rem;');
  });
  it('uses mobile toolbar measurement markers only during keyboard occlusion', () => {
    const mobile = css.slice(css.indexOf('@media (max-width: 767px)', css.indexOf('.nodu-workflow-selection {')));
    const toolbar = mobile.match(/\.nodu-mobile-workflow-selection\[data-workflow-keyboard-header\] \[data-workflow-toolbar\]\s*\{[^}]*\}/)?.[0] ?? '';
    expect(toolbar).toContain('position: fixed;');
    expect(toolbar).toContain('top: calc(env(safe-area-inset-top) + var(--nodu-workflow-viewport-top, 0px));');
    expect(toolbar).toContain('left: var(--nodu-workflow-toolbar-left);');
    expect(toolbar).toContain('width: var(--nodu-workflow-toolbar-width);');
    expect(toolbar).toContain('box-sizing: border-box;');
    expect(toolbar).toContain('background: rgb(var(--nodu-paper-rgb) / 0.98);');
    const reserve = mobile.match(/\.nodu-mobile-workflow-selection\[data-workflow-keyboard-header\] \[data-workflow-toolbar-space\]\s*\{[^}]*\}/)?.[0];
    expect(reserve).toContain('height: var(--nodu-workflow-toolbar-height);');
    expect(css).not.toContain('.nodu-mobile-workflow-selection__toolbar');
  });
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
