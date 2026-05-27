// Auth API client

import type { AuthUser, LoginResponse, RegisterResponse } from '../types/auth';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

async function authFetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include', // send cookies for refresh token
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

export const login = (email: string, password: string) =>
  authFetch<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

export const register = (data: {
  email: string;
  password: string;
  username?: string;
  firstName?: string;
  lastName?: string;
}) =>
  authFetch<RegisterResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const refreshToken = (token: string) =>
  authFetch<LoginResponse>('/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refreshToken: token }),
  });

export const logout = (token: string, accessToken: string) =>
  authFetch<{ message: string }>('/auth/logout', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ refreshToken: token }),
  });

export const logoutAll = (accessToken: string) =>
  authFetch<{ message: string }>('/auth/logout-all', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  });

export const getMe = (accessToken: string) =>
  authFetch<{ user: AuthUser }>('/auth/me', {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  });

export const changePassword = (
  currentPassword: string,
  newPassword: string,
  accessToken: string,
) =>
  authFetch<{ message: string }>('/auth/change-password', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
