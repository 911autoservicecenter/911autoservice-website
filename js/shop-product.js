/**
 * Full product page. The shop grid links here with ?id=
 */
(function () {
  var root = document.getElementById("product-root");
  if (!root || !window.ShopCart) return;

  function esc(s) {
    var d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  }

  function money(cents) {
    var n = parseInt(cents, 10) || 0;
    return "$" + (n / 100).toFixed(2);
  }

  function safeUrl(url) {
    var s = String(url || "");
    if (/^https:\/\//i.test(s) || /^images\//i.test(s)) return s;
    return "images/logo.png?v=2";
  }

  function offerLabel(item) {
    var install = item.canInstall !== false;
    var ship = item.canShip === true;
    if (install && ship) return "Ships to you, or installed at the shop.";
    if (ship) return "Ships to you.";
    return "Installed at the shop.";
  }

  function stockLabel(qty) {
    if (!qty) return "Out of stock";
    if (qty <= 5) return qty === 1 ? "1 left" : qty + " left";
    return "In stock";
  }

  function yearLabel(vehicle) {
    if (vehicle.yearStart == null) return "";
    if (vehicle.yearStart === vehicle.yearEnd) return String(vehicle.yearStart);
    return vehicle.yearStart + "–" + vehicle.yearEnd;
  }

  function fitsLabel(item) {
    if (!window.ShopVehicles) return item.fitment || "";
    var parsed = window.ShopVehicles.parseProduct(item);
    if (parsed.universal) return "Fits any vehicle.";
    var lines = [];
    var seen = {};
    parsed.vehicles.forEach(function (vehicle) {
      var years = yearLabel(vehicle);
      var line = years ? years + " " + vehicle.make + " " + vehicle.model : vehicle.make + " " + vehicle.model;
      if (seen[line]) return;
      seen[line] = true;
      lines.push(line);
    });
    if (lines.length) return lines.join("\n");
    return item.fitment || "";
  }

  function photosOf(item) {
    var photos = Array.isArray(item.photos) ? item.photos.filter(function (p) { return p && p.url; }) : [];
    if (!photos.length && item.imageUrl) photos = [{ url: item.imageUrl, alt: item.imageAlt || item.title }];
    if (!photos.length) photos = [{ url: "images/logo.png?v=2", alt: item.title || "Product photo" }];
    return photos;
  }

  function render(item) {
    document.title = item.title + " | 911 Towing & Repair";
    var photos = photosOf(item);
    var out = !item.qtyOnHand;
    var meta = [item.categoryLabel, item.brandLabel].filter(Boolean).join(" · ");
    var copy = item.details || item.lede || "";
    var fits = fitsLabel(item);
    var thumbs = "";
    if (photos.length > 1) {
      thumbs = '<div class="product-page__thumbs">';
      photos.forEach(function (photo, index) {
        thumbs +=
          '<button type="button" data-photo="' +
          index +
          '" aria-pressed="' +
          (index === 0 ? "true" : "false") +
          '" aria-label="Photo ' +
          (index + 1) +
          '"><img src="' +
          esc(safeUrl(photo.url)) +
          '" alt="" /></button>';
      });
      thumbs += "</div>";
    }
    root.innerHTML =
      '<article class="product-page">' +
      "<div>" +
      '<figure class="product-page__photo"><img id="product-photo" src="' +
      esc(safeUrl(photos[0].url)) +
      '" alt="' +
      esc(photos[0].alt || item.title) +
      '" /></figure>' +
      thumbs +
      "</div>" +
      "<div>" +
      '<h1 class="product-page__title">' +
      esc(item.title) +
      "</h1>" +
      '<p class="product-page__price">' +
      money(item.priceCents) +
      "</p>" +
      '<p class="shop-card__ship-note">Advertised price does not include shipping.</p>' +
      (meta ? '<p class="shop-card__meta">' + esc(meta) + "</p>" : "") +
      '<p class="sale-card__lede">' +
      esc(offerLabel(item)) +
      "</p>" +
      (fits ? '<p class="product-page__copy">' + esc(fits) + "</p>" : "") +
      (item.sku ? '<p class="shop-card__meta">SKU ' + esc(item.sku) + "</p>" : "") +
      (copy ? '<p class="product-page__copy">' + esc(copy) + "</p>" : "") +
      '<p class="shop-card__stock">' +
      esc(stockLabel(item.qtyOnHand || 0)) +
      "</p>" +
      (out
        ? ""
        : '<div class="shop-card__actions"><label class="shop-qty">Qty <input type="number" id="product-qty" min="1" max="' +
          (item.qtyOnHand || 1) +
          '" value="1" /></label><button type="button" class="btn btn-primary" id="product-add">Add to cart</button></div>') +
      '<p id="product-status" class="scheduler-form__status" role="status"></p>' +
      "</div></article>";

    var main = document.getElementById("product-photo");
    root.querySelectorAll("[data-photo]").forEach(function (button) {
      button.addEventListener("click", function () {
        var index = parseInt(button.getAttribute("data-photo"), 10) || 0;
        var photo = photos[index] || photos[0];
        if (main) {
          main.src = safeUrl(photo.url);
          main.alt = photo.alt || item.title;
        }
        root.querySelectorAll("[data-photo]").forEach(function (other) {
          other.setAttribute("aria-pressed", other === button ? "true" : "false");
        });
      });
    });

    var add = document.getElementById("product-add");
    if (add) {
      add.addEventListener("click", function () {
        var input = document.getElementById("product-qty");
        var qty = input ? parseInt(input.value, 10) || 1 : 1;
        var max = input ? parseInt(input.max, 10) || qty : qty;
        if (qty < 1) qty = 1;
        if (qty > max) qty = max;
        window.ShopCart.add(item.id, qty);
        var status = document.getElementById("product-status");
        if (status) status.textContent = "Added to your cart.";
        add.textContent = "Added";
        window.setTimeout(function () {
          add.textContent = "Add to cart";
        }, 1200);
      });
    }
  }

  var params = new URLSearchParams(window.location.search);
  var id = params.get("id") || "";

  fetch("/api/shop/catalog", { credentials: "same-origin" })
    .then(function (r) {
      return r.json();
    })
    .then(function (data) {
      var products = data && data.ok && Array.isArray(data.products) ? data.products : [];
      var item = null;
      products.forEach(function (product) {
        if (product.id === id) item = product;
      });
      if (!item) {
        root.innerHTML =
          '<p class="sale-empty">That item is not listed. <a href="index.html">Back to the shop</a></p>';
        return;
      }
      render(item);
    })
    .catch(function () {
      root.innerHTML =
        '<p class="sale-empty">The shop is not available right now. Call the shop at <a href="tel:+15172792010">517-279-2010</a>.</p>';
    });
})();
