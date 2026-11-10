const fs = require("fs/promises");

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

function isImageType(mimeType) {
  return typeof mimeType === "string" && mimeType.indexOf("image/") === 0;
}

function photoStorage() {
  var base = String(process.env.SHOP_PHOTO_UPLOAD_URL || "").replace(/\/$/, "");
  var token = String(process.env.SHOP_PHOTO_TOKEN || "").trim();
  if (!base || !token) {
    var err = new Error("Photo storage is not configured.");
    err.code = "PHOTO_STORAGE";
    throw err;
  }
  return { base: base, token: token };
}

function photoNameFromUrl(url) {
  var base = String(process.env.SHOP_PHOTO_UPLOAD_URL || "").replace(/\/$/, "");
  var clean = String(url || "").split("?")[0];
  if (!base || clean.indexOf(base + "/") !== 0) return "";
  var name = clean.slice(base.length + 1);
  if (!/^[a-f0-9]{32}\.(jpg|png|webp|gif)$/.test(name)) return "";
  return name;
}

async function uploadFileToBlob(file) {
  var mime = String(file.mimetype || "");
  if (!isImageType(mime)) {
    var typeErr = new Error("Only image files can be uploaded.");
    typeErr.code = "UNSUPPORTED_MEDIA_TYPE";
    throw typeErr;
  }
  var storage = photoStorage();
  var fileBytes = await fs.readFile(file.filepath);
  var response = await fetch(storage.base, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + storage.token,
      "Content-Type": "application/octet-stream",
    },
    body: fileBytes,
  });
  var data = await response.json().catch(function () {
    return {};
  });
  if (!response.ok || !data.url) {
    var upErr = new Error(data.message || "Could not store photo.");
    upErr.code = "PHOTO_STORAGE";
    throw upErr;
  }
  return String(data.url);
}

async function deletePhotos(photos) {
  if (!Array.isArray(photos) || !photos.length) return;
  var storage;
  try {
    storage = photoStorage();
  } catch (e) {
    return;
  }
  for (var i = 0; i < photos.length; i++) {
    var name = photoNameFromUrl(photos[i] && photos[i].url);
    if (!name) continue;
    await fetch(storage.base + "/" + name, {
      method: "DELETE",
      headers: { Authorization: "Bearer " + storage.token },
    });
  }
}

module.exports = {
  sanitizePhotos,
  normalizeListingPhotos,
  getListingPrimaryFields,
  uploadFileToBlob,
  deletePhotos,
};
