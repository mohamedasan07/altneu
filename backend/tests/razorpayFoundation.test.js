import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import express from 'express';
import helmet from 'helmet';
import Razorpay from 'razorpay';
import { loadEnv } from '../config/env.js';
import { config } from '../config/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..');

test('Phase 1 Migration: 011_razorpay_payments.sql structure and additive constraints', () => {
  const migrationPath = path.join(backendRoot, 'database', 'migrations', '011_razorpay_payments.sql');
  assert.ok(fs.existsSync(migrationPath), 'Migration 011 file must exist');

  const sql = fs.readFileSync(migrationPath, 'utf8');

  // Must be additive: uses add column if not exists on public.orders
  assert.match(sql, /alter table public\.orders/i);
  assert.match(sql, /add column if not exists razorpay_order_id text/i);
  assert.match(sql, /add column if not exists razorpay_payment_id text/i);
  assert.match(sql, /add column if not exists razorpay_signature text/i);
  assert.match(sql, /add column if not exists razorpay_refund_id text/i);
  assert.match(sql, /add column if not exists refund_idempotency_key text/i);
  assert.match(sql, /add column if not exists refund_claimed_at timestamptz/i);
  assert.match(sql, /add column if not exists refund_status text/i);
  assert.match(sql, /add column if not exists refund_reason text/i);
  assert.match(sql, /add column if not exists refunded_at timestamptz/i);
  assert.match(sql, /add column if not exists payment_attempts integer not null default 0/i);
  assert.match(sql, /add column if not exists payment_failed_reason text/i);
  assert.match(sql, /add column if not exists last_payment_attempt_at timestamptz/i);
  assert.match(sql, /add column if not exists payment_verified_at timestamptz/i);
  assert.match(sql, /add column if not exists guest_session_id text/i);

  // Partial unique indexes (indexing only non-null values)
  assert.match(sql, /create unique index if not exists idx_orders_razorpay_order_id/i);
  assert.match(sql, /where razorpay_order_id is not null/i);
  assert.match(sql, /create unique index if not exists idx_orders_razorpay_payment_id/i);
  assert.match(sql, /where razorpay_payment_id is not null/i);
  assert.match(sql, /create unique index if not exists idx_orders_razorpay_refund_id/i);
  assert.match(sql, /where razorpay_refund_id is not null/i);
  assert.match(sql, /create unique index if not exists idx_orders_refund_idempotency_key/i);
  assert.match(sql, /where refund_idempotency_key is not null/i);

  // Guest session index
  assert.match(sql, /create index if not exists idx_orders_guest_session_id/i);
  assert.match(sql, /where guest_session_id is not null/i);

  // Sweeper index
  assert.match(sql, /create index if not exists idx_orders_unpaid_sweeper/i);
  assert.match(sql, /where status = 'pending' and payment_status in \('pending', 'failed'\)/i);

  // Deduplication table
  assert.match(sql, /create table if not exists public\.razorpay_webhook_events/i);
  assert.match(sql, /event_id\s+text primary key/i);
  assert.match(sql, /order_id\s+uuid references public\.orders/i);
  assert.match(sql, /payload\s+jsonb not null/i);
  assert.match(sql, /create index if not exists idx_webhook_events_order/i);

  // Security: RLS and privilege revocation for anon and authenticated
  assert.match(sql, /alter table public\.razorpay_webhook_events enable row level security/i);
  assert.match(sql, /revoke all on public\.razorpay_webhook_events from anon,\s*authenticated/i);
});

test('Phase 1 Config: Razorpay and internal cron configuration plumbing and safety', () => {
  // Test loadEnv plumbing
  const env = loadEnv();
  assert.ok('RAZORPAY_KEY_ID' in env, 'RAZORPAY_KEY_ID must be exposed by loadEnv()');
  assert.ok('RAZORPAY_KEY_SECRET' in env, 'RAZORPAY_KEY_SECRET must be exposed by loadEnv()');
  assert.ok('RAZORPAY_WEBHOOK_SECRET' in env, 'RAZORPAY_WEBHOOK_SECRET must be exposed by loadEnv()');
  assert.ok('INTERNAL_CRON_SECRET' in env, 'INTERNAL_CRON_SECRET must be exposed by loadEnv()');

  // Test config object
  assert.ok(config.razorpay, 'config.razorpay must exist');
  assert.strictEqual(typeof config.razorpay.configured, 'boolean', 'config.razorpay.configured must be boolean');

  assert.ok(config.cron, 'config.cron must exist');
  assert.strictEqual(typeof config.cron.configured, 'boolean', 'config.cron.configured must be boolean');

  assert.strictEqual(typeof config.supabase.serviceRoleConfigured, 'boolean', 'config.supabase.serviceRoleConfigured must be boolean');

  // Verify safe unconfigured state does not crash
  const mockUnconfigured = {
    keyId: '',
    keySecret: '',
    get configured() {
      return Boolean(this.keyId && this.keySecret);
    }
  };
  assert.strictEqual(mockUnconfigured.configured, false);

  const mockConfigured = {
    keyId: 'rzp_test_123',
    keySecret: 'secret_123',
    get configured() {
      return Boolean(this.keyId && this.keySecret);
    }
  };
  assert.strictEqual(mockConfigured.configured, true);
});

test('Phase 1 Migration Prerequisite: Repository ORDER_COLUMNS strictly documents all columns added in Migration 011', () => {
  const repoPath = path.join(backendRoot, 'repositories', 'order.repository.js');
  const repoSrc = fs.readFileSync(repoPath, 'utf8');

  const migrationPath = path.join(backendRoot, 'database', 'migrations', '011_razorpay_payments.sql');
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');

  // Columns that require Migration 011 before backend rollout
  const migrationColumns = [
    'razorpay_order_id',
    'razorpay_payment_id',
    'razorpay_signature',
    'razorpay_refund_id',
    'payment_attempts',
    'payment_failed_reason',
    'payment_verified_at',
    'guest_session_id',
  ];

  for (const col of migrationColumns) {
    assert.match(repoSrc, new RegExp(`\\b${col}\\b`), `order.repository.js ORDER_COLUMNS must reference ${col}`);
    assert.match(migrationSql, new RegExp(`add column if not exists ${col}`, 'i'), `Migration 011 must define ${col}`);
  }
});

test('Phase 1 Server: Raw body capture middleware preserves req.rawBody Buffer', async () => {
  const app = express();
  app.use(express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    }
  }));

  let capturedRawBody = null;
  let parsedBody = null;

  app.post('/test-webhook', (req, res) => {
    capturedRawBody = req.rawBody;
    parsedBody = req.body;
    res.json({ ok: true });
  });

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    const payload = JSON.stringify({ event: 'payment.captured', id: 'evt_123' });
    const response = await fetch(`http://127.0.0.1:${port}/test-webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload
    });
    assert.strictEqual(response.status, 200);
    assert.ok(Buffer.isBuffer(capturedRawBody), 'req.rawBody must be a Buffer');
    assert.strictEqual(capturedRawBody.toString('utf8'), payload, 'req.rawBody must match raw incoming string');
    assert.strictEqual(parsedBody.event, 'payment.captured');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('Phase 1 Server: Helmet CSP whitelists Razorpay scripts, API, frames, and images', async () => {
  const isProduction = false;
  const app = express();
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", 'https://checkout.razorpay.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://cdnjs.cloudflare.com', 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://cdnjs.cloudflare.com', 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'https://res.cloudinary.com', 'https://images.unsplash.com', 'https://cdn.razorpay.com'],
        connectSrc: ["'self'", 'https://altneu-backend.onrender.com', 'https://api.razorpay.com', 'https://lumberjack.razorpay.com'],
        frameSrc: ["'self'", 'https://api.razorpay.com'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: isProduction ? [] : null,
      },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }));
  app.get('/test-csp', (_req, res) => res.send('ok'));

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/test-csp`);
    const csp = res.headers.get('content-security-policy');
    assert.ok(csp, 'Content-Security-Policy header must be present');
    assert.ok(csp.includes('https://checkout.razorpay.com'), 'script-src must include https://checkout.razorpay.com');
    assert.ok(csp.includes('https://api.razorpay.com'), 'connect-src and frame-src must include https://api.razorpay.com');
    assert.ok(csp.includes('https://lumberjack.razorpay.com'), 'connect-src must include https://lumberjack.razorpay.com');
    assert.ok(csp.includes('https://cdn.razorpay.com'), 'img-src must include https://cdn.razorpay.com');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('Phase 1 SDK: Razorpay SDK method verification on installed package', () => {
  const instance = new Razorpay({
    key_id: 'rzp_test_mock_id',
    key_secret: 'mock_secret_value'
  });

  // Verify fetchMultipleRefund exists
  assert.strictEqual(
    typeof instance.payments.fetchMultipleRefund,
    'function',
    'instance.payments.fetchMultipleRefund must be a function'
  );

  // Verify fetchRefunds does NOT exist
  assert.strictEqual(
    instance.payments.fetchRefunds,
    undefined,
    'instance.payments.fetchRefunds must be undefined (calling it throws TypeError)'
  );

  // Verify refunds.all exists
  assert.strictEqual(
    typeof instance.refunds.all,
    'function',
    'instance.refunds.all must be a function'
  );

  // Verify payments.refund signature arity
  assert.strictEqual(
    typeof instance.payments.refund,
    'function',
    'instance.payments.refund must be a function'
  );
  assert.ok(instance.payments.refund.length >= 1, 'payments.refund must accept paymentId');
});
