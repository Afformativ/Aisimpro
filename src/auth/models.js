/**
 * Auth Models - Mongoose schemas for Users, Roles, RefreshTokens
 */

import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

// ============ ROLE SCHEMA ============

const RoleSchema = new mongoose.Schema({
  roleId: { type: String, required: true, unique: true, default: () => uuidv4() },
  name: {
    type: String,
    required: true,
    unique: true,
    enum: ['SUPERADMIN', 'ADMIN', 'ISSUER', 'AUDITOR', 'VIEWER', 'MINER', 'REFINER', 'ASSAYER', 'DEALER']
  },
  description: { type: String }
}, { timestamps: true });

// ============ USER SCHEMA ============

const UserSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true, default: () => uuidv4() },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  username: { type: String, unique: true, sparse: true, trim: true },
  passwordHash: { type: String, required: true },
  firstName: { type: String, trim: true },
  lastName: { type: String, trim: true },
  roles: [{ type: String, enum: ['SUPERADMIN', 'ADMIN', 'ISSUER', 'AUDITOR', 'VIEWER', 'MINER', 'REFINER', 'ASSAYER', 'DEALER'] }],
  isEmailVerified: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  mustChangePassword: { type: Boolean, default: false },
  lastLoginAt: { type: Date },
  failedLoginAttempts: { type: Number, default: 0 },
  lockedUntil: { type: Date },
  // Link to existing Party entity (optional)
  partyId: { type: String, ref: 'Party' },
  deletedAt: { type: Date, default: null }
}, { timestamps: true });

// Index for soft-delete queries
UserSchema.index({ deletedAt: 1 });
UserSchema.index({ email: 1, deletedAt: 1 });

// Never return password hash in JSON
UserSchema.methods.toSafeJSON = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  delete obj.__v;
  delete obj._id;
  return obj;
};

// ============ REFRESH TOKEN SCHEMA ============

const RefreshTokenSchema = new mongoose.Schema({
  tokenId: { type: String, required: true, unique: true, default: () => uuidv4() },
  userId: { type: String, required: true, ref: 'AuthUser', index: true },
  tokenHash: { type: String, required: true },
  family: { type: String, required: true, index: true }, // rotation family
  userAgent: { type: String },
  ipAddress: { type: String },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date, default: null },
  replacedByTokenId: { type: String, default: null }
}, { timestamps: true });

RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// ============ AUTH AUDIT LOG SCHEMA ============

const AuthAuditLogSchema = new mongoose.Schema({
  action: {
    type: String,
    required: true,
    enum: [
      'REGISTER', 'LOGIN_SUCCESS', 'LOGIN_FAILED',
      'LOGOUT', 'LOGOUT_ALL', 'TOKEN_REFRESH',
      'TOKEN_REUSE_DETECTED', 'PASSWORD_CHANGED', 'PASSWORD_RESET',
      'ROLE_ASSIGNED', 'ROLE_REVOKED', 'USER_ACTIVATED',
      'USER_DEACTIVATED', 'USER_DELETED', 'ACCOUNT_LOCKED',
      'BOOTSTRAP_SUPERADMIN', 'FORCE_PASSWORD_CHANGE'
    ]
  },
  userId: { type: String },
  targetUserId: { type: String },
  ip: { type: String },
  userAgent: { type: String },
  details: { type: mongoose.Schema.Types.Mixed },
  timestamp: { type: Date, default: Date.now }
});

AuthAuditLogSchema.index({ userId: 1, timestamp: -1 });
AuthAuditLogSchema.index({ action: 1, timestamp: -1 });

// ============ CREATE MODELS ============

export const Role = mongoose.model('Role', RoleSchema);
export const AuthUser = mongoose.model('AuthUser', UserSchema);
export const RefreshToken = mongoose.model('RefreshToken', RefreshTokenSchema);
export const AuthAuditLog = mongoose.model('AuthAuditLog', AuthAuditLogSchema);

// ============ SEED ROLES ============

const ROLE_DEFINITIONS = [
  { name: 'SUPERADMIN', description: 'Full system access, user and role management' },
  { name: 'ADMIN', description: 'Manage users (except superadmin elevation), system settings' },
  { name: 'ISSUER', description: 'Create certificates, close batches, request anchoring' },
  { name: 'AUDITOR', description: 'Read proofs, verify endpoints, export reports' },
  { name: 'VIEWER', description: 'Read-only limited views' },
  { name: 'MINER', description: 'Register raw ore extraction at mine sites (on-chain)' },
  { name: 'REFINER', description: 'Smelt & refine ore into bullion bars (on-chain)' },
  { name: 'ASSAYER', description: 'Assay & certify refined bars for market (on-chain)' },
  { name: 'DEALER', description: 'Transfer custody of certified products (on-chain)' },
];

export async function seedRoles() {
  for (const role of ROLE_DEFINITIONS) {
    await Role.findOneAndUpdate(
      { name: role.name },
      { $setOnInsert: { roleId: uuidv4(), ...role } },
      { upsert: true, new: true }
    );
  }
  console.log('✓ Auth roles seeded');
}
