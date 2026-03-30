/** Proxy Photon search (multiple results) for address suggestions while typing. */
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
    res.status(200).json({ type: "FeatureCollection", features: [] });
    return;
  }
  var url =
    "https://photon.komoot.io/api/?limit=8&lang=en&bbox=-91,41,-82,49&q=" + encodeURIComponent(String(q).trim());
  try {
    var r = await fetch(url);
    if (!r.ok) {
      res.status(200).json({ type: "FeatureCollection", features: [] });
      return;
    }
    var data = await r.json();
    res.status(200).json(data);
  } catch (e) {
    res.status(200).json({ type: "FeatureCollection", features: [] });
  }
};
