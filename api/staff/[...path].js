/**
 * Staff sign-in, account creation, and owner invite codes.
 * POST /api/staff/login
 * POST /api/staff/logout
 * GET  /api/staff/session
 * POST /api/staff/register
 * GET  /api/staff/invites
 * POST /api/staff/invites
 * POST /api/staff/invites/revoke
 */
const http = require("../../lib/for-sale-http");
const staff = require("../../lib/staff-auth");

function pathParts(req) {
  var p = req.query && req.query.path;
  if (Array.isArray(p)) return p.map(String);
  if (p == null || p === "") return [];
  return [String(p)];
}

function isConfigured() {
  var hasUsers = process.env.FOR_SALE_ADMIN_USERS_JSON && process.env.FOR_SALE_ADMIN_USERS_JSON.trim();
  var hasAllow = process.env.FOR_SALE_ADMIN_EMAILS && process.env.FOR_SALE_ADMIN_EMAILS.trim();
  var hasPw = process.env.FOR_SALE_ADMIN_PASSWORD;
  return !!(hasUsers || hasAllow || hasPw);
}

function jwtReady() {
  return !!(process.env.FOR_SALE_JWT_SECRET && process.env.FOR_SALE_JWT_SECRET.length >= 16);
}

function kvMessage() {
  return "Staff accounts need Redis. Connect Upstash on Vercel, or set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN, then redeploy. Your existing owner login still works.";
}

async function handleLogin(req, res) {
  if (!jwtReady()) {
    res.status(503).json({ ok: false, message: "Staff login is not configured (FOR_SALE_JWT_SECRET)." });
    return;
  }
  var hasAllow = process.env.FOR_SALE_ADMIN_EMAILS && process.env.FOR_SALE_ADMIN_EMAILS.trim();
  if (hasAllow && !process.env.FOR_SALE_ADMIN_PASSWORD) {
    res.status(503).json({
      ok: false,
      message: "FOR_SALE_ADMIN_EMAILS requires FOR_SALE_ADMIN_PASSWORD.",
    });
    return;
  }
  var body = await http.readJsonBody(req);
  var result = await staff.authenticate(body && body.email, body && body.password);
  if (!result.ok) {
    if (!isConfigured()) {
      res.status(503).json({
        ok: false,
        message:
          "Staff login is not configured. The owner password has to be set before anyone can sign in or create a login.",
      });
      return;
    }
    res.status(401).json({ ok: false, message: "Invalid email or password." });
    return;
  }
  http.setSessionCookie(res, { email: result.email, owner: result.owner });
  res.status(200).json({ ok: true, email: result.email, owner: !!result.owner });
}

async function handleRegister(req, res) {
  if (!jwtReady()) {
    res.status(503).json({ ok: false, message: "Staff login is not configured (FOR_SALE_JWT_SECRET)." });
    return;
  }
  var body = await http.readJsonBody(req);
  var password = body && body.password != null ? String(body.password) : "";
  var confirm = body && body.confirm != null ? String(body.confirm) : "";
  if (password !== confirm) {
    res.status(400).json({ ok: false, message: "Those passwords do not match." });
    return;
  }
  var result = await staff.register(body && body.email, password, body && body.inviteCode);
  if (result.error) {
    res.status(400).json({ ok: false, message: result.error });
    return;
  }
  http.setSessionCookie(res, { email: result.email, owner: result.owner });
  res.status(201).json({ ok: true, email: result.email, owner: !!result.owner });
}

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  var parts = pathParts(req);
  var action = (parts[0] || "").toLowerCase();
  var sub = (parts[1] || "").toLowerCase();

  try {
    if (action === "login" && req.method === "POST") {
      await handleLogin(req, res);
      return;
    }
    if (action === "logout" && req.method === "POST") {
      http.clearSessionCookie(res);
      res.status(200).json({ ok: true });
      return;
    }
    if (action === "session" && req.method === "GET") {
      var p = http.getSessionPayload(req);
      var ok = !!(p && p.role === "admin");
      res.status(200).json({
        ok: true,
        loggedIn: ok,
        email: ok && p.email ? String(p.email) : null,
        owner: ok && http.sessionIsOwner(p),
      });
      return;
    }
    if (action === "register" && req.method === "POST") {
      await handleRegister(req, res);
      return;
    }
    if (action === "invites" && req.method === "GET" && !sub) {
      if (!http.requireOwner(req, res)) return;
      var invites = await staff.listInvites();
      res.status(200).json({ ok: true, invites: invites });
      return;
    }
    if (action === "invites" && req.method === "POST" && !sub) {
      var owner = http.requireOwner(req, res);
      if (!owner) return;
      var created = await staff.createInvite(owner.email);
      if (created.error) {
        res.status(400).json({ ok: false, message: created.error });
        return;
      }
      res.status(201).json({ ok: true, invite: created.invite });
      return;
    }
    if (action === "invites" && sub === "revoke" && req.method === "POST") {
      if (!http.requireOwner(req, res)) return;
      var body = await http.readJsonBody(req);
      var id = body && body.id != null ? String(body.id) : "";
      var revoked = await staff.revokeInvite(id);
      if (revoked.error) {
        res.status(400).json({ ok: false, message: revoked.error });
        return;
      }
      res.status(200).json({ ok: true, invites: revoked.invites });
      return;
    }
    res.status(404).json({ ok: false, message: "Not found." });
  } catch (e) {
    if (e && e.code === "KV_NOT_CONFIGURED") {
      res.status(503).json({ ok: false, message: kvMessage() });
      return;
    }
    console.error("[staff]", e && e.message ? e.message : e);
    res.status(500).json({ ok: false, message: "Something went wrong. Try again." });
  }
};
