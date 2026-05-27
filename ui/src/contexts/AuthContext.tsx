/**
 * AuthContext — global auth state, login/logout, silent refresh, token injection.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import type { AuthUser, UserRole } from '../types/auth';
import * as authApi from '../services/authApi';

interface AuthContextType {
  user: AuthUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: {
    email: string;
    password: string;
    username?: string;
    firstName?: string;
    lastName?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  hasRole: (...roles: UserRole[]) => boolean;
  hasAnyRole: (...roles: UserRole[]) => boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

const TOKEN_KEY = 'gp_access_token';
const REFRESH_KEY = 'gp_refresh_token';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(() =>
    localStorage.getItem(TOKEN_KEY),
  );
  const [isLoading, setIsLoading] = useState(true);

  // Persist tokens
  const saveTokens = useCallback((access: string, refresh: string) => {
    localStorage.setItem(TOKEN_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
    setAccessToken(access);
  }, []);

  const clearTokens = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    setAccessToken(null);
    setUser(null);
  }, []);

  // Try to restore session on mount
  useEffect(() => {
    const restore = async () => {
      const storedAccess = localStorage.getItem(TOKEN_KEY);
      const storedRefresh = localStorage.getItem(REFRESH_KEY);

      if (!storedAccess && !storedRefresh) {
        setIsLoading(false);
        return;
      }

      // Try to get current user with access token
      if (storedAccess) {
        try {
          const { user: me } = await authApi.getMe(storedAccess);
          setUser(me);
          setIsLoading(false);
          return;
        } catch {
          // Access token probably expired, try refresh
        }
      }

      // Try refresh
      if (storedRefresh) {
        try {
          const res = await authApi.refreshToken(storedRefresh);
          saveTokens(res.accessToken, res.refreshToken);
          setUser(res.user);
        } catch {
          clearTokens();
        }
      } else {
        clearTokens();
      }

      setIsLoading(false);
    };

    restore();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Silent refresh — refresh access token every 13 minutes
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(async () => {
      const refresh = localStorage.getItem(REFRESH_KEY);
      if (!refresh) return;
      try {
        const res = await authApi.refreshToken(refresh);
        saveTokens(res.accessToken, res.refreshToken);
      } catch {
        clearTokens();
      }
    }, 13 * 60 * 1000); // 13 min

    return () => clearInterval(interval);
  }, [user, saveTokens, clearTokens]);

  const loginFn = useCallback(
    async (email: string, password: string) => {
      const res = await authApi.login(email, password);
      saveTokens(res.accessToken, res.refreshToken);
      setUser(res.user);
      
      // If user must change password, they'll be redirected by ProtectedRoute
      // No need to handle here
    },
    [saveTokens],
  );

  const registerFn = useCallback(
    async (data: {
      email: string;
      password: string;
      username?: string;
      firstName?: string;
      lastName?: string;
    }) => {
      await authApi.register(data);
      // Auto-login after registration
      await loginFn(data.email, data.password);
    },
    [loginFn],
  );

  const logoutFn = useCallback(async () => {
    const refresh = localStorage.getItem(REFRESH_KEY);
    const access = localStorage.getItem(TOKEN_KEY);
    if (refresh && access) {
      try {
        await authApi.logout(refresh, access);
      } catch {
        // Ignore — best-effort
      }
    }
    clearTokens();
  }, [clearTokens]);

  const hasRole = useCallback(
    (...roles: UserRole[]) => {
      if (!user) return false;
      if (user.roles.includes('SUPERADMIN')) return true;
      return roles.every((r) => user.roles.includes(r));
    },
    [user],
  );

  const hasAnyRole = useCallback(
    (...roles: UserRole[]) => {
      if (!user) return false;
      if (user.roles.includes('SUPERADMIN')) return true;
      return roles.some((r) => user.roles.includes(r));
    },
    [user],
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        isAuthenticated: !!user,
        isLoading,
        login: loginFn,
        register: registerFn,
        logout: logoutFn,
        hasRole,
        hasAnyRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
