import { useRef, useState } from 'react';
import type { Event, Project } from '../../types';
import { Button } from '../../components/ui/button';
import { Checkbox } from '../../components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { createStableDraftUuid } from '../stable-draft-identity';
import {
  BillingError,
  billingEventKey,
  buildGroupCommand,
  canManageBillingGroups,
  type BillingGroup,
  type BillingScope,
  type BillingSnapshot,
  type SaveBillingGroup,
} from './billing-groups.model';

type BillingGroupEditorProps = {
  scope: BillingScope;
  snapshot: BillingSnapshot;
  events: Event[];
  projects: Project[];
  anchor: Event;
  onSave: (command: SaveBillingGroup) => Promise<unknown>;
  onClose: () => void;
  onReload: () => void;
};

type FrozenEditorInput = Omit<BillingGroupEditorProps, 'onSave' | 'onClose' | 'onReload'>;

function freezeInput({ scope, snapshot, events, projects, anchor }: BillingGroupEditorProps): FrozenEditorInput {
  return {
    scope: { ...scope },
    snapshot: {
      revision: snapshot.revision,
      groups: snapshot.groups.map((group) => ({ ...group, eventIds: [...group.eventIds] })),
    },
    events: events.map((event) => ({ ...event })),
    projects: projects.map((project) => ({ ...project })),
    anchor: { ...anchor },
  };
}

function eventKey(event: Event, scope: BillingScope): string | null {
  // A remote client-side draft is not a server record and must never reach billingEventKey.
  if (scope.source === 'supabase' && !event.supabaseId) return null;
  return billingEventKey(event, scope.source);
}

function projectKey(event: Event): string {
  return `${event.projectId ?? ''}|${event.job ?? ''}`;
}

function projectFor(event: Event, projects: readonly Project[]): Project | undefined {
  return event.projectId
    ? projects.find((project) => project.supabaseId === event.projectId)
    : projects.find((project) => project.id === event.job);
}

function eventLabel(event: Event, projects: readonly Project[]): string {
  const project = projectFor(event, projects);
  const dates = event.startDate === event.endDate ? event.startDate : `${event.startDate} – ${event.endDate}`;
  return `${event.name}, ${dates}, ${project?.name ?? 'Projekt bez názvu'}, ${event.job || 'Bez Job Number'}`;
}

function resultProjectLabel(event: Event, projects: readonly Project[]): string {
  const project = projectFor(event, projects);
  return `${project?.name ?? 'Projekt bez názvu'} · ${event.job || 'Bez Job Number'}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Uložení se nepodařilo ověřit.';
}

export default function BillingGroupEditor(props: BillingGroupEditorProps) {
  const [frozen] = useState(() => freezeInput(props));
  const [newGroupId] = useState(createStableDraftUuid);
  const anchorId = eventKey(frozen.anchor, frozen.scope);
  const anchorGroup = anchorId
    ? frozen.snapshot.groups.find((group) => group.eventIds.includes(anchorId))
    : undefined;
  const [draft, setDraft] = useState<BillingGroup>(() => anchorGroup
    ? { ...anchorGroup, eventIds: [...anchorGroup.eventIds] }
    : { id: newGroupId, name: frozen.anchor.name, eventIds: anchorId ? [anchorId] : [] });
  const [includeOtherProjects, setIncludeOtherProjects] = useState(false);
  const [confirmCrossProject, setConfirmCrossProject] = useState(false);
  const [confirmMoves, setConfirmMoves] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingCommand, setPendingCommand] = useState<SaveBillingGroup | null>(null);
  const [conflict, setConflict] = useState(false);
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);

  const manageable = canManageBillingGroups(frozen.scope.role);
  const locked = saving || Boolean(pendingCommand) || conflict;
  const availableEvents = frozen.events.flatMap((event) => {
    const id = eventKey(event, frozen.scope);
    return id ? [{ event, id }] : [];
  });
  const eventById = new Map(availableEvents.map(({ event, id }) => [id, event]));
  const selectedIds = new Set(draft.eventIds);
  const anchorProjectKey = projectKey(frozen.anchor);
  const candidates = availableEvents.filter(({ event, id }) => includeOtherProjects
    || selectedIds.has(id)
    || projectKey(event) === anchorProjectKey);
  const selectedEvents = draft.eventIds.flatMap((id) => {
    const event = eventById.get(id);
    return event ? [{ id, event }] : [];
  });
  const selectedProjectKeys = new Set(selectedEvents.map(({ event }) => projectKey(event)));
  const sourceGroupNames = [...new Set(
    frozen.snapshot.groups
      .filter((group) => group.id !== draft.id && group.eventIds.some((id) => selectedIds.has(id)))
      .map((group) => group.name),
  )];
  const canDelete = draft.eventIds.length === 0
    && frozen.snapshot.groups.some((group) => group.id === draft.id && group.eventIds.length === 0);

  const changeDraft = (next: BillingGroup) => {
    setDraft({ ...next, eventIds: [...new Set(next.eventIds)] });
    setConfirmCrossProject(false);
    setConfirmMoves(false);
    setSaveError(null);
    setPendingCommand(null);
    setConflict(false);
  };

  const selectGroup = (groupId: string) => {
    if (!anchorId) return;
    if (groupId === newGroupId) {
      changeDraft({ id: newGroupId, name: frozen.anchor.name, eventIds: [anchorId] });
      return;
    }
    const group = frozen.snapshot.groups.find((candidate) => candidate.id === groupId);
    if (group) {
      changeDraft({
        id: group.id,
        name: group.name,
        eventIds: [...new Set([anchorId, ...group.eventIds])],
      });
    }
  };

  const send = async (command: SaveBillingGroup) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      await props.onSave(command);
      props.onClose();
    } catch (error) {
      if (error instanceof BillingError && error.kind === 'ambiguous') {
        setPendingCommand(command);
        setSaveError(error.message);
      } else if (error instanceof BillingError && error.kind === 'conflict') {
        setPendingCommand(null);
        setConflict(true);
        setSaveError(error.message);
      } else {
        setPendingCommand(null);
        setSaveError(errorMessage(error));
      }
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  const save = (deleteGroup = false) => {
    if (locked || !manageable || !anchorId) return;
    let command: SaveBillingGroup;
    try {
      command = buildGroupCommand(
        frozen.scope,
        frozen.snapshot,
        draft,
        frozen.events,
        { cross: confirmCrossProject, moves: confirmMoves },
        createStableDraftUuid(),
        deleteGroup,
      );
    } catch (error) {
      setSaveError(errorMessage(error));
      return;
    }
    void send(command);
  };

  const retry = () => {
    if (pendingCommand && !saving) void send(pendingCommand);
  };

  const handleOpenChange = (open: boolean) => {
    if (!open && !saving) props.onClose();
  };

  if (!manageable) return null;

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-h-[90dvh] w-[calc(100%_-_2rem)] min-w-0 overflow-y-auto sm:max-w-2xl"
        data-mobile-event-swipe-ignore="true"
      >
        <DialogHeader className="min-w-0 pr-10">
          <DialogTitle>Společná fakturace</DialogTitle>
          <DialogDescription className="break-words">
            Propojení připraví společnou fakturaci. Akce, projekty a jejich výkazy zůstanou samostatné.
          </DialogDescription>
        </DialogHeader>

        {!anchorId ? (
          <div role="alert" className="break-words text-sm text-[color:#b94d2f]">
            Akci chybí serverová identita. Obnovte data.
          </div>
        ) : (
          <div className="grid min-w-0 gap-5">
            <div className="grid gap-2">
              <label htmlFor="billing-group-select" className="text-sm font-medium">Fakturační skupina</label>
              <select
                id="billing-group-select"
                value={draft.id}
                disabled={locked}
                onChange={(event) => selectGroup(event.target.value)}
                className="min-w-0 rounded-xl border border-[color:var(--nodu-border)] bg-transparent px-3 py-2"
              >
                <option value={newGroupId}>Nová skupina</option>
                {frozen.snapshot.groups.map((group) => (
                  <option key={group.id} value={group.id}>{group.name}</option>
                ))}
              </select>
            </div>

            <div className="grid gap-2">
              <label htmlFor="billing-group-name" className="text-sm font-medium">Název skupiny</label>
              <input
                id="billing-group-name"
                value={draft.name}
                maxLength={120}
                disabled={locked}
                onChange={(event) => changeDraft({ ...draft, name: event.target.value })}
                className="min-w-0 rounded-xl border border-[color:var(--nodu-border)] bg-transparent px-3 py-2"
              />
            </div>

            <label className="flex min-w-0 items-center gap-2 text-sm">
              <Checkbox
                checked={includeOtherProjects}
                disabled={locked}
                onCheckedChange={(checked) => setIncludeOtherProjects(checked === true)}
              />
              Zahrnout jiné projekty
            </label>

            <fieldset disabled={locked} className="grid min-w-0 max-h-64 gap-2 overflow-y-auto">
              <legend className="text-sm font-medium">Akce ve skupině</legend>
              {candidates.map(({ event, id }) => (
                <label key={id} className="flex min-w-0 items-start gap-2 break-words text-sm">
                  <Checkbox
                    checked={selectedIds.has(id)}
                    disabled={locked}
                    onCheckedChange={(checked) => {
                      const eventIds = checked
                        ? [...draft.eventIds, id]
                        : draft.eventIds.filter((eventId) => eventId !== id);
                      changeDraft({ ...draft, eventIds });
                    }}
                  />
                  <span className="min-w-0 break-words">{eventLabel(event, frozen.projects)}</span>
                </label>
              ))}
            </fieldset>

            <section aria-label="Výsledný rozpis" className="grid min-w-0 gap-2 rounded-xl border border-[color:var(--nodu-border)] p-3">
              <h2 className="text-base font-semibold">Výsledný rozpis podle projektů</h2>
              {selectedEvents.length === 0 ? (
                <p className="text-sm text-[color:var(--nodu-text-soft)]">Skupina bude prázdná. Žádná akce se nesmaže.</p>
              ) : [...selectedProjectKeys].map((key) => {
                const projectEvents = selectedEvents.filter(({ event }) => projectKey(event) === key);
                return (
                  <div key={key} className="min-w-0 break-words text-sm">
                    <h3 className="font-medium">{resultProjectLabel(projectEvents[0].event, frozen.projects)}</h3>
                    <ul className="list-disc pl-5">
                      {projectEvents.map(({ id, event }) => <li key={id}>{event.name} · {event.startDate === event.endDate ? event.startDate : `${event.startDate} – ${event.endDate}`}</li>)}
                    </ul>
                  </div>
                );
              })}
            </section>

            {selectedProjectKeys.size > 1 && (
              <label className="flex min-w-0 items-center gap-2 text-sm">
                <Checkbox checked={confirmCrossProject} disabled={locked} onCheckedChange={(checked) => setConfirmCrossProject(checked === true)} />
                Potvrzuji společnou fakturaci přes více projektů
              </label>
            )}
            {sourceGroupNames.length > 0 && (
              <div className="grid gap-2 text-sm">
                <p className="break-words">Přesun ze skupin: {sourceGroupNames.join(', ')}</p>
                <label className="flex min-w-0 items-center gap-2">
                  <Checkbox checked={confirmMoves} disabled={locked} onCheckedChange={(checked) => setConfirmMoves(checked === true)} />
                  Potvrzuji přesun z jiné skupiny
                </label>
              </div>
            )}
            {saveError && <p role="alert" className="break-words text-sm text-[color:#b94d2f]">{saveError}</p>}
            {pendingCommand && (
              <p className="break-words text-sm text-[color:var(--nodu-text-soft)]">
                Zavření okna uloženou změnu nevrátí zpět; stav ověřte obnovením.
              </p>
            )}
            {conflict && (
              <Button type="button" variant="outline" onClick={props.onReload}>
                Zahodit výběr a načíst aktuální data
              </Button>
            )}
          </div>
        )}

        <DialogFooter className="flex-wrap">
          <Button type="button" variant="outline" disabled={saving} onClick={props.onClose}>Zavřít</Button>
          {pendingCommand ? (
            <Button type="button" disabled={saving} onClick={retry}>Zopakovat stejný požadavek</Button>
          ) : anchorId && !conflict && (
            <Button type="button" disabled={locked} onClick={() => save(false)}>Uložit propojení</Button>
          )}
          {anchorId && canDelete && !pendingCommand && !conflict && (
            <Button type="button" variant="destructive" disabled={locked} onClick={() => save(true)}>Smazat prázdnou skupinu</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
