(function () {
  if (/hiring\.html$/i.test(window.location.pathname || "")) return;
  if (document.querySelector(".hire-banner")) return;
  var header = document.querySelector(".site-header");
  if (!header) return;
  var bar = document.createElement("div");
  bar.className = "hire-banner";
  bar.innerHTML =
    '<div class="hire-banner__inner">' +
    "<p>911 Auto Service Center is now hiring a wrecker driver. A chauffeur’s license is required.</p>" +
    '<a href="hiring.html">Apply now</a>' +
    "</div>";
  header.insertAdjacentElement("afterend", bar);
})();
