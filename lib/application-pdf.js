const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

var PAGE_W = 612;
var PAGE_H = 792;
var MARGIN = 48;
var RED = rgb(0.62, 0.05, 0.08);
var INK = rgb(0.12, 0.12, 0.12);
var MUTED = rgb(0.35, 0.35, 0.35);

function ascii(value) {
  return String(value == null || value === "" ? "-" : value)
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "");
}

function wrapLines(text, font, size, maxWidth) {
  var raw = ascii(text).split(/\r?\n/);
  var lines = [];
  for (var p = 0; p < raw.length; p++) {
    var words = raw[p].split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      continue;
    }
    var line = "";
    for (var i = 0; i < words.length; i++) {
      var word = words[i];
      var next = line ? line + " " + word : word;
      if (font.widthOfTextAtSize(next, size) <= maxWidth) {
        line = next;
        continue;
      }
      if (line) lines.push(line);
      if (font.widthOfTextAtSize(word, size) <= maxWidth) {
        line = word;
        continue;
      }
      var chunk = "";
      for (var c = 0; c < word.length; c++) {
        var trial = chunk + word[c];
        if (font.widthOfTextAtSize(trial, size) > maxWidth && chunk) {
          lines.push(chunk);
          chunk = word[c];
        } else {
          chunk = trial;
        }
      }
      line = chunk;
    }
    if (line) lines.push(line);
  }
  return lines.length ? lines : [""];
}

function jobLines(job) {
  return [
    ["Company", job.company],
    ["Phone", job.phone],
    ["Title", job.title],
    ["Supervisor", job.supervisor],
    ["Dates", job.dates],
    ["Reason for leaving", job.reason],
    ["Duties", job.duties],
  ];
}

async function buildApplicationPdf(application) {
  var doc = await PDFDocument.create();
  var font = await doc.embedFont(StandardFonts.Helvetica);
  var bold = await doc.embedFont(StandardFonts.HelveticaBold);
  var page = null;
  var y = 0;
  var maxWidth = PAGE_W - MARGIN * 2;

  function newPage() {
    page = doc.addPage([PAGE_W, PAGE_H]);
    page.drawRectangle({ x: 0, y: PAGE_H - 36, width: PAGE_W, height: 36, color: RED });
    page.drawText("911 Auto Service Center", {
      x: MARGIN,
      y: PAGE_H - 24,
      size: 12,
      font: bold,
      color: rgb(1, 1, 1),
    });
    y = PAGE_H - 64;
  }

  function ensure(height) {
    if (!page || y - height < 48) newPage();
  }

  function write(text, options) {
    var size = options.size || 11;
    var used = options.bold ? bold : font;
    var color = options.color || INK;
    var gap = options.gap == null ? 4 : options.gap;
    var lines = wrapLines(text, used, size, maxWidth);
    for (var i = 0; i < lines.length; i++) {
      ensure(size + gap);
      if (lines[i]) {
        page.drawText(lines[i], { x: MARGIN, y: y - size, size: size, font: used, color: color });
      }
      y -= size + gap;
    }
  }

  function field(label, value) {
    write(label, { size: 9, bold: true, color: MUTED, gap: 2 });
    write(value || "-", { size: 11, gap: 8 });
  }

  function section(title) {
    ensure(28);
    y -= 6;
    page.drawRectangle({ x: MARGIN, y: y - 4, width: 72, height: 3, color: RED });
    y -= 16;
    write(title, { size: 13, bold: true, gap: 8 });
  }

  var submitted = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Detroit",
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date());

  newPage();
  write("Employment application", { size: 20, bold: true, gap: 6 });
  write("Position: Wrecker driver", { size: 12, bold: true, color: RED, gap: 4 });
  write("Submitted " + submitted, { size: 10, color: MUTED, gap: 12 });

  section("Personal information");
  field("Full legal name", application.name);
  field("Phone", application.phone);
  field("Email", application.email);
  field(
    "Address",
    [application.address, application.city, application.state, application.zip].filter(Boolean).join(", ")
  );
  field("18 years of age or older", application.over18);
  field("Authorized to work in the United States", application.authorized);

  section("Position");
  field("Date available to start", application.startDate);
  field("Years of driving experience", application.drivingExperience);
  field("Driver's license type", application.licenseType);
  field("Chauffeur's license", application.chauffeurLicense);
  field("Towing or wrecker experience", application.towingExperience || "None listed");

  section("Previous employment");
  var jobs = [
    ["Employer 1 — most recent", application.job1],
    ["Employer 2", application.job2],
    ["Employer 3", application.job3],
  ];
  for (var j = 0; j < jobs.length; j++) {
    write(jobs[j][0], { size: 12, bold: true, gap: 6 });
    var rows = jobLines(jobs[j][1] || {});
    for (var r = 0; r < rows.length; r++) field(rows[r][0], rows[r][1]);
  }

  section("Education");
  field("High school", application.highSchool);
  field("Graduated", application.hsGrad);
  field("College or trade school", application.college || "None");
  field("Degree or certificate", application.degree || "None");
  field("Other training or licenses", application.training || "None");

  section("References");
  var refs = [
    ["Reference 1", application.ref1Name, application.ref1Phone, application.ref1Relation],
    ["Reference 2", application.ref2Name, application.ref2Phone, application.ref2Relation],
    ["Reference 3", application.ref3Name, application.ref3Phone, application.ref3Relation],
  ];
  for (var n = 0; n < refs.length; n++) {
    write(refs[n][0], { size: 12, bold: true, gap: 6 });
    field("Name", refs[n][1]);
    field("Phone", refs[n][2]);
    field("How you know them", refs[n][3]);
  }

  section("Additional information");
  field("Note", application.note || "None");
  field("Resume", application.resumeAttached ? "A resume file was also attached to the email." : "No resume attached.");
  field("Applicant certified the information is true", "Yes");

  var pages = doc.getPages();
  for (var p = 0; p < pages.length; p++) {
    var label = "Page " + (p + 1) + " of " + pages.length;
    pages[p].drawText(label, {
      x: PAGE_W - MARGIN - font.widthOfTextAtSize(label, 9),
      y: 28,
      size: 9,
      font: font,
      color: MUTED,
    });
  }

  return Buffer.from(await doc.save());
}

function pdfFileName(name) {
  var safe = ascii(name)
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!safe || safe === "-") safe = "applicant";
  if (safe.length > 60) safe = safe.slice(0, 60).replace(/-+$/g, "");
  return "Wrecker-driver-application-" + safe + ".pdf";
}

module.exports = {
  buildApplicationPdf: buildApplicationPdf,
  pdfFileName: pdfFileName,
};
