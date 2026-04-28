import { useContext } from 'react';
import { AuthContext, type AuthContextType } from './auth-context';

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth musi byt pouzit uvnitr AuthProvider');
  }
  return context;
};
