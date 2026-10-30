/*
 * CardViewer.jsx -- opens a Deal's production cards without Zoho's attachment previewer.
 *
 * Zoho's previewer hangs on .html attachments (PDFs and images are fine), so the cards were only
 * usable by downloading them first. This view reads the same attachments through the widget SDK
 * and shows them directly, one department at a time, with Print and Download.
 *
 * Loaded when the widget URL carries ?view=cards (or #cards) -- see index.js. The onboarding form
 * itself is untouched.
 *
 * Cards are REBUILT, not read: the attachment list decides which tabs exist, and each card's content
 * comes from buildProductionCards() -- the generator the form runs at submit -- fed the newest
 * onboarding-form.json plus the Deal's current print-count fields AND its current Closing Date, so a
 * deal that moved does not leave production reading the date typed at onboarding (E-21).
 * Why: live in Zoho (2026-09-15), getFile on a .html attachment returns the STRING "[object Blob]"
 * (the SDK stringifies it before we see it), while .json reads fine. Reading the attached cards was
 * also the slow part (one wasted round trip per card), so it was removed rather than kept as a path.
 * getFile's result shape is still handled loosely and reported, so a failed JSON read is diagnosable.
 * TRAP: getFile needs "$file_id", NOT the attachment record id -- the record id returns an empty
 * Blob and throws nothing.
 */
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import { ALWAYS_BUILT, buildCardsFromData, labelFor, orderOf } from "./cardBuild";
import { workDriveTarget } from "./productionCards";
import { NOTE_EDITED_WARNING, newestFirst, noteEditedAfterSave, readFileText } from "./zohoFiles";
import { LIVE_NOTE_TITLE } from "./amendment/amendmentDiff";
import ProductionFlow from "./production/ProductionFlowPanel";
import { DEPARTMENTS, dueFlagsOn, dueStatus, flowDeptFor, needsOutsourcedTab } from "./production/productionFlow";
import PRODUCTION_CONFIG from "./production/productionConfig.json";

const ZOHO = window.ZOHO;

const secs = (ms) => `${(ms / 1000).toFixed(1)}s`;
const pcStamp = (iso) => {
  const d = new Date(iso);
  return isNaN(d) ? "(date unknown)" : d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
};

// The attachment list decides WHICH tabs exist; the card content is always rebuilt from the newest
// onboarding-form.json + the Deal's counts. Three SDK calls in two parallel rounds:
//   round 1: attachment list + Deal record     round 2: the JSON file
async function loadCards(entity, recordId) {
  const t0 = performance.now();
  const [resp, rec] = await Promise.all([
    ZOHO.CRM.API.getRelatedRecords({
      Entity: entity,
      RecordID: recordId,
      RelatedList: "Attachments",
      page: 1,
      per_page: 200,
    }),
    ZOHO.CRM.API.getRecord({ Entity: entity, RecordID: recordId, approved: "both" }),
  ]);
  const t1 = performance.now();
  // E-66: was the onboarding note edited by hand after the saved order? Never fatal.
  let notesResp = null;
  try {
    notesResp = await ZOHO.CRM.API.getRelatedRecords({ Entity: entity, RecordID: recordId, RelatedList: "Notes", page: 1, per_page: 200 });
  } catch (e) {
    notesResp = null;
  }

  const all = resp?.data || [];
  const attachments = all
    .filter((a) => {
      const n = String(a?.File_Name || "").toLowerCase();
      return n.startsWith("production-card-") && n.endsWith(".html");
    })
    .sort(newestFirst);

  // Re-submitting the onboarding form stacks duplicate cards with the same name. Newest wins;
  // the count of older copies is kept so the viewer can say they exist.
  const byName = new Map();
  for (const a of attachments) {
    const name = String(a.File_Name).toLowerCase();
    if (!byName.has(name)) byName.set(name, { olderCopies: 0 });
    else byName.get(name).olderCopies += 1;
  }
  if (!byName.size) return { cards: [], info: "", workDrive: "", workDriveLabel: "", flow: null };

  const json = all
    .filter((a) => String(a?.File_Name || "").toLowerCase().endsWith(".json"))
    .sort(newestFirst)[0];
  if (!json?.["$file_id"]) {
    throw new Error("this deal has cards but no onboarding-form.json to build them from");
  }
  // .json reads fine through getFile. .html does not: live 2026-09-15 the SDK returned the string
  // "[object Blob]" (String, 13 bytes) for every card, so the attached cards are never read.
  const { text, shape } = await readFileText(json["$file_id"]);
  const t2 = performance.now();
  if (!text || !text.trim()) throw new Error(`onboarding-form.json read empty (${shape})`);
  const data = JSON.parse(text);

  const deal = rec?.data?.[0] || {};
  const built = buildCardsFromData(data, deal);

  ALWAYS_BUILT.forEach((name) => {
    if (built.has(name) && !byName.has(name)) byName.set(name, { olderCopies: 0 });
    // ...and if the data no longer produces it (colors removed by an amendment), drop the tab rather
    // than show an error for a card that is only ever a by-product.
    if (!built.has(name)) byName.delete(name);
  });
  const cards = [...byName.entries()].map(([name, { olderCopies }]) => {
    const base = { name, label: labelFor(name), olderCopies };
    return built.has(name)
      ? { ...base, html: built.get(name) }
      : { ...base, error: "the deal's current onboarding data no longer produces this card." };
  });
  const info =
    `Built from the onboarding form submitted ${pcStamp(json.Created_Time)} and the Deal's current print counts` +
    (deal.Closing_Date ? ` · due date is the Deal's Closing Date (${deal.Closing_Date})` : "") +
    ` · loaded in ${secs(t2 - t0)} (list + deal ${secs(t1 - t0)}, form ${secs(t2 - t1)})`;
  // E-53: the folder link for the toolbar -- https only, so nothing typed into the field can run.
  // E-55: the Deal's own folder when the Deal carries its link, otherwise the Mock Up folder, named as such.
  const folder = workDriveTarget(deal);
  const liveNote = (notesResp?.data || []).filter((n) => n?.Note_Title === LIVE_NOTE_TITLE).sort(newestFirst)[0];
  const noteEdited = noteEditedAfterSave(liveNote, json);
  return {
    cards: cards.sort((a, b) => orderOf(a.name) - orderOf(b.name)),
    info,
    workDrive: folder.href,
    workDriveLabel: folder.label,
    noteEdited: noteEdited ? pcStamp(noteEdited.toISOString()) : "",
    // E-70: what the production flow needs (tasks + who is looking are read after, by loadFlow)
    flow: { entity, recordId, deal, data, notes: notesResp?.data || [] },
  };
}

/* E-70: the Deal, its tasks and notes (fresh), and who is looking. Never fatal: a part that fails comes back empty. */
async function loadFlow(entity, recordId) {
  const soft = (p) => p.then((r) => r).catch(() => null);
  const [rec, tasks, notes, me] = await Promise.all([
    soft(ZOHO.CRM.API.getRecord({ Entity: entity, RecordID: recordId, approved: "both" })),
    soft(ZOHO.CRM.API.getRelatedRecords({ Entity: entity, RecordID: recordId, RelatedList: "Tasks", page: 1, per_page: 200 })),
    soft(ZOHO.CRM.API.getRelatedRecords({ Entity: entity, RecordID: recordId, RelatedList: "Notes", page: 1, per_page: 200 })),
    soft(ZOHO.CRM.CONFIG.getCurrentUser()),
  ]);
  const u = me?.users?.[0] || {};
  return {
    deal: rec?.data?.[0] || null,
    tasks: tasks?.data || [],
    notes: notes?.data || null,
    user: { id: String(u.id || ""), name: String(u.full_name || "") },
  };
}

const CardViewer = () => {
  const [state, setState] = useState({ status: "loading", cards: [], message: "", info: "" });
  const [tab, setTab] = useState(0);
  const [flow, setFlow] = useState(null); // E-70: { entity, recordId, deal, data, tasks, notes, user }
  const frameRef = useRef(null);
  const keepOutsourcedTab = useRef(false); // E-164: once shown, the flow-only Outsourced tab stays for this visit
  const flowOn = PRODUCTION_CONFIG.flowOn === true;
  const refreshFlow = async () => {
    if (!flow) return;
    const f = await loadFlow(flow.entity, flow.recordId);
    setFlow((old) => ({ ...old, ...(f.deal ? { deal: f.deal } : {}), tasks: f.tasks, ...(f.notes ? { notes: f.notes } : {}), user: f.user.id ? f.user : old.user }));
  };

  useEffect(() => {
    if (!ZOHO?.embeddedApp) {
      setState({
        status: "error",
        cards: [],
        message: "This page only works inside Zoho CRM (the widget SDK did not load).",
      });
      return;
    }
    ZOHO.embeddedApp.on("PageLoad", async (data) => {
      try {
        ZOHO.CRM.UI.Resize({ height: "90%", width: "60%" });
      } catch (e) {
        /* resize is cosmetic */
      }
      const entity = data?.Entity;
      const recordId = data?.EntityId?.[0] ?? data?.EntityId;
      try {
        const { cards, info, workDrive, workDriveLabel, noteEdited, flow: base } = await loadCards(entity, recordId);
        setState({ status: "ready", cards, message: "", info, workDrive, workDriveLabel, noteEdited });
        if (PRODUCTION_CONFIG.flowOn === true && base) {
          const f = await loadFlow(entity, recordId);
          setFlow({ ...base, ...(f.deal ? { deal: f.deal } : {}), tasks: f.tasks, ...(f.notes ? { notes: f.notes } : {}), user: f.user });
        }
      } catch (e) {
        setState({ status: "error", cards: [], message: String(e?.message || e) });
      }
    });
    ZOHO.embeddedApp.init();
  }, []);

  /* E-164: an Outsourced tab with only the flow when outsourced work is open but the order has no Outsourced card. */
  const outsourcedCard = DEPARTMENTS.outsourced.card;
  const cards =
    flowOn && flow && (keepOutsourcedTab.current = keepOutsourcedTab.current || needsOutsourcedTab(flow.tasks, PRODUCTION_CONFIG)) &&
    !state.cards.some((c) => c.name === outsourcedCard)
      ? [...state.cards, { name: outsourcedCard, label: "Outsourced", flowOnly: true }]
      : state.cards;
  const current = cards[tab];
  /* E-168: "(past due)" on a tab whose own open tasks are past their due date (Mountain time). */
  const todayMt = new Date().toLocaleDateString("en-CA", { timeZone: "America/Denver" });
  const tabLabel = (c) => {
    const d = flowOn && flow && dueFlagsOn(PRODUCTION_CONFIG) ? flowDeptFor(c.name, PRODUCTION_CONFIG) : null;
    return d && dueStatus(flow.tasks, d.key, todayMt).late.length ? `${c.label} (past due)` : c.label;
  };

  // Grow the frame to the card's full height so the popup scrolls, not the frame.
  const fitFrame = () => {
    const frame = frameRef.current;
    try {
      const doc = frame?.contentDocument;
      if (doc) frame.style.height = `${doc.documentElement.scrollHeight + 8}px`;
    } catch (e) {
      frame.style.height = "80vh";
    }
  };

  const printCard = () => {
    try {
      frameRef.current.contentWindow.focus();
      frameRef.current.contentWindow.print();
    } catch (e) {
      window.alert("Printing was blocked here. Use Download, then print the file.");
    }
  };

  const downloadCard = () => {
    const url = URL.createObjectURL(new Blob([current.html], { type: "text/html" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = current.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  if (state.status === "loading") {
    return (
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, p: 4, bgcolor: "#fff", color: "#1a1a1a", minHeight: "100vh" }}>
        <CircularProgress size={24} />
        <Typography>Loading production cards…</Typography>
      </Box>
    );
  }

  if (state.status === "error") {
    return (
      <Box sx={{ p: 3, bgcolor: "#fff", minHeight: "100vh" }}>
        <Alert severity="error">Couldn't load the production cards: {state.message}</Alert>
      </Box>
    );
  }

  if (!state.cards.length) {
    return (
      <Box sx={{ p: 3, bgcolor: "#fff", minHeight: "100vh" }}>
        <Alert severity="info">
          This deal has no production cards. Cards are created when the Deal Onboarding Form is
          submitted, so online orders and deals onboarded before 2026-08-28 won't have them.
        </Alert>
      </Box>
    );
  }

  // Explicit colours: the app sets no page background, so without these the bar inherits
  // whatever the host paints behind the iframe and the tab labels can become unreadable.
  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100vh", bgcolor: "#fff", color: "#1a1a1a" }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          px: 2,
          borderBottom: 1,
          borderColor: "divider",
          flexWrap: "wrap",
          bgcolor: "#fff",
        }}
      >
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ flexGrow: 1, minHeight: 48 }}
        >
          {cards.map((c) => (
            <Tab key={c.name} label={tabLabel(c)} />
          ))}
        </Tabs>
        {state.workDrive && (
          <Button variant="outlined" size="small" component="a" href={state.workDrive} target="_blank" rel="noopener noreferrer">
            {state.workDriveLabel || "WorkDrive folder"}
          </Button>
        )}
        <Button variant="contained" size="small" onClick={printCard} disabled={!current?.html}>
          Print
        </Button>
        <Button variant="outlined" size="small" onClick={downloadCard} disabled={!current?.html}>
          Download
        </Button>
      </Box>

      {state.info && (
        <Typography sx={{ px: 2, py: 0.5, fontSize: 11, color: "#666", borderBottom: 1, borderColor: "divider" }}>
          {state.info}
        </Typography>
      )}

      {state.noteEdited && (
        <Alert severity="warning" sx={{ borderRadius: 0 }}>
          {NOTE_EDITED_WARNING} (Note last edited {state.noteEdited}.)
        </Alert>
      )}

      {current?.olderCopies > 0 && (
        <Alert severity="warning" sx={{ borderRadius: 0 }}>
          This deal was onboarded more than once, so there are {current.olderCopies} older{" "}
          {current.olderCopies === 1 ? "copy" : "copies"} of this card. Showing the newest.
        </Alert>
      )}

      <Box sx={{ flexGrow: 1, overflow: "auto", background: "#e9eaec" }}>
        {flowOn && flow && current && flowDeptFor(current.name, PRODUCTION_CONFIG) && (
          <ProductionFlow key={"flow-" + current.name} dept={flowDeptFor(current.name, PRODUCTION_CONFIG).key} ctx={flow} refresh={refreshFlow} />
        )}
        {current?.flowOnly ? (
          <Box sx={{ p: 3 }}>
            <Typography variant="body2" color="text.secondary">
              This order has no Outsourced card (its outsourced items are on another card). The outsourced steps are above.
            </Typography>
          </Box>
        ) : current?.error ? (
          <Box sx={{ p: 3 }}>
            <Alert severity="error">
              Couldn't read the {current.label} card: {current.error}
            </Alert>
          </Box>
        ) : (
          <iframe
            key={current.name}
            ref={frameRef}
            title={current.label}
            srcDoc={current.html}
            // No scripts run inside the card. allow-same-origin lets us size and print the frame;
            // allow-modals lets the print dialog open; the two popup flags let the card's own
            // "Open WorkDrive folder" link open a normal new tab (E-53).
            sandbox="allow-same-origin allow-modals allow-popups allow-popups-to-escape-sandbox"
            onLoad={fitFrame}
            style={{ width: "100%", border: 0, display: "block", minHeight: "60vh" }}
          />
        )}
      </Box>
    </Box>
  );
};

export default CardViewer;
