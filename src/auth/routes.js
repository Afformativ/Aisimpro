/**
 * Auth API Routes — register, login, refresh, logout, password management
 */

import { Router } from 'express';
import {
  attemptLogin,
  registerUser,
  rotateRefreshToken,
  revokeSession,
  revokeAllSessions,
  changePassword,
  logAuthEvent,
  getUserById,
} from './service.js';
import { requireAuth } from './guards.js';

const router = Router();

// ============ PUBLIC ROUTES ============

/**
 * POST /api/auth/register
 * Body: { email, password, username?, firstName?, lastName? }
 */
router.post('/register', async (req, res) => {
  try {
    const { email, password, username, firstName, lastName } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const result = await registerUser({ email, password, username, firstName, lastName });
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }

    await logAuthEvent('REGISTER', result.user.userId, null, req);

    return res.status(201).json({
      message: 'Registration successful',
      user: result.user,
    });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ error: 'Registration failed' });
  }
});

/**
 * POST /api/auth/login
 * Body: { email, password }
 * Returns: { accessToken, refreshToken, user }
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const result = await attemptLogin(email, password, req);
    if (result.error) {
      return res.status(401).json({ error: result.error });
    }

    // Set refresh token as httpOnly cookie + return in body (client can choose)
    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      path: '/api/auth',
    });

    return res.json({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user,
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * POST /api/auth/refresh
 * Body: { refreshToken } or from cookie
 * Returns: { accessToken, refreshToken, user }
 */
router.post('/refresh', async (req, res) => {
  try {
    const rawToken = req.body.refreshToken || req.cookies?.refreshToken;
    if (!rawToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    const result = await rotateRefreshToken(rawToken, req);
    if (result.error) {
      // Clear cookie on error
      res.clearCookie('refreshToken', { path: '/api/auth' });
      const status = result.reuse ? 403 : 401;
      return res.status(status).json({ error: result.error });
    }

    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/api/auth',
    });

    return res.json({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user,
    });
  } catch (err) {
    console.error('Refresh error:', err);
    return res.status(500).json({ error: 'Token refresh failed' });
  }
});

/**
 * POST /api/auth/logout — revoke current session
 * Body: { refreshToken } or from cookie
 */
router.post('/logout', requireAuth, async (req, res) => {
  try {
    const rawToken = req.body.refreshToken || req.cookies?.refreshToken;
    if (rawToken) {
      await revokeSession(rawToken);
    }

    res.clearCookie('refreshToken', { path: '/api/auth' });
    await logAuthEvent('LOGOUT', req.user.sub, null, req);

    return res.json({ message: 'Logged out' });
  } catch (err) {
    console.error('Logout error:', err);
    return res.status(500).json({ error: 'Logout failed' });
  }
});

/**
 * POST /api/auth/logout-all — revoke all sessions for current user
 */
router.post('/logout-all', requireAuth, async (req, res) => {
  try {
    await revokeAllSessions(req.user.sub);
    res.clearCookie('refreshToken', { path: '/api/auth' });
    await logAuthEvent('LOGOUT_ALL', req.user.sub, null, req);

    return res.json({ message: 'All sessions revoked' });
  } catch (err) {
    console.error('Logout-all error:', err);
    return res.status(500).json({ error: 'Failed to revoke all sessions' });
  }
});

// ============ PROTECTED ROUTES ============

/**
 * GET /api/auth/me — current user profile
 */
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await getUserById(req.user.sub);
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json({ user });
  } catch (err) {
    console.error('Get profile error:', err);
    return res.status(500).json({ error: 'Failed to get profile' });
  }
});

/**
 * POST /api/auth/change-password
 * Body: { currentPassword, newPassword }
 */
router.post('/change-password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new passwords are required' });
    }

    const result = await changePassword(req.user.sub, currentPassword, newPassword);
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }

    await logAuthEvent('PASSWORD_CHANGED', req.user.sub, null, req);
    res.clearCookie('refreshToken', { path: '/api/auth' });

    return res.json({ message: 'Password changed. Please log in again.' });
  } catch (err) {
    console.error('Change password error:', err);
    return res.status(500).json({ error: 'Password change failed' });
  }
});

export default router;
