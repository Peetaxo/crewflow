import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import PasswordRecoveryCard, { PasswordRecoveryAlert } from './PasswordRecoveryCard';
import { isPasswordRecoveryEnabled, PasswordRecoveryError, requestPasswordRecovery } from './services/password-recovery.service';

const ForgotPasswordView = () => {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting.current || !isPasswordRecoveryEnabled()) return;
    submitting.current = true;
    setPending(true); setError('');
    try {
      await requestPasswordRecovery(email);
      if (alive.current) { setSent(true); setEmail(''); }
    } catch (failure) {
      if (!alive.current) return;
      if (failure instanceof PasswordRecoveryError && failure.code === 'test_only') setError('V tomto místním testu použij e-mail s doménou @crewflow-onboarding.test.');
      else if (failure instanceof PasswordRecoveryError && failure.code === 'disabled') setError('Obnova hesla zatím není zapnutá.');
      else { setSent(true); setEmail(''); }
    } finally {
      submitting.current = false;
      if (alive.current) setPending(false);
    }
  };
  return <PasswordRecoveryCard title="Zapomenuté heslo">
    {!isPasswordRecoveryEnabled() ? <PasswordRecoveryAlert>Obnova hesla zatím není zapnutá.</PasswordRecoveryAlert> : sent ? <p role="status" className="leading-6">Pokud pro tento e-mail existuje účet, poslali jsme odkaz k nastavení nového hesla. Zkontroluj e-mail a otevři nejnovější odkaz. Jeho platnost je 1 hodina.</p> : <>
      <p className="leading-6">Zadej e-mail svého účtu. Pošleme ti odkaz k nastavení nového hesla. Tento místní test přijímá pouze adresy @crewflow-onboarding.test.</p>
      <form onSubmit={handleSubmit} className="space-y-5">
        <label className="block space-y-2"><span>E-mail</span><Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required disabled={pending} className="h-11" /></label>
        {error && <PasswordRecoveryAlert>{error}</PasswordRecoveryAlert>}
        <Button type="submit" disabled={pending} className="h-11 w-full">{pending ? 'Odesílám…' : 'Poslat odkaz'}</Button>
      </form>
    </>}
  </PasswordRecoveryCard>;
};
export default ForgotPasswordView;
