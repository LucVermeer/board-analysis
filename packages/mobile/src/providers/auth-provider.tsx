import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { useRouter, useSegments } from 'expo-router';
import { getAuthToken } from '../lib/auth-store';
import { startSignIn, signOut as authSignOut, type AuthProvider as AuthProviderType } from '../lib/auth';
import { resetHttpClient } from '../lib/graphql/client';
import { disposeWsClient } from '../lib/graphql/ws-client';

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
  const router = useRouter();
  const segments = useSegments();

  const checkAuth = useCallback(async () => {
    const token = await getAuthToken();
    setIsAuthenticated(!!token);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Route protection
  useEffect(() => {
    if (isLoading) return;
    const inAuthGroup = segments[0] === 'auth';

    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/auth/login');
    } else if (isAuthenticated && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, isLoading, segments, router]);

  const signIn = useCallback(async (provider: AuthProviderType) => {
    await startSignIn(provider);
  }, []);

  const signOut = useCallback(async () => {
    await authSignOut();
    resetHttpClient();
    disposeWsClient();
    setIsAuthenticated(false);
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, signIn, signOut, refreshAuthState: checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
}
