/**
 * Catch-all auctions API (one serverless function for Hobby limit).
 * GET/POST  /api/auctions/listings
 * PUT/DELETE /api/auctions/item/:id
 * POST /api/auctions/vehicles
 * PUT/DELETE /api/auctions/vehicle/:id
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

function pathParts(req) {
  var p = req.query && req.query.path;
  if (Array.isArray(p)) return p.map(String);
  if (p == null || p === "") return [];
  return [String(p)];
}

function isUpcomingPublic(a) {
  return a && a.published !== false && !a.ended;
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
  if (!o.title) return { error: "Auction title is required." };
  return { ok: true, data: o };
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
  if (!o.vin) return { error: "VIN is required." };
  return { ok: true, data: o };
}

async function handleListings(req, res) {
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
}

async function handleAuctionItem(req, res, id) {
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
}

async function handleVehiclesCreate(req, res) {
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
}

async function handleVehicleItem(req, res, id) {
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
}

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  var parts = pathParts(req);
  var head = parts[0] || "";

  if (head === "listings" && parts.length === 1) {
    return handleListings(req, res);
  }
  if (head === "item" && parts.length === 2) {
    return handleAuctionItem(req, res, parts[1]);
  }
  if (head === "vehicles" && parts.length === 1) {
    return handleVehiclesCreate(req, res);
  }
  if (head === "vehicle" && parts.length === 2) {
    return handleVehicleItem(req, res, parts[1]);
  }

  res.status(404).json({ ok: false, message: "Not found." });
};
