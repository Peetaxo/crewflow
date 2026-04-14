import { AuthProvider, useAuth } from '../app/providers/AuthProvider';
import AppDataBootstrap from '../app/providers/AppDataBootstrap';
import AppLayout from '../components/layout/AppLayout';
import { AppProvider } from '../context/AppContext';
import LoginView from '../views/LoginView';

const AppShell = () => {
  const { isAuthRequired, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5 text-sm text-slate-600 shadow-sm">
          Nacitam prihlaseni a data...
        </div>
      </div>
    );
  }

  if (isAuthRequired && !isAuthenticated) {
    return <LoginView />;
  }

  return (
    <AppProvider>
      <AppDataBootstrap />
      <AppLayout />
    </AppProvider>
  );
};

const Index = () => (
  <AuthProvider>
    <AppShell />
  </AuthProvider>
);

export default Index;
