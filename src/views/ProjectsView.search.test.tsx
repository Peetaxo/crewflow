import React, { createContext, useContext, useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event, Project } from '../types';
import ProjectsView from './ProjectsView';

const mocks = vi.hoisted(() => ({
  isMobile: false,
  query: { data: [], isPending: false, isError: false, error: null as Error | null, refetch: vi.fn() },
  setSearchQuery: vi.fn(),
  setSelectedProjectIdForStats: vi.fn(),
}));
const projects: Project[] = [
  { id: 'AK001', name: 'Letní přehlídka', client: 'Škoda Auto', note: '', createdAt: '2026-01-01' },
  { id: 'AK002', name: 'Jarní roadshow', client: 'Škoda Auto', note: '', createdAt: '2026-01-01' },
  { id: 'BR003', name: 'Letní festival', client: 'Česká spořitelna', note: '', createdAt: '2026-01-01' },
  { id: 'NO004', name: 'Letní příprava', client: 'Škoda Auto', note: '', createdAt: '2026-01-01' },
];
const events: Event[] = [
  { id: 1, job: 'AK001', startDate: '2026-04-01', endDate: '2026-04-10' },
  { id: 2, job: 'AK001', startDate: '2026-04-20', endDate: '2026-04-25' },
  { id: 3, job: 'AK002', startDate: '2026-04-10', endDate: '2026-04-20' },
  { id: 4, job: 'BR003', startDate: '2026-05-01', endDate: '2026-05-10' },
].map((event) => ({ ...event, name: 'Akce', city: 'Praha', client: '', needed: 1, filled: 0, status: 'past' }));
const snapshot = { projects, events, contractors: [], timelogs: [], receipts: [], invoices: [], clients: [{ id: 1, name: 'Pouze CRM' }] };
const TestContext = createContext({
  selectedProjectIdForStats: null,
  setSelectedProjectIdForStats: mocks.setSelectedProjectIdForStats,
  setEditingProject: vi.fn(), setDeleteConfirm: vi.fn(),
  role: 'coo', searchQuery: '', setSearchQuery: (_query: string) => undefined,
});

vi.mock('../context/useAppContext', () => ({ useAppContext: () => useContext(TestContext) }));
vi.mock('../hooks/use-mobile', () => ({ useIsMobile: () => mocks.isMobile }));
vi.mock('../app/providers/useAuth', () => ({ useAuth: () => ({ currentUserId: 'user-a', currentProfileId: 'profile-a', role: 'coo' }) }));
vi.mock('../features/events/queries/useEventsQuery', () => ({ useEventsQuery: () => mocks.query }));
vi.mock('../features/timelogs/queries/useTimelogsQuery', () => ({ useTimelogsQuery: () => mocks.query }));
vi.mock('../lib/app-config', () => ({ appDataSource: 'local' }));
vi.mock('../lib/supabase', () => ({ isSupabaseConfigured: false, supabase: null }));
vi.mock('../lib/app-data', () => ({
  getLocalAppState: () => snapshot,
  subscribeToLocalAppState: () => () => undefined,
  updateLocalAppState: vi.fn(),
}));
vi.mock('./ProjectStatsView', () => ({ default: () => null }));

function Harness({ initialSearch = '' }: { initialSearch?: string }) {
  const [searchQuery, setSearch] = useState(initialSearch);
  const setSearchQuery = (query: string) => { mocks.setSearchQuery(query); setSearch(query); };
  return <TestContext.Provider value={{ ...useContext(TestContext), searchQuery, setSearchQuery }}>
    <input aria-label="Hledání v postranním panelu" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} />
    <ProjectsView />
  </TestContext.Provider>;
}
const visibleIds = () => {
  const list = within(screen.getByRole('region', { name: 'Seznam projektů' }));
  return projects.filter((project) => list.queryByText(project.id)).map((project) => project.id);
};
describe('rendered project search with real results', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isMobile = false;
    Object.assign(mocks.query, { isPending: false, isError: false, error: null });
  });

  it('updates actual rows immediately and shares the search value with other context consumers', () => {
    render(<Harness initialSearch="AK001" />);
    const search = screen.getByRole('searchbox', { name: 'Vyhledat projekty' });
    expect(search).toHaveValue('AK001');
    expect(search).toHaveAttribute('placeholder', 'Job Number, název nebo klient');
    expect(visibleIds()).toEqual(['AK001']);
    fireEvent.change(search, { target: { value: '  PREHLIDKA  ' } });
    expect(mocks.setSearchQuery).toHaveBeenLastCalledWith('  PREHLIDKA  ');
    expect(screen.getByLabelText('Hledání v postranním panelu')).toHaveValue('  PREHLIDKA  ');
    expect(visibleIds()).toEqual(['AK001']);
    fireEvent.change(screen.getByLabelText('Hledání v postranním panelu'), { target: { value: 'ceska' } });
    expect(search).toHaveValue('ceska');
    expect(visibleIds()).toEqual(['BR003']);
    expect(screen.getByText('Zobrazeno: 1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Vymazat hledání' }));
    expect(search).toHaveValue('');
    expect(visibleIds()).toEqual(['AK001', 'AK002', 'BR003', 'NO004']);
    expect(screen.getByText('Zobrazeno: 4')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Vymazat hledání' })).not.toBeInTheDocument();
  });

  it('reports no count until results are ready and reports zero for an empty match', () => {
    mocks.query.isPending = true;
    const { rerender } = render(<Harness />);
    expect(screen.queryByText(/Zobrazeno:/)).not.toBeInTheDocument();
    Object.assign(mocks.query, { isPending: false, isError: true, error: new Error('Offline') });
    rerender(<Harness />);
    expect(screen.getByRole('alert')).toHaveTextContent('Offline');
    expect(screen.queryByText(/Zobrazeno:/)).not.toBeInTheDocument();
    Object.assign(mocks.query, { isError: false, error: null });
    rerender(<Harness />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Vyhledat projekty' }), { target: { value: 'nenalezeno' } });
    expect(screen.getByText('Zobrazeno: 0')).toBeInTheDocument();
    expect(visibleIds()).toEqual([]);
    expect(screen.getByText('Žádné projekty neodpovídají hledání.')).toBeInTheDocument();
  });

  it('keeps the compact mobile row limited to job number, name and client while searching', () => {
    mocks.isMobile = true;
    render(<Harness />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Vyhledat projekty' }), { target: { value: 'ak001' } });
    const list = within(screen.getByRole('region', { name: 'Seznam projektů' }));
    const row = list.getByRole('button', { name: 'AK001 Letní přehlídka Škoda Auto' });
    expect(list.getAllByRole('listitem')).toHaveLength(1);
    expect(row).toHaveTextContent('AK001Letní přehlídkaŠkoda Auto');
    expect(list.queryByRole('table')).not.toBeInTheDocument();
    expect(list.queryByText(/2026/)).not.toBeInTheDocument();
    expect(list.queryByRole('button', { name: 'Upravit' })).not.toBeInTheDocument();
    fireEvent.click(row);
    expect(mocks.setSelectedProjectIdForStats).toHaveBeenCalledWith('AK001');
  });
});
