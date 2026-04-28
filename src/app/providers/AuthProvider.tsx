import React, { useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { appDataSource } from '../../lib/app-config';
import { getContractors, subscribeToCrewChanges } from '../../features/crew/services/crew.service';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import type { Contractor, Role } from '../../types';
import { clearPersistedUiSession } from '../../context/ui-session-storage';
import { AuthContext, type AuthProfile, type AuthContextType, type DevLoginOption } from './auth-context';

const DEV_SESSION_STORAGE_KEY = 'event-helper-dev-session';

type StoredDevSession = {
  profileId: string | null;
  userId: string | null;
  name: string;
  email: string;
  role: Role;
};

const ROLE_PRIORITY: Role[] = ['coo', 'crewhead', 'crew'];

const pickPrimaryRole = (roles: Role[]): Role | null => (
  ROLE_PRIORITY.find((role) => roles.includes(role)) ?? roles[0] ?? null
);

const splitName = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? '',
    lastName: parts.slice(1).join(' '),
  };
};

const toDevLoginOption = (contractor: Contractor): DevLoginOption => ({
  id: contractor.id,
  profileId: contractor.profileId ?? null,
  name: contractor.name,
  email: contractor.email || '',
});

const getContractorIdByProfileId = (profileId: string | null): number | null => {
  if (!profileId) return null;
  return (getContractors() ?? []).find((item) => item.profileId === profileId)?.id ?? null;
};

const readStoredDevSession = (): StoredDevSession | null => {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(DEV_SESSION_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredDevSession;
  } catch {
    return null;
  }
};

const writeStoredDevSession = (session: StoredDevSession | null) => {
  if (typeof window === 'undefined') return;

  if (!session) {
    window.localStorage.removeItem(DEV_SESSION_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(DEV_SESSION_STORAGE_KEY, JSON.stringify(session));
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const isAuthRequired = appDataSource === 'supabase' && isSupabaseConfigured && Boolean(supabase);
  const [isLoading, setIsLoading] = useState(isAuthRequired);
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [currentProfileId, setCurrentProfileId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentContractorId, setCurrentContractorId] = useState<number | null>(null);
  const [isDevSession, setIsDevSession] = useState(false);
  const [devLoginOptions, setDevLoginOptions] = useState<DevLoginOption[]>([]);

  useEffect(() => {
    if (!isAuthRequired) {
      setDevLoginOptions([]);
      return;
    }

    const loadOptions = () => {
      setDevLoginOptions((getContractors() ?? []).map(toDevLoginOption));
    };

    loadOptions();
    return subscribeToCrewChanges(loadOptions);
  }, [isAuthRequired]);

  useEffect(() => {
    if (!isAuthRequired || !supabase) {
      setIsLoading(false);
      setSession(null);
      setUser(null);
      setRole(null);
      setProfile(null);
      setCurrentProfileId(null);
      setCurrentUserId(null);
      setCurrentContractorId(null);
      setIsDevSession(false);
      return;
    }

    let isCancelled = false;

    const loadSessionState = async (nextSession: Session | null) => {
      if (isCancelled) return;

      setSession(nextSession);
      setUser(nextSession?.user ?? null);

      if (!nextSession?.user) {
        setCurrentUserId(null);
        const storedDevSession = readStoredDevSession();
        if (storedDevSession) {
          const { firstName, lastName } = splitName(storedDevSession.name);
          setIsDevSession(true);
          setRole(storedDevSession.role);
          setCurrentProfileId(storedDevSession.profileId);
          setCurrentUserId(storedDevSession.userId);
          setCurrentContractorId(getContractorIdByProfileId(storedDevSession.profileId));
          setProfile({
            firstName,
            lastName,
            email: storedDevSession.email,
          });
          setIsLoading(false);
          return;
        }

        setIsDevSession(false);
        clearPersistedUiSession();
        setRole(null);
        setProfile(null);
        setCurrentProfileId(null);
        setCurrentContractorId(null);
        setIsLoading(false);
        return;
      }

      writeStoredDevSession(null);
      setIsDevSession(false);
      setIsLoading(true);
      setCurrentUserId(nextSession.user.id);

      const [profileResult, rolesResult] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, first_name, last_name, email')
          .eq('user_id', nextSession.user.id)
          .maybeSingle(),
        supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', nextSession.user.id),
      ]);

      if (isCancelled) return;

      if (profileResult.error) {
        console.warn('Nepodarilo se nacist profil prihlaseneho uzivatele.', profileResult.error);
      }

      if (rolesResult.error) {
        console.warn('Nepodarilo se nacist role prihlaseneho uzivatele.', rolesResult.error);
      }

      const nextProfile = profileResult.data
        ? {
            firstName: profileResult.data.first_name ?? '',
            lastName: profileResult.data.last_name ?? '',
            email: profileResult.data.email ?? nextSession.user.email ?? '',
          }
        : {
            firstName: '',
            lastName: '',
            email: nextSession.user.email ?? '',
          };

      const nextProfileId = profileResult.data?.id ?? null;
      setProfile(nextProfile);
      setRole(pickPrimaryRole((rolesResult.data ?? []).map((item) => item.role as Role)));
      setCurrentProfileId(nextProfileId);
      setCurrentContractorId(getContractorIdByProfileId(nextProfileId));
      setIsLoading(false);
    };

    void supabase.auth.getSession().then(({ data }) => loadSessionState(data.session));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void loadSessionState(nextSession);
    });

    return () => {
      isCancelled = true;
      subscription.unsubscribe();
    };
  }, [isAuthRequired]);

  useEffect(() => {
    if (!isAuthRequired || !currentProfileId) {
      if (!currentProfileId) {
        setCurrentContractorId((prev) => (prev == null ? prev : null));
      }
      return;
    }

    const syncCurrentContractorId = () => {
      setCurrentContractorId(getContractorIdByProfileId(currentProfileId));
    };

    syncCurrentContractorId();
    return subscribeToCrewChanges(syncCurrentContractorId);
  }, [currentProfileId, isAuthRequired]);

  const value = useMemo<AuthContextType>(() => ({
    isAuthRequired,
    isAuthenticated: !isAuthRequired || Boolean(session?.user) || isDevSession,
    isLoading,
    hasKnownSession: Boolean(session?.user) || isDevSession,
    isDevSession,
    session,
    user,
    role,
    profile,
    currentProfileId,
    currentUserId,
    currentContractorId,
    devLoginOptions,
    signIn: async (email: string, password: string) => {
      if (!supabase) {
        throw new Error('Supabase klient neni dostupny.');
      }

      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        throw new Error(error.message);
      }
    },
    signInAsDevUser: (profileId: string, nextRole: Role) => {
      const contractor = (getContractors() ?? []).find((item) => item.profileId === profileId);
      if (!contractor) {
        throw new Error('Vybrany testovaci profil nebyl nalezen.');
      }

      const { firstName, lastName } = splitName(contractor.name);
      const storedSession: StoredDevSession = {
        profileId: contractor.profileId ?? null,
        userId: contractor.userId ?? null,
        name: contractor.name,
        email: contractor.email || '',
        role: nextRole,
      };

      writeStoredDevSession(storedSession);
      setSession(null);
      setUser(null);
      setIsDevSession(true);
      setRole(nextRole);
      setCurrentProfileId(storedSession.profileId);
      setCurrentUserId(storedSession.userId);
      setCurrentContractorId(getContractorIdByProfileId(storedSession.profileId));
      setProfile({
        firstName,
        lastName,
        email: contractor.email || '',
      });
      setIsLoading(false);
    },
    signOut: async () => {
      writeStoredDevSession(null);
      clearPersistedUiSession();
      setIsDevSession(false);
      setCurrentProfileId(null);
      setCurrentUserId(null);
      setCurrentContractorId(null);

      if (!supabase) return;

      const { error } = await supabase.auth.signOut();
      if (error) {
        throw new Error(error.message);
      }
    },
  }), [currentContractorId, currentProfileId, currentUserId, devLoginOptions, isAuthRequired, isDevSession, isLoading, profile, role, session, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
