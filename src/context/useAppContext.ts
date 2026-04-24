import { useContext } from 'react';
import { AppContext, type AppContextType } from './app-context';

export function useAppContext(): AppContextType {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext musi byt pouzit uvnitr AppProvider');
  return ctx;
}
