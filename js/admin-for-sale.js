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
  var photoUrlInput = document.getElementById("fld-photo-url");
  var addPhotoUrlBtn = document.getElementById("btn-add-photo-url");
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

  /**
   * Accepts /path, https://…, or domain/path without scheme (adds https://).
   * Paths without a leading slash get one (e.g. for-sale-media/x.jpg).
   */
  function normalizePhotoUrlInput(raw) {
    raw = String(raw || "").trim();
    if (!raw) {
      return { url: "", error: "empty" };
    }
    if (raw.indexOf("//") === 0 && raw.indexOf("///", 0) !== 0) {
      return { url: "https:" + raw, error: "" };
    }
    if (raw.indexOf("/") === 0) {
      return { url: raw, error: "" };
    }
    if (/^https?:\/\//i.test(raw)) {
      return { url: raw, error: "" };
    }
    var slash = raw.indexOf("/");
    if (slash > 0) {
      var first = raw.slice(0, slash);
      if (/^[a-z0-9]([a-z0-9-]*\.)+[a-z]{2,}$/i.test(first)) {
        return { url: "https://" + raw, error: "" };
      }
      return { url: "/" + raw.replace(/^\/+/, ""), error: "" };
    }
    return { url: "", error: "format" };
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
              var fallback =
                r.status === 413
                  ? "Upload too large. Use smaller images or upload fewer at a time."
                  : "Server returned a non-JSON response (" + r.status + "). Try again or check Vercel logs.";
              data = {
                ok: false,
                message: fallback,
              };
            }
          } else if (!r.ok) {
            data = {
              ok: false,
              message:
                r.status === 413
                  ? "Upload too large. Use smaller images or upload fewer at a time."
                  : "Empty response (" + r.status + ").",
            };
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
    if (photoUrlInput) photoUrlInput.value = "";
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
      var files = Array.prototype.slice.call(uploadInput.files);
      var maxClientBytes = 4 * 1024 * 1024;
      var tooLarge = files.find(function (f) {
        return f && f.size > maxClientBytes;
      });
      if (tooLarge) {
        if (uploadStatus) {
          uploadStatus.textContent =
            "Each photo must be under 4MB for reliable upload. Resize/compress and try again.";
        }
        return;
      }
      uploadBtn.disabled = true;
      var uploadedCount = 0;
      var stopped = false;
      if (uploadStatus) uploadStatus.textContent = "Uploading 0/" + files.length + "…";

      function uploadNext(i) {
        if (stopped) return;
        if (i >= files.length) {
          if (uploadStatus) uploadStatus.textContent = "Uploaded " + uploadedCount + " photo(s).";
          uploadInput.value = "";
          uploadBtn.disabled = false;
          return;
        }
        var fd = new FormData();
        fd.append("photos", files[i]);
        api("/api/for-sale/photos", { method: "POST", body: fd }).then(function (res) {
          if (res.data && res.data.ok && Array.isArray(res.data.photos)) {
            var uploaded = res.data.photos.filter(function (p) {
              return p && p.url;
            });
            if (uploaded.length) {
              currentPhotos = currentPhotos.concat(uploaded);
              renderPhotoList();
              uploadedCount += uploaded.length;
            }
            if (uploadStatus) {
              uploadStatus.textContent = "Uploading " + Math.min(i + 1, files.length) + "/" + files.length + "…";
            }
            uploadNext(i + 1);
            return;
          }
          stopped = true;
          var msg = (res.data && res.data.message) || "Could not upload photos.";
          if (res.status === 401) msg = "Session expired. Sign in again and retry upload.";
          if (res.status === 413) msg = "Upload too large. Try smaller images.";
          if (uploadStatus) uploadStatus.textContent = msg;
          uploadBtn.disabled = false;
        });
      }

      uploadNext(0);
    });
  }

  if (addPhotoUrlBtn && photoUrlInput) {
    addPhotoUrlBtn.addEventListener("click", function () {
      if (uploadStatus) uploadStatus.textContent = "";
      var norm = normalizePhotoUrlInput(photoUrlInput.value);
      if (norm.error === "empty") {
        if (uploadStatus) uploadStatus.textContent = "Enter an image URL or site path.";
        return;
      }
      if (norm.error === "format" || !norm.url) {
        if (uploadStatus) {
          uploadStatus.textContent =
            "Use https://911autoservice.org/for-sale-media/photo.jpg, or /for-sale-media/photo.jpg (include the .jpg).";
        }
        return;
      }
      if (currentPhotos.length >= 12) {
        if (uploadStatus) uploadStatus.textContent = "Maximum 12 photos per listing.";
        return;
      }
      currentPhotos.push({ url: norm.url, alt: "" });
      photoUrlInput.value = "";
      renderPhotoList();
      if (uploadStatus) uploadStatus.textContent = "Photo URL added. Save the listing to keep it.";
    });
  }

  renderPhotoList();
  checkSession();
})();
