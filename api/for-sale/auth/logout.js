const http = require("../../lib/for-sale-http");

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
  http.clearSessionCookie(res);
  res.status(200).json({ ok: true, message: "Signed out." });
};
