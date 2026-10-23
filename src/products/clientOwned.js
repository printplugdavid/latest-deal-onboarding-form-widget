/*
 * E-101 / D-49: client-owned garments (about 1 in 4 onboardings since 2026-08). A garment row is client-owned when one of its
 * SKU rows is the client-owned item; its own brand / style stays in "Garment Type". The order takes an upcharge (10% today,
 * a working number in newProductRules.json). E-122 (David 10-23): the fee (PPFEE8) is always added; the rep is no longer asked.
 * The note keeps the "… Upcharge Added?" line (label unchanged) and prints "Yes" when the order carries no older answer.
 */
import RULES from "./newProductRules.json";

export const CLIENT_OWNED = RULES.clientOwned;

const str = (v) => (v == null ? "" : String(v));

export const isClientOwnedSku = (sku) => str(sku).trim().toUpperCase() === CLIENT_OWNED.sku;

/* A garment (primary branch) with at least one client-owned SKU row. */
export const isClientOwnedGarment = (branch) => ((branch && branch.garmentSkus) || []).some((r) => isClientOwnedSku(r && r.sku));

export const upchargeLabel = () => `${CLIENT_OWNED.upchargePercent}% Client-Owned Garment Upcharge Added?`;
