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
 *   - "Misorder" additionally pulls in whoever ordered the garments
 *   - the first matching completed task wins (the Deluge breaks on first hit)
 *   - Outsourced always also adds Korie Byrd; Graphic Design always also adds
 *     Rivelino Seva, whether or not a task owner was found
 *
 * One deliberate improvement: an unrecognised department is RETURNED rather
 * than silently skipped, so the form can say it identified nobody instead of
 * quietly assigning no one.
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

function ownerNameOf(task, userNameById) {
  const owner = task?.Owner;
  if (!owner) return "";
  if (owner.name) return String(owner.name).trim();
  const id = owner.id != null ? String(owner.id) : "";
  return (userNameById && userNameById[id]) || "";
}

/*
 * completedTasks: [{ Subject, Owner: { id, name }, Status }]
 * Returns { agents, unmappedDepartments, misses, orderOwnerMissing }
 */
export function deriveAgents({
  categories = [],
  departments = [],
  completedTasks = [],
  userNameById = {},
  allowedNames = null,
}) {
  // ---- Step 1: what does the category tell us to look for? ----------------
  let needsProduceOrderOwner = false;
  let needsOrderProductsOwner = false;
  // True while every category chosen is one nobody can be fairly blamed for.
  let unattributableOnly = true;

  categories.forEach((c) => {
    const s = String(c || "");
    if (s.includes("Shipped Damaged") || s.includes("Missing Product")) {
      // Nobody is identified for these. A courier damaging a box, or a garment
      // going missing, is not something a completed task can pin on a person.
    } else if (s.includes("Misorder")) {
      needsProduceOrderOwner = true;
      needsOrderProductsOwner = true;
      unattributableOnly = false;
    } else {
      needsProduceOrderOwner = true;
      unattributableOnly = false;
    }
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
      for (let i = 0; i < completedTasks.length; i++) {
        const subject = String(completedTasks[i]?.Subject || "");
        if (
          subject.includes(map.keyword) &&
          (subject.includes("Produce Order") || subject.includes("Order Products")) &&
          !subject.includes("Reproduce") &&
          !subject.includes("Correct")
        ) {
          const name = ownerNameOf(completedTasks[i], userNameById);
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
  let orderOwnerMissing = false;
  if (needsOrderProductsOwner) {
    let found = false;
    for (let i = 0; i < completedTasks.length; i++) {
      const subject = String(completedTasks[i]?.Subject || "");
      if (
        (subject.includes("Order Garments") || subject.includes("Order Products")) &&
        !subject.includes("Re-Order") &&
        !subject.includes("Reproduce")
      ) {
        const name = ownerNameOf(completedTasks[i], userNameById);
        if (name) {
          add(name);
          found = true;
          break;
        }
      }
    }
    orderOwnerMissing = !found;
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

  return { agents: kept, unmappedDepartments, misses, orderOwnerMissing, rejected };
}
