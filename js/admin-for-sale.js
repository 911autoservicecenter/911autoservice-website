/**
 * Admin UI for for-sale listings (cookie session).
 */
(function () {
  var loginSection = document.getElementById("admin-login");
  var adminSection = document.getElementById("admin-panel");
  var loginForm = document.getElementById("admin-login-form");
  var loginError = document.getElementById("admin-login-error");
  var logoutBtn = document.getElementById("admin-logout");
  var listingForm = document.getElementById("listing-form");
  var formStatus = document.getElementById("admin-form-status");
  var tableBody = document.querySelector("#admin-listings-table tbody");
  var btnNew = document.getElementById("btn-new-listing");
  var sessionMeta = document.getElementById("admin-session-meta");
  var sessionEmailEl = document.getElementById("admin-session-email");
  var editingId = null;

  function setSessionDisplay(res) {
    if (res.data && res.data.loggedIn && res.data.email && sessionMeta && sessionEmailEl) {
      sessionEmailEl.textContent = res.data.email;
      sessionMeta.hidden = false;
    } else if (sessionMeta) {
      sessionMeta.hidden = true;
    }
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
      return r.json().then(function (data) {
        return { ok: r.ok, status: r.status, data: data };
      });
    });
  }

  function showLogin() {
    if (loginSection) loginSection.hidden = false;
    if (adminSection) adminSection.hidden = true;
    if (sessionMeta) sessionMeta.hidden = true;
  }

  function showAdmin() {
    if (loginSection) loginSection.hidden = true;
    if (adminSection) adminSection.hidden = false;
    api("/api/for-sale/auth/session", { method: "GET" }).then(function (res) {
      setSessionDisplay(res);
    });
    refreshTable();
  }

  function resetForm() {
    editingId = null;
    if (!listingForm) return;
    listingForm.reset();
    document.getElementById("fld-sold").checked = false;
    if (formStatus) formStatus.textContent = "";
    var h = document.getElementById("form-mode-label");
    if (h) h.textContent = "Add a listing";
  }

  function fillForm(item) {
    editingId = item.id;
    document.getElementById("fld-title").value = item.title || "";
    document.getElementById("fld-price").value = item.price || "";
    document.getElementById("fld-price-note").value = item.priceNote || "";
    document.getElementById("fld-lede").value = item.lede || "";
    document.getElementById("fld-condition").value = item.condition || "";
    document.getElementById("fld-fitment").value = item.fitment || "";
    document.getElementById("fld-stock").value = item.stock || "";
    document.getElementById("fld-warranty").value = item.warranty || "";
    document.getElementById("fld-fineprint").value = item.fineprint || "";
    document.getElementById("fld-image-url").value = item.imageUrl || "";
    document.getElementById("fld-image-alt").value = item.imageAlt || "";
    document.getElementById("fld-sold").checked = !!item.sold;
    var h = document.getElementById("form-mode-label");
    if (h) h.textContent = "Edit listing";
    listingForm.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function rowHtml(item) {
    var tr = document.createElement("tr");
    var title = document.createElement("td");
    title.textContent = item.title || "";
    var price = document.createElement("td");
    price.textContent = item.price || "";
    var st = document.createElement("td");
    st.textContent = item.sold ? "Sold" : "Available";
    var actions = document.createElement("td");
    var bEdit = document.createElement("button");
    bEdit.type = "button";
    bEdit.className = "btn btn-ghost btn-sm";
    bEdit.textContent = "Edit";
    bEdit.addEventListener("click", function () {
      fillForm(item);
    });
    var bDel = document.createElement("button");
    bDel.type = "button";
    bDel.className = "btn btn-ghost btn-sm admin-btn-danger";
    bDel.textContent = "Delete";
    bDel.addEventListener("click", function () {
      if (!confirm("Delete this listing permanently?")) return;
      api("/api/for-sale/item/" + encodeURIComponent(item.id), { method: "DELETE" }).then(function (res) {
        if (res.data && res.data.ok) {
          refreshTable();
          if (editingId === item.id) resetForm();
        } else {
          alert((res.data && res.data.message) || "Could not delete.");
        }
      });
    });
    actions.appendChild(bEdit);
    actions.appendChild(document.createTextNode(" "));
    actions.appendChild(bDel);
    tr.appendChild(title);
    tr.appendChild(price);
    tr.appendChild(st);
    tr.appendChild(actions);
    return tr;
  }

  function refreshTable() {
    if (!tableBody) return;
    tableBody.innerHTML = "";
    api("/api/for-sale/listings", { method: "GET" }).then(function (res) {
      var list = (res.data && res.data.listings) || [];
      if (!list.length) {
        var tr = document.createElement("tr");
        var td = document.createElement("td");
        td.colSpan = 4;
        td.textContent = "No listings yet. Add one below.";
        tr.appendChild(td);
        tableBody.appendChild(tr);
        return;
      }
      list.forEach(function (item) {
        tableBody.appendChild(rowHtml(item));
      });
    });
  }

  function checkSession() {
    api("/api/for-sale/auth/session", { method: "GET" }).then(function (res) {
      setSessionDisplay(res);
      if (res.data && res.data.loggedIn) {
        if (loginSection) loginSection.hidden = true;
        if (adminSection) adminSection.hidden = false;
        refreshTable();
      } else {
        showLogin();
      }
    });
  }

  if (loginForm) {
    loginForm.addEventListener("submit", function (e) {
      e.preventDefault();
      if (loginError) {
        loginError.textContent = "";
        loginError.hidden = true;
      }
      var pw = document.getElementById("admin-password");
      var em = document.getElementById("admin-email");
      var val = pw ? pw.value : "";
      api("/api/for-sale/auth/login", {
        method: "POST",
        body: {
          email: em ? em.value.trim() : "",
          password: val,
        },
      }).then(function (res) {
        if (res.data && res.data.ok) {
          if (pw) pw.value = "";
          showAdmin();
        } else {
          if (loginError) {
            loginError.textContent = (res.data && res.data.message) || "Login failed.";
            loginError.hidden = false;
          }
        }
      });
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", function () {
      api("/api/for-sale/auth/logout", { method: "POST" }).then(function () {
        resetForm();
        showLogin();
      });
    });
  }

  if (btnNew) {
    btnNew.addEventListener("click", function () {
      resetForm();
    });
  }

  if (listingForm) {
    listingForm.addEventListener("submit", function (e) {
      e.preventDefault();
      if (formStatus) formStatus.textContent = "";
      var payload = {
        title: document.getElementById("fld-title").value.trim(),
        price: document.getElementById("fld-price").value.trim(),
        priceNote: document.getElementById("fld-price-note").value.trim(),
        lede: document.getElementById("fld-lede").value.trim(),
        condition: document.getElementById("fld-condition").value.trim(),
        fitment: document.getElementById("fld-fitment").value.trim(),
        stock: document.getElementById("fld-stock").value.trim(),
        warranty: document.getElementById("fld-warranty").value.trim(),
        fineprint: document.getElementById("fld-fineprint").value.trim(),
        imageUrl: document.getElementById("fld-image-url").value.trim(),
        imageAlt: document.getElementById("fld-image-alt").value.trim(),
        sold: document.getElementById("fld-sold").checked,
      };
      if (!payload.title) {
        if (formStatus) formStatus.textContent = "Title is required.";
        return;
      }
      var promise;
      if (editingId) {
        promise = api("/api/for-sale/item/" + encodeURIComponent(editingId), {
          method: "PUT",
          body: payload,
        });
      } else {
        promise = api("/api/for-sale/listings", {
          method: "POST",
          body: payload,
        });
      }
      promise.then(function (res) {
        if (res.data && res.data.ok) {
          if (formStatus) formStatus.textContent = editingId ? "Saved." : "Created.";
          resetForm();
          refreshTable();
        } else {
          if (formStatus) {
            formStatus.textContent = (res.data && res.data.message) || "Save failed.";
          }
        }
      });
    });
  }

  checkSession();
})();
