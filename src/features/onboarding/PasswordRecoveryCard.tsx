import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import noduLogo from '../../assets/nodu-logo.svg';

export const PasswordRecoveryAlert = ({ children }: { children: ReactNode }) => <p role="alert" className="rounded-2xl border border-[color:var(--nodu-error-border)] bg-[color:var(--nodu-error-bg)] px-4 py-3 leading-6 text-[color:var(--nodu-error-text)]">{children}</p>;

const PasswordRecoveryCard = ({ title, children, showLogin = true }: { title: string; children: ReactNode; showLogin?: boolean }) => (
  <main className="flex min-h-screen items-center justify-center bg-[color:var(--nodu-paper)] px-4 py-8">
    <section aria-labelledby="recovery-title" className="w-full max-w-md overflow-hidden rounded-[32px] border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.98)] shadow-[0_28px_80px_rgba(47,38,31,0.12)]">
      <header className="border-b border-[color:var(--nodu-border)] px-6 py-7 text-center">
        <img src={noduLogo} alt="nodu" className="mx-auto h-14 w-auto" />
        <h1 id="recovery-title" className="mt-5 text-2xl font-semibold text-[color:var(--nodu-text)]">{title}</h1>
      </header>
      <div className="space-y-5 px-6 py-6 text-sm text-[color:var(--nodu-text)]">{children}</div>
      {showLogin && <div className="px-6 pb-7 text-center"><Link to="/login" className="inline-flex min-h-11 items-center rounded-lg px-3 font-medium underline underline-offset-4">Zpět na přihlášení</Link></div>}
    </section>
  </main>
);
export default PasswordRecoveryCard;
