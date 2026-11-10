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
      '<div class="sale-card__body"><h3 class="sale-card__title" title="' +
      esc(item.title) +
      '">' +
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
      (item.details
        ? '<details class="shop-card__details"><summary>Details</summary><p>' + esc(item.details) + "</p></details>"
        : "") +
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

  var PAGE_SIZE = 20;
  var activeCategory = "all";
  var page = 1;
  var products = [];
  var pager = document.getElementById("shop-pages");

  function visibleProducts() {
    if (activeCategory === "all") return products;
    return products.filter(function (item) {
      return item.category === activeCategory;
    });
  }

  function renderPager(pages) {
    if (!pager) return;
    if (pages < 2) {
      pager.hidden = true;
      pager.innerHTML = "";
      return;
    }
    pager.hidden = false;
    var html =
      '<button type="button" data-shop-page="prev"' + (page <= 1 ? " disabled" : "") + ">Previous</button>";
    for (var i = 1; i <= pages; i++) {
      html +=
        '<button type="button" data-shop-page="' +
        i +
        '"' +
        (i === page ? ' aria-current="page"' : "") +
        ">" +
        i +
        "</button>";
    }
    html +=
      '<button type="button" data-shop-page="next"' + (page >= pages ? " disabled" : "") + ">Next</button>";
    pager.innerHTML = html;
  }

  function render() {
    if (loading) loading.remove();
    var list = visibleProducts();
    if (!list.length) {
      root.innerHTML =
        '<p class="sale-empty">' +
        (activeCategory === "all" ? "New items will be posted here." : "Nothing listed in this category yet.") +
        "</p>";
      renderPager(1);
      return;
    }
    var pages = Math.ceil(list.length / PAGE_SIZE);
    if (page > pages) page = pages;
    if (page < 1) page = 1;
    var start = (page - 1) * PAGE_SIZE;
    root.innerHTML = list.slice(start, start + PAGE_SIZE).map(card).join("");
    renderPager(pages);
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
      page = 1;
      document.querySelectorAll("[data-shop-category]").forEach(function (other) {
        other.setAttribute("aria-pressed", other === button ? "true" : "false");
      });
      render();
    });
  });

  if (pager) {
    pager.addEventListener("click", function (e) {
      var btn = e.target && e.target.closest ? e.target.closest("[data-shop-page]") : null;
      if (!btn || btn.disabled) return;
      var which = btn.getAttribute("data-shop-page");
      if (which === "prev") page -= 1;
      else if (which === "next") page += 1;
      else page = parseInt(which, 10) || 1;
      render();
      root.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

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
