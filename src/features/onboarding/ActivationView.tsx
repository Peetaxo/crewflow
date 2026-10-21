import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/providers/useAuth';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import noduLogo from '../../assets/nodu-logo.svg';
import { isActivationToken, useActivationLink } from './activation-link';
import {
  ActivationError,
  completeActivation,
  isOnboardingEnabled,
  isValidActivationPassword,
  previewActivation,
  type ActivationErrorCode,
  type InvitationPreview,
} from './services/activation.service';

const messages: Record<ActivationErrorCode, string> = {
  disabled: 'Aktivace účtu zatím není zapnutá. Obrať se na člověka, který tě pozval.',
  invalid_invitation: 'Aktivační odkaz je neplatný nebo neúplný. Otevři původní odkaz z e-mailu nebo požádej o novou pozvánku.',
  expired_invitation: 'Platnost pozvánky vypršela. Požádej člověka, který tě pozval, o nový odkaz.',
  already_active: 'Účet je již aktivní. Přihlas se stejným e-mailem a zvoleným heslem.',
  activation_in_progress: 'Aktivace se právě zpracovává nebo vyžaduje kontrolu. Zkus běžné přihlášení; pokud nefunguje, obrať se na člověka, který tě pozval.',
  invalid_password: 'Heslo nesplňuje požadavky. Zvol jiné heslo alespoň o 12 znacích.',
  activation_unavailable: 'Aktivace nyní není dostupná. Zkus to za chvíli znovu; pokud potíže trvají, obrať se na člověka, který tě pozval.',
};

const terminalErrors = new Set<ActivationErrorCode>(['disabled', 'invalid_invitation', 'expired_invitation', 'already_active', 'activation_in_progress']);
const toErrorCode = (error: unknown): ActivationErrorCode => error instanceof ActivationError ? error.code : 'activation_unavailable';

const ActivationCard = ({ children }: { children: ReactNode }) => (
  <main className="flex min-h-screen items-center justify-center bg-[color:var(--nodu-paper)] px-4 py-8">
    <section aria-labelledby="activation-title" className="w-full max-w-md overflow-hidden rounded-[32px] border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.98)] shadow-[0_28px_80px_rgba(47,38,31,0.12)]">
      <header className="border-b border-[color:var(--nodu-border)] bg-[radial-gradient(circle_at_top,_rgba(var(--nodu-accent-rgb),0.12),_transparent_58%)] px-6 py-7 text-center">
        <img src={noduLogo} alt="nodu" className="mx-auto h-14 w-auto" />
        <h1 id="activation-title" className="mt-5 text-2xl font-semibold tracking-tight text-[color:var(--nodu-text)]">Aktivace účtu</h1>
      </header>
      <div className="space-y-5 px-6 py-6 text-sm text-[color:var(--nodu-text)]">{children}</div>
      <div className="px-6 pb-7 text-center">
        <Link to="/login" className="inline-flex min-h-11 items-center rounded-lg px-3 font-medium underline underline-offset-4">
          Přejít na přihlášení
        </Link>
      </div>
    </section>
  </main>
);

const Alert = ({ children }: { children: ReactNode }) => (
  <p role="alert" className="rounded-2xl border border-[color:var(--nodu-error-border)] bg-[color:var(--nodu-error-bg)] px-4 py-3 leading-6 text-[color:var(--nodu-error-text)]">
    {children}
  </p>
);

const ActivationOperation = ({ initialToken, clearToken }: { initialToken: string | null; clearToken: () => void }) => {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const tokenRef = useRef(initialToken);
  const alive = useRef(true);
  const submitting = useRef(false);
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ActivationErrorCode | null>(null);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [validationError, setValidationError] = useState('');
  const [phase, setPhase] = useState<'form' | 'completing' | 'signing-in' | 'login-required'>('form');

  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    const token = tokenRef.current;
    if (!token || !isActivationToken(token)) {
      setError('invalid_invitation');
      setLoading(false);
    } else {
      void previewActivation(token).then((data) => {
        if (cancelled) return;
        if (Date.parse(data.expiresAt) <= Date.now()) setError('expired_invitation');
        else setPreview(data);
      }).catch((failure: unknown) => {
        if (!cancelled) setError(toErrorCode(failure));
      }).finally(() => { if (!cancelled) setLoading(false); });
    }
    return () => { cancelled = true; alive.current = false; };
  }, []);

  useEffect(() => {
    if (!preview || phase !== 'form') return;
    const delay = Math.max(0, Date.parse(preview.expiresAt) - Date.now());
    const timeout = window.setTimeout(() => setError('expired_invitation'), Math.min(delay, 2_147_483_647));
    return () => window.clearTimeout(timeout);
  }, [phase, preview]);

  useEffect(() => {
    if (!error || !terminalErrors.has(error)) return;
    tokenRef.current = null;
    setPassword('');
    setConfirmation('');
    clearToken();
  }, [clearToken, error]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting.current || phase !== 'form' || !preview || !tokenRef.current) return;
    setValidationError('');
    setError(null);
    if (Date.parse(preview.expiresAt) <= Date.now()) {
      setError('expired_invitation');
      return;
    }
    if (!isValidActivationPassword(password)) {
      setValidationError([...password].length < 12 ? 'Použij alespoň 12 znaků.' : 'Heslo je příliš dlouhé. Zvol kratší heslo.');
      return;
    }
    if (password !== confirmation) {
      setValidationError('Hesla se neshodují. Zadej stejné heslo do obou polí.');
      return;
    }

    submitting.current = true;
    setPhase('completing');
    const chosenPassword = password;
    try {
      const completed = await completeActivation(tokenRef.current, chosenPassword);
      if (!alive.current) return;
      tokenRef.current = null;
      setPassword('');
      setConfirmation('');
      setPhase('signing-in');
      clearToken();
      try {
        await signIn(completed.email, chosenPassword);
        if (alive.current) navigate('/app', { replace: true });
      } catch {
        if (alive.current) setPhase('login-required');
      }
    } catch (failure) {
      if (!alive.current) return;
      setError(toErrorCode(failure));
      setPhase('form');
    } finally {
      submitting.current = false;
    }
  };

  if (loading) return <ActivationCard><p role="status">Ověřuji pozvánku…</p></ActivationCard>;
  if (phase === 'signing-in') return <ActivationCard><p role="status">Účet je aktivní. Přihlašuji tě…</p></ActivationCard>;
  if (phase === 'login-required') return <ActivationCard><Alert>Účet je aktivní, ale automatické přihlášení se nepodařilo. Přejdi na přihlášení a použij svůj e-mail a právě zvolené heslo.</Alert></ActivationCard>;
  if (error && (terminalErrors.has(error) || !preview)) return <ActivationCard><Alert>{messages[error]}</Alert></ActivationCard>;
  if (!preview) return <ActivationCard><Alert>{messages.activation_unavailable}</Alert></ActivationCard>;

  const busy = phase === 'completing';
  const identityFields = [
    ['E-mail', preview.email, 'email'],
    ['Jméno', preview.firstName, 'text'],
    ['Příjmení', preview.lastName, 'text'],
    ['Telefon', preview.phone, 'tel'],
  ] as const;
  return (
    <ActivationCard>
      <p className="leading-6">Zkontroluj údaje z pozvánky a zvol si vlastní heslo. Stejný účet použiješ v mobilní aplikaci i na webu.</p>
      <div className="grid grid-cols-2 gap-3">
        {identityFields.map(([label, value, type]) => (
          <label key={label} className={label === 'E-mail' || label === 'Telefon' ? 'col-span-2 block space-y-1.5' : 'block space-y-1.5'}>
            <span className="font-medium">{label}</span>
            <Input type={type} value={value} readOnly className="h-11 bg-[color:var(--nodu-paper)]" />
          </label>
        ))}
      </div>
      <p className="text-xs leading-5 text-[color:var(--nodu-text-soft)]">
        Pozvánka platí 48 hodin od odeslání, do {new Date(preview.expiresAt).toLocaleString('cs-CZ')}. Otevřením odkazu se účet neaktivuje.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <label className="block space-y-2">
          <span className="font-medium">Heslo</span>
          <Input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            aria-describedby="password-guidance"
            aria-invalid={error === 'invalid_password' || Boolean(validationError)}
            disabled={busy}
            required
            className="h-11"
          />
        </label>
        <p id="password-guidance" className="text-xs leading-5 text-[color:var(--nodu-text-soft)]">Použij alespoň 12 znaků. Můžeš použít i celou větu.</p>
        <label className="block space-y-2">
          <span className="font-medium">Heslo znovu</span>
          <Input
            type="password"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="new-password"
            aria-invalid={Boolean(validationError)}
            disabled={busy}
            required
            className="h-11"
          />
        </label>
        {validationError ? <Alert>{validationError}</Alert> : error ? <Alert>{messages[error]}</Alert> : null}
        <Button type="submit" disabled={busy} className="h-12 w-full rounded-xl bg-[color:var(--nodu-text)] font-semibold text-white hover:bg-[color:rgb(var(--nodu-text-rgb)/0.86)]">
          {busy ? 'Aktivuji účet…' : 'Aktivovat účet'}
        </Button>
      </form>
    </ActivationCard>
  );
};

const ActivationView = () => {
  const { token, revision, ready, clearToken } = useActivationLink();
  if (!isOnboardingEnabled()) return <ActivationCard><Alert>{messages.disabled}</Alert></ActivationCard>;
  if (!ready) return <ActivationCard><p role="status">Ověřuji pozvánku…</p></ActivationCard>;
  return <ActivationOperation key={revision} initialToken={token} clearToken={clearToken} />;
};
export default ActivationView;
