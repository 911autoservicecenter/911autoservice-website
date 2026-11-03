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

  function stockLabel(qty) {
    if (!qty) return "Out of stock";
    if (qty <= 5) return qty === 1 ? "1 left" : qty + " left";
    return "In stock";
  }

  function card(item) {
    var photos = Array.isArray(item.photos) ? item.photos.filter(function (p) { return p && p.url; }) : [];
    var img = photos.length ? photos[0].url : item.imageUrl || "images/logo.png";
    var alt = (photos[0] && photos[0].alt) || item.imageAlt || item.title || "Product photo";
    var out = !item.qtyOnHand;
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
      '</h3><p class="sale-card__price">' +
      money(item.priceCents) +
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

  function render(list) {
    if (loading) loading.remove();
    if (!list.length) {
      root.innerHTML = '<p class="sale-empty">There is nothing in the online shop right now.</p>';
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

  fetch("/api/shop/catalog", { credentials: "same-origin" })
    .then(function (r) {
      return r.json();
    })
    .then(function (data) {
      render(data && data.ok && Array.isArray(data.products) ? data.products : []);
    })
    .catch(function () {
      if (loading) loading.remove();
      root.innerHTML = '<p class="sale-empty">There is nothing in the online shop right now.</p>';
    });
})();
