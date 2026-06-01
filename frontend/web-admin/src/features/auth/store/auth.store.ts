/**
 * Authentication State Store
 *
 * Manages authentication contexts, JWT tokens persistence, identity fetching,
 * and credential validations using the Zustand state store.
 *
 * isCheckingAuth: starts true, set to false after initial auth check resolves.
 * This prevents the dashboard layout from seeing isAuthenticated=false during
 * the initial async token verification and incorrectly redirecting to /login.
 */

import { create } from 'zustand';
import apiClient from '@/services/api-client';
import Cookies from 'js-cookie';

interface User {
  id: string;
  email: string;
  fullName: string;
  roles: string[];
  stationId?: string | null;
  stationIds?: string[];
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isCheckingAuth: boolean;
  login: (email: string, password: string, mfaToken?: string) => Promise<void>;
  logout: () => void;
  fetchMe: () => Promise<void>;
}

/** Decode user info from JWT payload without verifying signature (client-side only). */
function decodeJwtPayload(token: string): (Partial<User> & { exp?: number }) | null {
  try {
    const base64Url = token.split('.')[1];
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    );
    const payload = JSON.parse(jsonPayload);
    return {
      id: payload.sub,
      email: payload.email,
      fullName: payload.fullName ?? payload.full_name ?? payload.name ?? payload.email,
      roles: payload.roles ?? (payload.role ? [payload.role] : []),
      stationId: payload.stationId ?? null,
      stationIds: payload.stationIds ?? [],
      exp: payload.exp,
    };
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  isCheckingAuth: true,

  login: async (email, password, mfaToken) => {
    set({ isLoading: true });
    try {
      const res = await apiClient.post('/auth/login', { email, password, mfaToken });
      const { accessToken, refreshToken } = res.data;

      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);

      // Persist access token in a cookie for SSR page loads.
      Cookies.set('accessToken', accessToken, { expires: 1 });

      // Decode user info from JWT payload to avoid an extra /auth/me round-trip.
      const decoded = decodeJwtPayload(accessToken);
      const user: User = {
        id: decoded?.id ?? '',
        email: decoded?.email ?? email,
        fullName: decoded?.fullName ?? email,
        roles: decoded?.roles ?? [],
        stationId: decoded?.stationId ?? null,
        stationIds: decoded?.stationIds ?? [],
      };

      set({ user, isAuthenticated: true, isLoading: false, isCheckingAuth: false });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  logout: () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    Cookies.remove('accessToken');
    set({ user: null, isAuthenticated: false, isCheckingAuth: false });
    if (typeof window !== 'undefined') window.location.href = '/login';
  },

  fetchMe: async () => {
    set({ isCheckingAuth: true });
    try {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        set({ user: null, isAuthenticated: false, isCheckingAuth: false });
        return;
      }

      // First try to decode from stored token (instant if token is still valid).
      const decoded = decodeJwtPayload(token);
      const isExpired = decoded?.exp ? decoded.exp * 1000 < Date.now() : false;
      if (decoded?.id && !isExpired) {
        set({
          user: {
            id: decoded.id,
            email: decoded.email ?? '',
            fullName: decoded.fullName ?? decoded.email ?? '',
            roles: decoded.roles ?? [],
            stationId: decoded.stationId ?? null,
            stationIds: decoded.stationIds ?? [],
          },
          isAuthenticated: true,
          isCheckingAuth: false,
        });
        return;
      }

      // Fallback: call /auth/me for the full user object (triggers token refresh interceptor if expired but refresh token exists).
      const res = await apiClient.get('/auth/me');
      set({ user: res.data, isAuthenticated: true, isCheckingAuth: false });
    } catch {
      set({ user: null, isAuthenticated: false, isCheckingAuth: false });
    }
  },
}));
