/*
 * QcApp.jsx -- E-52, the Quality Check form. Loaded when the widget URL carries ?view=qc (index.js).
 *
 * One screen for the person doing the check (quality-check/03):
 *   1. the overview, READ-ONLY: PO number large, the critical notes, the order's lines, a button to
 *      the WorkDrive folder, and the production cards / Color Matching (the same cards the viewer builds)
 *   2. the approvals -- the only boxes to tick (the list lives in qcRules.js)
 *   3. the result: Passed - pickup / Passed - needs shipping / Failed, each with its few follow-ups
 *   4. "what will happen", a confirm, then the writes.
 *
 * WRITE ORDER (D-27): Deal fields (Trigger: []) -> the note -> the QC task(s) (Trigger: []) -> the
 * STAGE, last, with the workflow trigger. The stage change is what makes CRM stamp its dates, tag
 * the Deal, create the follow-up task and email the customer (measured 2026-10-12) -- this form
 * does none of that itself, so nothing is stamped or created twice. If the Deal fields cannot be
 * saved, NOTHING after them runs: a stage must never move ahead of the data its automations read.
 *
 * Everything decided here comes from qcRules.buildPlan(); the panel and the submit share it.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Tab,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { newestFirst, readFileText } from "../zohoFiles";
import { buildCardsFromData, labelFor, orderOf } from "../cardBuild";
import { loadAccountNotes, todayStamp } from "../customerNotes";
import { parseNoteToForm } from "../amendment/noteToForm";
import { LIVE_NOTE_TITLE } from "../amendment/amendmentDiff";
import {
  APPROVALS,
  DEFAULT_TRACKING_URL,
  INVOICE_FUNCTION,
  QC_NOTE_TITLE,
  RESULTS,
  STAGES,
  allApproved,
  buildPlan,
  criticalNotes,
  dealIdentity,
  invoiceLine,
  isOnlineOrder,
  isRush,
  isShipOnly,
  orderLines,
  problems,
  readInvoiceAnswer,
  splitAddress,
  startPartialLines,
} from "./qcRules";
import { LABEL_KINDS, MAX_BOXES, boxCount, buildLabelHtml } from "./qcLabel";
import logoFile from "./logo.png";
import qrFile from "./review-qr.png";

const ZOHO = window.ZOHO;
const ok = (r) => r?.data?.[0]?.code === "SUCCESS";
const why = (r) => JSON.stringify(r?.data?.[0] || r || "no answer");
const absolute = (u) => {
  try {
    return new URL(u, window.location.href).href;
  } catch (e) {
    return u;
  }
};
const oneLine = (s) => String(s == null ? "" : s).replace(/\s*\n+\s*/g, ", ").replace(/\s+/g, " ").trim();
const niceDate = (d) => {
  const o = new Date(/^\d{4}-\d{2}-\d{2}$/.test(d) ? d + "T00:00:00" : d); // bare CRM dates are local, not UTC
  return isNaN(o) ? String(d || "") : o.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

// The clipboard API can be refused inside Zoho's frame; the old command still works on a click.
async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) {
    /* fall through */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const done = document.execCommand("copy");
    ta.remove();
    return done;
  } catch (e) {
    return false;
  }
}

async function loadQc(entity, recordId) {
  const soft = (p) => Promise.resolve().then(p).catch(() => null);
  const related = (list) => ZOHO.CRM.API.getRelatedRecords({ Entity: entity, RecordID: recordId, RelatedList: list, page: 1, per_page: 200 });
  const [rec, att, notes, tasks, vars] = await Promise.all([
    ZOHO.CRM.API.getRecord({ Entity: entity, RecordID: recordId, approved: "both" }),
    soft(() => related("Attachments")),
    soft(() => related("Notes")),
    soft(() => related("Tasks")),
    soft(() => ZOHO.CRM.API.getOrgVariable("products")),
  ]);
  const deal = rec?.data?.[0];
  if (!deal) throw new Error("the Deal could not be read");

  // The saved order: the newest onboarding-form.json; failing that, rebuilt from the live onboarding
  // note (lossy -- shown with a warning, and no cards are built from it); failing that, nothing
  // (online orders never had the form).
  let json = null;
  let fromNote = false;
  let orderProblem = "";
  const newest = (att?.data || [])
    .filter((a) => String(a?.File_Name || "").toLowerCase() === "onboarding-form.json")
    .sort(newestFirst)[0];
  try {
    if (newest?.["$file_id"]) {
      const { text, shape } = await readFileText(newest["$file_id"]);
      if (!text || !text.trim()) throw new Error(`onboarding-form.json read empty (${shape})`);
      json = JSON.parse(text);
    } else {
      const live = (notes?.data || []).filter((n) => n?.Note_Title === LIVE_NOTE_TITLE).sort(newestFirst)[0];
      if (live?.Note_Content) {
        json = parseNoteToForm(live.Note_Content, vars?.Success?.Content?.split(",") || []).values;
        fromNote = true;
      }
    }
  } catch (e) {
    orderProblem = String(e?.message || e);
    json = null;
  }
  if (json?._source === "note") fromNote = true;

  let cards = [];
  if (json && !fromNote) {
    try {
      cards = [...buildCardsFromData(json, deal).entries()]
        .map(([name, html]) => ({ name, label: labelFor(name), html }))
        .sort((a, b) => orderOf(a.name) - orderOf(b.name));
    } catch (e) {
      cards = [];
    }
  }
  return { deal, json, fromNote, orderProblem, cards, tasks: tasks?.data || [], tasksRead: !!tasks };
}

const Section = ({ title, children, sx }) => (
  <Box sx={{ border: "1px solid #d5d8dd", borderRadius: 1, bgcolor: "#fff", mb: 2, ...sx }}>
    <Typography sx={{ px: 2, py: 1, fontWeight: 700, fontSize: 15, borderBottom: "1px solid #e3e5e8", bgcolor: "#f5f6f8" }}>{title}</Typography>
    <Box sx={{ p: 2 }}>{children}</Box>
  </Box>
);

const CopyLine = ({ label, value }) => {
  const [state, setState] = useState("");
  if (!value) return null;
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.75 }}>
      <Typography sx={{ width: 120, fontSize: 12, color: "#555", flexShrink: 0 }}>{label}</Typography>
      <Typography sx={{ flexGrow: 1, fontSize: 14, userSelect: "all", wordBreak: "break-word" }}>{value}</Typography>
      <Button
        size="small"
        variant="outlined"
        sx={{ flexShrink: 0, minWidth: 84 }}
        onClick={async () => {
          const done = await copyText(value);
          setState(done ? "Copied" : "Select + Ctrl-C");
          setTimeout(() => setState(""), 1800);
        }}
      >
        {state || "Copy"}
      </Button>
    </Box>
  );
};

const QcApp = () => {
  const [status, setStatus] = useState({ state: "loading", message: "" });
  const [loaded, setLoaded] = useState(null);
  const [accountNotes, setAccountNotes] = useState("");
  const [contact, setContact] = useState(null);
  const [who, setWho] = useState("");
  const [cardTab, setCardTab] = useState(0);
  const [showCards, setShowCards] = useState(true);

  const [approvals, setApprovals] = useState({});
  const [result, setResult] = useState("");
  const [remainderDue, setRemainderDue] = useState(null);
  const [remainderSource, setRemainderSource] = useState(""); // "invoice" = read from Books, "agent" = answered by hand
  const [invoice, setInvoice] = useState(null); // null while loading; then readInvoiceAnswer(...)
  const [boxes, setBoxes] = useState("");
  const [addressee, setAddressee] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [trackingUrl, setTrackingUrl] = useState(DEFAULT_TRACKING_URL);
  const [partial, setPartial] = useState("");
  const [partialLines, setPartialLines] = useState([]);
  const [partialNotes, setPartialNotes] = useState("");
  const [notes, setNotes] = useState("");

  const [confirming, setConfirming] = useState(false);
  const [labelOpen, setLabelOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [outcome, setOutcome] = useState(null); // { done: [], failed: [], stopped: bool }
  const ctx = useRef({ entity: null, recordId: null });
  const labelFrame = useRef(null);

  useEffect(() => {
    if (!ZOHO?.embeddedApp) {
      setStatus({ state: "error", message: "This page only works inside Zoho CRM (the widget SDK did not load)." });
      return;
    }
    ZOHO.embeddedApp.on("PageLoad", async (data) => {
      try {
        ZOHO.CRM.UI.Resize({ height: "92%", width: "70%" });
      } catch (e) {
        /* resize is cosmetic */
      }
      const entity = data?.Entity;
      const recordId = data?.EntityId?.[0] ?? data?.EntityId;
      ctx.current = { entity, recordId };
      try {
        const res = await loadQc(entity, recordId);
        setLoaded(res);
        setAddressee(oneLine(res.deal.Addressee) || (res.json?.doProductsNeedShipped === "Yes" ? oneLine(res.json?.shippingContactAddress) : ""));
        setTrackingNumber(String(res.deal.Tracking_Number || ""));
        if (res.deal.Tracking_URL) setTrackingUrl(String(res.deal.Tracking_URL));
        setPartialLines(startPartialLines(orderLines(res.json)));
        setStatus({ state: "ready", message: "" });
        // Three extras, none of them fatal.
        loadAccountNotes(res.deal).then((a) => setAccountNotes(a?.notes || "")).catch(() => {});
        if (res.deal.Contact_Name?.id) {
          Promise.resolve()
            .then(() => ZOHO.CRM.API.getRecord({ Entity: "Contacts", RecordID: res.deal.Contact_Name.id }))
            .then((c) => setContact(c?.data?.[0] || null))
            .catch(() => {});
        }
        // The Books invoice, through the CRM function. Never fatal and never waited on for long: a
        // missing function, a refusal or a slow answer all end as "ask the agent".
        Promise.race([
          Promise.resolve().then(() => ZOHO.CRM.FUNCTIONS.execute(INVOICE_FUNCTION, { arguments: JSON.stringify({ deal_id: String(recordId) }) })),
          new Promise((resolve) => setTimeout(() => resolve(null), 15000)),
        ])
          .then((r) => setInvoice(readInvoiceAnswer(r)))
          .catch((e) => {
            console.log("QC: invoice not read:", e);
            setInvoice(readInvoiceAnswer(null));
          });
        Promise.resolve()
          .then(() => ZOHO.CRM.CONFIG.getCurrentUser())
          .then((u) => setWho(u?.users?.[0]?.full_name || ""))
          .catch(() => {});
      } catch (e) {
        setStatus({ state: "error", message: String(e?.message || e) });
      }
    });
    ZOHO.embeddedApp.init();
  }, []);

  // The invoice answers the remainder question when it can -- shown, and the agent may still change it.
  useEffect(() => {
    if (invoice?.decided && remainderDue === null) {
      setRemainderDue(invoice.remainderDue);
      setRemainderSource("invoice");
    }
  }, [invoice]); // eslint-disable-line react-hooks/exhaustive-deps

  const deal = useMemo(() => loaded?.deal || {}, [loaded]);
  const json = loaded?.json || null;
  const lines = useMemo(() => orderLines(json), [json]);
  const critical = useMemo(() => criticalNotes(json, deal, accountNotes), [json, deal, accountNotes]);
  const ident = dealIdentity(deal.Deal_Name, deal.PO_Number);
  const shipOnly = isShipOnly(deal);
  const online = isOnlineOrder(deal);
  const approved = allApproved(approvals);
  const orderShips = json?.doProductsNeedShipped === "Yes" || !!deal.Addressee;

  const state = { approvals, result, remainderDue, remainderSource, boxes, addressee, trackingNumber, trackingUrl, partial, partialLines, partialNotes, notes };
  const planCtx = { deal, tasks: loaded?.tasks || [], dateStr: todayStamp(), who, invoice };
  const answerRemainder = (due) => {
    setRemainderDue(due);
    setRemainderSource(invoice?.decided && invoice.remainderDue === due ? "invoice" : "agent");
  };
  const blockers = loaded ? problems(state, planCtx) : [];
  const plan = loaded && (result || shipOnly) ? buildPlan(state, planCtx) : null;

  const contactName = deal.Contact_Name?.name || json?.contactInfo?.Contact_Name || "";
  const accountName = deal.Account_Name?.name || json?.contactInfo?.Account_Name || "";
  const phone = contact?.Phone || contact?.Mobile || json?.contactInfo?.Contact_Phone || "";
  const labelBoxes = boxCount(boxes);
  const labelKind = shipOnly || result === RESULTS.SHIP ? LABEL_KINDS.SHIP : result === RESULTS.FAILED ? LABEL_KINDS.PARTIAL : LABEL_KINDS.PICKUP;
  const labelHtml = labelOpen
    ? buildLabelHtml({
        kind: labelKind,
        bigLabel: ident.bigLabel,
        big: ident.big,
        dealName: deal.Deal_Name,
        account: accountName,
        contactName,
        phone,
        dealNo: ident.dealNo,
        salesAgent: deal.Sales_Person || deal.Owner?.name || "",
        qcDate: niceDate(todayStamp()),
        boxes: labelBoxes,
        logoUrl: absolute(logoFile),
        qrUrl: absolute(qrFile),
      })
    : "";

  const printLabels = () => {
    try {
      labelFrame.current.contentWindow.focus();
      labelFrame.current.contentWindow.print();
    } catch (e) {
      window.alert("Printing was blocked here. Use Download, then print the file (paper size 4 x 6 in).");
    }
  };
  const downloadLabels = () => {
    const url = URL.createObjectURL(new Blob([labelHtml], { type: "text/html" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `package-label-${ident.big || "deal"}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const submit = async () => {
    setConfirming(false);
    setSaving(true);
    const { entity, recordId } = ctx.current;
    const p = buildPlan(state, { ...planCtx, dateStr: todayStamp() });
    const done = [];
    const failed = [];

    // 1. the Deal's own fields. If this fails, stop: nothing else may run ahead of it.
    if (Object.keys(p.fields).length) {
      try {
        const r = await ZOHO.CRM.API.updateRecord({ Entity: entity, APIData: { id: recordId, ...p.fields }, Trigger: [] });
        if (!ok(r)) throw new Error(why(r));
        done.push("Saved on the Deal: " + Object.keys(p.fields).map((k) => k.replace(/_/g, " ")).join(", "));
      } catch (e) {
        console.log("QC: Deal fields not written:", e);
        setOutcome({ done, failed: ["Saving the Deal's fields failed (" + String(e?.message || e) + ")"], stopped: true });
        setSaving(false);
        return;
      }
    }

    // 2. the note -- a record of who checked and what they ticked. Never blocks the rest.
    try {
      const r = await ZOHO.CRM.API.addNotes({ Entity: entity, RecordID: recordId, Title: QC_NOTE_TITLE, Content: p.note });
      if (!ok(r)) throw new Error(why(r));
      done.push("Quality check note added");
    } catch (e) {
      console.log("QC: note not added:", e);
      failed.push("The quality check note was not added");
    }

    // 3. the open QC task(s). Whether a widget may write Tasks was never proven before this form --
    //    a refusal is reported in plain words and does not hold up the stage.
    if (!p.shipOnly) {
      if (!loaded.tasksRead) failed.push("The Deal's tasks could not be read — complete the Quality Check task by hand");
      let closed = 0;
      for (const t of p.closeTasks) {
        try {
          const r = await ZOHO.CRM.API.updateRecord({ Entity: "Tasks", APIData: { id: t.id, Status: "Completed" }, Trigger: [] });
          if (!ok(r)) throw new Error(why(r));
          closed += 1;
        } catch (e) {
          console.log("QC: task not completed:", t.id, e);
          failed.push("A Quality Check task could not be completed — complete it by hand");
        }
      }
      if (closed) done.push(closed === 1 ? "Quality Check task completed" : closed + " Quality Check tasks completed");
    }

    // 4. the stage, LAST, with the workflow trigger -- its automations read what was written above.
    if (p.stage.move) {
      try {
        const r = await ZOHO.CRM.API.updateRecord({ Entity: entity, APIData: { id: recordId, Stage: p.stage.stage }, Trigger: ["workflow"] });
        if (!ok(r)) throw new Error(why(r));
        done.push("Deal moved to “" + p.stage.stage + "”");
      } catch (e) {
        console.log("QC: stage not moved:", e);
        failed.push("The Deal could not be moved to “" + p.stage.stage + "” — move the stage by hand");
      }
    } else if (p.stage.reason === "family") {
      failed.push("School / advertiser deal: the stage was NOT moved — move it by hand");
    }

    setOutcome({ done, failed, stopped: false, result: p.result });
    setSaving(false);
  };

  const closeForm = () => {
    try {
      ZOHO.CRM.UI.Popup.closeReload();
    } catch (e) {
      /* ignore */
    }
  };

  if (status.state === "loading") {
    return (
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, p: 4, bgcolor: "#fff", color: "#1a1a1a", minHeight: "100vh" }}>
        <CircularProgress size={24} />
        <Typography>Loading this deal for quality check…</Typography>
      </Box>
    );
  }
  if (status.state === "error") {
    return (
      <Box sx={{ p: 3, bgcolor: "#fff", minHeight: "100vh" }}>
        <Alert severity="error">Couldn't load the Quality Check form: {status.message}</Alert>
      </Box>
    );
  }

  const stage = String(deal.Stage || "");
  const card = loaded.cards[cardTab];
  const locked = saving || !!outcome;
  const needsBoxes = !shipOnly && ((result && result !== RESULTS.FAILED) || partial === "yes");
  const addr = splitAddress(addressee);

  const labelButton = (
    <Button variant="outlined" disabled={!labelBoxes} onClick={() => setLabelOpen(true)}>
      {labelBoxes > 1 ? `Print ${labelBoxes} labels` : "Print label"}
    </Button>
  );

  return (
    <Box sx={{ bgcolor: "#eef0f3", color: "#1a1a1a", minHeight: "100vh", p: 2, fontFamily: "Roboto, sans-serif" }}>
      {/* ---- the header: what to look for on the shelf ---- */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap", bgcolor: "#fff", border: "1px solid #d5d8dd", borderRadius: 1, p: 2, mb: 2 }}>
        <Box sx={{ pr: 2, borderRight: ident.big ? "2px solid #1a1a1a" : 0 }}>
          {ident.big ? (
            <>
              <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.5 }}>{ident.bigLabel}</Typography>
              <Typography sx={{ fontSize: 56, fontWeight: 900, lineHeight: 1 }}>{ident.big}</Typography>
            </>
          ) : (
            <Typography sx={{ fontSize: 13, color: "#8a5300", maxWidth: 170 }}>No PO number on this Deal</Typography>
          )}
        </Box>
        <Box sx={{ flexGrow: 1, minWidth: 240 }}>
          <Typography sx={{ fontSize: 18, fontWeight: 700 }}>{deal.Deal_Name}</Typography>
          <Typography sx={{ fontSize: 14, color: "#444" }}>
            {[accountName, contactName && contactName !== accountName ? contactName : "", phone].filter(Boolean).join(" · ")}
          </Typography>
          <Box sx={{ display: "flex", gap: 1, mt: 1, flexWrap: "wrap" }}>
            <Chip size="small" label={"Stage: " + (stage || "(none)")} color={stage === STAGES.QC ? "primary" : "default"} />
            {deal.Closing_Date && <Chip size="small" label={"Due " + niceDate(deal.Closing_Date)} />}
            {isRush(deal) && <Chip size="small" color="error" label="RUSH" />}
            {orderShips && <Chip size="small" color="warning" label="This order ships" />}
            {deal.Sales_Person && <Chip size="small" variant="outlined" label={"Sales: " + deal.Sales_Person} />}
          </Box>
        </Box>
        {deal.WorkDrive_Link ? (
          <Button variant="contained" component="a" href={deal.WorkDrive_Link} target="_blank" rel="noopener noreferrer">
            Open WorkDrive folder
          </Button>
        ) : (
          <Typography sx={{ fontSize: 13, color: "#8a5300", maxWidth: 180 }}>No WorkDrive folder link on this Deal</Typography>
        )}
      </Box>

      {shipOnly && (
        <Alert severity="info" sx={{ mb: 2 }}>
          This Deal is already in “{STAGES.NEED_SHIP}” — it passed quality check earlier. Use this form to add the tracking number; that moves it to “{STAGES.SHIPPED}”.
        </Alert>
      )}
      {!shipOnly && stage !== STAGES.QC && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          This Deal is in “{stage || "(no stage)"}”, not “{STAGES.QC}”. You can still record a check here — make sure this is the right Deal first.
        </Alert>
      )}

      {/* ---- 1. overview, read-only ---- */}
      <Section title="1 · Check the notes">
        {critical.length === 0 && <Typography sx={{ fontSize: 14, color: "#555" }}>No customer notes, special instructions, amendments or earlier revisions on this Deal.</Typography>}
        {critical.map((n, i) => (
          <Box key={i} sx={{ mb: 1.25, p: 1.25, borderLeft: "4px solid " + (n.tone === "warn" ? "#e69500" : "#8aa4c8"), bgcolor: n.tone === "warn" ? "#fff8ea" : "#f3f6fa" }}>
            <Typography sx={{ fontSize: 12, fontWeight: 700, color: "#444" }}>{n.title}</Typography>
            <Typography sx={{ fontSize: 14, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{n.text}</Typography>
          </Box>
        ))}
      </Section>

      <Section title="2 · Count against the order">
        {loaded.orderProblem && <Alert severity="error" sx={{ mb: 1.5 }}>The saved order could not be read ({loaded.orderProblem}). Use the onboarding note on the Deal.</Alert>}
        {!json && !loaded.orderProblem && (
          <Alert severity="info">
            {online
              ? "This is an online order, so there is no onboarding form and no invoice in Zoho Books. Count against the online order itself in InkSoft."
              : "This Deal has no onboarding form (older deals do not). Count against the invoice in Zoho Books (the Finance panel on the Deal)."}
          </Alert>
        )}
        {loaded.fromNote && (
          <Alert severity="warning" sx={{ mb: 1.5 }}>
            This order was rebuilt from the onboarding note, not from saved answers, so a detail may be missing. Read the full note on the Deal if anything looks short.
          </Alert>
        )}
        {json && lines.length === 0 && <Typography sx={{ fontSize: 14, color: "#555" }}>The onboarding form lists no garments or products to count.</Typography>}
        {lines.map((l) => (
          <Box key={l.key} sx={{ display: "flex", gap: 2, py: 1.25, borderBottom: "1px solid #eceef1", alignItems: "flex-start" }}>
            <Box sx={{ width: 76, textAlign: "center", flexShrink: 0 }}>
              <Typography sx={{ fontSize: 30, fontWeight: 800, lineHeight: 1 }}>{l.qty == null ? "?" : l.qty}</Typography>
              <Typography sx={{ fontSize: 11, color: "#666" }}>{l.qty == null ? "no quantity given" : "ordered"}</Typography>
            </Box>
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              <Typography sx={{ fontSize: 15, fontWeight: 700 }}>
                {l.label} {l.product && l.product !== l.label && <span style={{ fontWeight: 400, color: "#555" }}>· {l.product}</span>}
              </Typography>
              {l.sizes && <Typography sx={{ fontSize: 14, whiteSpace: "pre-wrap" }}>{l.sizes}</Typography>}
              {l.graphics.map((g, gi) => (
                <Typography key={gi} sx={{ fontSize: 13, color: "#333", mt: 0.25 }}>
                  <b>Graphic {gi + 1}:</b> {g.description || "(no description)"}
                  {g.colors ? " — colors: " + g.colors : ""}
                  {g.placements.length ? " — " + g.placements.join("; ") : ""}
                </Typography>
              ))}
              {l.special && <Typography sx={{ fontSize: 13, mt: 0.5, color: "#8a5300" }}><b>Special instructions:</b> {l.special}</Typography>}
            </Box>
          </Box>
        ))}
        <Box sx={{ mt: 2, p: 1.5, bgcolor: "#f6f8fb", border: "1px solid #dfe4ea", borderRadius: 1 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 700, mb: 0.5 }}>The invoice in Zoho Books</Typography>
          {!invoice && <Typography sx={{ fontSize: 13, color: "#555" }}>Reading the invoice…</Typography>}
          {invoice && invoice.invoices.length === 0 && (
            <Typography sx={{ fontSize: 13, color: "#8a5300" }}>
              {invoice.state === "none"
                ? online
                  ? "Online orders have no invoice in Zoho Books — count against the online order in InkSoft."
                  : invoice.reason + " Check the Finance panel on the Deal."
                : invoice.reason + " Open it from the Finance panel on the Deal."}
            </Typography>
          )}
          {invoice &&
            invoice.invoices.map((inv, ii) => (
              <Box key={ii} sx={{ mb: 1 }}>
                <Typography sx={{ fontSize: 14 }}>{invoiceLine(inv)}</Typography>
                {inv.lineItems.map((l, li) => (
                  <Typography key={li} sx={{ fontSize: 13, color: "#333", pl: 1.5 }}>
                    <b>{l.quantity == null ? "?" : String(l.quantity)}</b> × {l.name || "(no name)"}
                    {l.description ? " — " + l.description : ""}
                  </Typography>
                ))}
                {!inv.lineItemsLoaded && <Typography sx={{ fontSize: 12, color: "#8a5300", pl: 1.5 }}>The line items could not be loaded — open the invoice to see them.</Typography>}
              </Box>
            ))}
          {invoice && invoice.invoices.length > 0 && invoice.reason && <Typography sx={{ fontSize: 13, color: "#8a5300" }}>{invoice.reason}</Typography>}
          {json && (
            <Typography sx={{ fontSize: 12, color: "#666", mt: 0.5 }}>
              The large numbers above are from the onboarding form; the invoice lines are from Books (they can include fees and shipping). Count against both.
            </Typography>
          )}
        </Box>
      </Section>

      {loaded.cards.length > 0 && (
        <Section title="3 · Check the graphics, colors and placement against the production cards">
          <Box sx={{ display: "flex", alignItems: "center", borderBottom: 1, borderColor: "divider" }}>
            <Tabs value={cardTab} onChange={(_, v) => setCardTab(v)} variant="scrollable" scrollButtons="auto" sx={{ flexGrow: 1 }}>
              {loaded.cards.map((c) => (
                <Tab key={c.name} label={c.label} />
              ))}
            </Tabs>
            <Button size="small" onClick={() => setShowCards((v) => !v)}>{showCards ? "Hide" : "Show"}</Button>
          </Box>
          {showCards && card && (
            <iframe
              key={card.name}
              title={card.label}
              srcDoc={card.html}
              sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
              style={{ width: "100%", height: "62vh", border: 0, display: "block", background: "#e9eaec" }}
            />
          )}
        </Section>
      )}

      {/* ---- 2. approvals ---- */}
      {!shipOnly && (
        <Section title="Approvals — tick each one you have checked">
          {APPROVALS.map((a) => (
            <FormControlLabel
              key={a.key}
              sx={{ display: "flex", mb: 0.5 }}
              control={<Checkbox checked={!!approvals[a.key]} disabled={locked} onChange={(e) => setApprovals((p) => ({ ...p, [a.key]: e.target.checked }))} />}
              label={a.label}
            />
          ))}
          {!approved && <Typography sx={{ fontSize: 13, color: "#555", mt: 1 }}>All ticked unlocks the two Passed results. If any one is not right, choose Failed.</Typography>}
        </Section>
      )}

      {/* ---- 3. result ---- */}
      {!shipOnly && (
        <Section title="Result">
          <ToggleButtonGroup
            exclusive
            fullWidth
            value={result}
            disabled={locked}
            onChange={(_, v) => v && setResult(v)}
            sx={{ mb: 2, "& .MuiToggleButton-root": { fontWeight: 700, py: 1.5 } }}
          >
            <ToggleButton value={RESULTS.PICKUP} disabled={!approved} color="success">Passed — pickup</ToggleButton>
            <ToggleButton value={RESULTS.SHIP} disabled={!approved} color="success">Passed — needs shipping</ToggleButton>
            <ToggleButton value={RESULTS.FAILED} color="error">Failed</ToggleButton>
          </ToggleButtonGroup>
          {result && result !== RESULTS.FAILED && !approved && (
            <Alert severity="warning" sx={{ mb: 2 }}>An approval was un-ticked. Tick them all again, or choose Failed.</Alert>
          )}

          {result === RESULTS.PICKUP && (
            <Box sx={{ mb: 2 }}>
              <Typography sx={{ fontWeight: 700, mb: 0.5 }}>Is a remainder due on the invoice?</Typography>
              <Typography sx={{ fontSize: 13, color: "#555", mb: 1 }}>
                {!invoice
                  ? "Reading the invoice…"
                  : invoice.decided
                  ? "Read from the invoice — " + invoiceLine(invoice.invoice) + ". The answer is filled in for you; change it only if you know the invoice is out of date. It decides the stage."
                  : online
                  ? "Online orders have no invoice in Zoho Books — check the payment on the online order itself, then answer. Your answer decides the stage."
                  : invoice.reason + " Check the invoice in the Finance panel / Zoho Books, then answer. Your answer decides the stage."}
              </Typography>
              <ToggleButtonGroup exclusive value={remainderDue === null ? "" : remainderDue ? "yes" : "no"} disabled={locked} onChange={(_, v) => v && answerRemainder(v === "yes")}>
                <ToggleButton value="yes" sx={{ px: 3 }}>Yes — remainder due</ToggleButton>
                <ToggleButton value="no" sx={{ px: 3 }}>No — paid in full</ToggleButton>
              </ToggleButtonGroup>
              {invoice?.decided && remainderDue !== null && remainderDue !== invoice.remainderDue && (
                <Alert severity="warning" sx={{ mt: 1 }}>
                  Your answer is different from the invoice ({invoiceLine(invoice.invoice)}). Submit only if you are sure — the note will record both.
                </Alert>
              )}
            </Box>
          )}

          {result === RESULTS.FAILED && (
            <Box sx={{ mb: 2 }}>
              <Alert severity="error" sx={{ mb: 2 }}>Mark every issue on the garments / products with the small <b>red stickers</b>.</Alert>
              <Typography sx={{ fontWeight: 700, mb: 1 }}>Is part of this order ready for the customer now?</Typography>
              <ToggleButtonGroup exclusive value={partial} disabled={locked} onChange={(_, v) => v && setPartial(v)} sx={{ mb: 1.5 }}>
                <ToggleButton value="no" sx={{ px: 3 }}>No</ToggleButton>
                <ToggleButton value="yes" sx={{ px: 3 }}>Yes — part can be picked up</ToggleButton>
              </ToggleButtonGroup>
              {partial === "yes" && (
                <Box sx={{ p: 1.5, bgcolor: "#f6f8fb", border: "1px solid #dfe4ea", borderRadius: 1 }}>
                  <Typography sx={{ fontSize: 13, color: "#444", mb: 1 }}>
                    Everything starts as ready. Un-tick a line that is being held, or lower its ready quantity.
                  </Typography>
                  {partialLines.length === 0 && <Typography sx={{ fontSize: 13, color: "#8a5300", mb: 1 }}>No order lines to choose from — describe what is ready in the box below.</Typography>}
                  {partialLines.map((l, i) => (
                    <Box key={l.key} sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
                      <Checkbox
                        checked={l.ready}
                        disabled={locked}
                        onChange={(e) => setPartialLines((rows) => rows.map((r, j) => (j === i ? { ...r, ready: e.target.checked, readyQty: e.target.checked ? r.qty : 0 } : r)))}
                      />
                      <Typography sx={{ flexGrow: 1, fontSize: 14 }}>{l.label}</Typography>
                      {l.qty != null && (
                        <>
                          <TextField
                            size="small"
                            type="number"
                            value={l.ready ? l.readyQty ?? "" : 0}
                            disabled={locked || !l.ready}
                            onChange={(e) => setPartialLines((rows) => rows.map((r, j) => (j === i ? { ...r, readyQty: e.target.value } : r)))}
                            inputProps={{ min: 0, max: l.qty, style: { width: 64, textAlign: "right" } }}
                          />
                          <Typography sx={{ fontSize: 14, width: 70 }}>of {l.qty} ready</Typography>
                        </>
                      )}
                    </Box>
                  ))}
                  <TextField
                    fullWidth
                    multiline
                    minRows={2}
                    size="small"
                    sx={{ mt: 1, bgcolor: "#fff" }}
                    label="Specifics (for example: all but the 2XLs)"
                    value={partialNotes}
                    disabled={locked}
                    onChange={(e) => setPartialNotes(e.target.value)}
                  />
                </Box>
              )}
            </Box>
          )}

          {result === RESULTS.SHIP && <ShipBlock {...{ addressee, setAddressee, addr, contactName, accountName, trackingNumber, setTrackingNumber, trackingUrl, setTrackingUrl, locked }} />}

          {needsBoxes && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap", mb: 2 }}>
              <TextField
                size="small"
                type="number"
                label="How many boxes?"
                value={boxes}
                disabled={saving}
                onChange={(e) => setBoxes(e.target.value)}
                inputProps={{ min: 1, max: MAX_BOXES }}
                sx={{ width: 170 }}
              />
              {labelButton}
              <Typography sx={{ fontSize: 13, color: "#555" }}>
                One 4 × 6 label per box{result === RESULTS.FAILED ? ", marked PARTIAL — MORE TO FOLLOW" : ""}. Then package and shelve.
              </Typography>
            </Box>
          )}

          {result && (
            <TextField fullWidth multiline minRows={2} size="small" label="Anything to add for the record? (optional)" value={notes} disabled={locked} onChange={(e) => setNotes(e.target.value)} />
          )}
        </Section>
      )}

      {shipOnly && (
        <Section title="Shipping">
          <ShipBlock {...{ addressee, setAddressee, addr, contactName, accountName, trackingNumber, setTrackingNumber, trackingUrl, setTrackingUrl, locked }} />
          <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
            <TextField size="small" type="number" label="Boxes (to reprint a label)" value={boxes} onChange={(e) => setBoxes(e.target.value)} inputProps={{ min: 1, max: MAX_BOXES }} sx={{ width: 210 }} />
            {labelButton}
          </Box>
        </Section>
      )}

      {/* ---- 4. what will happen, then submit ---- */}
      {plan && !outcome && (
        <Section title="What will happen when you submit" sx={{ borderColor: "#1565c0" }}>
          <Box component="ol" sx={{ m: 0, pl: 2.5 }}>
            {plan.summary.map((s, i) => (
              <Typography component="li" key={i} sx={{ fontSize: 14, mb: 0.5 }}>{s}</Typography>
            ))}
          </Box>
          {blockers.length > 0 && (
            <Alert severity="warning" sx={{ mt: 1.5 }}>
              Before you can submit: {blockers.join(" ")}
            </Alert>
          )}
          <Box sx={{ display: "flex", gap: 2, alignItems: "center", mt: 2 }}>
            <Button variant="contained" size="large" disabled={saving || blockers.length > 0} onClick={() => setConfirming(true)} color={plan.result === RESULTS.FAILED ? "error" : "primary"}>
              {saving ? "Saving…" : "Submit"}
            </Button>
            {saving && <CircularProgress size={22} />}
          </Box>
        </Section>
      )}

      {outcome && (
        <Section title={outcome.failed.length ? "Saved — with something for you to finish" : "Done"} sx={{ borderColor: outcome.failed.length ? "#c77700" : "#2e7d32" }}>
          {outcome.done.map((d, i) => (
            <Alert key={"d" + i} severity="success" sx={{ mb: 0.75 }}>{d}</Alert>
          ))}
          {outcome.failed.map((d, i) => (
            <Alert key={"f" + i} severity={outcome.stopped ? "error" : "warning"} sx={{ mb: 0.75 }}>{d}</Alert>
          ))}
          {outcome.stopped && (
            <Box sx={{ mt: 1 }}>
              <Typography sx={{ fontSize: 14, mb: 1 }}>Nothing else was done and the stage was not moved. You can try again.</Typography>
              <Button variant="contained" onClick={() => setOutcome(null)}>Try again</Button>
            </Box>
          )}
          {!outcome.stopped && outcome.result === RESULTS.FAILED && (
            <Alert severity="info" sx={{ mt: 1 }}>
              Next: file the <b>Revision / Correction form</b> from the Deal — it records what failed and moves the Deal on.
            </Alert>
          )}
          {!outcome.stopped && (
            <Box sx={{ display: "flex", gap: 2, mt: 2 }}>
              {labelBoxes > 0 && labelButton}
              <Button variant="contained" onClick={closeForm}>Close and refresh the Deal</Button>
            </Box>
          )}
        </Section>
      )}

      {/* ---- confirm ---- */}
      <Dialog open={confirming} onClose={() => setConfirming(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {plan?.shipOnly ? "Save the tracking and mark this order shipped?" : plan?.result === RESULTS.FAILED ? "Fail this quality check?" : "Pass this quality check?"}
        </DialogTitle>
        <DialogContent>
          <Box component="ol" sx={{ m: 0, pl: 2.5 }}>
            {(plan?.summary || []).map((s, i) => (
              <Typography component="li" key={i} sx={{ fontSize: 14, mb: 0.5 }}>{s}</Typography>
            ))}
          </Box>
          <Typography sx={{ fontSize: 13, color: "#8a5300", mt: 1.5 }}>A stage move cannot be undone from here — CRM's automations run as soon as it happens.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirming(false)}>Go back</Button>
          <Button variant="contained" onClick={submit} color={plan?.result === RESULTS.FAILED ? "error" : "primary"}>
            Yes — submit
          </Button>
        </DialogActions>
      </Dialog>

      {/* ---- the label ---- */}
      <Dialog open={labelOpen} onClose={() => setLabelOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{labelBoxes > 1 ? `${labelBoxes} package labels — one per box` : "Package label"}</DialogTitle>
        <DialogContent sx={{ bgcolor: "#d9dce1", p: 0 }}>
          {labelOpen && (
            <iframe
              ref={labelFrame}
              title="Package label"
              srcDoc={labelHtml}
              // No scripts run inside. allow-same-origin lets us print the frame; allow-modals lets the print dialog open.
              sandbox="allow-same-origin allow-modals"
              style={{ width: "100%", height: "66vh", border: 0, display: "block" }}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Typography sx={{ fontSize: 12, color: "#555", flexGrow: 1, pl: 2 }}>Paper size 4 × 6 in, no margins.</Typography>
          <Button onClick={downloadLabels}>Download</Button>
          <Button onClick={() => setLabelOpen(false)}>Close</Button>
          <Button variant="contained" onClick={printLabels}>Print</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

const ShipBlock = ({ addressee, setAddressee, addr, contactName, accountName, trackingNumber, setTrackingNumber, trackingUrl, setTrackingUrl, locked }) => (
  <Box sx={{ mb: 2 }}>
    <TextField
      fullWidth
      size="small"
      label="Ship to (one line — saved on the Deal as Addressee)"
      value={addressee}
      disabled={locked}
      onChange={(e) => setAddressee(e.target.value)}
      sx={{ mb: 1.5 }}
    />
    <Box sx={{ p: 1.5, bgcolor: "#f6f8fb", border: "1px solid #dfe4ea", borderRadius: 1, mb: 2 }}>
      <Typography sx={{ fontSize: 13, fontWeight: 700, mb: 1 }}>Click to copy into the postage label</Typography>
      <CopyLine label="Contact name" value={contactName} />
      <CopyLine label="Business name" value={accountName && accountName !== contactName ? accountName : ""} />
      {addr.parts.map((p, i) => (
        <CopyLine key={i} label={p.label} value={p.value} />
      ))}
      <CopyLine label="Whole address" value={addr.whole} />
      {addr.whole && addr.parts.length === 0 && (
        <Typography sx={{ fontSize: 12, color: "#666" }}>This address has no commas, so it is offered as one line — the form does not guess where the street ends.</Typography>
      )}
      {!addr.whole && <Typography sx={{ fontSize: 13, color: "#8a5300" }}>No ship-to address on this Deal yet — type it above.</Typography>}
    </Box>
    <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
      <TextField
        size="small"
        label="Tracking number"
        value={trackingNumber}
        disabled={locked}
        onChange={(e) => setTrackingNumber(e.target.value)}
        sx={{ flex: "1 1 260px" }}
        helperText="Leave empty if the postage is not bought yet — the Deal then waits in Products Need Shipping."
      />
      <TextField size="small" label="Tracking link" value={trackingUrl} disabled={locked} onChange={(e) => setTrackingUrl(e.target.value)} sx={{ flex: "1 1 260px" }} />
    </Box>
  </Box>
);

export default QcApp;
