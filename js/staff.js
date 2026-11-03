/**
 * Staff sign-in, invite-code registration, and the tool list.
 */
(function () {
  var authSection = document.getElementById("staff-auth");
  var homeSection = document.getElementById("staff-home");
  var inviteSection = document.getElementById("staff-invites");
  var lead = document.getElementById("staff-lead");
  var loginForm = document.getElementById("staff-login-form");
  var registerForm = document.getElementById("staff-register-form");
  var loginError = document.getElementById("login-error");
  var regError = document.getElementById("reg-error");
  var sessionEmail = document.getElementById("staff-session-email");
  var logoutBtn = document.getElementById("staff-logout");
  var newInviteBtn = document.getElementById("btn-new-invite");
  var inviteStatus = document.getElementById("invite-status");
  var inviteFresh = document.getElementById("invite-fresh");
  var inviteFreshCode = document.getElementById("invite-fresh-code");
  var inviteBody = document.querySelector("#invite-table tbody");

  var ALLOWED_NEXT = {
    "admin-for-sale.html": true,
    "admin-auctions.html": true,
    "admin-shop.html": true,
  };

  function nextUrl() {
    try {
      var next = new URLSearchParams(window.location.search).get("next") || "";
      if (ALLOWED_NEXT[next]) return next;
    } catch (e) {}
    return "";
  }

  function esc(s) {
    if (s == null) return "";
    var d = document.createElement("div");
    d.textContent = String(s);
    return d.innerHTML;
  }

  function showError(el, message) {
    if (!el) return;
    el.textContent = message || "";
    el.hidden = !message;
  }

  function api(path, opts) {
    opts = opts || {};
    opts.credentials = "include";
    opts.headers = opts.headers || {};
    if (opts.body && typeof opts.body === "object") {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(opts.body);
    }
    return fetch(path, opts)
      .then(function (r) {
        return r.text().then(function (text) {
          var data = {};
          try {
            data = text ? JSON.parse(text) : {};
          } catch (e) {
            data = { ok: false, message: "Could not read the server response." };
          }
          return { ok: r.ok, status: r.status, data: data };
        });
      })
      .catch(function () {
        return { ok: false, status: 0, data: { ok: false, message: "Network error." } };
      });
  }

  function formatWhen(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function renderInvites(list) {
    if (!inviteBody) return;
    inviteBody.innerHTML = "";
    if (!list || !list.length) {
      var empty = document.createElement("tr");
      var td = document.createElement("td");
      td.colSpan = 5;
      td.textContent = "No invite codes yet.";
      empty.appendChild(td);
      inviteBody.appendChild(empty);
      return;
    }
    list.forEach(function (inv) {
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td><span class=\"staff-code staff-code--small\">" +
        esc(inv.code || "—") +
        "</span></td>" +
        "<td>" +
        esc(inv.status) +
        "</td>" +
        "<td>" +
        esc(formatWhen(inv.expiresAt)) +
        "</td>" +
        "<td>" +
        esc(inv.usedBy || "") +
        "</td>" +
        "<td></td>";
      if (inv.status === "Ready") {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn btn-ghost btn-sm admin-btn-danger";
        btn.textContent = "Revoke";
        btn.addEventListener("click", function () {
          api("/api/staff/invites/revoke", { method: "POST", body: { id: inv.id } }).then(function (res) {
            if (res.data && res.data.ok) renderInvites(res.data.invites || []);
            else if (inviteStatus) inviteStatus.textContent = (res.data && res.data.message) || "Could not revoke that code.";
          });
        });
        tr.lastChild.appendChild(btn);
      }
      inviteBody.appendChild(tr);
    });
  }

  function loadInvites() {
    api("/api/staff/invites", { method: "GET" }).then(function (res) {
      if (res.data && res.data.ok) {
        renderInvites(res.data.invites || []);
        if (inviteStatus && !inviteStatus.textContent) inviteStatus.textContent = "";
      } else if (inviteStatus) {
        inviteStatus.textContent = (res.data && res.data.message) || "Could not load invite codes.";
      }
    });
  }

  function showSignedIn(data) {
    if (authSection) authSection.hidden = true;
    if (homeSection) homeSection.hidden = false;
    if (sessionEmail) sessionEmail.textContent = data.email || "staff";
    if (lead) lead.textContent = "Pick a tool. Sign out when you are done on a shared computer.";
    if (data.owner) {
      if (inviteSection) inviteSection.hidden = false;
      loadInvites();
    } else if (inviteSection) {
      inviteSection.hidden = true;
    }
    var next = nextUrl();
    if (next) window.location.replace(next);
  }

  function showSignedOut() {
    if (authSection) authSection.hidden = false;
    if (homeSection) homeSection.hidden = true;
    if (inviteSection) inviteSection.hidden = true;
    if (lead) lead.textContent = "Sign in, or create an admin login with an invite code from the owner.";
  }

  if (loginForm) {
    loginForm.addEventListener("submit", function (e) {
      e.preventDefault();
      showError(loginError, "");
      api("/api/staff/login", {
        method: "POST",
        body: {
          email: document.getElementById("login-email").value.trim(),
          password: document.getElementById("login-password").value,
        },
      }).then(function (res) {
        if (res.data && res.data.ok) showSignedIn(res.data);
        else showError(loginError, (res.data && res.data.message) || "Could not sign in.");
      });
    });
  }

  if (registerForm) {
    registerForm.addEventListener("submit", function (e) {
      e.preventDefault();
      showError(regError, "");
      var password = document.getElementById("reg-password").value;
      var confirm = document.getElementById("reg-confirm").value;
      if (password !== confirm) {
        showError(regError, "Those passwords do not match.");
        return;
      }
      api("/api/staff/register", {
        method: "POST",
        body: {
          email: document.getElementById("reg-email").value.trim(),
          password: password,
          confirm: confirm,
          inviteCode: document.getElementById("reg-code").value,
        },
      }).then(function (res) {
        if (res.data && res.data.ok) showSignedIn(res.data);
        else showError(regError, (res.data && res.data.message) || "Could not create that login.");
      });
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", function () {
      api("/api/staff/logout", { method: "POST" }).then(function () {
        showSignedOut();
      });
    });
  }

  if (newInviteBtn) {
    newInviteBtn.addEventListener("click", function () {
      newInviteBtn.disabled = true;
      api("/api/staff/invites", { method: "POST", body: {} }).then(function (res) {
        newInviteBtn.disabled = false;
        if (res.data && res.data.ok && res.data.invite) {
          if (inviteFreshCode) inviteFreshCode.textContent = res.data.invite.code;
          if (inviteFresh) inviteFresh.hidden = false;
          if (inviteStatus) inviteStatus.textContent = "Give this code to the person who needs a login. It will not be shown this large again.";
          loadInvites();
        } else if (inviteStatus) {
          inviteStatus.textContent = (res.data && res.data.message) || "Could not create a code.";
        }
      });
    });
  }

  api("/api/staff/session", { method: "GET" }).then(function (res) {
    if (res.data && res.data.loggedIn) showSignedIn(res.data);
    else showSignedOut();
  });
})();
