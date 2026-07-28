/**
 * GET — public: upcoming published auctions with vehicles.
 *       ?all=1 (auth): all auctions for admin.
 * POST — create auction (auth).
 */
const store = require("../lib/auctions-store");
const http = require("../lib/for-sale-http");

function sanitizeString(s, max) {
  if (s == null) return "";
  var t = String(s).trim();
  if (t.length > max) t = t.slice(0, max);
  return t;
}

function validateAuction(body) {
  var o = {
    title: sanitizeString(body.title, 200),
    dateLabel: sanitizeString(body.dateLabel, 120),
    timeLabel: sanitizeString(body.timeLabel, 80),
    location: sanitizeString(body.location, 300),
    notes: sanitizeString(body.notes, 2000),
    published: body.published !== false && body.published !== "false",
    ended: !!body.ended,
    vehicles: Array.isArray(body.vehicles) ? body.vehicles : [],
  };
  if (!o.title) {
    return { error: "Auction title is required." };
  }
  return { ok: true, data: o };
}

function isUpcomingPublic(a) {
  return a && a.published !== false && !a.ended;
}

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method === "GET") {
    try {
      var wantAll =
        req.query && (req.query.all === "1" || req.query.all === "true");
      var list = await store.getAuctions();
      if (wantAll) {
        if (!http.requireAuth(req, res)) return;
      } else {
        list = list.filter(isUpcomingPublic);
      }
      list.sort(function (a, b) {
        var ta = new Date(a.updatedAt || a.createdAt || 0).getTime();
        var tb = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return tb - ta;
      });
      res.status(200).json({ ok: true, auctions: list });
    } catch (e) {
      res.status(500).json({ ok: false, message: "Could not load auctions." });
    }
    return;
  }

  if (req.method === "POST") {
    if (!http.requireAuth(req, res)) return;
    try {
      var body = await http.readJsonBody(req);
      var v = validateAuction(body);
      if (v.error) {
        res.status(400).json({ ok: false, message: v.error });
        return;
      }
      var list2 = await store.getAuctions();
      var now = new Date().toISOString();
      var item = Object.assign({}, v.data, {
        id: store.newId(),
        vehicles: [],
        createdAt: now,
        updatedAt: now,
      });
      list2.push(item);
      await store.saveAuctions(list2);
      res.status(201).json({ ok: true, auction: item });
    } catch (e) {
      if (e && e.code === "KV_NOT_CONFIGURED") {
        res.status(503).json({ ok: false, message: store.kvNotConfiguredMessage() });
        return;
      }
      res.status(500).json({
        ok: false,
        message: (e && e.message) || "Could not save auction.",
      });
    }
    return;
  }

  res.status(405).json({ ok: false, message: "Method not allowed" });
};
