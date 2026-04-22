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
  var uploadInput = document.getElementById("fld-photos-upload");
  var uploadBtn = document.getElementById("btn-upload-photos");
  var uploadStatus = document.getElementById("admin-upload-status");
  var photoList = document.getElementById("admin-photo-list");
  var editingId = null;
  var currentPhotos = [];

  function esc(s) {
    if (s == null) return "";
    var d = document.createElement("div");
    d.textContent = String(s);
    return d.innerHTML;
  }

  function normalizePhotos(item) {
    if (item && Array.isArray(item.photos) && item.photos.length) {
      return item.photos
        .map(function (p) {
          return {
            url: p && p.url ? String(p.url).trim() : "",
            alt: p && p.alt ? String(p.alt).trim() : "",
          };
        })
        .filter(function (p) {
          return !!p.url;
        });
    }
    if (item && item.imageUrl && String(item.imageUrl).trim()) {
      return [
        {
          url: String(item.imageUrl).trim(),
          alt: item.imageAlt ? String(item.imageAlt).trim() : "",
        },
      ];
    }
    return [];
  }

  function renderPhotoList() {
    if (!photoList) return;
    if (!currentPhotos.length) {
      photoList.innerHTML = '<p class="admin-photo-list__empty">No uploaded photos yet.</p>';
      return;
    }
    photoList.innerHTML = currentPhotos
      .map(function (p, idx) {
        return (
          '<div class="admin-photo-list__item">' +
          '<img src="' +
          esc(p.url) +
          '" alt="" loading="lazy" decoding="async" />' +
          '<button type="button" class="btn btn-ghost btn-sm admin-btn-danger" data-remove-photo="' +
          idx +
          '">Remove</button>' +
          "</div>"
        );
      })
      .join("");
  }

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
    return fetch(path, opts)
      .then(function (r) {
        return r.text().then(function (text) {
          var data = {};
          if (text && text.trim()) {
            try {
              data = JSON.parse(text);
            } catch (e) {
              data = {
                ok: false,
                message: "Server returned a non-JSON response (" + r.status + "). Try again or check Vercel logs.",
              };
            }
          } else if (!r.ok) {
            data = { ok: false, message: "Empty response (" + r.status + ")." };
          }
          return { ok: r.ok, status: r.status, data: data };
        });
      })
      .catch(function () {
        return {
          ok: false,
          status: 0,
          data: { ok: false, message: "Network error. Check your connection and that you are on the live https:// site." },
        };
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
    currentPhotos = [];
    renderPhotoList();
    if (uploadStatus) uploadStatus.textContent = "";
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
    document.getElementById("fld-image-alt").value = item.imageAlt || "";
    currentPhotos = normalizePhotos(item);
    renderPhotoList();
    if (uploadStatus) uploadStatus.textContent = "";
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
    listingForm.addEventListener("click", function (e) {
      var target = e.target;
      if (!target || !target.getAttribute) return;
      var removeIdx = target.getAttribute("data-remove-photo");
      if (removeIdx == null || removeIdx === "") return;
      var idx = Number(removeIdx);
      if (isNaN(idx) || idx < 0 || idx >= currentPhotos.length) return;
      currentPhotos.splice(idx, 1);
      renderPhotoList();
    });

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
        imageAlt: document.getElementById("fld-image-alt").value.trim(),
        photos: currentPhotos.map(function (p) {
          return {
            url: p.url,
            alt: p.alt || "",
          };
        }),
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
          var msg = (res.data && res.data.message) || "Save failed.";
          if (res.status === 401) {
            msg = "Session expired or not signed in. Sign in again and try Save.";
          }
          if (formStatus) {
            formStatus.textContent = msg;
          }
        }
      });
    });
  }

  if (uploadBtn) {
    uploadBtn.addEventListener("click", function () {
      if (!uploadInput || !uploadInput.files || !uploadInput.files.length) {
        if (uploadStatus) uploadStatus.textContent = "Choose one or more photo files first.";
        return;
      }
      if (uploadStatus) uploadStatus.textContent = "Uploading photo(s)…";
      var fd = new FormData();
      Array.prototype.forEach.call(uploadInput.files, function (file) {
        fd.append("photos", file);
      });
      api("/api/for-sale/photos", { method: "POST", body: fd }).then(function (res) {
        if (res.data && res.data.ok && Array.isArray(res.data.photos)) {
          var uploaded = res.data.photos.filter(function (p) {
            return p && p.url;
          });
          if (uploaded.length) {
            currentPhotos = currentPhotos.concat(uploaded);
            renderPhotoList();
          }
          if (uploadStatus) uploadStatus.textContent = "Uploaded " + uploaded.length + " photo(s).";
          uploadInput.value = "";
        } else {
          var msg = (res.data && res.data.message) || "Could not upload photos.";
          if (res.status === 401) msg = "Session expired. Sign in again and retry upload.";
          if (uploadStatus) uploadStatus.textContent = msg;
        }
      });
    });
  }

  renderPhotoList();
  checkSession();
})();
