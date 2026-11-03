/**
 * Online shop. One serverless function for the Vercel Hobby limit.
 * GET  /api/shop/catalog
 * POST /api/shop/checkout
 * POST /api/shop/webhook
 * GET  /api/shop/order?session_id=
 * GET/POST /api/shop/admin/products
 * PUT    /api/shop/admin/products
 * DELETE /api/shop/admin/products?id=
 * GET    /api/shop/admin/orders
 * GET/POST /api/shop/admin/settings
 * GET    /api/shop/admin/status
 */
const http = require("../../lib/for-sale-http");
const store = require("../../lib/shop-store");
const money = require("../../lib/shop-money");
const mail = require("../../lib/shop-mail");

function pathParts(req) {
  var p = req.query && req.query.path;
  if (Array.isArray(p)) return p.map(String);
  if (p == null || p === "") return [];
  return [String(p)];
}

function kvMessage() {
  return "Redis is not configured. Connect Upstash on Vercel, or set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN, then redeploy.";
}

function stripeClient() {
  var key = process.env.STRIPE_SECRET_KEY;
  if (!key || !String(key).trim()) return null;
  try {
    var Stripe = require("stripe");
    return new Stripe(String(key).trim(), { apiVersion: "2026-09-30.endive" });
  } catch (e) {
    console.error("[shop] stripe package is not installed");
    return null;
  }
}

function checkoutReady() {
  return !!(
    stripeClient() &&
    process.env.STRIPE_WEBHOOK_SECRET &&
    String(process.env.STRIPE_WEBHOOK_SECRET).trim()
  );
}

function siteOrigin(req) {
  var configured = process.env.SHOP_SITE_URL || process.env.SITE_URL;
  if (configured && String(configured).trim()) {
    return String(configured).trim().replace(/\/$/, "");
  }
  var host = req.headers["x-forwarded-host"] || req.headers.host || "www.911autoservice.org";
  host = String(host).split(",")[0].trim();
  var proto = req.headers["x-forwarded-proto"] || (process.env.VERCEL ? "https" : "http");
  proto = String(proto).split(",")[0].trim();
  return proto + "://" + host;
}

function integrationIdentifier() {
  var letters = "abcdefghijklmnopqrstuvwxyz";
  var bytes = require("crypto").randomBytes(8);
  var suffix = "";
  for (var i = 0; i < 8; i++) suffix += letters[bytes[i] % 26];
  return "911shop" + suffix;
}

function absoluteImage(origin, url) {
  var value = url ? String(url).trim() : "";
  if (!value) return "";
  if (/^https:\/\//i.test(value)) return value;
  if (value.indexOf("/") === 0) return origin + value;
  return "";
}

function readRawBody(req) {
  if (Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
  if (typeof req.body === "string") return Promise.resolve(Buffer.from(req.body, "utf8"));
  if (req.body && typeof req.body === "object") return Promise.resolve(null);
  return new Promise(function (resolve, reject) {
    var chunks = [];
    req.on("data", function (c) {
      chunks.push(c);
    });
    req.on("end", function () {
      resolve(Buffer.concat(chunks));
    });
    req.on("error", reject);
  });
}

function parseCart(body) {
  var items = body && body.items;
  if (!Array.isArray(items) || !items.length) return { error: "Your cart is empty." };
  if (items.length > 30) return { error: "Too many different items in the cart." };
  var merged = {};
  var order = [];
  for (var i = 0; i < items.length; i++) {
    var row = items[i] || {};
    var id = row.id != null ? String(row.id).trim() : "";
    var qty = parseInt(row.qty, 10);
    if (!id) return { error: "A cart item is missing." };
    if (!isFinite(qty) || qty < 1 || qty > 99) return { error: "Quantity must be between 1 and 99." };
    if (!merged[id]) {
      merged[id] = 0;
      order.push(id);
    }
    merged[id] += qty;
    if (merged[id] > 99) return { error: "Quantity must be between 1 and 99." };
  }
  return {
    ok: true,
    items: order.map(function (id) {
      return { id: id, qty: merged[id] };
    }),
  };
}

async function handleCatalog(res) {
  var products = await store.getProducts();
  var settings = await store.getSettings();
  var listed = products.filter(function (item) {
    return item && item.listed !== false && item.id && item.title;
  });
  listed.sort(function (a, b) {
    var ao = (a.qtyOnHand || 0) <= 0;
    var bo = (b.qtyOnHand || 0) <= 0;
    if (ao !== bo) return ao ? 1 : -1;
    return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
  });
  res.status(200).json({
    ok: true,
    products: listed.map(store.publicProduct),
    settings: settings,
  });
}

async function handleCheckout(req, res) {
  if (!checkoutReady()) {
    res.status(503).json({
      ok: false,
      message: "Online checkout is not available right now. Call the shop at 517-279-2010.",
    });
    return;
  }
  if (!store.redisConfigured()) {
    res.status(503).json({ ok: false, message: kvMessage() });
    return;
  }
  var body = await http.readJsonBody(req);
  var parsed = parseCart(body);
  if (parsed.error) {
    res.status(400).json({ ok: false, message: parsed.error });
    return;
  }
  var fulfillment = body && body.fulfillment === "ship" ? "ship" : body && body.fulfillment === "pickup" ? "pickup" : "";
  if (!fulfillment) {
    res.status(400).json({ ok: false, message: "Choose pickup or shipping." });
    return;
  }
  var settings = await store.getSettings();
  if (fulfillment === "pickup" && !settings.pickupEnabled) {
    res.status(400).json({ ok: false, message: "Pickup is not available right now." });
    return;
  }
  if (fulfillment === "ship" && !settings.shippingEnabled) {
    res.status(400).json({ ok: false, message: "Shipping is not offered right now. Pick up at the shop, or call 517-279-2010." });
    return;
  }

  var products = await store.getProducts();
  var byId = {};
  products.forEach(function (item) {
    if (item && item.id) byId[item.id] = item;
  });
  var lines = [];
  for (var i = 0; i < parsed.items.length; i++) {
    var want = parsed.items[i];
    var product = byId[want.id];
    if (!product || product.listed === false) {
      res.status(400).json({ ok: false, message: "Something in your cart is no longer listed." });
      return;
    }
    var have = parseInt(product.qtyOnHand, 10) || 0;
    if (want.qty > have) {
      res.status(400).json({
        ok: false,
        message: have < 1 ? product.title + " is out of stock." : "Only " + have + " of " + product.title + " are in stock.",
      });
      return;
    }
    lines.push({
      productId: product.id,
      title: product.title,
      qty: want.qty,
      unitAmount: product.priceCents,
      imageUrl: product.imageUrl || (product.photos && product.photos[0] && product.photos[0].url) || "",
      lede: product.lede || "",
    });
  }

  var subtotal = lines.reduce(function (sum, line) {
    return sum + line.unitAmount * line.qty;
  }, 0);
  var shippingCents = fulfillment === "ship" ? settings.flatShippingCents : 0;
  var now = new Date().toISOString();
  var order = {
    id: store.newId(),
    status: "pending",
    items: lines.map(function (line) {
      return {
        productId: line.productId,
        title: line.title,
        qty: line.qty,
        unitAmount: line.unitAmount,
      };
    }),
    fulfillment: fulfillment,
    shippingCents: shippingCents,
    subtotalCents: subtotal,
    totalCents: subtotal + shippingCents,
    currency: "usd",
    stripeSessionId: "",
    email: "",
    name: "",
    phone: "",
    address: null,
    staffNote: "",
    createdAt: now,
    paidAt: null,
    stockAdjusted: false,
    emailed: false,
  };
  await store.saveOrder(order);

  var origin = siteOrigin(req);
  var stripe = stripeClient();
  var sessionParams = {
    mode: "payment",
    client_reference_id: order.id,
    metadata: { orderId: order.id, fulfillment: fulfillment },
    payment_intent_data: { metadata: { orderId: order.id } },
    phone_number_collection: { enabled: true },
    success_url: origin + "/shop-order.html?result=success&session_id={CHECKOUT_SESSION_ID}",
    cancel_url: origin + "/cart.html?canceled=1",
    integration_identifier: integrationIdentifier(),
    line_items: lines.map(function (line) {
      var image = absoluteImage(origin, line.imageUrl);
      var productData = { name: String(line.title).slice(0, 200) };
      if (line.lede) productData.description = String(line.lede).slice(0, 500);
      if (image) productData.images = [image];
      return {
        quantity: line.qty,
        price_data: {
          currency: "usd",
          unit_amount: line.unitAmount,
          product_data: productData,
        },
      };
    }),
    custom_text: {
      submit: {
        message:
          fulfillment === "ship"
            ? "Shipping is a flat rate for this order. We ship from Coldwater, MI."
            : "Pickup at 22 S Clay St, Coldwater, MI. Shop hours are Monday–Thursday, 8am–5pm.",
      },
    },
  };
  if (fulfillment === "ship") {
    sessionParams.shipping_address_collection = { allowed_countries: ["US"] };
    sessionParams.shipping_options = [
      {
        shipping_rate_data: {
          type: "fixed_amount",
          fixed_amount: { amount: shippingCents, currency: "usd" },
          display_name: shippingCents > 0 ? "Shipping" : "Free shipping",
        },
      },
    ];
  }

  var session;
  try {
    session = await stripe.checkout.sessions.create(sessionParams);
  } catch (e) {
    await store.deleteOrder(order.id);
    console.error("[shop] checkout session failed", e && e.message ? e.message : e);
    res.status(502).json({
      ok: false,
      message: "Checkout could not be started. Call the shop at 517-279-2010.",
    });
    return;
  }
  if (!session || !session.url) {
    await store.deleteOrder(order.id);
    res.status(502).json({ ok: false, message: "Checkout could not be started. Call the shop at 517-279-2010." });
    return;
  }
  order.stripeSessionId = session.id;
  await store.saveOrder(order);
  res.status(200).json({ ok: true, url: session.url });
}

function addressFromSession(session) {
  var ship =
    session.shipping_details ||
    (session.collected_information && session.collected_information.shipping_details) ||
    null;
  var addr = ship && ship.address ? ship.address : null;
  if (!addr && session.customer_details) addr = session.customer_details.address || null;
  if (!addr) return null;
  return {
    line1: addr.line1 || "",
    line2: addr.line2 || "",
    city: addr.city || "",
    state: addr.state || "",
    postalCode: addr.postal_code || "",
    country: addr.country || "",
  };
}

async function adjustStock(order) {
  var products = await store.getProducts();
  var notes = [];
  (order.items || []).forEach(function (line) {
    var product = null;
    for (var i = 0; i < products.length; i++) {
      if (products[i] && products[i].id === line.productId) product = products[i];
    }
    if (!product) {
      notes.push(line.title + " is no longer in the catalog.");
      return;
    }
    if (!Array.isArray(product.stockAppliedOrders)) product.stockAppliedOrders = [];
    if (product.stockAppliedOrders.indexOf(order.id) !== -1) return;
    var have = parseInt(product.qtyOnHand, 10) || 0;
    var next = have - line.qty;
    if (next < 0) {
      notes.push(line.title + " sold past the quantity on hand (" + have + " on hand, " + line.qty + " sold).");
      product.qtyOnHand = 0;
    } else {
      product.qtyOnHand = next;
    }
    product.stockAppliedOrders.push(order.id);
    if (product.stockAppliedOrders.length > 50) {
      product.stockAppliedOrders = product.stockAppliedOrders.slice(-50);
    }
  });
  await store.saveProducts(products);
  return notes.filter(Boolean).join(" ");
}

async function findOrder(orderId) {
  var orders = await store.getOrders();
  for (var i = 0; i < orders.length; i++) {
    if (orders[i] && orders[i].id === orderId) return orders[i];
  }
  return null;
}

async function findOrderBySession(sessionId) {
  var orders = await store.getOrders();
  for (var i = 0; i < orders.length; i++) {
    if (orders[i] && orders[i].stripeSessionId === sessionId) return orders[i];
  }
  return null;
}

async function emailIfNeeded(order) {
  if (order.emailed) return order;
  try {
    var sent = await mail.sendOrderMail(order);
    if (sent && sent.emailed) {
      order.emailed = true;
      await store.saveOrder(order);
    }
  } catch (e) {
    console.error("[shop] email failed", e && e.message ? e.message : e);
  }
  return order;
}

async function fulfillSession(session) {
  var orderId = (session.metadata && session.metadata.orderId) || session.client_reference_id;
  if (!orderId) return;
  var claimed = await store.claimFulfillment(orderId);
  if (!claimed) {
    var current = await findOrder(orderId);
    if (current && current.status === "paid") {
      if (!current.emailed) await emailIfNeeded(current);
      return;
    }
    var busy = new Error("FULFILL_BUSY");
    busy.code = "FULFILL_BUSY";
    throw busy;
  }
  try {
    var order = await findOrder(orderId);
    if (!order || order.status === "failed" || order.status === "canceled") return;
    if (order.status !== "paid") {
      if (!order.stockAdjusted) {
        order.staffNote = await adjustStock(order);
        order.stockAdjusted = true;
      }
      var customer = session.customer_details || {};
      var ship = session.shipping_details || (session.collected_information && session.collected_information.shipping_details) || {};
      order.status = "paid";
      order.paidAt = new Date().toISOString();
      order.email = customer.email || order.email || "";
      order.name = customer.name || ship.name || order.name || "";
      order.phone = customer.phone || order.phone || "";
      order.address = addressFromSession(session);
      if (session.amount_subtotal != null) order.subtotalCents = session.amount_subtotal;
      if (session.total_details && session.total_details.amount_shipping != null) {
        order.shippingCents = session.total_details.amount_shipping;
      }
      if (session.amount_total != null) order.totalCents = session.amount_total;
      await store.saveOrder(order);
    }
    await emailIfNeeded(order);
  } catch (e) {
    await store.releaseFulfillment(orderId);
    throw e;
  }
}

async function markSession(session, status) {
  var orderId = (session.metadata && session.metadata.orderId) || session.client_reference_id;
  if (!orderId) return;
  var order = await findOrder(orderId);
  if (!order || order.status === "paid") return;
  if (order.status === status) return;
  order.status = status;
  await store.saveOrder(order);
}

async function handleWebhook(req, res) {
  var secret = process.env.STRIPE_WEBHOOK_SECRET && String(process.env.STRIPE_WEBHOOK_SECRET).trim();
  var stripe = stripeClient();
  if (!secret || !stripe) {
    res.status(503).json({ ok: false, message: "Webhook is not configured." });
    return;
  }
  var raw = await readRawBody(req);
  if (!raw || !raw.length) {
    res.status(400).json({ ok: false, message: "Missing body." });
    return;
  }
  var event;
  try {
    event = stripe.webhooks.constructEvent(raw, req.headers["stripe-signature"], secret);
  } catch (e) {
    res.status(400).json({ ok: false, message: "Invalid signature." });
    return;
  }
  var session = event.data && event.data.object;
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    if (session && session.payment_status !== "unpaid") await fulfillSession(session);
  } else if (event.type === "checkout.session.async_payment_failed") {
    await markSession(session, "failed");
  } else if (event.type === "checkout.session.expired") {
    await markSession(session, "canceled");
  }
  res.status(200).json({ received: true });
}

async function handleOrderStatus(req, res) {
  var sessionId = req.query && req.query.session_id ? String(req.query.session_id) : "";
  if (!sessionId || sessionId.indexOf("cs_") !== 0) {
    res.status(400).json({ ok: false, message: "Missing order." });
    return;
  }
  var order = await findOrderBySession(sessionId);
  if (!order) {
    res.status(404).json({ ok: false, message: "That order was not found." });
    return;
  }
  res.status(200).json({
    ok: true,
    status: order.status,
    fulfillment: order.fulfillment,
    totalCents: order.totalCents,
    items: (order.items || []).map(function (line) {
      return { title: line.title, qty: line.qty };
    }),
  });
}

async function handleSaveProduct(req, res, creating) {
  var body = await http.readJsonBody(req);
  var validated = store.validateProduct(body || {});
  if (validated.error) {
    res.status(400).json({ ok: false, message: validated.error });
    return;
  }
  var products = await store.getProducts();
  var now = new Date().toISOString();
  if (creating) {
    var item = Object.assign({}, validated.data, {
      id: store.newId(),
      stockAppliedOrders: [],
      createdAt: now,
      updatedAt: now,
    });
    products.unshift(item);
    await store.saveProducts(products);
    res.status(201).json({ ok: true, product: store.staffProduct(item) });
    return;
  }
  var id = body && body.id != null ? String(body.id) : "";
  var existing = null;
  for (var i = 0; i < products.length; i++) {
    if (products[i] && products[i].id === id) existing = products[i];
  }
  if (!existing) {
    res.status(404).json({ ok: false, message: "That product was not found." });
    return;
  }
  var updated = Object.assign({}, existing, validated.data, {
    id: existing.id,
    createdAt: existing.createdAt || now,
    stockAppliedOrders: existing.stockAppliedOrders || [],
    updatedAt: now,
  });
  for (var j = 0; j < products.length; j++) {
    if (products[j] && products[j].id === id) products[j] = updated;
  }
  await store.saveProducts(products);
  res.status(200).json({ ok: true, product: store.staffProduct(updated) });
}

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  var parts = pathParts(req);
  var head = (parts[0] || "").toLowerCase();
  var sub = (parts[1] || "").toLowerCase();

  try {
    if (head === "catalog" && req.method === "GET") {
      await handleCatalog(res);
      return;
    }
    if (head === "checkout" && req.method === "POST") {
      await handleCheckout(req, res);
      return;
    }
    if (head === "webhook" && req.method === "POST") {
      await handleWebhook(req, res);
      return;
    }
    if (head === "order" && req.method === "GET") {
      await handleOrderStatus(req, res);
      return;
    }
    if (head === "admin" && sub === "status" && req.method === "GET") {
      if (!http.requireAuth(req, res)) return;
      res.status(200).json({
        ok: true,
        redis: store.redisConfigured(),
        stripe: !!String(process.env.STRIPE_SECRET_KEY || "").trim(),
        webhook: !!String(process.env.STRIPE_WEBHOOK_SECRET || "").trim(),
      });
      return;
    }
    if (head === "admin" && sub === "products" && req.method === "GET") {
      if (!http.requireAuth(req, res)) return;
      var products = await store.getProducts();
      products.sort(function (a, b) {
        return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
      });
      res.status(200).json({ ok: true, products: products.map(store.staffProduct) });
      return;
    }
    if (head === "admin" && sub === "products" && req.method === "POST") {
      if (!http.requireAuth(req, res)) return;
      await handleSaveProduct(req, res, true);
      return;
    }
    if (head === "admin" && sub === "products" && req.method === "PUT") {
      if (!http.requireAuth(req, res)) return;
      await handleSaveProduct(req, res, false);
      return;
    }
    if (head === "admin" && sub === "products" && req.method === "DELETE") {
      if (!http.requireAuth(req, res)) return;
      var id = req.query && req.query.id ? String(req.query.id) : "";
      var list = await store.getProducts();
      var next = list.filter(function (item) {
        return item && item.id !== id;
      });
      if (next.length === list.length) {
        res.status(404).json({ ok: false, message: "That product was not found." });
        return;
      }
      await store.saveProducts(next);
      res.status(200).json({ ok: true });
      return;
    }
    if (head === "admin" && sub === "orders" && req.method === "GET") {
      if (!http.requireAuth(req, res)) return;
      var orders = await store.getOrders();
      res.status(200).json({
        ok: true,
        orders: orders.slice(0, 100).map(function (order) {
          return {
            id: order.id,
            status: order.status,
            fulfillment: order.fulfillment,
            items: order.items || [],
            totalCents: order.totalCents,
            email: order.email || "",
            name: order.name || "",
            phone: order.phone || "",
            address: order.address || null,
            staffNote: order.staffNote || "",
            createdAt: order.createdAt || "",
            paidAt: order.paidAt || "",
          };
        }),
      });
      return;
    }
    if (head === "admin" && sub === "settings" && req.method === "GET") {
      if (!http.requireAuth(req, res)) return;
      res.status(200).json({ ok: true, settings: await store.getSettings() });
      return;
    }
    if (head === "admin" && sub === "settings" && req.method === "POST") {
      if (!http.requireAuth(req, res)) return;
      var body = await http.readJsonBody(req);
      var validated = store.validateSettings(body || {});
      if (validated.error) {
        res.status(400).json({ ok: false, message: validated.error });
        return;
      }
      await store.saveSettings(validated.data);
      res.status(200).json({ ok: true, settings: validated.data });
      return;
    }
    res.status(404).json({ ok: false, message: "Not found." });
  } catch (e) {
    if (e && e.code === "KV_NOT_CONFIGURED") {
      res.status(503).json({ ok: false, message: kvMessage() });
      return;
    }
    if (e && e.code === "FULFILL_BUSY") {
      res.status(500).json({ ok: false, message: "Order is still being saved." });
      return;
    }
    console.error("[shop]", e && e.message ? e.message : e);
    res.status(500).json({ ok: false, message: "Something went wrong. Try again." });
  }
};

module.exports.config = {
  api: {
    bodyParser: false,
  },
};
