/**
 * Auth Service - JWT tokens, password hashing, session management
 */

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { AuthUser, RefreshToken, AuthAuditLog } from './models.js';

// ============ CONFIG ============

const JWT_SECRET = process.env.JWT_SECRET || 'dev-jwt-secret-change-in-production';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-in-production';
const JWT_ISSUER = process.env.JWT_ISSUER || 'gold-provenance';
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'gold-provenance-api';
const ACCESS_TOKEN_EXPIRY = process.env.ACCESS_TOKEN_EXPIRY || '15m';
const REFRESH_TOKEN_EXPIRY_DAYS = parseInt(process.env.REFRESH_TOKEN_EXPIRY_DAYS || '30', 10);
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);
const MAX_LOGIN_ATTEMPTS = parseInt(process.env.MAX_LOGIN_ATTEMPTS || '5', 10);
const LOCK_DURATION_MINUTES = parseInt(process.env.LOCK_DURATION_MINUTES || '15', 10);

// ============ PASSWORD HASHING ============

export async function hashPassword(plaintext) {
  return bcrypt.hash(plaintext, BCRYPT_ROUNDS);
}

export async function verifyPassword(plaintext, hash) {
  return bcrypt.compare(plaintext, hash);
}

// ============ PASSWORD POLICY ============

const COMMON_PASSWORDS = new Set([
  'password123456', 'qwerty123456', '123456789012', 'admin12345678',
  'letmein123456', 'welcome12345', 'password1234', 'changeme1234'
]);

export function validatePasswordPolicy(password) {
  const errors = [];
  if (!password || password.length < 12) {
    errors.push('Password must be at least 12 characters long');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one digit');
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    errors.push('Password is too common');
  }
  return errors;
}

// ============ JWT TOKENS ============

export function generateAccessToken(user) {
  return jwt.sign(
    {
      sub: user.userId,
      email: user.email,
      roles: user.roles,
      mustChangePassword: user.mustChangePassword || false,
    },
    JWT_SECRET,
    {
      expiresIn: ACCESS_TOKEN_EXPIRY,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      jwtid: crypto.randomUUID(),
    }
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, JWT_SECRET, {
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
}

export function generateRefreshToken(userId, family) {
  const token = crypto.randomBytes(48).toString('hex');
  return { token, family: family || crypto.randomUUID() };
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// ============ SESSION MANAGEMENT ============

export async function createRefreshSession(userId, rawToken, family, req) {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

  const session = new RefreshToken({
    userId,
    tokenHash: hashToken(rawToken),
    family,
    userAgent: req?.headers?.['user-agent'] || 'unknown',
    ipAddress: req?.ip || req?.connection?.remoteAddress || 'unknown',
    expiresAt,
  });
  await session.save();
  return session;
}

export async function rotateRefreshToken(oldRawToken, req) {
  const oldHash = hashToken(oldRawToken);
  const oldSession = await RefreshToken.findOne({ tokenHash: oldHash });

  if (!oldSession) {
    return { error: 'Invalid refresh token' };
  }

  // Check if already revoked => TOKEN REUSE DETECTED
  if (oldSession.revokedAt) {
    // Revoke entire family (all tokens in this refresh chain)
    await RefreshToken.updateMany(
      { family: oldSession.family },
      { $set: { revokedAt: new Date() } }
    );
    await logAuthEvent('TOKEN_REUSE_DETECTED', oldSession.userId, null, req, {
      family: oldSession.family,
    });
    return { error: 'Token reuse detected, all sessions revoked', reuse: true };
  }

  // Check expiry
  if (oldSession.expiresAt < new Date()) {
    return { error: 'Refresh token expired' };
  }

  // Revoke old token
  oldSession.revokedAt = new Date();

  // Generate new token in same family
  const { token: newRawToken } = generateRefreshToken(oldSession.userId, oldSession.family);
  const newSession = await createRefreshSession(
    oldSession.userId,
    newRawToken,
    oldSession.family,
    req
  );

  oldSession.replacedByTokenId = newSession.tokenId;
  await oldSession.save();

  // Get user
  const user = await AuthUser.findOne({ userId: oldSession.userId, deletedAt: null });
  if (!user || !user.isActive) {
    return { error: 'User not found or inactive' };
  }

  const accessToken = generateAccessToken(user);

  await logAuthEvent('TOKEN_REFRESH', user.userId, null, req);

  return { accessToken, refreshToken: newRawToken, user: user.toSafeJSON() };
}

export async function revokeSession(rawToken) {
  const tokenHash = hashToken(rawToken);
  await RefreshToken.updateOne({ tokenHash }, { $set: { revokedAt: new Date() } });
}

export async function revokeAllSessions(userId) {
  await RefreshToken.updateMany(
    { userId, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );
}

// ============ LOGIN / LOCKOUT ============

export async function attemptLogin(email, password, req) {
  const user = await AuthUser.findOne({ email: email.toLowerCase(), deletedAt: null });

  if (!user) {
    return { error: 'Invalid email or password' };
  }

  if (!user.isActive) {
    return { error: 'Account is deactivated. Contact an administrator.' };
  }

  // Check lockout
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const remaining = Math.ceil((user.lockedUntil - new Date()) / 60000);
    await logAuthEvent('LOGIN_FAILED', user.userId, null, req, { reason: 'account_locked' });
    return { error: `Account locked. Try again in ${remaining} minute(s).` };
  }

  // Verify password
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
    if (user.failedLoginAttempts >= MAX_LOGIN_ATTEMPTS) {
      user.lockedUntil = new Date(Date.now() + LOCK_DURATION_MINUTES * 60 * 1000);
      await logAuthEvent('ACCOUNT_LOCKED', user.userId, null, req, {
        attempts: user.failedLoginAttempts,
      });
    }
    await user.save();
    await logAuthEvent('LOGIN_FAILED', user.userId, null, req, {
      attempts: user.failedLoginAttempts,
    });
    return { error: 'Invalid email or password' };
  }

  // Success — reset attempts
  user.failedLoginAttempts = 0;
  user.lockedUntil = null;
  user.lastLoginAt = new Date();
  await user.save();

  // Generate tokens
  const accessToken = generateAccessToken(user);
  const { token: refreshTokenRaw, family } = generateRefreshToken(user.userId);
  await createRefreshSession(user.userId, refreshTokenRaw, family, req);

  await logAuthEvent('LOGIN_SUCCESS', user.userId, null, req);

  return {
    accessToken,
    refreshToken: refreshTokenRaw,
    user: user.toSafeJSON(),
  };
}

// ============ REGISTER ============

export async function registerUser({ email, password, username, firstName, lastName, defaultRole }) {
  // Check existing
  const existing = await AuthUser.findOne({ email: email.toLowerCase(), deletedAt: null });
  if (existing) {
    return { error: 'Email already registered' };
  }

  if (username) {
    const existingUsername = await AuthUser.findOne({ username, deletedAt: null });
    if (existingUsername) {
      return { error: 'Username already taken' };
    }
  }

  // Validate password policy
  const policyErrors = validatePasswordPolicy(password);
  if (policyErrors.length > 0) {
    return { error: policyErrors.join('. ') };
  }

  const passwordHash = await hashPassword(password);
  const role = defaultRole || process.env.DEFAULT_USER_ROLE || 'VIEWER';

  const user = new AuthUser({
    email: email.toLowerCase(),
    username,
    passwordHash,
    firstName,
    lastName,
    roles: [role],
    isActive: true,
    isEmailVerified: false,
  });

  await user.save();
  return { user: user.toSafeJSON() };
}

// ============ PASSWORD MANAGEMENT ============

export async function changePassword(userId, currentPassword, newPassword) {
  const user = await AuthUser.findOne({ userId, deletedAt: null });
  if (!user) return { error: 'User not found' };

  const valid = await verifyPassword(currentPassword, user.passwordHash);
  if (!valid) return { error: 'Current password is incorrect' };

  const policyErrors = validatePasswordPolicy(newPassword);
  if (policyErrors.length > 0) return { error: policyErrors.join('. ') };

  user.passwordHash = await hashPassword(newPassword);
  user.mustChangePassword = false;
  await user.save();

  // Revoke all refresh sessions for security
  await revokeAllSessions(userId);

  return { success: true };
}

export async function adminResetPassword(targetUserId, newPassword, adminUserId) {
  const target = await AuthUser.findOne({ userId: targetUserId, deletedAt: null });
  if (!target) return { error: 'User not found' };

  const policyErrors = validatePasswordPolicy(newPassword);
  if (policyErrors.length > 0) return { error: policyErrors.join('. ') };

  target.passwordHash = await hashPassword(newPassword);
  target.mustChangePassword = true;
  await target.save();

  await revokeAllSessions(targetUserId);
  await logAuthEvent('PASSWORD_RESET', adminUserId, targetUserId);

  return { success: true };
}

// ============ AUDIT LOGGING ============

export async function logAuthEvent(action, userId, targetUserId, req, details) {
  try {
    await AuthAuditLog.create({
      action,
      userId,
      targetUserId,
      ip: req?.ip || req?.connection?.remoteAddress,
      userAgent: req?.headers?.['user-agent'],
      details,
    });
  } catch (err) {
    console.error('Failed to write auth audit log:', err.message);
  }
}

// ============ USER MANAGEMENT ============

export async function getUsers({ page = 1, limit = 50, includeDeleted = false } = {}) {
  const filter = includeDeleted ? {} : { deletedAt: null };
  const users = await AuthUser.find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();
  const total = await AuthUser.countDocuments(filter);
  return {
    users: users.map(u => { delete u.passwordHash; delete u.__v; delete u._id; return u; }),
    total,
    page,
    pages: Math.ceil(total / limit),
  };
}

export async function getUserById(userId) {
  const user = await AuthUser.findOne({ userId, deletedAt: null });
  return user ? user.toSafeJSON() : null;
}

export async function updateUser(userId, updates) {
  const allowedFields = ['firstName', 'lastName', 'username', 'isActive', 'partyId'];
  const safeUpdates = {};
  for (const key of allowedFields) {
    if (updates[key] !== undefined) safeUpdates[key] = updates[key];
  }
  const user = await AuthUser.findOneAndUpdate(
    { userId, deletedAt: null },
    { $set: safeUpdates },
    { new: true }
  );
  return user ? user.toSafeJSON() : null;
}

export async function assignRole(targetUserId, roleName, adminUserId, req) {
  const validRoles = ['SUPERADMIN', 'ADMIN', 'ISSUER', 'AUDITOR', 'VIEWER', 'MINER', 'REFINER', 'ASSAYER', 'DEALER'];
  if (!validRoles.includes(roleName)) return { error: 'Invalid role' };

  // Prevent non-superadmins from assigning SUPERADMIN
  if (roleName === 'SUPERADMIN') {
    const admin = await AuthUser.findOne({ userId: adminUserId, deletedAt: null });
    if (!admin || !admin.roles.includes('SUPERADMIN')) {
      return { error: 'Only superadmins can assign SUPERADMIN role' };
    }
  }

  const user = await AuthUser.findOneAndUpdate(
    { userId: targetUserId, deletedAt: null },
    { $addToSet: { roles: roleName } },
    { new: true }
  );
  if (!user) return { error: 'User not found' };

  await logAuthEvent('ROLE_ASSIGNED', adminUserId, targetUserId, req, { role: roleName });
  return { user: user.toSafeJSON() };
}

export async function revokeRole(targetUserId, roleName, adminUserId, req) {
  // Prevent removing the last SUPERADMIN
  if (roleName === 'SUPERADMIN') {
    const superadmins = await AuthUser.countDocuments({
      roles: 'SUPERADMIN',
      deletedAt: null,
      isActive: true,
    });
    if (superadmins <= 1) {
      return { error: 'Cannot remove the last SUPERADMIN' };
    }
  }

  const user = await AuthUser.findOneAndUpdate(
    { userId: targetUserId, deletedAt: null },
    { $pull: { roles: roleName } },
    { new: true }
  );
  if (!user) return { error: 'User not found' };

  await logAuthEvent('ROLE_REVOKED', adminUserId, targetUserId, req, { role: roleName });
  return { user: user.toSafeJSON() };
}

export async function softDeleteUser(targetUserId, adminUserId, req) {
  // Prevent deleting last SUPERADMIN
  const target = await AuthUser.findOne({ userId: targetUserId, deletedAt: null });
  if (!target) return { error: 'User not found' };

  if (target.roles.includes('SUPERADMIN')) {
    const count = await AuthUser.countDocuments({ roles: 'SUPERADMIN', deletedAt: null, isActive: true });
    if (count <= 1) return { error: 'Cannot delete the last SUPERADMIN' };
  }

  target.deletedAt = new Date();
  target.isActive = false;
  await target.save();

  await revokeAllSessions(targetUserId);
  await logAuthEvent('USER_DELETED', adminUserId, targetUserId, req);

  return { success: true };
}
