/** Proxy OSRM driving route so the browser does not hit CORS limits on the live site. */
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
  var path = req.query && req.query.path;
  if (!path || typeof path !== "string") {
    res.status(400).json({ error: "Missing path" });
    return;
  }
  if (!/^[-0-9.]+,[-0-9.]+;[-0-9.]+,[-0-9.]+$/.test(path.trim())) {
    res.status(400).json({ error: "Invalid path" });
    return;
  }
  var bases = [
    "https://router.project-osrm.org/route/v1/driving/",
    "https://routing.openstreetmap.de/routed-car/route/v1/driving/"
  ];
  for (var i = 0; i < bases.length; i++) {
    try {
      var r = await fetch(bases[i] + path + "?overview=false");
      if (!r.ok) continue;
      var data = await r.json();
      if (data.code === "Ok" && data.routes && data.routes[0]) {
        res.status(200).json(data);
        return;
      }
    } catch (e) {
      /* try next mirror */
    }
  }
  res.status(502).json({ error: "Route failed" });
};
