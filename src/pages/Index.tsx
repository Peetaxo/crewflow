import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AuthProvider } from '../app/providers/AuthProvider';
import { useAuth } from '../app/providers/useAuth';
import AppDataBootstrap from '../app/providers/AppDataBootstrap';
import AppLayout from '../components/layout/AppLayout';
import AppLoadingMark from '../components/shared/AppLoadingMark';
import { AppProvider } from '../context/AppContext';
import { appDataSource } from '../lib/app-config';
import { isSupabaseConfigured } from '../lib/supabase';
import LoginView from '../views/LoginView';
import WelcomeView from '../views/WelcomeView';

const MissingSupabaseConfigView = () => (
  <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
    <div className="max-w-md rounded-2xl border border-amber-200 bg-white px-6 py-5 text-sm text-slate-600 shadow-sm">
      <p className="text-base font-semibold text-slate-950">Chybi Supabase konfigurace</p>
      <p className="mt-2 leading-6">
        Preview je nastavene na Supabase, ale chybi promenne
        {' '}
        <span className="font-mono text-xs">VITE_SUPABASE_URL</span>
        {' '}
        nebo
        {' '}
        <span className="font-mono text-xs">VITE_SUPABASE_PUBLISHABLE_KEY</span>
        . Lokalni zalozni data jsou vypnuta, aby se nepletla se skutecnou databazi.
      </p>
    </div>
  </div>
);

export const AppShell = () => {
  const { isAuthRequired, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isLoginPreview = import.meta.env.DEV
    && typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('previewLogin') === '1';
  const isNativeRoot = Capacitor.isNativePlatform() && location.pathname === '/';

  useEffect(() => {
    if (isNativeRoot) {
      navigate('/app', { replace: true });
    }
  }, [isNativeRoot, navigate]);

  if (location.pathname === '/' && !isNativeRoot && !isLoginPreview) {
    return (
      <WelcomeView
        onLogin={() => navigate('/login')}
        onRegister={() => navigate('/login')}
      />
    );
  }

  if (appDataSource === 'supabase' && !isSupabaseConfigured) {
    return <MissingSupabaseConfigView />;
  }

  if (isLoading && !isAuthenticated) {
    return <AppLoadingMark />;
  }

  if (isAuthRequired && !isAuthenticated) {
    return <LoginView />;
  }

  if (isLoginPreview) {
    return <LoginView />;
  }

  if (location.pathname === '/login') {
    return <Navigate to="/app" replace />;
  }

  return (
    <AppDataBootstrap>
      <AppProvider>
        <AppLayout />
      </AppProvider>
    </AppDataBootstrap>
  );
};

const Index = () => (
  <AuthProvider>
    <AppShell />
  </AuthProvider>
);

export default Index;
