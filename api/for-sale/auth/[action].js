/**
 * Combined for-sale auth routes (one serverless function for Hobby limit).
 * POST /api/for-sale/auth/login
 * POST /api/for-sale/auth/logout
 * GET  /api/for-sale/auth/session
 */
const http = require("../../lib/for-sale-http");

function isConfigured() {
  var hasUsers = process.env.FOR_SALE_ADMIN_USERS_JSON && process.env.FOR_SALE_ADMIN_USERS_JSON.trim();
  var hasAllow = process.env.FOR_SALE_ADMIN_EMAILS && process.env.FOR_SALE_ADMIN_EMAILS.trim();
  var hasPw = process.env.FOR_SALE_ADMIN_PASSWORD;
  return !!(hasUsers || hasAllow || hasPw);
}

async function handleLogin(req, res) {
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
      message:
        "Admin login is not configured. Set FOR_SALE_ADMIN_USERS_JSON, or FOR_SALE_ADMIN_EMAILS + password, or FOR_SALE_ADMIN_PASSWORD.",
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
}

function handleLogout(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, message: "Method not allowed" });
    return;
  }
  http.clearSessionCookie(res);
  res.status(200).json({ ok: true, message: "Signed out." });
}

function handleSession(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, message: "Method not allowed" });
    return;
  }
  var p = http.getSessionPayload(req);
  var ok = !!(p && p.role === "admin");
  res.status(200).json({
    ok: true,
    loggedIn: ok,
    email: ok && p.email ? String(p.email) : null,
  });
}

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  var action = (req.query && req.query.action) || "";
  action = String(action).toLowerCase();

  if (action === "login") return handleLogin(req, res);
  if (action === "logout") return handleLogout(req, res);
  if (action === "session") return handleSession(req, res);

  res.status(404).json({ ok: false, message: "Not found." });
};
