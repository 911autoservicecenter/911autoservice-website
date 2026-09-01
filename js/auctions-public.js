/**
 * Renders public upcoming auctions from GET /api/auctions/listings
 */
(function () {
  var root = document.getElementById("auctions-root");
  var loading = document.getElementById("auctions-loading");
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

  function vehicleCard(item) {
    var photos =
      Array.isArray(item.photos) && item.photos.length
        ? item.photos.filter(function (p) {
            return p && p.url && String(p.url).trim();
          })
        : [];
    var img = photos.length
      ? String(photos[0].url).trim()
      : item.imageUrl && String(item.imageUrl).trim()
        ? item.imageUrl
        : "images/logo.png";
    var title =
      [item.year, item.make, item.model].filter(Boolean).join(" ") || "Vehicle";
    var alt =
      photos.length && photos[0].alt && String(photos[0].alt).trim()
        ? photos[0].alt
        : item.imageAlt && String(item.imageAlt).trim()
          ? item.imageAlt
          : title;
    var sold = !!item.sold;
    var badge = sold ? '<span class="sale-card__badge" aria-label="Sold">Sold</span>' : "";
    var specs =
      specRow("Year", item.year) +
      specRow("Make", item.make) +
      specRow("Model", item.model) +
      specRow("VIN", item.vin) +
      specRow("Lot #", item.lotNumber);

    var thumbStrip =
      photos.length > 1
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
                esc(p.alt || title) +
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
      '"' +
      (item.id ? ' id="vehicle-' + esc(item.id) + '"' : "") +
      ">" +
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
      esc(title) +
      "</h3>" +
      (item.notes && String(item.notes).trim()
        ? '<p class="sale-card__lede">' + esc(item.notes) + "</p>"
        : "") +
      '<dl class="sale-card__specs">' +
      specs +
      "</dl>" +
      thumbStrip +
      '<a class="btn btn-primary sale-card__cta" href="tel:+15172792010">Call 517-279-2010</a>' +
      "</div></article>"
    );
  }

  function auctionBlock(auction) {
    var metaParts = [];
    if (auction.dateLabel) metaParts.push(esc(auction.dateLabel));
    if (auction.timeLabel) metaParts.push(esc(auction.timeLabel));
    var meta =
      metaParts.length
        ? '<p class="auction-event__when">' + metaParts.join(" · ") + "</p>"
        : "";
    var location = auction.location
      ? '<p class="auction-event__where"><strong>Location:</strong> ' +
        esc(auction.location) +
        "</p>"
      : "";
    var notes =
      auction.notes && String(auction.notes).trim()
        ? '<p class="auction-event__notes">' + esc(auction.notes) + "</p>"
        : "";
    var vehicles = Array.isArray(auction.vehicles) ? auction.vehicles : [];
    var vehicleHtml = vehicles.length
      ? '<div class="sale-grid auction-event__vehicles">' +
        vehicles.map(vehicleCard).join("") +
        "</div>"
      : '<p class="sale-empty auction-event__empty-vehicles">Vehicles for this auction will be listed here.</p>';

    return (
      '<article class="auction-event" id="auction-' +
      esc(auction.id || "") +
      '">' +
      '<header class="auction-event__header">' +
      "<h3 class=\"auction-event__title\">" +
      esc(auction.title || "Auction") +
      "</h3>" +
      meta +
      location +
      notes +
      "</header>" +
      '<h4 class="auction-event__vehicles-heading">Vehicles</h4>' +
      vehicleHtml +
      "</article>"
    );
  }

  function bindPhotoThumbs() {
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

  function render(auctions) {
    if (loading) loading.remove();
    if (!auctions || !auctions.length) {
      root.innerHTML =
        '<p class="sale-empty auction-empty">No upcoming auctions at this time. Check back when we schedule the next sale.</p>';
      return;
    }
    root.innerHTML = auctions.map(auctionBlock).join("");
    bindPhotoThumbs();
  }

  fetch("/api/auctions/listings", { credentials: "same-origin" })
    .then(function (r) {
      return r.json();
    })
    .then(function (data) {
      if (data && data.ok && Array.isArray(data.auctions)) {
        render(data.auctions);
      } else {
        render([]);
      }
    })
    .catch(function () {
      if (loading) loading.remove();
      root.innerHTML =
        '<p class="sale-empty auction-empty">No upcoming auctions at this time. Check back when we schedule the next sale.</p>';
    });
})();
