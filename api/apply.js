/**
 * POST multipart — 911 Auto Service Center job application.
 * Emails the form plus resume to HIRING_NOTIFY_EMAIL.
 *
 * Required env:
 *   HIRING_NOTIFY_EMAIL
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
 */
const fs = require("fs");
const formidable = require("formidable");

function sanitize(value, max) {
  var text = String(value == null ? "" : value).trim();
  if (text.length > max) text = text.slice(0, max);
  return text;
}

function field(fields, name) {
  var value = fields && fields[name];
  if (Array.isArray(value)) value = value[0];
  return value;
}

function parseForm(req) {
  var form = formidable({
    multiples: false,
    maxFiles: 1,
    maxFileSize: 4 * 1024 * 1024,
    keepExtensions: true,
  });
  return new Promise(function (resolve, reject) {
    form.parse(req, function (err, fields, files) {
      if (err) reject(err);
      else resolve({ fields: fields || {}, files: files || {} });
    });
  });
}

function notifyAddress() {
  return String(process.env.HIRING_NOTIFY_EMAIL || "jimmy5489@gmail.com").trim();
}

async function sendViaFormSubmit(application, file, to) {
  var form = new FormData();
  form.append("name", application.name);
  form.append("email", application.email);
  form.append("_replyto", application.email);
  form.append("_subject", "911 Auto application — " + application.name + " — Wrecker driver");
  form.append("_captcha", "false");
  form.append("_template", "table");
  form.append("phone", application.phone);
  form.append("address", application.address);
  form.append("city", application.city);
  form.append("state", application.state);
  form.append("position", application.position);
  form.append("chauffeurLicense", application.chauffeurLicense);
  form.append("drivingExperience", application.drivingExperience);
  form.append("towingExperience", application.towingExperience);
  form.append("startDate", application.startDate);
  form.append("employer", application.employer);
  form.append("workHistory", application.workHistory);
  form.append(
    "message",
    [
      "New wrecker driver application for 911 Auto Service Center",
      "",
      "Name: " + application.name,
      "Phone: " + application.phone,
      "Email: " + application.email,
      "Address: " + application.address + ", " + application.city + ", " + application.state,
      "Chauffeur's license: " + application.chauffeurLicense,
      "Driving experience: " + application.drivingExperience,
      "Towing experience: " + (application.towingExperience || "(none listed)"),
      "Can start: " + application.startDate,
      "Most recent employer: " + (application.employer || "(none listed)"),
      "",
      "Work history:",
      application.workHistory,
      "",
      "Note:",
      application.note || "(none)",
      "",
      file && file.filepath ? "Resume attached." : "No resume attached.",
    ].join("\n")
  );
  if (file && file.filepath) {
    var bytes = fs.readFileSync(file.filepath);
    form.append(
      "attachment",
      new Blob([bytes], { type: file.mimetype || "application/octet-stream" }),
      file.originalFilename || "resume"
    );
  }
  var response = await fetch("https://formsubmit.co/ajax/" + encodeURIComponent(to), {
    method: "POST",
    headers: { Accept: "application/json" },
    body: form,
  });
  var data = {};
  try {
    data = await response.json();
  } catch (e) {
    data = {};
  }
  if (!response.ok || String(data.success) === "false") {
    var err = new Error((data && data.message) || "Could not email the application.");
    err.code = "MAIL_FAILED";
    throw err;
  }
}

async function sendMail(application, file) {
  var to = notifyAddress();
  var host = String(process.env.SMTP_HOST || "").trim();
  var user = String(process.env.SMTP_USER || "").trim();
  var pass = process.env.SMTP_PASS != null ? String(process.env.SMTP_PASS) : "";
  var port = parseInt(process.env.SMTP_PORT || "587", 10);
  if (!host || !user || !pass) {
    await sendViaFormSubmit(application, file, to);
    return;
  }
  var nodemailer = require("nodemailer");
  var transport = nodemailer.createTransport({
    host: host,
    port: port,
    secure: port === 465,
    auth: { user: user, pass: pass },
  });
  var body = [
    "New application for 911 Auto Service Center",
    "",
    "Name: " + application.name,
    "Phone: " + application.phone,
    "Email: " + application.email,
    "Address: " + application.address + ", " + application.city + ", " + application.state,
    "Position: " + application.position,
    "Chauffeur's license: " + application.chauffeurLicense,
    "Driving experience: " + application.drivingExperience,
    "Towing experience: " + (application.towingExperience || "(none listed)"),
    "Can start: " + application.startDate,
    "Most recent employer: " + (application.employer || "(none listed)"),
    "",
    "Work history:",
    application.workHistory,
    "",
    "Note:",
    application.note || "(none)",
  ].join("\n");
  var mail = {
    from: user,
    to: to,
    replyTo: application.email,
    subject: "911 Auto application — " + application.name + " — " + application.position,
    text: body,
  };
  if (file && file.filepath) {
    mail.attachments = [
      {
        filename: file.originalFilename || "resume",
        content: fs.readFileSync(file.filepath),
        contentType: file.mimetype || "application/octet-stream",
      },
    ];
  }
  await transport.sendMail(mail);
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
  try {
    var parsed = await parseForm(req);
    var application = {
      name: sanitize(field(parsed.fields, "name"), 120),
      phone: sanitize(field(parsed.fields, "phone"), 40),
      email: sanitize(field(parsed.fields, "email"), 120),
      address: sanitize(field(parsed.fields, "address"), 200),
      city: sanitize(field(parsed.fields, "city"), 80),
      state: sanitize(field(parsed.fields, "state"), 40),
      position: "Wrecker driver",
      chauffeurLicense: sanitize(field(parsed.fields, "chauffeurLicense"), 20),
      drivingExperience: sanitize(field(parsed.fields, "drivingExperience"), 40),
      towingExperience: sanitize(field(parsed.fields, "towingExperience"), 120),
      startDate: sanitize(field(parsed.fields, "startDate"), 80),
      employer: sanitize(field(parsed.fields, "employer"), 160),
      workHistory: sanitize(field(parsed.fields, "workHistory"), 3000),
      note: sanitize(field(parsed.fields, "note"), 2000),
    };
    if (!application.name || !application.phone || !application.email || !application.address || !application.city) {
      res.status(400).json({ ok: false, message: "Name, phone, email, and address are required." });
      return;
    }
    if (!application.drivingExperience || !application.startDate || !application.workHistory) {
      res.status(400).json({ ok: false, message: "Fill out your driving experience, start date, and work history." });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(application.email)) {
      res.status(400).json({ ok: false, message: "Enter a valid email address." });
      return;
    }
    if (application.chauffeurLicense !== "Yes" && application.chauffeurLicense !== "No") {
      res.status(400).json({ ok: false, message: "Tell us if you have a chauffeur’s license." });
      return;
    }
    var resume = parsed.files.resume;
    if (Array.isArray(resume)) resume = resume[0];
    if (resume && !resume.filepath) resume = null;
    await sendMail(application, resume);
    res.status(200).json({
      ok: true,
      message: "Application sent. 911 Auto Service Center will review it.",
    });
  } catch (e) {
    if (e && e.code === "MAIL_FAILED") {
      res.status(502).json({
        ok: false,
        message: e.message || "Could not email the application.",
      });
      return;
    }
    if (e && (e.code === "ETOOBIG" || e.httpCode === 413)) {
      res.status(413).json({ ok: false, message: "Resume must be 4MB or smaller." });
      return;
    }
    res.status(500).json({ ok: false, message: "Could not send the application." });
  }
};
