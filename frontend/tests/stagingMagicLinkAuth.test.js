/**
 * ALTNEU — Staging Magic-Link Login & Session Sync Test Suite
 * File: frontend/tests/stagingMagicLinkAuth.test.js
 * Run: npm test (node --test tests/*.test.js)
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendRoot = path.resolve(__dirname, '..');
const readFrontend = (rel) => fs.readFileSync(path.join(frontendRoot, rel), 'utf8');

describe('Staging Magic-Link Login: Form Redirect Destination Contract', () => {
  test('OtpLoginForm explicitly sets emailRedirectTo targeting /account', () => {
    const src = readFrontend('src/components/auth/OtpLoginForm/OtpLoginForm.jsx');

    // 1. Must dynamically resolve redirect URL to origin/account
    assert.match(
      src,
      /window\.location\.origin[\s\S]*?\/account/,
      'OtpLoginForm must construct emailRedirectTo targeting /account on the current origin'
    );

    // 2. Must pass emailRedirectTo in options of signInWithOtp
    assert.match(
      src,
      /emailRedirectTo:\s*redirectUrl/,
      'OtpLoginForm must pass emailRedirectTo in signInWithOtp options'
    );

    // 3. Must preserve shouldCreateUser: true
    assert.match(
      src,
      /shouldCreateUser:\s*true/,
      'OtpLoginForm must retain shouldCreateUser: true'
    );
  });
});

describe('Staging Magic-Link Login: Bearer Token Forwarding in customerAuth', () => {
  test('fetchCurrentCustomer accepts optional tokenOverride and passes Authorization header', () => {
    const src = readFrontend('src/services/customerAuth.js');

    assert.match(
      src,
      /export async function fetchCurrentCustomer\(\s*tokenOverride\s*\)/,
      'fetchCurrentCustomer must accept tokenOverride parameter'
    );

    assert.match(
      src,
      /Authorization:\s*`Bearer \$\{tokenOverride\}`/,
      'fetchCurrentCustomer must forward tokenOverride in Bearer authorization header'
    );
  });
});

describe('Staging Magic-Link Login: AuthContext Session & Profile Synchronization', () => {
  const authContextSrc = readFrontend('src/context/AuthContext.jsx');

  test('AuthContext forwards session.access_token to fetchCurrentCustomer', () => {
    assert.match(
      authContextSrc,
      /const accessToken = session\?\.access_token;[\s\S]*?authApi\.fetchCurrentCustomer\(accessToken\)/,
      'AuthContext must pass session access_token directly to fetchCurrentCustomer'
    );
  });

  test('AuthContext persists verified profile to storage and state on successful backend resolution', () => {
    assert.match(
      authContextSrc,
      /setAuthStorage\(accessToken,\s*fresh\);[\s\S]*?setUser\(fresh\);/,
      'AuthContext must save both token and user profile via setAuthStorage when backend resolves'
    );
  });

  test('AuthContext clears authStorage on SIGNED_OUT event', () => {
    assert.match(
      authContextSrc,
      /else if \(event === 'SIGNED_OUT'\) \{[\s\S]*?clearAuthStorage\(\);[\s\S]*?setUser\(null\);/,
      'AuthContext must call clearAuthStorage and setUser(null) on SIGNED_OUT'
    );
  });

  test('Safety Guard: Backend customer authentication is not bypassed by Supabase session alone', () => {
    // Assert that AuthContext does NOT synthesize or set user directly from session.user
    assert.doesNotMatch(
      authContextSrc,
      /setUser\(\s*session\?\.user\s*\)/,
      'AuthContext must never bypass backend authentication by setting user directly from session.user'
    );
    assert.doesNotMatch(
      authContextSrc,
      /setUser\(\s*\{\s*email:\s*session/,
      'AuthContext must not create synthetic customer profiles without backend verification'
    );
  });
});
