import assert from 'assert';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-super-secret-jwt-key-for-unit-tests-32chars';
process.env.NODE_ENV = 'test';

import * as dbClient from '../database/client.js';
import { getJwtSecret, verifyToken } from '../services/auth.service.js';
import { signCustomerToken, normalizeCustomer } from '../services/customerAuth.service.js';
import { optionalAuth } from '../middleware/auth.middleware.js';

let mockUsersDb = {};
let dbShouldFail = false;
let columnMissing = false;

// Mock getSupabase to avoid live production database calls and use isolated test state
const mockSupabase = {
  from(table) {
    if (table !== 'users') {
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) })
      };
    }
    return {
      select(cols) {
        return {
          eq(field, val) {
            return {
              maybeSingle: async () => {
                if (dbShouldFail) {
                  return { data: null, error: { message: 'Database connection failed', code: '57P01' } };
                }
                if (columnMissing) {
                  return { data: null, error: { message: 'column "token_version" does not exist', code: '42703' } };
                }
                let user = null;
                if (field === 'id') {
                  user = mockUsersDb[val] || null;
                } else if (field === 'supabase_user_id') {
                  user = Object.values(mockUsersDb).find(u => u.supabase_user_id === val) || null;
                } else if (field === 'email') {
                  user = Object.values(mockUsersDb).find(u => u.email === val) || null;
                }
                if (!user) return { data: null, error: null };
                return { data: { ...user }, error: null };
              }
            };
          }
        };
      },
      update(patch) {
        return {
          eq(field, val) {
            if (mockUsersDb[val]) {
              Object.assign(mockUsersDb[val], patch);
            }
            return {
              select(cols) {
                return {
                  maybeSingle: async () => {
                    const user = mockUsersDb[val];
                    if (!user) return { data: null, error: null };
                    return { data: { ...user }, error: null };
                  }
                };
              }
            };
          }
        };
      }
    };
  },
  auth: {
    getUser: async (token) => {
      try {
        const decoded = jwt.decode(token);
        if (decoded && (String(decoded.iss).includes('supabase') || decoded.aud === 'authenticated')) {
          return {
            data: {
              user: {
                id: decoded.sub || 'sub-123',
                email: 'otp@example.com',
                email_confirmed_at: new Date().toISOString(),
                user_metadata: { first_name: 'OTP', last_name: 'User' }
              }
            },
            error: null
          };
        }
      } catch {}
      return { data: null, error: { message: 'Invalid token' } };
    }
  }
};

import { setSupabaseClient } from '../database/client.js';
setSupabaseClient(mockSupabase);

const SECRET = getJwtSecret();
const dummyPasswordHash = '$2a$10$abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLM';
const dummyPasswordThumbprint = crypto.createHash('sha256').update(dummyPasswordHash).digest('hex').slice(0, 16);

let passedTests = 0;
let totalTests = 0;

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`✓ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`✗ FAIL: ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

async function main() {
  console.log('--- ALTNEU Customer JWT Revocation Test Suite ---\n');

  // Test 1: A legacy token with no version works only when the stored version is zero
  await runAsyncTest('Test 1: Legacy token with no token_version works when stored version is 0', async () => {
    const userId = 'user-legacy-0';
    mockUsersDb[userId] = {
      id: userId,
      password_hash: dummyPasswordHash,
      is_active: true,
      token_version: 0
    };

    // Legacy token: no token_version, no pwh
    const legacyToken = jwt.sign(
      { id: userId, role: 'customer', email: 'legacy@example.com' },
      SECRET,
      { expiresIn: '1h' }
    );

    const verified = await verifyToken(legacyToken);
    assert.strictEqual(verified.id, userId);
    assert.strictEqual(verified.role, 'customer');
  });

  // Test 2: A legacy token is rejected after its account version is incremented
  await runAsyncTest('Test 2: Legacy token is rejected when stored version is incremented to 1', async () => {
    const userId = 'user-legacy-1';
    mockUsersDb[userId] = {
      id: userId,
      password_hash: dummyPasswordHash,
      is_active: true,
      token_version: 1 // Password reset occurred
    };

    const legacyToken = jwt.sign(
      { id: userId, role: 'customer', email: 'legacy@example.com' },
      SECRET,
      { expiresIn: '1h' }
    );

    let threw = false;
    try {
      await verifyToken(legacyToken);
    } catch (err) {
      threw = true;
      assert.strictEqual(err.status, 401);
      assert.match(err.message, /Session expired — password was changed/);
    }
    assert.strictEqual(threw, true, 'Expected legacy token to be rejected with 401');
  });

  // Test 3: A current-version token verifies successfully
  await runAsyncTest('Test 3: Current-version token (version 1) verifies successfully', async () => {
    const userId = 'user-version-1';
    mockUsersDb[userId] = {
      id: userId,
      password_hash: dummyPasswordHash,
      is_active: true,
      token_version: 1
    };

    const currentToken = jwt.sign(
      {
        id: userId,
        role: 'customer',
        email: 'v1@example.com',
        token_version: 1,
        pwh: dummyPasswordThumbprint
      },
      SECRET,
      { expiresIn: '1h' }
    );

    const verified = await verifyToken(currentToken);
    assert.strictEqual(verified.id, userId);
    assert.strictEqual(verified.token_version, 1);
  });

  // Test 4: An old-version token fails after password reset/change
  await runAsyncTest('Test 4: Old-version token (version 1) fails after password reset increments version to 2', async () => {
    const userId = 'user-version-2';
    mockUsersDb[userId] = {
      id: userId,
      password_hash: '$2a$10$NEW_PASSWORD_HASH_AFTER_RESET_1234567890ABCDEF',
      is_active: true,
      token_version: 2 // Incremented after reset
    };

    // Token minted prior to the second reset (has version 1)
    const oldToken = jwt.sign(
      {
        id: userId,
        role: 'customer',
        email: 'v1@example.com',
        token_version: 1,
        pwh: dummyPasswordThumbprint
      },
      SECRET,
      { expiresIn: '1h' }
    );

    let threw = false;
    try {
      await verifyToken(oldToken);
    } catch (err) {
      threw = true;
      assert.strictEqual(err.status, 401);
      assert.match(err.message, /Session expired — password was changed/);
    }
    assert.strictEqual(threw, true, 'Expected version mismatch to be rejected with 401');
  });

  // Test 5a: normalizeCustomer and token signing preserves token_version
  await runAsyncTest('Test 5a: Profile update & token signing preserves current token_version and pwh', async () => {
    const dbRow = {
      id: 'user-profile-test',
      email: 'profile@example.com',
      first_name: 'OldName',
      last_name: 'OldLast',
      phone: '1234567890',
      avatar_url: null,
      role: 'customer',
      is_active: true,
      token_version: 3, // Current version in DB
      last_login_at: null,
      created_at: new Date().toISOString()
    };

    const customer = normalizeCustomer(dbRow);
    assert.strictEqual(customer.tokenVersion, 3, 'normalizeCustomer must preserve token_version = 3');

    // Simulate token signing in updateProfile with user & current password_hash
    const token = signCustomerToken(customer, dummyPasswordHash);
    const decoded = jwt.decode(token);

    assert.strictEqual(decoded.token_version, 3, 'Issued JWT must carry token_version = 3');
    assert.strictEqual(decoded.pwh, dummyPasswordThumbprint, 'Issued JWT must carry correct pwh thumbprint');

    // Verify this new token against the DB where version is 3
    mockUsersDb['user-profile-test'] = {
      id: 'user-profile-test',
      password_hash: dummyPasswordHash,
      is_active: true,
      token_version: 3
    };

    const verified = await verifyToken(token);
    assert.strictEqual(verified.token_version, 3);
  });

  // Test 5b: End-to-end updateProfile maintains token_version and valid pwh
  await runAsyncTest('Test 5b: End-to-end updateProfile preserves current token_version and pwh', async () => {
    const userId = 'user-profile-e2e';
    mockUsersDb[userId] = {
      id: userId,
      email: 'e2e@example.com',
      first_name: 'OldName',
      last_name: 'OldLast',
      phone: null,
      avatar_url: null,
      role: 'customer',
      is_active: true,
      token_version: 7,
      password_hash: dummyPasswordHash
    };

    const { updateProfile } = await import('../services/user.service.js');
    const result = await updateProfile(userId, { firstName: 'NewName', lastName: 'NewLast' });

    assert.strictEqual(result.user.tokenVersion, 7, 'Returned user must have tokenVersion 7');
    const decoded = jwt.decode(result.token);
    assert.strictEqual(decoded.token_version, 7, 'JWT must encode token_version 7');
    assert.strictEqual(decoded.pwh, dummyPasswordThumbprint, 'JWT must encode current pwh thumbprint');

    // Verify the refreshed token passes verification
    const verified = await verifyToken(result.token);
    assert.strictEqual(verified.token_version, 7);
  });

  // Test 6: Database failures fail closed for custom customer JWT verification
  await runAsyncTest('Test 6a: Database query error fails closed with 500', async () => {
    const userId = 'user-db-err';
    mockUsersDb[userId] = { id: userId, is_active: true, token_version: 0 };
    const token = jwt.sign({ id: userId, role: 'customer' }, SECRET, { expiresIn: '1h' });

    dbShouldFail = true;
    let threw = false;
    try {
      await verifyToken(token);
    } catch (err) {
      threw = true;
      assert.strictEqual(err.status, 500);
      assert.strictEqual(err.message, 'Authentication service unavailable');
    } finally {
      dbShouldFail = false;
    }
    assert.strictEqual(threw, true, 'Expected DB query failure to fail closed with 500');
  });

  await runAsyncTest('Test 6b: Missing user record in DB fails closed with 401', async () => {
    const token = jwt.sign({ id: 'non-existent-user-id', role: 'customer' }, SECRET, { expiresIn: '1h' });
    let threw = false;
    try {
      await verifyToken(token);
    } catch (err) {
      threw = true;
      assert.strictEqual(err.status, 401);
      assert.strictEqual(err.message, 'Account not found or session invalid');
    }
    assert.strictEqual(threw, true, 'Expected missing user to fail closed with 401');
  });

  await runAsyncTest('Test 6c: Missing token_version column in DB fails closed with 500', async () => {
    const userId = 'user-missing-col';
    mockUsersDb[userId] = { id: userId, is_active: true, password_hash: dummyPasswordHash }; // No token_version
    const token = jwt.sign({ id: userId, role: 'customer' }, SECRET, { expiresIn: '1h' });

    columnMissing = true;
    let threw = false;
    try {
      await verifyToken(token);
    } catch (err) {
      threw = true;
      assert.strictEqual(err.status, 500);
      assert.strictEqual(err.message, 'Authentication service unavailable');
    } finally {
      columnMissing = false;
    }
    assert.strictEqual(threw, true, 'Expected missing column to fail closed with 500');
  });

  // Test 7: Supabase OTP login and guest cart behavior remain unaffected
  await runAsyncTest('Test 7a: Guest cart with optionalAuth succeeds without authorization header', async () => {
    let nextCalled = false;
    const req = { headers: {} };
    const res = {};
    const next = (err) => {
      if (err) throw err;
      nextCalled = true;
    };

    await optionalAuth(req, res, next);
    assert.strictEqual(nextCalled, true, 'optionalAuth must call next() for guest requests without auth header');
    assert.strictEqual(req.user, undefined, 'req.user must remain undefined for guest');
  });

  await runAsyncTest('Test 7b: Invalid/revoked customer token in optionalAuth rejects with 401', async () => {
    const userId = 'user-revoked-cart';
    mockUsersDb[userId] = {
      id: userId,
      password_hash: dummyPasswordHash,
      is_active: true,
      token_version: 5
    };
    // Token with old version 0
    const revokedToken = jwt.sign({ id: userId, role: 'customer', token_version: 0 }, SECRET, { expiresIn: '1h' });

    let errCaught = null;
    const req = { headers: { authorization: `Bearer ${revokedToken}` } };
    const res = {};
    const next = (err) => {
      errCaught = err;
    };

    await optionalAuth(req, res, next);
    assert.ok(errCaught, 'optionalAuth must pass error to next() when token is invalid/revoked');
    assert.strictEqual(errCaught.status, 401);
  });

  await runAsyncTest('Test 7c: Supabase OTP token routes via Route 1 and bypasses custom token_version verification', async () => {
    const authSubId = 'sub-otp-123';
    const internalUserId = 'usr-internal-uuid-8888';

    const supabaseToken = jwt.sign(
      { sub: authSubId, iss: 'https://xyz.supabase.co/auth/v1', aud: 'authenticated' },
      'some-other-secret'
    );

    mockUsersDb[internalUserId] = {
      id: internalUserId,
      supabase_user_id: authSubId,
      email: 'otp@example.com',
      first_name: 'OTP',
      last_name: 'User',
      role: 'customer',
      is_active: true,
      token_version: 99 // Should not affect Supabase OTP auth
    };

    let nextCalled = false;
    const req = { headers: { authorization: `Bearer ${supabaseToken}` } };
    const res = {};
    const next = (err) => {
      if (err) throw err;
      nextCalled = true;
    };

    await optionalAuth(req, res, next);
    assert.strictEqual(nextCalled, true, 'Supabase OTP token must route through Route 1 and call next()');
    assert.ok(req.user, 'req.user must be populated');
    assert.strictEqual(req.user.id, internalUserId, 'req.user.id must resolve to internal users.id, NOT Supabase auth sub');
    assert.strictEqual(req.user.email, 'otp@example.com');
  });

  console.log(`\nResults: ${passedTests}/${totalTests} tests passed.`);
  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Test runner unexpected error:', err);
  process.exit(1);
});
