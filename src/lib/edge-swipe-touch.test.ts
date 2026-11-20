import { fireEvent } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { listenForEdgeSwipe } from './edge-swipe-touch';

it('routes a window-targeted edge swipe to the screen under the finger for the whole gesture', () => {
  const detail = document.createElement('div');
  const editor = document.createElement('div');
  const dialog = document.createElement('div');
  document.body.append(detail, editor, dialog);
  const handlers = () => ({ start: vi.fn(() => true), move: vi.fn(), end: vi.fn(), cancel: vi.fn() });
  const detailSwipe = handlers();
  const editorSwipe = handlers();
  const stopDetail = listenForEdgeSwipe(detail, detailSwipe);
  const stopEditor = listenForEdgeSwipe(editor, editorSwipe);
  const descriptor = Object.getOwnPropertyDescriptor(document, 'elementFromPoint');
  const hit = vi.fn<() => Element | null>();
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: hit });
  const start = () => fireEvent.touchStart(window, { touches: [{ clientX: 5, clientY: 90 }] });
  const move = () => fireEvent.touchMove(window, { touches: [{ clientX: 64, clientY: 92 }] });
  const end = () => fireEvent.touchEnd(window, { changedTouches: [{ clientX: 75, clientY: 92 }] });
  try {
    hit.mockReturnValue(editor);
    start();
    hit.mockReturnValue(detail);
    move();
    end();
    expect(detailSwipe.start).not.toHaveBeenCalled();
    expect(editorSwipe.start).toHaveBeenCalledWith(5, 90, editor);
    expect(editorSwipe.move).toHaveBeenCalledOnce();
    expect(editorSwipe.end).toHaveBeenCalledOnce();

    hit.mockReturnValue(dialog);
    start(); end();
    editor.append(dialog);
    dialog.setAttribute('role', 'dialog');
    start(); end();
    hit.mockReturnValue(null);
    start(); end();
    expect(detailSwipe.start).not.toHaveBeenCalled();
    expect(editorSwipe.start).toHaveBeenCalledOnce();

    stopEditor();
    start(); end();
    expect(detailSwipe.end).toHaveBeenCalledOnce();
  } finally {
    stopEditor();
    stopDetail();
    if (descriptor) Object.defineProperty(document, 'elementFromPoint', descriptor);
    else Reflect.deleteProperty(document, 'elementFromPoint');
    detail.remove(); editor.remove(); dialog.remove();
  }
});
