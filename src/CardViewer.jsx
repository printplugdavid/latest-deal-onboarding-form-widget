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
 * Read path is the one the revision form already uses in production (payload.js):
 *   getRelatedRecords(Attachments) -> getFile({ id: $file_id }) -> blob.text()
 * TRAP: getFile needs "$file_id", NOT the attachment record id. The record id returns an empty
 * Blob and throws nothing, so an empty result is treated as a read failure, not an empty card.
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

const ZOHO = window.ZOHO;

// Tab order and labels, keyed by the filenames buildProductionCards() writes in App.jsx.
const CARD_ORDER = [
  ["production-card-screenprint.html", "Screen Print"],
  ["production-card-embroidery.html", "Embroidery"],
  ["production-card-vinyl.html", "Vinyl"],
  ["production-card-outsourced.html", "Outsourced"],
  ["production-card-graphicdesign.html", "Graphic Design"],
  ["production-card-storefront.html", "Storefront"],
];
const labelFor = (name) =>
  (CARD_ORDER.find(([file]) => file === name) || [])[1] ||
  name.replace(/^production-card-/, "").replace(/\.html$/i, "");
const orderOf = (name) => {
  const i = CARD_ORDER.findIndex(([file]) => file === name);
  return i === -1 ? CARD_ORDER.length : i;
};

const newestFirst = (a, b) =>
  new Date(b?.Created_Time || 0) - new Date(a?.Created_Time || 0);

async function loadCards(entity, recordId) {
  const resp = await ZOHO.CRM.API.getRelatedRecords({
    Entity: entity,
    RecordID: recordId,
    RelatedList: "Attachments",
    page: 1,
    per_page: 200,
  });
  const attachments = (resp?.data || [])
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
    if (!byName.has(name)) byName.set(name, { attachment: a, olderCopies: 0 });
    else byName.get(name).olderCopies += 1;
  }

  const cards = await Promise.all(
    [...byName.entries()].map(async ([name, { attachment, olderCopies }]) => {
      try {
        const fileId = attachment["$file_id"];
        if (!fileId) throw new Error("attachment has no $file_id");
        const blob = await ZOHO.CRM.API.getFile({ id: fileId });
        const html = blob && typeof blob.text === "function" ? await blob.text() : "";
        if (!html || !html.trim()) throw new Error("Zoho returned an empty file");
        return { name, label: labelFor(name), html, olderCopies, created: attachment.Created_Time };
      } catch (e) {
        return { name, label: labelFor(name), error: String(e?.message || e), olderCopies };
      }
    })
  );
  return cards.sort((a, b) => orderOf(a.name) - orderOf(b.name));
}

const CardViewer = () => {
  const [state, setState] = useState({ status: "loading", cards: [], message: "" });
  const [tab, setTab] = useState(0);
  const frameRef = useRef(null);

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
        const cards = await loadCards(entity, recordId);
        setState({ status: "ready", cards, message: "" });
      } catch (e) {
        setState({ status: "error", cards: [], message: String(e?.message || e) });
      }
    });
    ZOHO.embeddedApp.init();
  }, []);

  const current = state.cards[tab];

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
          {state.cards.map((c) => (
            <Tab key={c.name} label={c.label} />
          ))}
        </Tabs>
        <Button variant="contained" size="small" onClick={printCard} disabled={!current?.html}>
          Print
        </Button>
        <Button variant="outlined" size="small" onClick={downloadCard} disabled={!current?.html}>
          Download
        </Button>
      </Box>

      {current?.olderCopies > 0 && (
        <Alert severity="warning" sx={{ borderRadius: 0 }}>
          This deal was onboarded more than once, so there are {current.olderCopies} older{" "}
          {current.olderCopies === 1 ? "copy" : "copies"} of this card. Showing the newest.
        </Alert>
      )}

      <Box sx={{ flexGrow: 1, overflow: "auto", background: "#e9eaec" }}>
        {current?.error ? (
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
            // allow-modals lets the print dialog open.
            sandbox="allow-same-origin allow-modals"
            onLoad={fitFrame}
            style={{ width: "100%", border: 0, display: "block", minHeight: "60vh" }}
          />
        )}
      </Box>
    </Box>
  );
};

export default CardViewer;
