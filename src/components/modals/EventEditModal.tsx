import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { ChevronDown, X } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import type { Event, EventContactOption } from '../../types';
import { applyEventDraft, getEventById, getEventContactOptions, getEventFormOptions, normalizeEventSchedules, saveEvent } from '../../features/events/services/events.service';
import { createEventFormPlan, getEventFormDates, serializeEventFormPlan, validateEventForm, type EventFormPlan } from '../../features/events/services/event-form-state';
import EventAddressField from '../../features/events/components/EventAddressField';
import EventDayPlanner from '../../features/events/components/EventDayPlanner';
import EventLocationPickerModal from '../../features/events/components/EventLocationPickerModal';
import EventMapPreview from '../../features/events/components/EventMapPreview';
import '../../features/events/components/event-edit-form.css';

interface EventEditModalProps {
  editingEvent: Event | null;
  onClose: () => void;
  onChange: (event: Event | null) => void;
  mode?: 'create' | 'edit';
}

interface DraftCache {
  identity: string | null;
  plan: EventFormPlan;
  multipleDays: boolean;
  cachedEndDate: string;
  dirty: boolean;
  advancedOpen: boolean;
}

const createDraftCache = (event: Event | null, identity: string | null): DraftCache => {
  const schedules: NonNullable<Event['phaseSchedules']> = event ? { ...normalizeEventSchedules(event) } : {};
  if (event && event.scheduleVersion !== 2) {
    const materializedDates = new Set(Object.values(schedules).flatMap((slots) => slots.flatMap((slot) => slot.dates)));
    const preparationDates = Object.keys(event.dayTypes ?? {}).filter((date) => event.dayTypes?.[date] === 'pripravy' && !materializedDates.has(date));
    if (preparationDates.length) schedules.pripravy = [...(schedules.pripravy ?? []), {
      id: crypto.randomUUID(), dates: preparationDates,
      from: event.phaseTimes?.pripravy?.from ?? event.startTime ?? '',
      to: event.phaseTimes?.pripravy?.to ?? event.endTime ?? '',
    }];
  }
  return { identity, plan: event ? createEventFormPlan({ ...event, phaseSchedules: schedules }) : {},
    multipleDays: Boolean(event?.endDate && event.endDate !== event.startDate), cachedEndDate: event?.endDate ?? '', dirty: false, advancedOpen: Boolean(event?.showDayTypes) };
};

const restoreFocus = (preferred: HTMLElement | null, fallback: HTMLElement | null) => {
  const target = preferred?.isConnected && !preferred.matches(':disabled') ? preferred : fallback;
  if (!target?.isConnected || target === document.body) return;
  if (!target.matches('button, a[href], input, select, textarea, [tabindex]')) target.tabIndex = -1;
  target.focus({ preventScroll: true });
};

const EventEditModal = ({ editingEvent, onClose, onChange, mode }: EventEditModalProps) => {
  const draftIdentity = editingEvent ? editingEvent.supabaseId ?? `local:${editingEvent.id}` : null;
  const [cacheState, setCache] = useState(() => createDraftCache(editingEvent, draftIdentity));
  // A suspended render must not replace the committed draft cache or request identity.
  const cache = cacheState.identity === draftIdentity ? cacheState : createDraftCache(editingEvent, draftIdentity);
  const [isProjectMenuOpen, setIsProjectMenuOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isAddressResolving, setIsAddressResolving] = useState(false);
  const [isLocationPickerOpen, setIsLocationPickerOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<'discard' | 'trim' | null>(null);
  const [error, setError] = useState('');
  const [contacts, setContacts] = useState<EventContactOption[]>([]);
  const [contactsLoading, setContactsLoading] = useState(true);
  const [contactsError, setContactsError] = useState('');
  const [contactsRetry, setContactsRetry] = useState(0);
  const projectMenuRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const focusScopeMarkerRef = useRef<HTMLSpanElement | null>(null);
  const formOpenerRef = useRef<HTMLElement | null>(null);
  const formFallbackRef = useRef<HTMLElement | null>(null);
  const mapButtonRef = useRef<HTMLButtonElement | null>(null);
  const mapPickerOpenerRef = useRef<HTMLButtonElement | null>(null);
  const saveButtonRef = useRef<HTMLButtonElement | null>(null);
  const confirmationOpenerRef = useRef<HTMLElement | null>(null);
  const saveInFlightRef = useRef(false);
  const activeSaveRequestRef = useRef<symbol | null>(null);
  const mountedRef = useRef(false);
  const currentDraftIdentityRef = useRef<string | null>(draftIdentity);
  const portalContainer = document.querySelector<HTMLElement>('.nodu-app-shell') ?? undefined;
  const { projects, clients } = useMemo(() => getEventFormOptions(), []);
  const clientOptions = useMemo(() => editingEvent?.client && !clients.some((client) => client.name === editingEvent.client)
    ? [...clients, { id: -1, name: editingEvent.client }] : clients, [clients, editingEvent?.client]);
  const filteredProjects = useMemo(() => {
    const query = editingEvent?.job.trim().toLowerCase() ?? '';
    return query ? projects.filter((project) => `${project.id} ${project.name} ${project.client}`.toLowerCase().includes(query)) : projects;
  }, [editingEvent?.job, projects]);

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  useLayoutEffect(() => { if (cacheState !== cache) setCache(cache); }, [cache, cacheState]);
  useLayoutEffect(() => {
    currentDraftIdentityRef.current = draftIdentity;
    activeSaveRequestRef.current = null;
    saveInFlightRef.current = false;
    setIsSaving(false); setIsAddressResolving(false); setIsLocationPickerOpen(false);
    setIsProjectMenuOpen(false); setConfirmation(null); setError('');
  }, [draftIdentity]);
  useEffect(() => {
    if (!draftIdentity) return;
    let active = true;
    setContactsLoading(true); setContactsError(''); setContacts([]);
    void getEventContactOptions().then((options) => { if (active) setContacts(options); })
      .catch((cause) => { if (active) setContactsError(cause instanceof Error ? cause.message : 'Kontakty se nepodařilo načíst.'); })
      .finally(() => { if (active) setContactsLoading(false); });
    return () => { active = false; };
  }, [draftIdentity, contactsRetry]);
  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => { if (!projectMenuRef.current?.contains(event.target as Node)) setIsProjectMenuOpen(false); };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  if (!editingEvent) return null;
  const isEdit = mode ? mode === 'edit' : Boolean(getEventById(editingEvent.supabaseId ?? editingEvent.id));
  const dates = getEventFormDates(editingEvent.startDate, editingEvent.endDate);
  const activeDates = new Set(dates);
  const trimmedDates = Object.keys(cache.plan).filter((date) => !activeDates.has(date) && (cache.plan[date].free || cache.plan[date].phases.length)).sort();
  const contactApprovesHours = editingEvent.contactApprovesHours ?? true;
  const intendedApproverId = contactApprovesHours ? editingEvent.contactProfileId : editingEvent.timelogApproverProfileId;
  const approvalUnavailable = !contactsLoading && !contactsError && !contacts.find((contact) => contact.profileId === intendedApproverId)?.canApproveHours;
  const hasMapCoordinates = typeof editingEvent.locationLat === 'number' && Number.isFinite(editingEvent.locationLat)
    && Math.abs(editingEvent.locationLat) <= 90 && typeof editingEvent.locationLng === 'number'
    && Number.isFinite(editingEvent.locationLng) && Math.abs(editingEvent.locationLng) <= 180;
  const patchEvent = (patch: Partial<Event>) => {
    if (saveInFlightRef.current) return;
    setCache((current) => ({ ...current, dirty: true })); setError('');
    onChange(applyEventDraft({ ...editingEvent, ...patch }));
  };
  const requestClose = (opener?: HTMLElement) => {
    if (saveInFlightRef.current) return;
    if (cache.dirty) {
      confirmationOpenerRef.current = opener ?? titleRef.current;
      setConfirmation('discard');
    } else onClose();
  };
  const selectProject = (projectId: string) => {
    const project = projects.find((item) => item.id === projectId);
    if (!project) return;
    patchEvent({ job: project.id, name: editingEvent.name.trim() ? editingEvent.name : project.name, client: project.client || editingEvent.client });
    setIsProjectMenuOpen(false);
  };
  const openLocationPicker = (opener: HTMLButtonElement | null) => {
    if (saveInFlightRef.current) return;
    mapPickerOpenerRef.current = opener;
    setIsLocationPickerOpen(true);
  };
  const handleSave = async (confirmedTrim = false) => {
    if (saveInFlightRef.current || isAddressResolving) return;
    const nextEvent = { ...editingEvent, scheduleVersion: 2 as const, contactApprovesHours, ...serializeEventFormPlan(editingEvent, cache.plan) };
    try { validateEventForm(nextEvent, cache.plan); } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Zkontrolujte údaje akce.'); return;
    }
    if (!confirmedTrim && trimmedDates.length) {
      confirmationOpenerRef.current = saveButtonRef.current;
      setConfirmation('trim');
      return;
    }
    setConfirmation(null);
    const requestIdentity = draftIdentity;
    const requestToken = Symbol('event-save-request');
    saveInFlightRef.current = true; activeSaveRequestRef.current = requestToken; setIsSaving(true); setError('');
    const isCurrentRequest = () => mountedRef.current && currentDraftIdentityRef.current === requestIdentity && activeSaveRequestRef.current === requestToken;
    try {
      await saveEvent(nextEvent);
      if (isCurrentRequest()) onClose();
    } catch (cause) {
      if (isCurrentRequest()) { const message = cause instanceof Error ? cause.message : 'Nepodařilo se uložit akci.'; setError(message); toast.error(message); }
    } finally {
      if (isCurrentRequest()) { activeSaveRequestRef.current = null; saveInFlightRef.current = false; setIsSaving(false); }
    }
  };

  return <><span ref={focusScopeMarkerRef} hidden /><Dialog.Root open onOpenChange={(open) => { if (!open) requestClose(); }}>
    <Dialog.Portal container={portalContainer}>
      <Dialog.Overlay className="event-form-overlay" />
      <Dialog.Content className="event-form-dialog" aria-describedby={undefined}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          const activeElement = document.activeElement;
          formOpenerRef.current = activeElement instanceof HTMLElement && activeElement !== document.body ? activeElement : null;
          formFallbackRef.current = focusScopeMarkerRef.current?.parentElement?.querySelector<HTMLElement>('h1, h2') ?? null;
          titleRef.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          // A replacement draft owns focus if it opened before this dialog finished closing.
          if (!document.querySelector('.event-form-dialog')) restoreFocus(formOpenerRef.current, formFallbackRef.current);
        }}
        onEscapeKeyDown={(event) => { event.preventDefault(); requestClose(); }}
        onInteractOutside={(event) => event.preventDefault()}>
        <header className="event-form-header">
          <Dialog.Title ref={titleRef} tabIndex={-1}>{isEdit ? 'Upravit akci' : 'Nová akce'}</Dialog.Title>
          <button type="button" disabled={isSaving} className="event-form-icon-button" aria-label="Zavřít formulář" onClick={(event) => requestClose(event.currentTarget)}><X size={22} /></button>
        </header>
        <form className="event-form-layout" onSubmit={(event) => { event.preventDefault(); void handleSave(); }} noValidate>
          <fieldset disabled={isSaving} aria-busy={isSaving} className="event-form-body">
            <section className="event-form-section" aria-label="Základní údaje">
              <label className="event-form-label">Název akce<input required value={editingEvent.name} onChange={(e) => patchEvent({ name: e.target.value })} /></label>
              <div className="event-form-grid">
                <div ref={projectMenuRef} className="event-form-project">
                  <label className="event-form-label" htmlFor="event-job">Job Number</label>
                  <div className="event-form-inline">
                    <input id="event-job" required value={editingEvent.job} placeholder="Např. NEX300" onChange={(e) => { patchEvent({ job: e.target.value.toUpperCase() }); setIsProjectMenuOpen(true); }} onFocus={() => setIsProjectMenuOpen(true)} />
                    <button type="button" className="event-form-icon-button" aria-label="Rozbalit projekty" aria-expanded={isProjectMenuOpen} onClick={() => setIsProjectMenuOpen(!isProjectMenuOpen)}><ChevronDown size={20} /></button>
                  </div>
                  {isProjectMenuOpen && <div className="event-form-project-options">
                    {filteredProjects.length ? filteredProjects.map((project) => <button key={project.id} type="button" onClick={() => selectProject(project.id)}><strong>{project.id}</strong><span>{project.name} · {project.client}</span></button>) : <p>Akce vytvoří nový projekt automaticky.</p>}
                  </div>}
                </div>
                <label className="event-form-label">Klient / Firma<select required value={editingEvent.client} onChange={(e) => patchEvent({ client: e.target.value })}>
                  <option value="">Vyberte klienta</option>{clientOptions.map((client) => <option key={client.id} value={client.name}>{client.name}</option>)}
                </select></label>
              </div>
            </section>
            <section className="event-form-section" aria-labelledby="event-term-title">
              <div className="event-form-section-heading"><h3 id="event-term-title">Termín akce</h3>
                <label className="event-form-toggle"><input type="checkbox" checked={cache.multipleDays} onChange={(e) => {
                  const multipleDays = e.target.checked;
                  setCache({ ...cache, dirty: true, multipleDays, cachedEndDate: multipleDays ? cache.cachedEndDate : editingEvent.endDate });
                  patchEvent({ endDate: multipleDays ? cache.cachedEndDate || editingEvent.startDate : editingEvent.startDate });
                }} />Více dní</label>
              </div>
              {cache.multipleDays ? <div className="event-form-grid">
                <div className="event-form-term"><h4>Začátek akce</h4>
                  <label className="event-form-label">Datum začátku<input required type="date" value={editingEvent.startDate} onChange={(e) => patchEvent({ startDate: e.target.value })} /></label>
                  <label className="event-form-label">Začátek<input required type="time" value={editingEvent.startTime ?? ''} onChange={(e) => patchEvent({ startTime: e.target.value })} /></label>
                </div>
                <div className="event-form-term"><h4>Konec akce</h4>
                  <label className="event-form-label">Datum konce<input required type="date" value={editingEvent.endDate} onChange={(e) => { setCache({ ...cache, cachedEndDate: e.target.value }); patchEvent({ endDate: e.target.value }); }} /></label>
                  <label className="event-form-label">Konec<input required type="time" value={editingEvent.endTime ?? ''} onChange={(e) => patchEvent({ endTime: e.target.value })} /></label>
                </div>
              </div> : <>
                <label className="event-form-label">Datum akce<input required type="date" value={editingEvent.startDate} onChange={(e) => patchEvent({ startDate: e.target.value, endDate: e.target.value })} /></label>
                <div className="event-form-grid event-form-clocks">
                  <label className="event-form-label">Začátek<input required type="time" value={editingEvent.startTime ?? ''} onChange={(e) => patchEvent({ startTime: e.target.value })} /></label>
                  <label className="event-form-label">Konec<input required type="time" value={editingEvent.endTime ?? ''} onChange={(e) => patchEvent({ endTime: e.target.value })} /></label>
                </div>
              </>}
            </section>
            <section className="event-form-section" aria-label="Místo akce">
              <EventAddressField key={draftIdentity} value={editingEvent} mapButtonRef={mapButtonRef} onResolvingChange={setIsAddressResolving} onPickMap={() => openLocationPicker(mapButtonRef.current)} onChange={(selection) => patchEvent({ ...selection, city: selection.address })} />
              {hasMapCoordinates && <EventMapPreview address={editingEvent.address || editingEvent.city} locationLat={editingEvent.locationLat} locationLng={editingEvent.locationLng} onEdit={openLocationPicker} />}
            </section>
            <section className="event-form-section" aria-labelledby="event-contact-title">
              <h3 id="event-contact-title">Kontakt na akci</h3>
              {contactsLoading && <p role="status" className="event-form-hint">Načítám kontakty…</p>}
              {contactsError && <div role="alert" className="event-form-error">{contactsError} <button type="button" className="event-form-text-button" onClick={() => setContactsRetry((retry) => retry + 1)}>Zkusit znovu</button></div>}
              <label className="event-form-label">Vybrat kontakt<select value={editingEvent.contactProfileId ?? ''} disabled={contactsLoading} onChange={(e) => {
                const contact = contacts.find((item) => item.profileId === e.target.value);
                patchEvent(contact ? { contactProfileId: contact.profileId, contactPerson: contact.name, contactPhone: contact.phone } : { contactProfileId: null });
              }}>
                <option value="">Zadat kontakt ručně</option>
                {editingEvent.contactProfileId && !contacts.some((item) => item.profileId === editingEvent.contactProfileId) && <option value={editingEvent.contactProfileId}>{editingEvent.contactPerson || 'Uložený kontakt'}</option>}
                {contacts.map((contact) => <option key={contact.profileId} value={contact.profileId}>{contact.name}</option>)}
              </select></label>
              <div className="event-form-grid">
                <label className="event-form-label">Kontaktní osoba<input required value={editingEvent.contactPerson ?? ''} autoComplete="name" onChange={(e) => patchEvent({ contactPerson: e.target.value, contactProfileId: null })} /></label>
                <label className="event-form-label">Telefon<input type="tel" value={editingEvent.contactPhone ?? ''} autoComplete="tel" onChange={(e) => patchEvent({ contactPhone: e.target.value })} /></label>
              </div>
              <label className="event-form-toggle"><input type="checkbox" checked={contactApprovesHours} onChange={(e) => patchEvent({ contactApprovesHours: e.target.checked })} />Schvaluje také hodiny</label>
              {!contactApprovesHours && <label className="event-form-label">Schvalovatel hodin<select disabled={contactsLoading} value={editingEvent.timelogApproverProfileId ?? ''} onChange={(e) => patchEvent({ timelogApproverProfileId: e.target.value || null })}>
                <option value="">Vyberte schvalovatele</option>
                {editingEvent.timelogApproverProfileId && !contacts.some((item) => item.profileId === editingEvent.timelogApproverProfileId) && <option value={editingEvent.timelogApproverProfileId}>Uložený schvalovatel</option>}
                {contacts.map((contact) => <option key={contact.profileId} value={contact.profileId}>{contact.name}</option>)}
              </select></label>}
              {approvalUnavailable && <p className="event-form-hint">Schvalování bude dostupné po připojení účtu COO.</p>}
            </section>
            <section className="event-form-section" aria-label="Další údaje">
              <label className="event-form-label">Potřebný počet Crew<input required type="number" min="0" step="1" value={Number.isNaN(editingEvent.needed) ? '' : editingEvent.needed} onChange={(e) => patchEvent({ needed: e.target.value === '' ? NaN : Number(e.target.value) })} /></label>
              <label className="event-form-label">Popis akce<textarea rows={3} value={editingEvent.description ?? ''} onChange={(e) => patchEvent({ description: e.target.value })} /></label>
              <label className="event-form-label">Místo srazu<input value={editingEvent.meetingLocation ?? ''} onChange={(e) => patchEvent({ meetingLocation: e.target.value })} /></label>
            </section>
            <details className="event-form-advanced" open={cache.advancedOpen} onToggle={(e) => {
              const advancedOpen = e.currentTarget.open;
              setCache((current) => current.advancedOpen === advancedOpen ? current : { ...current, advancedOpen });
            }}>
              <summary>Pokročilé nastavení</summary><div className="event-form-section">
                <label className="event-form-toggle"><input type="checkbox" checked={Boolean(editingEvent.showDayTypes)} onChange={(e) => patchEvent({ showDayTypes: e.target.checked })} />Rozdělit akci na fáze</label>
                {editingEvent.showDayTypes && <EventDayPlanner dates={dates} plan={cache.plan} onChange={(plan) => setCache({ ...cache, plan, dirty: true })} />}
                <label className="event-form-toggle"><input id="allowCrewTimeProposal" type="checkbox" checked={Boolean(editingEvent.allowCrewTimeProposal)} onChange={(e) => patchEvent({ allowCrewTimeProposal: e.target.checked })} />Povolit Crew navrhnout čas příchodu a odchodu</label>
              </div>
            </details>
          </fieldset>
          <footer className="event-form-footer">
            {error && <p role="alert" className="event-form-error">{error}</p>}
            <div className="event-form-footer-actions">
              <button type="button" className="event-form-secondary" disabled={isSaving} onClick={(event) => requestClose(event.currentTarget)}>Zrušit</button>
              <button ref={saveButtonRef} type="submit" className="event-form-primary" disabled={isSaving || isAddressResolving}>{isSaving ? 'Ukládám…' : isEdit ? 'Uložit akci' : 'Vytvořit akci'}</button>
            </div>
          </footer>
        </form>
        {isLocationPickerOpen && <EventLocationPickerModal address={editingEvent.address || editingEvent.city} initialLocationLat={editingEvent.locationLat} initialLocationLng={editingEvent.locationLng} onCancel={() => setIsLocationPickerOpen(false)} onConfirm={(coordinates) => { patchEvent(coordinates); setIsLocationPickerOpen(false); }} onCloseAutoFocus={() => restoreFocus(mapPickerOpenerRef.current, mapButtonRef.current ?? titleRef.current)} />}
        <AlertDialog.Root open={confirmation !== null} onOpenChange={(open) => { if (!open) setConfirmation(null); }}>
          <AlertDialog.Portal container={portalContainer}>
            <AlertDialog.Overlay className="event-form-confirm-overlay" />
            <AlertDialog.Content className="event-form-confirm" onCloseAutoFocus={(event) => {
              event.preventDefault();
              restoreFocus(confirmationOpenerRef.current, titleRef.current);
            }}>
              <AlertDialog.Title>{confirmation === 'discard' ? 'Zahodit změny?' : 'Uložit zkrácený termín?'}</AlertDialog.Title>
              <AlertDialog.Description>{confirmation === 'discard' ? 'Rozpracované změny se neuloží.' : `Plán pro tyto dny se odstraní: ${trimmedDates.map((date) => format(parseISO(date), 'd. M. yyyy')).join(', ')}.`}</AlertDialog.Description>
              <div className="event-form-confirm-actions">
                <AlertDialog.Cancel className="event-form-secondary">Pokračovat v úpravách</AlertDialog.Cancel>
                <AlertDialog.Action className="event-form-primary" onClick={() => { if (confirmation === 'discard') onClose(); else void handleSave(true); }}>{confirmation === 'discard' ? 'Zahodit změny' : 'Uložit bez těchto dnů'}</AlertDialog.Action>
              </div>
            </AlertDialog.Content>
          </AlertDialog.Portal>
        </AlertDialog.Root>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root></>;
};

export default EventEditModal;
