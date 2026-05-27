/**
 * Change Password Page — for mustChangePassword flow
 */

import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { changePassword } from '../services/authApi';
import { Key, AlertCircle } from 'lucide-react';

export default function ChangePassword() {
  const { user, accessToken, logout } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (form.newPassword !== form.confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    if (!accessToken) {
      setError('Not authenticated');
      return;
    }

    setLoading(true);
    try {
      await changePassword(form.currentPassword, form.newPassword, accessToken);
      setSuccess('Password changed successfully! Logging out...');
      
      // Log out after 2 seconds so user sees success message
      setTimeout(async () => {
        await logout();
        navigate('/login');
      }, 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Password change failed');
    } finally {
      setLoading(false);
    }
  };

  const update = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  return (
    <div className="auth-page">
      <div className="auth-card" style={{ maxWidth: '500px' }}>
        <div className="auth-header">
          <Key size={40} style={{ color: 'var(--warning)' }} />
          <h1>Password Change Required</h1>
          <p style={{ color: 'var(--text-muted)', marginTop: 8 }}>
            {user?.email && `Hello, ${user.email}`}
          </p>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-dim)', marginTop: 8 }}>
            For security reasons, you must change your password before accessing the application.
          </p>
        </div>

        {error && (
          <div className="auth-error">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        {success && (
          <div style={{
            background: 'rgba(16, 185, 129, 0.12)',
            border: '1px solid var(--success)',
            color: 'var(--success)',
            padding: '10px 14px',
            borderRadius: 'var(--radius-sm)',
            marginBottom: 16,
            fontSize: '0.875rem',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <Key size={16} />
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="currentPassword">Current Password *</label>
            <input
              id="currentPassword"
              type="password"
              value={form.currentPassword}
              onChange={update('currentPassword')}
              placeholder="Your current password"
              required
              autoComplete="current-password"
              autoFocus
              disabled={loading || !!success}
            />
          </div>

          <div className="form-group">
            <label htmlFor="newPassword">New Password *</label>
            <input
              id="newPassword"
              type="password"
              value={form.newPassword}
              onChange={update('newPassword')}
              placeholder="Min 12 chars, upper+lower+digit+special"
              required
              autoComplete="new-password"
              disabled={loading || !!success}
            />
            <small style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: 4, display: 'block' }}>
              Must be at least 12 characters with uppercase, lowercase, digit, and special character
            </small>
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm New Password *</label>
            <input
              id="confirmPassword"
              type="password"
              value={form.confirmPassword}
              onChange={update('confirmPassword')}
              placeholder="Repeat new password"
              required
              autoComplete="new-password"
              disabled={loading || !!success}
            />
          </div>

          <button 
            type="submit" 
            className="btn btn-primary btn-full" 
            disabled={loading || !!success}
          >
            <Key size={18} />
            {loading ? 'Changing Password...' : 'Change Password'}
          </button>
        </form>

        <div className="auth-footer" style={{ marginTop: 16 }}>
          <button
            onClick={logout}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-dim)',
              cursor: 'pointer',
              fontSize: '0.875rem',
              textDecoration: 'underline',
            }}
            disabled={loading || !!success}
          >
            Sign out instead
          </button>
        </div>
      </div>
    </div>
  );
}
