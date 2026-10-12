import React, { useRef, useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useShiftWorkflowCardScroll } from './useShiftWorkflowCardScroll';

const rect = (top: number, height = 100) => ({ top, bottom: top + height, height, x: 0, y: top, left: 0, right: 100, width: 100, toJSON: () => ({}) });
let cardTop = 100;
let dateTop = 500;
let toolbarTop = 0;
function Fixture({ active = true, query = '', owner = 'one', empty = false }: { active?: boolean; query?: string; owner?: string; empty?: boolean }) {
  return <Session key={owner} active={active} query={query} empty={empty} />;
}
function Session({ active, query, empty }: { active: boolean; query: string; empty: boolean }) {
  const container = useRef<HTMLDivElement>(null);
  const [startDate, setStartDate] = useState('2026-10-05');
  const scroll = useShiftWorkflowCardScroll({ container, active, query, anchorDate: '2026-10-12', startDate,
    onExpand: () => { if (startDate !== '2026-10-05') return false; cardTop = 350; dateTop = 750; setStartDate('2026-09-21'); return true; } });
  return <div className="nodu-page-frame" data-testid="scroll-root" ref={(element) => {
    if (element) { element.getBoundingClientRect = () => rect(0, 600); Object.defineProperty(element, 'clientHeight', { value: 600, configurable: true }); }
  }}>
    <div ref={container}>
      <div data-workflow-toolbar ref={(element) => { if (element) element.getBoundingClientRect = () => rect(toolbarTop, 80); }}>Toolbar</div>
      <div data-workflow-date="2026-10-12" ref={(element) => { if (element) element.getBoundingClientRect = () => rect(dateTop, 40); }}>Dnes</div>
      {!empty && <div data-workflow-occurrence="shift|2026-10-12" ref={(element) => { if (element) element.getBoundingClientRect = () => rect(cardTop); }}>Card</div>}
      <button onClick={scroll.rememberWindow}>Remember</button>
      <button onClick={scroll.restoreWindow}>Restore</button>
      <button onClick={() => { cardTop = 100; dateTop = 500; scroll.jumpToAnchor(); setStartDate('2026-10-05'); }}>Jump</button>
      <output>{startDate}</output>
    </div>
  </div>;
}
afterEach(() => { cardTop = 100; dateTop = 500; toolbarTop = 0; vi.restoreAllMocks(); });
describe('useShiftWorkflowCardScroll', () => {
  it('aligns today below the sticky toolbar in the closest page frame', () => {
    render(<Fixture />);
    expect(screen.getByTestId('scroll-root').scrollTop).toBe(408);
  });
  it('accounts for a nonzero sticky inset and keeps the date heading clear of the toolbar', () => {
    toolbarTop = 16; render(<Fixture />);
    expect(screen.getByTestId('scroll-root').scrollTop).toBe(392);
  });
  it('preserves a visible occurrence by its geometry when history is prepended', () => {
    render(<Fixture />); const root = screen.getByTestId('scroll-root');
    root.scrollTop = 110; fireEvent.scroll(root);
    expect(screen.getByText('2026-09-21')).toBeInTheDocument();
    expect(root.scrollTop).toBe(360);
  });
  it('expands only for upward user movement and at most once for a committed window', () => {
    render(<Fixture />); const root = screen.getByTestId('scroll-root');
    fireEvent.scroll(root); fireEvent.scroll(root); expect(screen.getByText('2026-10-05')).toBeInTheDocument();
    root.scrollTop = 450; fireEvent.scroll(root); expect(screen.getByText('2026-10-05')).toBeInTheDocument();
    root.scrollTop = 110; fireEvent.scroll(root); fireEvent.scroll(root); expect(screen.getByText('2026-09-21')).toBeInTheDocument(); expect(root.scrollTop).toBe(360);
  });
  it('keeps the date anchor in place when the prepared week has no cards and the first older batch appears', () => {
    render(<Fixture empty />); const root = screen.getByTestId('scroll-root');
    expect(root.scrollTop).toBe(408);
    root.scrollTop = 110; fireEvent.scroll(root);
    expect(screen.getByText('2026-09-21')).toBeInTheDocument();
    expect(root.scrollTop).toBe(360);
    fireEvent.scroll(root); expect(root.scrollTop).toBe(360);
  });
  it('allows history expansion after a date jump revisits a previously expanded window', () => {
    render(<Fixture />); const root = screen.getByTestId('scroll-root');
    root.scrollTop = 110; fireEvent.scroll(root); expect(screen.getByText('2026-09-21')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Jump' })); expect(screen.getByText('2026-10-05')).toBeInTheDocument();
    root.scrollTop = 110; fireEvent.scroll(root); expect(screen.getByText('2026-09-21')).toBeInTheDocument();
  });
  it('suspends history during search and summary, then restores the remembered occurrence and offset', () => {
    const { rerender } = render(<Fixture />); const root = screen.getByTestId('scroll-root');
    root.scrollTop = 300; fireEvent.click(screen.getByRole('button', { name: 'Remember' }));
    rerender(<Fixture query="Card" />); root.scrollTop = 50; fireEvent.scroll(root); expect(screen.getByText('2026-10-05')).toBeInTheDocument();
    act(() => { cardTop = 200; }); fireEvent.click(screen.getByRole('button', { name: 'Restore' })); rerender(<Fixture />);
    expect(root.scrollTop).toBe(400);
    rerender(<Fixture active={false} />); root.scrollTop = 20; fireEvent.scroll(root); expect(screen.getByText('2026-10-05')).toBeInTheDocument();
  });
  it('retires listeners and saved positions with the old owner', () => {
    const { rerender } = render(<Fixture />); const oldRoot = screen.getByTestId('scroll-root');
    fireEvent.click(screen.getByRole('button', { name: 'Remember' })); rerender(<Fixture owner="two" />);
    oldRoot.scrollTop = 10; fireEvent.scroll(oldRoot); expect(screen.getByText('2026-10-05')).toBeInTheDocument();
    expect(screen.getByTestId('scroll-root').scrollTop).toBe(408);
  });
});
