import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { tokenStore } from './storage';
import { setAuthLostHandler } from '../api/client';
import { auth as authApi, me as meApi } from '../api';
import { registerForPush } from '../push/registerPush';
import { SessionResponse, Me } from '../types';

type Status = 'loading' | 'signedOut' | 'needsOnboarding' | 'ready';

interface AuthState {
  status: Status;
  userId: string | null;
  me: Me | null;
  signIn: (session: SessionResponse) => Promise<void>;
  refreshMe: () => Promise<Me | null>;
  signOut: () => Promise<void>;
  completeOnboarding: () => void;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [userId, setUserId] = useState<string | null>(null);
  const [meData, setMeData] = useState<Me | null>(null);

  const signOut = useCallback(async () => {
    const refresh = await tokenStore.getRefresh();
    try {
      if (refresh) await authApi.logout(refresh);
    } catch {
      // ignore network errors on logout
    }
    await tokenStore.clear();
    setUserId(null);
    setMeData(null);
    setStatus('signedOut');
  }, []);

  // A failed token refresh forces sign-out.
  useEffect(() => {
    setAuthLostHandler(() => {
      void signOut();
    });
  }, [signOut]);

  const refreshMe = useCallback(async (): Promise<Me | null> => {
    try {
      const data = await meApi.get();
      setMeData(data);
      setUserId(data.user.id);
      setStatus(data.profile ? 'ready' : 'needsOnboarding');
      if (data.profile) void registerForPush(); // save push token once onboarded
      return data;
    } catch {
      return null;
    }
  }, []);

  // Bootstrap: if we have a token, load the user.
  useEffect(() => {
    (async () => {
      const access = await tokenStore.getAccess();
      if (!access) {
        setStatus('signedOut');
        return;
      }
      const data = await refreshMe();
      if (!data) {
        await tokenStore.clear();
        setStatus('signedOut');
      }
    })();
  }, [refreshMe]);

  const signIn = useCallback(async (session: SessionResponse) => {
    await tokenStore.save(session.accessToken, session.refreshToken);
    setUserId(session.user_id);
    if (session.needs_onboarding) {
      setStatus('needsOnboarding');
    } else {
      await refreshMe();
    }
  }, [refreshMe]);

  const completeOnboarding = useCallback(() => {
    setStatus('ready');
  }, []);

  const value = useMemo<AuthState>(
    () => ({ status, userId, me: meData, signIn, refreshMe, signOut, completeOnboarding }),
    [status, userId, meData, signIn, refreshMe, signOut, completeOnboarding],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
