const jwt = require("./for-sale-jwt");

const COOKIE = "for_sale_session";
const MAX_AGE_SEC = 60 * 60 * 24 * 7;

function readJsonBody(req) {
  if (Buffer.isBuffer(req.body)) {
    try {
      return Promise.resolve(JSON.parse(req.body.toString("utf8") || "{}"));
    } catch (e) {
      return Promise.resolve({});
    }
  }
  if (req.body && typeof req.body === "object") {
    return Promise.resolve(req.body);
  }
  if (typeof req.body === "string") {
    try {
      return Promise.resolve(JSON.parse(req.body || "{}"));
    } catch (e) {
      return Promise.resolve({});
    }
  }
  return new Promise(function (resolve, reject) {
    var chunks = [];
    req.on("data", function (c) {
      chunks.push(c);
    });
    req.on("end", function () {
      try {
        var raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function parseCookies(header) {
  var out = {};
  if (!header || typeof header !== "string") return out;
  header.split(";").forEach(function (part) {
    var i = part.indexOf("=");
    if (i === -1) return;
    var k = part.slice(0, i).trim();
    var v = part.slice(i + 1).trim();
    out[k] = decodeURIComponent(v);
  });
  return out;
}

function getSessionPayload(req) {
  var secret = process.env.FOR_SALE_JWT_SECRET;
  var cookies = parseCookies(req.headers.cookie);
  var token = cookies[COOKIE];
  if (!token || !secret) return null;
  return jwt.verify(token, secret);
}

function ownerEmails() {
  var out = [];
  function add(e) {
    var n = normalizeEmail(e);
    if (n && out.indexOf(n) === -1) out.push(n);
  }
  var extra = process.env.STAFF_OWNER_EMAILS;
  if (extra && String(extra).trim()) {
    String(extra).split(",").forEach(add);
  }
  var usersJson = process.env.FOR_SALE_ADMIN_USERS_JSON;
  if (usersJson && String(usersJson).trim()) {
    try {
      var arr = JSON.parse(usersJson);
      if (Array.isArray(arr)) {
        arr.forEach(function (u) {
          if (u && u.email) add(u.email);
        });
      }
    } catch (e) {
      /* ignore invalid JSON */
    }
  }
  var allow = process.env.FOR_SALE_ADMIN_EMAILS;
  if (allow && String(allow).trim()) String(allow).split(",").forEach(add);
  return out;
}

/** Env-configured logins are the owner when no email list exists; otherwise only listed emails. */
function envLoginIsOwner(email) {
  var owners = ownerEmails();
  if (!owners.length) return true;
  return owners.indexOf(normalizeEmail(email)) !== -1;
}

function sessionIsOwner(payload) {
  if (!payload || payload.role !== "admin") return false;
  if (payload.owner === true) return true;
  var owners = ownerEmails();
  if (!owners.length) return false;
  return owners.indexOf(normalizeEmail(payload.email)) !== -1;
}

function setSessionCookie(res, payload) {
  var secret = process.env.FOR_SALE_JWT_SECRET;
  if (!secret) return;
  payload = payload || {};
  var exp = Math.floor(Date.now() / 1000) + MAX_AGE_SEC;
  var token = jwt.sign(
    {
      sub: "staff",
      role: "admin",
      email: payload.email || "admin",
      owner: !!payload.owner,
      exp: exp,
    },
    secret
  );
  var secure = process.env.VERCEL || process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    COOKIE +
      "=" +
      encodeURIComponent(token) +
      "; Path=/; HttpOnly; SameSite=Lax; Max-Age=" +
      MAX_AGE_SEC +
      secure
  );
}

function clearSessionCookie(res) {
  var secure = process.env.VERCEL || process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    COOKIE + "=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0" + secure
  );
}

function requireAuth(req, res) {
  var p = getSessionPayload(req);
  if (!p || p.role !== "admin") {
    res.status(401).json({ ok: false, message: "Unauthorized." });
    return null;
  }
  return p;
}

function requireOwner(req, res) {
  var p = requireAuth(req, res);
  if (!p) return null;
  if (!sessionIsOwner(p)) {
    res.status(403).json({ ok: false, message: "Only the shop owner can do that." });
    return null;
  }
  return p;
}

function normalizeEmail(e) {
  return String(e || "")
    .trim()
    .toLowerCase();
}

function timingSafeEqualStr(a, b) {
  var x = Buffer.from(String(a), "utf8");
  var y = Buffer.from(String(b), "utf8");
  if (x.length !== y.length) return false;
  try {
    return require("crypto").timingSafeEqual(x, y);
  } catch (e) {
    return false;
  }
}

/**
 * Approved logins:
 * 1) FOR_SALE_ADMIN_USERS_JSON = [{"email":"a@b.com","password":"..."}, ...] — only these users (own password each).
 * 2) FOR_SALE_ADMIN_EMAILS = comma list + FOR_SALE_ADMIN_PASSWORD — shared password, email must be on list.
 * 3) Only FOR_SALE_ADMIN_PASSWORD — legacy password-only (no approval list).
 */
function checkAdminLogin(emailRaw, passwordRaw) {
  var email = normalizeEmail(emailRaw);
  var pw = passwordRaw != null ? String(passwordRaw) : "";

  var usersJson = process.env.FOR_SALE_ADMIN_USERS_JSON;
  if (usersJson && usersJson.trim()) {
    if (!email) {
      return { ok: false };
    }
    try {
      var arr = JSON.parse(usersJson);
      if (Array.isArray(arr)) {
        for (var i = 0; i < arr.length; i++) {
          var u = arr[i];
          if (!u || !u.email) continue;
          if (normalizeEmail(u.email) !== email) continue;
          if (timingSafeEqualStr(pw, u.password != null ? u.password : "")) {
            return { ok: true, email: email };
          }
          return { ok: false };
        }
      }
    } catch (e) {
      /* invalid JSON */
    }
    return { ok: false };
  }

  var allow = process.env.FOR_SALE_ADMIN_EMAILS;
  if (allow && allow.trim()) {
    if (!email) {
      return { ok: false };
    }
    var allowed = allow.split(",").map(function (s) {
      return normalizeEmail(s);
    }).filter(Boolean);
    if (allowed.indexOf(email) === -1) {
      return { ok: false };
    }
    var expected = process.env.FOR_SALE_ADMIN_PASSWORD;
    if (!expected || !timingSafeEqualStr(pw, expected)) {
      return { ok: false };
    }
    return { ok: true, email: email };
  }

  var legacy = process.env.FOR_SALE_ADMIN_PASSWORD;
  if (legacy && timingSafeEqualStr(pw, legacy)) {
    return { ok: true, email: email || "admin" };
  }
  return { ok: false };
}

module.exports = {
  readJsonBody,
  getSessionPayload,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
  requireOwner,
  checkAdminLogin,
  ownerEmails,
  envLoginIsOwner,
  sessionIsOwner,
  normalizeEmail,
  COOKIE,
};
