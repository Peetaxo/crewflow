import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Contractor, Event, Invoice, Project, ReceiptItem, Timelog } from '../types';
import ProjectStatsView from './ProjectStatsView';

const mocks = vi.hoisted(() => ({
  context: { selectedProjectIdForStats: 'JTI001', selectedEventId: null as string | number | null, setSelectedProjectIdForStats: vi.fn(), setSelectedEventId: vi.fn(), setEditingProject: vi.fn(), role: 'coo' },
  auth: { currentUserId: 'user-a', currentProfileId: 'profile-a', role: 'coo' },
  eventsQuery: { data: [] as Event[], isPending: false, isError: false, error: null as Error | null, refetch: vi.fn() },
  timelogsQuery: { data: [] as Timelog[], isPending: false, isError: false, error: null as Error | null, refetch: vi.fn() },
  invoicesQuery: { data: [] as Invoice[], isPending: false, isError: false, error: null as Error | null, refetch: vi.fn() },
  receiptsQuery: { data: [] as ReceiptItem[], isPending: false, isError: false, error: null as Error | null, refetch: vi.fn() },
  projects: [] as Project[], contractors: [] as Contractor[], listener: undefined as (() => void) | undefined,
  generateInvoicePdf: vi.fn(), getInvoicePdfDownloadUrl: vi.fn(), openInvoicePdfUrl: vi.fn(),
}));
const project: Project = { id: 'JTI001', supabaseId: 'project-uuid', name: 'JTI 2026', client: 'JTI', note: 'Hidden project note', createdAt: '2026-04-28' };
const events: Event[] = [
  { id: 2, supabaseId: 'event-2', name: 'Majales rozvozy', job: project.id, startDate: '2026-05-02', endDate: '2026-05-02', city: 'Brno', needed: 3, filled: 2, status: 'upcoming', client: 'JTI', contactPerson: 'Jana Nová' },
  { id: 1, supabaseId: 'event-1', name: 'Majales priprava', job: project.id, startDate: '2026-05-01', endDate: '2026-05-01', city: 'Praha', needed: 1, filled: 0, status: 'upcoming', client: 'JTI' },
];
const receipt: ReceiptItem = { id: 1, eid: 2, job: project.id, title: 'Parking', vendor: 'Garage', amount: 500, paidAt: '2026-05-02', note: 'Parking note', status: 'approved', contractorProfileId: 'profile-1' };
const contractor: Contractor = { id: 1, profileId: 'profile-1', name: 'Marek Rebros', ii: 'MR', bg: '#fff', fg: '#111', tags: [], events: 1, rate: 250, phone: '', email: '', ico: '', dic: '', bank: '', city: '', reliable: true, note: '' };
const invoice: Invoice = { id: 'inv-uuid', invoiceNumber: '2026-0042', eid: 1, hours: 0, hAmt: 3000, km: 0, kAmt: 0, total: 3000, job: project.id, status: 'sent', sentAt: null, dueDate: '2026-05-20' };
vi.mock('../context/useAppContext', () => ({ useAppContext: () => mocks.context }));
vi.mock('../app/providers/useAuth', () => ({ useAuth: () => mocks.auth }));
vi.mock('../features/events/queries/useEventsQuery', () => ({ useEventsQuery: () => mocks.eventsQuery }));
vi.mock('../features/timelogs/queries/useTimelogsQuery', () => ({ useTimelogsQuery: () => mocks.timelogsQuery }));
vi.mock('../features/invoices/queries/useInvoicesQuery', () => ({ useInvoicesQuery: () => mocks.invoicesQuery }));
vi.mock('../features/receipts/queries/useReceiptsQuery', () => ({ useReceiptsQuery: () => mocks.receiptsQuery }));
vi.mock('../features/projects/services/projects.service', async () => ({
  ...await import('../features/projects/services/project-summary'),
  getProjectById: (id: string) => mocks.projects.find((item) => item.id === id),
  getProjectDependencies: () => ({ projects: mocks.projects, events: [], invoices: [], receipts: [], timelogs: [], contractors: mocks.contractors, clients: [] }),
  subscribeToProjectChanges: (listener: () => void) => { mocks.listener = listener; return () => { mocks.listener = undefined; }; },
}));
vi.mock('../features/events/services/events.service', () => ({ createEmptyEvent: () => ({ id: 99, job: '', name: '', client: '', projectId: null }) }));
vi.mock('../components/modals/EventEditModal', () => ({ default: ({ editingEvent, onClose }: { editingEvent: Event | null; onClose: () => void }) => editingEvent ? <div role="dialog" aria-label="Nová akce"><span>{editingEvent.job}</span><span>{editingEvent.client}</span><span>{editingEvent.projectId}</span><button onClick={onClose}>Zavřít formulář</button></div> : null }));
vi.mock('./EventDetailView', () => ({ default: ({ backLabel }: { backLabel?: string }) => <div><span>Existing event detail</span><button onClick={() => mocks.context.setSelectedEventId(null)}>{backLabel}</button></div> }));
vi.mock('../features/invoices/services/invoice-pdf.service', () => ({ generateInvoicePdf: mocks.generateInvoicePdf, getInvoicePdfDownloadUrl: mocks.getInvoicePdfDownloadUrl }));
vi.mock('../features/invoices/services/invoice-pdf-download', () => ({ openInvoicePdfUrl: mocks.openInvoicePdfUrl }));

describe('ProjectStatsView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(mocks.context, { selectedProjectIdForStats: project.id, selectedEventId: null, role: 'coo' });
    Object.assign(mocks.auth, { currentUserId: 'user-a', currentProfileId: 'profile-a', role: 'coo' });
    for (const query of [mocks.eventsQuery, mocks.timelogsQuery, mocks.receiptsQuery, mocks.invoicesQuery]) Object.assign(query, { data: [], isPending: false, isError: false, error: null });
    mocks.projects = [project]; mocks.contractors = [contractor];
    mocks.eventsQuery.data = events; mocks.receiptsQuery.data = [receipt]; mocks.invoicesQuery.data = [invoice];
    mocks.generateInvoicePdf.mockResolvedValue({ pdfPath: 'invoices/project.pdf' });
    mocks.getInvoicePdfDownloadUrl.mockResolvedValue('https://signed.example/project.pdf');
  });

  it('shows the four project sections with period, linked events, costs, and documents', () => {
    render(<ProjectStatsView />);
    expect(screen.getByRole('heading', { name: project.name })).toBeInTheDocument();
    expect(screen.getByText('1. 5. 2026 – 2. 5. 2026')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Akce projektu' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Náklady projektu' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Doklady projektu' })).toBeInTheDocument();
    expect(screen.queryByText(project.note!)).not.toBeInTheDocument();
    for (const oldText of ['Hodiny', 'Kilometry', 'Timelogy projektu', 'Rozdeleni nakladu', 'Proplacene hodiny']) expect(screen.queryByText(oldText)).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /rozpo[cč]et/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pridat balik' })).not.toBeInTheDocument();
    expect(screen.queryByText('Variance')).not.toBeInTheDocument();
  });

  it('orders events chronologically and opens the existing event detail while retaining the project', () => {
    const { rerender } = render(<ProjectStatsView />);
    const region = screen.getByRole('region', { name: 'Akce projektu' });
    const rows = within(region).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Majales priprava');
    expect(rows[1]).toHaveTextContent('Brno');
    expect(rows[1]).toHaveTextContent('2 / 3');
    expect(rows[1]).toHaveTextContent('Kontaktní osoba: Jana Nová');
    expect(rows[1]).toHaveTextContent('2. 5. 2026');
    fireEvent.click(within(rows[1]).getByRole('button', { name: 'Majales rozvozy' }));
    expect(mocks.context.setSelectedEventId).toHaveBeenCalledWith('event-2');
    mocks.context.selectedEventId = 'event-2'; rerender(<ProjectStatsView />);
    expect(screen.getByText('Existing event detail')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Zpět na projekt' }));
    expect(mocks.context.setSelectedEventId).toHaveBeenLastCalledWith(null);
    expect(mocks.context.setSelectedProjectIdForStats).not.toHaveBeenCalled();
  });

  it('describes each event card with its own period, location, occupancy and contact', () => {
    render(<ProjectStatsView />);
    const preparation = screen.getByRole('button', { name: 'Majales priprava' });
    const deliveries = screen.getByRole('button', { name: 'Majales rozvozy' });
    expect(preparation).toHaveAccessibleDescription(/Praha.*1\. 5\. 2026.*0 \/ 1.*Kontaktní osoba: —/);
    expect(deliveries).toHaveAccessibleDescription(/Brno.*2\. 5\. 2026.*2 \/ 3.*Kontaktní osoba: Jana Nová/);
    expect(preparation).not.toHaveAccessibleDescription(/Brno|Jana Nová/);
    expect(deliveries).not.toHaveAccessibleDescription(/Praha/);
  });

  it('describes each receipt card with its own date, amount and status', () => {
    mocks.receiptsQuery.data = [receipt, { ...receipt, id: 2, title: 'Catering', amount: 900, paidAt: '2026-05-03', status: 'reimbursed' }];
    render(<ProjectStatsView />);
    const parking = screen.getByRole('button', { name: 'Parking' });
    const catering = screen.getByRole('button', { name: 'Catering' });
    expect(parking).toHaveAccessibleDescription(/2\. 5\. 2026.*500 Kc.*Schváleno/);
    expect(catering).toHaveAccessibleDescription(/3\. 5\. 2026.*900 Kc.*Uhrazeno/);
    expect(parking).not.toHaveAccessibleDescription(/900 Kc|Uhrazeno/);
    expect(catering).not.toHaveAccessibleDescription(/500 Kc|Schváleno/);
  });

  it('prefills the existing new-event form with project and client and keeps the project on close', () => {
    render(<ProjectStatsView />);
    fireEvent.click(screen.getByRole('button', { name: 'Nová akce projektu' }));
    const dialog = screen.getByRole('dialog', { name: 'Nová akce' });
    expect(dialog).toHaveTextContent(project.id);
    expect(dialog).toHaveTextContent(project.client);
    expect(dialog).toHaveTextContent(project.supabaseId!);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Zavřít formulář' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.context.setSelectedProjectIdForStats).not.toHaveBeenCalled();
  });

  it('edits the existing project and returns to its list', () => {
    render(<ProjectStatsView />);
    fireEvent.click(screen.getByRole('button', { name: 'Upravit projekt' }));
    expect(mocks.context.setEditingProject).toHaveBeenCalledWith(project);
    fireEvent.click(screen.getByRole('button', { name: 'Zpět na projekty' }));
    expect(mocks.context.setSelectedProjectIdForStats).toHaveBeenCalledWith(null);
  });

  it('hides project editing and new-event creation for crew', () => {
    mocks.context.role = 'crew'; render(<ProjectStatsView />);
    expect(screen.queryByRole('button', { name: 'Upravit projekt' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nová akce projektu' })).not.toBeInTheDocument();
  });

  it('uses current query data for cost categories and distinct stages', () => {
    mocks.invoicesQuery.data = [];
    mocks.timelogsQuery.data = [{ id: 1, eid: 1, contractorProfileId: contractor.profileId, days: [{ d: '2026-05-01', f: '20:00', t: '01:00', type: 'provoz' }], km: 10, note: '', status: 'draft' }];
    render(<ProjectStatsView />);
    const region = screen.getByRole('region', { name: 'Náklady projektu' });
    expect(within(region).getByText('Práce').parentElement).toHaveTextContent('1 250 Kc');
    expect(within(region).getByText('Doprava').parentElement).toHaveTextContent('56 Kc');
    expect(within(region).getByText('Stravné').parentElement).toHaveTextContent('0 Kc');
    expect(within(region).getByText('Účtenky').parentElement).toHaveTextContent('500 Kc');
    expect(within(region).getByText('Celkem').parentElement).toHaveTextContent('1 806 Kc');
    expect(within(region).getByText('Rozpracováno').parentElement).toHaveTextContent('1 306 Kc');
    expect(within(region).getByText('Schváleno').parentElement).toHaveTextContent('500 Kc');
    expect(within(region).getByText('Vyfakturováno').parentElement).toHaveTextContent('0 Kc');
    expect(within(region).getByText('Uhrazeno').parentElement).toHaveTextContent('0 Kc');
  });

  it('lists all invoice statuses with actual numbers and only the exact project share', () => {
    mocks.invoicesQuery.data = [
      { ...invoice, job: 'JTI001, OTHER', jobNumbers: ['JTI001', 'OTHER'], items: [{ id: 'a', jobNumber: project.id, work: 1000, travel: 0, meals: 0, receipts: 0, total: 1000 }, { id: 'b', jobNumber: 'OTHER', work: 2000, travel: 0, meals: 0, receipts: 0, total: 2000 }] },
      { ...invoice, id: 'draft', invoiceNumber: '2026-0043', status: 'draft' },
      { ...invoice, id: 'paid', invoiceNumber: '2026-0044', status: 'paid' },
    ];
    render(<ProjectStatsView />);
    const documents = screen.getByRole('region', { name: 'Doklady projektu' });
    const row = within(documents).getByText('2026-0042').closest('li')!;
    expect(row).toHaveTextContent('1 000 Kc');
    expect(row).toHaveTextContent('Podíl projektu');
    expect(row).not.toHaveTextContent('3 000 Kc');
    expect(row).toHaveTextContent('20. 5. 2026');
    expect(within(documents).getByText('2026-0043').closest('li')).toHaveTextContent('Koncept');
    expect(within(documents).getByText('2026-0044').closest('li')).toHaveTextContent('Uhrazeno');
  });

  it('labels unknown allocations instead of displaying the full shared invoice amount', () => {
    mocks.invoicesQuery.data = [{ ...invoice, job: 'JTI001, OTHER', jobNumbers: ['JTI001', 'OTHER'] }];
    render(<ProjectStatsView />);
    const row = screen.getByText(invoice.invoiceNumber!).closest('li')!;
    expect(row).toHaveTextContent('Podíl neznámý');
    expect(row).not.toHaveTextContent('3 000 Kc');
    expect(screen.getByText(/Některé podíly faktur/)).toBeInTheDocument();
  });

  it('shows query loading and errors without rendering false zero totals', () => {
    mocks.invoicesQuery.isPending = true;
    const { rerender } = render(<ProjectStatsView />);
    const costs = screen.getByRole('region', { name: 'Náklady projektu' });
    expect(within(costs).getByRole('status')).toHaveTextContent('Načítání nákladů');
    expect(within(costs).queryByText('0 Kc')).not.toBeInTheDocument();
    Object.assign(mocks.invoicesQuery, { isPending: false, isError: true, error: new Error('Invoice load failed') });
    rerender(<ProjectStatsView />);
    expect(within(costs).getByRole('alert')).toHaveTextContent('Invoice load failed');
    expect(within(costs).queryByText('0 Kc')).not.toBeInTheDocument();
  });

  it('keeps invoices available while receipts load and retries only the failed document query', () => {
    mocks.receiptsQuery.isPending = true;
    const { rerender } = render(<ProjectStatsView />);
    const documents = screen.getByRole('region', { name: 'Doklady projektu' });
    expect(within(documents).getByRole('status')).toHaveTextContent('Načítání účtenek');
    expect(within(documents).getByRole('button', { name: 'Otevřít PDF 2026-0042' })).toBeInTheDocument();
    Object.assign(mocks.receiptsQuery, { isPending: false, isError: true, error: new Error('Receipt load failed') });
    rerender(<ProjectStatsView />);
    expect(within(documents).getByRole('alert')).toHaveTextContent('Receipt load failed');
    fireEvent.click(within(documents).getByRole('button', { name: 'Zkusit znovu' }));
    expect(mocks.receiptsQuery.refetch).toHaveBeenCalledOnce();
    expect(mocks.invoicesQuery.refetch).not.toHaveBeenCalled();
  });

  it('keeps receipts available while invoices load', () => {
    mocks.invoicesQuery.isPending = true;
    render(<ProjectStatsView />);
    const documents = screen.getByRole('region', { name: 'Doklady projektu' });
    expect(within(documents).getByRole('status')).toHaveTextContent('Načítání faktur');
    const receiptCard = within(documents).getByRole('button', { name: 'Parking' }).closest('li');
    expect(receiptCard).toHaveTextContent('2. 5. 2026');
    expect(receiptCard).toHaveTextContent('500 Kc');
    expect(receiptCard).toHaveTextContent('Schváleno');
  });

  it('keeps the event loading and retry states scoped to events', () => {
    mocks.eventsQuery.isPending = true;
    const { rerender } = render(<ProjectStatsView />);
    const region = screen.getByRole('region', { name: 'Akce projektu' });
    expect(within(region).getByRole('status')).toHaveTextContent('Načítání akcí');
    expect(within(region).queryByRole('list')).not.toBeInTheDocument();
    Object.assign(mocks.eventsQuery, { isPending: false, isError: true, error: new Error('Event load failed') });
    rerender(<ProjectStatsView />);
    expect(within(region).getByRole('alert')).toHaveTextContent('Event load failed');
    fireEvent.click(within(region).getByRole('button', { name: 'Zkusit znovu' }));
    expect(mocks.eventsQuery.refetch).toHaveBeenCalledOnce();
  });

  it('shows the full multi-day event period and keeps the contact visible', async () => {
    mocks.eventsQuery.data = [{ ...events[0], endDate: '2026-05-04' }];
    render(<ProjectStatsView />);
    const eventCard = screen.getByRole('region', { name: 'Akce projektu' });
    await waitFor(() => expect(within(eventCard).getByText('2. 5. 2026 – 4. 5. 2026')).toBeVisible());
    expect(within(eventCard).getByText('Kontaktní osoba: Jana Nová')).toBeVisible();
  });

  it('opens receipts as read-only records with the event and member', () => {
    render(<ProjectStatsView />);
    fireEvent.click(screen.getByRole('button', { name: 'Parking' }));
    const dialog = screen.getByRole('dialog', { name: 'Parking' });
    for (const text of ['Garage', 'Parking note', 'Majales rozvozy', contractor.name, '500 Kc', '2. 5. 2026']) expect(within(dialog).getByText(text)).toBeInTheDocument();
    expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /Uložit|Schválit|Nahrát/ })).not.toBeInTheDocument();
  });

  it('opens the invoice PDF through the existing services', async () => {
    render(<ProjectStatsView />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Otevřít PDF 2026-0042' })); });
    expect(mocks.generateInvoicePdf).toHaveBeenCalledWith(invoice.id);
    expect(mocks.getInvoicePdfDownloadUrl).toHaveBeenCalledWith('invoices/project.pdf');
    expect(mocks.openInvoicePdfUrl).toHaveBeenCalledWith('https://signed.example/project.pdf');
  });

  it('shows PDF failures', async () => {
    mocks.generateInvoicePdf.mockRejectedValue(new Error('PDF unavailable'));
    render(<ProjectStatsView />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Otevřít PDF 2026-0042' })); });
    expect(screen.getByRole('alert')).toHaveTextContent('PDF unavailable');
    expect(mocks.openInvoicePdfUrl).not.toHaveBeenCalled();
  });

  it.each(['project', 'user', 'role', 'unmount'])('suppresses a pending PDF after a %s change', async (change) => {
    let resolve!: (value: string) => void;
    mocks.getInvoicePdfDownloadUrl.mockReturnValue(new Promise<string>((done) => { resolve = done; }));
    const { rerender, unmount } = render(<ProjectStatsView />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Otevřít PDF 2026-0042' })); });
    if (change === 'project') { mocks.projects.push({ ...project, id: 'OTHER' }); mocks.context.selectedProjectIdForStats = 'OTHER'; }
    if (change === 'user') mocks.auth.currentUserId = 'user-b';
    if (change === 'role') mocks.context.role = 'crew';
    if (change === 'unmount') unmount(); else rerender(<ProjectStatsView />);
    await act(async () => { resolve('https://signed.example/old.pdf'); });
    expect(mocks.openInvoicePdfUrl).not.toHaveBeenCalled();
  });

  it('closes the receipt and new-event dialogs when the project changes', () => {
    const { rerender } = render(<ProjectStatsView />);
    fireEvent.click(screen.getByRole('button', { name: 'Parking' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    mocks.projects.push({ ...project, id: 'OTHER', name: 'Other project' }); mocks.context.selectedProjectIdForStats = 'OTHER';
    rerender(<ProjectStatsView />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Nová akce projektu' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('OTHER');
    mocks.context.selectedProjectIdForStats = project.id; rerender(<ProjectStatsView />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it.each(['user', 'role'])('closes receipt and new-event dialogs after a %s scope change', (change) => {
    const { rerender } = render(<ProjectStatsView />);
    fireEvent.click(screen.getByRole('button', { name: 'Parking' }));
    if (change === 'user') mocks.auth.currentUserId = 'user-b';
    else mocks.context.role = 'crewhead';
    rerender(<ProjectStatsView />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Nová akce projektu' }));
    if (change === 'user') mocks.auth.currentUserId = 'user-c';
    else mocks.context.role = 'crew';
    rerender(<ProjectStatsView />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows explicit empty event and document states for a project without related data', () => {
    mocks.eventsQuery.data = []; mocks.receiptsQuery.data = []; mocks.invoicesQuery.data = [];
    render(<ProjectStatsView />);
    expect(screen.getByText('Projekt zatím nemá žádné akce.')).toBeInTheDocument();
    expect(screen.getByText('Projekt zatím nemá žádné účtenky.')).toBeInTheDocument();
    expect(screen.getByText('Projekt zatím nemá žádné faktury.')).toBeInTheDocument();
  });

  it.each(['eventsQuery', 'timelogsQuery', 'receiptsQuery'] as const)('does not show costs when %s fails', (key) => {
    Object.assign(mocks[key], { isError: true, error: new Error('Scoped load failed') });
    render(<ProjectStatsView />);
    const costs = screen.getByRole('region', { name: 'Náklady projektu' });
    expect(within(costs).getByRole('alert')).toHaveTextContent('Scoped load failed');
    expect(within(costs).queryByText('Celkem')).not.toBeInTheDocument();
  });

  it('recalculates from subscribed contractor rate changes', () => {
    mocks.invoicesQuery.data = []; mocks.receiptsQuery.data = [];
    mocks.timelogsQuery.data = [{ id: 1, eid: 1, contractorProfileId: contractor.profileId, days: [{ d: '2026-05-01', f: '09:00', t: '10:00', type: 'provoz' }], km: 0, note: '', status: 'draft' }];
    render(<ProjectStatsView />);
    expect(screen.getByText('Práce').parentElement).toHaveTextContent('250 Kc');
    act(() => { mocks.contractors = [{ ...contractor, rate: 300 }]; mocks.listener?.(); });
    expect(screen.getByText('Práce').parentElement).toHaveTextContent('300 Kc');
  });
});
