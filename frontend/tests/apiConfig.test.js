/**
 * ALTNEU — API Configuration & Staging Environment Safety Test Suite
 * File: frontend/tests/apiConfig.test.js
 * Run: npm test (node --test tests/*.test.js)
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  resolveApiBase,
  isLocalhost,
  isStagingPreview,
  PRODUCTION_BACKEND_URL,
} from '../src/utils/apiConfig.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendRoot = path.resolve(__dirname, '..');
const readFrontend = (rel) => fs.readFileSync(path.join(frontendRoot, rel), 'utf8');

describe('API Configuration: Localhost Development', () => {
  test('Localhost returns empty API_BASE to route through Vite dev server proxy', () => {
    assert.strictEqual(
      resolveApiBase({ env: {}, hostname: 'localhost' }),
      '',
      'localhost must resolve to empty string for Vite proxy'
    );
    assert.strictEqual(
      resolveApiBase({ env: {}, hostname: '127.0.0.1' }),
      '',
      '127.0.0.1 must resolve to empty string'
    );
    assert.strictEqual(
      resolveApiBase({ env: {}, hostname: '::1' }),
      '',
      '::1 must resolve to empty string'
    );
    assert.strictEqual(
      resolveApiBase({ env: {}, hostname: 'app.localhost' }),
      '',
      'subdomain.localhost must resolve to empty string'
    );
    assert.strictEqual(
      resolveApiBase({ env: {}, hostname: '' }),
      '',
      'Empty hostname (SSR/node) must resolve to empty string'
    );
  });

  test('isLocalhost correctly identifies local addresses', () => {
    assert.strictEqual(isLocalhost('localhost'), true);
    assert.strictEqual(isLocalhost('127.0.0.1'), true);
    assert.strictEqual(isLocalhost('::1'), true);
    assert.strictEqual(isLocalhost('storefront.localhost'), true);
    assert.strictEqual(isLocalhost(''), true);
    assert.strictEqual(isLocalhost('altneu-staging.onrender.com'), false);
    assert.strictEqual(isLocalhost('altneu.com'), false);
  });
});

describe('API Configuration: Hosted Staging Previews with Configuration', () => {
  test('Uses VITE_API_BASE_URL when supplied in staging preview', () => {
    const stagingBackend = 'https://altneu-backend-staging.onrender.com';
    const result = resolveApiBase({
      env: { VITE_API_BASE_URL: stagingBackend },
      hostname: 'altneu-frontend-staging.onrender.com',
    });
    assert.strictEqual(result, stagingBackend);
  });

  test('Normalizes trailing slashes on VITE_API_BASE_URL', () => {
    const rawUrl = 'https://altneu-backend-staging.onrender.com///';
    const result = resolveApiBase({
      env: { VITE_API_BASE_URL: rawUrl },
      hostname: 'altneu-staging.onrender.com',
    });
    assert.strictEqual(result, 'https://altneu-backend-staging.onrender.com');
  });

  test('Supports VITE_API_URL alias as fallback', () => {
    const stagingBackend = 'https://altneu-backend-staging.onrender.com';
    const result = resolveApiBase({
      env: { VITE_API_URL: stagingBackend },
      hostname: 'altneu-preview.vercel.app',
    });
    assert.strictEqual(result, stagingBackend);
  });

  test('Prefers VITE_API_BASE_URL over VITE_API_URL when both are provided', () => {
    const result = resolveApiBase({
      env: {
        VITE_API_BASE_URL: 'https://staging-primary.example.com',
        VITE_API_URL: 'https://staging-secondary.example.com',
      },
      hostname: 'altneu-preview.vercel.app',
    });
    assert.strictEqual(result, 'https://staging-primary.example.com');
  });
});

describe('API Configuration: Staging Preview Missing Configuration (Fail-Safe)', () => {
  test('Staging on Render throws descriptive diagnostic and refuses production fallback', () => {
    const stagingHost = 'altneu-frontend-staging.onrender.com';

    assert.throws(
      () => {
        resolveApiBase({ env: {}, hostname: stagingHost });
      },
      (err) => {
        assert.match(err.message, /Missing VITE_API_BASE_URL/);
        assert.match(err.message, /altneu-frontend-staging\.onrender\.com/);
        assert.match(err.message, /Staging previews must not fall back to the production backend/);
        return true;
      }
    );

    // Explicitly verify production backend is NEVER returned
    let returnedValue = null;
    try {
      returnedValue = resolveApiBase({ env: {}, hostname: stagingHost });
    } catch {
      returnedValue = 'THREW_SAFELY';
    }
    assert.strictEqual(returnedValue, 'THREW_SAFELY');
    assert.notStrictEqual(returnedValue, PRODUCTION_BACKEND_URL);
  });

  test('Preview deployment on Vercel throws and refuses production fallback', () => {
    const previewHost = 'altneu-preview.vercel.app';

    assert.throws(
      () => {
        resolveApiBase({ env: {}, hostname: previewHost });
      },
      /Missing VITE_API_BASE_URL/
    );

    let returnedValue = null;
    try {
      returnedValue = resolveApiBase({ env: {}, hostname: previewHost });
    } catch {
      returnedValue = 'THREW_SAFELY';
    }
    assert.strictEqual(returnedValue, 'THREW_SAFELY');
    assert.notStrictEqual(returnedValue, PRODUCTION_BACKEND_URL);
  });

  test('PR branch preview on Netlify throws and refuses production fallback', () => {
    const netlifyHost = 'altneu-pr-42.netlify.app';

    assert.throws(
      () => {
        resolveApiBase({ env: {}, hostname: netlifyHost });
      },
      /Missing VITE_API_BASE_URL/
    );
  });

  test('Staging mode via env.MODE throws when VITE_API_BASE_URL is missing', () => {
    assert.throws(
      () => {
        resolveApiBase({
          env: { MODE: 'staging' },
          hostname: 'custom-preview.domain.com',
        });
      },
      /Missing VITE_API_BASE_URL/
    );

    assert.throws(
      () => {
        resolveApiBase({
          env: { MODE: 'preview' },
          hostname: 'custom-preview.domain.com',
        });
      },
      /Missing VITE_API_BASE_URL/
    );
  });

  test('isStagingPreview detects various preview patterns', () => {
    assert.strictEqual(isStagingPreview({ hostname: 'altneu-staging.onrender.com' }), true);
    assert.strictEqual(isStagingPreview({ hostname: 'altneu-preview.vercel.app' }), true);
    assert.strictEqual(isStagingPreview({ hostname: 'staging.altneu.com' }), true);
    assert.strictEqual(isStagingPreview({ hostname: 'preview.altneu.com' }), true);
    assert.strictEqual(isStagingPreview({ hostname: 'altneu-pr-12.onrender.com' }), true);
    assert.strictEqual(isStagingPreview({ env: { MODE: 'staging' }, hostname: 'example.com' }), true);
    assert.strictEqual(isStagingPreview({ env: { MODE: 'preview' }, hostname: 'example.com' }), true);

    // Production domain without staging mode
    assert.strictEqual(isStagingPreview({ env: { MODE: 'production' }, hostname: 'altneu.com' }), false);
  });
});

describe('API Configuration: Production Environment', () => {
  test('Production domain falls back to PRODUCTION_BACKEND_URL when VITE_API_BASE_URL is unset', () => {
    const result = resolveApiBase({
      env: { MODE: 'production' },
      hostname: 'altneu.com',
    });
    assert.strictEqual(result, PRODUCTION_BACKEND_URL);
    assert.strictEqual(result, 'https://altneu-backend.onrender.com');
  });

  test('Production domain respects VITE_API_BASE_URL override if supplied', () => {
    const override = 'https://custom-production-api.altneu.com';
    const result = resolveApiBase({
      env: { MODE: 'production', VITE_API_BASE_URL: override },
      hostname: 'altneu.com',
    });
    assert.strictEqual(result, override);
  });
});

describe('API Configuration: Documentation & Static Service Contracts', () => {
  test('frontend/.env.example documents VITE_API_BASE_URL clearly without real credentials', () => {
    const example = readFrontend('.env.example');
    assert.match(example, /VITE_API_BASE_URL=/);
    assert.match(example, /Localhost/i);
    assert.match(example, /Staging/i);
    // Must NOT contain real credentials or production backend URL
    assert.doesNotMatch(example, /altneu-backend.*onrender\.com/);
  });

  test('frontend/src/services/api.js wires resolveApiBase and rejects unconfigured staging preview fallback', () => {
    const apiSrc = readFrontend('src/services/api.js');

    // 1. Imports and re-exports resolveApiBase
    assert.match(apiSrc, /import\s*\{[\s\S]*?resolveApiBase[\s\S]*?\}\s*from\s*'\.\.\/utils\/apiConfig\.js';/);
    assert.match(apiSrc, /export\s*\{[\s\S]*?resolveApiBase[\s\S]*?\};/);

    // 2. Evaluates API_BASE safely
    assert.match(apiSrc, /export const API_BASE = initialApiBase;/);

    // 3. Calls resolveApiBase in request() for dynamic per-request validation
    assert.match(apiSrc, /const base = resolveApiBase\(\);/);
    assert.match(apiSrc, /fetch\(`\$\{base\}\$\{normalizedPath\}`/);

    // 4. No hardcoded fallback to production in api.js
    assert.doesNotMatch(
      apiSrc,
      /const REMOTE_BASE = 'https:\/\/altneu-backend\.onrender\.com';\s*export const API_BASE = isDev \? '' : REMOTE_BASE;/
    );
  });
});
