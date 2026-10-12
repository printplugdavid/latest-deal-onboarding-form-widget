/*
 * qcLabel.js -- E-52. The 4 x 6 in package label the team used to type into a Doc, built from the
 * Deal: one page per box, "Box 1 of N". Laid out after David's Doc and the mock he approved
 * (quality-check/fixtures/label/): the PO number very large -- it is what people look for on the
 * shelf and matches the green stickers -- then the account, who it is for, the deal number, the
 * sales agent, the quality-check date and the box count. No "what is in this box" line (David).
 *
 * One design for every order: shipped orders get this same label on the package (the postage label
 * comes from USPS / Stamps.com). A failed check that releases part of an order prints it with a
 * PARTIAL banner.
 *
 * Pure: returns a complete HTML document for a print frame. No ZOHO, no React.
 */
const esc = (s) =>
  String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export const LABEL_KINDS = { PICKUP: "pickup", SHIP: "ship", PARTIAL: "partial" };
export const MAX_BOXES = 50; // a typo guard ("100" for "10"), not a business rule

export function boxCount(raw) {
  const n = parseInt(String(raw == null ? "" : raw).trim(), 10);
  if (!Number.isFinite(n) || n < 1) return 0;
  return Math.min(n, MAX_BOXES);
}

const CSS = `
  @page { size: 4in 6in; margin: 0; }
  html, body { margin: 0; background: #d9dce1; }
  .label { width: 4in; height: 6in; box-sizing: border-box; padding: 0.2in; background: #fff; margin: 12px auto;
           font-family: Montserrat, "Helvetica Neue", Arial, sans-serif; color: #000; display: flex; flex-direction: column;
           page-break-after: always; break-after: page; overflow: hidden; }
  .label:last-child { page-break-after: auto; break-after: auto; }
  @media print { html, body { background: #fff; } .label { margin: 0; } }
  .box { border: 1.5pt solid #000; padding: 0.08in 0.1in; flex: 1 1 auto; display: flex; flex-direction: column; justify-content: space-between; min-height: 0; }
  .head { display: flex; gap: 0.1in; align-items: flex-start; }
  .head img { width: 0.95in; height: 0.95in; }
  .brand { font-family: Impact, "Arial Narrow Bold", sans-serif; font-size: 18pt; line-height: 1; letter-spacing: 0.2pt; }
  .tag { font-size: 7.5pt; margin-top: 2pt; }
  .contact { font-size: 6pt; font-style: italic; line-height: 1.3; }
  .partial { background: #000; color: #fff; font-weight: 800; font-size: 12pt; letter-spacing: 0.5pt; text-align: center; padding: 3pt 0;
             -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .big { border-top: 1.5pt solid #000; border-bottom: 1.5pt solid #000; padding: 0.1in 0; }
  .po { font-family: Impact, "Arial Narrow Bold", sans-serif; font-size: 54pt; line-height: 1; display: flex; align-items: baseline; gap: 0.1in; white-space: nowrap; }
  .po.long { font-size: 40pt; }
  .po.name { font-size: 20pt; white-space: normal; line-height: 1.1; }
  .po span { font: 700 11pt Montserrat, Arial, sans-serif; }
  .acct { font-size: 17pt; font-weight: 700; line-height: 1.15; margin-top: 0.06in; }
  .acct.long { font-size: 13pt; }
  .who { font-size: 10pt; margin-top: 0.05in; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.16in 0.12in; font-size: 13pt; font-weight: 600; }
  .grid span { display: block; font-size: 6.5pt; font-weight: 700; letter-spacing: 0.4pt; color: #333; }
  .grid .boxn { font-size: 20pt; }
  .foot { display: flex; gap: 0.1in; align-items: center; }
  .foot img { width: 0.8in; height: 0.8in; image-rendering: pixelated; }
  .foot p { margin: 0 0 3pt; font-size: 7pt; line-height: 1.3; }
  .foot p.b { font-weight: 700; font-size: 8pt; }
`;

const WHO_WORDS = {
  [LABEL_KINDS.PICKUP]: "Pickup for",
  [LABEL_KINDS.PARTIAL]: "Pickup for",
  [LABEL_KINDS.SHIP]: "Shipping to",
};

/*
 * d = { kind, bigLabel, big, dealName, account, contactName, phone, dealNo, salesAgent, qcDate,
 *       boxes, logoUrl, qrUrl }
 */
export function buildLabelHtml(d) {
  const n = boxCount(d.boxes) || 1;
  const kind = d.kind || LABEL_KINDS.PICKUP;
  const big = String(d.big || "").trim();
  const poHtml = big
    ? `<div class="po${big.length > 6 ? " long" : ""}">${d.bigLabel ? `<span>${esc(d.bigLabel)}</span>` : ""}${esc(big)}</div>`
    : `<div class="po name">${esc(d.dealName || "")}</div>`;
  const account = String(d.account || "").trim();
  const who = String(d.contactName || "").trim();
  const whoHtml = who
    ? `<div class="who">${esc(WHO_WORDS[kind] || "For")} <b>${esc(who)}</b>${d.phone ? " · " + esc(d.phone) : ""}</div>`
    : "";
  const pages = [];
  for (let i = 1; i <= n; i++) {
    pages.push(`<div class="label"><div class="box">
    <div class="head"><img src="${esc(d.logoUrl || "")}" alt="">
      <div><div class="brand">THE PRINT PLUG</div><div class="tag">CUSTOM GARMENTS &amp; MORE</div>
        <div class="contact">Questions?<br>info@theprintplug.com<br>(986)777-9466<br>2603 Sundance Rd. Ste. 101<br>Nampa, ID 83651</div></div></div>
    ${kind === LABEL_KINDS.PARTIAL ? `<div class="partial">PARTIAL — MORE TO FOLLOW</div>` : ""}
    <div class="big">
      ${poHtml}
      ${account ? `<div class="acct${account.length > 26 ? " long" : ""}">${esc(account)}</div>` : ""}
      ${whoHtml}
    </div>
    <div class="grid">
      <div><span>DEAL</span>${esc(d.dealNo || "")}</div>
      <div><span>SALES AGENT</span>${esc(d.salesAgent || "")}</div>
      <div><span>QUALITY CHECKED</span>${esc(d.qcDate || "")}</div>
      <div class="boxn"><span>BOX</span>${i} of ${n}</div>
    </div>
    <div class="foot"><img src="${esc(d.qrUrl || "")}" alt="">
      <div><p>Your satisfaction is guaranteed! If you’re not happy with your order, please let us know and we’ll do what we can to make it right!</p>
        <p class="b">Please scan the QR Code to leave us a review!</p>
        <p>Thank you for your support!</p></div></div>
  </div></div>`);
  }
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Package label</title><style>${CSS}</style></head><body>${pages.join("")}</body></html>`;
}
