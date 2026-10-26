import { useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/providers/useAuth';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import PasswordRecoveryCard, { PasswordRecoveryAlert } from './PasswordRecoveryCard';
import { isRecoveryToken, usePasswordRecoveryLink } from './password-recovery-link';
import { isValidOnboardingPassword } from './password-policy';
import { createPasswordRecoveryOperation, isPasswordRecoveryEnabled, PasswordRecoveryError, type PasswordRecoveryOperation } from './services/password-recovery.service';

const invalidLinkMessage = 'Odkaz je neplatný nebo jeho platnost vypršela. Požádej o nový odkaz.';
const ResetOperation = ({ initialToken, clearToken }: { initialToken: string | null; clearToken: () => void }) => {
  const { signOut, session } = useAuth();
  const navigate = useNavigate();
  const operation = useRef<PasswordRecoveryOperation | null>(null);
  const alive = useRef(true);
  const submitting = useRef(false);
  const continuing = useRef(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [invalid, setInvalid] = useState(!initialToken || !isRecoveryToken(initialToken));
  const [phase, setPhase] = useState<'form' | 'saving' | 'success' | 'leaving'>('form');
  const [error, setError] = useState('');
  useLayoutEffect(() => {
    alive.current = true;
    return () => { alive.current = false; operation.current?.dispose(); operation.current = null; };
  }, []);
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting.current || invalid || phase !== 'form') return;
    setError('');
    if (!isValidOnboardingPassword(password)) { setError([...password].length < 8 ? 'Použij alespoň 8 znaků.' : 'Heslo je příliš dlouhé. Zvol kratší heslo.'); return; }
    if (password !== confirmation) { setError('Hesla se neshodují. Zadej stejné heslo do obou polí.'); return; }
    submitting.current = true; setPhase('saving');
    try {
      operation.current ??= createPasswordRecoveryOperation(initialToken);
      await operation.current.complete(password);
      if (!alive.current) return;
      setPassword(''); setConfirmation(''); setPhase('success'); clearToken();
    } catch (failure) {
      if (!alive.current) return;
      setPhase('form');
      const code = failure instanceof PasswordRecoveryError ? failure.code : 'unavailable';
      if (code === 'invalid_link' || code === 'disabled') {
        operation.current?.dispose(); operation.current = null;
        setInvalid(true); setPassword(''); setConfirmation(''); clearToken();
      } else if (code === 'invalid_password') setError('Heslo nebylo přijato. Zvol jiné heslo alespoň o 8 znacích a nejvýše 72 bajtech.');
      else setError('Heslo se nyní nepodařilo uložit. Zkus to znovu.');
    } finally {
      submitting.current = false;
    }
  };
  const continueToLogin = async () => {
    if (continuing.current) return;
    continuing.current = true; setPhase('leaving'); setError('');
    try {
      await signOut();
      if (alive.current) navigate('/login', { replace: true });
    } catch {
      if (alive.current) { setPhase('success'); setError('Odhlášení se nyní nepodařilo. Zkus to znovu.'); }
    } finally { continuing.current = false; }
  };
  const success = phase === 'success' || phase === 'leaving';
  return <PasswordRecoveryCard title="Nastavení nového hesla" showLogin={!success}>
    {invalid ? <><PasswordRecoveryAlert>{invalidLinkMessage}</PasswordRecoveryAlert><Link to="/forgot-password" className="inline-flex min-h-11 items-center underline underline-offset-4">Poslat nový odkaz</Link></> : success ? <>
      <p role="status">Heslo je změněné. Přihlas se svým e-mailem a novým heslem.</p>
      {session && <p className="leading-6">Pokračováním odhlásíš účet, který je v této aplikaci právě přihlášený.</p>}
      {error && <PasswordRecoveryAlert>{error}</PasswordRecoveryAlert>}
      <Button onClick={() => void continueToLogin()} disabled={phase === 'leaving'} className="h-11 w-full">{phase === 'leaving' ? 'Otevírám přihlášení…' : 'Přihlásit se novým heslem'}</Button>
    </> : <>
      <p className="leading-6">Použij alespoň 8 znaků. Velká písmena, číslice ani speciální znaky nejsou povinné. Odkaz platí 1 hodinu.</p>
      {session && <p className="leading-6">Po změně hesla můžeš pokračovat k přihlášení. Tím odhlásíš účet, který je zde právě přihlášený.</p>}
      <form onSubmit={handleSubmit} className="space-y-5">
        <label className="block space-y-2"><span>Nové heslo</span><Input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={phase === 'saving'} required className="h-11" /></label>
        <label className="block space-y-2"><span>Nové heslo znovu</span><Input type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={phase === 'saving'} required className="h-11" /></label>
        {error && <PasswordRecoveryAlert>{error}</PasswordRecoveryAlert>}
        <Button type="submit" disabled={phase === 'saving'} className="h-11 w-full">{phase === 'saving' ? 'Ukládám…' : 'Uložit nové heslo'}</Button>
      </form>
    </>}
  </PasswordRecoveryCard>;
};
const ResetPasswordView = () => {
  const recovery = usePasswordRecoveryLink();
  if (!isPasswordRecoveryEnabled()) return <PasswordRecoveryCard title="Nastavení nového hesla"><PasswordRecoveryAlert>Obnova hesla zatím není zapnutá.</PasswordRecoveryAlert></PasswordRecoveryCard>;
  if (!recovery.ready) return <PasswordRecoveryCard title="Nastavení nového hesla"><p role="status">Otevírám odkaz…</p></PasswordRecoveryCard>;
  return <ResetOperation key={recovery.revision} initialToken={recovery.token} clearToken={recovery.clearToken} />;
};
export default ResetPasswordView;
