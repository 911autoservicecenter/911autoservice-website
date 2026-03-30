/**
 * Creates a Shop Monkey customer + appointment using server-side API token.
 * Set in Vercel → Project → Settings → Environment Variables:
 *   SHOPMONKEY_API_TOKEN   (Bearer JWT from Settings → Integration → API Keys)
 *   SHOPMONKEY_LOCATION_ID (UUID for your shop location — from Shop Monkey or API)
 * Never commit these values to git.
 */
const SM = "https://api.shopmonkey.cloud/v3";

function readJsonBody(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    return Promise.resolve(req.body);
  }
  if (typeof req.body === "string") {
    try {
      return Promise.resolve(JSON.parse(req.body || "{}"));
    } catch (e) {
      return Promise.resolve({});
    }
  }
  return new Promise(function (resolve, reject) {
    var chunks = [];
    req.on("data", function (c) {
      chunks.push(c);
    });
    req.on("end", function () {
      try {
        var raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

async function smFetch(path, token, opts) {
  opts = opts || {};
  var r = await fetch(SM + path, {
    method: opts.method || "GET",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  var data = await r.json().catch(function () {
    return {};
  });
  return { ok: r.ok, status: r.status, data: data };
}

function normalizePhone(phone) {
  var d = String(phone || "").replace(/\D/g, "");
  if (d.length === 10) return "+1" + d;
  if (d.length === 11 && d[0] === "1") return "+" + d;
  return phone;
}

function addHours(isoStart, hours) {
  var d = new Date(isoStart);
  d.setHours(d.getHours() + hours);
  return d.toISOString();
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Content-Type", "application/json");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, message: "Method not allowed" });
    return;
  }

  var token = process.env.SHOPMONKEY_API_TOKEN;
  var locationId = process.env.SHOPMONKEY_LOCATION_ID;
  if (!token || !locationId) {
    res.status(503).json({
      ok: false,
      message:
        "Online booking is not configured. Call 517-677-3173 or use the scheduler above.",
    });
    return;
  }

  var body;
  try {
    body = await readJsonBody(req);
  } catch (e) {
    res.status(400).json({ ok: false, message: "Invalid JSON body." });
    return;
  }

  var first = String(body.firstName || "").trim();
  var last = String(body.lastName || "").trim();
  var email = String(body.email || "").trim();
  var phone = normalizePhone(body.phone);
  var startDate = String(body.startDate || "").trim();
  var vehicle = String(body.vehicle || "").trim();
  var notes = String(body.notes || "").trim();

  if (first.length < 1 || last.length < 1) {
    res.status(400).json({ ok: false, message: "Please enter your first and last name." });
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ ok: false, message: "Please enter a valid email address." });
    return;
  }
  if (phone.replace(/\D/g, "").length < 10) {
    res.status(400).json({ ok: false, message: "Please enter a valid phone number." });
    return;
  }
  if (!startDate) {
    res.status(400).json({ ok: false, message: "Please choose a date and time." });
    return;
  }

  var startIso = new Date(startDate).toISOString();
  if (isNaN(new Date(startDate).getTime())) {
    res.status(400).json({ ok: false, message: "Invalid date or time." });
    return;
  }
  var endIso = addHours(startIso, 1);

  var customerPayload = {
    customerType: "Customer",
    firstName: first.slice(0, 80),
    lastName: last.slice(0, 80),
    locationId: locationId,
    emails: [{ email: email.slice(0, 120), primary: true }],
    phoneNumbers: [{ number: phone.slice(0, 32), primary: true }],
  };

  var cr = await smFetch("/customer", token, { method: "POST", body: customerPayload });
  if (!cr.ok || !cr.data.success || !cr.data.data) {
    res.status(502).json({
      ok: false,
      message:
        (cr.data && cr.data.message) ||
        "Could not save your contact info. Please call 517-677-3173.",
    });
    return;
  }

  var cust = cr.data.data;
  var emailId = cust.emails && cust.emails[0] && cust.emails[0].id;
  var phoneId = cust.phoneNumbers && cust.phoneNumbers[0] && cust.phoneNumbers[0].id;

  var apptNote = [vehicle && "Vehicle: " + vehicle, notes].filter(Boolean).join("\n").slice(0, 4000);

  var appointmentPayload = {
    name: "Website appointment request",
    startDate: startIso,
    endDate: endIso,
    color: "blue",
    customerId: cust.id,
    locationId: locationId,
    note: apptNote || "Requested via website.",
    origin: "AppointmentScheduler",
    attributionSource: "AppointmentScheduler",
    sendConfirmation: true,
    sendReminder: true,
    allDay: false,
  };
  if (emailId) appointmentPayload.customerEmailId = emailId;
  if (phoneId) appointmentPayload.customerPhoneNumberId = phoneId;

  var ar = await smFetch("/appointment", token, { method: "POST", body: appointmentPayload });
  if (!ar.ok || !ar.data.success) {
    res.status(502).json({
      ok: false,
      message:
        (ar.data && ar.data.message) ||
        "Could not complete the appointment. Please call 517-677-3173.",
    });
    return;
  }

  res.status(200).json({ ok: true, message: "Your appointment request was submitted." });
};
