/**
 * POST — add a vehicle to an auction (auth). Body includes auctionId.
 */
const store = require("../lib/auctions-store");
const http = require("../lib/for-sale-http");
const photosLib = require("../lib/for-sale-photos");

function sanitizeString(s, max) {
  if (s == null) return "";
  var t = String(s).trim();
  if (t.length > max) t = t.slice(0, max);
  return t;
}

function validateVehicle(body) {
  var photos = photosLib.normalizeListingPhotos(body || {});
  var primary = photosLib.getListingPrimaryFields(photos, body && body.imageAlt);
  var o = {
    year: sanitizeString(body.year, 10),
    make: sanitizeString(body.make, 80),
    model: sanitizeString(body.model, 120),
    vin: sanitizeString(body.vin, 32).toUpperCase(),
    lotNumber: sanitizeString(body.lotNumber, 40),
    notes: sanitizeString(body.notes, 2000),
    imageUrl: primary.imageUrl,
    imageAlt: primary.imageAlt,
    photos: photos,
    sold: !!body.sold,
  };
  if (!o.year || !o.make || !o.model) {
    return { error: "Year, make, and model are required." };
  }
  if (!o.vin) {
    return { error: "VIN is required." };
  }
  return { ok: true, data: o };
}

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ ok: false, message: "Method not allowed" });
    return;
  }
  if (!http.requireAuth(req, res)) return;

  try {
    var body = await http.readJsonBody(req);
    var auctionId = sanitizeString(body && body.auctionId, 80);
    if (!auctionId) {
      res.status(400).json({ ok: false, message: "auctionId is required." });
      return;
    }
    var v = validateVehicle(body);
    if (v.error) {
      res.status(400).json({ ok: false, message: v.error });
      return;
    }
    var list = await store.getAuctions();
    var idx = list.findIndex(function (x) {
      return x.id === auctionId;
    });
    if (idx === -1) {
      res.status(404).json({ ok: false, message: "Auction not found." });
      return;
    }
    var now = new Date().toISOString();
    var vehicle = Object.assign({}, v.data, {
      id: store.newId(),
      createdAt: now,
      updatedAt: now,
    });
    var auction = list[idx];
    var vehicles = Array.isArray(auction.vehicles) ? auction.vehicles.slice() : [];
    vehicles.push(vehicle);
    list[idx] = Object.assign({}, auction, {
      vehicles: vehicles,
      updatedAt: now,
    });
    await store.saveAuctions(list);
    res.status(201).json({ ok: true, vehicle: vehicle, auction: list[idx] });
  } catch (e) {
    if (e && e.code === "KV_NOT_CONFIGURED") {
      res.status(503).json({ ok: false, message: store.kvNotConfiguredMessage() });
      return;
    }
    res.status(500).json({
      ok: false,
      message: (e && e.message) || "Could not save vehicle.",
    });
  }
};
