/**
 * Minimal HS256 JWT for admin session (Node crypto only).
 */
const crypto = require("crypto");

function b64url(buf) {
  return Buffer.from(typeof buf === "string" ? buf : JSON.stringify(buf))
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function sign(payload, secret) {
  if (!secret || String(secret).length < 16) {
    throw new Error("FOR_SALE_JWT_SECRET must be at least 16 characters.");
  }
  var header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  var body = b64url(JSON.stringify(payload));
  var data = header + "." + body;
  var sig = crypto.createHmac("sha256", secret).update(data).digest("base64");
  sig = sig.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return data + "." + sig;
}

function verify(token, secret) {
  if (!token || !secret) return null;
  var parts = String(token).split(".");
  if (parts.length !== 3) return null;
  var data = parts[0] + "." + parts[1];
  var expected = crypto.createHmac("sha256", secret).update(data).digest("base64");
  expected = expected.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  try {
    if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts[2]))) return null;
  } catch (e) {
    return null;
  }
  try {
    var b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    var payload = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
    if (payload.exp && Date.now() / 1000 > payload.exp) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

module.exports = { sign, verify };
