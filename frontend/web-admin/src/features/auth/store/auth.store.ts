/**
 * Authentication State Store
 *
 * Manages authentication contexts, JWT tokens persistence, identity fetching,
 * and credential validations using the Zustand state store.
 */

import { create } from 'zustand';
import apiClient from '@/services/api-client';
import Cookies from 'js-cookie';

interface User {
  id: string;
  email: string;
  fullName: string;
  roles: string[];
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string, mfaToken?: string) => Promise<void>;
  logout: () => void;
  fetchMe: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,

  login: async (email, password, mfaToken) => {
    set({ isLoading: true });
    try {
      const res = await apiClient.post('/auth/login', { email, password, mfaToken });
      const { accessToken, refreshToken, user } = res.data;
      
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      
      // Persists the access token in a cookie to authorize initial page loads during Server-Side Rendering (SSR).
      Cookies.set('accessToken', accessToken, { expires: 1 });

      set({ user, isAuthenticated: true, isLoading: false });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  logout: () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    Cookies.remove('accessToken');
    set({ user: null, isAuthenticated: false });
    if (typeof window !== 'undefined') window.location.href = '/login';
  },

  fetchMe: async () => {
    try {
      const token = localStorage.getItem('accessToken');
      if (!token) throw new Error('No token');
      
      const res = await apiClient.get('/auth/me');
      set({ user: res.data, isAuthenticated: true });
    } catch (error) {
      set({ user: null, isAuthenticated: false });
    }
  },
}));
