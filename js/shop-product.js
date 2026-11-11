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

  function variantsOf(item) {
    return item && Array.isArray(item.variants) && item.variants.length > 1 ? item.variants : [];
  }

  function optionColumns(item) {
    var variants = variantsOf(item);
    if (!variants.length) return [];
    var width = 1;
    variants.forEach(function (variant) {
      var n = Array.isArray(variant.choices) ? variant.choices.length : 0;
      if (n > width) width = n;
    });
    var same = variants.every(function (variant) {
      return Array.isArray(variant.choices) && variant.choices.length === width;
    });
    if (!same) {
      var values = [];
      variants.forEach(function (variant) {
        var label = variant.choices.join(" / ");
        if (values.indexOf(label) === -1) values.push(label);
      });
      return [{ name: (item.optionNames && item.optionNames[0]) || "Choose", values: values }];
    }
    var columns = [];
    for (var i = 0; i < width; i++) {
      var values = [];
      variants.forEach(function (variant) {
        var value = variant.choices[i];
        if (values.indexOf(value) === -1) values.push(value);
      });
      if (values.length < 2) continue;
      columns.push({
        index: i,
        name: (item.optionNames && item.optionNames[i]) || "Option",
        values: values,
      });
    }
    return columns;
  }

  function selectedChoices(item, columns) {
    return columns.map(function (column) {
      if (column.index == null) {
        var box = document.querySelector("[data-option='full']");
        return box ? box.value : column.values[0];
      }
      var select = document.querySelector("[data-option='" + column.index + "']");
      return select ? select.value : column.values[0];
    });
  }

  function matchVariant(item, columns) {
    var variants = variantsOf(item);
    if (!variants.length) return null;
    if (!columns.length) {
      var fallback = null;
      variants.forEach(function (variant) {
        if (variant.sku === item.sku) fallback = variant;
      });
      return fallback || variants[0];
    }
    if (columns.length === 1 && columns[0].index == null) {
      var full = selectedChoices(item, columns)[0];
      var found = null;
      variants.forEach(function (variant) {
        if (variant.choices.join(" / ") === full) found = variant;
      });
      return found || variants[0];
    }
    var picked = [];
    columns.forEach(function (column) {
      var select = document.querySelector("[data-option='" + column.index + "']");
      picked[column.index] = select ? select.value : column.values[0];
    });
    var match = null;
    variants.forEach(function (variant) {
      var ok = true;
      columns.forEach(function (column) {
        if (variant.choices[column.index] !== picked[column.index]) ok = false;
      });
      if (ok) match = variant;
    });
    return match;
  }

  function render(item) {
    document.title = item.title + " | 911 Towing & Repair";
    var photos = photosOf(item);
    var variants = variantsOf(item);
    var columns = optionColumns(item);
    var starting = null;
    variants.forEach(function (variant) {
      if (!starting && variant.sku === item.sku) starting = variant;
    });
    if (!starting) {
      variants.forEach(function (variant) {
        if (!starting && variant.qtyOnHand) starting = variant;
      });
    }
    if (!starting && variants.length) starting = variants[0];
    var active = starting || item;
    var out = !(active.qtyOnHand || item.qtyOnHand);
    var meta = [item.categoryLabel, item.brandLabel].filter(Boolean).join(" · ");
    var copy = item.details || item.lede || "";
    var fits = fitsLabel(item);
    var prices = variants.map(function (variant) { return variant.priceCents; });
    var priceText = money(active.priceCents || item.priceCents);
    if (!starting && prices.length > 1 && Math.min.apply(null, prices) !== Math.max.apply(null, prices)) {
      priceText = "From " + money(Math.min.apply(null, prices));
    }
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
    var optionsHtml = "";
    if (columns.length) {
      optionsHtml = '<div class="product-options">';
      columns.forEach(function (column) {
        var current = "";
        if (starting) {
          current = column.index == null ? starting.choices.join(" / ") : starting.choices[column.index];
        }
        optionsHtml += '<label>' + esc(column.name) + '<select data-option="' + (column.index == null ? "full" : column.index) + '">';
        column.values.forEach(function (value) {
          optionsHtml +=
            '<option value="' +
            esc(value) +
            '"' +
            (value === current ? " selected" : "") +
            ">" +
            esc(value) +
            "</option>";
        });
        optionsHtml += "</select></label>";
      });
      optionsHtml += "</div>";
    }
    root.innerHTML =
      '<article class="product-page">' +
      "<div>" +
      '<figure class="product-page__photo"><img id="product-photo" src="' +
      esc(safeUrl((starting && starting.imageUrl) || photos[0].url)) +
      '" alt="' +
      esc(photos[0].alt || item.title) +
      '" /></figure>' +
      thumbs +
      "</div>" +
      "<div>" +
      '<h1 class="product-page__title">' +
      esc(item.title) +
      "</h1>" +
      '<p class="product-page__price" id="product-price">' +
      priceText +
      "</p>" +
      '<p class="shop-card__ship-note">Advertised price does not include shipping.</p>' +
      (meta ? '<p class="shop-card__meta">' + esc(meta) + "</p>" : "") +
      '<p class="sale-card__lede">' +
      esc(offerLabel(item)) +
      "</p>" +
      optionsHtml +
      (fits ? '<p class="product-page__copy">' + esc(fits) + "</p>" : "") +
      '<p class="shop-card__meta" id="product-sku">' +
      (active.sku || item.sku ? "SKU " + esc(active.sku || item.sku) : "") +
      "</p>" +
      (copy ? '<p class="product-page__copy">' + esc(copy) + "</p>" : "") +
      '<p class="shop-card__stock" id="product-stock">' +
      esc(stockLabel((active.qtyOnHand != null ? active.qtyOnHand : item.qtyOnHand) || 0)) +
      "</p>" +
      '<div class="shop-card__actions" id="product-buy"' +
      (out ? " hidden" : "") +
      '><label class="shop-qty">Qty <input type="number" id="product-qty" min="1" max="' +
      ((active.qtyOnHand || item.qtyOnHand) || 1) +
      '" value="1" /></label><button type="button" class="btn btn-primary" id="product-add">Add to cart</button></div>' +
      '<p id="product-status" class="scheduler-form__status" role="status"></p>' +
      '<p class="shop-card__meta">Refunds and exchanges require an RMA from the shop. No refund is issued without one. <a href="returns.html">Returns and exchanges</a>.</p>' +
      "</div></article>";

    function paint(variant) {
      var price = document.getElementById("product-price");
      var stock = document.getElementById("product-stock");
      var skuLine = document.getElementById("product-sku");
      var buy = document.getElementById("product-buy");
      var qty = variant ? variant.qtyOnHand || 0 : item.qtyOnHand || 0;
      if (price) price.textContent = money(variant ? variant.priceCents : item.priceCents);
      if (stock) stock.textContent = stockLabel(qty);
      if (skuLine) skuLine.textContent = (variant && variant.sku) || item.sku ? "SKU " + ((variant && variant.sku) || item.sku) : "";
      if (variant && variant.imageUrl && main) {
        main.src = safeUrl(variant.imageUrl);
      }
      if (!qty) {
        if (buy) buy.hidden = true;
        return;
      }
      if (buy) buy.hidden = false;
      var input = document.getElementById("product-qty");
      if (input) {
        input.max = String(qty);
        if ((parseInt(input.value, 10) || 1) > qty) input.value = String(qty);
      }
    }

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

    function refreshOptions() {
      if (!columns.length || (columns.length === 1 && columns[0].index == null)) return;
      var picked = [];
      columns.forEach(function (column) {
        var box = document.querySelector("[data-option='" + column.index + "']");
        var values = [];
        variants.forEach(function (variant) {
          var ok = true;
          picked.forEach(function (choice, index) {
            if (choice && variant.choices[index] !== choice) ok = false;
          });
          if (!ok) return;
          var value = variant.choices[column.index];
          if (value && values.indexOf(value) === -1) values.push(value);
        });
        var current = box ? box.value : "";
        if (values.indexOf(current) === -1) current = values[0] || "";
        if (box) {
          box.innerHTML = values.map(function (value) {
            return '<option value="' + esc(value) + '"' + (value === current ? " selected" : "") + ">" + esc(value) + "</option>";
          }).join("");
          box.value = current;
        }
        picked[column.index] = current;
      });
    }

    refreshOptions();
    paint(matchVariant(item, columns));

    root.querySelectorAll("[data-option]").forEach(function (select) {
      select.addEventListener("change", function () {
        refreshOptions();
        paint(matchVariant(item, columns));
      });
    });

    var add = document.getElementById("product-add");
    if (add) {
      add.addEventListener("click", function () {
        var variant = matchVariant(item, columns);
        var input = document.getElementById("product-qty");
        var qty = input ? parseInt(input.value, 10) || 1 : 1;
        var max = variant ? variant.qtyOnHand || 0 : item.qtyOnHand || 0;
        if (!max) return;
        if (qty < 1) qty = 1;
        if (qty > max) qty = max;
        window.ShopCart.add(item.id, qty, variant ? variant.sku : "");
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
