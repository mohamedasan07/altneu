import {
  loginAdmin,
  requestPasswordReset,
  resetPassword as doResetPassword,
} from "../services/auth.service.js";

/**
 * POST /api/auth/login — authenticate an admin and issue a JWT.
 *
 * Controller stays thin: it only reads the body, calls the service and shapes
 * the response. Errors thrown by the service (400/401) are forwarded to the
 * centralized errorHandler by the asyncHandler wrapper in the route file.
 */
export async function login(req, res) {
  const { token, admin } = await loginAdmin({
    email: req.body?.email,
    password: req.body?.password,
  });

  res.json({ success: true, token, admin });
}

/**
 * GET /api/auth/me — return the currently authenticated admin.
 *
 * Protected by the authorize() middleware, which already decoded the token and
 * attached `req.admin`. Useful for the admin frontend to restore a session.
 */
export async function me(req, res) {
  res.json({ success: true, admin: req.admin });
}

/**
 * POST /api/auth/forgot-password
 * Initiates the password reset flow.
 */
export async function forgotPassword(req, res) {
  const { email } = req.body;

  // Generic success message regardless of outcome (security)
  await requestPasswordReset(email);

  res.json({
    success: true,
    message: "If the account exists, a password reset email has been sent.",
  });
}

/**
 * POST /api/auth/reset-password
 * Completes the password reset flow.
 */
export async function resetPassword(req, res) {
  const { token, password } = req.body;

  await doResetPassword(token, password);

  res.json({
    success: true,
    message: "Your password has been reset successfully.",
  });
}
