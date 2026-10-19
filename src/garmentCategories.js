/*
 * D-43 (David, 2026-10-19): one garment taxonomy for the onboarding forms, Zoho Books / CRM and InkSoft.
 *
 * Books sales reports run on each item's Category (`cf_category`, synced to CRM `Item_Category`). The form's Garment
 * Kind is finer (it decides the placement list), and every kind reports under exactly one Books category, so a style can
 * never be one thing on the form and another in the report. Age is a second axis: Infant-Toddler always reports as
 * Infant/Toddler (a onesie is its own type); Youth reports as Youth while Books has no separate Age Group field
 * (proposed to David in docs/52 -- once it exists, delete the Youth line and youth reports by type).
 * A new category is David's call. The release check compares these against the Books item for each SKU.
 */
import { canonicalKind } from "./placements";

export const BOOKS_CATEGORY_BY_KIND = {
  "Tee / Long Sleeve / Tank / Button-up": "Garment - Tops",
  Polo: "Garment - Polos",
  "Hoodie / Crew / Zip": "Garment - Hoodies & Sweatshirts",
  "Jacket / Vest": "Garment - Outerwear",
  "Hat / Cap": "Garment - Hats",
  Beanie: "Garment - Hats",
  "Pants / Shorts": "Garment - Bottoms",
  "Bag / Tote / Backpack": "Garment - Accessories",
  Apron: "Garment - Accessories",
  "Other item": "Garment - Accessories",
};

export const AGE_GROUPS = ["Adult", "Youth", "Infant-Toddler"];

export const BOOKS_CATEGORY_BY_AGE = {
  "Infant-Toddler": "Garment - Infant/Toddler",
  Youth: "Garment - Youth",
};

/* The Books category a garment reports under, from its kind and age group. "" when the kind is unknown. */
export function booksCategoryFor(kind, age = "Adult") {
  return BOOKS_CATEGORY_BY_AGE[age] || BOOKS_CATEGORY_BY_KIND[canonicalKind(kind)] || "";
}
