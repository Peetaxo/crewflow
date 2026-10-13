import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProjectEditModal from './ProjectEditModal';
const mocks = vi.hoisted(() => ({ editingProject: { id: 'JTI001', name: 'Project', client: 'Client', note: 'Preserved note', createdAt: '2026-04-28' }, setEditingProject: vi.fn(), saveProject: vi.fn() }));
vi.mock('../../context/useAppContext', () => ({ useAppContext: () => mocks }));
vi.mock('../../features/projects/services/projects.service', () => ({ getProjectDependencies: () => ({ projects: [mocks.editingProject], clients: [{ id: 1, name: 'Client' }] }), saveProject: mocks.saveProject }));
describe('ProjectEditModal', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.saveProject.mockResolvedValue(undefined); });
  it('hides the note field while preserving its stored value when saving', async () => {
    render(<ProjectEditModal />);
    expect(screen.queryByText('Poznamka')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /Pozn/ })).not.toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Ulozit projekt' })); });
    expect(mocks.saveProject).toHaveBeenCalledWith(expect.objectContaining({ note: 'Preserved note' }));
  });
});
