/**
 * Auth Middleware — requireAuth, requireRoles, requireAnyRole
 */

import { verifyAccessToken } from './service.js';

const AUTH_ENABLED = process.env.AUTH_ENABLED !== 'false';
const RBAC_ENABLED = process.env.RBAC_ENABLED !== 'false';

/**
 * Middleware: verifies JWT access token from Authorization header.
 * Attaches req.user = { sub, email, roles, mustChangePassword }.
 * When AUTH_ENABLED=false, injects a synthetic superadmin user and passes through.
 */
export function requireAuth(req, res, next) {
  // Feature flag bypass
  if (!AUTH_ENABLED) {
    req.user = {
      sub: 'system',
      email: 'system@localhost',
      roles: ['SUPERADMIN'],
      mustChangePassword: false,
    };
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = authHeader.slice(7);
  try {
    const payload = verifyAccessToken(token);
    req.user = payload; // { sub, email, roles, mustChangePassword, iat, exp, jti, ... }
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Access token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Invalid access token' });
  }
}

/**
 * Middleware factory: requires the user to have ALL of the specified roles.
 * Usage: requireRoles('ADMIN', 'ISSUER')
 */
export function requireRoles(...roles) {
  return (req, res, next) => {
    if (!RBAC_ENABLED) return next();

    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // SUPERADMIN bypasses all role checks
    if (req.user.roles.includes('SUPERADMIN')) return next();

    const hasAll = roles.every(r => req.user.roles.includes(r));
    if (!hasAll) {
      return res.status(403).json({
        error: 'Forbidden — insufficient role',
        required: roles,
        current: req.user.roles,
      });
    }
    next();
  };
}

/**
 * Middleware factory: requires the user to have at least ONE of the specified roles.
 * Usage: requireAnyRole('ADMIN', 'ISSUER')
 */
export function requireAnyRole(...roles) {
  return (req, res, next) => {
    if (!RBAC_ENABLED) return next();

    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // SUPERADMIN bypasses all role checks
    if (req.user.roles.includes('SUPERADMIN')) return next();

    const hasAny = roles.some(r => req.user.roles.includes(r));
    if (!hasAny) {
      return res.status(403).json({
        error: 'Forbidden — insufficient role',
        requiredAny: roles,
        current: req.user.roles,
      });
    }
    next();
  };
}

/**
 * Middleware: blocks all requests except password-change when mustChangePassword=true.
 */
export function enforcePasswordChange(req, res, next) {
  if (!AUTH_ENABLED) return next();

  if (
    req.user?.mustChangePassword &&
    req.path !== '/api/auth/change-password' &&
    req.path !== '/api/auth/me' &&
    req.method !== 'OPTIONS'
  ) {
    return res.status(403).json({
      error: 'Password change required before accessing other resources',
      code: 'MUST_CHANGE_PASSWORD',
    });
  }
  next();
}
