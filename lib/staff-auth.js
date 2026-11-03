/**
 * Staff accounts live in Redis. Invite codes are created by the owner.
 * Existing env logins (FOR_SALE_ADMIN_*) still sign in and stay the owner.
 */
const crypto = require("crypto");
const http = require("./for-sale-http");
const redisStore = require("./for-sale-store");

const USERS_KEY = "staff:users:v1";
const INVITES_KEY = "staff:invites:v1";
const INVITE_DAYS = 14;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function normalizeCode(raw) {
  return String(raw || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function displayCode(raw) {
  var code = normalizeCode(raw);
  if (code.length !== 12) return code;
  return code.slice(0, 4) + "-" + code.slice(4, 8) + "-" + code.slice(8, 12);
}

function codesEqual(a, b) {
  var x = Buffer.from(String(a));
  var y = Buffer.from(String(b));
  if (x.length !== y.length) return false;
  try {
    return crypto.timingSafeEqual(x, y);
  } catch (e) {
    return false;
  }
}

function hashPassword(password) {
  var salt = crypto.randomBytes(16).toString("hex");
  return new Promise(function (resolve, reject) {
    crypto.scrypt(String(password), salt, 32, function (err, key) {
      if (err) reject(err);
      else resolve({ salt: salt, hash: key.toString("hex") });
    });
  });
}

function verifyPassword(password, hash, salt) {
  return new Promise(function (resolve, reject) {
    crypto.scrypt(String(password), String(salt || ""), 32, function (err, key) {
      if (err) reject(err);
      else {
        var stored = Buffer.from(String(hash || ""), "hex");
        if (stored.length !== key.length) {
          resolve(false);
          return;
        }
        resolve(crypto.timingSafeEqual(stored, key));
      }
    });
  });
}

async function readKey(key) {
  var r = redisStore.getRedis();
  if (!r) return null;
  var v = await r.get(key);
  if (v == null) return null;
  if (typeof v === "string") {
    try {
      return JSON.parse(v);
    } catch (e) {
      return null;
    }
  }
  return v;
}

async function writeKey(key, value) {
  var r = redisStore.getRedis();
  if (!r) {
    var err = new Error("KV_NOT_CONFIGURED");
    err.code = "KV_NOT_CONFIGURED";
    throw err;
  }
  await r.set(key, JSON.stringify(value));
}

async function getUsers() {
  var arr = await readKey(USERS_KEY);
  return Array.isArray(arr) ? arr : [];
}

async function getInvites() {
  var arr = await readKey(INVITES_KEY);
  return Array.isArray(arr) ? arr : [];
}

async function findUser(email) {
  var want = http.normalizeEmail(email);
  if (!want) return null;
  var users = await getUsers();
  for (var i = 0; i < users.length; i++) {
    if (users[i] && http.normalizeEmail(users[i].email) === want) return users[i];
  }
  return null;
}

function emailIsEnvAccount(email) {
  var want = http.normalizeEmail(email);
  if (!want) return false;
  var usersJson = process.env.FOR_SALE_ADMIN_USERS_JSON;
  if (usersJson && String(usersJson).trim()) {
    try {
      var arr = JSON.parse(usersJson);
      if (Array.isArray(arr)) {
        for (var i = 0; i < arr.length; i++) {
          if (arr[i] && http.normalizeEmail(arr[i].email) === want) return true;
        }
      }
    } catch (e) {
      /* ignore */
    }
  }
  var allow = process.env.FOR_SALE_ADMIN_EMAILS;
  if (allow && String(allow).trim()) {
    var list = String(allow).split(",").map(http.normalizeEmail);
    if (list.indexOf(want) !== -1) return true;
  }
  return false;
}

function redisUserIsOwner(email) {
  var owners = http.ownerEmails();
  if (!owners.length) return false;
  return owners.indexOf(http.normalizeEmail(email)) !== -1;
}

async function authenticate(emailRaw, passwordRaw) {
  var email = http.normalizeEmail(emailRaw);
  var pw = passwordRaw != null ? String(passwordRaw) : "";
  if (pw.length > 200) return { ok: false };
  try {
    var user = email ? await findUser(email) : null;
    if (user) {
      var match = await verifyPassword(pw, user.passwordHash, user.passwordSalt);
      if (!match) return { ok: false };
      return { ok: true, email: user.email, owner: redisUserIsOwner(user.email) };
    }
  } catch (e) {
    console.error("[staff] account lookup failed", e && e.message ? e.message : e);
  }
  var env = http.checkAdminLogin(email, pw);
  if (!env.ok) return { ok: false };
  return { ok: true, email: env.email, owner: http.envLoginIsOwner(env.email) };
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 200;
}

async function claimCode(code) {
  var r = redisStore.getRedis();
  if (!r) {
    var err = new Error("KV_NOT_CONFIGURED");
    err.code = "KV_NOT_CONFIGURED";
    throw err;
  }
  var digest = crypto.createHash("sha256").update(code).digest("hex");
  var result = await r.set("staff:code:" + digest, "1", { nx: true, ex: 60 });
  return !!result;
}

async function releaseCode(code) {
  var r = redisStore.getRedis();
  if (!r) return;
  var digest = crypto.createHash("sha256").update(code).digest("hex");
  try {
    await r.del("staff:code:" + digest);
  } catch (e) {
    /* the lock expires on its own */
  }
}

function inviteIsOpen(inv) {
  if (!inv || inv.revoked || inv.usedAt) return false;
  if (inv.expiresAt && Date.now() > new Date(inv.expiresAt).getTime()) return false;
  return true;
}

async function register(emailRaw, password, inviteCodeRaw) {
  if (!redisStore.hasRedisEnv()) {
    var err = new Error("KV_NOT_CONFIGURED");
    err.code = "KV_NOT_CONFIGURED";
    throw err;
  }
  var email = http.normalizeEmail(emailRaw);
  var pw = password != null ? String(password) : "";
  if (!validEmail(email)) return { error: "Enter a valid work email." };
  if (pw.length < 10 || pw.length > 200) {
    return { error: "Password must be at least 10 characters." };
  }
  if (emailIsEnvAccount(email)) return { error: "That email already has a login." };
  var existing = await findUser(email);
  if (existing) return { error: "That email already has a login." };

  var code = normalizeCode(inviteCodeRaw);
  if (code.length !== 12) return { error: "That invite code is not valid." };
  var claimed = await claimCode(code);
  if (!claimed) return { error: "That invite code is not valid." };

  var invites = await getInvites();
  var idx = -1;
  for (var i = 0; i < invites.length; i++) {
    if (invites[i] && codesEqual(invites[i].code, code)) {
      idx = i;
      break;
    }
  }
  if (idx === -1 || !inviteIsOpen(invites[idx])) {
    await releaseCode(code);
    return { error: "That invite code is not valid." };
  }

  var now = new Date().toISOString();
  invites[idx].usedBy = email;
  invites[idx].usedAt = now;
  await writeKey(INVITES_KEY, invites);

  try {
    var hashed = await hashPassword(pw);
    var users = await getUsers();
    users.push({
      id: redisStore.newId(),
      email: email,
      passwordHash: hashed.hash,
      passwordSalt: hashed.salt,
      createdAt: now,
      inviteId: invites[idx].id,
    });
    await writeKey(USERS_KEY, users);
  } catch (e) {
    invites[idx].usedBy = "";
    invites[idx].usedAt = "";
    try {
      await writeKey(INVITES_KEY, invites);
    } catch (revertErr) {
      console.error("[staff] could not restore invite", revertErr && revertErr.message);
    }
    await releaseCode(code);
    throw e;
  }

  return { ok: true, email: email, owner: redisUserIsOwner(email) };
}

function generateCode() {
  var bytes = crypto.randomBytes(12);
  var raw = "";
  for (var i = 0; i < 12; i++) raw += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return raw;
}

async function createInvite(ownerEmail) {
  if (!redisStore.hasRedisEnv()) {
    var err = new Error("KV_NOT_CONFIGURED");
    err.code = "KV_NOT_CONFIGURED";
    throw err;
  }
  var invites = await getInvites();
  var open = invites.filter(inviteIsOpen).length;
  if (open >= 20) {
    return { error: "Revoke an unused code before creating another. Twenty unused codes is the limit." };
  }
  var now = new Date();
  var invite = {
    id: redisStore.newId(),
    code: generateCode(),
    createdAt: now.toISOString(),
    createdBy: http.normalizeEmail(ownerEmail) || "owner",
    expiresAt: new Date(now.getTime() + INVITE_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    usedBy: "",
    usedAt: "",
    revoked: false,
  };
  invites.unshift(invite);
  if (invites.length > 100) invites = invites.slice(0, 100);
  await writeKey(INVITES_KEY, invites);
  return { ok: true, invite: publicInvite(invite) };
}

function inviteStatus(inv) {
  if (inv.revoked) return "Revoked";
  if (inv.usedAt) return "Used";
  if (inv.expiresAt && Date.now() > new Date(inv.expiresAt).getTime()) return "Expired";
  return "Ready";
}

function publicInvite(inv) {
  return {
    id: inv.id,
    code: displayCode(inv.code),
    createdAt: inv.createdAt || "",
    expiresAt: inv.expiresAt || "",
    usedBy: inv.usedBy || "",
    usedAt: inv.usedAt || "",
    status: inviteStatus(inv),
  };
}

async function listInvites() {
  var invites = await getInvites();
  return invites.map(publicInvite);
}

async function revokeInvite(id) {
  var invites = await getInvites();
  var found = false;
  for (var i = 0; i < invites.length; i++) {
    if (!invites[i] || invites[i].id !== id) continue;
    found = true;
    if (invites[i].usedAt) return { error: "That code was already used." };
    invites[i].revoked = true;
    break;
  }
  if (!found) return { error: "That invite code was not found." };
  await writeKey(INVITES_KEY, invites);
  return { ok: true, invites: invites.map(publicInvite) };
}

module.exports = {
  authenticate: authenticate,
  register: register,
  createInvite: createInvite,
  listInvites: listInvites,
  revokeInvite: revokeInvite,
  displayCode: displayCode,
};
