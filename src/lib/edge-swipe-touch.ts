interface EdgeSwipeHandlers {
  start(x: number, y: number, target: EventTarget | null): boolean;
  move(x: number, y: number): void;
  end(x: number, y: number): void;
  cancel(): void;
}

const mountedSurfaces = new Set<HTMLElement>();
const dialogSelector = '[role="dialog"], [role="alertdialog"]';

/** Observe the gesture without making the browser wait for JS before scrolling. */
export function listenForEdgeSwipe(surface: HTMLElement, handlers: EdgeSwipeHandlers) {
  mountedSurfaces.add(surface);
  let tracking = false;
  const cancel = () => {
    if (tracking) handlers.cancel();
    tracking = false;
  };
  const start = (event: TouchEvent) => {
    cancel();
    const touch = event.touches[0];
    if (event.touches.length !== 1 || !touch) return;
    // iOS can target the window at the screen edge. Resolve the hit once, before
    // the swiped sheet moves and exposes the screen underneath.
    const hit = event.target === event.currentTarget
      ? document.elementFromPoint?.(touch.clientX, touch.clientY)
      : event.target;
    if (hit) {
      if (!(hit instanceof Node) || !surface.contains(hit)) return;
      const dialog = hit instanceof Element ? hit.closest(dialogSelector) : null;
      if (dialog && dialog !== surface && surface.contains(dialog)) return;
    } else if (mountedSurfaces.size !== 1 || surface.querySelector(dialogSelector)) {
      return;
    }
    tracking = handlers.start(touch.clientX, touch.clientY, hit ?? null);
  };
  const move = (event: TouchEvent) => {
    if (!tracking) return;
    if (event.touches.length !== 1) {
      cancel();
      return;
    }
    const touch = event.touches[0];
    handlers.move(touch.clientX, touch.clientY);
  };
  const end = (event: TouchEvent) => {
    if (!tracking) return;
    const touch = event.changedTouches[0];
    if (!touch || event.touches.length > 0) {
      cancel();
      return;
    }
    tracking = false;
    handlers.end(touch.clientX, touch.clientY);
  };
  const options = { passive: true, capture: true };
  window.addEventListener('touchstart', start, options);
  window.addEventListener('touchmove', move, options);
  window.addEventListener('touchend', end, options);
  window.addEventListener('touchcancel', cancel, options);
  return () => {
    mountedSurfaces.delete(surface);
    window.removeEventListener('touchstart', start, options);
    window.removeEventListener('touchmove', move, options);
    window.removeEventListener('touchend', end, options);
    window.removeEventListener('touchcancel', cancel, options);
  };
}
