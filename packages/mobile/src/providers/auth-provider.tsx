import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import { AppState } from 'react-native';
import type { WebBrowserAuthSessionResult } from 'expo-web-browser';
import { useSegments, Redirect } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { SHARED_EVENTS } from '@boardsesh/analytics';
import { getAuthToken, isTokenExpiringSoon } from '../lib/auth-store';
import {
  startSignIn,
  signOut as authSignOut,
  signInWithCredentials as authSignInWithCredentials,
  type AuthProvider as AuthProviderType,
  type CredentialsSignInResult,
} from '../lib/auth';
import { reset as resetAnalytics, track } from '../lib/analytics';
import { resetHttpClient } from '../lib/graphql/client';
import { disposeWsClient } from '../lib/graphql/ws-client';
import { clearStoredSessionId } from '../lib/session-store';
import { clearStoredActiveBoard } from '../lib/active-board-store';
import { ACTIVE_BOARD_QUERY_KEY } from '../lib/graphql/use-active-board';

type AuthState = {
  isAuthenticated: boolean;
  isLoading: boolean;
  signIn: (provider: AuthProviderType) => Promise<WebBrowserAuthSessionResult>;
  signInWithCredentials: (email: string, password: string) => Promise<CredentialsSignInResult>;
  signOut: () => Promise<void>;
  refreshAuthState: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}

type AuthProviderProps = {
  children: ReactNode;
  onReady?: () => void;
};

export function AuthProvider({ children, onReady }: AuthProviderProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const segments = useSegments();
  const queryClient = useQueryClient();
  const authStateRef = useRef({ isAuthenticated: false, isLoading: true });
  authStateRef.current = { isAuthenticated, isLoading };

  const resetAnalyticsForSignedOutTransition = useCallback(() => {
    const authState = authStateRef.current;
    if (authState.isLoading || authState.isAuthenticated) {
      resetAnalytics();
    }
  }, []);

  const checkAuth = useCallback(async () => {
    const token = await getAuthToken();
    if (!token) {
      resetAnalyticsForSignedOutTransition();
      setIsAuthenticated(false);
      setIsLoading(false);
      return;
    }
    const expiring = await isTokenExpiringSoon();
    if (expiring) {
      const { ensureFreshToken } = await import('../lib/auth-interceptor');
      const refreshed = await ensureFreshToken();
      if (!refreshed) resetAnalyticsForSignedOutTransition();
      setIsAuthenticated(refreshed);
    } else {
      setIsAuthenticated(true);
    }
    setIsLoading(false);
  }, [resetAnalyticsForSignedOutTransition]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        checkAuth();
      }
    });
    return () => subscription.remove();
  }, [checkAuth]);

  const signIn = useCallback((provider: AuthProviderType) => {
    return startSignIn(provider);
  }, []);

  const signInWithCredentials = useCallback(
    async (email: string, password: string): Promise<CredentialsSignInResult> => {
      const result = await authSignInWithCredentials(email, password);
      if (result.success) {
        await checkAuth();
      }
      return result;
    },
    [checkAuth],
  );

  const signOut = useCallback(async () => {
    track(SHARED_EVENTS.Logout, { method: 'manual' });
    await authSignOut();
    resetAnalytics();
    await Promise.all([clearStoredSessionId(), clearStoredActiveBoard()]);
    // Drop the in-memory active-board cache too. It's `staleTime: Infinity`, so
    // without this the next user to sign in on a shared device would inherit the
    // previous user's board until a manual switch.
    queryClient.removeQueries({ queryKey: ACTIVE_BOARD_QUERY_KEY });
    resetHttpClient();
    disposeWsClient();
    // Drop every cached query so the next signed-in user doesn't inherit the
    // previous user's data. Query keys don't currently include a user/token
    // dimension, and individual keys' staleTime (e.g. userPlaylists' 5 min)
    // would otherwise paper over the cross-user leak. Doing this at the auth
    // boundary keeps the rest of the hooks simple.
    queryClient.clear();
    setIsAuthenticated(false);
  }, [queryClient]);

  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    if (!isLoading) {
      onReadyRef.current?.();
    }
  }, [isLoading]);

  if (isLoading) {
    return null;
  }

  const inAuthGroup = segments[0] === 'auth';

  if (!isAuthenticated && !inAuthGroup) {
    return <Redirect href="/auth/login" />;
  }
  if (isAuthenticated && inAuthGroup) {
    return <Redirect href="/(tabs)/climbs" />;
  }

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        signIn,
        signInWithCredentials,
        signOut,
        refreshAuthState: checkAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
