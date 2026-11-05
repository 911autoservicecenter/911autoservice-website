/**
 * Staff shop manager. Sign-in lives on staff.html.
 */
(function () {
  var panel = document.getElementById("admin-panel");
  var gate = document.getElementById("admin-gate");
  var sessionMeta = document.getElementById("admin-session-meta");
  var sessionEmail = document.getElementById("admin-session-email");
  var setup = document.getElementById("shop-setup");
  var productBody = document.querySelector("#product-table tbody");
  var orderBody = document.querySelector("#order-table tbody");
  var productForm = document.getElementById("product-form");
  var settingsForm = document.getElementById("settings-form");
  var productStatus = document.getElementById("product-status");
  var settingsStatus = document.getElementById("settings-status");
  var photoList = document.getElementById("admin-photo-list");
  var uploadStatus = document.getElementById("admin-upload-status");
  var editingId = null;
  var currentPhotos = [];

  function esc(s) {
    var d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  }

  function money(cents) {
    var n = parseInt(cents, 10) || 0;
    return "$" + (n / 100).toFixed(2);
  }

  function api(path, opts) {
    opts = opts || {};
    opts.credentials = "include";
    opts.headers = opts.headers || {};
    if (opts.body && typeof opts.body === "object" && !(opts.body instanceof FormData)) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(opts.body);
    }
    return fetch(path, opts).then(function (r) {
      return r.text().then(function (text) {
        var data = {};
        try {
          data = text ? JSON.parse(text) : {};
        } catch (e) {
          data = { ok: false, message: "Could not read the server response." };
        }
        return { ok: r.ok, status: r.status, data: data };
      });
    });
  }

  function renderPhotos() {
    if (!photoList) return;
    if (!currentPhotos.length) {
      photoList.innerHTML = '<p class="admin-photo-list__empty">No photos yet.</p>';
      return;
    }
    photoList.innerHTML = currentPhotos
      .map(function (p, idx) {
        return (
          '<div class="admin-photo-list__item"><img src="' +
          esc(p.url) +
          '" alt="" /><button type="button" class="btn btn-ghost btn-sm admin-btn-danger" data-remove-photo="' +
          idx +
          '">Remove</button></div>'
        );
      })
      .join("");
  }

  function resetForm() {
    editingId = null;
    if (productForm) productForm.reset();
    var listed = document.getElementById("fld-listed");
    if (listed) listed.checked = true;
    currentPhotos = [];
    renderPhotos();
    if (productStatus) productStatus.textContent = "";
    var heading = document.getElementById("form-mode-label");
    if (heading) heading.textContent = "Add a product";
  }

  function fillForm(item) {
    editingId = item.id;
    document.getElementById("fld-title").value = item.title || "";
    document.getElementById("fld-price").value = ((item.priceCents || 0) / 100).toFixed(2);
    document.getElementById("fld-qty").value = item.qtyOnHand || 0;
    document.getElementById("fld-sku").value = item.sku || "";
    document.getElementById("fld-fitment").value = item.fitment || "";
    document.getElementById("fld-lede").value = item.lede || "";
    document.getElementById("fld-details").value = item.details || "";
    document.getElementById("fld-image-alt").value = item.imageAlt || "";
    document.getElementById("fld-listed").checked = item.listed !== false;
    document.getElementById("fld-install").checked = item.canInstall !== false;
    document.getElementById("fld-ship").checked = item.canShip === true;
    currentPhotos = Array.isArray(item.photos) ? item.photos.map(function (p) { return { url: p.url, alt: p.alt || "" }; }) : [];
    renderPhotos();
    var heading = document.getElementById("form-mode-label");
    if (heading) heading.textContent = "Edit product";
    if (productStatus) productStatus.textContent = "";
  }

  function loadProducts() {
    return api("/api/shop/admin/products").then(function (res) {
      if (!productBody) return;
      var list = (res.data && res.data.products) || [];
      productBody.innerHTML = "";
      if (!list.length) {
        productBody.innerHTML = '<tr><td colspan="5">No products yet. The public shop stays empty until you save one.</td></tr>';
        return;
      }
      list.forEach(function (item) {
        var tr = document.createElement("tr");
        tr.innerHTML =
          "<td>" +
          esc(item.title) +
          "</td><td>" +
          money(item.priceCents) +
          "</td><td>" +
          esc(item.qtyOnHand) +
          "</td><td>" +
          (item.listed === false ? "Hidden" : "Listed") +
          "</td><td></td>";
        var edit = document.createElement("button");
        edit.type = "button";
        edit.className = "btn btn-ghost btn-sm";
        edit.textContent = "Edit";
        edit.addEventListener("click", function () {
          fillForm(item);
        });
        var del = document.createElement("button");
        del.type = "button";
        del.className = "btn btn-ghost btn-sm admin-btn-danger";
        del.textContent = "Delete";
        del.addEventListener("click", function () {
          if (!window.confirm("Remove this product from the shop?")) return;
          api("/api/shop/admin/products?id=" + encodeURIComponent(item.id), { method: "DELETE" }).then(function () {
            if (editingId === item.id) resetForm();
            loadProducts();
          });
        });
        tr.lastChild.appendChild(edit);
        tr.lastChild.appendChild(document.createTextNode(" "));
        tr.lastChild.appendChild(del);
        productBody.appendChild(tr);
      });
    });
  }

  function loadOrders() {
    return api("/api/shop/admin/orders").then(function (res) {
      if (!orderBody) return;
      var list = (res.data && res.data.orders) || [];
      orderBody.innerHTML = "";
      if (!list.length) {
        orderBody.innerHTML = '<tr><td colspan="6">No orders yet.</td></tr>';
        return;
      }
      list.forEach(function (order) {
        var when = order.paidAt || order.createdAt;
        var date = when ? new Date(when).toLocaleString() : "";
        var items = (order.items || [])
          .map(function (line) {
            return line.qty + " × " + line.title;
          })
          .join(", ");
        var who = order.name || order.email || "—";
        var tr = document.createElement("tr");
        tr.innerHTML =
          "<td>" +
          esc(date) +
          "</td><td>" +
          esc(who) +
          (order.phone ? "<br />" + esc(order.phone) : "") +
          "</td><td>" +
          esc(items) +
          (order.staffNote ? '<br /><span class="shop-note">' + esc(order.staffNote) + "</span>" : "") +
          "</td><td>" +
          money(order.totalCents) +
          "</td><td>" +
          esc(order.fulfillment === "ship" ? "Ship" : "Install") +
          "</td><td>" +
          esc(order.status || "") +
          "</td>";
        orderBody.appendChild(tr);
      });
    });
  }

  function loadSettings() {
    return api("/api/shop/admin/settings").then(function (res) {
      var settings = (res.data && res.data.settings) || {};
      var pickup = document.getElementById("set-pickup");
      var shipping = document.getElementById("set-shipping");
      var price = document.getElementById("set-ship-price");
      if (pickup) pickup.checked = settings.pickupEnabled !== false;
      if (shipping) shipping.checked = !!settings.shippingEnabled;
      if (price) price.value = settings.shippingEnabled ? ((settings.flatShippingCents || 0) / 100).toFixed(2) : "";
    });
  }

  function loadStatus() {
    return api("/api/shop/admin/status").then(function (res) {
      if (!setup || !res.data) return;
      var bits = [];
      if (!res.data.redis) bits.push("Redis is not connected, so products cannot be saved yet.");
      if (!res.data.stripe || !res.data.webhook) {
        bits.push("Card checkout is off until a Stripe restricted key and webhook secret are set in Vercel. You can still add products.");
      }
      setup.textContent = bits.join(" ");
    });
  }

  if (productForm) {
    productForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var body = {
        id: editingId,
        title: document.getElementById("fld-title").value,
        price: document.getElementById("fld-price").value,
        qtyOnHand: document.getElementById("fld-qty").value,
        sku: document.getElementById("fld-sku").value,
        fitment: document.getElementById("fld-fitment").value,
        lede: document.getElementById("fld-lede").value,
        details: document.getElementById("fld-details").value,
        imageAlt: document.getElementById("fld-image-alt").value,
        listed: document.getElementById("fld-listed").checked,
        canInstall: document.getElementById("fld-install").checked,
        canShip: document.getElementById("fld-ship").checked,
        photos: currentPhotos,
      };
      api(editingId ? "/api/shop/admin/products" : "/api/shop/admin/products", {
        method: editingId ? "PUT" : "POST",
        body: body,
      }).then(function (res) {
        if (productStatus) {
          productStatus.textContent = res.data && res.data.ok ? "Saved." : (res.data && res.data.message) || "Could not save.";
        }
        if (res.data && res.data.ok) {
          resetForm();
          loadProducts();
        }
      });
    });
  }

  if (settingsForm) {
    settingsForm.addEventListener("submit", function (e) {
      e.preventDefault();
      api("/api/shop/admin/settings", {
        method: "POST",
        body: {
          pickupEnabled: document.getElementById("set-pickup").checked,
          shippingEnabled: document.getElementById("set-shipping").checked,
          shippingPrice: document.getElementById("set-ship-price").value,
        },
      }).then(function (res) {
        if (settingsStatus) {
          settingsStatus.textContent = res.data && res.data.ok ? "Saved." : (res.data && res.data.message) || "Could not save.";
        }
      });
    });
  }

  var uploadBtn = document.getElementById("btn-upload-photos");
  if (uploadBtn) {
    uploadBtn.addEventListener("click", function () {
      var input = document.getElementById("fld-photos-upload");
      if (!input || !input.files || !input.files.length) {
        if (uploadStatus) uploadStatus.textContent = "Choose a photo first.";
        return;
      }
      var fd = new FormData();
      Array.prototype.forEach.call(input.files, function (file) {
        fd.append("photos", file);
      });
      if (uploadStatus) uploadStatus.textContent = "Uploading…";
      api("/api/for-sale/photos", { method: "POST", body: fd }).then(function (res) {
        if (res.data && res.data.ok && res.data.photos) {
          currentPhotos = currentPhotos.concat(res.data.photos);
          renderPhotos();
          input.value = "";
          if (uploadStatus) uploadStatus.textContent = "Uploaded. Save the product to keep them.";
        } else if (uploadStatus) {
          uploadStatus.textContent = (res.data && res.data.message) || "Could not upload.";
        }
      });
    });
  }

  if (photoList) {
    photoList.addEventListener("click", function (e) {
      var btn = e.target && e.target.closest ? e.target.closest("[data-remove-photo]") : null;
      if (!btn) return;
      currentPhotos.splice(parseInt(btn.getAttribute("data-remove-photo"), 10), 1);
      renderPhotos();
    });
  }

  var newBtn = document.getElementById("btn-new-product");
  if (newBtn) newBtn.addEventListener("click", resetForm);
  var logout = document.getElementById("admin-logout");
  if (logout) {
    logout.addEventListener("click", function () {
      api("/api/staff/logout", { method: "POST" }).then(function () {
        window.location.replace("staff.html?next=admin-shop.html");
      });
    });
  }

  api("/api/staff/session").then(function (res) {
    if (!res.data || !res.data.loggedIn) {
      window.location.replace("staff.html?next=admin-shop.html");
      return;
    }
    if (gate) gate.hidden = true;
    if (panel) panel.hidden = false;
    if (sessionEmail && res.data.email) {
      sessionEmail.textContent = res.data.email;
      if (sessionMeta) sessionMeta.hidden = false;
    }
    renderPhotos();
    loadStatus();
    loadSettings();
    loadProducts();
    loadOrders();
  });
})();
