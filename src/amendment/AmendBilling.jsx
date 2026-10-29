/*
 * AmendBilling.jsx -- E-157: the Amendment Form's "5. Price change" step (logic: invoice/amendBilling.js).
 *
 * "Work out the price change" prices the order before and after this amendment with the onboarding draft's rules, then asks Deluge's
 * widget_amend_billing for a DRY RUN with the lines the rep keeps ticked. The rep sees, in this order: lines Books could not match
 * (the invoice was changed by hand -- David: discourage that), what Books would do (document, totals, credit note), and the lines.
 * Then one choice: change the invoice when the amendment is saved, or leave it. Nothing is written here: the parent's Save makes the
 * one real call (never retried). `onPlan(plan)` hands the parent { decision, add, lower, flags, signature }; a plan whose signature no
 * longer matches the order is stale and Save asks for a new check.
 */
import React, { useState } from "react";
import { Alert, Box, Button, Checkbox, CircularProgress, FormControlLabel, Radio, RadioGroup, Typography } from "@mui/material";
import { AMEND_FUNCTION, NOTHING_TO_SEND, amendArgs, billingDiff, netSwaps, newHandItems, priceBeforeAfter, readAmendAnswer } from "../invoice/amendBilling";
import { call as callFunction, searchBooks } from "../products/booksItems";

const money = (n) => (n < 0 ? "-$" : "+$") + Math.abs(Number(n) || 0).toFixed(2);

export const HAND_EDIT_WARNING =
  "This invoice was changed by hand in Books, so these lines could not be matched. Fix them in Books yourself, and please make " +
  "future changes with the Amendment Form.";

const AmendBilling = ({ dealId, original, saved, signature, reason, submittedBy, onPlan, disabled }) => {
  const [work, setWork] = useState(null); // { diff, hand, flags, lookup, signature }
  const [ticked, setTicked] = useState([]); // ids of the add / lower lines the rep keeps
  const [answer, setAnswer] = useState(null); // dry run, read
  const [checkedFor, setCheckedFor] = useState(""); // the ticks the dry run was made with
  const [busy, setBusy] = useState("");
  const [decision, setDecision] = useState("");

  const stale = work && work.signature !== signature;
  const all = work ? [...work.diff.lower, ...work.diff.add] : [];
  const chosen = (ids) => ({
    add: work.diff.add.filter((x) => ids.includes(x.id)),
    lower: work.diff.lower.filter((x) => ids.includes(x.id)),
  });
  const tickKey = (ids) => [...ids].sort().join("|");

  const publish = (next) => onPlan && onPlan(next);

  const dryRun = async (w, ids) => {
    setBusy("Asking Books what it would do…");
    const pick = { add: w.diff.add.filter((x) => ids.includes(x.id)), lower: w.diff.lower.filter((x) => ids.includes(x.id)) };
    const a = await callFunction(AMEND_FUNCTION, amendArgs(dealId, { ...pick, flags: w.flags, dryRun: true, submittedBy, reason }));
    const read = readAmendAnswer(a, { dryRun: true });
    setAnswer(read);
    setCheckedFor(tickKey(ids));
    setBusy("");
    const sendable = read.ok && !NOTHING_TO_SEND.includes(read.result) && (pick.add.length || pick.lower.length);
    const d = sendable ? "send" : "leave";
    setDecision(d);
    publish({ decision: d, ...pick, flags: w.flags, signature: w.signature, answer: read });
    return read;
  };

  const workOut = async () => {
    setBusy("Pricing the order before and after…");
    setAnswer(null);
    const p = await priceBeforeAfter(original, saved, searchBooks);
    const diff = billingDiff(p.before.lines, p.after.lines);
    const w = { diff, hand: newHandItems(p.before.handList, p.after.handList), flags: p.flags, lookup: p.lookup, signature };
    setWork(w);
    const ids = [...diff.lower, ...diff.add].map((x) => x.id);
    setTicked(ids);
    if (!ids.length) {
      setBusy("");
      setDecision("none");
      publish({ decision: "none", add: [], lower: [], flags: p.flags, signature });
      return;
    }
    const read = await dryRun(w, ids);
    // Paid / part paid: the same item at the same price added and taken off (a color swap) cancels out -- ask Books again without it.
    if (read && read.ok && ["paid", "part_paid"].includes(read.state)) {
      const n = netSwaps(diff);
      if (n.netted) {
        const w2 = { ...w, diff: { ...diff, add: n.add, lower: n.lower }, netted: n.netted };
        const ids2 = [...n.lower, ...n.add].map((x) => x.id);
        setWork(w2);
        setTicked(ids2);
        if (!ids2.length) {
          setAnswer(null);
          setDecision("none");
          publish({ decision: "none", add: [], lower: [], flags: p.flags, signature });
        } else await dryRun(w2, ids2);
      }
    }
  };

  const toggle = (id) => {
    const next = ticked.includes(id) ? ticked.filter((x) => x !== id) : [...ticked, id];
    setTicked(next);
    // a different set of lines needs a new check before it can be sent
    publish({ decision: "unchecked", ...chosen(next), flags: work.flags, signature: work.signature });
  };

  const choose = (d) => {
    setDecision(d);
    publish({ decision: d, ...chosen(ticked), flags: work.flags, signature: work.signature, answer });
  };

  const needsCheck = work && all.length > 0 && tickKey(ticked) !== checkedFor;
  const canSend = answer && answer.ok && !NOTHING_TO_SEND.includes(answer.result) && ticked.length > 0 && !needsCheck;

  return (
    <Box sx={{ border: "1px solid #ccc", p: 2, my: 2 }}>
      <Typography fontWeight="bold" sx={{ mb: 1 }}>
        5. Price change
      </Typography>
      <Typography variant="body2" sx={{ mb: 1 }}>
        Works out what this amendment changes on the invoice (or estimate) in Books, priced the same way as the onboarding draft. Nothing
        is changed until you save the amendment.
      </Typography>

      {(!work || stale) && (
        <Button variant="outlined" size="small" disabled={disabled || !!busy} onClick={workOut}>
          {stale ? "The order changed - work out the price change again" : "Work out the price change"}
        </Button>
      )}
      {busy && (
        <Box sx={{ display: "flex", gap: 1, alignItems: "center", mt: 1 }}>
          <CircularProgress size={16} /> <Typography variant="body2">{busy}</Typography>
        </Box>
      )}

      {work && !stale && (
        <Box sx={{ mt: 1 }}>
          {work.lookup && (
            <Alert severity="warning" sx={{ mb: 1 }}>
              {work.lookup} The amounts below use the price list saved with the form.
            </Alert>
          )}
          {work.netted > 0 && (
            <Alert severity="info" sx={{ mb: 1 }}>
              This invoice is already paid, so {work.netted} piece(s) swapped for the same item at the same price cancel out: they are
              neither charged nor credited.
            </Alert>
          )}
          {!all.length && <Alert severity="info">This amendment does not change the price. The invoice stays as it is.</Alert>}

          {answer && answer.notMatched.length > 0 && (
            <Alert severity="warning" sx={{ mb: 1 }}>
              <b>{HAND_EDIT_WARNING}</b>
              <Box component="ul" sx={{ m: 0, pl: 2 }}>
                {answer.notMatched.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </Box>
            </Alert>
          )}

          {answer && (
            <Alert severity={answer.ok ? "info" : "warning"} sx={{ mb: 1 }}>
              {answer.message && <Box sx={{ mb: answer.summary.length ? 0.5 : 0 }}>{answer.message}</Box>}
              {answer.summary.map((s) => (
                <Box key={s}>{s}</Box>
              ))}
              {answer.changes.length > 0 && (
                <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2 }}>
                  {answer.changes.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </Box>
              )}
              {answer.notes.map((n) => (
                <Box key={n} sx={{ mt: 0.5 }}>
                  <i>{n}</i>
                </Box>
              ))}
            </Alert>
          )}

          {all.length > 0 && (
            <Box sx={{ mb: 1 }}>
              <Typography variant="body2" fontWeight="bold">
                Lines (untick one to leave it out):
              </Typography>
              {all.map((x) => (
                <FormControlLabel
                  key={x.id}
                  sx={{ display: "flex", ml: 0 }}
                  control={<Checkbox size="small" checked={ticked.includes(x.id)} onChange={() => toggle(x.id)} disabled={disabled || !!busy} />}
                  label={
                    <Typography variant="body2">
                      {x.plain} <span style={{ color: "#666" }}>({money(x.amount)} before tax, rush and card fees)</span>
                    </Typography>
                  }
                />
              ))}
              {needsCheck && (
                <Button variant="outlined" size="small" sx={{ mt: 1 }} disabled={disabled || !!busy} onClick={() => dryRun(work, ticked)}>
                  Check with Books again
                </Button>
              )}
            </Box>
          )}

          {work.hand.length > 0 && (
            <Alert severity="warning" sx={{ mb: 1 }}>
              <b>Add these in Books yourself</b> (the form has no Books price for them):
              <Box component="ul" sx={{ m: 0, pl: 2 }}>
                {work.hand.map((h) => (
                  <li key={h.what + h.reason}>
                    {h.quantity} x {h.what} - {h.reason}
                  </li>
                ))}
              </Box>
            </Alert>
          )}

          {all.length > 0 && !needsCheck && answer && (
            <RadioGroup value={decision} onChange={(e) => choose(e.target.value)}>
              <FormControlLabel
                value="send"
                disabled={!canSend || disabled}
                control={<Radio size="small" />}
                label="Change the invoice in Books when I save this amendment"
              />
              <FormControlLabel
                value="leave"
                disabled={disabled}
                control={<Radio size="small" />}
                label="Leave the invoice as it is (I will handle it in Books)"
              />
            </RadioGroup>
          )}
        </Box>
      )}
    </Box>
  );
};

export default AmendBilling;
