// Auth Types

export type UserRole = 'SUPERADMIN' | 'ADMIN' | 'ISSUER' | 'AUDITOR' | 'VIEWER' | 'MINER' | 'REFINER' | 'ASSAYER' | 'DEALER';

export interface AuthUser {
  userId: string;
  email: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  roles: UserRole[];
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt?: string;
  partyId?: string;
  createdAt: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export interface RegisterResponse {
  message: string;
  user: AuthUser;
}

export interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}
