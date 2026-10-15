import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';

/**
 * Focused rate-limit tests (Sprint 22.6 follow-up).
 *
 * Covers: the 429 threshold + response contract (body / Retry-After /
 * draft-8 headers), independent admin buckets, order-creation protection,
 * user-aware cart limiting, environment plumbing and invalid-value fallbacks,
 * and that each limiter is actually wired onto the intended route.
 *
 * No external service, database or network call is made: limiter instances are
 * exercised against throwaway Express apps on an ephemeral localhost port, and
 * routing is asserted by inspecting the routers' handler stacks.
 */

// Deterministic, low caps for this process. MUST be set before the config /
// middleware / route modules are first imported — hence the dynamic import()
// calls below. (Node's runner gives each test file its own process.)
process.env.RATE_LIMIT_ADMIN_LOGIN = '3';
process.env.RATE_LIMIT_CUSTOMER_LOGIN = '3';
process.env.RATE_LIMIT_REGISTER = '3';
process.env.RATE_LIMIT_FORGOT_PASSWORD = '2';
process.env.RATE_LIMIT_CART = '2';
process.env.RATE_LIMIT_CART_IP = '5';
process.env.RATE_LIMIT_GUEST_TRACKING = '2';
process.env.RATE_LIMIT_ORDER = '2';

const { positiveInt, config } = await import('../config/index.js');
const middleware = await import('../middleware/rateLimit.middleware.js');
const {
  adminLoginLimiter,
  adminForgotPasswordLimiter,
  adminResetPasswordLimiter,
  orderLimiter,
  guestTrackingLimiter,
  cartLimiter,
  cartUserLimiter,
} = middleware;

const orderRouter = (await import('../routes/order.routes.js')).default;
const authRouter = (await import('../routes/auth.routes.js')).default;
const cartRouter = (await import('../routes/cart.routes.js')).default;

const IP_KEYS = ['127.0.0.1', '::ffff:127.0.0.1', '::1'];

/** Clear the in-memory bucket(s) for a limiter so tests stay independent. */
function reset(limiter, keys = IP_KEYS) {
  for (const key of keys) limiter.resetKey(key);
}

/** Run `fn(baseUrl)` against an app bound to an ephemeral localhost port. */
async function withServer(app, fn) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const ok = (_req, res) => res.json({ ok: true });

/**
 * Return the handlers registered for `method path` on a router. Collects every
 * matching route layer (Express creates a separate Route per verb) and selects
 * the one that handles the requested method.
 */
function handlers(router, method, path) {
  for (const layer of router.stack) {
    if (layer.route && layer.route.path === path && layer.route.methods[method]) {
      return layer.route.stack.map((s) => s.handle);
    }
  }
  return null;
}

const post = (base, path) => fetch(`${base}${path}`, { method: 'POST' });

test('429 contract: threshold, generic body, Retry-After and draft-8 headers', async () => {
  reset(guestTrackingLimiter);
  const app = express();
  app.get('/t', guestTrackingLimiter, ok);

  await withServer(app, async (base) => {
    const first = await fetch(`${base}/t`);
    assert.equal(first.status, 200);
    assert.ok(first.headers.get('ratelimit'), 'success response advertises the policy');

    assert.equal((await fetch(`${base}/t`)).status, 200);

    const blocked = await fetch(`${base}/t`);
    assert.equal(blocked.status, 429);
    assert.match(blocked.headers.get('retry-after') ?? '', /^\d+$/, 'Retry-After is an integer');
    assert.ok(blocked.headers.get('ratelimit'), 'draft-8 RateLimit header present');
    assert.ok(blocked.headers.get('ratelimit-policy'), 'draft-8 RateLimit-Policy header present');
    assert.deepEqual(await blocked.json(), {
      error: 'Too many attempts. Please try again later.',
    });
  });
});

test('order-creation limiter blocks the (limit + 1)th request', async () => {
  reset(orderLimiter);
  const app = express();
  app.post('/orders', orderLimiter, (_req, res) => res.status(201).json({ ok: true }));

  await withServer(app, async (base) => {
    assert.equal((await post(base, '/orders')).status, 201);
    assert.equal((await post(base, '/orders')).status, 201);

    const blocked = await post(base, '/orders');
    assert.equal(blocked.status, 429);
    assert.match(blocked.headers.get('retry-after') ?? '', /^\d+$/);
  });
});

test('admin login, forgot and reset use independent buckets', async () => {
  reset(adminLoginLimiter);
  reset(adminForgotPasswordLimiter);
  reset(adminResetPasswordLimiter);

  const app = express();
  app.post('/login', adminLoginLimiter, ok);
  app.post('/forgot', adminForgotPasswordLimiter, ok);
  app.post('/reset', adminResetPasswordLimiter, ok);

  await withServer(app, async (base) => {
    // forgot-password cap = 2 → third is blocked.
    assert.equal((await post(base, '/forgot')).status, 200);
    assert.equal((await post(base, '/forgot')).status, 200);
    assert.equal((await post(base, '/forgot')).status, 429);

    // Exhausting forgot does NOT consume the login bucket.
    assert.equal((await post(base, '/login')).status, 200);
    // ...nor the reset bucket.
    assert.equal((await post(base, '/reset')).status, 200);
    assert.equal((await post(base, '/reset')).status, 200);
    assert.equal((await post(base, '/reset')).status, 429);

    // Login has its own cap of 3: the 1 above + these 2 pass, the 4th is blocked.
    assert.equal((await post(base, '/login')).status, 200);
    assert.equal((await post(base, '/login')).status, 200);
    assert.equal((await post(base, '/login')).status, 429);
  });

  assert.notEqual(adminLoginLimiter, adminForgotPasswordLimiter);
  assert.notEqual(adminForgotPasswordLimiter, adminResetPasswordLimiter);
  assert.notEqual(adminLoginLimiter, adminResetPasswordLimiter);
});

test('cart limits: per-IP ceiling, per-identity cap, and guests are skipped', async () => {
  reset(cartLimiter);
  reset(cartUserLimiter, ['user:A', 'user:B', ...IP_KEYS]);

  const app = express();
  app.post('/ip', cartLimiter, ok);
  app.post('/user/:id', (req, _res, next) => { req.user = { id: req.params.id }; next(); }, cartUserLimiter, ok);
  app.post('/guest', cartUserLimiter, ok); // no req.user → skipped by the identity cap

  await withServer(app, async (base) => {
    // Per-IP ceiling = 5 (cartIp).
    for (let i = 0; i < 5; i += 1) assert.equal((await post(base, '/ip')).status, 200);
    assert.equal((await post(base, '/ip')).status, 429);

    // Per-identity cap = 2 (cart) — user A is limited...
    assert.equal((await post(base, '/user/A')).status, 200);
    assert.equal((await post(base, '/user/A')).status, 200);
    assert.equal((await post(base, '/user/A')).status, 429);
    // ...but a different user has an independent bucket.
    assert.equal((await post(base, '/user/B')).status, 200);

    // Guests are not counted against the identity cap (would have blocked at 2).
    for (let i = 0; i < 5; i += 1) assert.equal((await post(base, '/guest')).status, 200);
  });
});

test('env plumbing reaches config with the configured values', () => {
  assert.equal(config.rateLimit.adminLogin, 3);
  assert.equal(config.rateLimit.customerLogin, 3);
  assert.equal(config.rateLimit.register, 3);
  assert.equal(config.rateLimit.forgotPassword, 2);
  assert.equal(config.rateLimit.cart, 2);
  assert.equal(config.rateLimit.cartIp, 5);
  assert.equal(config.rateLimit.guestTracking, 2);
  assert.equal(config.rateLimit.order, 2);
});

test('positiveInt: invalid values fall back and cannot disable protection', () => {
  const fallback = 10;
  assert.equal(positiveInt('25', fallback), 25);
  assert.equal(positiveInt(' 7 ', fallback), 7);
  assert.equal(positiveInt(undefined, fallback), fallback);
  assert.equal(positiveInt('', fallback), fallback); // empty string → Number('') === 0
  assert.equal(positiveInt('0', fallback), fallback); // never "block everything"
  assert.equal(positiveInt('-5', fallback), fallback);
  assert.equal(positiveInt('abc', fallback), fallback);
  assert.equal(positiveInt('2.5', fallback), fallback); // non-integer
});

test('order limiter is wired to POST creation only', () => {
  assert.ok(handlers(orderRouter, 'post', '/').includes(orderLimiter));
  assert.equal(handlers(orderRouter, 'get', '/').includes(orderLimiter), false);
  assert.equal(handlers(orderRouter, 'get', '/:id').includes(orderLimiter), false);
  assert.equal(handlers(orderRouter, 'patch', '/:id/cancel').includes(orderLimiter), false);
});

test('admin routes use separate limiter instances', () => {
  assert.ok(handlers(authRouter, 'post', '/login').includes(adminLoginLimiter));
  assert.ok(handlers(authRouter, 'post', '/forgot-password').includes(adminForgotPasswordLimiter));
  assert.ok(handlers(authRouter, 'post', '/reset-password').includes(adminResetPasswordLimiter));

  // Login limiter must NOT be reused on the reset flows.
  assert.equal(handlers(authRouter, 'post', '/forgot-password').includes(adminLoginLimiter), false);
  assert.equal(handlers(authRouter, 'post', '/reset-password').includes(adminLoginLimiter), false);
});

test('cart limiters are wired to mutations only, identity cap after auth', () => {
  for (const [method, path] of [
    ['post', '/items'],
    ['put', '/items/:itemId'],
    ['delete', '/items/:itemId'],
    ['post', '/merge'],
  ]) {
    const stack = handlers(cartRouter, method, path);
    assert.ok(stack.includes(cartLimiter), `${method} ${path} missing the IP limiter`);
    assert.ok(stack.includes(cartUserLimiter), `${method} ${path} missing the identity limiter`);
    assert.ok(
      stack.indexOf(cartLimiter) < stack.indexOf(cartUserLimiter),
      `${method} ${path}: IP limiter must run before the identity limiter`,
    );
  }

  // Read route stays unlimited.
  const getStack = handlers(cartRouter, 'get', '/');
  assert.equal(getStack.includes(cartLimiter), false);
  assert.equal(getStack.includes(cartUserLimiter), false);
});
