/**
 * Listings in Upstash Redis (Vercel Marketplace) or legacy Vercel KV env names.
 * Reads also fall back to FOR_SALE_LISTINGS_JSON. Writes require Redis env.
 *
 * Env (either pair works):
 *   UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN  (Upstash / Vercel integration)
 *   KV_REST_API_URL + KV_REST_API_TOKEN                (older Vercel KV naming)
 */
const KEY = "for-sale:listings:v1";

function trimEnvValue(s) {
  if (s == null) return "";
  var t = String(s).trim();
  if (
    (t.charAt(0) === '"' && t.charAt(t.length - 1) === '"') ||
    (t.charAt(0) === "'" && t.charAt(t.length - 1) === "'")
  ) {
    t = t.slice(1, -1).trim();
  }
  return t;
}

function getRedisUrlToken() {
  var url = trimEnvValue(
    process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL
  );
  var token = trimEnvValue(
    process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN
  );
  if (!url || !token) return null;
  return { url: url, token: token };
}

function hasRedisEnv() {
  return getRedisUrlToken() != null;
}

function getRedis() {
  var cfg = getRedisUrlToken();
  if (!cfg) return null;
  try {
    var Redis = require("@upstash/redis").Redis;
    return new Redis({ url: cfg.url, token: cfg.token });
  } catch (e) {
    return null;
  }
}

async function readRaw() {
  var r = getRedis();
  if (r) {
    try {
      var v = await r.get(KEY);
      if (v == null) return "[]";
      if (typeof v === "string") return v;
      return JSON.stringify(v);
    } catch (e) {
      console.error("Redis get error", e);
    }
  }
  var env = process.env.FOR_SALE_LISTINGS_JSON;
  if (env && env.trim()) {
    try {
      JSON.parse(env);
      return env;
    } catch (e) {
      /* ignore */
    }
  }
  return "[]";
}

async function writeRaw(jsonString) {
  var r = getRedis();
  if (!r) {
    var u = !!(
      process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL
    );
    var tok = !!(
      process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN
    );
    console.error(
      "[for-sale-store] Redis unavailable: url=" +
        u +
        " token=" +
        tok +
        " (need both; check Production env + redeploy)"
    );
    var err = new Error("KV_NOT_CONFIGURED");
    err.code = "KV_NOT_CONFIGURED";
    throw err;
  }
  await r.set(KEY, jsonString);
}

async function getListings() {
  try {
    var raw = await readRaw();
    var arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}

async function saveListings(arr) {
  await writeRaw(JSON.stringify(arr));
}

function newId() {
  try {
    return require("crypto").randomUUID();
  } catch (e) {
    return "id-" + Date.now() + "-" + Math.random().toString(36).slice(2, 9);
  }
}

function assignMissingListingIds(list) {
  var rollback = [];
  var now = new Date().toISOString();
  if (!Array.isArray(list)) return rollback;
  for (var i = 0; i < list.length; i++) {
    var item = list[i];
    if (!item || typeof item !== "object") continue;
    var id = item.id != null ? String(item.id).trim() : "";
    if (id) continue;
    rollback.push({
      index: i,
      prevCreated: item.createdAt,
      prevUpdated: item.updatedAt,
    });
    item.id = newId();
    if (!item.createdAt) item.createdAt = now;
    if (!item.updatedAt) item.updatedAt = now;
  }
  return rollback;
}

function revertListingIdPatches(list, rollback) {
  if (!rollback || !rollback.length) return;
  for (var j = 0; j < rollback.length; j++) {
    var r = rollback[j];
    var item = list[r.index];
    if (!item || typeof item !== "object") continue;
    delete item.id;
    item.createdAt = r.prevCreated;
    item.updatedAt = r.prevUpdated;
  }
}

/**
 * Same as getListings, but any legacy rows without `id` get one and are persisted
 * when Redis is available (so share links and item routes work).
 */
async function getListingsEnsuringIds() {
  var list = await getListings();
  var rollback = assignMissingListingIds(list);
  if (!rollback.length) return list;
  try {
    await saveListings(list);
  } catch (saveErr) {
    console.error("[for-sale-store] id backfill save failed", saveErr);
    revertListingIdPatches(list, rollback);
  }
  return list;
}

module.exports = {
  getListings,
  getListingsEnsuringIds,
  saveListings,
  newId,
  getRedis,
  /** @deprecated use getRedis — kept for compatibility */
  getKv: getRedis,
  hasRedisEnv,
};
