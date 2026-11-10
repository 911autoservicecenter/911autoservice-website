/**
 * Reads a product title and fitment line into make, model, and years.
 * Universal parts match every vehicle.
 */
(function (root) {
  var OPEN_END = 2027;

  var GENERATIONS = {
    "Ford|F-150": [
      [2009, 2014],
      [2015, 2020],
      [2021, 2027],
    ],
    "Ford|F-150 Raptor": [
      [2010, 2014],
      [2017, 2020],
      [2021, 2027],
    ],
    "Ford|F-250/F-350": [
      [2008, 2010],
      [2011, 2016],
      [2017, 2022],
      [2023, 2027],
    ],
    "Chevy|Silverado 1500": [
      [2007, 2013],
      [2014, 2018],
      [2019, 2027],
    ],
    "Chevy|Silverado 2500/3500": [
      [2007, 2014],
      [2015, 2019],
      [2020, 2023],
      [2024, 2027],
    ],
    "Chevy|Colorado": [
      [2015, 2022],
      [2023, 2027],
    ],
    "GMC|Sierra 1500": [
      [2007, 2013],
      [2014, 2018],
      [2019, 2027],
    ],
    "GMC|Sierra 2500/3500": [
      [2007, 2014],
      [2015, 2019],
      [2020, 2023],
      [2024, 2027],
    ],
    "GMC|Canyon": [
      [2015, 2022],
      [2023, 2027],
    ],
    "Toyota|Tundra": [
      [2007, 2013],
      [2014, 2021],
      [2022, 2027],
    ],
    "Toyota|Tacoma": [
      [2005, 2015],
      [2016, 2023],
      [2024, 2027],
    ],
    "Toyota|4Runner": [
      [2010, 2024],
      [2025, 2027],
    ],
  };

  var DEFAULT_RANGE = {
    "Ford|Bronco": [2021, 2027],
    "Ford|Bronco Raptor": [2022, 2027],
    "Jeep|Wrangler JK": [2007, 2018],
    "Jeep|Wrangler JL": [2018, 2027],
    "Jeep|Gladiator": [2020, 2027],
    "Lexus|GX 470": [2003, 2009],
    "Lexus|GX 460": [2010, 2023],
    "Lexus|GX 550": [2024, 2027],
    "Toyota|Land Cruiser": [2024, 2027],
  };

  function yearOk(n) {
    return n >= 1990 && n <= 2035;
  }

  function extractYears(text) {
    var src = String(text || "");
    var m = src.match(/(\d{4})\s*[-–]\s*(\d{4})/);
    if (m && yearOk(+m[1]) && yearOk(+m[2]) && +m[2] >= +m[1]) {
      return { start: +m[1], end: +m[2] };
    }
    m = src.match(/(?:^|[^\d])(\d{2})\s*[-–]\s*(\d{2})(?!\d)/);
    if (m) {
      var a = (+m[1] >= 90 ? 1900 : 2000) + +m[1];
      var b = (+m[2] >= 90 ? 1900 : 2000) + +m[2];
      if (yearOk(a) && yearOk(b) && b >= a) return { start: a, end: b };
    }
    m = src.match(/(\d{4})\s*\+/);
    if (m && yearOk(+m[1])) return { start: +m[1], end: OPEN_END };
    m = src.match(/(\d{4})/);
    if (m && yearOk(+m[1])) return { start: +m[1], single: true };
    return null;
  }

  function generationContaining(make, model, year) {
    var gens = GENERATIONS[make + "|" + model];
    if (!gens) return null;
    for (var i = 0; i < gens.length; i++) {
      if (year >= gens[i][0] && year <= gens[i][1]) return { start: gens[i][0], end: gens[i][1] };
    }
    return null;
  }

  function detectModels(phrase) {
    var s = String(phrase || "");
    var found = [];
    var used = {};
    function add(make, model) {
      var key = make + "|" + model;
      if (used[key]) return;
      used[key] = true;
      found.push({ make: make, model: model });
    }
    function take(re) {
      var tester = new RegExp(re.source, re.flags.replace("g", ""));
      if (!tester.test(s)) return false;
      s = s.replace(new RegExp(re.source, "gi"), " ");
      return true;
    }
    if (take(/bronco\s+raptors?/gi)) add("Ford", "Bronco Raptor");
    if (take(/broncos?/gi)) add("Ford", "Bronco");
    if (take(/f[\s-]*150\s+raptors?/gi)) add("Ford", "F-150 Raptor");
    else if (/f[\s-]*150/i.test(s) && /\braptors?\b/i.test(s)) {
      add("Ford", "F-150");
      add("Ford", "F-150 Raptor");
      s = s.replace(/f[\s-]*150s?/gi, " ").replace(/\braptors?\b/gi, " ");
    }
    if (take(/f[\s-]*150s?/gi)) add("Ford", "F-150");
    if (take(/super\s*dut(?:y|ies)|f[\s-]*250|f[\s-]*350/gi)) add("Ford", "F-250/F-350");
    if (take(/silverados?[\s-]*(?:hd|2500|3500)/gi)) add("Chevy", "Silverado 2500/3500");
    else if (/silverado/i.test(s)) add("Chevy", "Silverado 1500");
    if (take(/sierras?[\s-]*(?:hd|2500|3500)/gi)) add("GMC", "Sierra 2500/3500");
    else if (/sierra/i.test(s)) add("GMC", "Sierra 1500");
    if (take(/colorados?/gi)) add("Chevy", "Colorado");
    if (take(/canyons?/gi)) add("GMC", "Canyon");
    if (take(/tundras?/gi)) add("Toyota", "Tundra");
    if (take(/tacomas?/gi)) add("Toyota", "Tacoma");
    if (take(/4[\s-]*runners?/gi)) add("Toyota", "4Runner");
    if (take(/land\s*cruisers?/gi)) add("Toyota", "Land Cruiser");
    if (take(/gx[\s-]*550/gi)) add("Lexus", "GX 550");
    if (take(/gx[\s-]*460/gi)) add("Lexus", "GX 460");
    if (take(/gx[\s-]*470/gi)) add("Lexus", "GX 470");
    if (take(/rams?[\s-]*2500|rams?[\s-]*3500/gi)) add("RAM", "2500/3500");
    if (take(/rams?[\s-]*1500/gi)) add("RAM", "1500");
    if (take(/gladiators?|jeeps?[\s-]*jt|\bjt\b/gi)) add("Jeep", "Gladiator");
    if (take(/jeeps?[\s-]*jl|\bjl\b|wranglers?[\s-]*jl/gi)) add("Jeep", "Wrangler JL");
    if (take(/jeeps?[\s-]*jk|\bjk\b|wranglers?[\s-]*jk/gi)) add("Jeep", "Wrangler JK");
    return found;
  }

  function rangeFor(make, model, years, phrase) {
    if (years && years.end != null) return { start: years.start, end: years.end };
    if (years && years.single) {
      var gen = generationContaining(make, model, years.start);
      return gen || { start: years.start, end: years.start };
    }
    if (model === "4Runner" && /6th\s*gen/i.test(phrase)) return { start: 2025, end: 2027 };
    if (model === "4Runner" && /5th\s*gen/i.test(phrase)) return { start: 2010, end: 2024 };
    var known = DEFAULT_RANGE[make + "|" + model];
    return known ? { start: known[0], end: known[1] } : null;
  }

  function vehiclesInPhrase(phrase) {
    return detectModels(phrase).map(function (entry) {
      var range = rangeFor(entry.make, entry.model, extractYears(phrase), phrase);
      return {
        make: entry.make,
        model: entry.model,
        yearStart: range ? range.start : null,
        yearEnd: range ? range.end : null,
      };
    });
  }

  function vehiclesInText(text, splitCommas) {
    var src = String(text || "");
    var phrases = splitCommas ? src.split(",") : [src];
    var list = [];
    phrases.forEach(function (phrase) {
      vehiclesInPhrase(phrase).forEach(function (vehicle) {
        list.push(vehicle);
      });
    });
    return list;
  }

  function dedupe(list) {
    var seen = {};
    var out = [];
    list.forEach(function (vehicle) {
      var key = [vehicle.make, vehicle.model, vehicle.yearStart, vehicle.yearEnd].join("|");
      if (seen[key]) return;
      seen[key] = true;
      out.push(vehicle);
    });
    return out;
  }

  function parseProduct(item) {
    var title = item && item.title ? String(item.title) : "";
    var fitment = item && item.fitment ? String(item.fitment) : "";
    var fromTitle = vehiclesInText(title, false);
    var titled = {};
    fromTitle.forEach(function (vehicle) {
      titled[vehicle.make + "|" + vehicle.model] = true;
    });
    var merged = fromTitle.slice();
    vehiclesInText(fitment, true).forEach(function (vehicle) {
      if (!titled[vehicle.make + "|" + vehicle.model]) merged.push(vehicle);
    });
    var ranged = {};
    merged.forEach(function (vehicle) {
      if (vehicle.yearStart != null) ranged[vehicle.make + "|" + vehicle.model] = true;
    });
    merged = merged.filter(function (vehicle) {
      return vehicle.yearStart != null || !ranged[vehicle.make + "|" + vehicle.model];
    });
    var universal = /\buniversal\b/i.test(title) || /\buniversal\b/i.test(fitment) || merged.length === 0;
    return { universal: universal, vehicles: dedupe(merged) };
  }

  function matches(item, selection) {
    var make = selection && selection.make ? selection.make : "";
    if (!make) return true;
    var parsed = parseProduct(item);
    if (parsed.universal) return true;
    var model = selection.model || "";
    var year = selection.year ? parseInt(selection.year, 10) : null;
    return parsed.vehicles.some(function (vehicle) {
      if (vehicle.make !== make) return false;
      if (model && vehicle.model !== model) return false;
      if (year) {
        if (vehicle.yearStart == null) return true;
        return year >= vehicle.yearStart && year <= vehicle.yearEnd;
      }
      return true;
    });
  }

  function options(products) {
    var makes = {};
    (products || []).forEach(function (item) {
      var parsed = parseProduct(item);
      if (parsed.universal) return;
      parsed.vehicles.forEach(function (vehicle) {
        if (!makes[vehicle.make]) makes[vehicle.make] = {};
        if (!makes[vehicle.make][vehicle.model]) makes[vehicle.make][vehicle.model] = {};
        if (vehicle.yearStart == null) return;
        for (var year = vehicle.yearStart; year <= vehicle.yearEnd; year++) {
          makes[vehicle.make][vehicle.model][year] = true;
        }
      });
    });
    return makes;
  }

  var api = { parseProduct: parseProduct, matches: matches, options: options };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.ShopVehicles = api;
})(typeof window !== "undefined" ? window : global);
