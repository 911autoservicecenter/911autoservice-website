/**
 * Vercel catch-all routes sometimes leave req.query.path empty.
 * Read the real /api/<folder>/... path from the request URL instead.
 */
function segmentsAfter(req, folder) {
  var blobs = [];
  function push(value) {
    if (value != null && value !== "") blobs.push(String(value));
  }
  push(req && req.url);
  var headers = (req && req.headers) || {};
  push(headers["x-forwarded-uri"]);
  push(headers["x-vercel-original-path"]);
  push(headers["x-invoke-path"]);
  push(headers["x-original-url"]);
  push(headers["x-url"]);

  var marker = "/api/" + folder + "/";
  for (var i = 0; i < blobs.length; i++) {
    var raw = blobs[i].split("?")[0];
    var at = raw.indexOf(marker);
    if (at === -1) continue;
    return decodeURIComponent(raw.slice(at + marker.length))
      .split("/")
      .filter(Boolean);
  }

  var queryPath = req && req.query && (req.query.path || req.query["...path"]);
  if (Array.isArray(queryPath)) return queryPath.map(String).filter(Boolean);
  if (typeof queryPath === "string" && queryPath) {
    return queryPath.split("/").filter(Boolean);
  }

  var rel = String((req && req.url) || "").split("?")[0];
  if (rel.charAt(0) === "/" && rel.indexOf("/api/") === -1 && rel.length > 1) {
    return decodeURIComponent(rel.slice(1)).split("/").filter(Boolean);
  }
  return [];
}

module.exports = {
  segmentsAfter: segmentsAfter,
};
