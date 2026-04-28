import { createContext } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import type { Role } from '../../types';

export type AuthProfile = {
  firstName: string;
  lastName: string;
  email: string;
};

export type DevLoginOption = {
  id: number;
  profileId: string | null;
  name: string;
  email: string;
};

export interface AuthContextType {
  isAuthRequired: boolean;
  isAuthenticated: boolean;
  isLoading: boolean;
  hasKnownSession: boolean;
  isDevSession: boolean;
  session: Session | null;
  user: User | null;
  role: Role | null;
  profile: AuthProfile | null;
  currentProfileId: string | null;
  currentUserId: string | null;
  currentContractorId: number | null;
  devLoginOptions: DevLoginOption[];
  signIn: (email: string, password: string) => Promise<void>;
  signInAsDevUser: (profileId: string, role: Role) => void;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | null>(null);
