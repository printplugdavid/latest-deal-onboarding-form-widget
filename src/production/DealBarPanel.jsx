/*
 * DealBarPanel.jsx -- E-173 / D-82: the Deal bar at the top of every Production Cards tab (Deal Status, Salesperson, Open Activities,
 * the Books invoice without money) and, on the Graphic Design tab, the Send Mockup to Client button (switch sendMockupOn).
 * Screen only: it is not part of the printed / downloaded card (those are the card itself).
 */
import React, { useState } from "react";
import { Alert, Box, Button, CircularProgress, Typography } from "@mui/material";
import { MOCKUP_STAGE, SEND_MOCKUP_FUNCTION, dealHead, openActivities, readSendMockup } from "./dealBar";

const ZOHO = window.ZOHO;
const fold = { cursor: "pointer", fontWeight: 600 };
const dueText = (a) => (a.due ? `due ${a.due}${a.late ? " (past due)" : a.today ? " (today)" : ""}` : "no due date");

/*
 * Send Mockup: does exactly what the Deal's own button does (David 10-30: "Yes, same as today") through Deluge's copy. First a dry run
 * says who the email goes to; the designer confirms; then the real send. A send that times out is NOT retried by itself (the email may
 * have gone): the designer is told to check the Deal's emails first.
 */
function SendMockup({ recordId, user, refresh }) {
  const [step, setStep] = useState({ s: "idle" });
  const call = (dry) =>
    Promise.race([
      Promise.resolve().then(() =>
        ZOHO.CRM.FUNCTIONS.execute(SEND_MOCKUP_FUNCTION, {
          arguments: JSON.stringify({ deal_id: String(recordId), dry_run: dry ? "true" : "false", submitted_by: user?.name || "" }),
        })
      ),
      new Promise((resolve) => setTimeout(() => resolve({ __timeout: true }), 20000)),
    ]);
  const check = async () => {
    setStep({ s: "checking" });
    try {
      const r = await call(true);
      if (r && r.__timeout) return setStep({ s: "error", msg: "The check took too long. Try again in a minute." });
      const a = readSendMockup(r);
      if (a.ok && a.result === "dry_run") return setStep({ s: "confirm", a });
      setStep({ s: "error", msg: a.message || "The mock-up cannot be sent (" + (a.result || "no answer") + ")." });
    } catch (e) {
      setStep({ s: "error", msg: "The Send Mockup function did not answer: " + String(e?.message || e) });
    }
  };
  const send = async () => {
    setStep((old) => ({ ...old, s: "sending" }));
    try {
      const r = await call(false);
      if (r && r.__timeout)
        return setStep({ s: "unsure", msg: "No answer in time -- the email may or may not have gone. Check the Deal's emails before pressing again." });
      const a = readSendMockup(r);
      if (a.ok && a.result === "sent") {
        setStep({ s: "sent", a });
        if (refresh) refresh();
        return;
      }
      setStep({ s: "error", msg: a.message || "The mock-up was not sent (" + (a.result || "no answer") + ")." });
    } catch (e) {
      setStep({ s: "unsure", msg: "The send call failed (" + String(e?.message || e) + "). Check the Deal's emails before pressing again." });
    }
  };
  const to = (a) => (a.to.length ? a.to.join(", ") : "(no address)") + (a.contact ? ` (${a.contact})` : "");
  return (
    <Box sx={{ mt: 1 }}>
      {step.s === "idle" || step.s === "error" ? (
        <Button variant="contained" size="small" onClick={check}>
          Send Mockup to Client
        </Button>
      ) : null}
      {step.s === "checking" && (
        <Typography variant="body2">
          <CircularProgress size={14} sx={{ mr: 1, verticalAlign: "middle" }} />
          Checking who the mock-up goes to…
        </Typography>
      )}
      {(step.s === "confirm" || step.s === "sending") && (
        <Alert severity="info" sx={{ mt: 0.5 }}>
          <div>
            This sends the mock-up email to <b>{to(step.a)}</b>
            {step.a.subject ? (
              <>
                {" "}
                -- subject "<b>{step.a.subject}</b>"
              </>
            ) : null}
            , and moves the Deal to <b>{step.a.stageAfter || MOCKUP_STAGE}</b>.
          </div>
          <Box sx={{ mt: 1, display: "flex", gap: 1 }}>
            <Button variant="contained" size="small" onClick={send} disabled={step.s === "sending"}>
              {step.s === "sending" ? "Sending…" : "Send to client"}
            </Button>
            <Button size="small" onClick={() => setStep({ s: "idle" })} disabled={step.s === "sending"}>
              Cancel
            </Button>
          </Box>
        </Alert>
      )}
      {step.s === "sent" && (
        <Alert severity="success" sx={{ mt: 0.5 }}>
          Mock-up sent to {to(step.a)}. The Deal is now at {step.a.stageAfter || MOCKUP_STAGE}.
        </Alert>
      )}
      {step.s === "error" && (
        <Alert severity="warning" sx={{ mt: 0.5 }}>
          {step.msg}
        </Alert>
      )}
      {step.s === "unsure" && (
        <Alert severity="error" sx={{ mt: 0.5 }}>
          {step.msg}
        </Alert>
      )}
    </Box>
  );
}

export default function DealBar({ deal, tasks, invoice, today, showSendMockup, recordId, user, refresh }) {
  const head = dealHead(deal);
  const acts = tasks ? openActivities(tasks, today) : null;
  const late = acts ? acts.filter((a) => a.late).length : 0;
  return (
    <Box sx={{ bgcolor: "#fff", borderBottom: "1px solid #ddd", px: 2, py: 1, fontSize: 14, color: "#1a1a1a" }}>
      <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
        <span>
          Deal Status: <b>{head.stage || "(none)"}</b>
        </span>
        <span>
          Salesperson: <b>{head.salesPerson || "(none)"}</b>
        </span>
      </Box>
      {acts && (
        <details style={{ marginTop: 4 }}>
          <summary style={fold}>
            Open Activities ({acts.length})
            {late ? <span style={{ color: "#c62828" }}> -- {late} past due</span> : null}
            {acts[0] ? <span style={{ fontWeight: 400, color: "#555" }}> -- next: {acts[0].subject}, {dueText(acts[0])}</span> : null}
          </summary>
          {acts.length ? (
            acts.map((a) => (
              <div key={a.id} style={{ margin: "2px 0 2px 14px", color: a.late ? "#c62828" : undefined }}>
                {a.subject} <span style={{ color: a.late ? "#c62828" : "#666" }}>-- {a.who || "unassigned"}, {dueText(a)}</span>
              </div>
            ))
          ) : (
            <div style={{ margin: "2px 0 2px 14px", color: "#666" }}>No open tasks.</div>
          )}
        </details>
      )}
      <Box sx={{ mt: 0.5 }}>
        {!invoice || invoice.state === "loading" ? (
          <span style={{ color: "#666" }}>Invoice: looking it up in Books…</span>
        ) : invoice.state !== "ok" ? (
          <span style={{ color: "#666" }}>Invoice: {invoice.message}</span>
        ) : (
          invoice.invoices.map((inv) => (
            <details key={inv.id || inv.number} style={{ marginTop: 2 }}>
              <summary style={fold}>
                Invoice {inv.number || "(no number)"} <span style={{ fontWeight: 400 }}>-- {inv.statusText}</span>
                {inv.link ? (
                  <>
                    {" "}
                    <a href={inv.link} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 400 }} onClick={(e) => e.stopPropagation()}>
                      Open in Books ↗
                    </a>
                  </>
                ) : null}
                <span style={{ fontWeight: 400, color: "#555" }}> -- what was sold ({inv.items.length})</span>
              </summary>
              {inv.items.length ? (
                inv.items.map((l, i) => (
                  <div key={i} style={{ margin: "2px 0 2px 14px" }}>
                    {l.quantity ? <b>{l.quantity} × </b> : null}
                    {l.name}
                    {l.description ? <span style={{ color: "#666" }}> -- {l.description}</span> : null}
                  </div>
                ))
              ) : (
                <div style={{ margin: "2px 0 2px 14px", color: "#666" }}>
                  {inv.itemsLoaded ? "No items on this invoice." : "Items not loaded -- open it in Books."}
                </div>
              )}
            </details>
          ))
        )}
      </Box>
      {showSendMockup && <SendMockup recordId={recordId} user={user} refresh={refresh} />}
    </Box>
  );
}
