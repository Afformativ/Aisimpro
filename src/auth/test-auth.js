/**
 * Auth System Tests
 * Run: node src/auth/test-auth.js
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { AuthUser, RefreshToken, AuthAuditLog, seedRoles } from './models.js';
import {
  hashPassword,
  verifyPassword,
  validatePasswordPolicy,
  generateAccessToken,
  verifyAccessToken,
  attemptLogin,
  registerUser,
  rotateRefreshToken,
  revokeAllSessions,
  changePassword,
  assignRole,
  revokeRole,
  softDeleteUser,
  getUsers,
} from './service.js';

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ ${label}`);
    failed++;
  }
}

async function cleanup() {
  await AuthUser.deleteMany({ email: { $regex: /^test-auth-/ } });
  await RefreshToken.deleteMany({});
}

async function run() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  await seedRoles();
  await cleanup();

  console.log('\n🔑 Password Hashing');
  {
    const hash = await hashPassword('TestPassword1!x');
    assert(hash.startsWith('$2'), 'bcrypt hash generated');
    assert(await verifyPassword('TestPassword1!x', hash), 'password verifies correctly');
    assert(!(await verifyPassword('wrong', hash)), 'wrong password rejected');
  }

  console.log('\n🔒 Password Policy');
  {
    assert(validatePasswordPolicy('short').length > 0, 'rejects short password');
    assert(validatePasswordPolicy('alllowercase1!x').length > 0, 'rejects no uppercase');
    assert(validatePasswordPolicy('ALLUPPERCASE1!!!').length > 0, 'rejects no lowercase');
    assert(validatePasswordPolicy('NoDigitsHere!!x').length > 0, 'rejects no digits');
    assert(validatePasswordPolicy('NoSpecial1234xx').length > 0, 'rejects no special chars');
    assert(validatePasswordPolicy('ValidPass123!x').length === 0, 'accepts valid password');
  }

  console.log('\n📝 Registration');
  {
    const result = await registerUser({
      email: 'test-auth-user1@example.com',
      password: 'ValidPass123!x',
      firstName: 'Test',
      lastName: 'User',
    });
    assert(!result.error, 'registration succeeds');
    assert(result.user.email === 'test-auth-user1@example.com', 'correct email');
    assert(result.user.roles.includes('VIEWER'), 'default role is VIEWER');

    const dupe = await registerUser({
      email: 'test-auth-user1@example.com',
      password: 'ValidPass123!x',
    });
    assert(dupe.error === 'Email already registered', 'rejects duplicate email');

    const weakPw = await registerUser({
      email: 'test-auth-user2@example.com',
      password: 'weak',
    });
    assert(weakPw.error, 'rejects weak password');
  }

  console.log('\n🔐 Login');
  {
    const mockReq = { ip: '127.0.0.1', headers: { 'user-agent': 'test' }, connection: {} };

    const result = await attemptLogin('test-auth-user1@example.com', 'ValidPass123!x', mockReq);
    assert(!result.error, 'login succeeds');
    assert(result.accessToken, 'returns access token');
    assert(result.refreshToken, 'returns refresh token');
    assert(result.user.email === 'test-auth-user1@example.com', 'returns user');

    const badPw = await attemptLogin('test-auth-user1@example.com', 'WrongPass', mockReq);
    assert(badPw.error === 'Invalid email or password', 'rejects wrong password');

    const noUser = await attemptLogin('nonexistent@example.com', 'ValidPass123!x', mockReq);
    assert(noUser.error === 'Invalid email or password', 'rejects unknown email');
  }

  console.log('\n🎟️  JWT Tokens');
  {
    const user = await AuthUser.findOne({ email: 'test-auth-user1@example.com' });
    const token = generateAccessToken(user);
    assert(typeof token === 'string', 'generates JWT string');

    const payload = verifyAccessToken(token);
    assert(payload.sub === user.userId, 'JWT sub matches userId');
    assert(payload.email === user.email, 'JWT email matches');
    assert(Array.isArray(payload.roles), 'JWT contains roles array');
  }

  console.log('\n🔄 Token Refresh');
  {
    const mockReq = { ip: '127.0.0.1', headers: { 'user-agent': 'test' }, connection: {} };
    const login = await attemptLogin('test-auth-user1@example.com', 'ValidPass123!x', mockReq);

    const refreshResult = await rotateRefreshToken(login.refreshToken, mockReq);
    assert(!refreshResult.error, 'token rotation succeeds');
    assert(refreshResult.accessToken, 'returns new access token');
    assert(refreshResult.refreshToken !== login.refreshToken, 'returns different refresh token');

    // Reuse detection: use old token again
    const reuseResult = await rotateRefreshToken(login.refreshToken, mockReq);
    assert(reuseResult.error, 'reuse detected');
    assert(reuseResult.reuse === true, 'reuse flag set');
  }

  console.log('\n🔑 Change Password');
  {
    const user = await AuthUser.findOne({ email: 'test-auth-user1@example.com' });
    const result = await changePassword(user.userId, 'ValidPass123!x', 'NewPassword456!y');
    assert(result.success === true, 'password change succeeds');

    const wrongOld = await changePassword(user.userId, 'ValidPass123!x', 'AnotherPass789!z');
    assert(wrongOld.error === 'Current password is incorrect', 'rejects wrong current password');

    // Login with new password
    const mockReq = { ip: '127.0.0.1', headers: { 'user-agent': 'test' }, connection: {} };
    const login = await attemptLogin('test-auth-user1@example.com', 'NewPassword456!y', mockReq);
    assert(!login.error, 'login with new password succeeds');
  }

  console.log('\n👥 Role Management');
  {
    const user = await AuthUser.findOne({ email: 'test-auth-user1@example.com' });
    const admin = await AuthUser.findOne({ roles: 'SUPERADMIN' });

    const assign = await assignRole(user.userId, 'ISSUER', admin.userId, {});
    assert(!assign.error, 'role assignment succeeds');
    assert(assign.user.roles.includes('ISSUER'), 'user now has ISSUER role');

    const revoke = await revokeRole(user.userId, 'ISSUER', admin.userId, {});
    assert(!revoke.error, 'role revocation succeeds');
    assert(!revoke.user.roles.includes('ISSUER'), 'ISSUER role removed');

    const invalid = await assignRole(user.userId, 'INVALID_ROLE', admin.userId, {});
    assert(invalid.error === 'Invalid role', 'rejects invalid role name');
  }

  console.log('\n📋 User Listing');
  {
    const result = await getUsers();
    assert(result.users.length >= 2, 'lists users');
    assert(result.total >= 2, 'has total count');
    assert(!result.users[0].passwordHash, 'password hash stripped from listing');
  }

  console.log('\n🗑️  Soft Delete');
  {
    const target = await registerUser({
      email: 'test-auth-delete@example.com',
      password: 'DeleteMe123!x',
    });
    const admin = await AuthUser.findOne({ roles: 'SUPERADMIN' });

    const del = await softDeleteUser(target.user.userId, admin.userId, {});
    assert(del.success === true, 'soft delete succeeds');

    const deleted = await AuthUser.findOne({ email: 'test-auth-delete@example.com' });
    assert(deleted.deletedAt !== null, 'deletedAt is set');
    assert(deleted.isActive === false, 'isActive is false');
  }

  // Cleanup
  await cleanup();
  await mongoose.disconnect();

  console.log(`\n${'='.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log(`${'='.repeat(40)}`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
