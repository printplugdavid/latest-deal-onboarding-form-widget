/*
 * agentAssign.js -- who is RESPONSIBLE for a revision.
 *
 * Not the same question as Revision_Department, which is who has to FIX it.
 * The department is pre-filled from the producing department (that is who runs
 * the reprint); the agent is traced from who owned the original Produce Order
 * task. They diverge on purpose -- a missing garment still needs someone to
 * reprint it, but nobody can be fairly blamed for losing it.
 *
 * A faithful port of the agent-identification block in the Deluge function
 * `Order Revision function` (steps 1-6). The intent is that the FORM derives
 * Revision_Agent and writes it, and that block is then removed from the Deluge
 * -- leaving the function to do what only it can do: create the tasks.
 *
 * Behaviour is deliberately identical to the Deluge, including its quirks:
 *   - "Shipped Damaged" alone means no agent at all
 *   - "Missing Product" the same (David's ruling, 2026-09-02): a lost garment
 *     cannot be pinned on anyone by formula. If there IS someone to blame, a
 *     human assigns it by hand rather than the form guessing.
 *   - "Misorder" still names the producing agent, but the ORDERER now goes to
 *     its own field (D-26, 2026-10-01) -- see the second departure note below
 *   - the first matching completed task wins (the Deluge breaks on first hit)
 *   - Outsourced always also adds Korie Byrd; Graphic Design always also adds
 *     Rivelino Seva, whether or not a task owner was found
 *
 * One deliberate improvement: an unrecognised department is RETURNED rather
 * than silently skipped, so the form can say it identified nobody instead of
 * quietly assigning no one.
 *
 * ⚠️ AND ONE DELIBERATE DEPARTURE from the Deluge (D-21, 2026-09-29): the task
 * list handed in is NO LONGER filtered to completed tasks. A revision is
 * normally raised WHILE the department is producing, so the original Produce
 * Order task is usually still OPEN -- filtering it out meant the producing agent
 * was never even a candidate. It cost two real embroidery revisions:
 * Evergreen `5249739000123744307` (produce task closed 28 hours AFTER the
 * revision was filed) and Honor Plumbing `5249739000123698131` (still open).
 * Angela Zervudakis was credited on neither. See `orderTasksForTrace` below.
 * The Deluge still has this bug -- handoff in docs/23.
 *
 * ⚠️ SECOND DELIBERATE DEPARTURE (D-26, David 2026-10-01, reverses D-22):
 * the ORDERER and the GRAPHIC DESIGNER no longer go on Revision_Agent /
 * Correction_Agent. Each has its own Deal field. The producing agent is
 * found and written exactly as before -- only these two names moved.
 *   - "...(Misorder)"                       -> orderingAgent = owner of the
 *        Order Garments / Order Products task   (Deal field Ordering_Agent)
 *   - "Misprint (Wrong Graphic)" or
 *     "Design Issues (Poor Graphics)"       -> graphicAgents = every distinct
 *        owner of a GRAPHIC DESIGN task         (Deal field Graphic_Agent)
 *     Wrong Graphic = the final assets were not organised well; Poor Graphics
 *     = the graphic was not designed well. Both are the designer's.
 * The form does NOT write Ordering_Issues: the category already says there was
 * an ordering issue, and a non-empty Ordering_Agent is the durable record.
 * The Deluge still adds the orderer to Revision_Agent -- handoff in docs/32.
 */

// dept -> the keyword that appears in that department's task subjects
export const DEPARTMENT_TASK_KEYWORD = {
  "Screen Printing": { keyword: "SCREEN PRINT" },
  Embroidery: { keyword: "EMBROIDERY" },
  "Vinyl Department": { keyword: "VINYL DEPARTMENT" },
  "Vinyl & Digital Print": { keyword: "VINYL DEPARTMENT" }, // pre-rename records
  Outsourced: { keyword: "OUTSOURCED", alsoAdd: "Korie Byrd" },
  "Graphic Design": { keyword: "GRAPHIC DESIGN", alsoAdd: "Rivelino Seva" },
  /*
   * "Ordering" is deliberately absent. It was briefly added as a department and
   * then removed: ordering accountability is already carried by the CATEGORY --
   * the Misorder values pull in whoever ordered the garments -- so an Ordering
   * department was a second way of saying the same thing. The form no longer
   * offers it. A legacy record carrying it lands in unmappedDepartments.
   */
};

/*
 * Order a Deal's tasks for tracing. BOTH lists belong here -- see the departure
 * note above. Completed tasks come FIRST so that deriveAgents' first-match-wins
 * still prefers a finished task over an open one when both would match.
 */
export function orderTasksForTrace(closed = [], open = []) {
  const all = [].concat(closed || [], open || []);
  const done = (t) => String(t?.Status || "") === "Completed";
  return all.filter(done).concat(all.filter((t) => !done(t)));
}

/*
 * Remediation tasks must never be mistaken for the ORIGINAL produce/order task.
 * Live task names spell the reorder one both ways -- `ACCOUNT MANAGER: Re-Order
 * Garments` and `ACCOUNT MANAGER: Reorder Needed` both exist -- so match the
 * hyphen optionally and case-insensitively. \b matters: without it "Pre-Order"
 * would normalise to "PREORDER", which contains "REORDER", and be excluded.
 */
const RE_REORDER = /\bre-?order/i;
const RE_REPRODUCE = /\bre-?produce/i;
const RE_CORRECT = /\bcorrect/i;

function ownerNameOf(task, userNameById) {
  const owner = task?.Owner;
  if (!owner) return "";
  if (owner.name) return String(owner.name).trim();
  const id = owner.id != null ? String(owner.id) : "";
  return (userNameById && userNameById[id]) || "";
}

/*
 * tasks: [{ Subject, Owner: { id, name }, Status }] -- open AND completed,
 *        ordered by orderTasksForTrace (completed first).
 * Returns { agents, unmappedDepartments, misses, orderOwnerMissing, rejected,
 *           orderingIssue, orderingAgent, graphicIssue, graphicAgents }
 */
export function deriveAgents({
  categories = [],
  departments = [],
  tasks = [],
  userNameById = {},
  allowedNames = null,
  allowedOrderingNames = null,
  allowedGraphicNames = null,
}) {
  // ---- Step 1: what does the category tell us to look for? ----------------
  let needsProduceOrderOwner = false;
  let needsOrderProductsOwner = false;
  let needsGraphicOwner = false;
  // True while every category chosen is one nobody can be fairly blamed for.
  let unattributableOnly = true;

  categories.forEach((c) => {
    const s = String(c || "");
    if (s.includes("Shipped Damaged") || s.includes("Missing Product")) {
      // Nobody is identified for these. A courier damaging a box, or a garment
      // going missing, is not something a completed task can pin on a person.
    } else if (s.includes("Misorder")) {
      // The producer is named as before. D-26: the ORDERER is found below and
      // returned as orderingAgent instead of being added to `agents`.
      needsProduceOrderOwner = true;
      needsOrderProductsOwner = true;
      unattributableOnly = false;
    } else {
      needsProduceOrderOwner = true;
      unattributableOnly = false;
    }
    // D-26: independent of the branch above -- a graphic fault also names the designer(s).
    if (s.includes("Wrong Graphic") || s.includes("Poor Graphics")) needsGraphicOwner = true;
  });

  const agents = [];
  const unmappedDepartments = [];
  const misses = [];
  const add = (name) => {
    if (name && agents.indexOf(name) < 0) agents.push(name);
  };

  // ---- Steps 2-4: the producing agent, per department ---------------------
  if (!unattributableOnly && needsProduceOrderOwner) {
    departments.forEach((dept) => {
      const map = DEPARTMENT_TASK_KEYWORD[dept];
      if (!map) {
        unmappedDepartments.push(dept);
        return; // the Deluge does `continue`
      }

      let found = false;
      for (let i = 0; i < tasks.length; i++) {
        const subject = String(tasks[i]?.Subject || "");
        if (
          subject.includes(map.keyword) &&
          (subject.includes("Produce Order") || subject.includes("Order Products")) &&
          !RE_REPRODUCE.test(subject) &&
          !RE_CORRECT.test(subject)
        ) {
          const name = ownerNameOf(tasks[i], userNameById);
          if (name) {
            add(name);
            found = true;
            break;
          }
        }
      }
      if (!found) misses.push(dept);

      // Added regardless of whether a task owner was found -- matches the Deluge.
      if (map.alsoAdd) add(map.alsoAdd);
    });
  }

  // ---- Step 5: whoever ordered the garments, for Misorder -----------------
  // D-26: returned as orderingAgent, NOT added to `agents`.
  let orderOwnerMissing = false;
  let orderingAgent = "";
  if (needsOrderProductsOwner) {
    let found = false;
    for (let i = 0; i < tasks.length; i++) {
      const subject = String(tasks[i]?.Subject || "");
      if (
        (subject.includes("Order Garments") || subject.includes("Order Products")) &&
        !RE_REORDER.test(subject) &&
        !RE_REPRODUCE.test(subject)
      ) {
        const name = ownerNameOf(tasks[i], userNameById);
        if (name) {
          orderingAgent = name;
          found = true;
          break;
        }
      }
    }
    orderOwnerMissing = !found;
  }

  // ---- Step 6 (D-26): whoever did the graphics ----------------------------
  // Every distinct owner of a GRAPHIC DESIGN task -- the artwork/mock-up, the
  // finalising, any mock-up revision. "The one(s) who did the graphics."
  const graphicFound = [];
  if (needsGraphicOwner) {
    for (let i = 0; i < tasks.length; i++) {
      const subject = String(tasks[i]?.Subject || "");
      if (subject.includes("GRAPHIC DESIGN") && !RE_CORRECT.test(subject) && !RE_REPRODUCE.test(subject)) {
        const name = ownerNameOf(tasks[i], userNameById);
        if (name && graphicFound.indexOf(name) < 0) graphicFound.push(name);
      }
    }
  }

  // A name that is not an option on the picklist would be rejected on write.
  const rejected = [];
  const kept = allowedNames
    ? agents.filter((n) => {
        const ok = allowedNames.indexOf(n) >= 0;
        if (!ok) rejected.push(n);
        return ok;
      })
    : agents;

  // Ordering_Agent and Graphic_Agent are picklists with their OWN option lists
  // (Ordering_Agent has no Yefri Rivera and does have Brad Byfield) -- same guard.
  const orderList = allowedOrderingNames || allowedNames;
  if (orderingAgent && orderList && orderList.indexOf(orderingAgent) < 0) {
    rejected.push(orderingAgent);
    orderingAgent = "";
  }
  const graphicList = allowedGraphicNames || allowedNames;
  const graphicAgents = graphicList
    ? graphicFound.filter((n) => {
        const ok = graphicList.indexOf(n) >= 0;
        if (!ok) rejected.push(n);
        return ok;
      })
    : graphicFound;

  return {
    agents: kept,
    unmappedDepartments,
    misses,
    orderOwnerMissing,
    rejected,
    orderingIssue: needsOrderProductsOwner, // true whenever a Misorder category is chosen
    orderingAgent, // "" when no Order Garments / Order Products owner was found
    graphicIssue: needsGraphicOwner, // Wrong Graphic or Poor Graphics chosen
    graphicAgents, // [] when no GRAPHIC DESIGN task owner was found
  };
}
