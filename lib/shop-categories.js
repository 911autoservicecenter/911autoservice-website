/**
 * Shop categories and brands. Customers see the labels. Staff pick the id.
 */
const CATEGORIES = [
  { id: "lighting", label: "Lighting" },
  { id: "lift-kits", label: "Lift kits" },
  { id: "install-kits", label: "Install kits" },
  { id: "bumpers", label: "Bumpers" },
  { id: "armor", label: "Armor" },
  { id: "racks-steps", label: "Racks and steps" },
  { id: "recovery", label: "Recovery" },
  { id: "accessories", label: "Accessories" },
];

const BRANDS = [
  { id: "auxbeam", label: "Auxbeam" },
  { id: "dv8", label: "DV8 Offroad" },
  { id: "add", label: "Addictive Desert Designs" },
  { id: "other", label: "Other" },
];

function byId(list, id) {
  var key = String(id || "").trim();
  for (var i = 0; i < list.length; i++) {
    if (list[i].id === key) return list[i];
  }
  return null;
}

module.exports = {
  CATEGORIES: CATEGORIES,
  BRANDS: BRANDS,
  categoryById: function (id) {
    return byId(CATEGORIES, id);
  },
  brandById: function (id) {
    return byId(BRANDS, id);
  },
};
