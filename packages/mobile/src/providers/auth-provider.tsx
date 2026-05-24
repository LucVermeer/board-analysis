import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { useSegments, Redirect } from 'expo-router';
import { getAuthToken, isTokenExpiringSoon } from '../lib/auth-store';
import { startSignIn, signOut as authSignOut, type AuthProvider as AuthProviderType } from '../lib/auth';
import { resetHttpClient } from '../lib/graphql/client';
import { disposeWsClient } from '../lib/graphql/ws-client';
import { clearStoredSessionId } from '../lib/session-store';
import { clearStoredBoardConfig } from '../lib/board-store';

type AuthState = {
  isAuthenticated: boolean;
  isLoading: boolean;
  signIn: (provider: AuthProviderType) => Promise<void>;
  signOut: () => Promise<void>;
  refreshAuthState: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const segments = useSegments();

  const checkAuth = useCallback(async () => {
    const token = await getAuthToken();
    if (!token) {
      setIsAuthenticated(false);
      setIsLoading(false);
      return;
    }
    const expiring = await isTokenExpiringSoon();
    if (expiring) {
      const { ensureFreshToken } = await import('../lib/auth-interceptor');
      const refreshed = await ensureFreshToken();
      setIsAuthenticated(refreshed);
    } else {
      setIsAuthenticated(true);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const signIn = useCallback(async (provider: AuthProviderType) => {
    await startSignIn(provider);
  }, []);

  const signOut = useCallback(async () => {
    await authSignOut();
    await Promise.all([clearStoredSessionId(), clearStoredBoardConfig()]);
    resetHttpClient();
    disposeWsClient();
    setIsAuthenticated(false);
  }, []);

  const inAuthGroup = segments[0] === 'auth';

  if (!isLoading && !isAuthenticated && !inAuthGroup) {
    return <Redirect href="/auth/login" />;
  }
  if (!isLoading && isAuthenticated && inAuthGroup) {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, signIn, signOut, refreshAuthState: checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
}
