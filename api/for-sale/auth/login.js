/**
 * POST { "email": "...", "password": "..." }
 *
 * Approved access (configure one approach in Vercel):
 * - FOR_SALE_ADMIN_USERS_JSON — [{"email":"a@b.com","password":"..."}, ...] (per-user passwords)
 * - FOR_SALE_ADMIN_EMAILS + FOR_SALE_ADMIN_PASSWORD — allowlist + shared password
 * - FOR_SALE_ADMIN_PASSWORD only — legacy password-only (no email gate)
 *
 * Always: FOR_SALE_JWT_SECRET (min 16 chars)
 */
const http = require("../../lib/for-sale-http");

function isConfigured() {
  var hasUsers = process.env.FOR_SALE_ADMIN_USERS_JSON && process.env.FOR_SALE_ADMIN_USERS_JSON.trim();
  var hasAllow = process.env.FOR_SALE_ADMIN_EMAILS && process.env.FOR_SALE_ADMIN_EMAILS.trim();
  var hasPw = process.env.FOR_SALE_ADMIN_PASSWORD;
  return !!(hasUsers || hasAllow || hasPw);
}

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, message: "Method not allowed" });
    return;
  }
  if (!process.env.FOR_SALE_JWT_SECRET || process.env.FOR_SALE_JWT_SECRET.length < 16) {
    res.status(503).json({ ok: false, message: "Admin login is not configured (FOR_SALE_JWT_SECRET)." });
    return;
  }
  if (!isConfigured()) {
    res.status(503).json({
      ok: false,
      message: "Admin login is not configured. Set FOR_SALE_ADMIN_USERS_JSON, or FOR_SALE_ADMIN_EMAILS + password, or FOR_SALE_ADMIN_PASSWORD.",
    });
    return;
  }
  var hasAllow = process.env.FOR_SALE_ADMIN_EMAILS && process.env.FOR_SALE_ADMIN_EMAILS.trim();
  if (hasAllow && !process.env.FOR_SALE_ADMIN_PASSWORD) {
    res.status(503).json({
      ok: false,
      message: "FOR_SALE_ADMIN_EMAILS requires FOR_SALE_ADMIN_PASSWORD (shared password for approved emails).",
    });
    return;
  }
  try {
    var body = await http.readJsonBody(req);
    var email = body && body.email != null ? String(body.email) : "";
    var pw = body && body.password != null ? String(body.password) : "";
    var result = http.checkAdminLogin(email, pw);
    if (!result.ok) {
      res.status(401).json({ ok: false, message: "Invalid email or password." });
      return;
    }
    http.setSessionCookie(res, { email: result.email });
    res.status(200).json({ ok: true, message: "Signed in." });
  } catch (e) {
    res.status(500).json({ ok: false, message: "Could not sign in." });
  }
};
