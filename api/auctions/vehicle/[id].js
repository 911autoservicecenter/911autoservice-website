/**
 * PUT — update vehicle (auth). DELETE — remove vehicle (auth).
 * Body/query must include auctionId.
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
    res.status(400).json({ ok: false, message: "Missing vehicle id." });
    return;
  }

  if (req.method === "PUT") {
    if (!http.requireAuth(req, res)) return;
    try {
      var body = await http.readJsonBody(req);
      var auctionId = sanitizeString(
        (body && body.auctionId) || (req.query && req.query.auctionId),
        80
      );
      if (!auctionId) {
        res.status(400).json({ ok: false, message: "auctionId is required." });
        return;
      }
      var list = await store.getAuctions();
      var aIdx = list.findIndex(function (x) {
        return x.id === auctionId;
      });
      if (aIdx === -1) {
        res.status(404).json({ ok: false, message: "Auction not found." });
        return;
      }
      var auction = list[aIdx];
      var vehicles = Array.isArray(auction.vehicles) ? auction.vehicles.slice() : [];
      var vIdx = vehicles.findIndex(function (x) {
        return x.id === id;
      });
      if (vIdx === -1) {
        res.status(404).json({ ok: false, message: "Vehicle not found." });
        return;
      }
      var cur = vehicles[vIdx];
      var hasPhotosField = body && Object.prototype.hasOwnProperty.call(body, "photos");
      var nextPhotos = hasPhotosField
        ? photosLib.sanitizePhotos(body.photos)
        : body && body.imageUrl != null
          ? photosLib.normalizeListingPhotos(body)
          : photosLib.normalizeListingPhotos(cur);
      var fallbackAlt =
        body && body.imageAlt != null
          ? sanitizeString(body.imageAlt, 300)
          : cur.imageAlt;
      var primary = photosLib.getListingPrimaryFields(nextPhotos, fallbackAlt);
      var year = body.year != null ? sanitizeString(body.year, 10) : cur.year;
      var make = body.make != null ? sanitizeString(body.make, 80) : cur.make;
      var model = body.model != null ? sanitizeString(body.model, 120) : cur.model;
      var vin =
        body.vin != null ? sanitizeString(body.vin, 32).toUpperCase() : cur.vin;
      if (!year || !make || !model) {
        res.status(400).json({ ok: false, message: "Year, make, and model are required." });
        return;
      }
      if (!vin) {
        res.status(400).json({ ok: false, message: "VIN is required." });
        return;
      }
      var next = Object.assign({}, cur, {
        year: year,
        make: make,
        model: model,
        vin: vin,
        lotNumber:
          body.lotNumber != null ? sanitizeString(body.lotNumber, 40) : cur.lotNumber,
        notes: body.notes != null ? sanitizeString(body.notes, 2000) : cur.notes,
        imageUrl: primary.imageUrl,
        imageAlt: primary.imageAlt,
        photos: nextPhotos,
        sold: body.sold != null ? !!body.sold : !!cur.sold,
        updatedAt: new Date().toISOString(),
      });
      var previousPhotos = photosLib.normalizeListingPhotos(cur);
      var keepUrls = {};
      nextPhotos.forEach(function (p) {
        if (p && p.url) keepUrls[p.url] = true;
      });
      var removedPhotos = previousPhotos.filter(function (p) {
        return p && p.url && !keepUrls[p.url];
      });
      vehicles[vIdx] = next;
      list[aIdx] = Object.assign({}, auction, {
        vehicles: vehicles,
        updatedAt: new Date().toISOString(),
      });
      await store.saveAuctions(list);
      if (removedPhotos.length) {
        try {
          await photosLib.deletePhotos(removedPhotos);
        } catch (e) {
          console.error("Could not delete removed vehicle photos", e);
        }
      }
      res.status(200).json({ ok: true, vehicle: next, auction: list[aIdx] });
    } catch (e) {
      if (e && e.code === "KV_NOT_CONFIGURED") {
        res.status(503).json({ ok: false, message: store.kvNotConfiguredMessage() });
        return;
      }
      res.status(500).json({ ok: false, message: "Could not update vehicle." });
    }
    return;
  }

  if (req.method === "DELETE") {
    if (!http.requireAuth(req, res)) return;
    try {
      var body2 = {};
      try {
        body2 = await http.readJsonBody(req);
      } catch (e) {
        body2 = {};
      }
      var auctionId2 = sanitizeString(
        (body2 && body2.auctionId) || (req.query && req.query.auctionId),
        80
      );
      if (!auctionId2) {
        res.status(400).json({ ok: false, message: "auctionId is required." });
        return;
      }
      var list2 = await store.getAuctions();
      var aIdx2 = list2.findIndex(function (x) {
        return x.id === auctionId2;
      });
      if (aIdx2 === -1) {
        res.status(404).json({ ok: false, message: "Auction not found." });
        return;
      }
      var auction2 = list2[aIdx2];
      var vehicles2 = Array.isArray(auction2.vehicles) ? auction2.vehicles.slice() : [];
      var removed = vehicles2.find(function (x) {
        return x.id === id;
      });
      var filtered = vehicles2.filter(function (x) {
        return x.id !== id;
      });
      if (filtered.length === vehicles2.length) {
        res.status(404).json({ ok: false, message: "Vehicle not found." });
        return;
      }
      list2[aIdx2] = Object.assign({}, auction2, {
        vehicles: filtered,
        updatedAt: new Date().toISOString(),
      });
      await store.saveAuctions(list2);
      try {
        var removedPhotos2 = photosLib.normalizeListingPhotos(removed || {});
        if (removedPhotos2.length) await photosLib.deletePhotos(removedPhotos2);
      } catch (e) {
        console.error("Could not delete vehicle photos", e);
      }
      res.status(200).json({ ok: true, message: "Deleted." });
    } catch (e) {
      if (e && e.code === "KV_NOT_CONFIGURED") {
        res.status(503).json({ ok: false, message: store.kvNotConfiguredMessage() });
        return;
      }
      res.status(500).json({ ok: false, message: "Could not delete vehicle." });
    }
    return;
  }

  res.status(405).json({ ok: false, message: "Method not allowed" });
};
