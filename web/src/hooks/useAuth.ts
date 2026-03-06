import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';
import React from 'react';
import {
  getToken as readToken,
  setToken as writeToken,
  clearToken as removeToken,
  isAuthenticated as checkAuth,
} from '../lib/auth';
import { pair as apiPair, getPublicHealth } from '../lib/api';

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

export interface AuthState {
  /** The current bearer token, or null if not authenticated. */
  token: string | null;
  /** Whether the user is currently authenticated. */
  isAuthenticated: boolean;
  /** True while the initial auth check is in progress. */
  loading: boolean;
  /** Pair with the agent using a pairing code. Stores the token on success. */
  pair: (code: string) => Promise<void>;
  /** Clear the stored token and sign out. */
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [token, setTokenState] = useState<string | null>(readToken);
  const [authenticated, setAuthenticated] = useState<boolean>(checkAuth);
  const [loading, setLoading] = useState<boolean>(!checkAuth());

  // On mount: check if server requires pairing at all
  useEffect(() => {
    let cancelled = false;
    
    // Always check server's require_pairing setting first
    getPublicHealth()
      .then((health) => {
        if (cancelled) return;
        if (!health.require_pairing) {
          // Server doesn't require pairing, allow access without token
          setAuthenticated(true);
        } else if (checkAuth()) {
          // Server requires pairing and we have a token
          setAuthenticated(true);
        }
      })
      .catch(() => {
        // health endpoint unreachable — fall back to checking local token
        if (!cancelled && checkAuth()) {
          setAuthenticated(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep state in sync if localStorage is changed in another tab
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === 'zeroclaw_token') {
        const t = readToken();
        setTokenState(t);
        setAuthenticated(t !== null && t.length > 0);
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  const pair = useCallback(async (code: string): Promise<void> => {
    const { token: newToken } = await apiPair(code);
    writeToken(newToken);
    setTokenState(newToken);
    setAuthenticated(true);
  }, []);

  const logout = useCallback((): void => {
    removeToken();
    setTokenState(null);
    setAuthenticated(false);
  }, []);

  const value: AuthState = {
    token,
    isAuthenticated: authenticated,
    loading,
    pair,
    logout,
  };

  return React.createElement(AuthContext.Provider, { value }, children);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Access the authentication state from any component inside `<AuthProvider>`.
 * Throws if used outside the provider.
 */
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an <AuthProvider>');
  }
  return ctx;
}
