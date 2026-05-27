/**
 * User Profile Page
 */

import { useAuth } from '../contexts/AuthContext';
import { User, Mail, Shield, Calendar, Building2 } from 'lucide-react';

export default function Profile() {
  const { user } = useAuth();

  if (!user) return null;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>My Profile</h1>
          <p className="subtitle">View your account information</p>
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <div style={{
            width: 80,
            height: 80,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--primary), var(--accent))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 32,
            fontWeight: 600,
            color: 'white',
          }}>
            {user.firstName?.[0] || user.email[0].toUpperCase()}
          </div>
          <div>
            <h2 style={{ fontSize: '1.5rem', marginBottom: 4 }}>
              {user.firstName && user.lastName 
                ? `${user.firstName} ${user.lastName}` 
                : user.email.split('@')[0]}
            </h2>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {user.roles.map((role) => (
                <span key={role} className="role-tag" style={{ fontSize: '0.75rem' }}>
                  {role}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="form-grid" style={{ gridTemplateColumns: '1fr' }}>
          <div className="info-row">
            <div className="info-label">
              <Mail size={16} />
              <span>Email</span>
            </div>
            <div className="info-value">{user.email}</div>
          </div>

          {user.username && (
            <div className="info-row">
              <div className="info-label">
                <User size={16} />
                <span>Username</span>
              </div>
              <div className="info-value">{user.username}</div>
            </div>
          )}

          <div className="info-row">
            <div className="info-label">
              <Shield size={16} />
              <span>Roles</span>
            </div>
            <div className="info-value">
              {user.roles.map((role) => (
                <span key={role} className="badge badge-primary" style={{ marginRight: 8 }}>
                  {role}
                </span>
              ))}
            </div>
          </div>

          <div className="info-row">
            <div className="info-label">
              <Calendar size={16} />
              <span>Account Created</span>
            </div>
            <div className="info-value">
              {new Date(user.createdAt).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </div>
          </div>

          {user.lastLoginAt && (
            <div className="info-row">
              <div className="info-label">
                <Calendar size={16} />
                <span>Last Login</span>
              </div>
              <div className="info-value">
                {new Date(user.lastLoginAt).toLocaleString('en-US', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
            </div>
          )}

          {user.partyId && (
            <div className="info-row">
              <div className="info-label">
                <Building2 size={16} />
                <span>Linked Party</span>
              </div>
              <div className="info-value">{user.partyId}</div>
            </div>
          )}

          <div className="info-row">
            <div className="info-label">
              <User size={16} />
              <span>Account Status</span>
            </div>
            <div className="info-value">
              <span className={`badge ${user.isActive ? 'badge-success' : 'badge-danger'}`}>
                {user.isActive ? 'Active' : 'Inactive'}
              </span>
              {user.isEmailVerified && (
                <span className="badge badge-info" style={{ marginLeft: 8 }}>
                  Email Verified
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h3 style={{ marginBottom: 16 }}>Role Permissions</h3>
        <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.8 }}>
          {user.roles.includes('SUPERADMIN') && (
            <div className="permission-item">
              <Shield size={16} style={{ color: 'var(--danger)' }} />
              <span><strong>SUPERADMIN:</strong> Full system access - manage users, roles, all resources</span>
            </div>
          )}
          {user.roles.includes('ADMIN') && (
            <div className="permission-item">
              <Shield size={16} style={{ color: 'var(--warning)' }} />
              <span><strong>ADMIN:</strong> Manage users and roles, full resource access</span>
            </div>
          )}
          {user.roles.includes('ISSUER') && (
            <div className="permission-item">
              <Shield size={16} style={{ color: 'var(--primary)' }} />
              <span><strong>ISSUER:</strong> Create and manage batches, documents, events</span>
            </div>
          )}
          {user.roles.includes('AUDITOR') && (
            <div className="permission-item">
              <Shield size={16} style={{ color: 'var(--accent)' }} />
              <span><strong>AUDITOR:</strong> View and verify all data, access audit logs</span>
            </div>
          )}
          {user.roles.includes('VIEWER') && (
            <div className="permission-item">
              <Shield size={16} style={{ color: 'var(--info)' }} />
              <span><strong>VIEWER:</strong> Read-only access to public data</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
