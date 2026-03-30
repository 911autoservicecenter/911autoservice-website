/**
 * PUT — update listing (auth). DELETE — remove (auth).
 * Path: /api/for-sale/item/:id  (avoids conflict with listings.js)
 */
const store = require("../../../lib/for-sale-store");
const http = require("../../../lib/for-sale-http");

function sanitizeString(s, max) {
  if (s == null) return "";
  var t = String(s).trim();
  if (t.length > max) t = t.slice(0, max);
  return t;
}

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  var id = (req.query && req.query.id) || "";
  if (!id) {
    res.status(400).json({ ok: false, message: "Missing id." });
    return;
  }

  if (req.method === "PUT") {
    if (!http.requireAuth(req, res)) return;
    try {
      var body = await http.readJsonBody(req);
      var list = await store.getListings();
      var idx = list.findIndex(function (x) {
        return x.id === id;
      });
      if (idx === -1) {
        res.status(404).json({ ok: false, message: "Listing not found." });
        return;
      }
      var cur = list[idx];
      var next = Object.assign({}, cur, {
        title: body.title != null ? sanitizeString(body.title, 200) : cur.title,
        price: body.price != null ? sanitizeString(body.price, 40) : cur.price,
        priceNote: body.priceNote != null ? sanitizeString(body.priceNote, 120) : cur.priceNote,
        lede: body.lede != null ? sanitizeString(body.lede, 2000) : cur.lede,
        condition: body.condition != null ? sanitizeString(body.condition, 200) : cur.condition,
        fitment: body.fitment != null ? sanitizeString(body.fitment, 500) : cur.fitment,
        stock: body.stock != null ? sanitizeString(body.stock, 80) : cur.stock,
        warranty: body.warranty != null ? sanitizeString(body.warranty, 300) : cur.warranty,
        fineprint: body.fineprint != null ? sanitizeString(body.fineprint, 500) : cur.fineprint,
        imageUrl: body.imageUrl != null ? sanitizeString(body.imageUrl, 2000) : cur.imageUrl,
        imageAlt: body.imageAlt != null ? sanitizeString(body.imageAlt, 300) : cur.imageAlt,
        sold: body.sold != null ? !!body.sold : cur.sold,
        updatedAt: new Date().toISOString(),
      });
      if (!next.title) {
        res.status(400).json({ ok: false, message: "Title is required." });
        return;
      }
      list[idx] = next;
      await store.saveListings(list);
      res.status(200).json({ ok: true, listing: next });
    } catch (e) {
      if (e && e.code === "KV_NOT_CONFIGURED") {
        res.status(503).json({
          ok: false,
          message:
            "Vercel KV is not connected. Link KV in Vercel (Storage) to this project and redeploy.",
        });
        return;
      }
      var msgUp =
        e && e.message && String(e.message).indexOf("KV_REST_API") !== -1
          ? "Vercel KV is not connected. Link KV in your project and redeploy."
          : "Could not update listing.";
      res.status(500).json({ ok: false, message: msgUp });
    }
    return;
  }

  if (req.method === "DELETE") {
    if (!http.requireAuth(req, res)) return;
    try {
      var list2 = await store.getListings();
      var filtered = list2.filter(function (x) {
        return x.id !== id;
      });
      if (filtered.length === list2.length) {
        res.status(404).json({ ok: false, message: "Listing not found." });
        return;
      }
      await store.saveListings(filtered);
      res.status(200).json({ ok: true, message: "Deleted." });
    } catch (e) {
      if (e && e.code === "KV_NOT_CONFIGURED") {
        res.status(503).json({
          ok: false,
          message:
            "Vercel KV is not connected. Link KV in Vercel (Storage) to this project and redeploy.",
        });
        return;
      }
      var msgDel =
        e && e.message && String(e.message).indexOf("KV_REST_API") !== -1
          ? "Vercel KV is not connected. Link KV in your project and redeploy."
          : "Could not delete listing.";
      res.status(500).json({ ok: false, message: msgDel });
    }
    return;
  }

  res.status(405).json({ ok: false, message: "Method not allowed" });
};
