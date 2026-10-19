# Deliberate changes to the expected outputs

The expected outputs started as what the InkSoft thread's bundle at form `cc0ba64` produced (2026-10-15, see
`README-from-inksoft.md`). When a release changes an onboarding ON PURPOSE, the expected file is regenerated from our
code, the diff is checked to be exactly the intended change, and it is listed here. Anything else that makes the golden
test fail is a bug.

| Date | Item | Files | The exact change |
| :-- | :-- | :-- | :-- |
| 2026-10-19 | E-83 count per garment on the card | `expected/1000249/production-card-vinyl.html` | two inserted spans: `2 pcs` after the PC90Y heading, `1 pcs` after the PC78 heading. Nothing else. Single-style orders (1000248, 1000250) unchanged byte for byte. |
