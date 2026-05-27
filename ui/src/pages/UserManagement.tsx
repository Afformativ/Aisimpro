/**
 * User Management Page — SUPERADMIN/ADMIN only
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { Users, Shield, UserPlus, Mail, Calendar, Loader } from 'lucide-react';
import type { AuthUser, UserRole } from '../types/auth';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('gp_access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchUsers() {
  const response = await fetch(`${API_BASE}/admin/users`, {
    headers: { ...getAuthHeader() },
  });
  if (!response.ok) throw new Error('Failed to fetch users');
  return response.json() as Promise<{ users: AuthUser[]; total: number }>;
}

async function assignRole(userId: string, role: UserRole) {
  const response = await fetch(`${API_BASE}/admin/users/${userId}/roles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify({ role }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to assign role');
  }
  return response.json();
}

async function revokeRole(userId: string, role: UserRole) {
  const response = await fetch(`${API_BASE}/admin/users/${userId}/roles/${role}`, {
    method: 'DELETE',
    headers: { ...getAuthHeader() },
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to revoke role');
  }
  return response.json();
}

const ALL_ROLES: UserRole[] = ['SUPERADMIN', 'ADMIN', 'MINER', 'REFINER', 'ASSAYER', 'DEALER', 'ISSUER', 'AUDITOR', 'VIEWER'];

export default function UserManagement() {
  const { user: currentUser, hasAnyRole } = useAuth();
  const queryClient = useQueryClient();
  const [selectedUser, setSelectedUser] = useState<AuthUser | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: fetchUsers,
  });

  const assignMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: UserRole }) =>
      assignRole(userId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setSelectedUser(null);
    },
  });

  const revokeMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: UserRole }) =>
      revokeRole(userId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setSelectedUser(null);
    },
  });

  if (!hasAnyRole('ADMIN', 'SUPERADMIN')) {
    return (
      <div className="page">
        <div className="card">
          <h2>Access Denied</h2>
          <p>You need ADMIN or SUPERADMIN role to access this page.</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="page">
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Loader size={32} className="spinner" />
          <p style={{ marginTop: 16 }}>Loading users...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>User Management</h1>
          <p className="subtitle">Manage user accounts and roles</p>
        </div>
      </div>

      <div className="card">
        <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
          <Users size={20} />
          <span style={{ fontWeight: 500 }}>
            {data?.total || 0} Total Users
          </span>
        </div>

        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Email</th>
                <th>Roles</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data?.users.map((user) => (
                <tr key={user.userId}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        background: 'var(--primary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 14,
                        fontWeight: 600,
                      }}>
                        {user.firstName?.[0] || user.email[0].toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 500 }}>
                          {user.firstName && user.lastName
                            ? `${user.firstName} ${user.lastName}`
                            : user.email.split('@')[0]}
                        </div>
                        {user.username && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                            @{user.username}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Mail size={14} />
                      {user.email}
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {user.roles.map((role) => (
                        <span key={role} className="role-tag">
                          {role}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>
                    <span className={`badge ${user.isActive ? 'badge-success' : 'badge-danger'}`}>
                      {user.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Calendar size={14} />
                      {new Date(user.createdAt).toLocaleDateString()}
                    </div>
                  </td>
                  <td>
                    {user.userId !== currentUser?.userId && (
                      <button
                        onClick={() => setSelectedUser(user)}
                        className="btn btn-sm btn-secondary"
                        style={{ padding: '4px 12px', fontSize: '0.85rem' }}
                      >
                        <Shield size={14} />
                        Manage Roles
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Role Management Modal */}
      {selectedUser && (
        <div className="modal-overlay" onClick={() => setSelectedUser(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Manage Roles: {selectedUser.email}</h2>
              <button onClick={() => setSelectedUser(null)} className="modal-close">×</button>
            </div>

            <div className="modal-body">
              <p style={{ marginBottom: 20, color: 'var(--text-muted)' }}>
                Click to add or remove roles. Changes are applied immediately.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {ALL_ROLES.map((role) => {
                  const hasRole = selectedUser.roles.includes(role);
                  const isLoading = assignMutation.isPending || revokeMutation.isPending;
                  const canModifySuperadmin = currentUser?.roles.includes('SUPERADMIN');

                  return (
                    <div
                      key={role}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: 12,
                        background: hasRole ? 'rgba(212, 175, 55, 0.1)' : 'var(--bg-dark)',
                        border: `1px solid ${hasRole ? 'var(--primary)' : 'var(--border)'}`,
                        borderRadius: 'var(--radius-sm)',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 500, marginBottom: 4 }}>{role}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                          {role === 'SUPERADMIN' && 'Full system access'}
                          {role === 'ADMIN' && 'User management + full on-chain access'}
                          {role === 'MINER' && 'Register raw ore extraction (on-chain)'}
                          {role === 'REFINER' && 'Smelt & refine ore into bars (on-chain)'}
                          {role === 'ASSAYER' && 'Assay & certify bars for market (on-chain)'}
                          {role === 'DEALER' && 'Transfer custody of products (on-chain)'}
                          {role === 'ISSUER' && 'Create batches & documents'}
                          {role === 'AUDITOR' && 'View & verify on-chain data'}
                          {role === 'VIEWER' && 'Read-only access'}
                        </div>
                      </div>

                      {(role !== 'SUPERADMIN' || canModifySuperadmin) && (
                        <button
                          onClick={() => {
                            if (hasRole) {
                              revokeMutation.mutate({ userId: selectedUser.userId, role });
                            } else {
                              assignMutation.mutate({ userId: selectedUser.userId, role });
                            }
                          }}
                          disabled={isLoading}
                          className={hasRole ? 'btn btn-sm btn-danger' : 'btn btn-sm btn-primary'}
                        >
                          {isLoading ? 'Processing...' : hasRole ? 'Remove' : 'Add'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {(assignMutation.isError || revokeMutation.isError) && (
                <div className="auth-error" style={{ marginTop: 16 }}>
                  {assignMutation.error?.message || revokeMutation.error?.message}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
