/**
 * GET — public listings (sorted: available first, then sold).
 * POST — create (auth required). Body: listing fields.
 */
const store = require("../lib/for-sale-store");
const http = require("../lib/for-sale-http");
const photosLib = require("../lib/for-sale-photos");

function sanitizeString(s, max) {
  if (s == null) return "";
  var t = String(s).trim();
  if (t.length > max) t = t.slice(0, max);
  return t;
}

function validateListing(body) {
  var photos = photosLib.normalizeListingPhotos(body || {});
  var primary = photosLib.getListingPrimaryFields(photos, body && body.imageAlt);
  var o = {
    title: sanitizeString(body.title, 200),
    price: sanitizeString(body.price, 40),
    priceNote: sanitizeString(body.priceNote, 120),
    lede: sanitizeString(body.lede, 2000),
    condition: sanitizeString(body.condition, 200),
    fitment: sanitizeString(body.fitment, 500),
    stock: sanitizeString(body.stock, 80),
    warranty: sanitizeString(body.warranty, 300),
    fineprint: sanitizeString(body.fineprint, 500),
    imageUrl: primary.imageUrl,
    imageAlt: primary.imageAlt,
    photos: photos,
    sold: !!body.sold,
  };
  if (!o.title) {
    return { error: "Title is required." };
  }
  return { ok: true, data: o };
}

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method === "GET") {
    try {
      var list = await store.getListings();
      list.sort(function (a, b) {
        if (!!a.sold !== !!b.sold) return a.sold ? 1 : -1;
        var ta = new Date(a.updatedAt || a.createdAt || 0).getTime();
        var tb = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return tb - ta;
      });
      res.status(200).json({ ok: true, listings: list });
    } catch (e) {
      res.status(500).json({ ok: false, message: "Could not load listings." });
    }
    return;
  }

  if (req.method === "POST") {
    if (!http.requireAuth(req, res)) return;
    try {
      var body = await http.readJsonBody(req);
      var v = validateListing(body);
      if (v.error) {
        res.status(400).json({ ok: false, message: v.error });
        return;
      }
      var list = await store.getListings();
      var now = new Date().toISOString();
      var item = Object.assign({}, v.data, {
        id: store.newId(),
        createdAt: now,
        updatedAt: now,
      });
      list.push(item);
      await store.saveListings(list);
      res.status(201).json({ ok: true, listing: item });
    } catch (e) {
      if (e && e.code === "KV_NOT_CONFIGURED") {
        res.status(503).json({
          ok: false,
          message:
            "Redis is not configured. Add Upstash from Vercel → Integrations (or Marketplace) and connect it to this project, or set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN (or legacy KV_REST_API_*) in Environment Variables, then redeploy.",
        });
        return;
      }
      var em = e && e.message ? String(e.message) : "";
      var msg =
        em && (em.indexOf("KV_REST_API") !== -1 || em.indexOf("UPSTASH_REDIS") !== -1)
          ? "Redis env vars are missing. Connect Upstash to this project or set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN, then redeploy."
          : em || "Could not save listing.";
      res.status(500).json({ ok: false, message: msg });
    }
    return;
  }

  res.status(405).json({ ok: false, message: "Method not allowed" });
};
