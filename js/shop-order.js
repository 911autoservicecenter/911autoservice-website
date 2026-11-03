/**
 * Clears the cart after Stripe sends the customer back, then shows the saved order status.
 * Payment is confirmed by the webhook, not by this page.
 */
(function () {
  var lead = document.getElementById("order-lead");
  var root = document.getElementById("order-root");
  if (!root) return;

  var params;
  try {
    params = new URLSearchParams(window.location.search);
  } catch (e) {
    params = new URLSearchParams();
  }
  var sessionId = params.get("session_id") || "";

  if (params.get("result") === "success") {
    try {
      localStorage.removeItem("911asShopCart");
    } catch (e) {}
  }

  function esc(s) {
    var d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  }

  if (!sessionId) {
    if (lead) lead.textContent = "There is no order to show.";
    return;
  }

  function paint(order) {
    if (!order) {
      if (lead) lead.textContent = "We could not find that order. If you paid, call 517-279-2010 and we can look it up.";
      return;
    }
    var items = (order.items || [])
      .map(function (line) {
        return "<li>" + esc(line.qty) + " × " + esc(line.title) + "</li>";
      })
      .join("");
    if (order.status === "paid") {
      if (lead) {
        lead.textContent =
          order.fulfillment === "ship"
            ? "Payment received. We will ship this order to the address you entered."
            : "Payment received. Pick it up at 22 S Clay St, Monday–Thursday, 8am–5pm.";
      }
    } else if (order.status === "failed" || order.status === "canceled") {
      if (lead) lead.textContent = "This payment did not go through. You can return to the shop and try again, or call 517-279-2010.";
    } else if (lead) {
      lead.textContent = "We’re confirming the payment. If it went through, you’ll get an email. You can also call 517-279-2010.";
    }
    root.innerHTML = items ? "<ul class=\"sale-how-list\">" + items + "</ul>" : "";
  }

  function load(attempt) {
    fetch("/api/shop/order?session_id=" + encodeURIComponent(sessionId), { credentials: "same-origin" })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (data && data.ok) {
          paint(data);
          if (data.status === "pending" && attempt < 4) {
            window.setTimeout(function () {
              load(attempt + 1);
            }, 2000);
          }
        } else if (attempt < 4) {
          window.setTimeout(function () {
            load(attempt + 1);
          }, 2000);
        } else {
          paint(null);
        }
      })
      .catch(function () {
        paint(null);
      });
  }

  load(0);
})();
