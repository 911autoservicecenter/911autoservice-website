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

async function sendMail(application, file) {
  var to = String(process.env.HIRING_NOTIFY_EMAIL || "").trim();
  var host = String(process.env.SMTP_HOST || "").trim();
  var user = String(process.env.SMTP_USER || "").trim();
  var pass = process.env.SMTP_PASS != null ? String(process.env.SMTP_PASS) : "";
  var port = parseInt(process.env.SMTP_PORT || "587", 10);
  if (!to || !host || !user || !pass) {
    var missing = new Error("MAIL_NOT_CONFIGURED");
    missing.code = "MAIL_NOT_CONFIGURED";
    throw missing;
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
    "Position: " + application.position,
    "Chauffeur's license: " + application.chauffeurLicense,
    "",
    "Note:",
    application.note || "(none)",
  ].join("\n");
  await transport.sendMail({
    from: user,
    to: to,
    replyTo: application.email,
    subject: "911 Auto application — " + application.name + " — " + application.position,
    text: body,
    attachments: [
      {
        filename: file.originalFilename || "resume",
        content: fs.readFileSync(file.filepath),
        contentType: file.mimetype || "application/octet-stream",
      },
    ],
  });
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
      position: "Wrecker driver",
      chauffeurLicense: sanitize(field(parsed.fields, "chauffeurLicense"), 20),
      note: sanitize(field(parsed.fields, "note"), 2000),
    };
    if (!application.name || !application.phone || !application.email) {
      res.status(400).json({ ok: false, message: "Name, phone, and email are required." });
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
    if (!resume || !resume.filepath) {
      res.status(400).json({ ok: false, message: "Attach your resume." });
      return;
    }
    await sendMail(application, resume);
    res.status(200).json({
      ok: true,
      message: "Application sent. 911 Auto Service Center will review it.",
    });
  } catch (e) {
    if (e && e.code === "MAIL_NOT_CONFIGURED") {
      res.status(503).json({
        ok: false,
        message: "Applications are not set up to email yet. The shop still needs the email settings turned on.",
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
