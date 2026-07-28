/**
 * Admin UI for auctions + vehicles (reuses for-sale auth cookie).
 */
(function () {
  var loginSection = document.getElementById("admin-login");
  var adminSection = document.getElementById("admin-panel");
  var loginForm = document.getElementById("admin-login-form");
  var loginError = document.getElementById("admin-login-error");
  var logoutBtn = document.getElementById("admin-logout");
  var auctionForm = document.getElementById("auction-form");
  var auctionFormStatus = document.getElementById("auction-form-status");
  var auctionsTableBody = document.querySelector("#admin-auctions-table tbody");
  var btnNewAuction = document.getElementById("btn-new-auction");
  var sessionMeta = document.getElementById("admin-session-meta");
  var sessionEmailEl = document.getElementById("admin-session-email");
  var vehicleSection = document.getElementById("vehicle-section");
  var vehicleForm = document.getElementById("vehicle-form");
  var vehicleFormStatus = document.getElementById("vehicle-form-status");
  var vehiclesTableBody = document.querySelector("#admin-vehicles-table tbody");
  var btnNewVehicle = document.getElementById("btn-new-vehicle");
  var uploadInput = document.getElementById("fld-photos-upload");
  var uploadBtn = document.getElementById("btn-upload-photos");
  var photoUrlInput = document.getElementById("fld-photo-url");
  var addPhotoUrlBtn = document.getElementById("btn-add-photo-url");
  var uploadStatus = document.getElementById("admin-upload-status");
  var photoList = document.getElementById("admin-photo-list");

  var editingAuctionId = null;
  var editingVehicleId = null;
  var currentPhotos = [];
  var auctionsCache = [];

  function esc(s) {
    if (s == null) return "";
    var d = document.createElement("div");
    d.textContent = String(s);
    return d.innerHTML;
  }

  function normalizePhotoUrlInput(raw) {
    raw = String(raw || "")
      .replace(/^\uFEFF/, "")
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .trim();
    if (!raw) return { url: "", error: "empty" };
    if (raw.indexOf("//") === 0 && raw.indexOf("///", 0) !== 0) {
      return { url: "https:" + raw, error: "" };
    }
    if (raw.indexOf("/") === 0) return { url: raw, error: "" };
    if (/^https?:\/\//i.test(raw)) return { url: raw, error: "" };
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
                message:
                  r.status === 413
                    ? "Upload too large. Use smaller images."
                    : "Server returned a non-JSON response (" + r.status + ").",
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
          data: { ok: false, message: "Network error." },
        };
      });
  }

  function setSessionDisplay(res) {
    if (res.data && res.data.loggedIn && res.data.email && sessionMeta && sessionEmailEl) {
      sessionEmailEl.textContent = res.data.email;
      sessionMeta.hidden = false;
    } else if (sessionMeta) {
      sessionMeta.hidden = true;
    }
  }

  function showLogin() {
    if (loginSection) loginSection.hidden = false;
    if (adminSection) adminSection.hidden = true;
    if (sessionMeta) sessionMeta.hidden = true;
  }

  function showAdmin() {
    if (loginSection) loginSection.hidden = true;
    if (adminSection) adminSection.hidden = false;
    api("/api/for-sale/auth/session", { method: "GET" }).then(setSessionDisplay);
    refreshAuctions();
  }

  function auctionStatusLabel(a) {
    if (a.ended) return "Ended";
    if (a.published === false) return "Draft";
    return "Upcoming";
  }

  function formatDateLabel(isoDate) {
    if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return "";
    var d = new Date(isoDate + "T12:00:00");
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function formatTimeLabel(hhmm) {
    if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return "";
    var parts = hhmm.split(":");
    var h = parseInt(parts[0], 10);
    var m = parts[1];
    if (isNaN(h)) return "";
    var ampm = h >= 12 ? "PM" : "AM";
    var h12 = h % 12 || 12;
    return h12 + ":" + m + " " + ampm;
  }

  function displayDate(a) {
    if (a && a.date) {
      var label = formatDateLabel(a.date);
      if (label) return label;
    }
    return (a && a.dateLabel) || "—";
  }

  function resetAuctionForm() {
    editingAuctionId = null;
    if (auctionForm) auctionForm.reset();
    document.getElementById("fld-published").checked = true;
    document.getElementById("fld-ended").checked = false;
    if (auctionFormStatus) auctionFormStatus.textContent = "";
    var h = document.getElementById("auction-form-heading");
    if (h) h.textContent = "Add an auction";
    if (vehicleSection) vehicleSection.hidden = true;
    resetVehicleForm();
  }

  function fillAuctionForm(a) {
    editingAuctionId = a.id;
    document.getElementById("fld-auction-title").value = a.title || "";
    document.getElementById("fld-date").value = a.date || "";
    document.getElementById("fld-time").value = a.time || "";
    document.getElementById("fld-location").value = a.location || "";
    document.getElementById("fld-auction-notes").value = a.notes || "";
    document.getElementById("fld-published").checked = a.published !== false;
    document.getElementById("fld-ended").checked = !!a.ended;
    var h = document.getElementById("auction-form-heading");
    if (h) h.textContent = "Edit auction";
    if (auctionFormStatus) auctionFormStatus.textContent = "";
    if (vehicleSection) {
      vehicleSection.hidden = false;
      var intro = document.getElementById("vehicle-section-intro");
      if (intro) {
        intro.textContent =
          "Vehicles for “" + (a.title || "Auction") + "”. Add photos, year, make, model, and VIN.";
      }
    }
    resetVehicleForm();
    renderVehiclesTable(a);
    auctionForm.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function resetVehicleForm() {
    editingVehicleId = null;
    if (vehicleForm) vehicleForm.reset();
    document.getElementById("fld-sold").checked = false;
    currentPhotos = [];
    if (photoUrlInput) photoUrlInput.value = "";
    renderPhotoList();
    if (uploadStatus) uploadStatus.textContent = "";
    if (vehicleFormStatus) vehicleFormStatus.textContent = "";
    var h = document.getElementById("vehicle-form-mode");
    if (h) h.textContent = "Add a vehicle";
  }

  function fillVehicleForm(v) {
    editingVehicleId = v.id;
    document.getElementById("fld-year").value = v.year || "";
    document.getElementById("fld-make").value = v.make || "";
    document.getElementById("fld-model").value = v.model || "";
    document.getElementById("fld-vin").value = v.vin || "";
    document.getElementById("fld-lot").value = v.lotNumber || "";
    document.getElementById("fld-vehicle-notes").value = v.notes || "";
    document.getElementById("fld-image-alt").value = v.imageAlt || "";
    document.getElementById("fld-sold").checked = !!v.sold;
    currentPhotos = normalizePhotos(v);
    renderPhotoList();
    var h = document.getElementById("vehicle-form-mode");
    if (h) h.textContent = "Edit vehicle";
    vehicleForm.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderVehiclesTable(auction) {
    if (!vehiclesTableBody) return;
    vehiclesTableBody.innerHTML = "";
    var list = (auction && auction.vehicles) || [];
    if (!list.length) {
      var tr = document.createElement("tr");
      var td = document.createElement("td");
      td.colSpan = 5;
      td.textContent = "No vehicles yet. Add one below.";
      tr.appendChild(td);
      vehiclesTableBody.appendChild(tr);
      return;
    }
    list.forEach(function (v) {
      var tr = document.createElement("tr");
      ["year", "make", "model", "vin"].forEach(function (key) {
        var cell = document.createElement("td");
        cell.textContent = v[key] || "";
        tr.appendChild(cell);
      });
      var actions = document.createElement("td");
      var bEdit = document.createElement("button");
      bEdit.type = "button";
      bEdit.className = "btn btn-ghost btn-sm";
      bEdit.textContent = "Edit";
      bEdit.addEventListener("click", function () {
        fillVehicleForm(v);
      });
      var bDel = document.createElement("button");
      bDel.type = "button";
      bDel.className = "btn btn-ghost btn-sm admin-btn-danger";
      bDel.textContent = "Delete";
      bDel.addEventListener("click", function () {
        if (!confirm("Delete this vehicle permanently?")) return;
        api(
          "/api/auctions/vehicle/" +
            encodeURIComponent(v.id) +
            "?auctionId=" +
            encodeURIComponent(editingAuctionId),
          { method: "DELETE", body: { auctionId: editingAuctionId } }
        ).then(function (res) {
          if (res.data && res.data.ok) {
            refreshAuctions().then(function () {
              var a = auctionsCache.find(function (x) {
                return x.id === editingAuctionId;
              });
              if (a) {
                fillAuctionForm(a);
              }
            });
          } else {
            alert((res.data && res.data.message) || "Could not delete.");
          }
        });
      });
      actions.appendChild(bEdit);
      actions.appendChild(document.createTextNode(" "));
      actions.appendChild(bDel);
      tr.appendChild(actions);
      vehiclesTableBody.appendChild(tr);
    });
  }

  function auctionRow(a) {
    var tr = document.createElement("tr");
    var title = document.createElement("td");
    title.textContent = a.title || "";
    var date = document.createElement("td");
    date.textContent = displayDate(a);
    var count = document.createElement("td");
    count.textContent = String((a.vehicles && a.vehicles.length) || 0);
    var status = document.createElement("td");
    status.textContent = auctionStatusLabel(a);
    var actions = document.createElement("td");
    var bEdit = document.createElement("button");
    bEdit.type = "button";
    bEdit.className = "btn btn-ghost btn-sm";
    bEdit.textContent = "Edit";
    bEdit.addEventListener("click", function () {
      fillAuctionForm(a);
    });
    var bDel = document.createElement("button");
    bDel.type = "button";
    bDel.className = "btn btn-ghost btn-sm admin-btn-danger";
    bDel.textContent = "Delete";
    bDel.addEventListener("click", function () {
      if (!confirm("Delete this auction and all its vehicles?")) return;
      api("/api/auctions/item/" + encodeURIComponent(a.id), { method: "DELETE" }).then(function (res) {
        if (res.data && res.data.ok) {
          if (editingAuctionId === a.id) resetAuctionForm();
          refreshAuctions();
        } else {
          alert((res.data && res.data.message) || "Could not delete.");
        }
      });
    });
    actions.appendChild(bEdit);
    actions.appendChild(document.createTextNode(" "));
    actions.appendChild(bDel);
    tr.appendChild(title);
    tr.appendChild(date);
    tr.appendChild(count);
    tr.appendChild(status);
    tr.appendChild(actions);
    return tr;
  }

  function refreshAuctions() {
    if (!auctionsTableBody) return Promise.resolve();
    return api("/api/auctions/listings?all=1", { method: "GET" }).then(function (res) {
      auctionsTableBody.innerHTML = "";
      auctionsCache = (res.data && res.data.auctions) || [];
      if (!auctionsCache.length) {
        var tr = document.createElement("tr");
        var td = document.createElement("td");
        td.colSpan = 5;
        td.textContent = "No auctions yet. Create one below — the public page will stay empty until you publish.";
        tr.appendChild(td);
        auctionsTableBody.appendChild(tr);
        return;
      }
      auctionsCache.forEach(function (a) {
        auctionsTableBody.appendChild(auctionRow(a));
      });
      if (editingAuctionId) {
        var current = auctionsCache.find(function (x) {
          return x.id === editingAuctionId;
        });
        if (current) renderVehiclesTable(current);
      }
    });
  }

  function checkSession() {
    api("/api/for-sale/auth/session", { method: "GET" }).then(function (res) {
      setSessionDisplay(res);
      if (res.data && res.data.loggedIn) {
        if (loginSection) loginSection.hidden = true;
        if (adminSection) adminSection.hidden = false;
        refreshAuctions();
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
      api("/api/for-sale/auth/login", {
        method: "POST",
        body: {
          email: em ? em.value.trim() : "",
          password: pw ? pw.value : "",
        },
      }).then(function (res) {
        if (res.data && res.data.ok) {
          if (pw) pw.value = "";
          showAdmin();
        } else if (loginError) {
          loginError.textContent = (res.data && res.data.message) || "Login failed.";
          loginError.hidden = false;
        }
      });
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", function () {
      api("/api/for-sale/auth/logout", { method: "POST" }).then(function () {
        resetAuctionForm();
        showLogin();
      });
    });
  }

  if (btnNewAuction) {
    btnNewAuction.addEventListener("click", resetAuctionForm);
  }

  if (btnNewVehicle) {
    btnNewVehicle.addEventListener("click", resetVehicleForm);
  }

  ["fld-date", "fld-time"].forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("click", function () {
      if (typeof el.showPicker === "function") {
        try {
          el.showPicker();
        } catch (err) {
          /* ignore — browser may block if not a user gesture */
        }
      }
    });
    el.addEventListener("focus", function () {
      if (typeof el.showPicker === "function") {
        try {
          el.showPicker();
        } catch (err) {
          /* ignore */
        }
      }
    });
  });

  if (auctionForm) {
    auctionForm.addEventListener("submit", function (e) {
      e.preventDefault();
      if (auctionFormStatus) auctionFormStatus.textContent = "";
      var dateVal = document.getElementById("fld-date").value.trim();
      var timeVal = document.getElementById("fld-time").value.trim();
      var payload = {
        title: document.getElementById("fld-auction-title").value.trim(),
        date: dateVal,
        time: timeVal,
        dateLabel: formatDateLabel(dateVal),
        timeLabel: formatTimeLabel(timeVal),
        location: document.getElementById("fld-location").value.trim(),
        notes: document.getElementById("fld-auction-notes").value.trim(),
        published: document.getElementById("fld-published").checked,
        ended: document.getElementById("fld-ended").checked,
      };
      if (!payload.title) {
        if (auctionFormStatus) auctionFormStatus.textContent = "Title is required.";
        return;
      }
      if (!payload.date) {
        if (auctionFormStatus) auctionFormStatus.textContent = "Pick a date.";
        return;
      }
      if (!payload.time) {
        if (auctionFormStatus) auctionFormStatus.textContent = "Pick a time.";
        return;
      }
      var promise = editingAuctionId
        ? api("/api/auctions/item/" + encodeURIComponent(editingAuctionId), {
            method: "PUT",
            body: payload,
          })
        : api("/api/auctions/listings", { method: "POST", body: payload });
      promise.then(function (res) {
        if (res.data && res.data.ok) {
          var saved = res.data.auction;
          if (auctionFormStatus) {
            auctionFormStatus.textContent = editingAuctionId ? "Auction saved." : "Auction created.";
          }
          refreshAuctions().then(function () {
            if (saved && saved.id) {
              var a = auctionsCache.find(function (x) {
                return x.id === saved.id;
              }) || saved;
              fillAuctionForm(a);
            }
          });
        } else {
          var msg = (res.data && res.data.message) || "Save failed.";
          if (res.status === 401) msg = "Session expired. Sign in again.";
          if (auctionFormStatus) auctionFormStatus.textContent = msg;
        }
      });
    });
  }

  if (vehicleForm) {
    vehicleForm.addEventListener("click", function (e) {
      var target = e.target;
      if (!target || !target.getAttribute) return;
      var removeIdx = target.getAttribute("data-remove-photo");
      if (removeIdx == null || removeIdx === "") return;
      var idx = Number(removeIdx);
      if (isNaN(idx) || idx < 0 || idx >= currentPhotos.length) return;
      currentPhotos.splice(idx, 1);
      renderPhotoList();
    });

    vehicleForm.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!editingAuctionId) {
        if (vehicleFormStatus) {
          vehicleFormStatus.textContent = "Save or open an auction first, then add vehicles.";
        }
        return;
      }
      if (vehicleFormStatus) vehicleFormStatus.textContent = "";
      var payload = {
        auctionId: editingAuctionId,
        year: document.getElementById("fld-year").value.trim(),
        make: document.getElementById("fld-make").value.trim(),
        model: document.getElementById("fld-model").value.trim(),
        vin: document.getElementById("fld-vin").value.trim(),
        lotNumber: document.getElementById("fld-lot").value.trim(),
        notes: document.getElementById("fld-vehicle-notes").value.trim(),
        imageAlt: document.getElementById("fld-image-alt").value.trim(),
        photos: currentPhotos.map(function (p) {
          return { url: p.url, alt: p.alt || "" };
        }),
        sold: document.getElementById("fld-sold").checked,
      };
      if (!payload.year || !payload.make || !payload.model) {
        if (vehicleFormStatus) vehicleFormStatus.textContent = "Year, make, and model are required.";
        return;
      }
      if (!payload.vin) {
        if (vehicleFormStatus) vehicleFormStatus.textContent = "VIN is required.";
        return;
      }
      var promise = editingVehicleId
        ? api("/api/auctions/vehicle/" + encodeURIComponent(editingVehicleId), {
            method: "PUT",
            body: payload,
          })
        : api("/api/auctions/vehicles", { method: "POST", body: payload });
      promise.then(function (res) {
        if (res.data && res.data.ok) {
          if (vehicleFormStatus) {
            vehicleFormStatus.textContent = editingVehicleId ? "Vehicle saved." : "Vehicle added.";
          }
          refreshAuctions().then(function () {
            var a = auctionsCache.find(function (x) {
              return x.id === editingAuctionId;
            });
            if (a) {
              fillAuctionForm(a);
            }
          });
        } else {
          var msg = (res.data && res.data.message) || "Save failed.";
          if (res.status === 401) msg = "Session expired. Sign in again.";
          if (vehicleFormStatus) vehicleFormStatus.textContent = msg;
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
              uploadStatus.textContent =
                "Uploading " + Math.min(i + 1, files.length) + "/" + files.length + "…";
            }
            uploadNext(i + 1);
            return;
          }
          stopped = true;
          var msg = (res.data && res.data.message) || "Could not upload photos.";
          if (res.status === 401) msg = "Session expired. Sign in again and retry upload.";
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
          uploadStatus.textContent = "Use a full https URL or a path like /for-sale-media/photo.jpg";
        }
        return;
      }
      if (currentPhotos.length >= 12) {
        if (uploadStatus) uploadStatus.textContent = "Maximum 12 photos per vehicle.";
        return;
      }
      currentPhotos.push({ url: norm.url, alt: "" });
      photoUrlInput.value = "";
      renderPhotoList();
      if (uploadStatus) uploadStatus.textContent = "Photo URL added. Save the vehicle to keep it.";
    });
  }

  renderPhotoList();
  checkSession();
})();
