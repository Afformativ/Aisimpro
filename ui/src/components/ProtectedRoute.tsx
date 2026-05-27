/**
 * ProtectedRoute — wraps routes that require authentication + optional role check.
 */

import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { UserRole } from '../types/auth';

interface Props {
  children: React.ReactNode;
  roles?: UserRole[];
}

export default function ProtectedRoute({ children, roles }: Props) {
  const { isAuthenticated, isLoading, hasAnyRole, user } = useAuth();

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div>Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Redirect to change password if required
  if (user?.mustChangePassword) {
    return <Navigate to="/change-password" replace />;
  }

  if (roles && roles.length > 0 && !hasAnyRole(...roles)) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <h2>403 — Forbidden</h2>
        <p>You do not have permission to access this page.</p>
      </div>
    );
  }

  return <>{children}</>;
}
