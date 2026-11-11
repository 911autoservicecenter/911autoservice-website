/**
 * Cart stored in this browser. Prices always come from the server at checkout.
 */
(function (global) {
  var KEY = "911asShopCart";

  function read() {
    try {
      var arr = JSON.parse(localStorage.getItem(KEY) || "[]");
      if (!Array.isArray(arr)) return [];
      return arr
        .map(function (row) {
          return {
            id: row && row.id ? String(row.id) : "",
            sku: row && row.sku ? String(row.sku).slice(0, 80) : "",
            qty: parseInt(row && row.qty, 10) || 0,
          };
        })
        .filter(function (row) {
          return row.id && row.qty > 0;
        });
    } catch (e) {
      return [];
    }
  }

  function write(items) {
    localStorage.setItem(KEY, JSON.stringify(items || []));
    updateLinks();
  }

  function count() {
    return read().reduce(function (sum, row) {
      return sum + row.qty;
    }, 0);
  }

  function updateLinks() {
    var n = count();
    var label = n ? "Cart (" + n + ")" : "Cart";
    var link = document.getElementById("shop-cart-link");
    if (link) link.textContent = label;
  }

  function sameLine(row, id, sku) {
    return row.id === id && (row.sku || "") === (sku || "");
  }

  function add(id, qty, sku) {
    qty = parseInt(qty, 10) || 1;
    sku = sku ? String(sku).slice(0, 80) : "";
    var items = read();
    var found = false;
    items.forEach(function (row) {
      if (sameLine(row, id, sku)) {
        row.qty += qty;
        found = true;
      }
    });
    if (!found) items.push({ id: id, sku: sku, qty: qty });
    write(items);
    return count();
  }

  global.ShopCart = { read: read, write: write, count: count, add: add, updateLinks: updateLinks };
  updateLinks();

  var root = document.getElementById("cart-root");
  if (!root) return;

  var banner = document.getElementById("cart-banner");
  try {
    if (new URLSearchParams(window.location.search).get("canceled") === "1" && banner) {
      banner.hidden = false;
      banner.textContent = "Checkout was canceled. Your cart is still here.";
    }
  } catch (e) {}

  function money(cents) {
    var n = parseInt(cents, 10) || 0;
    return "$" + (n / 100).toFixed(2);
  }

  function esc(s) {
    var d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  }

  fetch("/api/shop/catalog", { credentials: "same-origin" })
    .then(function (r) {
      return r.json();
    })
    .then(function (data) {
      render(data && data.products ? data.products : [], data && data.settings ? data.settings : {});
    })
    .catch(function () {
      root.innerHTML = '<p class="sale-empty">The cart could not be loaded. Call 517-279-2010.</p>';
    });

  function chosenVariant(product, sku) {
    var variants = product && Array.isArray(product.variants) ? product.variants : [];
    if (variants.length < 2) return null;
    var want = sku || product.sku || "";
    var found = null;
    variants.forEach(function (variant) {
      if (variant && variant.sku === want) found = variant;
    });
    return found;
  }

  function lineOffer(product, row) {
    var variant = chosenVariant(product, row.sku);
    if (!variant) {
      return {
        title: product.title,
        priceCents: product.priceCents,
        qtyOnHand: product.qtyOnHand || 0,
        imageUrl: product.photos && product.photos[0] && product.photos[0].url ? product.photos[0].url : product.imageUrl || "images/logo.png?v=2",
      };
    }
    var choices = Array.isArray(variant.choices) ? variant.choices.filter(Boolean) : [];
    return {
      title: choices.length ? product.title + " — " + choices.join(" / ") : product.title,
      priceCents: variant.priceCents,
      qtyOnHand: variant.qtyOnHand || 0,
      imageUrl: variant.imageUrl || (product.photos && product.photos[0] && product.photos[0].url) || product.imageUrl || "images/logo.png?v=2",
    };
  }

  function render(products, settings) {
    var items = read();
    var clamped = false;
    items.forEach(function (row) {
      var product = null;
      products.forEach(function (p) {
        if (p.id === row.id) product = p;
      });
      var offer = product ? lineOffer(product, row) : null;
      if (offer && row.qty > offer.qtyOnHand) {
        row.qty = offer.qtyOnHand;
        clamped = true;
      }
    });
    items = items.filter(function (row) {
      return row.qty > 0 || !products.some(function (p) { return p.id === row.id; });
    });
    if (clamped) write(items.filter(function (row) { return row.qty > 0; }));
    if (!items.length) {
      root.innerHTML =
        '<p class="sale-empty">Your cart is empty.</p><p><a class="btn btn-primary" href="shop.html">Back to the shop</a></p>';
      return;
    }
    var byId = {};
    products.forEach(function (p) {
      byId[p.id] = p;
    });
    var subtotal = 0;
    var html = '<div class="cart-list">';
    items.forEach(function (row) {
      var product = byId[row.id];
      var lineAttr = encodeURIComponent(row.id + "\n" + (row.sku || ""));
      if (!product) {
        html +=
          '<article class="cart-line"><div><h2 class="cart-line__title">This item is no longer listed</h2>' +
          '<button type="button" class="btn btn-ghost btn-sm" data-remove="' +
          lineAttr +
          '">Remove</button></div></article>';
        return;
      }
      var offer = lineOffer(product, row);
      var qty = Math.min(row.qty, offer.qtyOnHand || 0);
      if (qty < 1) {
        html +=
          '<article class="cart-line"><div><h2 class="cart-line__title">' +
          esc(offer.title) +
          '</h2><p class="shop-note">Out of stock.</p>' +
          '<button type="button" class="btn btn-ghost btn-sm" data-remove="' +
          lineAttr +
          '">Remove</button></div></article>';
        return;
      }
      subtotal += offer.priceCents * qty;
      html +=
        '<article class="cart-line"><img src="' +
        esc(offer.imageUrl) +
        '" alt="" /><div><h2 class="cart-line__title">' +
        esc(offer.title) +
        '</h2><p class="cart-line__price">' +
        money(offer.priceCents) +
        " each</p>" +
        '<p class="shop-card__ship-note">Advertised price does not include shipping.</p>' +
        '<div class="shop-card__actions"><label class="shop-qty">Qty <input type="number" min="1" max="' +
        (offer.qtyOnHand || 1) +
        '" value="' +
        qty +
        '" data-qty="' +
        lineAttr +
        '" /></label><button type="button" class="btn btn-ghost btn-sm" data-remove="' +
        lineAttr +
        '">Remove</button></div></div></article>';
    });
    html += "</div>";

    var installOk = settings.pickupEnabled !== false && items.every(function (row) {
      var product = byId[row.id];
      return product && product.canInstall !== false;
    });
    var shipOk = !!settings.shippingEnabled && items.every(function (row) {
      var product = byId[row.id];
      return product && product.canShip === true;
    });
    var shipCents = parseInt(settings.flatShippingCents, 10) || 0;
    if (installOk || shipOk) {
      html += '<fieldset class="shop-fulfillment"><legend>How do you want it?</legend>';
      if (installOk) {
        html +=
          '<label><input type="radio" name="fulfillment" value="pickup" checked /> Install at the shop, 22 S Clay St, Coldwater</label>';
      }
      if (shipOk) {
        html +=
          '<label><input type="radio" name="fulfillment" value="ship"' +
          (installOk ? "" : " checked") +
          " /> Ship it to me — " +
          (shipCents > 0 ? money(shipCents) + " flat rate" : "free shipping") +
          "</label>";
      }
      html += "</fieldset>";
    } else {
      html +=
        '<p class="sale-empty">Call the shop at <a href="tel:+15172792010">517-279-2010</a> and press 2 so we can set up shipping or installation for this order.</p>';
    }
    html +=
      '<div class="shop-totals"><div><span>Subtotal</span><span id="cart-subtotal">' +
      money(subtotal) +
      "</span></div>" +
      (shipOk
        ? '<div><span>Shipping</span><span id="cart-shipping">' + money(0) + "</span></div>"
        : "") +
      '<div class="shop-total"><span>Total</span><span id="cart-total">' +
      money(subtotal) +
      "</span></div></div>";
    html += '<p id="cart-error" class="booking-cal-error" hidden role="alert"></p>';
    html +=
      '<p class="shop-card__meta">Refunds and exchanges require an RMA from the shop. No refund is issued without one. <a href="returns.html">Returns and exchanges</a>.</p>';
    if (installOk || shipOk) {
      html += '<button type="button" class="btn btn-primary" id="cart-checkout">Checkout</button>';
    }
    root.innerHTML = html;

    function selectedFulfillment() {
      var picked = root.querySelector('input[name="fulfillment"]:checked');
      return picked ? picked.value : "";
    }

    function paintTotals() {
      var ship = selectedFulfillment() === "ship" ? shipCents : 0;
      var sub = document.getElementById("cart-subtotal");
      var shipEl = document.getElementById("cart-shipping");
      var total = document.getElementById("cart-total");
      if (sub) sub.textContent = money(subtotal);
      if (shipEl) shipEl.textContent = money(ship);
      if (total) total.textContent = money(subtotal + ship);
    }
    paintTotals();
    root.querySelectorAll('input[name="fulfillment"]').forEach(function (input) {
      input.addEventListener("change", paintTotals);
    });

    function matchesLine(row, token) {
      var decoded = "";
      try {
        decoded = decodeURIComponent(token || "");
      } catch (e) {
        decoded = token || "";
      }
      var parts = decoded.split("\n");
      return sameLine(row, parts[0] || "", parts[1] || "");
    }

    root.querySelectorAll("[data-qty]").forEach(function (input) {
      input.addEventListener("change", function () {
        var token = input.getAttribute("data-qty");
        var qty = parseInt(input.value, 10) || 1;
        var next = read().map(function (row) {
          if (matchesLine(row, token)) row.qty = qty;
          return row;
        });
        write(next);
        render(products, settings);
      });
    });
    root.querySelectorAll("[data-remove]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var token = btn.getAttribute("data-remove");
        write(
          read().filter(function (row) {
            return !matchesLine(row, token);
          })
        );
        render(products, settings);
      });
    });

    var checkout = document.getElementById("cart-checkout");
    if (checkout) {
      checkout.addEventListener("click", function () {
        var err = document.getElementById("cart-error");
        if (err) {
          err.hidden = true;
          err.textContent = "";
        }
        var fulfillment = selectedFulfillment();
        if (!fulfillment) {
          if (err) {
            err.hidden = false;
            err.textContent = "Choose shipping or installation.";
          }
          return;
        }
        checkout.disabled = true;
        fetch("/api/shop/checkout", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: read(), fulfillment: fulfillment }),
        })
          .then(function (r) {
            return r.json();
          })
          .then(function (data) {
            if (data && data.ok && data.url) {
              window.location.href = data.url;
              return;
            }
            checkout.disabled = false;
            if (err) {
              err.hidden = false;
              err.textContent = (data && data.message) || "Checkout could not be started.";
            }
          })
          .catch(function () {
            checkout.disabled = false;
            if (err) {
              err.hidden = false;
              err.textContent = "Checkout could not be started. Call 517-279-2010.";
            }
          });
      });
    }
  }
})(window);
