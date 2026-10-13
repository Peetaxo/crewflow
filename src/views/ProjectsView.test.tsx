import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectListFilters } from '../features/projects/services/projects.service';
import ProjectsView from './ProjectsView';

const mocks = vi.hoisted(() => ({
  context: { selectedProjectIdForStats: null as string | null, setSelectedProjectIdForStats: vi.fn(), setEditingProject: vi.fn(), setDeleteConfirm: vi.fn(), projectFilter: 'past', searchQuery: '', role: 'coo' },
  getProjectRows: vi.fn(),
  query: { data: [], isPending: false, isError: false, error: null, refetch: vi.fn() },
}));
const project = { id: 'JTI001', name: 'JTI', client: 'NextLevel s.r.o.', note: 'Stored note', createdAt: '2026-04-29' };
const projectRows = [{ ...project, status: 'full', eventCount: 2, crewCost: 1500, period: { startDate: '2026-05-01', endDate: '2026-05-03' } }];
vi.mock('../context/useAppContext', () => ({ useAppContext: () => mocks.context }));
vi.mock('../app/providers/useAuth', () => ({ useAuth: () => ({ currentUserId: 'user-a', currentProfileId: 'profile-a', role: 'coo' }) }));
vi.mock('../features/events/queries/useEventsQuery', () => ({ useEventsQuery: () => mocks.query }));
vi.mock('../features/timelogs/queries/useTimelogsQuery', () => ({ useTimelogsQuery: () => mocks.query }));
vi.mock('../features/projects/services/projects.service', async () => {
  const summary = await import('../features/projects/services/project-summary');
  return { ...summary, createEmptyProject: () => ({ id: '', name: '', client: '', note: '', createdAt: '' }), getProjectById: () => project,
    getProjectRows: (...args: unknown[]) => mocks.getProjectRows(...args), getProjectDependencies: () => ({ projects: [project], contractors: [], clients: [{ id: 1, name: project.client }] }), subscribeToProjectChanges: () => () => undefined };
});
vi.mock('./ProjectStatsView', () => ({ default: () => <div>project detail</div> }));

describe('ProjectsView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(mocks.context, { role: 'coo', selectedProjectIdForStats: null, projectFilter: 'past', searchQuery: '' });
    Object.assign(mocks.query, { isPending: false, isError: false, error: null });
    mocks.getProjectRows.mockReturnValue(projectRows);
  });

  it('shows the event period in its own column and ignores the saved old filter', () => {
    render(<ProjectsView />);
    expect(screen.getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['Job Number', 'Název', 'Období', 'Klient', 'Počet akcí', 'Náklady Crew', 'Akce']);
    expect(screen.getByText('1. 5. 2026 – 3. 5. 2026')).toBeInTheDocument();
    expect(screen.queryByText(project.createdAt)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Vse|Nadchazejici|Uplynule/ })).not.toBeInTheDocument();
    expect(mocks.getProjectRows).toHaveBeenLastCalledWith('', {});
    expect(screen.queryByRole('columnheader', { name: 'Stav' })).not.toBeInTheDocument();
  });

  it('passes the search and client/date filters and resets them', () => {
    mocks.context.searchQuery = 'JTI';
    render(<ProjectsView />);
    fireEvent.click(screen.getByRole('button', { name: 'Filtrovat projekty' }));
    const popup = screen.getByRole('dialog', { name: 'Filtry projektů' });
    fireEvent.change(within(popup).getByLabelText('Klient'), { target: { value: project.client } });
    fireEvent.change(within(popup).getByLabelText('Od'), { target: { value: '2026-05-02' } });
    fireEvent.change(within(popup).getByLabelText('Do'), { target: { value: '2026-05-10' } });
    const filters: ProjectListFilters = { client: project.client, startDate: '2026-05-02', endDate: '2026-05-10' };
    expect(mocks.getProjectRows).toHaveBeenLastCalledWith('JTI', filters);
    fireEvent.click(within(popup).getByRole('button', { name: 'Resetovat filtry' }));
    expect(mocks.getProjectRows).toHaveBeenLastCalledWith('JTI', {});
  });

  it('uses compact plus creation controls and opens the existing project for editing', () => {
    render(<ProjectsView />);
    const createButtons = screen.getAllByRole('button', { name: 'Nový projekt' });
    expect(createButtons).toHaveLength(2);
    expect(createButtons.every((button) => button.textContent === '+')).toBe(true);
    fireEvent.click(createButtons[0]);
    expect(mocks.context.setEditingProject).toHaveBeenCalledWith(expect.objectContaining({ id: '', name: '' }));
    fireEvent.click(screen.getByRole('button', { name: 'Upravit' }));
    expect(mocks.context.setEditingProject).toHaveBeenLastCalledWith(project);
  });

  it('hides creation and editing for crew', () => {
    mocks.context.role = 'crew';
    render(<ProjectsView />);
    expect(screen.queryByRole('button', { name: 'Nový projekt' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Upravit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Smazat projekt' })).not.toBeInTheDocument();
  });

  it('shows loading and failure without claiming an empty or zero-cost list', () => {
    mocks.query.isPending = true;
    const { rerender } = render(<ProjectsView />);
    expect(screen.getByRole('status')).toHaveTextContent('Načítání projektů');
    expect(screen.queryByText('1 500 Kc')).not.toBeInTheDocument();
    Object.assign(mocks.query, { isPending: false, isError: true, error: new Error('Offline') });
    rerender(<ProjectsView />);
    expect(screen.getByRole('alert')).toHaveTextContent('Offline');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('contains wide columns in a horizontal scrolling region', () => {
    render(<ProjectsView />);
    expect(screen.getByRole('region', { name: 'Seznam projektů' })).toHaveClass('overflow-x-auto', 'max-w-full');
    expect(screen.getByRole('table')).toHaveClass('min-w-[760px]');
  });
});
