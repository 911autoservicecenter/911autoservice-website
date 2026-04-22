const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const blob = require("@vercel/blob");

function sanitizeString(s, max) {
  if (s == null) return "";
  var t = String(s).trim();
  if (t.length > max) t = t.slice(0, max);
  return t;
}

function sanitizePhotos(input) {
  var out = [];
  if (!Array.isArray(input)) return out;
  for (var i = 0; i < input.length; i++) {
    var row = input[i];
    if (!row || typeof row !== "object") continue;
    var url = sanitizeString(row.url, 2000);
    if (!url) continue;
    out.push({
      url: url,
      alt: sanitizeString(row.alt, 300),
    });
    if (out.length >= 12) break;
  }
  return out;
}

function normalizeListingPhotos(body) {
  var photos = sanitizePhotos(body && body.photos);
  if (!photos.length) {
    var imageUrl = sanitizeString(body && body.imageUrl, 2000);
    if (imageUrl) {
      photos.push({
        url: imageUrl,
        alt: sanitizeString(body && body.imageAlt, 300),
      });
    }
  }
  return photos;
}

function getListingPrimaryFields(photos, fallbackAlt) {
  if (photos && photos.length) {
    return {
      imageUrl: photos[0].url,
      imageAlt: sanitizeString(photos[0].alt || fallbackAlt, 300),
    };
  }
  return { imageUrl: "", imageAlt: "" };
}

function extensionFromFile(fileName, mimeType) {
  var ext = path.extname(fileName || "").toLowerCase();
  if (ext && ext.length <= 8) return ext;
  var map = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/avif": ".avif",
  };
  return map[mimeType] || ".jpg";
}

function isImageType(mimeType) {
  return typeof mimeType === "string" && mimeType.indexOf("image/") === 0;
}

async function uploadFileToBlob(file) {
  var mime = String(file.mimetype || "");
  if (!isImageType(mime)) {
    var typeErr = new Error("Only image files can be uploaded.");
    typeErr.code = "UNSUPPORTED_MEDIA_TYPE";
    throw typeErr;
  }
  var fileBytes = await fs.readFile(file.filepath);
  var ext = extensionFromFile(file.originalFilename, mime);
  var key =
    "for-sale/" +
    Date.now() +
    "-" +
    crypto.randomBytes(6).toString("hex") +
    ext;
  var result = await blob.put(key, fileBytes, {
    access: "public",
    contentType: mime,
    addRandomSuffix: false,
    cacheControlMaxAge: 60 * 60 * 24 * 30,
  });
  return result.url;
}

async function deletePhotos(photos) {
  if (!Array.isArray(photos) || !photos.length) return;
  var urls = photos
    .map(function (p) {
      return p && p.url ? String(p.url) : "";
    })
    .filter(Boolean);
  if (!urls.length) return;
  await blob.del(urls);
}

module.exports = {
  sanitizePhotos,
  normalizeListingPhotos,
  getListingPrimaryFields,
  uploadFileToBlob,
  deletePhotos,
};
