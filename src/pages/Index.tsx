import { AppProvider } from '../context/AppContext';
import AppDataBootstrap from '../app/providers/AppDataBootstrap';
import AppLayout from '../components/layout/AppLayout';

/**
 * Index — vstupní bod aplikace.
 * Obaluje AppLayout kontextem (AppProvider).
 */
const Index = () => (
  <AppProvider>
    <AppDataBootstrap />
    <AppLayout />
  </AppProvider>
);

export default Index;
