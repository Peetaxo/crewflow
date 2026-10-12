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
    let live = true;
    const update = () => {
      if (!live) return;
      const covered = viewport ? window.innerHeight - viewport.height - viewport.offsetTop : 0;
      content.style.setProperty(property, `${Number.isFinite(covered) ? Math.max(0, covered) : 0}px`);
    };
    update();
    viewport?.addEventListener('resize', update, { passive: true });
    viewport?.addEventListener('scroll', update, { passive: true });
    if (viewport) window.addEventListener('resize', update, { passive: true });
    return () => {
      live = false;
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
      if (viewport) window.removeEventListener('resize', update);
      content.style.removeProperty(property);
    };
  }, [active, container]);
}
