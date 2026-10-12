(function () {
  var form = document.getElementById("hire-form");
  var status = document.getElementById("hire-status");
  var submit = document.getElementById("hire-submit");
  if (!form) return;

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (status) status.textContent = "";
    var resume = document.getElementById("hire-resume");
    var file = resume && resume.files && resume.files[0];
    if (file && file.size > 4 * 1024 * 1024) {
      if (status) status.textContent = "Resume must be 4MB or smaller.";
      return;
    }
    if (submit) submit.disabled = true;
    if (status) status.textContent = "Sending…";
    fetch("/api/apply", { method: "POST", body: new FormData(form) })
      .then(function (r) {
        return r.text().then(function (text) {
          var data = {};
          try {
            data = text ? JSON.parse(text) : {};
          } catch (err) {
            data = { ok: false, message: "Could not send the application." };
          }
          return { ok: r.ok, data: data };
        });
      })
      .then(function (res) {
        if (res.ok && res.data && res.data.ok) {
          form.reset();
          var position = document.getElementById("hire-position");
          var state = document.getElementById("hire-state");
          if (position) position.value = "Wrecker driver";
          if (state) state.value = "MI";
          if (status) status.textContent = res.data.message || "Application sent.";
        } else if (status) {
          status.textContent = (res.data && res.data.message) || "Could not send the application.";
        }
      })
      .catch(function () {
        if (status) status.textContent = "Could not send the application. Check your connection and try again.";
      })
      .then(function () {
        if (submit) submit.disabled = false;
      });
  });
})();
