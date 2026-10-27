import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { appDataSource } from '../../lib/app-config';
import {
  getContractors,
  subscribeToCrewChanges,
} from '../../features/crew/services/crew.service';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import type { Contractor, Role } from '../../types';
import { clearPersistedUiSession } from '../../context/ui-session-storage';
import { AuthContext, type AuthProfile, type AuthContextType, type DevLoginOption } from './auth-context';
import { resetSupabaseDataScope } from './reset-supabase-data-scope';

// Cover the SDK's complete operation: its sign-in and sign-out methods do not
// share a lock. Use our own public Web Lock across same-origin product tabs.
let authTransitionTail: Promise<void> = Promise.resolve();
const runAuthTransition = <T,>(transition: () => Promise<T>): Promise<T> => {
  const run = () => typeof navigator !== 'undefined' && navigator.locks?.request
    ? navigator.locks.request('crewflow.auth-transition', transition)
    : transition();
  const request = authTransitionTail.then(run, run);
  authTransitionTail = request.then(() => undefined, () => undefined);
  return request;
};

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
  const currentSession = useRef<Session | null>(null);
  const retryAuthMetadataRef = useRef<(() => Promise<void>) | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [currentProfileId, setCurrentProfileId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentContractorId, setCurrentContractorId] = useState<number | null>(null);
  const [isDevSession, setIsDevSession] = useState(false);
  const [isRoleSwitching, setIsRoleSwitching] = useState(false);
  const sessionLoadVersion = useRef(0);
  const authActivation = useRef<object>({});
  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);
  const signOutActivation = useRef<object | null>(null);
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
      currentSession.current = null;
      setIsLoading(false);
      setSession(null);
      setUser(null);
      setRole(null);
      setProfile(null);
      setCurrentProfileId(null);
      setCurrentUserId(null);
      setCurrentContractorId(null);
      setIsDevSession(false);
      setIsRoleSwitching(false);
      return;
    }

    let isCancelled = false;
    let previousUserId: string | null | undefined;
    let readyIdentity: { userId: string; activation: object } | null = null;

    const loadSessionState = async (nextSession: Session | null, event?: string) => {
      if (isCancelled) return;
      currentSession.current = nextSession;
      const loadVersion = ++sessionLoadVersion.current;
      const nextUserId = nextSession?.user.id ?? null;
      const changedIdentity = previousUserId !== undefined && previousUserId !== nextUserId;
      previousUserId = nextUserId;
      const isOwnSignOut = event === 'SIGNED_OUT' && nextUserId === null
        && signOutActivation.current === authActivation.current;
      if (changedIdentity && !isOwnSignOut) authActivation.current = {};
      if (changedIdentity) readyIdentity = null;
      const isBackgroundRefresh = nextUserId !== null
        && readyIdentity?.userId === nextUserId
        && readyIdentity?.activation === authActivation.current;
      // Clear ownerless navigation before another provider can restore it.
      if (changedIdentity) clearPersistedUiSession();
      // Retire service publications immediately; query cancellation may await.
      const reset = changedIdentity ? resetSupabaseDataScope() : null;

      setSession(nextSession);
      setUser(nextSession?.user ?? null);

      if (!nextSession?.user) {
        setCurrentUserId(null);
        setIsRoleSwitching(false);
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
      setIsRoleSwitching(false);
      if (!isBackgroundRefresh) {
        setIsLoading(true);
        setRole(null);
        setCurrentProfileId(null);
        setCurrentContractorId(null);
        setProfile(null);
      }
      setCurrentUserId(nextSession.user.id);
      if (reset) await reset;
      if (isCancelled || loadVersion !== sessionLoadVersion.current) return;

      try {
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

        if (isCancelled || loadVersion !== sessionLoadVersion.current) return;

        if (profileResult.error) {
          console.warn('Nepodarilo se nacist profil prihlaseneho uzivatele.', profileResult.error);
        }

        if (rolesResult.error) {
          console.warn('Nepodarilo se nacist role prihlaseneho uzivatele.', rolesResult.error);
        }

        // Keep this identity's trusted metadata and mounted drafts on transient
        // background failures. Successful changes still publish a new scope.
        if (profileResult.error || rolesResult.error) {
          if (!isBackgroundRefresh) setIsLoading(false);
          return;
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
        const nextRole = pickPrimaryRole((rolesResult.data ?? []).map((item) => item.role as Role));
        readyIdentity = !profileResult.error && !rolesResult.error && nextProfileId && nextRole
          ? { userId: nextSession.user.id, activation: authActivation.current }
          : null;
        setProfile(nextProfile);
        setRole(nextRole);
        setCurrentProfileId(nextProfileId);
        setCurrentContractorId(getContractorIdByProfileId(nextProfileId));
        setIsLoading(false);
      } catch (error) {
        if (isCancelled || loadVersion !== sessionLoadVersion.current) return;
        console.warn('Nepodarilo se obnovit profil a role prihlaseneho uzivatele.', error);
        if (!isBackgroundRefresh) setIsLoading(false);
      }
    };

    const retryMetadata = async () => {
      const nextSession = currentSession.current;
      if (isCancelled || !nextSession?.user) return;
      await loadSessionState(nextSession);
    };
    retryAuthMetadataRef.current = retryMetadata;

    const initialLoadVersion = sessionLoadVersion.current;
    void supabase.auth.getSession().then(({ data }) => {
      if (isCancelled || sessionLoadVersion.current !== initialLoadVersion) return;
      return loadSessionState(data.session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void loadSessionState(nextSession, _event);
    });

    return () => {
      isCancelled = true;
      if (retryAuthMetadataRef.current === retryMetadata) retryAuthMetadataRef.current = null;
      currentSession.current = null;
      authActivation.current = {};
      sessionLoadVersion.current += 1;
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

  const switchRole = useCallback(async (nextRole: Role) => {
    if (isRoleSwitching || role === nextRole) return;

    if (!isAuthRequired || isDevSession) {
      void resetSupabaseDataScope();
      setRole(nextRole);
      const storedDevSession = readStoredDevSession();
      if (storedDevSession) {
        writeStoredDevSession({ ...storedDevSession, role: nextRole });
      }
      return;
    }

    throw new Error('Změna přihlášené role není povolená.');
  }, [isAuthRequired, isDevSession, isRoleSwitching, role]);

  const value = useMemo<AuthContextType>(() => ({
    isAuthRequired,
    isAuthenticated: !isAuthRequired || Boolean(session?.user) || isDevSession,
    isLoading,
    hasKnownSession: Boolean(session?.user) || isDevSession,
    isDevSession,
    session,
    user,
    role,
    isRoleSwitching,
    profile,
    currentProfileId,
    currentUserId,
    currentContractorId,
    devLoginOptions,
    retryAuthMetadata: () => retryAuthMetadataRef.current?.() ?? Promise.resolve(),
    signIn: (email: string, password: string) => runAuthTransition(async () => {
      if (!isMounted.current) return;
      if (!supabase) {
        throw new Error('Supabase klient neni dostupny.');
      }

      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        throw new Error(error.message);
      }
    }),
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

      void runAuthTransition(async () => {
        if (!isMounted.current) return;
        authActivation.current = {};
        sessionLoadVersion.current += 1;
        void resetSupabaseDataScope();
        writeStoredDevSession(storedSession);
        currentSession.current = null;
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
      });
    },
    switchRole,
    signOut: () => {
      const activation = authActivation.current;
      const isCurrent = () => authActivation.current === activation;
      return runAuthTransition(async () => {
        if (!isCurrent()) return;
        try {
          if (supabase) {
            const { disconnectNativePush } = await import('../../features/notifications/native-push');
            if (!isCurrent()) return;
            await disconnectNativePush().catch(() => {});
            if (!isCurrent()) return;
            // This request may emit SIGNED_OUT before resolving. That event still
            // belongs to this activation; any intervening sign-in retires it.
            signOutActivation.current = activation;
            const { error } = await supabase.auth.signOut({ scope: 'local' });
            if (!isCurrent()) return;
            if (error) throw new Error(error.message);
          }

          if (!isCurrent()) return;
          sessionLoadVersion.current += 1;
          await resetSupabaseDataScope();
          if (!isCurrent()) return;
          writeStoredDevSession(null);
          clearPersistedUiSession();
          currentSession.current = null;
          setSession(null);
          setUser(null);
          setRole(null);
          setProfile(null);
          setIsDevSession(false);
          setIsRoleSwitching(false);
          setCurrentProfileId(null);
          setCurrentUserId(null);
          setCurrentContractorId(null);
          setIsLoading(false);
        } finally {
          if (signOutActivation.current === activation) signOutActivation.current = null;
        }
      });
    },
  }), [currentContractorId, currentProfileId, currentUserId, devLoginOptions, isAuthRequired, isDevSession, isLoading, isRoleSwitching, profile, role, session, switchRole, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
