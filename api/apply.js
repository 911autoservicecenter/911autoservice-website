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

function jobBlock(label, job) {
  return [
    label,
    "Company: " + job.company,
    "Phone: " + job.phone,
    "Title: " + job.title,
    "Supervisor: " + job.supervisor,
    "Dates: " + job.dates,
    "Reason for leaving: " + job.reason,
    "Duties: " + job.duties,
  ].join("\n");
}

function applicationText(application, file) {
  return [
    "Employment application — 911 Auto Service Center",
    "Position: Wrecker driver",
    "",
    "PERSONAL INFORMATION",
    "Name: " + application.name,
    "Phone: " + application.phone,
    "Email: " + application.email,
    "Address: " + application.address + ", " + application.city + ", " + application.state + " " + application.zip,
    "18 or older: " + application.over18,
    "Authorized to work in the US: " + application.authorized,
    "",
    "JOB",
    "Date available: " + application.startDate,
    "Years of driving experience: " + application.drivingExperience,
    "Driver's license type: " + application.licenseType,
    "Chauffeur's license: " + application.chauffeurLicense,
    "Towing experience: " + (application.towingExperience || "(none listed)"),
    "",
    "PREVIOUS EMPLOYMENT",
    jobBlock("Employer 1", application.job1),
    "",
    jobBlock("Employer 2", application.job2),
    "",
    jobBlock("Employer 3", application.job3),
    "",
    "EDUCATION",
    "High school: " + application.highSchool,
    "Graduated: " + application.hsGrad,
    "College or trade school: " + (application.college || "(none)"),
    "Degree or certificate: " + (application.degree || "(none)"),
    "Other training or licenses: " + (application.training || "(none)"),
    "",
    "REFERENCES",
    "1. " + application.ref1Name + " — " + application.ref1Phone + " — " + application.ref1Relation,
    "2. " + application.ref2Name + " — " + application.ref2Phone + " — " + application.ref2Relation,
    "3. " + application.ref3Name + " — " + application.ref3Phone + " — " + application.ref3Relation,
    "",
    "Note:",
    application.note || "(none)",
    "",
    file && file.filepath ? "Resume attached." : "No resume attached.",
  ].join("\n");
}

async function sendViaFormSubmit(application, file, to) {
  var form = new FormData();
  form.append("name", application.name);
  form.append("email", application.email);
  form.append("_replyto", application.email);
  form.append("_subject", "911 Auto application — " + application.name + " — Wrecker driver");
  form.append("_captcha", "false");
  form.append("_template", "table");
  form.append("message", applicationText(application, file));
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
  var body = applicationText(application, file);
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
      zip: sanitize(field(parsed.fields, "zip"), 12),
      over18: sanitize(field(parsed.fields, "over18"), 20),
      authorized: sanitize(field(parsed.fields, "authorized"), 20),
      position: "Wrecker driver",
      chauffeurLicense: sanitize(field(parsed.fields, "chauffeurLicense"), 20),
      licenseType: sanitize(field(parsed.fields, "licenseType"), 80),
      drivingExperience: sanitize(field(parsed.fields, "drivingExperience"), 40),
      towingExperience: sanitize(field(parsed.fields, "towingExperience"), 160),
      startDate: sanitize(field(parsed.fields, "startDate"), 80),
      job1: {
        company: sanitize(field(parsed.fields, "employer"), 160),
        phone: sanitize(field(parsed.fields, "employerPhone"), 40),
        title: sanitize(field(parsed.fields, "jobTitle"), 120),
        supervisor: sanitize(field(parsed.fields, "supervisor"), 120),
        dates: sanitize(field(parsed.fields, "datesEmployed"), 80),
        reason: sanitize(field(parsed.fields, "reason"), 200),
        duties: sanitize(field(parsed.fields, "duties"), 1500),
      },
      job2: {
        company: sanitize(field(parsed.fields, "employer2"), 160),
        phone: sanitize(field(parsed.fields, "employerPhone2"), 40),
        title: sanitize(field(parsed.fields, "jobTitle2"), 120),
        supervisor: sanitize(field(parsed.fields, "supervisor2"), 120),
        dates: sanitize(field(parsed.fields, "datesEmployed2"), 80),
        reason: sanitize(field(parsed.fields, "reason2"), 200),
        duties: sanitize(field(parsed.fields, "duties2"), 1500),
      },
      job3: {
        company: sanitize(field(parsed.fields, "employer3"), 160),
        phone: sanitize(field(parsed.fields, "employerPhone3"), 40),
        title: sanitize(field(parsed.fields, "jobTitle3"), 120),
        supervisor: sanitize(field(parsed.fields, "supervisor3"), 120),
        dates: sanitize(field(parsed.fields, "datesEmployed3"), 80),
        reason: sanitize(field(parsed.fields, "reason3"), 200),
        duties: sanitize(field(parsed.fields, "duties3"), 1500),
      },
      highSchool: sanitize(field(parsed.fields, "highSchool"), 160),
      hsGrad: sanitize(field(parsed.fields, "hsGrad"), 20),
      college: sanitize(field(parsed.fields, "college"), 160),
      degree: sanitize(field(parsed.fields, "degree"), 160),
      training: sanitize(field(parsed.fields, "training"), 300),
      ref1Name: sanitize(field(parsed.fields, "ref1Name"), 120),
      ref1Phone: sanitize(field(parsed.fields, "ref1Phone"), 40),
      ref1Relation: sanitize(field(parsed.fields, "ref1Relation"), 120),
      ref2Name: sanitize(field(parsed.fields, "ref2Name"), 120),
      ref2Phone: sanitize(field(parsed.fields, "ref2Phone"), 40),
      ref2Relation: sanitize(field(parsed.fields, "ref2Relation"), 120),
      ref3Name: sanitize(field(parsed.fields, "ref3Name"), 120),
      ref3Phone: sanitize(field(parsed.fields, "ref3Phone"), 40),
      ref3Relation: sanitize(field(parsed.fields, "ref3Relation"), 120),
      note: sanitize(field(parsed.fields, "note"), 2000),
    };
    if (!application.name || !application.phone || !application.email || !application.address || !application.city || !application.zip) {
      res.status(400).json({ ok: false, message: "Name, phone, email, and full address are required." });
      return;
    }
    if (application.over18 !== "Yes" && application.over18 !== "No") {
      res.status(400).json({ ok: false, message: "Say whether you are 18 or older." });
      return;
    }
    if (application.authorized !== "Yes" && application.authorized !== "No") {
      res.status(400).json({ ok: false, message: "Say whether you are authorized to work in the United States." });
      return;
    }
    if (!application.drivingExperience || !application.startDate || !application.licenseType) {
      res.status(400).json({ ok: false, message: "Fill out the job section, including your driver's license type." });
      return;
    }
    var jobs = [application.job1, application.job2, application.job3];
    var jobMissing = jobs.some(function (job) {
      return !job.company || !job.phone || !job.title || !job.supervisor || !job.dates || !job.reason || !job.duties;
    });
    if (jobMissing) {
      res.status(400).json({ ok: false, message: "Fill out all three previous jobs. Write none if you do not have that job." });
      return;
    }
    if (!application.highSchool || (application.hsGrad !== "Yes" && application.hsGrad !== "No")) {
      res.status(400).json({ ok: false, message: "Fill out your education." });
      return;
    }
    if (!application.ref1Name || !application.ref1Phone || !application.ref1Relation || !application.ref2Name || !application.ref2Phone || !application.ref2Relation || !application.ref3Name || !application.ref3Phone || !application.ref3Relation) {
      res.status(400).json({ ok: false, message: "Fill out all three references." });
      return;
    }
    if (field(parsed.fields, "certified") !== "Yes") {
      res.status(400).json({ ok: false, message: "Check the box certifying this application is true." });
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
