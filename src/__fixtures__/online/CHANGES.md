# Deliberate changes to the expected outputs

The expected outputs started as what the InkSoft thread's bundle at form `cc0ba64` produced (2026-10-15, see
`README-from-inksoft.md`). When a release changes an onboarding ON PURPOSE, the expected file is regenerated from our
code, the diff is checked to be exactly the intended change, and it is listed here. Anything else that makes the golden
test fail is a bug.

| Date | Item | Files | The exact change |
| :-- | :-- | :-- | :-- |
| 2026-10-19 | E-83 count per garment on the card | `expected/1000249/production-card-vinyl.html` | two inserted spans: `2 pcs` after the PC90Y heading, `1 pcs` after the PC78 heading. Nothing else. Single-style orders (1000248, 1000250) unchanged byte for byte. |
| 2026-10-19 | D-41 vendor = supplier · E-91 / D-43 kind renamed | `expected/1000248/` and `expected/1000250/`: `note.txt`, `onboarding-form.json`, `production-card-embroidery.html` | `Inventory` → `Sanmar` in "Vendors Used" (note line, JSON `vendorsUsed`, the card's Vendors row) and JSON `garmentKind` `Polo / Button-up` → `Polo`. Checked by replacing exactly those strings in the old files: identical to the new output. 1000247, 1000249 unchanged. |
| 2026-10-19 | E-79 white Buhler tee (Korie's 1000247 note as a White + Navy description) | `expected/1000247/` — `result.json` (held → submits), new `note.txt`, `onboarding-form.json`, `production-card-vinyl.html`, `production-card-graphicdesign.html` | 1000247 was held ("ShirtFrontWhite / ShirtBackWhite only described on Navy"). It now onboards with Korie's own description: DTF, 2 graphics with her color-change details, Vinyl 4 actual + 4 projected = 8 (her note: 8). 1000248–1000250 unchanged byte for byte; across InkSoft's 55-order replay the 22 other submitted orders are unchanged and the 4 Buhler white-tee orders (1000227, 1000236, 1000237, 1000247) now onboard with staff's exact vinyl counts (36, 28, 16, 8). |
| 2026-10-19 | D-41 vendor spelled as Books names it | `expected/1000247…1000250/`: `note.txt`, `onboarding-form.json`, the garment department card | `Sanmar` → `San Mar` in "Vendors Used" (note line, JSON `vendorsUsed`, the card's Vendors row) only — David: "San Mar is two words in Books and CRM". Checked: no other `Sanmar` left in the expected files. |
