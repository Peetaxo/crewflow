import { FormEvent, useState } from 'react';
import { LockKeyhole, Mail } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { useAuth } from '../app/providers/AuthProvider';

const LoginView = () => {
  const { signIn, isLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      await signIn(email.trim(), password);
      toast.success('Prihlaseni probehlo uspesne.');
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : 'Prihlaseni selhalo.';
      setError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[color:var(--nodu-paper)] px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md overflow-hidden rounded-[32px] border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.98)] shadow-[0_28px_80px_rgba(47,38,31,0.12)] backdrop-blur"
      >
        <div className="border-b border-[color:var(--nodu-border)] bg-[radial-gradient(circle_at_top,_rgba(var(--nodu-accent-rgb),0.12),_transparent_58%)] px-8 py-9 text-center">
          <img src="/nodu-logo.svg" alt="nodu" className="mx-auto h-16 w-auto" />
          <h1 className="mt-7 text-2xl font-semibold tracking-tight text-[color:var(--nodu-text)]">Prihlaseni</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 px-8 py-8">
          <label className="block space-y-2">
            <span className="text-sm font-medium text-[color:var(--nodu-text)]">E-mail</span>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--nodu-text-soft)]" size={16} />
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="napr. petr@firma.cz"
                autoComplete="email"
                className="h-11 pl-10"
                disabled={isSubmitting || isLoading}
                required
              />
            </div>
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium text-[color:var(--nodu-text)]">Heslo</span>
            <div className="relative">
              <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--nodu-text-soft)]" size={16} />
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Zadej heslo"
                autoComplete="current-password"
                className="h-11 pl-10"
                disabled={isSubmitting || isLoading}
                required
              />
            </div>
          </label>

          {error && (
            <div className="rounded-2xl border border-[color:var(--nodu-error-border)] bg-[color:var(--nodu-error-bg)] px-4 py-3 text-sm text-[color:var(--nodu-error-text)]">
              {error}
            </div>
          )}

          <Button
            type="submit"
            className="!mt-10 h-11 w-full rounded-xl bg-[color:var(--nodu-text)] text-sm font-semibold text-white shadow-none hover:translate-y-0 hover:bg-[color:rgb(var(--nodu-text-rgb)/0.86)]"
            disabled={isSubmitting || isLoading}
          >
            {isSubmitting || isLoading ? 'Prihlasovani...' : 'Prihlasit se'}
          </Button>
        </form>
      </motion.div>
    </div>
  );
};

export default LoginView;
