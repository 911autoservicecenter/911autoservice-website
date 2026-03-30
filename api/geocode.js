/** Proxy Photon geocoder so the browser does not hit CORS limits on the live site. */
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  var q = req.query && req.query.q;
  if (!q || String(q).trim().length < 2) {
    res.status(400).json({ error: "Missing q" });
    return;
  }
  var url =
    "https://photon.komoot.io/api/?limit=1&lang=en&bbox=-91,41,-82,49&q=" + encodeURIComponent(String(q));
  try {
    var r = await fetch(url);
    if (!r.ok) {
      res.status(502).json({ error: "Geocoder failed" });
      return;
    }
    var data = await r.json();
    res.status(200).json(data);
  } catch (e) {
    res.status(502).json({ error: "Geocoder failed" });
  }
};
