# Golden orders for `buildForOrder` — anonymized (for the forms thread, docs/48 ask 1)

Four real online orders, **1000247–1000250**, with every customer detail replaced. Use them as the release test for
`repo/src/onlineOrder/` (`src/__fixtures__/online/`). Made 2026-10-15 by the InkSoft store thread.

## What is here

| path | what |
|---|---|
| `inputs/<id>.json` | `{ summary, package }` — **exactly the shape the Lambda passes `buildForOrder` in production**: `summary` = the GetOrderSummaries row (with `ProductionCards`); `package` = `{ Orders: [{ Items, Notes, ShippingAddress, User: { Phone } }] }`, which is what the Lambda builds from GetOrderPackage |
| `inputs/deals.json` | the `deal` argument per order: `Deal_Name`, `Account_Name`, `Contact_Name` |
| `expected/<id>/result.json` | `ok`, `held`, `due`, `printFields`, card names |
| `expected/<id>/note.txt` | the note, exactly |
| `expected/<id>/onboarding-form.json` | the JSON string exactly as attached — `_submittedAt` fixed at `2026-10-15T00:00:00.000Z` (pass `opts.submittedAt`) |
| `expected/<id>/production-card-*.html` | each card, exactly |

**Produced by the code running in AWS today** (bundle at form `cc0ba64`, `src/auto-onboard.bundle.js`), under
`TZ=UTC` like the Lambda, by `../make-golden.js`. Regenerate: `TZ=UTC node auto-onboard/make-golden.js`.

| order | expected |
|---|---|
| 1000247 | **held** — `ShirtFrontWhite` / `ShirtBackWhite` described only on Navy, the order has a White tee (INK-25) |
| 1000248 | submits · Embroidery 2 / Small 2 · due 2026-11-09 · cards: colormatch, embroidery, graphicdesign |
| 1000249 | submits · Vinyl Dept 6 (DTF) · due 2026-10-30 · cards: graphicdesign, vinyl |
| 1000250 | submits · Embroidery 1 / Small 1 · due 2026-11-09 · cards: colormatch, embroidery, graphicdesign |

## Your copy will differ in exactly the ways your docs/48 lists

1. **The note's new last line** `Onboarded automatically from InkSoft order <id>` — not in ours. Compare the note
   minus that line.
2. E-77 / E-78 fixed in your builders — no effect on these four (our workaround gives the same bytes).
3. `structuredClone` → JSON copy — no effect on output.
4. Colour-match failure caught / `_inksoftOrderId` omitted when there is no id — neither happens in these four.

Anything else that differs is a real difference: tell us before tagging.

## How it was anonymized

- The inputs keep **only the fields the automation reads** (summary: id, dates, store, shipping vendor/method,
  expected-by; cards: product, SKU, colour, side, design, method, colours, quantity, region, art URL; items: full
  name, quantity, product / style ids). Billing addresses, payment and card details, IP addresses, the purchase
  records (SalesDocs) and InkSoft user records were dropped, not edited.
- Customer → `Fixture Customer<nnn>`, `customer<nnn>@example.com`, `208-555-01<nn>` (555-01xx is reserved for
  fiction). The outputs were generated FROM these inputs, so names, phones and emails agree everywhere.
- Checked: every name, email, phone, street, IP and company string in the raw orders was searched for in this
  folder — none present (the only matches were the side names "Front" / "Back" and the club short name "MACC").
  The only emails are `@example.com`; the only phone numbers are `208-555-01xx`.
- Store names, product names, art file names and art URLs are the shop's own, not customer data, and are kept.
