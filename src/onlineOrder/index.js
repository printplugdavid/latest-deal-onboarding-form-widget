/*
 * onlineOrder -- an InkSoft online order onboards itself (docs/45, 47, 48).
 *
 * This thread owns WHAT an automatic onboarding contains (David, 2026-10-15): the InkSoft order -> the form's
 * answers (mapOrder.js), the design profiles (profiles.json), the style catalogue (styles.json), and the call into
 * the form's own builders. The InkSoft order-sync owns the plumbing -- reading InkSoft, the schedule, the CRM writes,
 * the AWS deploy -- and bundles THIS file at a tag of `main`. Pure: no React, no ZOHO, no network.
 *
 * buildForOrder(order, deal, opts) is the one call the Lambda makes; its signature is the interface between the two
 * threads and must not change without telling them (docs/48).
 */
import { inksoftToFormData } from "./mapOrder";
import { structurePlacements } from "./structure";
import profiles from "./profiles.json";
import styles from "./styles.json";
import productStylesPulled from "./productStyles.json";
import productStylesCarried from "./productStylesCarried.json";
import nonGarments from "./nonGarments.json";
import * as placements from "../placements";
import { applyGarmentSplits } from "../garmentSplit";
import { lumpedConcerns } from "../lumpedOrder";
import { AUTO_SOURCE, buildSubmission } from "../submission";
import { addresseePlan } from "../addressee";

/**
 * @param order { summary, package }  GetOrderSummaries row (with ProductionCards) + GetOrderPackage body
 * @param deal  { Deal_Name, Account_Name, Contact_Name }  names as strings
 * @param opts  { submittedAt?: ISO string }
 * @returns { ok, held[], notes[], due, printFields, note, json, cards[{name, html}], addressee }
 *          ok=false means a person must onboard it; nothing else is meaningful then.
 *          addressee (E-130 / D-66, tag online-order-2026-10-28): the one-line ship-to for the Deal's `Addressee`, "" for a pickup.
 *          The Lambda writes it in its OWN update with no workflow trigger (never inside the printFields update); "" = write nothing.
 */
export function buildForOrder(order, deal, opts = {}) {
  const mapped = inksoftToFormData(order, deal, profiles, styles, undefined, PRODUCT_STYLES, nonGarments);
  const held = [...mapped.held];
  const answers = structurePlacements(mapped.data, placements);

  // What a person's Submit would stop and ask about: a garment type that looks like several, not answered Yes.
  const lumped = lumpedConcerns(applyGarmentSplits(answers)?.products) || [];
  if (lumped.length) held.push(`the form would ask a person whether every graphic goes on every garment (${lumped.length})`);
  if (!answers.products?.length) held.push("nothing to onboard");
  if (held.length) return { ok: false, held: [...new Set(held)], notes: mapped.notes, due: mapped.due };

  // From here it is exactly a Submit: the same function the form calls (src/submission.js).
  const { printFields, note, json, cards } = buildSubmission(answers, {
    source: AUTO_SOURCE,
    inksoftOrderId: String(order?.summary?.ID ?? ""),
    submittedAt: opts.submittedAt,
  });
  const addressee = addresseePlan(null, answers).value; // same rule as a person's Submit; a pickup gives ""
  return { ok: true, held: [], notes: mapped.notes, due: mapped.due, printFields, note, json, cards, addressee };
}

export const PROFILE_COUNT = Object.keys(profiles).length;

/*
 * E-89: InkSoft ProductId -> style. productStyles.json is the InkSoft thread's M-15 pull, vendored UNCHANGED at each
 * release (only products whose style is confident). productStylesCarried.json is ours: the few products already onboarded
 * before the pull existed that the pull does not list yet, each with its reason. Carried rows never override the pull.
 */
const rows = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => !k.startsWith("_")));
export const PRODUCT_STYLES = { ...rows(productStylesCarried), ...rows(productStylesPulled) };
export const PRODUCT_STYLES_PULLED = productStylesPulled._pulled || "";
/* global __FORM_COMMIT__ */
// The order-sync's build stamps the tag it bundled (esbuild --define); every [AutoOnboard] log line carries it.
export const BUNDLE_VERSION = typeof __FORM_COMMIT__ !== "undefined" ? __FORM_COMMIT__ : "dev";
