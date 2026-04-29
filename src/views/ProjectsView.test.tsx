import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAppContext = {
  selectedProjectIdForStats: null,
  setSelectedProjectIdForStats: vi.fn(),
  setEditingProject: vi.fn(),
  setDeleteConfirm: vi.fn(),
  projectFilter: 'all',
  setProjectFilter: vi.fn(),
  searchQuery: '',
};

const projectRows = [
  {
    id: 'JTI001',
    name: 'JTI',
    client: 'NextLevel s.r.o.',
    status: 'full' as const,
    eventCount: 2,
    crewCost: 1500,
    createdAt: '2026-04-29',
  },
];

describe('ProjectsView', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('does not render project status in the project table', async () => {
    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => mockAppContext,
    }));

    vi.doMock('../features/projects/services/projects.service', () => ({
      createEmptyProject: vi.fn(),
      getProjectById: vi.fn(),
      getProjectRows: () => projectRows,
      subscribeToProjectChanges: vi.fn(() => () => undefined),
    }));

    vi.doMock('./ProjectStatsView', () => ({
      default: () => <div>project detail</div>,
    }));

    const { default: ProjectsView } = await import('./ProjectsView');

    render(<ProjectsView />);

    expect(screen.queryByRole('columnheader', { name: 'Stav' })).not.toBeInTheDocument();
    expect(screen.queryByText('Obsazeno')).not.toBeInTheDocument();
  });
});
