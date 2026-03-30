const http = require("../../lib/for-sale-http");

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
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
};
