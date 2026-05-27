/**
 * Admin Management Routes — user CRUD, role assignment
 * All routes require ADMIN or SUPERADMIN role.
 */

import { Router } from 'express';
import {
  getUsers,
  getUserById,
  updateUser,
  registerUser,
  assignRole,
  revokeRole,
  softDeleteUser,
  adminResetPassword,
  logAuthEvent,
} from './service.js';
import { requireAuth, requireAnyRole } from './guards.js';

const router = Router();

// All admin routes require auth + ADMIN or SUPERADMIN role
router.use(requireAuth, requireAnyRole('ADMIN', 'SUPERADMIN'));

/**
 * GET /api/admin/users
 * Query: ?page=1&limit=50&includeDeleted=false
 */
router.get('/users', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const includeDeleted = req.query.includeDeleted === 'true';
    const result = await getUsers({ page, limit, includeDeleted });
    return res.json(result);
  } catch (err) {
    console.error('Admin list users error:', err);
    return res.status(500).json({ error: 'Failed to list users' });
  }
});

/**
 * GET /api/admin/users/:userId
 */
router.get('/users/:userId', async (req, res) => {
  try {
    const user = await getUserById(req.params.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json({ user });
  } catch (err) {
    console.error('Admin get user error:', err);
    return res.status(500).json({ error: 'Failed to get user' });
  }
});

/**
 * POST /api/admin/users — admin creates a new user
 * Body: { email, password, username?, firstName?, lastName?, defaultRole? }
 */
router.post('/users', async (req, res) => {
  try {
    const { email, password, username, firstName, lastName, defaultRole } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const result = await registerUser({
      email, password, username, firstName, lastName,
      defaultRole: defaultRole || 'VIEWER',
    });
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }

    await logAuthEvent('USER_CREATED', req.user.sub, result.user.userId, req);
    return res.status(201).json({ user: result.user });
  } catch (err) {
    console.error('Admin create user error:', err);
    return res.status(500).json({ error: 'Failed to create user' });
  }
});

/**
 * PATCH /api/admin/users/:userId — update user fields
 * Body: { firstName?, lastName?, username?, isActive?, partyId? }
 */
router.patch('/users/:userId', async (req, res) => {
  try {
    const user = await updateUser(req.params.userId, req.body);
    if (!user) return res.status(404).json({ error: 'User not found' });

    await logAuthEvent('USER_UPDATED', req.user.sub, req.params.userId, req, {
      fields: Object.keys(req.body),
    });
    return res.json({ user });
  } catch (err) {
    console.error('Admin update user error:', err);
    return res.status(500).json({ error: 'Failed to update user' });
  }
});

/**
 * POST /api/admin/users/:userId/roles — assign role
 * Body: { role: 'ISSUER' }
 */
router.post('/users/:userId/roles', async (req, res) => {
  try {
    const { role } = req.body;
    if (!role) return res.status(400).json({ error: 'Role is required' });

    const result = await assignRole(req.params.userId, role, req.user.sub, req);
    if (result.error) return res.status(400).json({ error: result.error });

    return res.json({ user: result.user });
  } catch (err) {
    console.error('Admin assign role error:', err);
    return res.status(500).json({ error: 'Failed to assign role' });
  }
});

/**
 * DELETE /api/admin/users/:userId/roles/:roleName — revoke role
 */
router.delete('/users/:userId/roles/:roleName', async (req, res) => {
  try {
    const result = await revokeRole(req.params.userId, req.params.roleName, req.user.sub, req);
    if (result.error) return res.status(400).json({ error: result.error });

    return res.json({ user: result.user });
  } catch (err) {
    console.error('Admin revoke role error:', err);
    return res.status(500).json({ error: 'Failed to revoke role' });
  }
});

/**
 * DELETE /api/admin/users/:userId — soft delete user
 */
router.delete('/users/:userId', async (req, res) => {
  try {
    // Prevent self-deletion
    if (req.params.userId === req.user.sub) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const result = await softDeleteUser(req.params.userId, req.user.sub, req);
    if (result.error) return res.status(400).json({ error: result.error });

    return res.json({ message: 'User deleted' });
  } catch (err) {
    console.error('Admin delete user error:', err);
    return res.status(500).json({ error: 'Failed to delete user' });
  }
});

/**
 * POST /api/admin/users/:userId/reset-password — admin resets user password
 * Body: { newPassword }
 */
router.post('/users/:userId/reset-password', async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword) return res.status(400).json({ error: 'New password is required' });

    const result = await adminResetPassword(req.params.userId, newPassword, req.user.sub);
    if (result.error) return res.status(400).json({ error: result.error });

    return res.json({ message: 'Password reset. User must change it on next login.' });
  } catch (err) {
    console.error('Admin reset password error:', err);
    return res.status(500).json({ error: 'Failed to reset password' });
  }
});

export default router;
