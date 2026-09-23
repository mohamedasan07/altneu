import jwt from 'jsonwebtoken';
import { verifyToken, authError } from '../services/auth.service.js';
import { resolveSupabaseIdentity } from '../services/identity.service.js';
import { getSupabase } from '../database/client.js';

/**
 * Shared authentication + authorization middleware (Sprint 19B final,
 * extended Sprint 21.1 for customer tokens, updated for Supabase auth).
 *
 * Three exported pieces:
 *   authorize('admin', 'manager', ...)  — reusable role guard
 *   verifyAdmin()                       — backward-compatible alias
 *   authenticate(req)                   — low-level token verification (now async)
 *
 * All expect: Authorization: Bearer <token>. On success they attach the
 * decoded profile to the request:
 *   req.admin  — admin tokens (Sprint 15, unchanged)
 *   req.user   — customer tokens (Sprint 21.1, new)
 * so existing admin handlers that read `req.admin` keep working untouched,
 * while new customer handlers read `req.user`. All failures are forwarded to
 * the centralized errorHandler via next(err).
 */

/** Decode + verify the Bearer token, then attach the safe claims. */
async function authenticate(req) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (!header || scheme?.toLowerCase() !== 'bearer' || !token) {
    throw authError(401, 'Authentication required — provide a Bearer token');
  }

  // Decode the token strictly for routing, NOT authentication.
  const decoded = jwt.decode(token);

  // Route 1: Supabase Token
  if (decoded && (String(decoded.iss).includes('supabase') || decoded.aud === 'authenticated')) {
    const supabase = getSupabase();
    if (!supabase) throw authError(500, 'Supabase not configured');

    // Verify securely with the Supabase Auth Server
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data?.user) {
      // Never fall back to legacy verification on an invalid/expired Supabase token
      throw authError(401, 'Invalid or expired Supabase token');
    }

    // Resolve identity (creates or links to the internal users table securely)
    const identity = await resolveSupabaseIdentity(data.user);

    req.user = {
      id: identity.id,
      email: identity.email,
      firstName: identity.first_name,
      lastName: identity.last_name,
      role: identity.role || 'customer'
    };
    return req.user;
  }

  // Route 2: Legacy Custom Token
  const payload = verifyToken(token);

  // Attach only the non-sensitive claims the rest of the app may rely on.
  if (payload.role === 'admin') {
    req.admin = {
      id: payload.id,
      name: payload.name,
      email: payload.email,
      role: payload.role,
    };
  } else {
    req.user = {
      id: payload.id,
      email: payload.email,
      firstName: payload.firstName ?? null,
      lastName: payload.lastName ?? null,
      role: payload.role ?? 'customer',
    };
  }

  return payload.role === 'admin' ? req.admin : req.user;
}

/**
 * Reusable authorization middleware: authorize(...roles).
 *
 * Verifies the JWT and then requires the decoded principal's role to be one of
 * the given roles. Calling authorize() with no roles only authenticates (any
 * valid token passes). Behavior for existing admin routes is unchanged.
 *
 * Example:
 *   router.post('/', authorize('admin'), handler)            // admin only
 *   router.get('/me', authorize('customer'), handler)        // customer only
 *   router.put('/:id', authorize('admin', 'customer'), handler)
 */
export function authorize(...roles) {
  const allowedRoles = roles.filter(Boolean);

  return async function authorizeMiddleware(req, _res, next) {
    try {
      const principal = await authenticate(req);

      if (allowedRoles.length > 0 && !allowedRoles.includes(principal.role)) {
        throw authError(403, 'Forbidden — insufficient permissions');
      }

      return next();
    } catch (err) {
      return next(err);
    }
  };
}

/**
 * Backward-compatible admin guard. Internally reuses authorize('admin'), so an
 * authenticated account with role "admin" keeps working exactly as before and
 * the whole codebase shares one authorization path.
 */
export function verifyAdmin(req, res, next) {
  return authorize('admin')(req, res, next);
}

export async function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  // No token provided — safely continue as guest
  if (!header || scheme?.toLowerCase() !== 'bearer' || !token) {
    return next();
  }

  try {
    // A token WAS provided. Verify it strictly.
    await authenticate(req);
    return next();
  } catch (err) {
    // DO NOT swallow the error. An invalid/expired token must be rejected.
    return next(err);
  }
}