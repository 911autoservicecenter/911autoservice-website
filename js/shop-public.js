/**
 * Public shop grid. Empty until a product is listed in the staff shop.
 */
(function () {
  var root = document.getElementById("shop-grid");
  var loading = document.getElementById("shop-loading");
  var status = document.getElementById("shop-status");
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

  function card(item) {
    var photos = Array.isArray(item.photos) ? item.photos.filter(function (p) { return p && p.url; }) : [];
    var img = photos.length ? photos[0].url : item.imageUrl || "images/logo.png?v=2";
    var alt = (photos[0] && photos[0].alt) || item.imageAlt || item.title || "Product photo";
    var out = !item.qtyOnHand;
    var meta = [item.categoryLabel, item.brandLabel].filter(Boolean).join(" · ");
    var specs =
      (item.sku ? "<div><dt>SKU</dt><dd>" + esc(item.sku) + "</dd></div>" : "") +
      (item.fitment ? "<div><dt>Fits</dt><dd>" + esc(item.fitment) + "</dd></div>" : "");
    return (
      '<article class="sale-card' +
      (out ? " sale-card--sold" : "") +
      '">' +
      '<figure class="sale-card__photo"><img src="' +
      esc(img) +
      '" width="640" height="480" alt="' +
      esc(alt) +
      '" loading="lazy" decoding="async" /></figure>' +
      '<div class="sale-card__body"><h3 class="sale-card__title">' +
      esc(item.title) +
      "</h3>" +
      (meta ? '<p class="shop-card__meta">' + esc(meta) + "</p>" : "") +
      '<p class="sale-card__price">' +
      money(item.priceCents) +
      "</p>" +
      '<p class="sale-card__lede">' +
      esc(offerLabel(item)) +
      "</p>" +
      (item.lede ? '<p class="sale-card__lede">' + esc(item.lede) + "</p>" : "") +
      (item.details ? '<p class="sale-card__fineprint">' + esc(item.details) + "</p>" : "") +
      (specs ? '<dl class="sale-card__specs">' + specs + "</dl>" : "") +
      '<p class="shop-card__stock">' +
      esc(stockLabel(item.qtyOnHand || 0)) +
      "</p>" +
      (out
        ? ""
        : '<div class="shop-card__actions"><label class="shop-qty">Qty <input type="number" min="1" max="' +
          (item.qtyOnHand || 1) +
          '" value="1" data-qty-for="' +
          esc(item.id) +
          '" /></label><button type="button" class="btn btn-primary" data-add="' +
          esc(item.id) +
          '">Add to cart</button></div>') +
      "</div></article>"
    );
  }

  var activeCategory = "all";
  var products = [];

  function visibleProducts() {
    if (activeCategory === "all") return products;
    return products.filter(function (item) {
      return item.category === activeCategory;
    });
  }

  function render() {
    if (loading) loading.remove();
    var list = visibleProducts();
    if (!list.length) {
      root.innerHTML =
        '<p class="sale-empty">' +
        (activeCategory === "all" ? "New items will be posted here." : "Nothing listed in this category yet.") +
        "</p>";
      return;
    }
    root.innerHTML = list.map(card).join("");
    root.querySelectorAll("[data-add]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-add");
        var input = root.querySelector('[data-qty-for="' + id + '"]');
        var qty = input ? parseInt(input.value, 10) || 1 : 1;
        var max = input ? parseInt(input.max, 10) || qty : qty;
        if (qty > max) qty = max;
        window.ShopCart.add(id, qty);
        if (status) status.textContent = "Added to your cart.";
        btn.textContent = "Added";
        window.setTimeout(function () {
          btn.textContent = "Add to cart";
        }, 1200);
      });
    });
  }

  document.querySelectorAll("[data-shop-category]").forEach(function (button) {
    button.addEventListener("click", function () {
      activeCategory = button.getAttribute("data-shop-category") || "all";
      document.querySelectorAll("[data-shop-category]").forEach(function (other) {
        other.setAttribute("aria-pressed", other === button ? "true" : "false");
      });
      render();
    });
  });

  fetch("/api/shop/catalog", { credentials: "same-origin" })
    .then(function (r) {
      return r.json();
    })
    .then(function (data) {
      products = data && data.ok && Array.isArray(data.products) ? data.products : [];
      render();
    })
    .catch(function () {
      products = [];
      render();
    });
})();
