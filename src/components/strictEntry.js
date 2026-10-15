/*
 * strictEntry.js -- E-74. Where the new required picks are enforced.
 *
 * The placement row and the garment type are shared by the onboarding form and the Amendment Form. The
 * onboarding form sets this to true: Garment kind, a placement location and a width or height are required.
 * The Amendment Form leaves it false, so an old order (typed placements, no kind) still opens and saves as it
 * is; the same dropdowns are offered there, just not required.
 */
import { createContext } from "react";

export const StrictEntry = createContext(false);
