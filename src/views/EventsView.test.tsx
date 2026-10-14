import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mobileMockState = vi.hoisted(() => ({ isMobile: false }));

const workflowBoundary = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn(), events: vi.fn(), reports: vi.fn(), invoices: vi.fn() }));

const workflowId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const workflowSnapshot = () => ({ revision: 1, workflows: [], rounds: [], assignedEventIds: [] });
const workflowEvents = [
  { id: 21, supabaseId: workflowId(21), name: 'Přípravy', job: 'JOB', startDate: '2026-05-12', endDate: '2026-05-12', city: 'Praha', client: 'Klient', needed: 2, filled: 0, status: 'upcoming' as const },
  { id: 22, supabaseId: workflowId(22), name: 'Instalace', job: 'JOB', startDate: '2026-05-12', endDate: '2026-05-14', city: 'Praha', client: 'Klient', needed: 2, filled: 0, status: 'upcoming' as const },
  { id: 23, supabaseId: workflowId(23), name: 'Starší přípravy', job: 'OLD', startDate: '2026-04-20', endDate: '2026-04-20', city: 'Praha', client: 'Klient', needed: 2, filled: 0, status: 'past' as const },
].map((event) => ({ ...event, updatedAt: '2026-05-12T11:00:00Z' }));

function held<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe('mobile workflow selection in the actual events overview', () => {
  const clients: QueryClient[] = [];
  let context: typeof mockAppContext;
  let presentation = workflowEvents;
  let crewName = 'Zachycený Petr';
  beforeEach(() => {
    vi.resetModules(); vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-05-12T12:00:00'));
    mobileMockState.isMobile = true; presentation = workflowEvents; crewName = 'Zachycený Petr';
    context = { ...mockAppContext, role: 'crewhead', eventsFilter: 'all', eventsCalendarDate: '2026-05-12', searchQuery: '' };
    workflowBoundary.read.mockResolvedValue(workflowSnapshot()); workflowBoundary.save.mockResolvedValue({});
    workflowBoundary.events.mockResolvedValue(workflowEvents); workflowBoundary.reports.mockResolvedValue([]); workflowBoundary.invoices.mockResolvedValue([]);
    vi.doMock('../lib/app-config', () => ({ appDataSource: 'supabase' }));
    vi.doMock('../app/providers/useAuth', () => ({ useAuth: () => ({ currentUserId: workflowId(1), currentProfileId: workflowId(2), role: context.role, isAuthenticated: true, isLoading: false, isRoleSwitching: false }) }));
    vi.doMock('../context/useAppContext', () => ({ useAppContext: () => context }));
    vi.doMock('../features/events/queries/useEventsQuery', () => ({ useEventsQuery: () => ({ data: presentation, isLoading: false, error: null }) }));
    vi.doMock('../features/shift-workflows/shift-workflows.gateway', () => ({ readShiftWorkflowSnapshot: workflowBoundary.read, saveShiftWorkflow: workflowBoundary.save }));
    vi.doMock('../features/events/services/events.service', async () => {
      const actual = await vi.importActual<typeof import('../features/events/services/events.service')>('../features/events/services/events.service');
      return { ...actual, fetchEventsSnapshot: workflowBoundary.events, getEventDetailData: (id: string) => ({
        event: presentation.find((event) => event.supabaseId === id), timelogs: [], applications: [], contractors: [], receipts: [],
        crewAssignments: [{ eventId: 21, eventSupabaseId: id, contractorProfileId: workflowId(99), name: crewName }],
      }) };
    });
    vi.doMock('../features/timelogs/services/timelogs.service', () => ({ fetchTimelogsSnapshot: workflowBoundary.reports }));
    vi.doMock('../features/invoices/services/invoices.service', () => ({ fetchInvoicesSnapshot: workflowBoundary.invoices }));
    vi.doMock('./EventDetailView', () => ({ default: () => null }));
    vi.doMock('../components/modals/EventEditModal', () => ({ default: () => null }));
  });
  afterEach(() => { clients.splice(0).forEach((client) => client.clear()); vi.useRealTimers(); vi.restoreAllMocks(); });
  async function setup(role = 'crewhead') {
    context.role = role;
    const { default: EventsView } = await import('./EventsView');
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client);
    const tree = () => <QueryClientProvider client={client}><div className="nodu-page-frame" data-testid="frame"><EventsView /></div></QueryClientProvider>;
    return { ...render(tree()), tree, client };
  }
  const cards = () => Array.from(document.querySelectorAll<HTMLElement>('[data-workflow-occurrence]'));
  const sameCards = (before: HTMLElement[]) => {
    const after = cards(); expect(after).toHaveLength(before.length);
    after.forEach((card, i) => expect(card).toBe(before[i]));
  };
  const simulatedSearchHeight = 60;
  // Simulated normal flow: inline search adds height; toolbar, controls and cards move with frame scroll.
  function measureOverview(withReasonLayout = false, compactFrame = false) {
    const actual = HTMLElement.prototype.getBoundingClientRect;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const frame = this.closest<HTMLElement>('.nodu-page-frame');
      const index = cards().indexOf(this);
      const selecting = Boolean(document.querySelector('.nodu-mobile-workflow-selection'));
      const cardIndex = index >= 0 ? index : cards().indexOf(this.closest<HTMLElement>('[data-workflow-occurrence]')!);
      const reasonShift = withReasonLayout && cardIndex >= 0 ? cards().slice(0, cardIndex).reduce((sum, card) => sum + (card.hasAttribute('aria-describedby') ? 48 : 0), 0) : 0;
      const addedSearchHeight = selecting ? simulatedSearchHeight : 0;
      const scrollTop = frame?.scrollTop ?? 0;
      const cardPosition = (compactFrame ? 213 : 160) + addedSearchHeight + cardIndex * 220 + reasonShift - scrollTop;
      const toolbar = this.closest<HTMLElement>('.nodu-mobile-events-toolbar');
      const isToolbar = this === toolbar || this.hasAttribute('data-workflow-toolbar-space');
      const isTitle = this.matches('.nodu-mobile-events-header__title');
      const isHeaderControl = Boolean(this.closest('.nodu-mobile-events-header'));
      const top = this === frame ? 0 : cardIndex >= 0 ? cardPosition + (index >= 0 ? 0 : this.matches('h3') ? 54 : this.matches('p') ? 74 : 16)
        : (compactFrame ? 72 : 0) - scrollTop + (isToolbar ? 0 : isTitle ? 9 : isHeaderControl ? 0 : 52);
      const height = this === frame ? (compactFrame ? 800 : 818) : index >= 0 ? 200
        : isToolbar ? (compactFrame ? 92 : 72) + addedSearchHeight : isTitle ? 26 : isHeaderControl ? 44 : toolbar ? 32 : 16;
      const frameWidth = compactFrame ? 368 : 393;
      const width = isTitle ? 72 : toolbar && !isToolbar ? (isHeaderControl ? 44 : 56) : frameWidth;
      const left = isTitle ? (frameWidth - width) / 2 : this.matches('.nodu-mobile-events-header__action--right') ? frameWidth - width : 0;
      if (this === frame || cardIndex >= 0 || toolbar || isToolbar) return { x: left, y: top, top, bottom: top + height, left, right: left + width, width, height, toJSON: () => ({}) };
      return actual.call(this);
    });
  }

  it.each(['crewhead', 'coo'])('keeps ordinary toolbar presentation while selecting as %s', async (role) => {
    const read = held<typeof workflowEvents>(); workflowBoundary.events.mockReturnValue(read.promise);
    await setup(role);
    const title = screen.getByRole('heading', { name: 'Akce' });
    const toolbar = title.closest<HTMLElement>('.nodu-mobile-events-toolbar')!;
    const space = toolbar.parentElement!;
    const dateButton = screen.getByRole('button', { name: 'Vybrat datum akci' });
    const allFilter = screen.getByRole('button', { name: 'Vse' });
    const normalToolbarClass = toolbar.className, normalSpaceClass = space.className, before = cards();
    const normalDateButtonClass = dateButton.className, normalAllFilterClass = allFilter.className;
    const assertNormalToolbar = () => {
      const currentTitle = screen.getByRole('heading', { name: 'Akce' });
      const currentToolbar = currentTitle.closest<HTMLElement>('.nodu-mobile-events-toolbar')!;
      const currentSpace = currentToolbar.parentElement!;
      const currentDateButton = screen.getByRole('button', { name: 'Vybrat datum akci' });
      const currentAllFilter = screen.getByRole('button', { name: 'Vse' });
      expect(currentTitle).toBe(title);
      expect(currentToolbar).toBe(toolbar);
      expect(currentSpace).toBe(space);
      expect(currentDateButton).toBe(dateButton);
      expect(currentAllFilter).toBe(allFilter);
      expect(currentToolbar.className).toBe(normalToolbarClass);
      expect(currentSpace.className).toBe(normalSpaceClass);
      expect(currentDateButton.className).toBe(normalDateButtonClass);
      expect(currentAllFilter.className).toBe(normalAllFilterClass);
      [currentTitle, currentToolbar, currentSpace, currentDateButton, currentAllFilter].forEach((element) => {
        expect(element.isConnected).toBe(true);
        expect(document.contains(element)).toBe(true);
      });
    };

    fireEvent.click(screen.getByRole('button', { name: 'Propojit směny' }));
    assertNormalToolbar();
    expect(toolbar).toHaveAttribute('data-workflow-toolbar');
    expect(space).toHaveAttribute('data-workflow-toolbar-space');
    expect(toolbar).not.toHaveClass('nodu-mobile-workflow-selection__toolbar');
    expect(space).not.toHaveClass('nodu-workflow-selection__toolbar-space');
    const search = screen.getByRole('searchbox', { name: 'Hledat směnu nebo jobnumber' });
    expect(search).not.toHaveFocus();
    expect(allFilter.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Zrušit' }).closest('[data-workflow-bar]')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pokračovat' })).toBeInTheDocument();
    sameCards(before);

    await act(async () => read.resolve(workflowEvents));
    await waitFor(() => expect(workflowBoundary.events).toHaveBeenCalledOnce());
    assertNormalToolbar();
    expect(toolbar).toHaveAttribute('data-workflow-toolbar');
    expect(space).toHaveAttribute('data-workflow-toolbar-space');
    sameCards(before);

    fireEvent.click(screen.getByRole('button', { name: 'Zrušit' }));
    assertNormalToolbar();
    expect(toolbar).not.toHaveAttribute('data-workflow-toolbar');
    expect(space).not.toHaveAttribute('data-workflow-toolbar-space');
    sameCards(before);
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(workflowBoundary.save).not.toHaveBeenCalled();
  });

  it.each([
    { role: 'crewhead', entryScroll: 0 }, { role: 'crewhead', entryScroll: 137 },
    { role: 'coo', entryScroll: 0 }, { role: 'coo', entryScroll: 137 },
  ])('keeps the simulated flow header as $role at scrollTop=$entryScroll and restores the normal snapshot on cancel', async ({ role, entryScroll }) => {
    const read = held<typeof workflowEvents>(); workflowBoundary.events.mockReturnValue(read.promise);
    await setup(role); measureOverview(false, true); const frame = screen.getByTestId('frame');
    let flowTop = 0; Object.defineProperty(frame, 'scrollTop', { configurable: true, get: () => flowTop, set: (value: number) => { flowTop = Math.max(0, value); } });
    frame.scrollTop = entryScroll;
    const before = cards(); const first = before[0]; const normalOffset = first.getBoundingClientRect().top;
    const toolbar = screen.getByRole('heading', { name: 'Akce' }).closest<HTMLElement>('.nodu-mobile-events-toolbar')!;
    const controls = [screen.getByRole('heading', { name: 'Akce' }), screen.getByRole('button', { name: 'Vybrat datum akci' }), screen.getByRole('button', { name: 'Vse' })];
    const controlRects = () => controls.map((element) => {
      const { top, bottom, left, right, width, height } = element.getBoundingClientRect();
      return { top, bottom, left, right, width, height };
    });
    const normalControls = controlRects(), normalToolbar = toolbar.getBoundingClientRect();
    const normalGap = normalOffset - normalToolbar.bottom;
    const assertFlowHeader = () => {
      expect(frame.scrollTop).toBe(entryScroll);
      expect(toolbar.getBoundingClientRect().top).toBe(normalToolbar.top);
      expect(controlRects()).toEqual(normalControls);
    };
    const selectedDate = first.dataset.workflowOccurrence!.slice(-10);
    fireEvent.click(screen.getByRole('button', { name: 'Propojit směny' }));
    assertFlowHeader();
    fireEvent.scroll(frame); fireEvent.scroll(frame); sameCards(before);
    assertFlowHeader();
    expect(document.querySelector('[data-workflow-start-date]')).toHaveAttribute('data-workflow-start-date', '2026-05-12');
    expect(toolbar.getBoundingClientRect().height).toBe(normalToolbar.height + simulatedSearchHeight);
    expect(first.getBoundingClientRect().top).toBe(normalOffset + simulatedSearchHeight);
    expect(first.getBoundingClientRect().top - toolbar.getBoundingClientRect().bottom).toBe(normalGap);
    expect(first.getBoundingClientRect().top).toBeGreaterThanOrEqual(toolbar.getBoundingClientRect().bottom);
    expect(within(first).getByRole('heading').getBoundingClientRect().top).toBeGreaterThanOrEqual(toolbar.getBoundingClientRect().bottom);
    expect(within(first).getByText('JOB').getBoundingClientRect().top).toBeGreaterThanOrEqual(toolbar.getBoundingClientRect().bottom);
    within(first).getAllByText(/12\. 5\. 2026/).forEach((date) => expect(date.getBoundingClientRect().top).toBeGreaterThanOrEqual(toolbar.getBoundingClientRect().bottom));
    expect(first.dataset.workflowOccurrence).toContain(selectedDate); expect(document.querySelector('[data-workflow-start-date]')).toHaveAttribute('data-workflow-start-date', '2026-05-12');
    expect(screen.getByRole('searchbox')).not.toHaveFocus();
    expect(screen.getByRole('searchbox')).toHaveValue(''); expect(screen.getByRole('button', { name: 'Vse' })).toHaveClass('text-[color:var(--nodu-accent)]');
    const entryOffset = first.getBoundingClientRect().top; fireEvent.click(before[0]); fireEvent.click(before[1]);
    await act(async () => read.resolve(workflowEvents)); await waitFor(() => expect(screen.getByRole('button', { name: 'Pokračovat' })).toBeEnabled());
    assertFlowHeader();
    sameCards(before); expect(first.getBoundingClientRect().top).toBe(entryOffset);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'OLD' } }); fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } });
    const restored = cards()[0]; expect(restored.getBoundingClientRect().top).toBe(entryOffset);
    const summaryCards = cards(); fireEvent.click(screen.getByRole('button', { name: 'Pokračovat' })); fireEvent.click(screen.getByRole('button', { name: 'Zpět k výběru' }));
    fireEvent.scroll(frame); sameCards(summaryCards);
    expect(document.querySelector('[data-workflow-start-date]')).toHaveAttribute('data-workflow-start-date', '2026-05-12');
    expect(restored.getBoundingClientRect().top).toBe(entryOffset); expect(frame.getBoundingClientRect()).toMatchObject({ width: 368, height: 800 });
    fireEvent.click(screen.getByRole('button', { name: 'Zrušit' })); expect(frame.scrollTop).toBe(entryScroll); expect(cards()[0].getBoundingClientRect().top).toBe(normalOffset);
    assertFlowHeader(); expect(toolbar.getBoundingClientRect().height).toBe(normalToolbar.height); sameCards(summaryCards);
    expect(workflowBoundary.save).not.toHaveBeenCalled();
  });
  it.each([{ query: 'Přípravy', scroll: 0, count: 1 }, { query: 'JOB', scroll: 100, count: 4 }])('clears inherited query $query back to the current selected flow window', async ({ query, scroll, count }) => {
    context.searchQuery = query; await setup(); measureOverview(false, true);
    const frame = screen.getByTestId('frame'); let nativeTop = 0;
    Object.defineProperty(frame, 'scrollTop', { configurable: true, get: () => nativeTop, set: (value: number) => { nativeTop = Math.max(0, value); } });
    const normalOffset = cards()[0].getBoundingClientRect().top;
    fireEvent.click(screen.getByRole('button', { name: 'Propojit směny' })); const entryOffset = cards()[0].getBoundingClientRect().top;
    expect(entryOffset).toBeGreaterThanOrEqual(document.querySelector<HTMLElement>('[data-workflow-toolbar]')!.getBoundingClientRect().bottom);
    const occurrenceKey = cards()[0].dataset.workflowOccurrence;
    frame.scrollTop += scroll; fireEvent.scroll(frame); const localOffset = cards()[0].getBoundingClientRect().top;
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } });
    const originalOccurrence = cards().find((card) => card.dataset.workflowOccurrence === occurrenceKey)!;
    expect(originalOccurrence.getBoundingClientRect().top).toBe(localOffset); expect(cards()).toHaveLength(4);
    fireEvent.click(screen.getByRole('button', { name: 'Zrušit' })); expect(cards()).toHaveLength(count); expect(frame.scrollTop).toBe(0); expect(cards()[0].getBoundingClientRect().top).toBe(normalOffset);
  });

  it.each(['crewhead', 'coo'])('selects immediately for %s while preserving the real May 12 cards, date, filter, and position', async (role) => {
    vi.setSystemTime(new Date('2026-05-20T12:00:00'));
    const read = held<typeof workflowEvents>(); workflowBoundary.events.mockReturnValue(read.promise);
    const { rerender, tree } = await setup(role);
    fireEvent.click(screen.getByRole('button', { name: 'Vybrat datum akci' }));
    fireEvent.click(screen.getByRole('button', { name: 'Zobrazit akce od 12. května 2026' }));
    expect(mockAppContext.setEventsCalendarDate).toHaveBeenCalledWith('2026-05-12'); mockAppContext.setEventsCalendarDate.mockClear();
    measureOverview();
    const frame = screen.getByTestId('frame'); frame.scrollTop = 137;
    const before = cards(); const keys = before.map((card) => card.dataset.workflowOccurrence);
    const normalVisiblePosition = before[0].getBoundingClientRect().top;
    expect(before).toHaveLength(4);
    fireEvent.click(screen.getByRole('button', { name: 'Propojit směny' }));
    const visiblePosition = normalVisiblePosition + simulatedSearchHeight;
    expect(frame.scrollTop).toBe(137);
    sameCards(before); expect(cards().map((card) => card.dataset.workflowOccurrence)).toEqual(keys); expect(before[0].getBoundingClientRect().top).toBe(visiblePosition); expect(frame.getBoundingClientRect().height).toBe(818);
    expect(screen.queryByRole('heading', { name: 'Propojit směny' })).not.toBeInTheDocument();
    expect(screen.queryByText('Načítání propojení…')).not.toBeInTheDocument(); expect(screen.queryByText('Vyberte alespoň dvě směny.')).not.toBeInTheDocument();
    expect(document.querySelector('input[type="date"]')).toBeNull();
    const search = screen.getByRole('searchbox', { name: 'Hledat směnu nebo jobnumber' }); expect(search).not.toHaveFocus();
    expect(screen.getByRole('button', { name: 'Vse' }).compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Nova akce' })).not.toBeInTheDocument();
    fireEvent.click(before[0]); fireEvent.click(before[1]); expect(screen.getByText('Vybráno: 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pokračovat' })).toBeDisabled();
    presentation = workflowEvents.map((event) => ({ ...event, name: 'Nová publikace', endDate: '2026-05-19' })); crewName = 'Živá Jana'; rerender(tree());
    sameCards(before); expect(within(before[0]).getByText('Zachycený Petr')).toBeInTheDocument(); expect(screen.queryByText('Živá Jana')).not.toBeInTheDocument();
    await act(async () => read.resolve(workflowEvents));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Pokračovat' })).toBeEnabled());
    sameCards(before); expect(before[0].getBoundingClientRect().top).toBe(visiblePosition); expect(frame.getBoundingClientRect().height).toBe(818); expect(before[0]).toBeChecked(); expect(before[1]).toBeChecked();
    expect(mockAppContext.setEventsFilter).not.toHaveBeenCalled(); expect(mockAppContext.setEventsCalendarDate).not.toHaveBeenCalled(); expect(workflowBoundary.save).not.toHaveBeenCalled();
  });

  it('keeps marks through a read failure/retry, summary/back, local filters/search/date, and restores entry on cancel', async () => {
    const read = held<typeof workflowEvents>(); workflowBoundary.events.mockReturnValueOnce(read.promise);
    await setup(); const before = cards(); const frame = screen.getByTestId('frame'); frame.scrollTop = 91;
    fireEvent.click(screen.getByRole('button', { name: 'Propojit směny' })); fireEvent.click(before[0]); fireEvent.click(before[1]);
    await act(async () => read.reject(new Error('offline')));
    expect(await screen.findByRole('alert')).toHaveTextContent(/nepodařilo/); sameCards(before); expect(screen.getByText('Vybráno: 2')).toBeInTheDocument();
    expect(within(document.querySelector<HTMLElement>('[data-workflow-bar]')!).getByRole('alert')).toHaveTextContent(/nepodařilo/);
    expect(within(document.querySelector<HTMLElement>('[data-workflow-bar]')!).getByRole('button', { name: 'Zkusit načíst znovu' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Zkusit načíst znovu' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Pokračovat' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Pokračovat' })); expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Zpět k výběru' })); sameCards(before); expect(frame.scrollTop).toBe(91);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'OLD' } }); expect(cards()).toHaveLength(1); expect(screen.getByText('Starší přípravy')).toBeInTheDocument(); expect(screen.getByText('Vybráno: 2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Nadchazejici' })); expect(cards()).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Vse' }));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } }); expect(cards()).toHaveLength(4); expect(frame.scrollTop).toBe(91);
    fireEvent.click(screen.getByRole('button', { name: 'Vybrat datum akci' })); fireEvent.click(screen.getByRole('button', { name: 'Zobrazit akce od 14. května 2026' }));
    expect(cards()).toHaveLength(1); expect(cards()[0]).toBeChecked(); expect(screen.getByText('Vybráno: 2')).toBeInTheDocument();
    expect(mockAppContext.setEventsCalendarDate).not.toHaveBeenCalled(); expect(mockAppContext.setEventsFilter).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Zrušit' })); expect(screen.queryByRole('searchbox')).not.toBeInTheDocument(); expect(cards()).toHaveLength(4); expect(frame.scrollTop).toBe(91); expect(workflowBoundary.save).not.toHaveBeenCalled();
  });
  it.each(['missing', 'invalid', 'approval'] as const)('retains a %s provisional mark on the same real card with a visible reason and fails closed', async (problem) => {
    const read = held<typeof workflowEvents>(); workflowBoundary.events.mockReturnValue(read.promise);
    if (problem === 'invalid') presentation = workflowEvents.map((event, i) => i === 0 ? { ...event, supabaseId: 'not-a-server-id' } : event);
    if (problem === 'approval') workflowBoundary.reports.mockResolvedValue([{ id: 100, eid: 21, eventSupabaseId: workflowId(21), contractorProfileId: workflowId(99), status: 'pending_ch', days: [], km: 0, note: '' }]);
    await setup(); const before = cards(); fireEvent.click(screen.getByRole('button', { name: 'Propojit směny' })); fireEvent.click(before[0]); fireEvent.click(before[1]);
    await act(async () => read.resolve(problem === 'missing' ? workflowEvents.slice(1) : workflowEvents));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument()); sameCards(before);
    const provisional = before.find((card) => card.dataset.workflowOccurrence?.startsWith(problem === 'invalid' ? 'not-a-server-id|' : `${workflowId(21)}|`))!;
    expect(provisional).toBeChecked(); expect(provisional).toHaveAttribute('aria-disabled', 'false');
    expect(within(provisional).getByText(problem === 'approval' ? /schvalování/ : /není dostupná/)).toBeInTheDocument();
    expect(screen.getByText('Vybráno: 2')).toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Pokračovat' })).toBeDisabled();
    fireEvent.click(provisional); expect(screen.getByText('Vybráno: 1')).toBeInTheDocument(); expect(workflowBoundary.save).not.toHaveBeenCalled();
  });
  it.each([1, 2] as const)('keeps inclusive v%s multiday copies stable and counts the event once', async (scheduleVersion) => {
    presentation = workflowEvents.map((event, i) => i === 1 ? { ...event, scheduleVersion } : event);
    await setup(); const before = cards(); fireEvent.click(screen.getByRole('button', { name: 'Propojit směny' }));
    await waitFor(() => expect(workflowBoundary.events).toHaveBeenCalledOnce()); sameCards(before);
    const copies = screen.getAllByRole('checkbox', { name: /Instalace · JOB/ }); expect(copies).toHaveLength(3);
    fireEvent.click(copies[1]); expect(copies.every((copy) => copy.getAttribute('aria-checked') === 'true')).toBe(true); expect(screen.getByText('Vybráno: 1')).toBeInTheDocument();
    const preparations = before.find((card) => card.dataset.workflowOccurrence?.startsWith(`${workflowId(21)}|`))!;
    fireEvent.keyDown(preparations, { key: 'Enter' }); expect(screen.getByText('Vybráno: 2')).toBeInTheDocument();
    fireEvent.keyDown(preparations, { key: ' ' }); expect(screen.getByText('Vybráno: 1')).toBeInTheDocument();
    expect(screen.queryByTitle('Smazat akci')).not.toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'Kopirovat akci na jiny den' })).not.toBeInTheDocument(); expect(mockAppContext.setSelectedEventId).not.toHaveBeenCalled();
  });
  it('expands seven-day history through empty weeks from an upward gesture at the entry boundary', async () => {
    await setup(); const before = cards(); const frame = screen.getByTestId('frame');
    fireEvent.click(screen.getByRole('button', { name: 'Propojit směny' })); sameCards(before);
    const start = () => document.querySelector('[data-workflow-start-date]')?.getAttribute('data-workflow-start-date');
    expect(start()).toBe('2026-05-12');
    fireEvent.wheel(frame, { deltaY: -20 }); expect(start()).toBe('2026-05-05'); expect(cards()).toHaveLength(4);
    fireEvent.wheel(frame, { deltaY: -20 }); expect(start()).toBe('2026-04-28'); expect(cards()).toHaveLength(4);
    fireEvent.touchStart(frame, { touches: [{ clientY: 100 }] }); fireEvent.touchMove(frame, { touches: [{ clientY: 140 }] }); expect(start()).toBe('2026-04-21');
    fireEvent.wheel(frame, { deltaY: -20 }); expect(start()).toBe('2026-04-14'); expect(screen.getByText('Starší přípravy')).toBeInTheDocument();
    expect(screen.queryByText(/Starší směny zobrazíte/)).not.toBeInTheDocument(); expect(workflowBoundary.save).not.toHaveBeenCalled();
  });
  it('keeps all older history reachable from an empty entry date without a scrollTop decrease', async () => {
    await setup(); const frame = screen.getByTestId('frame');
    fireEvent.click(screen.getByRole('button', { name: 'Vybrat datum akci' })); fireEvent.click(screen.getByRole('button', { name: 'Zobrazit akce od 30. května 2026' }));
    expect(cards()).toHaveLength(0); fireEvent.click(screen.getByRole('button', { name: 'Propojit směny' })); expect(cards()).toHaveLength(0);
    for (const date of ['2026-05-23', '2026-05-16', '2026-05-09', '2026-05-02', '2026-04-25', '2026-04-18']) {
      expect(frame.scrollTop).toBe(0); fireEvent.wheel(frame, { deltaY: -20 });
      expect(document.querySelector('[data-workflow-start-date]')).toHaveAttribute('data-workflow-start-date', date);
    }
    expect(screen.getByText('Starší přípravy')).toBeInTheDocument(); expect(workflowBoundary.save).not.toHaveBeenCalled();
  });
  it('preserves the visible occurrence when a completed blocked read inserts a reason above it', async () => {
    const read = held<typeof workflowEvents>(); workflowBoundary.events.mockReturnValue(read.promise);
    workflowBoundary.reports.mockResolvedValue([{ id: 100, eid: 22, eventSupabaseId: workflowId(22), contractorProfileId: workflowId(99), status: 'pending_ch', days: [], km: 0, note: '' }]);
    await setup(); measureOverview(true); const frame = screen.getByTestId('frame'); frame.scrollTop = 370;
    const before = cards(); const visible = before.find((card) => card.dataset.workflowOccurrence?.startsWith(`${workflowId(21)}|`))!;
    const normalOffset = visible.getBoundingClientRect().top;
    fireEvent.click(screen.getByRole('button', { name: 'Propojit směny' })); fireEvent.click(before[0]); fireEvent.click(visible);
    expect(frame.scrollTop).toBe(370);
    expect(visible.getBoundingClientRect().top).toBe(normalOffset + simulatedSearchHeight);
    frame.scrollTop += simulatedSearchHeight; fireEvent.scroll(frame);
    expect(before[0].getBoundingClientRect().bottom).toBeLessThanOrEqual(frame.getBoundingClientRect().top);
    expect(visible.getBoundingClientRect().top).toBeGreaterThanOrEqual(frame.getBoundingClientRect().top);
    expect(visible.getBoundingClientRect().bottom).toBeLessThanOrEqual(frame.getBoundingClientRect().bottom);
    const offset = visible.getBoundingClientRect().top;
    await act(async () => read.resolve(workflowEvents)); await screen.findByRole('alert');
    expect(within(before[0]).getByText(/schvalování/)).toBeInTheDocument(); sameCards(before);
    expect(visible.getBoundingClientRect().top).toBe(offset); expect(frame.getBoundingClientRect().height).toBe(818);
    expect(screen.getByText('Vybráno: 2')).toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Pokračovat' })).toBeDisabled();
  });
  it('remembers the local window position on the first inline edit of an inherited nonempty query', async () => {
    context.searchQuery = 'Přípravy'; await setup(); measureOverview();
    const frame = screen.getByTestId('frame'); frame.scrollTop = 80;
    const entry = cards()[0]; const normalOffset = entry.getBoundingClientRect().top;
    fireEvent.click(screen.getByRole('button', { name: 'Propojit směny' }));
    const offset = normalOffset + simulatedSearchHeight;
    expect(frame.scrollTop).toBe(80);
    expect(cards()).toHaveLength(1); expect(cards()[0]).toBe(entry); expect(entry.getBoundingClientRect().top).toBe(offset);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'OLD' } }); expect(screen.getByText('Starší přípravy')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } });
    expect(cards()).toHaveLength(4); const restored = cards().find((card) => card.dataset.workflowOccurrence?.startsWith(`${workflowId(21)}|`))!;
    expect(restored.getBoundingClientRect().top).toBe(offset); expect(mockAppContext.setSearchQuery).not.toHaveBeenCalled();
  });
  it('restores the captured normal query, date, and status after external preference publication during selection', async () => {
    context.searchQuery = 'Přípravy';
    const setSearchQuery = vi.fn((query: string) => { context.searchQuery = query; });
    context = { ...context, setSearchQuery,
      setEventsFilter: vi.fn((filter: string) => { context.eventsFilter = filter; }),
      setEventsCalendarDate: vi.fn((date: string) => { context.eventsCalendarDate = date; }) };
    const { rerender, tree } = await setup(); const entry = cards().map((card) => card.dataset.workflowOccurrence);
    fireEvent.click(screen.getByRole('button', { name: 'Propojit směny' }));
    context.searchQuery = 'Instalace'; context.eventsFilter = 'past'; context.eventsCalendarDate = '2026-06-10'; rerender(tree());
    expect(cards().map((card) => card.dataset.workflowOccurrence)).toEqual(entry);
    fireEvent.click(screen.getByRole('button', { name: 'Zrušit' })); rerender(tree());
    expect(context.searchQuery).toBe('Přípravy'); expect(context.eventsFilter).toBe('all'); expect(context.eventsCalendarDate).toBe('2026-05-12');
    expect(cards().map((card) => card.dataset.workflowOccurrence)).toEqual(entry); expect(workflowBoundary.save).not.toHaveBeenCalled();
  });
  it.each(['crewhead', 'coo'])('saves through the shared command path for %s and restores the entry overview', async (role) => {
    await setup(role); const before = cards(); const frame = screen.getByTestId('frame'); frame.scrollTop = 94;
    fireEvent.click(screen.getByRole('button', { name: 'Propojit směny' })); fireEvent.click(before[0]); fireEvent.click(before[1]);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Pokračovat' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Pokračovat' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Propojit směny' }));
    await waitFor(() => expect(screen.queryByRole('searchbox')).not.toBeInTheDocument());
    sameCards(before); expect(frame.scrollTop).toBe(94); expect(workflowBoundary.save).toHaveBeenCalledOnce();
    expect(workflowBoundary.save.mock.calls[0][0]).toMatchObject({ role });
    expect(workflowBoundary.save.mock.calls[0][1]).toMatchObject({ eventIds: [workflowId(21), workflowId(22)], expectedRevision: 1 });
    expect(screen.getByRole('button', { name: 'Propojit směny' })).toHaveAttribute('aria-pressed', 'false');
  });
});

vi.mock('../app/providers/useAuth', () => ({
  useAuth: () => ({ currentProfileId: 'profile-current' }),
}));

vi.mock('../hooks/use-mobile', () => ({
  useIsMobile: () => mobileMockState.isMobile,
}));

vi.mock('../features/timelogs/queries/useTimelogsQuery', () => ({
  useTimelogsQuery: () => ({ data: [], isLoading: false, error: null }),
}));

vi.mock('../features/invoices/queries/useInvoiceApprovalsQuery', () => ({
  useInvoiceApprovalsQuery: () => ({ data: [], isLoading: false, error: null }),
}));

const mockAppContext = {
  role: 'crewhead',
  setCurrentTab: vi.fn(),
  selectedEventId: null,
  setSelectedEventId: vi.fn(),
  setSelectedContractorProfileId: vi.fn(),
  searchQuery: '',
  setSearchQuery: vi.fn(),
  setDeleteConfirm: vi.fn(),
  setEventTab: vi.fn(),
  eventsViewMode: 'list',
  setEventsViewMode: vi.fn(),
  eventsCalendarMode: 'month',
  setEventsCalendarMode: vi.fn(),
  eventsFilter: 'all',
  setEventsFilter: vi.fn(),
  eventsCalendarDate: '2026-04-20',
  setEventsCalendarDate: vi.fn(),
};

const events = [
  {
    id: 1,
    supabaseId: 'event-uuid-1',
    name: 'Akce 1',
    job: 'AK001',
    startDate: '2026-04-20',
    endDate: '2026-04-20',
    city: 'Praha',
    needed: 2,
    filled: 2,
    status: 'upcoming' as const,
    client: 'Klient A',
  },
];

const multiDayEvents = [
  {
    id: 2,
    name: 'Dvoudenni akce',
    job: 'AK002',
    startDate: '2026-04-16',
    endDate: '2026-04-17',
    startTime: '09:00',
    endTime: '17:00',
    city: 'Praha',
    needed: 1,
    filled: 0,
    status: 'upcoming' as const,
    client: 'Klient B',
  },
];

const longMultiDayEvents = [
  {
    id: 3,
    name: 'Pětidenní akce',
    job: 'AK003',
    startDate: '2026-04-16',
    endDate: '2026-04-20',
    startTime: '08:00',
    endTime: '18:00',
    city: 'Brno',
    needed: 4,
    filled: 3,
    status: 'upcoming' as const,
    client: 'Klient C',
  },
];

const monthlyEvents = [
  {
    ...events[0],
    id: 10,
    supabaseId: 'event-uuid-april',
    name: 'Dubnova akce',
    startDate: '2026-04-20',
    endDate: '2026-04-20',
  },
  {
    ...events[0],
    id: 11,
    supabaseId: 'event-uuid-may',
    name: 'Kvetnova akce',
    startDate: '2026-05-02',
    endDate: '2026-05-02',
  },
];

const eventDetail = {
  timelogs: [
    {
      id: 1,
      eid: 1,
      contractorProfileId: 'profile-1',
      days: [{ d: '2026-04-20', f: '09:00', t: '14:00', type: 'provoz' as const }],
      km: 0,
      note: '',
      status: 'draft' as const,
    },
    {
      id: 2,
      eid: 1,
      contractorProfileId: 'profile-2',
      days: [{ d: '2026-04-20', f: '09:00', t: '14:00', type: 'provoz' as const }],
      km: 0,
      note: '',
      status: 'draft' as const,
    },
  ],
  contractors: [
    { id: 1, profileId: 'profile-1', name: 'Marek Rebroš', ii: 'MR', bg: '#fff', fg: '#000', tags: [], events: 1, rate: 250, phone: '', email: '', ico: '', dic: '', bank: '', city: '', reliable: true, note: '' },
    { id: 2, profileId: 'profile-2', name: 'Jaroslav Macháč', ii: 'JM', bg: '#fff', fg: '#000', tags: [], events: 1, rate: 250, phone: '', email: '', ico: '', dic: '', bank: '', city: '', reliable: true, note: '' },
  ],
  receipts: [],
  event: events[0],
  applications: [],
  crewAssignments: [
    { eventId: 1, eventSupabaseId: 'event-uuid-1', contractorProfileId: 'profile-1', name: 'Marek Rebroš' },
    { eventId: 1, eventSupabaseId: 'event-uuid-1', contractorProfileId: 'profile-2', name: 'Jaroslav Macháč' },
  ],
};

describe('EventsView', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doUnmock('../lib/app-config');
    vi.doUnmock('../features/shift-workflows/shift-workflows.gateway');
    vi.doMock('../app/providers/useAuth', () => ({ useAuth: () => ({ currentProfileId: 'profile-current' }) }));
    mobileMockState.isMobile = false;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps v2 multiday proposal clocks blank and does not present boundaries as daily shifts', async () => {
    let v2Events = [{ ...multiDayEvents[0], scheduleVersion: 2, allowCrewTimeProposal: true }];
    vi.doMock('../context/useAppContext', () => ({ useAppContext: () => ({ ...mockAppContext, role: 'crew', eventsCalendarDate: '2026-04-16' }) }));
    vi.doMock('../features/events/queries/useEventsQuery', () => ({ useEventsQuery: () => ({ data: v2Events, isLoading: false, error: null }) }));
    vi.doMock('../features/events/services/events.service', () => ({
      createEmptyEvent: vi.fn(), createEventCopy: vi.fn(), applyForEvent: vi.fn(), requestEventWithdrawal: vi.fn(), withdrawEventApplication: vi.fn(),
      filterEventsByStatus: (items: typeof v2Events) => items.map((item) => ({ ...item, derivedStatus: 'upcoming' })),
      getEventsWithDerivedStatus: (items: typeof v2Events) => items.map((item) => ({ ...item, derivedStatus: 'upcoming' })),
      getReferenceDate: () => new Date('2026-04-16'),
      getEventDetailData: () => ({ ...eventDetail, event: v2Events[0], timelogs: [], crewAssignments: [] }),
    }));
    vi.doMock('./EventDetailView', () => ({ default: () => null }));
    vi.doMock('../components/modals/EventEditModal', () => ({ default: () => null }));
    vi.doMock('../components/modals/AssignCrewModal', () => ({ default: () => null }));
    const { default: EventsView } = await import('./EventsView');
    const queryClient = new QueryClient();
    const view = render(<QueryClientProvider client={queryClient}><EventsView /></QueryClientProvider>);
    const from = screen.getByLabelText('Planovany prichod');
    expect(from).toHaveValue('');
    expect(screen.getByLabelText('Planovany odchod')).toHaveValue('');
    expect(screen.getByText('2 dny')).toBeInTheDocument();
    expect(screen.queryByText('09:00 - 17:00')).not.toBeInTheDocument();
    fireEvent.change(from, { target: { value: '12:30' } });
    v2Events = [{ ...v2Events[0], startTime: '06:00', endTime: '23:00', endDate: '2026-04-18' }];
    view.rerender(<QueryClientProvider client={queryClient}><EventsView /></QueryClientProvider>);
    expect(from).toHaveValue('12:30');
    expect(screen.getByLabelText('Planovany odchod')).toHaveValue('');
    expect(screen.getByText('3 dny')).toBeInTheDocument();
    fireEvent.change(from, { target: { value: '' } });
    expect(from).toHaveValue('');
  });

  it('renders event list without crashing when events query is active', async () => {
    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => mockAppContext,
    }));

    vi.doMock('../features/events/queries/useEventsQuery', () => ({
      useEventsQuery: () => ({ data: events, isLoading: false, error: null }),
    }));

    vi.doMock('../features/events/services/events.service', () => ({
      createEmptyEvent: vi.fn(),
      createEventCopy: vi.fn((eventToCopy) => eventToCopy),
      applyForEvent: vi.fn(),
      requestEventWithdrawal: vi.fn(),
      withdrawEventApplication: vi.fn(),
      filterEventsByStatus: (items: typeof events) => items.map((item) => ({ ...item, derivedStatus: 'upcoming' as const })),
      getEventsWithDerivedStatus: (items: typeof events) => items.map((item) => ({ ...item, derivedStatus: 'upcoming' as const })),
      getReferenceDate: () => new Date('2026-04-20'),
      getEventDetailData: () => eventDetail,
    }));

    vi.doMock('./EventDetailView', () => ({
      default: () => <div>detail</div>,
    }));

    vi.doMock('../components/modals/EventEditModal', () => ({
      default: () => null,
    }));

    vi.doMock('../components/modals/AssignCrewModal', () => ({
      default: () => null,
    }));

    const { default: EventsView } = await import('./EventsView');
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <EventsView />
      </QueryClientProvider>,
    );

    expect(screen.getByText('Akce 1')).toBeInTheDocument();
    expect(screen.getByText('AK001')).toBeInTheDocument();
  });

  it.each(['crew', 'crewhead', 'coo'] as const)('uses the compact list-only mobile header for %s even with a saved calendar preference', async (role) => {
    mobileMockState.isMobile = true;

    const setupMocks = (role: 'crew' | 'crewhead' | 'coo') => {
      vi.doMock('../context/useAppContext', () => ({
        useAppContext: () => ({
          ...mockAppContext,
          role,
          eventsViewMode: 'calendar',
        }),
      }));

      vi.doMock('../features/events/queries/useEventsQuery', () => ({
        useEventsQuery: () => ({ data: events, isLoading: false, error: null }),
      }));

      vi.doMock('../features/events/services/events.service', () => ({
        createEmptyEvent: vi.fn(),
        createEventCopy: vi.fn((eventToCopy) => eventToCopy),
        applyForEvent: vi.fn(),
        requestEventWithdrawal: vi.fn(),
        withdrawEventApplication: vi.fn(),
        filterEventsByStatus: (items: typeof events) => items.map((item) => ({ ...item, derivedStatus: 'upcoming' as const })),
        getEventsWithDerivedStatus: (items: typeof events) => items.map((item) => ({ ...item, derivedStatus: 'upcoming' as const })),
        getReferenceDate: () => new Date('2026-04-20'),
        getEventDetailData: () => eventDetail,
      }));

      vi.doMock('./EventDetailView', () => ({
        default: () => <div>detail</div>,
      }));

      vi.doMock('../components/modals/EventEditModal', () => ({
        default: () => null,
      }));

      vi.doMock('../components/modals/AssignCrewModal', () => ({
        default: () => null,
      }));
    };

    setupMocks(role);
    const { default: CrewEventsView } = await import('./EventsView');

    render(
      <QueryClientProvider client={new QueryClient()}>
        <CrewEventsView />
      </QueryClientProvider>,
    );

    expect(screen.getByRole('heading', { name: 'Akce' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vybrat datum akci' })).toBeInTheDocument();
    if (role === 'crew') expect(screen.getByRole('button', { name: 'Filtrovat akce' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Seznam' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Kalendar' })).not.toBeInTheDocument();

    expect(mockAppContext.setEventsViewMode).not.toHaveBeenCalled();
  });

  it('keeps the event list under the mobile detail so swipe back reveals the previous page', async () => {
    mobileMockState.isMobile = true;

    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => ({
        ...mockAppContext,
        role: 'crew',
        selectedEventId: 'event-uuid-1',
      }),
    }));

    vi.doMock('../features/events/queries/useEventsQuery', () => ({
      useEventsQuery: () => ({ data: events, isLoading: false, error: null }),
    }));

    vi.doMock('../features/events/services/events.service', () => ({
      createEmptyEvent: vi.fn(),
      createEventCopy: vi.fn((eventToCopy) => eventToCopy),
      applyForEvent: vi.fn(),
      requestEventWithdrawal: vi.fn(),
      withdrawEventApplication: vi.fn(),
      filterEventsByStatus: (items: typeof events) => items.map((item) => ({ ...item, derivedStatus: 'upcoming' as const })),
      getEventsWithDerivedStatus: (items: typeof events) => items.map((item) => ({ ...item, derivedStatus: 'upcoming' as const })),
      getReferenceDate: () => new Date('2026-04-20'),
      getEventDetailData: () => eventDetail,
    }));

    vi.doMock('./EventDetailView', () => ({
      default: () => <div className="nodu-mobile-event-detail" data-testid="mobile-event-detail-overlay">detail</div>,
    }));

    vi.doMock('../components/modals/EventEditModal', () => ({
      default: () => null,
    }));

    vi.doMock('../components/modals/AssignCrewModal', () => ({
      default: () => null,
    }));

    const { default: EventsView } = await import('./EventsView');

    render(
      <QueryClientProvider client={new QueryClient()}>
        <EventsView />
      </QueryClientProvider>,
    );

    expect(screen.getByTestId('mobile-event-detail-overlay')).toBeInTheDocument();
    expect(screen.getByText('Akce 1')).toBeInTheDocument();
    expect(screen.getByText('AK001')).toBeInTheDocument();
  });

  it('keeps occupied mobile Crew events visible by default and filters by participation', async () => {
    mobileMockState.isMobile = true;
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-11T12:00:00'));

    const mobileCrewEvents = [
      {
        id: 101,
        supabaseId: 'event-open',
        name: 'Volna akce',
        job: 'OPEN001',
        startDate: '2026-08-15',
        endDate: '2026-08-15',
        startTime: '08:00',
        endTime: '17:00',
        city: 'Praha',
        needed: 2,
        filled: 1,
        status: 'upcoming' as const,
        client: 'Klient A',
      },
      {
        id: 102,
        supabaseId: 'event-full',
        name: 'Obsazena akce',
        job: 'FULL001',
        startDate: '2026-08-16',
        endDate: '2026-08-16',
        startTime: '08:00',
        endTime: '17:00',
        city: 'Praha',
        needed: 1,
        filled: 1,
        status: 'full' as const,
        client: 'Klient B',
      },
      {
        id: 103,
        supabaseId: 'event-assigned',
        name: 'Moje potvrzena akce',
        job: 'MINE001',
        startDate: '2026-08-17',
        endDate: '2026-08-17',
        startTime: '08:00',
        endTime: '17:00',
        city: 'Praha',
        needed: 2,
        filled: 1,
        status: 'upcoming' as const,
        client: 'Klient C',
      },
      {
        id: 104,
        supabaseId: 'event-pending',
        name: 'Cekam na schvaleni',
        job: 'WAIT001',
        startDate: '2026-08-18',
        endDate: '2026-08-18',
        startTime: '08:00',
        endTime: '17:00',
        city: 'Praha',
        needed: 1,
        filled: 0,
        status: 'upcoming' as const,
        client: 'Klient D',
      },
      {
        id: 105,
        supabaseId: 'event-old',
        name: 'Stara akce',
        job: 'OLD001',
        startDate: '2026-08-01',
        endDate: '2026-08-01',
        startTime: '08:00',
        endTime: '17:00',
        city: 'Praha',
        needed: 1,
        filled: 0,
        status: 'past' as const,
        client: 'Klient E',
      },
      {
        id: 106,
        supabaseId: 'event-ongoing-unrelated',
        name: 'Probihajici cizi akce',
        job: 'ONGOING001',
        startDate: '2026-08-10',
        endDate: '2026-08-12',
        startTime: '08:00',
        endTime: '17:00',
        city: 'Praha',
        needed: 1,
        filled: 1,
        status: 'full' as const,
        client: 'Klient F',
      },
      {
        id: 107,
        supabaseId: 'event-ongoing-assigned',
        name: 'Probihajici moje akce',
        job: 'ONGOING002',
        startDate: '2026-08-10',
        endDate: '2026-08-12',
        startTime: '08:00',
        endTime: '17:00',
        city: 'Praha',
        needed: 1,
        filled: 1,
        status: 'full' as const,
        client: 'Klient G',
      },
      {
        id: 108,
        supabaseId: 'event-ongoing-pending',
        name: 'Probihajici cekajici akce',
        job: 'ONGOING003',
        startDate: '2026-08-10',
        endDate: '2026-08-12',
        startTime: '08:00',
        endTime: '17:00',
        city: 'Praha',
        needed: 2,
        filled: 1,
        status: 'upcoming' as const,
        client: 'Klient H',
      },
    ];

    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => ({
        ...mockAppContext,
        role: 'crew',
        eventsCalendarDate: '2026-08-11',
      }),
    }));

    vi.doMock('../features/events/queries/useEventsQuery', () => ({
      useEventsQuery: () => ({ data: mobileCrewEvents, isLoading: false, error: null }),
    }));

    vi.doMock('../features/events/services/events.service', () => ({
      createEmptyEvent: vi.fn(),
      createEventCopy: vi.fn((eventToCopy) => eventToCopy),
      applyForEvent: vi.fn(),
      requestEventWithdrawal: vi.fn(),
      withdrawEventApplication: vi.fn(),
      filterEventsByStatus: (items: typeof mobileCrewEvents) => items.map((item) => ({ ...item, derivedStatus: item.status === 'past' ? 'past' as const : item.status === 'full' ? 'full' as const : 'upcoming' as const })),
      getEventsWithDerivedStatus: (items: typeof mobileCrewEvents) => items.map((item) => ({ ...item, derivedStatus: item.status === 'past' ? 'past' as const : item.status === 'full' ? 'full' as const : 'upcoming' as const })),
      getReferenceDate: () => new Date('2026-08-11'),
      getEventDetailData: (eventId: string | number) => ({
        ...eventDetail,
        event: mobileCrewEvents.find((event) => event.supabaseId === eventId || event.id === eventId) ?? mobileCrewEvents[0],
        timelogs: [],
        applications: eventId === 'event-pending' || eventId === 'event-ongoing-pending'
          ? [{
              id: eventId === 'event-pending' ? 201 : 202,
              eventId: eventId === 'event-pending' ? 104 : 108,
              eventSupabaseId: String(eventId),
              contractorProfileId: 'profile-current',
              status: 'pending' as const,
            }]
          : [],
        crewAssignments: eventId === 'event-assigned' || eventId === 'event-ongoing-assigned'
          ? [{
              eventId: eventId === 'event-assigned' ? 103 : 107,
              eventSupabaseId: String(eventId),
              contractorProfileId: 'profile-current',
              name: 'Petr Heitzer',
            }]
          : [],
      }),
    }));

    vi.doMock('./EventDetailView', () => ({
      default: () => <div>detail</div>,
    }));

    vi.doMock('../components/modals/EventEditModal', () => ({
      default: () => null,
    }));

    vi.doMock('../components/modals/AssignCrewModal', () => ({
      default: () => null,
    }));

    const { default: EventsView } = await import('./EventsView');

    render(
      <QueryClientProvider client={new QueryClient()}>
        <EventsView />
      </QueryClientProvider>,
    );

    expect(screen.getByText('Volna akce')).toBeInTheDocument();
    expect(screen.getByText('Obsazena akce')).toBeInTheDocument();
    expect(screen.queryByText('Stara akce')).not.toBeInTheDocument();
    expect(screen.queryByText('Probihajici cizi akce')).not.toBeInTheDocument();
    expect(screen.getByText('Probihajici moje akce')).toBeInTheDocument();
    expect(screen.getByText('Probihajici cekajici akce')).toBeInTheDocument();

    const openCard = screen.getByText('Volna akce').closest('.relative.cursor-pointer');
    expect(openCard).not.toBeNull();
    expect(within(openCard as HTMLElement).getByRole('button', { name: 'Prihlasit na akci' })).toBeInTheDocument();

    const occupiedCard = screen.getByText('Obsazena akce').closest('.relative.cursor-pointer');
    expect(occupiedCard).not.toBeNull();
    expect(within(occupiedCard as HTMLElement).getByRole('button', { name: 'Obsazeno' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Filtrovat akce' }));
    const filterPanel = document.querySelector('.nodu-mobile-events-filter-panel');
    expect(filterPanel).not.toBeNull();
    expect(within(filterPanel as HTMLElement).getByRole('button', { name: 'Vse' })).toBeInTheDocument();
    expect(within(filterPanel as HTMLElement).getByRole('button', { name: 'Volne' })).toBeInTheDocument();
    expect(within(filterPanel as HTMLElement).getByRole('button', { name: 'Moje akce' })).toBeInTheDocument();
    expect(within(filterPanel as HTMLElement).getByRole('button', { name: 'Cekam' })).toBeInTheDocument();
    expect(within(filterPanel as HTMLElement).getByRole('button', { name: 'Obsazeno' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Moje akce' }));

    expect(screen.getByText('Moje potvrzena akce')).toBeInTheDocument();
    expect(screen.queryByText('Volna akce')).not.toBeInTheDocument();
    expect(screen.queryByText('Obsazena akce')).not.toBeInTheDocument();
  });

  it.each(['crewhead', 'coo'] as const)(
    'keeps active overlapping events visible from today for mobile %s',
    async (role) => {
      mobileMockState.isMobile = true;
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-11T12:00:00'));

      const managerEvents = [
        { ...events[0], id: 301, supabaseId: 'past-event', name: 'Skoncena akce', startDate: '2026-08-08', endDate: '2026-08-09' },
        { ...events[0], id: 302, supabaseId: 'active-event', name: 'Probihajici akce', startDate: '2026-08-10', endDate: '2026-08-12' },
        { ...events[0], id: 303, supabaseId: 'future-event', name: 'Budouci akce', startDate: '2026-08-15', endDate: '2026-08-15' },
      ];

      vi.doMock('../context/useAppContext', () => ({
        useAppContext: () => ({ ...mockAppContext, role, eventsCalendarDate: '2026-08-11' }),
      }));
      vi.doMock('../features/events/queries/useEventsQuery', () => ({
        useEventsQuery: () => ({ data: managerEvents, isLoading: false, error: null }),
      }));
      vi.doMock('../features/events/services/events.service', () => ({
        createEmptyEvent: vi.fn(() => managerEvents[2]),
        createEventCopy: vi.fn((eventToCopy) => eventToCopy),
        applyForEvent: vi.fn(),
        requestEventWithdrawal: vi.fn(),
        withdrawEventApplication: vi.fn(),
        filterEventsByStatus: (items: typeof managerEvents) => items.map((item) => ({ ...item, derivedStatus: 'upcoming' as const })),
        getEventsWithDerivedStatus: (items: typeof managerEvents) => items.map((item) => ({ ...item, derivedStatus: 'upcoming' as const })),
        getReferenceDate: () => new Date('2026-08-11'),
        getEventDetailData: (eventId: string | number) => ({
          ...eventDetail,
          event: managerEvents.find((event) => event.supabaseId === eventId || event.id === eventId) ?? managerEvents[0],
          timelogs: [],
          applications: [],
          crewAssignments: [],
        }),
      }));
      vi.doMock('./EventDetailView', () => ({ default: () => <div>detail</div> }));
      vi.doMock('../components/modals/EventEditModal', () => ({ default: () => null }));
      vi.doMock('../components/modals/AssignCrewModal', () => ({ default: () => null }));

      const { default: EventsView } = await import('./EventsView');
      render(
        <QueryClientProvider client={new QueryClient()}>
          <EventsView />
        </QueryClientProvider>,
      );

      expect(screen.queryByText('Skoncena akce')).not.toBeInTheDocument();
      expect(screen.getAllByText('Probihajici akce')).toHaveLength(2);
      expect(screen.getByText('Budouci akce')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Vybrat datum akci' })).toBeInTheDocument();
    },
  );

  it('opens an in-app date picker for mobile Crew events and filters from the selected date', async () => {
    mobileMockState.isMobile = true;
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-11T12:00:00'));

    const setEventsCalendarDate = vi.fn();
    const mobileCrewEvents = [
      {
        id: 200,
        supabaseId: 'event-before-today',
        name: 'Akce pred dneskem',
        job: 'OLD001',
        startDate: '2026-08-05',
        endDate: '2026-08-05',
        startTime: '08:00',
        endTime: '17:00',
        city: 'Praha',
        needed: 1,
        filled: 0,
        status: 'upcoming' as const,
        client: 'Klient 0',
      },
      {
        id: 201,
        supabaseId: 'event-before-date',
        name: 'Akce pred vyberem',
        job: 'BEF001',
        startDate: '2026-08-15',
        endDate: '2026-08-15',
        startTime: '08:00',
        endTime: '17:00',
        city: 'Praha',
        needed: 1,
        filled: 0,
        status: 'upcoming' as const,
        client: 'Klient A',
      },
      {
        id: 202,
        supabaseId: 'event-after-date',
        name: 'Akce po vyberu',
        job: 'AFT001',
        startDate: '2026-08-20',
        endDate: '2026-08-20',
        startTime: '08:00',
        endTime: '17:00',
        city: 'Praha',
        needed: 1,
        filled: 0,
        status: 'upcoming' as const,
        client: 'Klient B',
      },
    ];

    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => ({
        ...mockAppContext,
        role: 'crew',
        eventsCalendarDate: '2026-08-11',
        setEventsCalendarDate,
      }),
    }));

    vi.doMock('../features/events/queries/useEventsQuery', () => ({
      useEventsQuery: () => ({ data: mobileCrewEvents, isLoading: false, error: null }),
    }));

    vi.doMock('../features/events/services/events.service', () => ({
      createEmptyEvent: vi.fn(),
      createEventCopy: vi.fn((eventToCopy) => eventToCopy),
      applyForEvent: vi.fn(),
      requestEventWithdrawal: vi.fn(),
      withdrawEventApplication: vi.fn(),
      filterEventsByStatus: (items: typeof mobileCrewEvents) => items.map((item) => ({ ...item, derivedStatus: 'upcoming' as const })),
      getEventsWithDerivedStatus: (items: typeof mobileCrewEvents) => items.map((item) => ({ ...item, derivedStatus: 'upcoming' as const })),
      getReferenceDate: () => new Date('2026-08-11'),
      getEventDetailData: (eventId: string | number) => ({
        ...eventDetail,
        event: mobileCrewEvents.find((event) => event.supabaseId === eventId || event.id === eventId) ?? mobileCrewEvents[0],
        timelogs: [],
        applications: [],
        crewAssignments: [],
      }),
    }));

    vi.doMock('./EventDetailView', () => ({
      default: () => <div>detail</div>,
    }));

    vi.doMock('../components/modals/EventEditModal', () => ({
      default: () => null,
    }));

    vi.doMock('../components/modals/AssignCrewModal', () => ({
      default: () => null,
    }));

    const { default: EventsView } = await import('./EventsView');

    render(
      <QueryClientProvider client={new QueryClient()}>
        <EventsView />
      </QueryClientProvider>,
    );

    expect(screen.queryByText('Akce pred dneskem')).not.toBeInTheDocument();
    expect(screen.getByText('Akce pred vyberem')).toBeInTheDocument();
    expect(screen.getByText('Akce po vyberu')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Vybrat datum akci' }));

    expect(screen.getByText('srpen 2026')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Zobrazit akce od 5. srpna 2026' }));

    expect(screen.getByText('Akce pred dneskem')).toBeInTheDocument();
    expect(screen.getByText('Akce pred vyberem')).toBeInTheDocument();
    expect(screen.getByText('Akce po vyberu')).toBeInTheDocument();
    expect(setEventsCalendarDate).toHaveBeenCalledWith('2026-08-05');

    fireEvent.click(screen.getByRole('button', { name: 'Vybrat datum akci' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dnes a dál' }));

    expect(screen.queryByText('Akce pred dneskem')).not.toBeInTheDocument();
    expect(screen.getByText('Akce pred vyberem')).toBeInTheDocument();
    expect(screen.getByText('Akce po vyberu')).toBeInTheDocument();
    expect(setEventsCalendarDate).toHaveBeenCalledWith('2026-08-11');
  });

  it('renders single-day event meta without dangling separators when client is missing', async () => {
    const singleDayEvent = {
      id: 28,
      name: 'Ploom TEST',
      job: 'JTI001',
      startDate: '2026-07-28',
      endDate: '2026-07-28',
      startTime: '08:00',
      endTime: '17:00',
      city: 'Roudnice nad Labem',
      needed: 1,
      filled: 0,
      status: 'upcoming' as const,
      client: '',
    };

    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => ({
        ...mockAppContext,
        role: 'crew',
        eventsCalendarDate: '2026-07-28',
      }),
    }));

    vi.doMock('../features/events/queries/useEventsQuery', () => ({
      useEventsQuery: () => ({ data: [singleDayEvent], isLoading: false, error: null }),
    }));

    vi.doMock('../features/events/services/events.service', () => ({
      createEmptyEvent: vi.fn(),
      createEventCopy: vi.fn((eventToCopy) => eventToCopy),
      applyForEvent: vi.fn(),
      requestEventWithdrawal: vi.fn(),
      withdrawEventApplication: vi.fn(),
      filterEventsByStatus: (items: typeof singleDayEvent[]) => items.map((item) => ({ ...item, derivedStatus: 'upcoming' as const })),
      getEventsWithDerivedStatus: (items: typeof singleDayEvent[]) => items.map((item) => ({ ...item, derivedStatus: 'upcoming' as const })),
      getReferenceDate: () => new Date('2026-07-28'),
      getEventDetailData: () => ({
        ...eventDetail,
        event: singleDayEvent,
        timelogs: [],
        applications: [],
        crewAssignments: [],
      }),
    }));

    vi.doMock('./EventDetailView', () => ({
      default: () => <div>detail</div>,
    }));

    vi.doMock('../components/modals/EventEditModal', () => ({
      default: () => null,
    }));

    vi.doMock('../components/modals/AssignCrewModal', () => ({
      default: () => null,
    }));

    const { default: EventsView } = await import('./EventsView');

    render(
      <QueryClientProvider client={new QueryClient()}>
        <EventsView />
      </QueryClientProvider>,
    );

    expect(screen.getByText('28. 7. 2026 · 08:00 - 17:00')).toBeInTheDocument();
    expect(screen.queryByText(/28\. 7\. 2026 - 08:00 - 17:00 -/)).not.toBeInTheDocument();
  });

  it('filters the list by selected month and can request the next month', async () => {
    const setEventsCalendarDate = vi.fn();

    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => ({
        ...mockAppContext,
        eventsCalendarDate: '2026-04-20',
        setEventsCalendarDate,
      }),
    }));

    vi.doMock('../features/events/queries/useEventsQuery', () => ({
      useEventsQuery: () => ({ data: monthlyEvents, isLoading: false, error: null }),
    }));

    vi.doMock('../features/events/services/events.service', () => ({
      createEmptyEvent: vi.fn(),
      createEventCopy: vi.fn(),
      applyForEvent: vi.fn(),
      requestEventWithdrawal: vi.fn(),
      withdrawEventApplication: vi.fn(),
      filterEventsByStatus: (items: typeof monthlyEvents) => items.map((item) => ({ ...item, derivedStatus: 'full' as const })),
      getEventsWithDerivedStatus: (items: typeof monthlyEvents) => items.map((item) => ({ ...item, derivedStatus: 'full' as const })),
      getReferenceDate: () => new Date('2026-04-20'),
      getEventDetailData: (eventId: number | string) => ({
        ...eventDetail,
        event: monthlyEvents.find((event) => event.supabaseId === eventId || event.id === eventId) ?? monthlyEvents[0],
        timelogs: [],
        crewAssignments: [],
      }),
    }));

    vi.doMock('./EventDetailView', () => ({
      default: () => <div>detail</div>,
    }));

    vi.doMock('../components/modals/EventEditModal', () => ({
      default: () => null,
    }));

    vi.doMock('../components/modals/AssignCrewModal', () => ({
      default: () => null,
    }));

    const { default: EventsView } = await import('./EventsView');
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <EventsView />
      </QueryClientProvider>,
    );

    expect(screen.getByText('duben 2026')).toBeInTheDocument();
    expect(screen.getByText('Dubnova akce')).toBeInTheDocument();
    expect(screen.queryByText('Kvetnova akce')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Dalsi mesic' }));

    expect(setEventsCalendarDate).toHaveBeenCalledWith('2026-05-01');
  });

  it('renders a compact floating mobile create-event button for managers', async () => {
    const createEmptyEventMock = vi.fn(() => events[0]);

    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => mockAppContext,
    }));

    vi.doMock('../features/events/queries/useEventsQuery', () => ({
      useEventsQuery: () => ({ data: events, isLoading: false, error: null }),
    }));

    vi.doMock('../features/events/services/events.service', () => ({
      createEmptyEvent: createEmptyEventMock,
      createEventCopy: vi.fn((eventToCopy) => eventToCopy),
      applyForEvent: vi.fn(),
      requestEventWithdrawal: vi.fn(),
      withdrawEventApplication: vi.fn(),
      filterEventsByStatus: (items: typeof events) => items.map((item) => ({ ...item, derivedStatus: 'upcoming' as const })),
      getEventsWithDerivedStatus: (items: typeof events) => items.map((item) => ({ ...item, derivedStatus: 'upcoming' as const })),
      getReferenceDate: () => new Date('2026-04-20'),
      getEventDetailData: () => eventDetail,
    }));

    vi.doMock('./EventDetailView', () => ({
      default: () => <div>detail</div>,
    }));

    vi.doMock('../components/modals/EventEditModal', () => ({
      default: () => null,
    }));

    vi.doMock('../components/modals/AssignCrewModal', () => ({
      default: () => null,
    }));

    const { default: EventsView } = await import('./EventsView');
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <EventsView />
      </QueryClientProvider>,
    );

    expect(screen.getByRole('button', { name: '+ Nova akce' })).toHaveClass('hidden', 'md:inline-flex');

    const mobileCreateButton = screen.getByRole('button', { name: 'Nova akce' });
    expect(mobileCreateButton).toHaveTextContent('+');
    expect(mobileCreateButton).toHaveClass('nodu-event-mobile-create-fab', 'h-10', 'w-10', 'md:hidden');
    expect(mobileCreateButton).not.toHaveClass('bottom-6');
    expect(mobileCreateButton).not.toHaveClass('bottom-[calc(env(safe-area-inset-bottom)+6rem)]');
    expect(mobileCreateButton).not.toHaveClass('left-4');

    fireEvent.click(mobileCreateButton);

    expect(createEmptyEventMock).toHaveBeenCalledOnce();
  });

  it('hides the floating mobile create-event button while the event detail is open', async () => {
    mobileMockState.isMobile = true;

    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => ({
        ...mockAppContext,
        selectedEventId: 'event-uuid-1',
      }),
    }));

    vi.doMock('../features/events/queries/useEventsQuery', () => ({
      useEventsQuery: () => ({ data: events, isLoading: false, error: null }),
    }));

    vi.doMock('../features/events/services/events.service', () => ({
      createEmptyEvent: vi.fn(),
      createEventCopy: vi.fn((eventToCopy) => eventToCopy),
      applyForEvent: vi.fn(),
      requestEventWithdrawal: vi.fn(),
      withdrawEventApplication: vi.fn(),
      filterEventsByStatus: (items: typeof events) => items.map((item) => ({ ...item, derivedStatus: 'upcoming' as const })),
      getEventsWithDerivedStatus: (items: typeof events) => items.map((item) => ({ ...item, derivedStatus: 'upcoming' as const })),
      getReferenceDate: () => new Date('2026-04-20'),
      getEventDetailData: () => eventDetail,
    }));

    vi.doMock('./EventDetailView', () => ({
      default: () => <div>detail</div>,
    }));

    vi.doMock('../components/modals/EventEditModal', () => ({
      default: () => null,
    }));

    vi.doMock('../components/modals/AssignCrewModal', () => ({
      default: () => null,
    }));

    const { default: EventsView } = await import('./EventsView');
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <EventsView />
      </QueryClientProvider>,
    );

    expect(screen.getByText('detail')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nova akce' })).not.toBeInTheDocument();
  });

  it('keeps event list management actions focused on copy without crew assignment shortcut', async () => {
    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => mockAppContext,
    }));

    vi.doMock('../features/events/queries/useEventsQuery', () => ({
      useEventsQuery: () => ({ data: events, isLoading: false, error: null }),
    }));

    vi.doMock('../features/events/services/events.service', () => ({
      createEmptyEvent: vi.fn(),
      createEventCopy: vi.fn((eventToCopy) => eventToCopy),
      applyForEvent: vi.fn(),
      requestEventWithdrawal: vi.fn(),
      withdrawEventApplication: vi.fn(),
      filterEventsByStatus: (items: typeof events) => items.map((item) => ({ ...item, derivedStatus: 'upcoming' as const })),
      getEventsWithDerivedStatus: (items: typeof events) => items.map((item) => ({ ...item, derivedStatus: 'upcoming' as const })),
      getReferenceDate: () => new Date('2026-04-20'),
      getEventDetailData: () => eventDetail,
    }));

    vi.doMock('./EventDetailView', () => ({
      default: () => <div>detail</div>,
    }));

    vi.doMock('../components/modals/EventEditModal', () => ({
      default: () => null,
    }));

    vi.doMock('../components/modals/AssignCrewModal', () => ({
      default: () => null,
    }));

    const { default: EventsView } = await import('./EventsView');
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <EventsView />
      </QueryClientProvider>,
    );

    expect(screen.getByRole('button', { name: 'Kopirovat akci na jiny den' })).toBeInTheDocument();
    expect(screen.queryByText(/Obsadit crew/)).not.toBeInTheDocument();
  });

  it('switches to all events when browsing months from the upcoming filter', async () => {
    const setEventsCalendarDate = vi.fn();
    const setEventsFilter = vi.fn();
    const monthNavigationEvents = [
      {
        ...events[0],
        id: 20,
        supabaseId: 'event-uuid-may-past',
        name: 'Kvetnova minula akce',
        startDate: '2026-05-12',
        endDate: '2026-05-12',
      },
      {
        ...events[0],
        id: 21,
        supabaseId: 'event-uuid-june-upcoming',
        name: 'Cervnova budouci akce',
        startDate: '2026-06-20',
        endDate: '2026-06-20',
      },
    ];

    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => ({
        ...mockAppContext,
        eventsFilter: 'upcoming',
        eventsCalendarDate: '2026-06-15',
        setEventsCalendarDate,
        setEventsFilter,
      }),
    }));

    vi.doMock('../features/events/queries/useEventsQuery', () => ({
      useEventsQuery: () => ({ data: monthNavigationEvents, isLoading: false, error: null }),
    }));

    vi.doMock('../features/events/services/events.service', () => ({
      createEmptyEvent: vi.fn(),
      createEventCopy: vi.fn((eventToCopy) => eventToCopy),
      applyForEvent: vi.fn(),
      requestEventWithdrawal: vi.fn(),
      withdrawEventApplication: vi.fn(),
      filterEventsByStatus: (items: Array<typeof monthNavigationEvents[number] & { derivedStatus: string }>, filter: string) => (
        filter === 'upcoming' ? items.filter((item) => item.derivedStatus !== 'past') : items
      ),
      getEventsWithDerivedStatus: (items: typeof monthNavigationEvents) => items.map((item) => ({
        ...item,
        derivedStatus: item.id === 20 ? 'past' as const : 'upcoming' as const,
      })),
      getReferenceDate: () => new Date('2026-06-15'),
      getEventDetailData: (eventId: number | string) => ({
        ...eventDetail,
        event: monthNavigationEvents.find((event) => event.supabaseId === eventId || event.id === eventId) ?? monthNavigationEvents[0],
        timelogs: [],
        crewAssignments: [],
      }),
    }));

    vi.doMock('./EventDetailView', () => ({
      default: () => <div>detail</div>,
    }));

    vi.doMock('../components/modals/EventEditModal', () => ({
      default: () => null,
    }));

    vi.doMock('../components/modals/AssignCrewModal', () => ({
      default: () => null,
    }));

    const { default: EventsView } = await import('./EventsView');
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <EventsView />
      </QueryClientProvider>,
    );

    expect(screen.getByText('Cervnova budouci akce')).toBeInTheDocument();
    expect(screen.queryByText('Kvetnova minula akce')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Predchozi mesic' }));

    expect(setEventsFilter).toHaveBeenCalledWith('all');
    expect(setEventsCalendarDate).toHaveBeenCalledWith('2026-05-01');
  });

  it('shows the empty state when the selected list month has no matching events', async () => {
    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => ({
        ...mockAppContext,
        eventsCalendarDate: '2026-06-01',
      }),
    }));

    vi.doMock('../features/events/queries/useEventsQuery', () => ({
      useEventsQuery: () => ({ data: monthlyEvents, isLoading: false, error: null }),
    }));

    vi.doMock('../features/events/services/events.service', () => ({
      createEmptyEvent: vi.fn(),
      createEventCopy: vi.fn((eventToCopy) => eventToCopy),
      applyForEvent: vi.fn(),
      requestEventWithdrawal: vi.fn(),
      withdrawEventApplication: vi.fn(),
      filterEventsByStatus: (items: typeof monthlyEvents) => items.map((item) => ({ ...item, derivedStatus: 'full' as const })),
      getEventsWithDerivedStatus: (items: typeof monthlyEvents) => items.map((item) => ({ ...item, derivedStatus: 'full' as const })),
      getReferenceDate: () => new Date('2026-06-01'),
      getEventDetailData: (eventId: number | string) => ({
        ...eventDetail,
        event: monthlyEvents.find((event) => event.supabaseId === eventId || event.id === eventId) ?? monthlyEvents[0],
        timelogs: [],
        crewAssignments: [],
      }),
    }));

    vi.doMock('./EventDetailView', () => ({
      default: () => <div>detail</div>,
    }));

    vi.doMock('../components/modals/EventEditModal', () => ({
      default: () => null,
    }));

    vi.doMock('../components/modals/AssignCrewModal', () => ({
      default: () => null,
    }));

    const { default: EventsView } = await import('./EventsView');
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <EventsView />
      </QueryClientProvider>,
    );

    expect(screen.getByText('Pro tento mesic a filtr tu zatim nejsou zadne akce.')).toBeInTheDocument();
  });

  it.each([
    { isMobile: true, role: 'crew' as const, showsCalendarHint: true },
    { isMobile: true, role: 'crewhead' as const, showsCalendarHint: false },
    { isMobile: true, role: 'coo' as const, showsCalendarHint: false },
    { isMobile: false, role: 'crew' as const, showsCalendarHint: false },
    { isMobile: false, role: 'crewhead' as const, showsCalendarHint: false },
    { isMobile: false, role: 'coo' as const, showsCalendarHint: false },
  ])('guides only mobile crew to the calendar date picker when the feed is empty', async ({ isMobile, role, showsCalendarHint }) => {
    mobileMockState.isMobile = isMobile;

    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => ({ ...mockAppContext, role }),
    }));

    vi.doMock('../features/events/queries/useEventsQuery', () => ({
      useEventsQuery: () => ({ data: [], isLoading: false, error: null }),
    }));

    vi.doMock('../features/events/services/events.service', () => ({
      createEmptyEvent: vi.fn(),
      createEventCopy: vi.fn((eventToCopy) => eventToCopy),
      applyForEvent: vi.fn(),
      requestEventWithdrawal: vi.fn(),
      withdrawEventApplication: vi.fn(),
      filterEventsByStatus: () => [],
      getEventsWithDerivedStatus: () => [],
      getReferenceDate: () => new Date('2026-04-20'),
      getEventDetailData: () => eventDetail,
    }));

    vi.doMock('./EventDetailView', () => ({ default: () => <div>detail</div> }));
    vi.doMock('../components/modals/EventEditModal', () => ({ default: () => null }));
    vi.doMock('../components/modals/AssignCrewModal', () => ({ default: () => null }));

    const { default: EventsView } = await import('./EventsView');
    render(
      <QueryClientProvider client={new QueryClient()}>
        <EventsView />
      </QueryClientProvider>,
    );

    const approvedHint = 'Chceš zobrazit i starší akce? Klepni na ikonu kalendáře vlevo nahoře a vyber datum, od kterého je chceš vidět.';
    const existingMobileHelper = 'Nove moznosti se tu objevi automaticky.';
    const existingDesktopHelper = 'Zkuste prepnout filtr nebo vytvorit novou akci.';

    if (showsCalendarHint) {
      expect(screen.getByText('Od zvoleného data tu zatím nejsou žádné akce.')).toBeInTheDocument();
      expect(screen.getByText(approvedHint)).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Filtrovat akce' }));
      fireEvent.click(screen.getByRole('button', { name: 'Moje akce' }));
      expect(screen.getByText(approvedHint)).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Vybrat datum akci' }));
      expect(document.querySelector('.nodu-mobile-events-date-panel')).toBeInTheDocument();
    } else {
      expect(screen.queryByText(approvedHint)).not.toBeInTheDocument();
      expect(screen.getByText(isMobile ? existingMobileHelper : existingDesktopHelper)).toBeInTheDocument();
    }
  });

  it('shows assigned crew names and opens detail by clicking the event card', async () => {
    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => mockAppContext,
    }));

    vi.doMock('../features/events/queries/useEventsQuery', () => ({
      useEventsQuery: () => ({ data: events, isLoading: false, error: null }),
    }));

    vi.doMock('../features/events/services/events.service', () => ({
      createEmptyEvent: vi.fn(),
      createEventCopy: vi.fn((eventToCopy) => eventToCopy),
      applyForEvent: vi.fn(),
      requestEventWithdrawal: vi.fn(),
      withdrawEventApplication: vi.fn(),
      filterEventsByStatus: (items: typeof events) => items.map((item) => ({ ...item, derivedStatus: 'full' as const })),
      getEventsWithDerivedStatus: (items: typeof events) => items.map((item) => ({ ...item, derivedStatus: 'full' as const })),
      getReferenceDate: () => new Date('2026-04-20'),
      getEventDetailData: () => eventDetail,
    }));

    vi.doMock('./EventDetailView', () => ({
      default: () => <div>detail</div>,
    }));

    vi.doMock('../components/modals/EventEditModal', () => ({
      default: () => null,
    }));

    vi.doMock('../components/modals/AssignCrewModal', () => ({
      default: () => null,
    }));

    const { default: EventsView } = await import('./EventsView');
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <EventsView />
      </QueryClientProvider>,
    );

    expect(screen.getByText('Marek Rebroš')).toBeInTheDocument();
    expect(screen.getByText('Jaroslav Macháč')).toBeInTheDocument();
    expect(screen.queryByText('Crew hodiny celkem')).not.toBeInTheDocument();
    expect(screen.queryByText('2 timelogy · 10.0 h')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Detail' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Akce 1'));

    expect(mockAppContext.setSelectedEventId).toHaveBeenCalledWith('event-uuid-1');
  });

  it('opens a copied event draft from the event list copy button', async () => {
    const copiedEvent = {
      ...events[0],
      id: 99,
      supabaseId: undefined,
      startDate: '2026-04-21',
      endDate: '2026-04-21',
      filled: 0,
    };

    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => mockAppContext,
    }));

    vi.doMock('../features/events/queries/useEventsQuery', () => ({
      useEventsQuery: () => ({ data: events, isLoading: false, error: null }),
    }));

    vi.doMock('../features/events/services/events.service', () => ({
      createEmptyEvent: vi.fn(),
      createEventCopy: vi.fn(() => copiedEvent),
      applyForEvent: vi.fn(),
      requestEventWithdrawal: vi.fn(),
      withdrawEventApplication: vi.fn(),
      filterEventsByStatus: (items: typeof events) => items.map((item) => ({ ...item, derivedStatus: 'full' as const })),
      getEventsWithDerivedStatus: (items: typeof events) => items.map((item) => ({ ...item, derivedStatus: 'full' as const })),
      getReferenceDate: () => new Date('2026-04-20'),
      getEventDetailData: () => eventDetail,
    }));

    vi.doMock('./EventDetailView', () => ({
      default: () => <div>detail</div>,
    }));

    vi.doMock('../components/modals/EventEditModal', () => ({
      default: ({ editingEvent }: { editingEvent: typeof copiedEvent | null }) => (
        editingEvent ? <div>Kopie akce {editingEvent.id} {editingEvent.startDate}</div> : null
      ),
    }));

    vi.doMock('../components/modals/AssignCrewModal', () => ({
      default: () => null,
    }));

    const { default: EventsView } = await import('./EventsView');
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <EventsView />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Kopirovat akci na jiny den' }));

    expect(screen.getByText('Kopie akce 99 2026-04-21')).toBeInTheDocument();
    expect(mockAppContext.setSelectedEventId).not.toHaveBeenCalled();
  });

  it('shows when event timelogs are approved', async () => {
    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => mockAppContext,
    }));

    vi.doMock('../features/events/queries/useEventsQuery', () => ({
      useEventsQuery: () => ({ data: events, isLoading: false, error: null }),
    }));

    vi.doMock('../features/events/services/events.service', () => ({
      createEmptyEvent: vi.fn(),
      createEventCopy: vi.fn((eventToCopy) => eventToCopy),
      applyForEvent: vi.fn(),
      requestEventWithdrawal: vi.fn(),
      withdrawEventApplication: vi.fn(),
      filterEventsByStatus: (items: typeof events) => items.map((item) => ({ ...item, derivedStatus: 'full' as const })),
      getEventsWithDerivedStatus: (items: typeof events) => items.map((item) => ({ ...item, derivedStatus: 'full' as const })),
      getReferenceDate: () => new Date('2026-04-20'),
      getEventDetailData: () => ({
        ...eventDetail,
        timelogs: eventDetail.timelogs.map((timelog) => ({ ...timelog, status: 'approved' as const })),
      }),
    }));

    vi.doMock('./EventDetailView', () => ({
      default: () => <div>detail</div>,
    }));

    vi.doMock('../components/modals/EventEditModal', () => ({
      default: () => null,
    }));

    vi.doMock('../components/modals/AssignCrewModal', () => ({
      default: () => null,
    }));

    const { default: EventsView } = await import('./EventsView');
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <EventsView />
      </QueryClientProvider>,
    );

    expect(screen.getByText('Casy schvalene')).toBeInTheDocument();
  });

  it('shows timelog approval status on assigned crew names', async () => {
    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => mockAppContext,
    }));

    vi.doMock('../features/events/queries/useEventsQuery', () => ({
      useEventsQuery: () => ({ data: events, isLoading: false, error: null }),
    }));

    vi.doMock('../features/events/services/events.service', () => ({
      createEmptyEvent: vi.fn(),
      createEventCopy: vi.fn((eventToCopy) => eventToCopy),
      applyForEvent: vi.fn(),
      requestEventWithdrawal: vi.fn(),
      withdrawEventApplication: vi.fn(),
      filterEventsByStatus: (items: typeof events) => items.map((item) => ({ ...item, derivedStatus: 'full' as const })),
      getEventsWithDerivedStatus: (items: typeof events) => items.map((item) => ({ ...item, derivedStatus: 'full' as const })),
      getReferenceDate: () => new Date('2026-04-20'),
      getEventDetailData: () => ({
        ...eventDetail,
        timelogs: [
          { ...eventDetail.timelogs[0], status: 'pending_coo' as const },
          { ...eventDetail.timelogs[1], status: 'approved' as const },
        ],
      }),
    }));

    vi.doMock('./EventDetailView', () => ({
      default: () => <div>detail</div>,
    }));

    vi.doMock('../components/modals/EventEditModal', () => ({
      default: () => null,
    }));

    vi.doMock('../components/modals/AssignCrewModal', () => ({
      default: () => null,
    }));

    const { default: EventsView } = await import('./EventsView');
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <EventsView />
      </QueryClientProvider>,
    );

    const marekChip = screen.getAllByRole('button', { name: /Marek Rebroš/ })
      .find((button) => button.getAttribute('title')?.includes('Ceka COO'));
    const jaroslavChip = screen.getAllByRole('button', { name: /Jaroslav Macháč/ })
      .find((button) => button.getAttribute('title')?.includes('Casy schvalene'));

    expect(marekChip).toHaveAttribute('title', 'Casy: Ceka COO');
    expect(jaroslavChip).toHaveAttribute('title', 'Casy: Casy schvalene');
    expect(screen.queryAllByLabelText(/Stav schvalovani:/)).toHaveLength(0);
  });

  it('opens crew detail when clicking an assigned crew name', async () => {
    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => mockAppContext,
    }));

    vi.doMock('../features/events/queries/useEventsQuery', () => ({
      useEventsQuery: () => ({ data: events, isLoading: false, error: null }),
    }));

    vi.doMock('../features/events/services/events.service', () => ({
      createEmptyEvent: vi.fn(),
      createEventCopy: vi.fn((eventToCopy) => eventToCopy),
      applyForEvent: vi.fn(),
      requestEventWithdrawal: vi.fn(),
      withdrawEventApplication: vi.fn(),
      filterEventsByStatus: (items: typeof events) => items.map((item) => ({ ...item, derivedStatus: 'full' as const })),
      getEventsWithDerivedStatus: (items: typeof events) => items.map((item) => ({ ...item, derivedStatus: 'full' as const })),
      getReferenceDate: () => new Date('2026-04-20'),
      getEventDetailData: () => eventDetail,
    }));

    vi.doMock('./EventDetailView', () => ({
      default: () => <div>detail</div>,
    }));

    vi.doMock('../components/modals/EventEditModal', () => ({
      default: () => null,
    }));

    vi.doMock('../components/modals/AssignCrewModal', () => ({
      default: () => null,
    }));

    const { default: EventsView } = await import('./EventsView');
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <EventsView />
      </QueryClientProvider>,
    );

    const marekChip = screen.getAllByRole('button', { name: /Marek Rebroš/ })
      .find((button) => button.getAttribute('title')?.startsWith('Casy:'));
    expect(marekChip).toBeDefined();

    fireEvent.click(marekChip as HTMLElement);

    expect(mockAppContext.setSelectedContractorProfileId).toHaveBeenCalledWith('profile-1');
    expect(mockAppContext.setCurrentTab).toHaveBeenCalledWith('crew');
    expect(mockAppContext.setSelectedEventId).not.toHaveBeenCalled();
  });

  it('shows multi-day events under each day for managers with event time instead of place', async () => {
    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => ({
        ...mockAppContext,
        eventsCalendarDate: '2026-04-16',
      }),
    }));

    vi.doMock('../features/events/queries/useEventsQuery', () => ({
      useEventsQuery: () => ({ data: multiDayEvents, isLoading: false, error: null }),
    }));

    vi.doMock('../features/events/services/events.service', () => ({
      createEmptyEvent: vi.fn(),
      createEventCopy: vi.fn((eventToCopy) => eventToCopy),
      applyForEvent: vi.fn(),
      requestEventWithdrawal: vi.fn(),
      withdrawEventApplication: vi.fn(),
      filterEventsByStatus: (items: typeof multiDayEvents) => items.map((item) => ({ ...item, derivedStatus: 'upcoming' as const })),
      getEventsWithDerivedStatus: (items: typeof multiDayEvents) => items.map((item) => ({ ...item, derivedStatus: 'upcoming' as const })),
      getReferenceDate: () => new Date('2026-04-16'),
      getEventDetailData: () => ({
        timelogs: [
          {
            id: 3,
            eid: 2,
            contractorProfileId: 'profile-3',
            days: [{ d: '2026-04-17', f: '10:00', t: '15:00', type: 'provoz' as const }],
            km: 0,
            note: '',
            status: 'draft' as const,
          },
        ],
        contractors: [],
        receipts: [],
        event: multiDayEvents[0],
        applications: [],
        crewAssignments: [],
      }),
    }));

    vi.doMock('./EventDetailView', () => ({
      default: () => <div>detail</div>,
    }));

    vi.doMock('../components/modals/EventEditModal', () => ({
      default: () => null,
    }));

    vi.doMock('../components/modals/AssignCrewModal', () => ({
      default: () => null,
    }));

    const { default: EventsView } = await import('./EventsView');
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <EventsView />
      </QueryClientProvider>,
    );

    expect(screen.getAllByText('Dvoudenni akce')).toHaveLength(2);
    const multiDayCards = screen.getAllByTestId('event-list-card');
    expect(multiDayCards).toHaveLength(2);
    multiDayCards.forEach((card) => {
      expect(card).toHaveAttribute('data-event-multiday', 'true');
      expect(card.querySelector('[data-testid="event-list-accent"]')).toBeInTheDocument();
    });
    expect(new Set(multiDayCards.map((card) => card.style.getPropertyValue('--event-list-accent'))).size).toBe(1);
    expect(screen.getByText(/16\..*dubna/i)).toBeInTheDocument();
    expect(screen.getByText(/17\..*dubna/i)).toBeInTheDocument();
    expect(screen.getAllByText('Od')).toHaveLength(2);
    expect(screen.getAllByText('16. 4. 2026 · 09:00')).toHaveLength(2);
    expect(screen.getAllByText('Do')).toHaveLength(2);
    expect(screen.getAllByText('17. 4. 2026 · 17:00')).toHaveLength(2);
    expect(screen.getAllByText('Klient B')).toHaveLength(2);
    expect(screen.queryByText(/16\. 4\. - 17\. 4\. 2026.*09:00.*17:00.*Klient B/)).not.toBeInTheDocument();
    expect(screen.queryByText(/16\. 4\. - 17\. 4\. 2026.*10:00.*15:00.*Klient B/)).not.toBeInTheDocument();
    expect(screen.queryByText('Začíná dnes')).not.toBeInTheDocument();
    expect(screen.queryByText('Končí dnes')).not.toBeInTheDocument();
    expect(screen.queryByText(/Probíhá od/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Praha/)).not.toBeInTheDocument();
  });

  it('keeps a multi-day event accent stable when another event changes the local order', async () => {
    const opicakEvent = {
      id: 21,
      name: 'Opičák Fest',
      job: 'PIC001',
      startDate: '2026-04-16',
      endDate: '2026-04-17',
      startTime: '09:00',
      endTime: '17:00',
      city: 'Praha',
      needed: 3,
      filled: 1,
      status: 'upcoming' as const,
      client: 'NextLevel s.r.o.',
    };
    let currentEvents = [opicakEvent];

    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => ({
        ...mockAppContext,
        eventsCalendarDate: '2026-04-16',
      }),
    }));

    vi.doMock('../features/events/queries/useEventsQuery', () => ({
      useEventsQuery: () => ({ data: currentEvents, isLoading: false, error: null }),
    }));

    vi.doMock('../features/events/services/events.service', () => ({
      createEmptyEvent: vi.fn(),
      createEventCopy: vi.fn((eventToCopy) => eventToCopy),
      applyForEvent: vi.fn(),
      requestEventWithdrawal: vi.fn(),
      withdrawEventApplication: vi.fn(),
      filterEventsByStatus: (items: typeof currentEvents) => items.map((item) => ({ ...item, derivedStatus: 'upcoming' as const })),
      getEventsWithDerivedStatus: (items: typeof currentEvents) => items.map((item) => ({ ...item, derivedStatus: 'upcoming' as const })),
      getReferenceDate: () => new Date('2026-04-16'),
      getEventDetailData: () => ({
        ...eventDetail,
        event: opicakEvent,
        timelogs: [],
        crewAssignments: [],
      }),
    }));

    vi.doMock('./EventDetailView', () => ({
      default: () => <div>detail</div>,
    }));

    vi.doMock('../components/modals/EventEditModal', () => ({
      default: () => null,
    }));

    vi.doMock('../components/modals/AssignCrewModal', () => ({
      default: () => null,
    }));

    const { default: EventsView } = await import('./EventsView');
    const getOpicakAccent = () => {
      const card = screen.getAllByTestId('event-list-card')
        .find((item) => item.textContent?.includes('Opičák Fest'));
      expect(card).toBeDefined();
      return (card as HTMLElement).style.getPropertyValue('--event-list-accent');
    };
    const mutedAccentColors = new Set(['#c98ca2', '#88a79c', '#7f9eb8', '#a391bd', '#c79a70', '#76aaa5']);

    const firstRender = render(
      <QueryClientProvider client={new QueryClient()}>
        <EventsView />
      </QueryClientProvider>,
    );
    const firstAccent = getOpicakAccent();

    firstRender.unmount();
    currentEvents = [
      {
        ...events[0],
        id: 22,
        supabaseId: undefined,
        name: 'Nová akce',
        job: 'NEW001',
        startDate: '2026-04-15',
        endDate: '2026-04-15',
      },
      {
        ...opicakEvent,
        id: 99,
      },
    ];

    render(
      <QueryClientProvider client={new QueryClient()}>
        <EventsView />
      </QueryClientProvider>,
    );
    const secondAccent = getOpicakAccent();

    expect(secondAccent).toBe(firstAccent);
    expect(mutedAccentColors.has(secondAccent)).toBe(true);
  });

  it('shows multi-day events only on the start day for Crew users', async () => {
    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => ({
        ...mockAppContext,
        role: 'crew',
        eventsCalendarDate: '2026-04-16',
      }),
    }));

    vi.doMock('../features/events/queries/useEventsQuery', () => ({
      useEventsQuery: () => ({ data: multiDayEvents, isLoading: false, error: null }),
    }));

    vi.doMock('../features/events/services/events.service', () => ({
      createEmptyEvent: vi.fn(),
      createEventCopy: vi.fn((eventToCopy) => eventToCopy),
      applyForEvent: vi.fn(),
      requestEventWithdrawal: vi.fn(),
      withdrawEventApplication: vi.fn(),
      filterEventsByStatus: (items: typeof multiDayEvents) => items.map((item) => ({ ...item, derivedStatus: 'upcoming' as const })),
      getEventsWithDerivedStatus: (items: typeof multiDayEvents) => items.map((item) => ({ ...item, derivedStatus: 'upcoming' as const })),
      getReferenceDate: () => new Date('2026-04-16'),
      getEventDetailData: () => ({
        timelogs: [],
        contractors: [],
        receipts: [],
        event: multiDayEvents[0],
        applications: [],
        crewAssignments: [],
      }),
    }));

    vi.doMock('./EventDetailView', () => ({
      default: () => <div>detail</div>,
    }));

    vi.doMock('../components/modals/EventEditModal', () => ({
      default: () => null,
    }));

    vi.doMock('../components/modals/AssignCrewModal', () => ({
      default: () => null,
    }));

    const { default: EventsView } = await import('./EventsView');
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <EventsView />
      </QueryClientProvider>,
    );

    expect(screen.getAllByText('Dvoudenni akce')).toHaveLength(1);
    const multiDayCards = screen.getAllByTestId('event-list-card');
    expect(multiDayCards).toHaveLength(1);
    expect(multiDayCards[0]).toHaveAttribute('data-event-multiday', 'true');
    expect(multiDayCards[0].querySelector('[data-testid="event-list-accent"]')).not.toBeInTheDocument();
    expect(screen.getByText('Od')).toBeInTheDocument();
    expect(screen.getByText('16. 4. 2026 · 09:00')).toBeInTheDocument();
    expect(screen.getByText('Do')).toBeInTheDocument();
    expect(screen.getByText('17. 4. 2026 · 17:00')).toBeInTheDocument();
    expect(screen.getByText('Klient B')).toBeInTheDocument();
    expect(screen.queryByText(/16\. 4\. - 17\. 4\. 2026.*09:00.*17:00.*Klient B/)).not.toBeInTheDocument();
    expect(screen.queryByText('Začíná dnes')).not.toBeInTheDocument();
    expect(screen.queryByText(/Probíhá od/)).not.toBeInTheDocument();
    expect(screen.queryByText('Končí dnes')).not.toBeInTheDocument();
    expect(screen.getByText('2 dny')).toBeInTheDocument();
    expect(screen.queryByText(/17\..*dubna/i)).not.toBeInTheDocument();
  });

  it('shows mobile Crew events from today by default and hides past history', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-08-10T10:00:00+02:00'));
    mobileMockState.isMobile = true;

    const mobileCrewEvents = [
      {
        ...events[0],
        id: 30,
        supabaseId: 'event-past',
        name: 'Stara cervencova akce',
        startDate: '2026-07-13',
        endDate: '2026-07-15',
      },
      {
        ...events[0],
        id: 31,
        supabaseId: 'event-today',
        name: 'Dnesni akce',
        startDate: '2026-08-10',
        endDate: '2026-08-10',
      },
      {
        ...events[0],
        id: 32,
        supabaseId: 'event-future',
        name: 'Zarijova akce',
        startDate: '2026-09-02',
        endDate: '2026-09-02',
      },
    ];

    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => ({
        ...mockAppContext,
        role: 'crew',
        eventsFilter: 'all',
        eventsCalendarDate: '2026-07-01',
      }),
    }));

    vi.doMock('../features/events/queries/useEventsQuery', () => ({
      useEventsQuery: () => ({ data: mobileCrewEvents, isLoading: false, error: null }),
    }));

    vi.doMock('../features/events/services/events.service', () => ({
      createEmptyEvent: vi.fn(),
      createEventCopy: vi.fn((eventToCopy) => eventToCopy),
      applyForEvent: vi.fn(),
      requestEventWithdrawal: vi.fn(),
      withdrawEventApplication: vi.fn(),
      filterEventsByStatus: (items: typeof mobileCrewEvents, filter: string) => (
        filter === 'upcoming' ? items.filter((item) => item.derivedStatus !== 'past') : items
      ),
      getEventsWithDerivedStatus: (items: typeof mobileCrewEvents) => items.map((item) => ({
        ...item,
        derivedStatus: item.endDate < '2026-08-10' ? 'past' as const : 'upcoming' as const,
      })),
      getReferenceDate: () => new Date('2026-08-10T10:00:00+02:00'),
      getEventDetailData: (eventId: number | string) => ({
        ...eventDetail,
        event: mobileCrewEvents.find((event) => event.supabaseId === eventId || event.id === eventId) ?? mobileCrewEvents[0],
        timelogs: [],
        crewAssignments: [],
      }),
    }));

    vi.doMock('./EventDetailView', () => ({
      default: () => <div>detail</div>,
    }));

    vi.doMock('../components/modals/EventEditModal', () => ({
      default: () => null,
    }));

    vi.doMock('../components/modals/AssignCrewModal', () => ({
      default: () => null,
    }));

    const { default: EventsView } = await import('./EventsView');
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <EventsView />
      </QueryClientProvider>,
    );

    expect(screen.getByText('Dnesni akce')).toBeInTheDocument();
    expect(screen.getByText('Zarijova akce')).toBeInTheDocument();
    expect(screen.queryByText('Stara cervencova akce')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nadchazejici' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Uplynule' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Vse' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Predchozi mesic' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Dalsi mesic' })).not.toBeInTheDocument();
    expect(screen.queryByText('cervenec 2026')).not.toBeInTheDocument();
  });

  it('marks continuation days differently for CH and COO users', async () => {
    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => ({
        ...mockAppContext,
        role: 'coo',
        eventsCalendarDate: '2026-04-16',
      }),
    }));

    vi.doMock('../features/events/queries/useEventsQuery', () => ({
      useEventsQuery: () => ({ data: longMultiDayEvents, isLoading: false, error: null }),
    }));

    vi.doMock('../features/events/services/events.service', () => ({
      createEmptyEvent: vi.fn(),
      createEventCopy: vi.fn((eventToCopy) => eventToCopy),
      applyForEvent: vi.fn(),
      requestEventWithdrawal: vi.fn(),
      withdrawEventApplication: vi.fn(),
      filterEventsByStatus: (items: typeof longMultiDayEvents) => items.map((item) => ({ ...item, derivedStatus: 'upcoming' as const })),
      getEventsWithDerivedStatus: (items: typeof longMultiDayEvents) => items.map((item) => ({ ...item, derivedStatus: 'upcoming' as const })),
      getReferenceDate: () => new Date('2026-04-16'),
      getEventDetailData: () => ({
        timelogs: [],
        contractors: [],
        receipts: [],
        event: longMultiDayEvents[0],
        applications: [],
        crewAssignments: [],
      }),
    }));

    vi.doMock('./EventDetailView', () => ({
      default: () => <div>detail</div>,
    }));

    vi.doMock('../components/modals/EventEditModal', () => ({
      default: () => null,
    }));

    vi.doMock('../components/modals/AssignCrewModal', () => ({
      default: () => null,
    }));

    const { default: EventsView } = await import('./EventsView');
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <EventsView />
      </QueryClientProvider>,
    );

    expect(screen.getAllByText('Pětidenní akce')).toHaveLength(5);
    const multiDayCards = screen.getAllByTestId('event-list-card');
    expect(multiDayCards).toHaveLength(5);
    multiDayCards.forEach((card) => {
      expect(card).toHaveAttribute('data-event-multiday', 'true');
      expect(card.querySelector('[data-testid="event-list-accent"]')).toBeInTheDocument();
    });
    expect(new Set(multiDayCards.map((card) => card.style.getPropertyValue('--event-list-accent'))).size).toBe(1);
    expect(screen.queryByText('Začíná dnes')).not.toBeInTheDocument();
    expect(screen.queryByText(/Probíhá od/)).not.toBeInTheDocument();
    expect(screen.queryByText('Končí dnes')).not.toBeInTheDocument();
    expect(screen.getAllByText('5 dní')).toHaveLength(5);
    expect(screen.getAllByText('Od')).toHaveLength(5);
    expect(screen.getAllByText('16. 4. 2026 · 08:00')).toHaveLength(5);
    expect(screen.getAllByText('Do')).toHaveLength(5);
    expect(screen.getAllByText('20. 4. 2026 · 18:00')).toHaveLength(5);
  });

  it('shows multiple unique timelog shifts for the event day', async () => {
    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => mockAppContext,
    }));

    vi.doMock('../features/events/queries/useEventsQuery', () => ({
      useEventsQuery: () => ({ data: events, isLoading: false, error: null }),
    }));

    vi.doMock('../features/events/services/events.service', () => ({
      createEmptyEvent: vi.fn(),
      createEventCopy: vi.fn((eventToCopy) => eventToCopy),
      applyForEvent: vi.fn(),
      requestEventWithdrawal: vi.fn(),
      withdrawEventApplication: vi.fn(),
      filterEventsByStatus: (items: typeof events) => items.map((item) => ({ ...item, derivedStatus: 'full' as const })),
      getEventsWithDerivedStatus: (items: typeof events) => items.map((item) => ({ ...item, derivedStatus: 'full' as const })),
      getReferenceDate: () => new Date('2026-04-20'),
      getEventDetailData: () => ({
        ...eventDetail,
        timelogs: [
          {
            id: 1,
            eid: 1,
            contractorProfileId: 'profile-1',
            days: [{ d: '2026-04-20', f: '22:00', t: '03:00', type: 'provoz' as const }],
            km: 0,
            note: '',
            status: 'draft' as const,
          },
          {
            id: 2,
            eid: 1,
            contractorProfileId: 'profile-2',
            days: [{ d: '2026-04-20', f: '09:00', t: '14:00', type: 'provoz' as const }],
            km: 0,
            note: '',
            status: 'draft' as const,
          },
        ],
      }),
    }));

    vi.doMock('./EventDetailView', () => ({
      default: () => <div>detail</div>,
    }));

    vi.doMock('../components/modals/EventEditModal', () => ({
      default: () => null,
    }));

    vi.doMock('../components/modals/AssignCrewModal', () => ({
      default: () => null,
    }));

    const { default: EventsView } = await import('./EventsView');
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <EventsView />
      </QueryClientProvider>,
    );

    expect(screen.getByText(/09:00.*14:00, 22:00.*03:00/)).toBeInTheDocument();
  });
});
