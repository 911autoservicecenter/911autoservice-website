(function () {
  var KEY = "911asSchedulePromo";
  var promo = document.getElementById("schedule-promo");
  if (!promo) return;

  function dismissed() {
    try {
      return localStorage.getItem(KEY) === "dismissed";
    } catch (e) {
      return document.documentElement.classList.contains("schedule-promo-dismissed");
    }
  }

  function dismiss() {
    document.documentElement.classList.add("schedule-promo-dismissed");
    promo.setAttribute("hidden", "");
    try {
      localStorage.setItem(KEY, "dismissed");
    } catch (e) {}
  }

  if (dismissed()) {
    document.documentElement.classList.add("schedule-promo-dismissed");
    promo.setAttribute("hidden", "");
    return;
  }

  promo.removeAttribute("hidden");

  var closeBtn = promo.querySelector("[data-schedule-promo-close]");
  if (closeBtn) closeBtn.addEventListener("click", dismiss);

  promo.addEventListener("click", function (e) {
    if (e.target === promo) dismiss();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !promo.hasAttribute("hidden")) dismiss();
  });

  var cta = promo.querySelector(".schedule-promo__cta");
  if (cta) {
    cta.addEventListener("click", dismiss);
  }
})();
