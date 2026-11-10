/**
 * Emails a paid shop order to the shop and to the customer.
 * SMTP uses the same SMTP_HOST / SMTP_USER / SMTP_PASS / SMTP_PORT as hiring mail.
 */
const money = require("./shop-money");

function notifyAddress() {
  return String(process.env.SHOP_NOTIFY_EMAIL || "sales@911autoservice.org").trim();
}

function lineText(order) {
  return (order.items || [])
    .map(function (line) {
      return (
        line.qty +
        " × " +
        line.title +
        " — " +
        money.formatMoney(line.unitAmount) +
        " each (" +
        money.formatMoney(line.unitAmount * line.qty) +
        ")"
      );
    })
    .join("\n");
}

function addressText(address) {
  if (!address) return "";
  var lines = [];
  if (address.line1) lines.push(address.line1);
  if (address.line2) lines.push(address.line2);
  var cityLine = [address.city, address.state].filter(Boolean).join(", ");
  if (address.postalCode) cityLine = cityLine ? cityLine + " " + address.postalCode : address.postalCode;
  if (cityLine) lines.push(cityLine);
  if (address.country) lines.push(address.country);
  return lines.join("\n");
}

function fulfillmentText(order) {
  if (order.fulfillment === "ship") {
    var addr = addressText(order.address);
    return "Ship to:\n" + (order.name || "Customer") + (addr ? "\n" + addr : "");
  }
  return "Install at 22 S Clay St, Coldwater, MI 49036\nShop hours: Monday–Thursday, 8am–5pm";
}

function shopText(order) {
  var bits = [
    "Paid shop order " + order.id,
    "",
    fulfillmentText(order),
    "",
    lineText(order),
    "",
    "Subtotal: " + money.formatMoney(order.subtotalCents),
    "Shipping: " + money.formatMoney(order.shippingCents || 0),
    "Total: " + money.formatMoney(order.totalCents),
    "",
    "Customer: " + (order.name || "—"),
    "Email: " + (order.email || "—"),
    "Phone: " + (order.phone || "—"),
  ];
  if (order.staffNote) bits.push("", "Note: " + order.staffNote);
  return bits.join("\n");
}

function customerText(order) {
  var intro =
    order.fulfillment === "ship"
      ? "We have your order and will ship it to the address you entered. Call 517-279-2010 if you need to change it."
      : "We have your order. We’ll install it at 22 S Clay St, Coldwater, MI 49036. Shop hours are Monday–Thursday, 8am–5pm. Call 517-279-2010 and press 2 to set a time.";
  return [
    "911 Towing & Repair received your order.",
    "",
    intro,
    "",
    lineText(order),
    "",
    "Total paid: " + money.formatMoney(order.totalCents),
    "",
    "Questions: 517-279-2010 (press 2 during shop hours).",
  ].join("\n");
}

async function sendOrderMail(order) {
  var host = String(process.env.SMTP_HOST || "").trim();
  var user = String(process.env.SMTP_USER || "").trim();
  var pass = process.env.SMTP_PASS != null ? String(process.env.SMTP_PASS) : "";
  if (!host || !user || !pass) {
    console.error("[shop] SMTP is not configured. Order " + order.id + " is saved and was not emailed.");
    return { emailed: false };
  }
  var nodemailer = require("nodemailer");
  var port = parseInt(process.env.SMTP_PORT || "587", 10);
  var transport = nodemailer.createTransport({
    host: host,
    port: port,
    secure: port === 465,
    auth: { user: user, pass: pass },
  });
  var shopTo = notifyAddress();
  await transport.sendMail({
    from: user,
    to: shopTo,
    replyTo: order.email || undefined,
    subject: "911 Towing & Repair shop order — " + money.formatMoney(order.totalCents),
    text: shopText(order),
  });
  if (order.email) {
    await transport.sendMail({
      from: user,
      to: order.email,
      replyTo: shopTo,
      subject: "Your 911 Towing & Repair order",
      text: customerText(order),
    });
  }
  return { emailed: true };
}

module.exports = {
  sendOrderMail: sendOrderMail,
};
