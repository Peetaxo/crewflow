import { useLayoutEffect, useRef, type RefObject } from 'react';

export interface CardScrollPosition { scrollTop: number; occurrenceKey: string | null; offset: number }
const occurrences = (container: HTMLElement) => Array.from(container.querySelectorAll<HTMLElement>('[data-workflow-occurrence]'));
const toolbarHeight = (container: HTMLElement) => container.querySelector<HTMLElement>('[data-workflow-toolbar]')?.getBoundingClientRect().height ?? 0;
const toolbarBottom = (root: HTMLElement, container: HTMLElement) => Math.max(root.getBoundingClientRect().top,
  container.querySelector<HTMLElement>('[data-workflow-toolbar]')?.getBoundingClientRect().bottom ?? root.getBoundingClientRect().top);

export function captureCardScrollPosition(root: HTMLElement, container: HTMLElement = root): CardScrollPosition {
  const top = root.getBoundingClientRect().top;
  const visibleTop = toolbarBottom(root, container);
  const visible = occurrences(container).find((element) => element.getBoundingClientRect().bottom > visibleTop)
    ?? Array.from(container.querySelectorAll<HTMLElement>('[data-workflow-date]')).find((element) => element.getBoundingClientRect().bottom > visibleTop);
  return { scrollTop: root.scrollTop, occurrenceKey: visible?.dataset.workflowOccurrence
    ?? (visible?.dataset.workflowDate ? `date:${visible.dataset.workflowDate}` : null),
    offset: visible ? visible.getBoundingClientRect().top - top : 0 };
}
export function restoreCardScrollPosition(root: HTMLElement, position: CardScrollPosition, container: HTMLElement = root) {
  const element = position.occurrenceKey?.startsWith('date:')
    ? Array.from(container.querySelectorAll<HTMLElement>('[data-workflow-date]')).find((candidate) => `date:${candidate.dataset.workflowDate}` === position.occurrenceKey)
    : position.occurrenceKey ? occurrences(container).find((candidate) => candidate.dataset.workflowOccurrence === position.occurrenceKey) : null;
  root.scrollTop = position.scrollTop;
  if (element) root.scrollTop += element.getBoundingClientRect().top - root.getBoundingClientRect().top - position.offset;
}

interface Props {
  container: RefObject<HTMLElement | null>;
  active: boolean;
  query: string;
  anchorDate: string;
  startDate: string;
  onExpand: () => boolean;
}
/** Native scrolling belongs to the nearest page frame; pixel positions never enter React state. */
export function useShiftWorkflowCardScroll({ container, active, query, anchorDate, startDate, onExpand }: Props) {
  const searching = Boolean(query.trim());
  const root = useRef<HTMLElement | null>(null);
  const onExpandRef = useRef(onExpand);
  const savedWindow = useRef<CardScrollPosition | null>(null);
  const pending = useRef<{ kind: 'restore'; position: CardScrollPosition } | { kind: 'anchor' } | null>(null);
  const previous = useRef<{ anchorDate: string; query: string; active: boolean } | null>(null);
  const lastTop = useRef(0);
  const expandedWindow = useRef<string | null>(null);
  const committedWindow = useRef(startDate);

  const capture = () => root.current && container.current ? captureCardScrollPosition(root.current, container.current) : null;
  const restore = (position: CardScrollPosition | null) => { if (position) pending.current = { kind: 'restore', position }; };
  const rememberWindow = () => { savedWindow.current = capture(); };
  const restoreWindow = () => restore(savedWindow.current);
  const jumpToAnchor = () => { savedWindow.current = null; pending.current = { kind: 'anchor' }; };

  useLayoutEffect(() => {
    onExpandRef.current = onExpand;
    if (committedWindow.current !== startDate) { expandedWindow.current = null; committedWindow.current = startDate; }
    const content = container.current;
    const frame = content?.closest<HTMLElement>('.nodu-page-frame');
    root.current = frame ?? null;
    if (!content || !frame) return;
    const before = previous.current;
    const movedAnchor = before?.anchorDate !== anchorDate;
    const movedQuery = before?.query !== query;
    previous.current = { anchorDate, query, active };
    if (!active) return;
    const action = pending.current;
    pending.current = null;
    if (action?.kind === 'restore') restoreCardScrollPosition(frame, action.position, content);
    else if (!before || movedAnchor || movedQuery || action?.kind === 'anchor') {
      const dateMarkers = Array.from(content.querySelectorAll<HTMLElement>('[data-workflow-date]'));
      const target = searching ? occurrences(content)[0]
        : dateMarkers.find((marker) => (marker.dataset.workflowDate ?? '') >= anchorDate);
      if (target) frame.scrollTop += target.getBoundingClientRect().top - toolbarBottom(frame, content) - 12;
    }
    lastTop.current = frame.scrollTop;
  });

  useLayoutEffect(() => {
    const frame = root.current;
    const content = container.current;
    if (!active || searching || !frame || !content) return;
    let live = true;
    const onScroll = () => {
      if (!live) return;
      const top = frame.scrollTop;
      const upward = top < lastTop.current;
      lastTop.current = top;
      const nearStart = content.getBoundingClientRect().top <= frame.getBoundingClientRect().top + toolbarHeight(content) + 160
        && top <= content.offsetTop + toolbarHeight(content) + 160;
      if (!upward || !nearStart || expandedWindow.current === startDate) return;
      expandedWindow.current = startDate;
      const position = captureCardScrollPosition(frame, content);
      pending.current = { kind: 'restore', position };
      if (!onExpandRef.current()) { pending.current = null; expandedWindow.current = null; }
    };
    frame.addEventListener('scroll', onScroll, { passive: true });
    return () => { live = false; frame.removeEventListener('scroll', onScroll); };
  }, [active, searching, startDate, container]);

  return { capture, restore, rememberWindow, restoreWindow, jumpToAnchor };
}
