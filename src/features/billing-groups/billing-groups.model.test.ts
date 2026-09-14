import { describe, expect, it } from 'vitest';
import type { Event, Role } from '../../types';
import {
  BillingError,
  billingEventKey,
  billingEventVersion,
  buildGroupCommand,
  canManageBillingGroups,
  replaceMembership,
  validateSelection,
  type BillingEventVersion,
  type BillingGroup,
  type BillingSnapshot,
} from './billing-groups.model';

const event = (overrides: Partial<Event> = {}): Event => ({
  id: 1,
  name: 'Akce',
  job: 'JOB1',
  projectId: 'p1',
  startDate: '2026-09-01',
  endDate: '2026-09-02',
  city: 'Praha',
  needed: 1,
  filled: 0,
  status: 'planning',
  client: 'Klient',
  ...overrides,
});

const version = (id: string, projectKey: string, value = 'v1'): BillingEventVersion => ({
  id,
  projectKey,
  version: value,
});

const managementRoles: Role[] = ['crewhead', 'coo'];

describe('billing group selection contract', () => {
  it('requires cross-project and move confirmations independently', () => {
    const groups: BillingGroup[] = [
      { id: 'g1', name: 'První', eventIds: ['A'] },
      { id: 'g2', name: 'Druhá', eventIds: ['B'] },
    ];
    const versions = [
      version('A', 'p1|JOB1', 'v1'),
      version('B', 'p2|JOB2', 'v2'),
    ];

    expect(() => validateSelection('coo', 'g1', ['A', 'B'], groups, versions, false, true))
      .toThrow('Potvrďte společnou fakturaci přes více projektů.');
    expect(() => validateSelection('coo', 'g1', ['A', 'B'], groups, versions, true, false))
      .toThrow('Potvrďte přesun z jiné fakturační skupiny.');
    expect(validateSelection('coo', 'g1', ['A', 'B'], groups, versions, true, true)).toBeUndefined();
  });

  it('denies crew even when all confirmations are present', () => {
    expect(() => validateSelection(
      'crew', 'g1', ['A'], [{ id: 'g1', name: 'G', eventIds: [] }],
      [version('A', 'p1|JOB1')], true, true,
    )).toThrow('Společnou fakturaci může měnit pouze produkce.');
  });

  it('moves selected membership immutably while retaining emptied groups', () => {
    const source: BillingGroup[] = [
      { id: 'g1', name: 'První', eventIds: ['A'] },
      { id: 'g2', name: 'Druhá', eventIds: ['B', 'C'] },
    ];
    const result = replaceMembership(source, { id: 'g1', name: 'První', eventIds: ['A', 'B', 'C'] });

    expect(result).toEqual([
      { id: 'g2', name: 'Druhá', eventIds: [] },
      { id: 'g1', name: 'První', eventIds: ['A', 'B', 'C'] },
    ]);
    expect(source).toEqual([
      { id: 'g1', name: 'První', eventIds: ['A'] },
      { id: 'g2', name: 'Druhá', eventIds: ['B', 'C'] },
    ]);
    expect(result[0].id).toBe('g2');
    expect(result[0].eventIds).toEqual([]);
    expect(result[0]).not.toBe(source[1]);
    expect(result[1]).not.toBe(source[0]);
    expect(result[1].eventIds).not.toBe(source[0].eventIds);
  });

  it('allows explicitly empty selections for both management roles', () => {
    for (const role of managementRoles) {
      expect(validateSelection(role, 'g1', [], [{ id: 'g1', name: 'G', eventIds: [] }], [], false, false))
        .toBeUndefined();
      expect(canManageBillingGroups(role)).toBe(true);
    }
    expect(canManageBillingGroups('crew')).toBe(false);
  });

  it('rejects duplicate, unknown, and empty-version selections', () => {
    const groups: BillingGroup[] = [{ id: 'g1', name: 'G', eventIds: [] }];
    const versions = [version('A', 'p1|JOB1'), version('EMPTY', 'p1|JOB1', '')];

    expect(() => validateSelection('coo', 'g1', ['A', 'A'], groups, versions, false, false))
      .toThrow('Akce je ve výběru vícekrát.');
    expect(() => validateSelection('coo', 'g1', ['MISSING'], groups, versions, false, false))
      .toThrow('Výběr akcí není aktuální. Obnovte data.');
    expect(() => validateSelection('coo', 'g1', ['EMPTY'], groups, versions, false, false))
      .toThrow('Výběr akcí není aktuální. Obnovte data.');
  });

  it('uses local numeric keys only for local data and requires remote UUIDs', () => {
    expect(billingEventKey(event({ id: 42 }), 'local')).toBe('local:42');
    expect(billingEventKey(event({ id: 42, supabaseId: 'event-uuid' }), 'supabase')).toBe('event-uuid');
    expect(() => billingEventKey(event({ id: 42 }), 'supabase')).toThrow(
      'Akci chybí serverová identita. Obnovte data.',
    );
  });

  it('creates deterministic local versions and timestamp-based remote versions', () => {
    expect(billingEventVersion(event({ id: 42 }), 'local')).toEqual({
      id: 'local:42',
      projectKey: 'p1|JOB1',
      version: JSON.stringify(['Akce', 'p1', 'JOB1', '2026-09-01', '2026-09-02']),
    });
    expect(billingEventVersion(event({ id: 42, supabaseId: 'event-uuid', updatedAt: 'updated-v1' }), 'supabase'))
      .toEqual({ id: 'event-uuid', projectKey: 'p1|JOB1', version: 'updated-v1' });
  });

  it('does not infer unselected events sharing a project and job', () => {
    const a = event({ id: 1, name: 'A' });
    const b = event({ id: 2, name: 'B' });
    const snapshot: BillingSnapshot = { revision: 3, groups: [] };
    const command = buildGroupCommand(
      { source: 'local', userId: null, profileId: null, role: 'coo' },
      snapshot,
      { id: 'g1', name: 'G', eventIds: ['local:1'] },
      [a, b],
      { cross: false, moves: false },
      'request-1',
    );

    expect(command.eventIds).toEqual(['local:1']);
    expect(Object.keys(command.eventVersions)).toEqual(['local:1']);
  });

  it('builds an atomic command with exact affected versions and detached members', () => {
    const a = event({ id: 1, name: 'A' });
    const b = event({ id: 2, name: 'B', projectId: 'p2', job: 'JOB2' });
    const c = event({ id: 3, name: 'C', projectId: 'p3', job: 'JOB3' });
    const draft = event({ id: 99, name: 'Draft', projectId: 'p9', supabaseId: undefined });
    const snapshot: BillingSnapshot = {
      revision: 8,
      groups: [{ id: 'g1', name: 'Old', eventIds: ['A', 'B'] }],
    };
    const suppliedGroup: BillingGroup = { id: 'g1', name: '  New name  ', eventIds: ['C', 'A'] };
    const command = buildGroupCommand(
      { source: 'supabase', userId: 'user', profileId: 'profile', role: 'crewhead' },
      snapshot,
      suppliedGroup,
      [
        { ...a, supabaseId: 'A', updatedAt: 'vA' },
        { ...b, supabaseId: 'B', updatedAt: 'vB' },
        { ...c, supabaseId: 'C', updatedAt: 'vC' },
        draft,
      ],
      { cross: true, moves: false },
      'stable-request',
    );

    expect(command).toEqual({
      requestId: 'stable-request',
      groupId: 'g1',
      name: 'New name',
      eventIds: ['A', 'C'],
      expectedRevision: 8,
      eventVersions: { A: 'vA', B: 'vB', C: 'vC' },
      confirmCrossProject: true,
      confirmMoves: false,
      deleteGroup: false,
    });
    expect(suppliedGroup.eventIds).toEqual(['C', 'A']);
    expect(command.eventIds).not.toBe(suppliedGroup.eventIds);
  });

  it('fails commands when affected identities or versions are stale', () => {
    const snapshot: BillingSnapshot = {
      revision: 1,
      groups: [{ id: 'g1', name: 'Old', eventIds: ['A'] }],
    };
    const base = event({ id: 1, supabaseId: 'A', updatedAt: 'v1' });

    expect(() => buildGroupCommand(
      { source: 'supabase', userId: null, profileId: null, role: 'coo' }, snapshot,
      { id: 'g1', name: 'G', eventIds: [] }, [], { cross: false, moves: false }, 'r',
    )).toThrow('Výběr akcí není aktuální. Obnovte data.');
    expect(() => buildGroupCommand(
      { source: 'supabase', userId: null, profileId: null, role: 'coo' }, snapshot,
      { id: 'g1', name: 'G', eventIds: [] }, [{ ...base, updatedAt: '' }], { cross: false, moves: false }, 'r',
    )).toThrow('Výběr akcí není aktuální. Obnovte data.');
  });

  it('applies cross-project and move confirmations while building commands', () => {
    const snapshot: BillingSnapshot = {
      revision: 4,
      groups: [
        { id: 'g1', name: 'První', eventIds: ['A'] },
        { id: 'g2', name: 'Druhá', eventIds: ['B'] },
      ],
    };
    const events = [
      event({ id: 1, supabaseId: 'A', updatedAt: 'vA', projectId: 'p1', job: 'JOB1' }),
      event({ id: 2, supabaseId: 'B', updatedAt: 'vB', projectId: 'p2', job: 'JOB2' }),
    ];
    const scope: Parameters<typeof buildGroupCommand>[0] = {
      source: 'supabase', userId: null, profileId: null, role: 'coo',
    };
    const group = { id: 'g1', name: 'G', eventIds: ['A', 'B'] };

    expect(() => buildGroupCommand(scope, snapshot, group, events, { cross: false, moves: true }, 'r'))
      .toThrow('Potvrďte společnou fakturaci přes více projektů.');
    expect(() => buildGroupCommand(scope, snapshot, group, events, { cross: true, moves: false }, 'r'))
      .toThrow('Potvrďte přesun z jiné fakturační skupiny.');
    expect(buildGroupCommand(scope, snapshot, group, events, { cross: true, moves: true }, 'r').eventIds)
      .toEqual(['A', 'B']);
  });

  it('requires a snapshot revision and bounded names, including deletion exception', () => {
    const scope = { source: 'local' as const, userId: null, profileId: null, role: 'coo' as const };
    const noRevision: BillingSnapshot = { revision: null, groups: [] };
    expect(() => buildGroupCommand(scope, noRevision, { id: 'g', name: '', eventIds: [] }, [], { cross: false, moves: false }, 'r'))
      .toThrow('Chybí verze fakturačních skupin.');

    const snapshot: BillingSnapshot = { revision: 1, groups: [] };
    expect(() => buildGroupCommand(scope, snapshot, { id: 'g', name: '   ', eventIds: [] }, [], { cross: false, moves: false }, 'r'))
      .toThrow('Název musí mít 1 až 120 znaků.');
    expect(() => buildGroupCommand(scope, snapshot, { id: 'g', name: 'x'.repeat(121), eventIds: [] }, [], { cross: false, moves: false }, 'r'))
      .toThrow('Název musí mít 1 až 120 znaků.');
    expect(buildGroupCommand(scope, snapshot, { id: 'g', name: '   ', eventIds: [] }, [], { cross: false, moves: false }, 'r', true).name)
      .toBe('');
  });

  it('retains validation errors as typed BillingErrors', () => {
    try {
      validateSelection('crew', 'g', [], [], [], false, false);
      throw new Error('expected denial');
    } catch (error) {
      expect(error).toBeInstanceOf(BillingError);
      expect((error as BillingError).kind).toBe('denied');
    }
  });
});
