import type { Event, Role } from '../../types';

export type BillingGroup = {
  id: string;
  name: string;
  eventIds: string[];
};

export type BillingSnapshot = {
  revision: number | null;
  groups: BillingGroup[];
};

export type BillingEventVersion = {
  id: string;
  projectKey: string;
  version: string;
};

export type BillingScope = {
  source: 'local' | 'supabase';
  userId: string | null;
  profileId: string | null;
  role: Role;
};

export type SaveBillingGroup = {
  requestId: string;
  groupId: string;
  name: string;
  eventIds: string[];
  expectedRevision: number;
  eventVersions: Record<string, string>;
  confirmCrossProject: boolean;
  confirmMoves: boolean;
  deleteGroup: boolean;
};

export type BillingMutationResult = {
  requestId: string;
  groupId: string;
  revision: number;
};

export type BillingErrorKind = 'conflict' | 'denied' | 'invalid' | 'ambiguous';

export class BillingError extends Error {
  public readonly kind: BillingErrorKind;

  constructor(kind: BillingErrorKind, message: string) {
    super(message);
    this.name = 'BillingError';
    this.kind = kind;
  }
}

export function canManageBillingGroups(role: Role): boolean {
  return role === 'crewhead' || role === 'coo';
}

export function billingEventKey(event: Event, source: BillingScope['source']): string {
  if (source === 'local') {
    return `local:${event.id}`;
  }

  if (!event.supabaseId) {
    throw new BillingError('invalid', 'Akci chybí serverová identita. Obnovte data.');
  }
  return event.supabaseId;
}

export function billingEventVersion(
  event: Event,
  source: BillingScope['source'],
): BillingEventVersion {
  const id = billingEventKey(event, source);
  const projectKey = `${event.projectId ?? ''}|${event.job ?? ''}`;
  const version = source === 'supabase'
    ? event.updatedAt ?? ''
    : JSON.stringify([
      event.name,
      event.projectId ?? null,
      event.job,
      event.startDate,
      event.endDate,
    ]);

  return { id, projectKey, version };
}

function invalid(message: string): never {
  throw new BillingError('invalid', message);
}

export function validateSelection(
  role: Role,
  groupId: string,
  eventIds: readonly string[],
  groups: readonly BillingGroup[],
  eventVersions: readonly BillingEventVersion[],
  confirmCrossProject: boolean,
  confirmMoves: boolean,
): void {
  if (!canManageBillingGroups(role)) {
    throw new BillingError('denied', 'Společnou fakturaci může měnit pouze produkce.');
  }

  if (new Set(eventIds).size !== eventIds.length) {
    invalid('Akce je ve výběru vícekrát.');
  }

  const eventById = new Map(eventVersions.map((eventVersion) => [eventVersion.id, eventVersion]));
  for (const eventId of eventIds) {
    const version = eventById.get(eventId);
    if (!version || !version.version) {
      invalid('Výběr akcí není aktuální. Obnovte data.');
    }
  }

  const projectKeys = new Set(eventIds.map((eventId) => eventById.get(eventId)!.projectKey));
  if (projectKeys.size > 1 && !confirmCrossProject) {
    invalid('Potvrďte společnou fakturaci přes více projektů.');
  }

  const movedEvent = eventIds.some((eventId) => groups.some(
    (group) => group.id !== groupId && group.eventIds.includes(eventId),
  ));
  if (movedEvent && !confirmMoves) {
    invalid('Potvrďte přesun z jiné fakturační skupiny.');
  }
}

export function replaceMembership(
  groups: readonly BillingGroup[],
  target: BillingGroup,
): BillingGroup[] {
  const selectedIds = new Set(target.eventIds);
  const remainingGroups = groups
    .filter((group) => group.id !== target.id)
    .map((group) => ({
      ...group,
      eventIds: group.eventIds.filter((eventId) => !selectedIds.has(eventId)),
    }));

  return [
    ...remainingGroups,
    { ...target, eventIds: [...target.eventIds] },
  ];
}

export type BillingConfirmations = {
  cross: boolean;
  moves: boolean;
};

export function buildGroupCommand(
  scope: BillingScope,
  snapshot: BillingSnapshot,
  group: BillingGroup,
  events: readonly Event[],
  confirmations: BillingConfirmations,
  requestId: string,
  deleteGroup = false,
): SaveBillingGroup {
  if (!canManageBillingGroups(scope.role)) {
    throw new BillingError('denied', 'Společnou fakturaci může měnit pouze produkce.');
  }
  if (snapshot.revision === null) {
    throw new BillingError('invalid', 'Chybí verze fakturačních skupin.');
  }

  const name = group.name.trim();
  if (!deleteGroup && (name.length < 1 || name.length > 120)) {
    invalid('Název musí mít 1 až 120 znaků.');
  }

  const versions = new Map<string, BillingEventVersion>();
  for (const event of events) {
    // Remote drafts without a server UUID are unrelated until explicitly persisted.
    if (scope.source === 'supabase' && !event.supabaseId) {
      continue;
    }
    const eventVersion = billingEventVersion(event, scope.source);
    versions.set(eventVersion.id, eventVersion);
  }
  validateSelection(
    scope.role,
    group.id,
    group.eventIds,
    snapshot.groups,
    [...versions.values()],
    confirmations.cross,
    confirmations.moves,
  );

  const previousTarget = snapshot.groups.find((candidate) => candidate.id === group.id);
  const affectedIds = new Set([
    ...(previousTarget?.eventIds ?? []),
    ...group.eventIds,
  ]);
  const affectedVersions: Record<string, string> = {};
  for (const eventId of affectedIds) {
    const eventVersion = versions.get(eventId);
    if (!eventVersion || !eventVersion.version) {
      invalid('Výběr akcí není aktuální. Obnovte data.');
    }
    affectedVersions[eventId] = eventVersion.version;
  }

  return {
    requestId,
    groupId: group.id,
    name,
    eventIds: [...group.eventIds].sort(),
    expectedRevision: snapshot.revision,
    eventVersions: affectedVersions,
    confirmCrossProject: confirmations.cross,
    confirmMoves: confirmations.moves,
    deleteGroup,
  };
}
