/**
 * Returns bookable time slots for a month. Busy times come from Shop Monkey
 * appointments for your location — only start/end timestamps are sent to the browser (no names).
 *
 * Vercel env (same as book-appointment):
 *   SHOPMONKEY_API_TOKEN
 *   SHOPMONKEY_LOCATION_ID
 * Optional:
 *   SHOP_TIMEZONE (default America/Detroit)
 *   SHOP_BOOKING_SLOT_MINUTES (default 30)
 *   SHOP_BOOKING_START_HOUR (default 8, 24h local)
 *   SHOP_BOOKING_END_HOUR (default 17)
 */
const SM = "https://api.shopmonkey.cloud/v3";

let DateTime;
try {
  DateTime = require("luxon").DateTime;
} catch (e) {
  DateTime = null;
}

async function smSearchAppointments(token, searchStartIso, searchEndIso) {
  var body = {
    where: {
      startDate: {
        gte: searchStartIso,
        lte: searchEndIso,
      },
    },
    limit: 500,
    orderBy: {
      startDate: "asc",
    },
  };
  var r = await fetch(SM + "/appointment/search", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return r.json().catch(function () {
    return {};
  });
}

function intervalsOverlap(a0, a1, b0, b1) {
  return a0 < b1 && a1 > b0;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Content-Type", "application/json");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, message: "Method not allowed" });
    return;
  }

  if (!DateTime) {
    res.status(500).json({ ok: false, message: "Server dependency missing." });
    return;
  }

  var token = process.env.SHOPMONKEY_API_TOKEN;
  var locationId = process.env.SHOPMONKEY_LOCATION_ID;
  if (!token || !locationId) {
    res.status(503).json({
      ok: false,
      message: "Calendar is not configured.",
    });
    return;
  }

  var tz = process.env.SHOP_TIMEZONE || "America/Detroit";
  var slotMinutes = parseInt(process.env.SHOP_BOOKING_SLOT_MINUTES || "30", 10);
  var startHour = parseInt(process.env.SHOP_BOOKING_START_HOUR || "8", 10);
  var endHour = parseInt(process.env.SHOP_BOOKING_END_HOUR || "17", 10);

  var monthParam = (req.query && req.query.month) || "";
  if (!/^\d{4}-\d{2}$/.test(monthParam)) {
    res.status(400).json({ ok: false, message: "Use ?month=YYYY-MM" });
    return;
  }

  var monthStart = DateTime.fromFormat(monthParam + "-01", "yyyy-MM-dd", { zone: tz }).startOf("month");
  var monthEnd = monthStart.endOf("month");

  var searchStart = monthStart.minus({ days: 1 }).toUTC().toISO();
  var searchEnd = monthEnd.plus({ days: 1 }).toUTC().toISO();

  var json = await smSearchAppointments(token, searchStart, searchEnd);
  if (!json.success || !Array.isArray(json.data)) {
    res.status(502).json({
      ok: false,
      message: (json && json.message) || "Could not load appointments from Shop Monkey.",
    });
    return;
  }

  var busy = [];
  for (var i = 0; i < json.data.length; i++) {
    var a = json.data[i];
    if (!a || a.locationId !== locationId) continue;
    if (!a.startDate || !a.endDate) continue;
    var t0 = new Date(a.startDate).getTime();
    var t1 = new Date(a.endDate).getTime();
    if (!(t1 > t0)) continue;
    busy.push({ start: t0, end: t1 });
  }

  var now = DateTime.now().setZone(tz);

  var days = {};
  var cursor = monthStart;
  while (cursor <= monthEnd) {
    var dayKey = cursor.toFormat("yyyy-MM-dd");
    var slots = [];
    var dayOpen = cursor.set({
      hour: startHour,
      minute: 0,
      second: 0,
      millisecond: 0,
    });
    var dayClose = cursor.set({
      hour: endHour,
      minute: 0,
      second: 0,
      millisecond: 0,
    });

    var slot = dayOpen;
    while (slot < dayClose) {
      var slotEnd = slot.plus({ minutes: slotMinutes });
      if (slotEnd > dayClose) break;

      var sUtc = slot.toUTC().toMillis();
      var eUtc = slotEnd.toUTC().toMillis();
      var booked = false;
      for (var j = 0; j < busy.length; j++) {
        if (intervalsOverlap(sUtc, eUtc, busy[j].start, busy[j].end)) {
          booked = true;
          break;
        }
      }
      var inPast = slotEnd <= now;
      var available = !booked && !inPast;

      slots.push({
        start: slot.toUTC().toISO(),
        end: slotEnd.toUTC().toISO(),
        available: available,
        label: booked ? "Unavailable" : inPast ? "Unavailable" : "Available",
      });

      slot = slotEnd;
    }

    days[dayKey] = { slots: slots };
    cursor = cursor.plus({ days: 1 });
  }

  res.status(200).json({
    ok: true,
    timezone: tz,
    slotMinutes: slotMinutes,
    shopHours: { start: startHour, end: endHour },
    month: monthParam,
    days: days,
  });
};
