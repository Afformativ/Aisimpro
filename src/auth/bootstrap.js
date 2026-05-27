/**
 * Bootstrap — seed roles and create superadmin on first run
 */

import { AuthUser } from './models.js';
import { seedRoles } from './models.js';
import { hashPassword, logAuthEvent } from './service.js';

export async function bootstrap() {
  // Always seed roles
  await seedRoles();

  // Create superadmin if BOOTSTRAP_ENABLE=true and no SUPERADMIN exists
  const enabled = process.env.BOOTSTRAP_ENABLE === 'true';
  if (!enabled) return;

  const email = process.env.BOOTSTRAP_SUPERADMIN_EMAIL;
  const password = process.env.BOOTSTRAP_SUPERADMIN_PASSWORD;

  if (!email || !password) {
    console.warn('[Auth Bootstrap] BOOTSTRAP_ENABLE=true but BOOTSTRAP_SUPERADMIN_EMAIL / BOOTSTRAP_SUPERADMIN_PASSWORD not set. Skipping.');
    return;
  }

  // Check if any SUPERADMIN already exists
  const existingSuperadmin = await AuthUser.countDocuments({
    roles: 'SUPERADMIN',
    deletedAt: null,
  });

  if (existingSuperadmin > 0) {
    console.log('[Auth Bootstrap] SUPERADMIN already exists. Skipping bootstrap.');
    return;
  }

  // Create superadmin
  const passwordHash = await hashPassword(password);
  const superadmin = new AuthUser({
    email: email.toLowerCase(),
    passwordHash,
    firstName: 'Super',
    lastName: 'Admin',
    roles: ['SUPERADMIN'],
    isActive: true,
    isEmailVerified: true,
    mustChangePassword: true,
  });

  await superadmin.save();
  await logAuthEvent('BOOTSTRAP_SUPERADMIN', superadmin.userId, null, null, {
    email: superadmin.email,
  });

  console.log(`[Auth Bootstrap] ✅ Superadmin created: ${superadmin.email} (must change password on first login)`);
}
