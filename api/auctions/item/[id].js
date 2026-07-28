/**
 * PUT — update auction (auth). DELETE — remove auction (auth).
 */
const store = require("../../lib/auctions-store");
const http = require("../../lib/for-sale-http");
const photosLib = require("../../lib/for-sale-photos");

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
      var list = await store.getAuctions();
      var idx = list.findIndex(function (x) {
        return x.id === id;
      });
      if (idx === -1) {
        res.status(404).json({ ok: false, message: "Auction not found." });
        return;
      }
      var cur = list[idx];
      var next = Object.assign({}, cur, {
        title: body.title != null ? sanitizeString(body.title, 200) : cur.title,
        dateLabel:
          body.dateLabel != null ? sanitizeString(body.dateLabel, 120) : cur.dateLabel,
        timeLabel:
          body.timeLabel != null ? sanitizeString(body.timeLabel, 80) : cur.timeLabel,
        location:
          body.location != null ? sanitizeString(body.location, 300) : cur.location,
        notes: body.notes != null ? sanitizeString(body.notes, 2000) : cur.notes,
        published: body.published != null ? !!body.published : cur.published !== false,
        ended: body.ended != null ? !!body.ended : !!cur.ended,
        updatedAt: new Date().toISOString(),
      });
      if (!next.title) {
        res.status(400).json({ ok: false, message: "Auction title is required." });
        return;
      }
      list[idx] = next;
      await store.saveAuctions(list);
      res.status(200).json({ ok: true, auction: next });
    } catch (e) {
      if (e && e.code === "KV_NOT_CONFIGURED") {
        res.status(503).json({ ok: false, message: store.kvNotConfiguredMessage() });
        return;
      }
      res.status(500).json({ ok: false, message: "Could not update auction." });
    }
    return;
  }

  if (req.method === "DELETE") {
    if (!http.requireAuth(req, res)) return;
    try {
      var list2 = await store.getAuctions();
      var removed = list2.find(function (x) {
        return x.id === id;
      });
      var filtered = list2.filter(function (x) {
        return x.id !== id;
      });
      if (filtered.length === list2.length) {
        res.status(404).json({ ok: false, message: "Auction not found." });
        return;
      }
      await store.saveAuctions(filtered);
      try {
        var vehicles = (removed && removed.vehicles) || [];
        for (var i = 0; i < vehicles.length; i++) {
          var photos = photosLib.normalizeListingPhotos(vehicles[i] || {});
          if (photos.length) await photosLib.deletePhotos(photos);
        }
      } catch (e) {
        console.error("Could not delete auction vehicle photos", e);
      }
      res.status(200).json({ ok: true, message: "Deleted." });
    } catch (e) {
      if (e && e.code === "KV_NOT_CONFIGURED") {
        res.status(503).json({ ok: false, message: store.kvNotConfiguredMessage() });
        return;
      }
      res.status(500).json({ ok: false, message: "Could not delete auction." });
    }
    return;
  }

  res.status(405).json({ ok: false, message: "Method not allowed" });
};
