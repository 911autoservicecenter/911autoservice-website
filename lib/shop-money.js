/**
 * Dollar strings and cent amounts for the shop. Prices are stored as integer cents.
 */

function dollarsToCents(raw) {
  if (typeof raw === "number" && isFinite(raw)) {
    raw = raw.toFixed(2);
  }
  var s = String(raw == null ? "" : raw)
    .trim()
    .replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  var parts = s.split(".");
  var dollars = parseInt(parts[0], 10);
  var frac = parts[1] || "";
  if (frac.length > 2) return null;
  while (frac.length < 2) frac += "0";
  if (!isFinite(dollars)) return null;
  return dollars * 100 + parseInt(frac, 10);
}

function formatMoney(cents) {
  var n = parseInt(cents, 10);
  if (!isFinite(n)) n = 0;
  var sign = n < 0 ? "-" : "";
  var abs = Math.abs(n);
  var dollars = Math.floor(abs / 100);
  var frac = String(abs % 100);
  if (frac.length < 2) frac = "0" + frac;
  return sign + "$" + dollars.toLocaleString("en-US") + "." + frac;
}

module.exports = {
  dollarsToCents: dollarsToCents,
  formatMoney: formatMoney,
};
