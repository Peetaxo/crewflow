import { useLayoutEffect, type RefObject } from 'react';

interface Props {
  container: RefObject<HTMLElement | null>;
  active: boolean;
}

/** Keyboard geometry updates only this session's CSS, never the card/draft state. */
export function useShiftWorkflowVisualViewport({ container, active }: Props): void {
  useLayoutEffect(() => {
    const content = container.current;
    if (!content || !active) return;
    const viewport = window.visualViewport;
    const property = '--nodu-workflow-viewport-inset';
    const topProperty = '--nodu-workflow-viewport-top';
    const headerProperties = ['--nodu-workflow-toolbar-height', '--nodu-workflow-toolbar-left', '--nodu-workflow-toolbar-width'];
    const toolbar = content.querySelector<HTMLElement>('[data-workflow-toolbar]');
    const space = content.querySelector<HTMLElement>('[data-workflow-toolbar-space]');
    const mobile = viewport && toolbar && space ? window.matchMedia('(max-width: 767px)') : null;
    let live = true;
    let fixedHeader = false;
    let observer: ResizeObserver | null = null;
    const write = (name: string, value: number) => {
      const pixels = `${value}px`;
      if (content.style.getPropertyValue(name) !== pixels) content.style.setProperty(name, pixels);
    };
    const measureHeader = () => {
      if (!live || !toolbar || !space) return false;
      const { height } = toolbar.getBoundingClientRect();
      const { left, width } = space.getBoundingClientRect();
      if (!Number.isFinite(height) || height <= 0 || !Number.isFinite(left) || !Number.isFinite(width) || width <= 0) return false;
      write(headerProperties[0], height);
      write(headerProperties[1], left);
      write(headerProperties[2], width);
      return true;
    };
    const releaseHeader = () => {
      fixedHeader = false;
      observer?.disconnect();
      observer = null;
      window.removeEventListener('scroll', update, true);
      content.removeAttribute('data-workflow-keyboard-header');
      headerProperties.forEach((name) => content.style.removeProperty(name));
    };
    const update = () => {
      if (!live) return;
      const covered = viewport ? window.innerHeight - viewport.height : 0;
      const offsetTop = viewport?.offsetTop ?? 0;
      const inset = Number.isFinite(covered) ? Math.max(0, covered) : 0;
      write(property, inset);
      write(topProperty, Number.isFinite(offsetTop) ? Math.max(0, offsetTop) : 0);
      if (!mobile?.matches || inset === 0) {
        if (fixedHeader) releaseHeader();
        return;
      }
      if (fixedHeader) { measureHeader(); return; }
      const focused = content.ownerDocument.activeElement;
      if (!focused || !toolbar?.contains(focused) || !focused.matches('input[type="search"], input[type="date"]') || !measureHeader()) return;
      // Sticky is clipped by the native nested scrollport during keyboard pan.
      // Preserve its actual flow height while fixing only this mobile header.
      fixedHeader = true;
      content.setAttribute('data-workflow-keyboard-header', '');
      window.addEventListener('scroll', update, { capture: true, passive: true });
      if (typeof ResizeObserver !== 'undefined' && toolbar && space) {
        const current = new ResizeObserver(() => {
          if (live && fixedHeader && observer === current) measureHeader();
        });
        observer = current;
        current.observe(toolbar);
        current.observe(space);
      }
    };
    update();
    viewport?.addEventListener('resize', update, { passive: true });
    viewport?.addEventListener('scroll', update, { passive: true });
    if (viewport) window.addEventListener('resize', update, { passive: true });
    if (mobile) content.addEventListener('focusin', update);
    mobile?.addEventListener('change', update);
    return () => {
      live = false;
      releaseHeader();
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
      if (viewport) window.removeEventListener('resize', update);
      if (mobile) content.removeEventListener('focusin', update);
      mobile?.removeEventListener('change', update);
      content.style.removeProperty(property);
      content.style.removeProperty(topProperty);
    };
  }, [active, container]);
}
