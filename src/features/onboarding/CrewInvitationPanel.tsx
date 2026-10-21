import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../app/providers/useAuth';
import { Button } from '../../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../../components/ui/dialog';
import { createCrewInvitation, CrewInvitationError, getCrewInvitationStatus, isCrewInvitationsEnabled, isSavedProfileId, isTestInvitationEmail, normalizeInvitationEmail, type CrewInvitationErrorCode, type CrewInvitationStatus } from './services/invitations.service';

type Props = { profileId: string | null; name: string; email: string };
const disabledCopy = 'Pozvánky jsou zatím dostupné pouze v testovacím prostředí.';
const errors: Partial<Record<CrewInvitationErrorCode, string>> = {
  disabled: disabledCopy,
  unauthorized: 'Přihlas se znovu skutečným účtem v testovacím prostředí.',
  forbidden: 'Tento účet nemá oprávnění vytvářet testovací pozvánky.',
  profile_unavailable: 'Uložený profil není dostupný. Vyber člena znovu.',
  missing_email: 'Doplň e-mail a ulož profil člena.',
  test_only: 'Použij pouze testovací adresu na doméně crewflow-onboarding.test.',
  already_active: 'Účet je aktivní.',
  activation_in_progress: 'Aktivace účtu právě probíhá.',
  invitation_changed: 'Pozvánka se změnila. Obnov stav a znovu potvrď vytvoření pozvánky.',
  invitation_in_progress: 'Příprava pozvánky právě probíhá. Obnov stav před dalším pokusem.',
  delivery_unavailable: 'Testovací schránka není dostupná. Obnov stav před dalším pokusem.',
};

export default function CrewInvitationPanel({ profileId, name, email: rawEmail }: Props) {
  const auth = useAuth();
  const email = normalizeInvitationEmail(rawEmail);
  const authId = auth.currentUserId;
  const genuineSession = auth.isAuthenticated && auth.isDevSession === false && !auth.isLoading && !auth.isRoleSwitching
    && auth.role === 'coo' && isSavedProfileId(authId) && auth.user?.id === authId && !auth.user.is_anonymous
    && auth.session?.user.id === authId && !auth.session.user.is_anonymous && Boolean(auth.session.access_token);
  const reason = !isCrewInvitationsEnabled() ? disabledCopy
    : !isSavedProfileId(profileId) ? 'Nejprve vytvoř a ulož člena; pozvánka vyžaduje uložený profil.'
      : !email ? 'Doplň e-mail a ulož profil člena.'
        : !isTestInvitationEmail(email) ? 'Použij pouze testovací adresu na doméně crewflow-onboarding.test.'
          : !genuineSession ? auth.isRoleSwitching ? 'Počkej na dokončení změny role.' : 'Pozvánka vyžaduje skutečné přihlášení v testovacím prostředí.' : null;
  // Remounting drops confirmations and in-flight results across profile, email or Auth changes.
  const boundary = [profileId, email, authId, auth.user?.id, auth.session?.user.id, reason].join('|');
  return <InvitationControls key={boundary} profileId={profileId ?? ''} name={name} email={email} authId={authId ?? ''} reason={reason} />;
}

function InvitationControls({ profileId, name, email, authId, reason }: { profileId: string; name: string; email: string; authId: string; reason: string | null }) {
  const [status, setStatus] = useState<CrewInvitationStatus | null>(null);
  const [loading, setLoading] = useState(!reason);
  const [submitting, setSubmitting] = useState(false);
  const [open, setOpen] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const alive = useRef(true);
  const submittingRef = useRef(false);
  const refreshButtonRef = useRef<HTMLButtonElement>(null);
  const matchesSelection = (value: CrewInvitationStatus) => value.profileId === profileId && value.email === email;

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  useEffect(() => {
    if (reason) return;
    let current = true;
    setLoading(true); setError(null); setStatus(null); setSuccess(false);
    void getCrewInvitationStatus(profileId, email, authId).then((value) => {
      if (!current) return;
      if (value.profileId !== profileId || value.email !== email) throw new CrewInvitationError('invitation_unavailable');
      setStatus(value);
    }).catch((failure: unknown) => {
      if (current) setError(failure instanceof CrewInvitationError ? errors[failure.code] ?? 'Stav pozvánky se nepodařilo načíst. Obnov stav a zkus to znovu.' : 'Stav pozvánky se nepodařilo načíst. Obnov stav a zkus to znovu.');
    }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [profileId, email, authId, reason, refresh]);

  const locked = status?.state === 'active' || status?.state === 'activation_in_progress';
  const replacement = Boolean(status && (status.invitationId !== null || status.state !== 'not_invited'));
  const submit = async () => {
    if (!alive.current || submittingRef.current || reason || !status || loading || locked || !open) return;
    submittingRef.current = true;
    setSubmitting(true); setError(null); setSuccess(false);
    try {
      const value = await createCrewInvitation({ profileId, expectedEmail: email, expectedInvitationId: status.invitationId, replaceExisting: replacement, authId });
      if (!alive.current) return;
      if (!matchesSelection(value)) throw new CrewInvitationError('invitation_unavailable');
      setStatus(value); setOpen(false); setSuccess(value.state === 'pending');
    } catch (failure) {
      if (!alive.current) return;
      setOpen(false); setStatus(null);
      setError(failure instanceof CrewInvitationError ? errors[failure.code] ?? 'Pozvánku se nepodařilo vytvořit. Obnov stav před dalším pokusem.' : 'Pozvánku se nepodařilo vytvořit. Obnov stav před dalším pokusem.');
    } finally {
      submittingRef.current = false;
      if (alive.current) setSubmitting(false);
    }
  };

  return <section aria-label="Pozvánka do aplikace" className="mt-4 min-w-0 rounded-[24px] border border-[var(--nodu-border)] bg-white p-4 sm:p-5">
    <h2 className="text-sm font-semibold text-[var(--nodu-text)]">Přístup do aplikace</h2>
    {reason && <p className="mt-2 break-words text-sm text-[var(--nodu-text-soft)]">{reason}</p>}
    {!reason && loading && <p className="mt-2 text-sm text-[var(--nodu-text-soft)]">Načítám stav pozvánky…</p>}
    {status?.state === 'active' && <p className="mt-2 text-sm">Účet je aktivní.</p>}
    {status?.state === 'activation_in_progress' && <p className="mt-2 text-sm">Aktivace účtu právě probíhá.</p>}
    {status?.state === 'preparing' && <p className="mt-2 text-sm">Předchozí příprava pozvánky není dokončená.</p>}
    {status?.state === 'expired' && <p className="mt-2 text-sm">Platnost pozvánky vypršela.</p>}
    {status?.state === 'pending' && <p className="mt-2 break-words text-sm">Pozvánka čeká na aktivaci.{status.expiresAt ? ` Platnost do ${new Date(status.expiresAt).toLocaleString('cs-CZ')}.` : ''}</p>}
    {success && <p role="status" className="mt-2 break-words text-sm">Pozvánka byla zachycena v lokální testovací schránce.</p>}
    {error && <p role="alert" className="mt-2 break-words text-sm text-[var(--nodu-error-text)]">{error}</p>}
    <Dialog open={open} onOpenChange={(value) => { if (!submittingRef.current) setOpen(value); }}>
      <div className="mt-3 flex flex-wrap gap-2">
        <DialogTrigger asChild><Button type="button" className="min-h-11 h-auto whitespace-normal" disabled={Boolean(reason) || loading || submitting || !status || locked}>{replacement && !locked ? 'Vytvořit novou pozvánku' : 'Pozvat do aplikace'}</Button></DialogTrigger>
        {error && !reason && <Button ref={refreshButtonRef} type="button" variant="outline" className="min-h-11 h-auto whitespace-normal" disabled={loading || submitting} onClick={() => { setOpen(false); setRefresh((value) => value + 1); }}>Obnovit stav pozvánky</Button>}
      </div>
      <DialogContent className="w-[calc(100%-2rem)] max-h-[90dvh] overflow-y-auto [&>button]:min-h-11 [&>button]:min-w-11" onCloseAutoFocus={(event) => {
        const recovery = refreshButtonRef.current;
        if (recovery && !recovery.disabled) { event.preventDefault(); recovery.focus(); }
      }}>
        <DialogHeader><DialogTitle>{replacement ? 'Vytvořit novou pozvánku' : 'Pozvat do aplikace'}</DialogTitle>
          <DialogDescription>Odkaz bude platit 48 hodin. Pozvánka bude zachycena pouze v lokální testovací schránce.</DialogDescription></DialogHeader>
        <div className="min-w-0 space-y-2 text-sm"><p className="break-words font-semibold">{name}</p><p className="break-all">{email}</p>
          {replacement && <p>Předchozí odkaz přestane platit. Vytvoření nové pozvánky potvrď znovu.</p>}</div>
        <DialogFooter><Button type="button" variant="outline" className="min-h-11" disabled={submitting} onClick={() => setOpen(false)}>Zrušit</Button>
          <Button type="button" className="min-h-11 h-auto whitespace-normal" disabled={submitting} onClick={() => { void submit(); }}>{submitting ? 'Vytvářím…' : 'Vytvořit testovací pozvánku'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </section>;
}
