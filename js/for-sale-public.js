/**
 * Renders public for-sale listings from GET /api/for-sale/listings
 */
(function () {
  var root = document.getElementById("sale-listings-root");
  var loading = document.getElementById("sale-loading");
  if (!root) return;

  function esc(s) {
    if (s == null) return "";
    var d = document.createElement("div");
    d.textContent = String(s);
    return d.innerHTML;
  }

  function specRow(label, value) {
    if (!value || !String(value).trim()) return "";
    return (
      "<div><dt>" +
      esc(label) +
      "</dt><dd>" +
      esc(value) +
      "</dd></div>"
    );
  }

  function card(item) {
    var photos = Array.isArray(item.photos) && item.photos.length
      ? item.photos.filter(function (p) {
          return p && p.url && String(p.url).trim();
        })
      : [];
    var img = photos.length
      ? String(photos[0].url).trim()
      : item.imageUrl && String(item.imageUrl).trim()
        ? item.imageUrl
        : "images/logo.png";
    var alt = photos.length && photos[0].alt && String(photos[0].alt).trim()
      ? photos[0].alt
      : item.imageAlt && String(item.imageAlt).trim()
        ? item.imageAlt
        : item.title || "Item photo";
    var sold = !!item.sold;
    var priceClass = sold ? "sale-card__price sale-card__price--muted" : "sale-card__price";
    var badge = sold ? '<span class="sale-card__badge" aria-label="Sold">Sold</span>' : "";
    var priceNote = sold ? "— sold" : item.priceNote || "";
    var specs =
      specRow("Condition", item.condition) +
      specRow("Size / fitment", item.fitment) +
      specRow("Stock #", item.stock) +
      specRow("Warranty", item.warranty);

    var fine = item.fineprint && String(item.fineprint).trim()
      ? '<p class="sale-card__fineprint">' + esc(item.fineprint) + "</p>"
      : "";

    var ctaClass = sold ? "btn btn-ghost sale-card__cta" : "btn btn-primary sale-card__cta";
    var ctaText = sold ? "Ask about similar" : "Call 517-677-3173";

    var thumbStrip = photos.length > 1
      ? '<div class="sale-card__thumbs">' +
        photos
          .map(function (p, idx) {
            return (
              '<button type="button" class="sale-card__thumb' +
              (idx === 0 ? " is-active" : "") +
              '" data-photo-idx="' +
              idx +
              '" data-photo-src="' +
              esc(p.url) +
              '" data-photo-alt="' +
              esc(p.alt || item.imageAlt || item.title || "Item photo") +
              '">' +
              '<img src="' +
              esc(p.url) +
              '" alt="" loading="lazy" decoding="async" />' +
              "</button>"
            );
          })
          .join("") +
        "</div>"
      : "";

    return (
      '<article class="sale-card' +
      (sold ? " sale-card--sold" : "") +
      '">' +
      '<figure class="sale-card__photo">' +
      '<img src="' +
      esc(img) +
      '" width="640" height="480" alt="' +
      esc(alt) +
      '" loading="lazy" decoding="async" class="sale-card__main-photo" />' +
      badge +
      "</figure>" +
      '<div class="sale-card__body">' +
      '<h3 class="sale-card__title">' +
      esc(item.title) +
      "</h3>" +
      '<p class="' +
      priceClass +
      '">' +
      esc(item.price || "") +
      (priceNote
        ? ' <span class="sale-card__price-note">' + esc(priceNote) + "</span>"
        : "") +
      "</p>" +
      (item.lede && String(item.lede).trim()
        ? '<p class="sale-card__lede">' + esc(item.lede) + "</p>"
        : "") +
      '<dl class="sale-card__specs">' +
      specs +
      "</dl>" +
      thumbStrip +
      fine +
      '<a class="' +
      ctaClass +
      '" href="tel:+15176773173">' +
      ctaText +
      "</a>" +
      "</div></article>"
    );
  }

  function render(list) {
    if (loading) loading.remove();
    if (!list || !list.length) {
      root.innerHTML = '<p class="sale-empty">There are no listings at this time.</p>';
      return;
    }
    root.innerHTML = list.map(card).join("");
    root.querySelectorAll(".sale-card").forEach(function (cardEl) {
      var main = cardEl.querySelector(".sale-card__main-photo");
      if (!main) return;
      cardEl.addEventListener("click", function (e) {
        var btn = e.target && e.target.closest ? e.target.closest("[data-photo-src]") : null;
        if (!btn) return;
        main.src = btn.getAttribute("data-photo-src") || main.src;
        main.alt = btn.getAttribute("data-photo-alt") || main.alt;
        cardEl.querySelectorAll(".sale-card__thumb").forEach(function (thumbEl) {
          thumbEl.classList.toggle("is-active", thumbEl === btn);
        });
      });
    });
  }

  fetch("/api/for-sale/listings", { credentials: "same-origin" })
    .then(function (r) {
      return r.json();
    })
    .then(function (data) {
      if (data && data.ok && Array.isArray(data.listings)) {
        render(data.listings);
      } else {
        render([]);
      }
    })
    .catch(function () {
      if (loading) loading.remove();
      root.innerHTML = '<p class="sale-empty">There are no listings at this time.</p>';
    });
})();
