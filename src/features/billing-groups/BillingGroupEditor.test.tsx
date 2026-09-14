import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '../../types';
import { BillingError, type BillingScope, type BillingSnapshot, type SaveBillingGroup } from './billing-groups.model';
import BillingGroupEditor from './BillingGroupEditor';
import { billingEvents } from './billing-groups.fixtures';

const scope: BillingScope = { source: 'local', userId: 'user-1', profileId: 'profile-1', role: 'crewhead' };
const snapshot: BillingSnapshot = { revision: 4, groups: [] };
const projects: Project[] = [
  { id: 'A', supabaseId: 'pa', name: 'Projekt A', client: 'Klient', createdAt: '2026-01-01' },
  { id: 'B', supabaseId: 'pb', name: 'Projekt B', client: 'Klient', createdAt: '2026-01-01' },
];

function renderEditor(overrides: Partial<React.ComponentProps<typeof BillingGroupEditor>> = {}) {
  const onSave = vi.fn<(command: SaveBillingGroup) => Promise<unknown>>().mockResolvedValue(undefined);
  const onClose = vi.fn();
  const onReload = vi.fn();
  const view = render(
    <BillingGroupEditor
      scope={scope}
      snapshot={snapshot}
      events={billingEvents}
      projects={projects}
      anchor={billingEvents[0]}
      onSave={onSave}
      onClose={onClose}
      onReload={onReload}
      {...overrides}
    />,
  );
  return { ...view, onSave, onClose, onReload };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => { resolve = nextResolve; });
  return { promise, resolve };
}

describe('BillingGroupEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000099');
  });

  it('requires an explicit cross-project confirmation after opting in and selecting another project', async () => {
    const { onSave } = renderEditor();

    expect(screen.queryByRole('checkbox', { name: /Instal/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Zahrnout jiné projekty' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Instal/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Uložit propojení' }));

    expect(onSave).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent('Potvrďte společnou fakturaci');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Potvrzuji společnou fakturaci přes více projektů' }));
    fireEvent.click(screen.getByRole('button', { name: 'Uložit propojení' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toMatchObject({
      eventIds: ['local:1', 'local:2'],
      confirmCrossProject: true,
    });
  });

  it('retries an ambiguous request with the exact same command object', async () => {
    const onSave = vi.fn<(command: SaveBillingGroup) => Promise<unknown>>()
      .mockRejectedValueOnce(new BillingError('ambiguous', 'Síť'))
      .mockResolvedValueOnce(undefined);
    renderEditor({ onSave });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Uložit propojení' }));
    });
    expect(await screen.findByRole('button', { name: 'Zopakovat stejný požadavek' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Zopakovat stejný požadavek' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect(onSave.mock.calls[1][0]).toBe(onSave.mock.calls[0][0]);
  });

  it('requires the move confirmation independently from the cross-project confirmation', async () => {
    const { onSave } = renderEditor({
      snapshot: {
        revision: 4,
        groups: [{ id: '00000000-0000-4000-8000-000000000011', name: 'Původní skupina', eventIds: ['local:2'] }],
      },
    });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Zahrnout jiné projekty' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Instal/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Potvrzuji společnou fakturaci přes více projektů' }));
    fireEvent.click(screen.getByRole('button', { name: 'Uložit propojení' }));

    expect(onSave).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent('Potvrďte přesun');
    expect(screen.getByText('Přesun ze skupin: Původní skupina')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Potvrzuji přesun z jiné skupiny' }));
    fireEvent.click(screen.getByRole('button', { name: 'Uložit propojení' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toMatchObject({ confirmCrossProject: true, confirmMoves: true });
  });

  it('preserves a selected existing group id and its members', async () => {
    const groupId = '00000000-0000-4000-8000-000000000012';
    const { onSave } = renderEditor({
      snapshot: { revision: 4, groups: [{ id: groupId, name: 'Září', eventIds: ['local:2'] }] },
    });

    fireEvent.change(screen.getByLabelText('Fakturační skupina'), { target: { value: groupId } });
    expect(screen.getByRole('checkbox', { name: /Instal/i })).toBeChecked();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Potvrzuji společnou fakturaci přes více projektů' }));
    fireEvent.click(screen.getByRole('button', { name: 'Uložit propojení' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toMatchObject({ groupId, name: 'Září', eventIds: ['local:1', 'local:2'] });
  });

  it('locks the stale draft and only reloads after a conflict', async () => {
    const onSave = vi.fn<(command: SaveBillingGroup) => Promise<unknown>>()
      .mockRejectedValue(new BillingError('conflict', 'Data se změnila'));
    const { onReload } = renderEditor({ onSave });

    fireEvent.click(screen.getByRole('button', { name: 'Uložit propojení' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Data se změnila');
    expect(screen.queryByRole('button', { name: 'Uložit propojení' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Název skupiny')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Zahodit výběr a načíst aktuální data' }));
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it('uses frozen events and snapshot after a parent rerender', async () => {
    const onSave = vi.fn<(command: SaveBillingGroup) => Promise<unknown>>().mockResolvedValue(undefined);
    const view = renderEditor({ onSave });
    const newerEvents = billingEvents.map((event) => ({ ...event, name: `Nové ${event.name}`, updatedAt: 'new' }));

    view.rerender(
      <BillingGroupEditor
        scope={{ ...scope, source: 'local' }}
        snapshot={{ revision: 99, groups: [] }}
        events={newerEvents}
        projects={projects}
        anchor={newerEvents[0]}
        onSave={onSave}
        onClose={vi.fn()}
        onReload={vi.fn()}
      />,
    );
    expect(screen.getByDisplayValue('Nakládka')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Uložit propojení' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].expectedRevision).toBe(4);
    expect(onSave.mock.calls[0][0].eventVersions['local:1']).toContain('Nakládka');
  });

  it('prevents a duplicate save while the first request is pending', () => {
    const request = deferred<unknown>();
    const onSave = vi.fn<(command: SaveBillingGroup) => Promise<unknown>>().mockReturnValue(request.promise);
    renderEditor({ onSave });

    fireEvent.click(screen.getByRole('button', { name: 'Uložit propojení' }));
    fireEvent.click(screen.getByRole('button', { name: 'Uložit propojení' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Zavřít' })).toBeDisabled();
    request.resolve(undefined);
  });

  it('does not render an editor for crew and skips unidentified remote drafts', () => {
    const { unmount } = renderEditor({ scope: { ...scope, role: 'crew' } });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    unmount();

    renderEditor({
      scope: { ...scope, source: 'supabase' },
      anchor: { ...billingEvents[0], supabaseId: '00000000-0000-4000-8000-000000000021', updatedAt: 'version-a' },
      events: [
        { ...billingEvents[0], supabaseId: '00000000-0000-4000-8000-000000000021', updatedAt: 'version-a' },
        { ...billingEvents[1], supabaseId: undefined },
      ],
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Zahrnout jiné projekty' }));
    expect(screen.queryByRole('checkbox', { name: /Instal/i })).not.toBeInTheDocument();
  });

  it('fails closed when the remote anchor has no server identity', () => {
    const { onSave } = renderEditor({ scope: { ...scope, source: 'supabase' } });

    expect(screen.getByRole('alert')).toHaveTextContent('Akci chybí serverová identita');
    expect(screen.queryByRole('button', { name: 'Uložit propojení' })).not.toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('layers the billing editor above the mobile event detail and its controls', () => {
    renderEditor();

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveClass('z-[101]');
    expect(dialog.previousElementSibling).toHaveClass('z-[100]');
  });

  it('allows deletion only for a group that was already empty', async () => {
    const emptyId = '00000000-0000-4000-8000-000000000031';
    const first = renderEditor({
      snapshot: { revision: 4, groups: [{ id: emptyId, name: 'Prázdná', eventIds: [] }] },
    });
    fireEvent.change(screen.getByLabelText('Fakturační skupina'), { target: { value: emptyId } });
    fireEvent.click(screen.getByRole('checkbox', { name: /Nakládka/i }));
    expect(screen.getByRole('button', { name: 'Smazat prázdnou skupinu' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Smazat prázdnou skupinu' }));
    await waitFor(() => expect(first.onSave).toHaveBeenCalledTimes(1));
    expect(first.onSave.mock.calls[0][0].deleteGroup).toBe(true);
    first.unmount();

    render(
      <BillingGroupEditor
        scope={scope}
        snapshot={{ revision: 4, groups: [{ id: emptyId, name: 'Plná', eventIds: ['local:1'] }] }}
        events={billingEvents}
        projects={projects}
        anchor={billingEvents[0]}
        onSave={vi.fn().mockResolvedValue(undefined)}
        onClose={vi.fn()}
        onReload={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: /Nakládka/i }));
    expect(screen.queryByRole('button', { name: 'Smazat prázdnou skupinu' })).not.toBeInTheDocument();
  });
});
