import { FormEvent, useEffect, useState } from 'react';
import { LockKeyhole, Mail } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { useAuth } from '../app/providers/AuthProvider';
import type { Role } from '../types';

const LoginView = () => {
  const { signIn, signInAsDevUser, devLoginOptions, isLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedDevUserId, setSelectedDevUserId] = useState<number | null>(devLoginOptions[0]?.id ?? null);
  const [selectedDevRole, setSelectedDevRole] = useState<Role>('crewhead');

  useEffect(() => {
    if (!selectedDevUserId && devLoginOptions.length > 0) {
      setSelectedDevUserId(devLoginOptions[0].id);
    }
  }, [devLoginOptions, selectedDevUserId]);

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

  const handleDevLogin = () => {
    if (!selectedDevUserId) {
      setError('Vyber testovaci profil.');
      return;
    }

    setError('');

    try {
      signInAsDevUser(selectedDevUserId, selectedDevRole);
      toast.success('Testovaci prihlaseni probehlo uspesne.');
    } catch (devError) {
      const message = devError instanceof Error ? devError.message : 'Testovaci prihlaseni selhalo.';
      setError(message);
      toast.error(message);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-slate-100 px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md overflow-hidden rounded-3xl border border-white/70 bg-white/95 shadow-xl shadow-emerald-100/60 backdrop-blur"
      >
        <div className="border-b border-emerald-100 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.12),_transparent_55%)] px-8 py-8">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
            <LockKeyhole size={20} />
          </div>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-slate-900">Prihlaseni</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            Prihlas se e-mailem a heslem do Event Helperu. Po prihlaseni se aplikace nacte primo nad Supabase daty.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 px-8 py-8">
          <label className="block space-y-2">
            <span className="text-sm font-medium text-slate-700">E-mail</span>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="napr. petr@firma.cz"
                autoComplete="email"
                className="h-11 rounded-xl border-slate-200 pl-10"
                disabled={isSubmitting || isLoading}
                required
              />
            </div>
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium text-slate-700">Heslo</span>
            <div className="relative">
              <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Zadej heslo"
                autoComplete="current-password"
                className="h-11 rounded-xl border-slate-200 pl-10"
                disabled={isSubmitting || isLoading}
                required
              />
            </div>
          </label>

          {error && (
            <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <Button
            type="submit"
            className="h-11 w-full rounded-xl bg-emerald-600 text-sm font-semibold hover:bg-emerald-700"
            disabled={isSubmitting || isLoading}
          >
            {isSubmitting || isLoading ? 'Prihlasovani...' : 'Prihlasit se'}
          </Button>

          <div className="rounded-2xl bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-500">
            Pokud jeste nemas ucet, vytvor ho zatim v Supabase Auth dashboardu. Google login muzeme pridat pozdeji jako pohodlnejsi variantu.
          </div>

          <div className="rounded-2xl border border-dashed border-amber-200 bg-amber-50/80 px-4 py-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">Testovaci prihlaseni</div>
            <p className="mt-1 text-xs leading-relaxed text-amber-800/80">
              Pro lokalni vyvoj si muzes vybrat existujici profil a roli bez znalosti hesla. Je to vhodne hlavne na rychle proklikani aplikace.
            </p>

            <div className="mt-4 space-y-3">
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-slate-700">Profil</span>
                <select
                  value={selectedDevUserId ?? ''}
                  onChange={(event) => setSelectedDevUserId(Number(event.target.value))}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
                >
                  {devLoginOptions.length === 0 ? (
                    <option value="">Zadne profily k vyberu</option>
                  ) : (
                    devLoginOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}{option.email ? ` (${option.email})` : ''}
                      </option>
                    ))
                  )}
                </select>
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-slate-700">Role</span>
                <select
                  value={selectedDevRole}
                  onChange={(event) => setSelectedDevRole(event.target.value as Role)}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
                >
                  <option value="crew">Crew</option>
                  <option value="crewhead">CrewHead</option>
                  <option value="coo">COO</option>
                </select>
              </label>

              <Button
                type="button"
                variant="outline"
                className="h-10 w-full rounded-xl"
                onClick={handleDevLogin}
                disabled={devLoginOptions.length === 0}
              >
                Prihlasit se testovacim profilem
              </Button>
            </div>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

export default LoginView;
