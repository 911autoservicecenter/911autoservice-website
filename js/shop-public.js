/**
 * Public shop grid. Empty until a product is listed in the staff shop.
 */
(function () {
  var root = document.getElementById("shop-grid");
  var loading = document.getElementById("shop-loading");
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

  function card(item) {
    var photos = Array.isArray(item.photos) ? item.photos.filter(function (p) { return p && p.url; }) : [];
    var img = photos.length ? photos[0].url : item.imageUrl || "images/logo.png?v=2";
    var alt = (photos[0] && photos[0].alt) || item.imageAlt || item.title || "Product photo";
    var out = !item.qtyOnHand;
    return (
      '<article class="sale-card' +
      (out ? " sale-card--sold" : "") +
      '"><a class="sale-card__link" href="product.html?id=' +
      encodeURIComponent(item.id) +
      '">' +
      '<figure class="sale-card__photo"><img src="' +
      esc(img) +
      '" width="640" height="480" alt="' +
      esc(alt) +
      '" loading="lazy" decoding="async" /></figure>' +
      '<div class="sale-card__body"><h3 class="sale-card__title">' +
      esc(item.title) +
      "</h3>" +
      '<p class="sale-card__price">' +
      money(item.priceCents) +
      "</p>" +
      '<p class="shop-card__ship-note">Advertised price does not include shipping.</p>' +
      "</div></a></article>"
    );
  }

  var PAGE_SIZE = 20;
  var activeCategory = "all";
  var page = 1;
  var products = [];
  var pager = document.getElementById("shop-pages");
  var priceMin = document.getElementById("shop-price-min");
  var priceMax = document.getElementById("shop-price-max");
  var inStock = document.getElementById("shop-instock");
  var vehicleMake = document.getElementById("shop-vehicle-make");
  var vehicleModel = document.getElementById("shop-vehicle-model");
  var vehicleYear = document.getElementById("shop-vehicle-year");
  var vehicleOptions = {};

  function selectedVehicle() {
    return {
      make: vehicleMake ? vehicleMake.value : "",
      model: vehicleModel ? vehicleModel.value : "",
      year: vehicleYear ? vehicleYear.value : "",
    };
  }

  function fillSelect(select, values, placeholder, disabled) {
    if (!select) return;
    var current = select.value;
    select.innerHTML = "";
    var first = document.createElement("option");
    first.value = "";
    first.textContent = placeholder;
    select.appendChild(first);
    values.forEach(function (value) {
      var opt = document.createElement("option");
      opt.value = value;
      opt.textContent = value;
      select.appendChild(opt);
    });
    select.disabled = !!disabled;
    select.value = values.indexOf(current) !== -1 ? current : "";
  }

  function refreshVehicleChoices() {
    var makes = Object.keys(vehicleOptions).sort();
    fillSelect(vehicleMake, makes, "Any vehicle", false);
    var make = vehicleMake ? vehicleMake.value : "";
    var models = make && vehicleOptions[make] ? Object.keys(vehicleOptions[make]).sort() : [];
    fillSelect(vehicleModel, models, "Any model", !make);
    var model = vehicleModel ? vehicleModel.value : "";
    var years = [];
    if (make && model && vehicleOptions[make] && vehicleOptions[make][model]) {
      years = Object.keys(vehicleOptions[make][model]).sort(function (a, b) {
        return +b - +a;
      });
    }
    fillSelect(vehicleYear, years, "Any year", !model);
  }

  function selectedBrands() {
    var picked = [];
    document.querySelectorAll("[data-shop-brand]").forEach(function (box) {
      if (box.checked) picked.push(box.getAttribute("data-shop-brand"));
    });
    return picked;
  }

  function dollar(input) {
    if (!input || String(input.value).trim() === "") return null;
    var n = Number(input.value);
    return isFinite(n) ? n : null;
  }

  function filtersActive() {
    var vehicle = selectedVehicle();
    return (
      activeCategory !== "all" ||
      selectedBrands().length > 0 ||
      dollar(priceMin) != null ||
      dollar(priceMax) != null ||
      (inStock && inStock.checked) ||
      !!vehicle.make
    );
  }

  function visibleProducts() {
    var brands = selectedBrands();
    var min = dollar(priceMin);
    var max = dollar(priceMax);
    return products.filter(function (item) {
      if (activeCategory !== "all" && item.category !== activeCategory) return false;
      if (brands.length && brands.indexOf(item.brand) === -1) return false;
      var price = (parseInt(item.priceCents, 10) || 0) / 100;
      if (min != null && price < min) return false;
      if (max != null && price > max) return false;
      if (inStock && inStock.checked && !item.qtyOnHand) return false;
      if (window.ShopVehicles && !window.ShopVehicles.matches(item, selectedVehicle())) return false;
      return true;
    });
  }

  var PAGE_BUTTONS = 10;

  function renderPager(pages) {
    if (!pager) return;
    if (pages < 2) {
      pager.hidden = true;
      pager.innerHTML = "";
      return;
    }
    pager.hidden = false;
    var block = Math.floor((page - 1) / PAGE_BUTTONS);
    var first = block * PAGE_BUTTONS + 1;
    var last = Math.min(pages, first + PAGE_BUTTONS - 1);
    var html = "";
    if (pages > PAGE_BUTTONS) {
      html +=
        '<button type="button" data-shop-page="prev10"' +
        (first <= 1 ? " disabled" : "") +
        ">Previous 10</button>";
    }
    for (var i = first; i <= last; i++) {
      html +=
        '<button type="button" data-shop-page="' +
        i +
        '"' +
        (i === page ? ' aria-current="page"' : "") +
        ">" +
        i +
        "</button>";
    }
    if (pages > PAGE_BUTTONS) {
      html +=
        '<button type="button" data-shop-page="next10"' +
        (last >= pages ? " disabled" : "") +
        ">Next 10</button>";
    }
    pager.innerHTML = html;
  }

  function render() {
    if (loading) loading.remove();
    var list = visibleProducts();
    if (!list.length) {
      root.innerHTML =
        '<p class="sale-empty">' +
        (!products.length
          ? "New items will be posted here."
          : filtersActive()
            ? "Nothing matches those filters."
            : "Nothing listed in this category yet.") +
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

  function syncBrandLogos() {
    document.querySelectorAll("[data-brand-logo]").forEach(function (btn) {
      var id = btn.getAttribute("data-brand-logo");
      var box = document.querySelector('[data-shop-brand="' + id + '"]');
      btn.setAttribute("aria-pressed", box && box.checked ? "true" : "false");
    });
  }

  function onFilterChange() {
    page = 1;
    syncBrandLogos();
    render();
  }

  document.querySelectorAll("[data-shop-brand]").forEach(function (box) {
    box.addEventListener("change", onFilterChange);
  });
  if (priceMin) priceMin.addEventListener("input", onFilterChange);
  if (priceMax) priceMax.addEventListener("input", onFilterChange);
  if (inStock) inStock.addEventListener("change", onFilterChange);
  if (vehicleMake) {
    vehicleMake.addEventListener("change", function () {
      if (vehicleModel) vehicleModel.value = "";
      if (vehicleYear) vehicleYear.value = "";
      refreshVehicleChoices();
      onFilterChange();
    });
  }
  if (vehicleModel) {
    vehicleModel.addEventListener("change", function () {
      if (vehicleYear) vehicleYear.value = "";
      refreshVehicleChoices();
      onFilterChange();
    });
  }
  if (vehicleYear) vehicleYear.addEventListener("change", onFilterChange);

  document.querySelectorAll("[data-brand-logo]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var id = btn.getAttribute("data-brand-logo");
      var box = document.querySelector('[data-shop-brand="' + id + '"]');
      if (!box) return;
      box.checked = !box.checked;
      onFilterChange();
    });
  });

  var filterForm = document.getElementById("shop-filters");
  if (filterForm) {
    filterForm.addEventListener("submit", function (e) {
      e.preventDefault();
    });
  }

  var clearBtn = document.getElementById("shop-filter-clear");
  if (clearBtn) {
    clearBtn.addEventListener("click", function () {
      activeCategory = "all";
      document.querySelectorAll("[data-shop-category]").forEach(function (button) {
        button.setAttribute("aria-pressed", button.getAttribute("data-shop-category") === "all" ? "true" : "false");
      });
      document.querySelectorAll("[data-shop-brand]").forEach(function (box) {
        box.checked = false;
      });
      if (priceMin) priceMin.value = "";
      if (priceMax) priceMax.value = "";
      if (inStock) inStock.checked = false;
      if (vehicleMake) vehicleMake.value = "";
      if (vehicleModel) vehicleModel.value = "";
      if (vehicleYear) vehicleYear.value = "";
      refreshVehicleChoices();
      onFilterChange();
    });
  }

  if (pager) {
    pager.addEventListener("click", function (e) {
      var btn = e.target && e.target.closest ? e.target.closest("[data-shop-page]") : null;
      if (!btn || btn.disabled) return;
      var which = btn.getAttribute("data-shop-page");
      var pages = Math.ceil(visibleProducts().length / PAGE_SIZE) || 1;
      if (which === "prev10") page = Math.max(1, (Math.floor((page - 1) / PAGE_BUTTONS) - 1) * PAGE_BUTTONS + 1);
      else if (which === "next10") page = Math.min(pages, (Math.floor((page - 1) / PAGE_BUTTONS) + 1) * PAGE_BUTTONS + 1);
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
      vehicleOptions = window.ShopVehicles ? window.ShopVehicles.options(products) : {};
      refreshVehicleChoices();
      render();
    })
    .catch(function () {
      products = [];
      render();
    });
})();
