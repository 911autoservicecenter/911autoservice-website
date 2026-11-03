/**
 * Shop catalog, orders, and pickup/shipping settings in the same Redis as for-sale.
 */
const redisStore = require("./for-sale-store");
const photosLib = require("./for-sale-photos");
const money = require("./shop-money");

const PRODUCTS_KEY = "shop:products:v1";
const ORDERS_KEY = "shop:orders:v1";
const SETTINGS_KEY = "shop:settings:v1";
const MAX_ORDERS = 300;
const MAX_UNIT_CENTS = 1000000;

function sanitizeString(s, max) {
  if (s == null) return "";
  var t = String(s).trim();
  if (t.length > max) t = t.slice(0, max);
  return t;
}

async function readKey(key) {
  var r = redisStore.getRedis();
  if (!r) return null;
  var v = await r.get(key);
  if (v == null) return null;
  if (typeof v === "string") {
    try {
      return JSON.parse(v);
    } catch (e) {
      return null;
    }
  }
  return v;
}

async function writeKey(key, value) {
  var r = redisStore.getRedis();
  if (!r) {
    var err = new Error("KV_NOT_CONFIGURED");
    err.code = "KV_NOT_CONFIGURED";
    throw err;
  }
  await r.set(key, JSON.stringify(value));
}

function normalizeSettings(v) {
  var s = v && typeof v === "object" ? v : {};
  var cents = parseInt(s.flatShippingCents, 10);
  if (!isFinite(cents) || cents < 0) cents = 0;
  if (cents > 200000) cents = 200000;
  return {
    pickupEnabled: s.pickupEnabled !== false,
    shippingEnabled: !!s.shippingEnabled,
    flatShippingCents: s.shippingEnabled ? cents : 0,
  };
}

function validateSettings(body) {
  var pickupEnabled = !(body && (body.pickupEnabled === false || body.pickupEnabled === "false"));
  var shippingEnabled = !!(body && (body.shippingEnabled === true || body.shippingEnabled === "true"));
  var cents = 0;
  if (shippingEnabled) {
    cents = money.dollarsToCents(body.shippingPrice);
    if (cents == null || cents < 0 || cents > 200000) {
      return { error: "Enter a shipping price from $0.00 to $2,000.00, or turn shipping off." };
    }
  }
  return {
    ok: true,
    data: {
      pickupEnabled: pickupEnabled,
      shippingEnabled: shippingEnabled,
      flatShippingCents: shippingEnabled ? cents : 0,
    },
  };
}

function validateProduct(body) {
  var photos = photosLib.normalizeListingPhotos(body || {});
  var alt = sanitizeString(body && body.imageAlt, 300);
  if (alt && photos[0]) photos[0].alt = alt;
  var primary = photosLib.getListingPrimaryFields(photos, alt);
  var priceCents =
    body && body.price != null && String(body.price).trim() !== ""
      ? money.dollarsToCents(body.price)
      : null;
  if (priceCents == null || priceCents < 50 || priceCents > MAX_UNIT_CENTS) {
    return { error: "Enter a price from $0.50 to $10,000.00." };
  }
  var qtyRaw = body && body.qtyOnHand != null ? String(body.qtyOnHand).trim() : "";
  if (!/^\d+$/.test(qtyRaw)) {
    return { error: "Quantity on hand must be a whole number." };
  }
  var qtyOnHand = parseInt(qtyRaw, 10);
  if (qtyOnHand > 9999) {
    return { error: "Quantity on hand is too large." };
  }
  var data = {
    title: sanitizeString(body.title, 200),
    priceCents: priceCents,
    sku: sanitizeString(body.sku, 80),
    lede: sanitizeString(body.lede, 2000),
    details: sanitizeString(body.details, 4000),
    fitment: sanitizeString(body.fitment, 500),
    qtyOnHand: qtyOnHand,
    listed: !(body.listed === false || body.listed === "false"),
    imageUrl: primary.imageUrl,
    imageAlt: primary.imageAlt,
    photos: photos,
  };
  if (!data.title) return { error: "Title is required." };
  return { ok: true, data: data };
}

function publicProduct(item) {
  return {
    id: item.id,
    title: item.title,
    priceCents: item.priceCents,
    sku: item.sku || "",
    lede: item.lede || "",
    details: item.details || "",
    fitment: item.fitment || "",
    qtyOnHand: item.qtyOnHand || 0,
    imageUrl: item.imageUrl || "",
    imageAlt: item.imageAlt || "",
    photos: Array.isArray(item.photos) ? item.photos : [],
  };
}

function staffProduct(item) {
  var row = publicProduct(item);
  row.listed = item.listed !== false;
  row.createdAt = item.createdAt || "";
  row.updatedAt = item.updatedAt || "";
  return row;
}

async function getProducts() {
  try {
    var arr = await readKey(PRODUCTS_KEY);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}

async function saveProducts(arr) {
  await writeKey(PRODUCTS_KEY, arr);
}

async function getSettings() {
  try {
    return normalizeSettings(await readKey(SETTINGS_KEY));
  } catch (e) {
    return normalizeSettings(null);
  }
}

async function saveSettings(settings) {
  await writeKey(SETTINGS_KEY, normalizeSettings(settings));
}

async function getOrders() {
  try {
    var arr = await readKey(ORDERS_KEY);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}

async function saveOrders(arr) {
  var list = Array.isArray(arr) ? arr.slice(0, MAX_ORDERS) : [];
  await writeKey(ORDERS_KEY, list);
}

async function saveOrder(order) {
  var list = await getOrders();
  var found = false;
  for (var i = 0; i < list.length; i++) {
    if (list[i] && list[i].id === order.id) {
      list[i] = order;
      found = true;
      break;
    }
  }
  if (!found) list.unshift(order);
  list.sort(function (a, b) {
    return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
  });
  await saveOrders(list);
  return order;
}

async function deleteOrder(id) {
  var list = await getOrders();
  var next = list.filter(function (o) {
    return o && o.id !== id;
  });
  await saveOrders(next);
}

async function claimFulfillment(orderId) {
  var r = redisStore.getRedis();
  if (!r) {
    var err = new Error("KV_NOT_CONFIGURED");
    err.code = "KV_NOT_CONFIGURED";
    throw err;
  }
  var result = await r.set("shop:fulfill:" + orderId, "1", { nx: true, ex: 120 });
  return !!result;
}

async function releaseFulfillment(orderId) {
  var r = redisStore.getRedis();
  if (!r) return;
  try {
    await r.del("shop:fulfill:" + orderId);
  } catch (e) {
    /* retry can still proceed after the claim expires */
  }
}

function redisConfigured() {
  return redisStore.hasRedisEnv();
}

module.exports = {
  validateProduct: validateProduct,
  validateSettings: validateSettings,
  publicProduct: publicProduct,
  staffProduct: staffProduct,
  getProducts: getProducts,
  saveProducts: saveProducts,
  getSettings: getSettings,
  saveSettings: saveSettings,
  getOrders: getOrders,
  saveOrder: saveOrder,
  deleteOrder: deleteOrder,
  claimFulfillment: claimFulfillment,
  releaseFulfillment: releaseFulfillment,
  redisConfigured: redisConfigured,
  newId: redisStore.newId,
  MAX_UNIT_CENTS: MAX_UNIT_CENTS,
};
