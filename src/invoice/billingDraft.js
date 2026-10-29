/*
 * E-108 (docs/63): the two Zoho calls behind the draft invoice / estimate. Never throws; every answer can be shown to the rep.
 *
 *   prepareDraft(formData)  -> the lines with Books' item_id + rate (widget_books_items `search`), PPFEE8 computed, the hand list
 *   sendDraft(dealId, prepared, { submittedBy, dryRun })  -> widget_create_billing_draft's answer, or { result: "not_sent", message }
 *
 * billingConfig.json `createDraft: false` turns the Submit call off (the preview and its dry run still work), without a code change.
 */
import { buildBillingLines, priceLines, skusToFind, draftPayload, cannotSend } from "./billingLines";
import { draftOrBackground } from "./draftLater";
import { searchBooks, createBillingDraft } from "../products/booksItems";
import CONFIG from "./billingConfig.json";

export const draftsOn = () => CONFIG.createDraft === true;
export const backgroundOn = () => CONFIG.backgroundDraft === true; // E-158

/* E-158: the instant draft, with the background hand-off when Books is slow (switch: billingConfig.json backgroundDraft). */
export const sendWithFallback = (zoho, entity, dealId, prepared, { submittedBy = "" } = {}) =>
  draftOrBackground({
    zoho,
    entity,
    dealId,
    prepared,
    submittedBy,
    backgroundOn: backgroundOn(),
    send: sendDraft,
    payloadOf: (p, o) => draftPayload(p, o),
  });

/* The pilot: while billingConfig.json lists Deals, only those get the Invoice section and a draft. */
export const billingOnFor = (dealId) => {
  const list = (CONFIG.pilotDeals || []).map(String);
  return !list.length || list.includes(String(dealId || ""));
};

export async function prepareDraft(formData) {
  const built = buildBillingLines(formData);
  const skus = skusToFind(built);
  let found = null;
  let lookup = "";
  if (skus.length) {
    const s = await searchBooks(skus);
    if (s.status === "ok") found = s.items;
    else lookup = `Books prices could not be read (${s.message || "no answer"}); Zoho will look each item up itself.`;
  }
  return { ...priceLines(built, found), lookup };
}

export async function sendDraft(dealId, prepared, { submittedBy = "", dryRun = false } = {}) {
  const why = cannotSend(prepared);
  if (why) return { status: "ok", result: "not_sent", message: why, not_added: [], notes: [] };
  const a = await createBillingDraft(dealId, draftPayload(prepared, { submittedBy, dryRun }));
  if (a.status === "unavailable") {
    return {
      ...a,
      result: "not_sent",
      message:
        a.reason === "missing"
          ? "The draft invoice function is not switched on in Zoho, so no draft was made. Please make it in Books."
          : `Zoho did not answer in time (${a.message}). A draft may or may not have been made: please check the Deal's invoices in Books before making one.`,
    };
  }
  return a;
}

/* What the onboarding JSON keeps (`_billing`, additive): the lines as sent and what the rep was told to add by hand. */
export function billingRecord(prepared, answer) {
  return {
    document: prepared.flags.document,
    lines: prepared.lines.map(({ sku, quantity, description, rate }) => ({ sku, quantity, description, ...(rate != null ? { rate } : {}) })),
    handList: prepared.handList,
    warnings: prepared.warnings || [],
    flags: prepared.flags,
    result: answer ? { result: answer.result || "", number: answer.number || "", link: answer.link || "", message: answer.message || "" } : null,
  };
}
