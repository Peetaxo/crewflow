import { AppProvider } from '../context/AppContext';
import AppLayout from '../components/layout/AppLayout';

/**
 * Index — vstupní bod aplikace.
 * Obaluje AppLayout kontextem (AppProvider).
 */
const Index = () => (
  <AppProvider>
    <AppLayout />
  </AppProvider>
);

export default Index;
