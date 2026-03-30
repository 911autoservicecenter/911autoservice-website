/**
 * Listings stored in Vercel KV (key linked in project) or env JSON fallback for reads.
 * Writes require KV — set up: Vercel → Storage → KV → connect to project.
 */
const KEY = "for-sale:listings:v1";

function getKv() {
  try {
    var m = require("@vercel/kv");
    return m.kv || m.default || null;
  } catch (e) {
    return null;
  }
}

async function readRaw() {
  var kv = getKv();
  if (kv) {
    try {
      var v = await kv.get(KEY);
      if (v == null) return "[]";
      if (typeof v === "string") return v;
      return JSON.stringify(v);
    } catch (e) {
      console.error("KV get error", e);
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
  var kv = getKv();
  if (!kv) {
    var err = new Error("KV_NOT_CONFIGURED");
    err.code = "KV_NOT_CONFIGURED";
    throw err;
  }
  await kv.set(KEY, jsonString);
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

module.exports = {
  getListings,
  saveListings,
  newId,
  getKv,
};
