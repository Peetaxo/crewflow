import { getLocalAppState } from '../../lib/app-data';
import {
  BillingError,
  billingEventVersion,
  canManageBillingGroups,
  replaceMembership,
  validateSelection,
  type BillingGroup,
  type BillingMutationResult,
  type BillingScope,
  type BillingSnapshot,
  type SaveBillingGroup,
} from './billing-groups.model';

type LocalRequest = {
  actor: string;
  payload: string;
  result: BillingMutationResult;
};

type LocalBillingState = {
  revision: number;
  groups: BillingGroup[];
};

const localState: LocalBillingState = { revision: 0, groups: [] };
const requests = new Map<string, LocalRequest>();

function copyGroup(group: BillingGroup): BillingGroup {
  return { id: group.id, name: group.name, eventIds: [...group.eventIds] };
}

function copySnapshot(snapshot: BillingSnapshot): BillingSnapshot {
  return { revision: snapshot.revision, groups: snapshot.groups.map(copyGroup) };
}

function copyResult(result: BillingMutationResult): BillingMutationResult {
  return { requestId: result.requestId, groupId: result.groupId, revision: result.revision };
}

function invalid(message: string): never {
  throw new BillingError('invalid', message);
}

function conflict(): never {
  throw new BillingError('conflict', 'Data se mezitím změnila. Obnovte výběr a znovu jej potvrďte.');
}

function actorFor(scope: BillingScope): string {
  return scope.userId ?? scope.profileId ?? 'local-production';
}

function visibleToCrew(
  scope: BillingScope,
  eventId: number,
  snapshot: ReturnType<typeof getLocalAppState>,
): boolean {
  const event = snapshot.events.find((candidate) => candidate.id === eventId);
  if (!event) return false;
  if (event.status === 'upcoming' || event.status === 'full') return true;
  if (!scope.profileId) return false;

  return snapshot.eventCrewAssignments.some((assignment) => (
    assignment.eventId === eventId && assignment.contractorProfileId === scope.profileId
  )) || snapshot.eventApplications.some((application) => (
    application.eventId === eventId && application.contractorProfileId === scope.profileId
  )) || snapshot.timelogs.some((timelog) => (
    timelog.eid === eventId && timelog.contractorProfileId === scope.profileId
  ));
}

export function readLocalBillingGroups(scope: BillingScope): BillingSnapshot {
  if (canManageBillingGroups(scope.role)) {
    return copySnapshot({ revision: localState.revision, groups: localState.groups });
  }

  const appState = getLocalAppState();
  const visibleEventIds = new Set(appState.events.filter((event) => (
    visibleToCrew(scope, event.id, appState)
  )).map((event) => `local:${event.id}`));
  const groups = localState.groups.flatMap((group) => {
    const eventIds = group.eventIds.filter((eventId) => visibleEventIds.has(eventId));
    return eventIds.length > 0 ? [{ id: group.id, name: group.name, eventIds }] : [];
  });
  return copySnapshot({ revision: null, groups });
}

export function saveLocalBillingGroup(
  scope: BillingScope,
  command: SaveBillingGroup,
): BillingMutationResult {
  if (!canManageBillingGroups(scope.role)) {
    throw new BillingError('denied', 'Společnou fakturaci může měnit pouze produkce.');
  }

  const actor = actorFor(scope);
  const payload = JSON.stringify(command);
  const previous = requests.get(command.requestId);
  if (previous) {
    if (previous.actor !== actor || previous.payload !== payload) {
      invalid('Požadavek má jiné údaje. Obnovte výběr.');
    }
    return copyResult(previous.result);
  }

  if (command.expectedRevision !== localState.revision) {
    conflict();
  }

  const appState = getLocalAppState();
  const target = localState.groups.find((group) => group.id === command.groupId);
  const affectedIds = new Set([...(target?.eventIds ?? []), ...command.eventIds]);
  const versionKeys = Object.keys(command.eventVersions);
  if (
    versionKeys.length !== affectedIds.size
    || versionKeys.some((eventId) => !affectedIds.has(eventId))
  ) {
    conflict();
  }

  const currentVersions = appState.events.map((event) => billingEventVersion(event, 'local'));
  const currentVersionsById = new Map(currentVersions.map((version) => [version.id, version.version]));
  for (const eventId of affectedIds) {
    if (command.eventVersions[eventId] !== currentVersionsById.get(eventId)) {
      conflict();
    }
  }

  validateSelection(
    scope.role,
    command.groupId,
    command.eventIds,
    localState.groups,
    currentVersions,
    command.confirmCrossProject,
    command.confirmMoves,
  );

  let nextGroups: BillingGroup[];
  if (command.deleteGroup) {
    if (!target) invalid('Skupina už neexistuje. Obnovte data.');
    if (command.eventIds.length !== 0 || target.eventIds.length !== 0) {
      invalid('Smazat lze pouze prázdnou skupinu.');
    }
    nextGroups = localState.groups.filter((group) => group.id !== command.groupId).map(copyGroup);
  } else {
    const name = command.name.trim();
    if (name.length < 1 || name.length > 120) {
      invalid('Název musí mít 1 až 120 znaků.');
    }
    nextGroups = replaceMembership(localState.groups, {
      id: command.groupId,
      name,
      eventIds: [...command.eventIds],
    });
  }

  const result: BillingMutationResult = {
    requestId: command.requestId,
    groupId: command.groupId,
    revision: localState.revision + 1,
  };
  localState.revision = result.revision;
  localState.groups = nextGroups.map(copyGroup);
  requests.set(command.requestId, { actor, payload, result: copyResult(result) });
  return copyResult(result);
}
