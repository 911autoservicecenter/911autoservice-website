/**
 * POST multipart/form-data (auth) with one or more `photos` files.
 */
const formidable = require("formidable");
const http = require("../lib/for-sale-http");
const photosLib = require("../lib/for-sale-photos");

function parseForm(req) {
  var form = formidable({
    multiples: true,
    maxFiles: 12,
    maxFileSize: 10 * 1024 * 1024,
    keepExtensions: true,
  });
  return new Promise(function (resolve, reject) {
    form.parse(req, function (err, fields, files) {
      if (err) {
        reject(err);
        return;
      }
      resolve({ fields: fields || {}, files: files || {} });
    });
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
  if (!http.requireAuth(req, res)) return;

  try {
    var parsed = await parseForm(req);
    var fileValue = parsed.files.photos;
    var list = Array.isArray(fileValue) ? fileValue : fileValue ? [fileValue] : [];
    if (!list.length) {
      res.status(400).json({ ok: false, message: "Select one or more photo files." });
      return;
    }

    var uploaded = [];
    for (var i = 0; i < list.length; i++) {
      var url = await photosLib.uploadFileToBlob(list[i]);
      uploaded.push({ url: url, alt: "" });
    }
    res.status(200).json({ ok: true, photos: uploaded });
  } catch (e) {
    if (e && (e.code === "UNSUPPORTED_MEDIA_TYPE" || e.httpCode === 415)) {
      res.status(415).json({ ok: false, message: "Only image files are allowed." });
      return;
    }
    if (e && (e.code === "ETOOBIG" || e.httpCode === 413)) {
      res.status(413).json({ ok: false, message: "Each photo must be 10MB or smaller." });
      return;
    }
    var em = e && e.message ? String(e.message) : "";
    var msg =
      em && em.toLowerCase().indexOf("blob") !== -1
        ? "Photo storage is not configured. Add BLOB_READ_WRITE_TOKEN in Vercel and redeploy."
        : "Could not upload photo(s).";
    res.status(500).json({ ok: false, message: msg });
  }
};
