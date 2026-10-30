/*
^ * ProductionFlowPanel.jsx -- E-70 round 1: the job's flow on a department's card tab (logic: productionFlow.js).
 *
 * Start (count, artwork, tools; screen print: grams of ink mixed) -> actions (missing / damaged garments, Call Client, revisions)
 * -> Close (David's questions, all Yes; screen print: grams left; feedback per task) -> tasks closed -> Quality Check when the
 * last department closes. Each write is the smallest one that does the job; the stage is moved last, with workflow (as the QC form
 * does). Every step leaves a dated "PRODUCTION FLOW" note. `ctx` = { entity, recordId, deal, data, tasks, notes, user } from the
 * card viewer; `refresh()` reloads them after a write.
 * E-164: the Outsourced tab has no start steps -- the Production Manager answers David's two questions and closes the Package task;
 * while the order task is still open it shows "waiting". With the switch on, every tab's close counts the outsourced tasks.
 */
import React, { useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Divider,
  FormControlLabel,
  MenuItem,
  Radio,
  RadioGroup,
  TextField,
  Typography,
} from "@mui/material";
import {
  COUNT_QUESTION_KEYS,
  DEPARTMENTS,
  FLOW_NOTE_TITLE,
  MISSING_REASONS,
  START_STEPS,
  actionNote,
  appendDated,
  closeNote,
  closePlan,
  closeQuestionsFor,
  deptStarted,
  dueFlagsOn,
  dueStatus,
  expectedCountsOn,
  expectedFor,
  flowHistory,
  grams,
  hasStartSteps,
  lateLine,
  missingLine,
  openAfterClose,
  openDeptTasks,
  openOrderTasks,
  orderGarments,
  outsourcedOn,
  ownerOf,
  PRODUCTION_STAGES,
  pantoneFields,
  pantoneSlots,
  pantonesOf,
  reTick,
  startNote,
  taskTitle,
} from "./productionFlow";
import PRODUCTION_CONFIG from "./productionConfig.json";
import GraphicUpload from "./GraphicUploadPanel";
import { deptOfDesignTask, filingOn, uploadsOn } from "./graphicUpload";
import { PROOF_DEPTS, pendingNote, proofNote, proofStatus, proofStepOn, proofWrites } from "./proofs";

const ZOHO = window.ZOHO;
const ok = (r) => r?.data?.[0]?.code === "SUCCESS";
const stamp = () => new Date().toLocaleString("en-US", { timeZone: "America/Denver", dateStyle: "short", timeStyle: "short" });
const ymd = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Denver" });

const YesNo = ({ value, onChange, disabled }) => (
  <RadioGroup row value={value || ""} onChange={(e) => onChange(e.target.value)}>
    <FormControlLabel value="yes" control={<Radio size="small" />} label="Yes" disabled={disabled} />
    <FormControlLabel value="no" control={<Radio size="small" />} label="No" disabled={disabled} />
  </RadioGroup>
);

const Section = ({ title, children }) => (
  <Box sx={{ mt: 2 }}>
    <Typography fontWeight="bold" sx={{ mb: 0.5 }}>
      {title}
    </Typography>
    {children}
  </Box>
);

/* E-166: "Expected: 48 pieces" next to a count question; a click shows garment / color / sizes (David: "the total, and make it
   clickable to drop down variables"). Plain text, display only. */
const ExpectedCount = ({ expected }) => {
  const [open, setOpen] = useState(false);
  if (!expected || !expected.items.length) return null;
  const sheets = expected.items.filter((i) => i.unit === "sheets").reduce((s, i) => s + i.count, 0);
  const label =
    `Expected: ${expected.total} piece${expected.total === 1 ? "" : "s"}` + (sheets ? `, ${sheets} gang sheet${sheets === 1 ? "" : "s"}` : "");
  return (
    <Box sx={{ mb: 0.5 }}>
      <Button size="small" variant="text" onClick={() => setOpen(!open)} sx={{ textTransform: "none", p: 0, minWidth: 0 }}>
        {label} ({open ? "hide" : "show sizes and colors"})
      </Button>
      {open && (
        <Box sx={{ pl: 1.5, borderLeft: "2px solid #ddd", mt: 0.5 }}>
          {expected.items.map((it, i) => (
            <Box key={i} sx={{ mb: 0.5 }}>
              <Typography variant="body2" fontWeight="bold">
                {it.item}: {it.count} {it.unit}
              </Typography>
              {it.colors.map((c) => (
                <Typography key={c.color} variant="body2" sx={{ pl: 1 }}>
                  {c.color}: {c.sizes.map((s) => `${s.count} ${s.size}`).join(", ")} ({c.count})
                </Typography>
              ))}
              {it.typed && (
                <Typography variant="body2" color="text.secondary" sx={{ pl: 1, whiteSpace: "pre-line" }}>
                  As typed on the order: {it.typed}
                </Typography>
              )}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
};

const inkRow = (r, i, list, setList, word, busy) => (
  <Box key={r.code} sx={{ display: "flex", gap: 1, alignItems: "center", mb: 1 }}>
    <Typography sx={{ minWidth: 150 }}>Pantone {r.code}</Typography>
    <TextField
      size="small"
      label={`Grams ${word}`}
      value={list[i] || ""}
      onChange={(e) => setList(list.map((v, j) => (j === i ? e.target.value : v)))}
      error={!!list[i] && grams(list[i]) == null}
      sx={{ width: 150 }}
      InputProps={{ endAdornment: <span>g</span> }}
      disabled={!!busy}
    />
    {!r.slot && <Typography variant="body2" color="text.secondary">No free PANTONE slot on the Deal: recorded on the note only.</Typography>}
  </Box>
);

/* One "close" block: the tasks to tick, the questions (all Yes), grams left (screen print), feedback; then the tasks closed, the note,
   and the stage moved last. The Outsourced tab shows it twice: step "order" and step "package" (E-164). */
const CloseTask = ({ dept, step, title, list, tasks, deal, rows, withOutsourced, busy, run, write, note, who, userId, expected, notes, proofsLeft, closeExtras }) => {
  const d = DEPARTMENTS[dept];
  const [sendAnyway, setSendAnyway] = useState(false); // E-176: past other departments' open production tasks
  const [answers, setAnswers] = useState({});
  const [inkLeft, setInkLeft] = useState(() => rows.map((r) => (r.left != null ? String(r.left) : "")));
  const [mineOnly, setMineOnly] = useState(true);
  const [closing, setClosing] = useState([]);
  const [feedback, setFeedback] = useState({});
  const mine = list.filter((t) => ownerOf(t).id && ownerOf(t).id === userId);
  const shown = mineOnly && mine.length ? mine : list;
  const plan = closePlan({ dept, step, tasks, closing, answers, rows, inkLeft, stage: deal.Stage, withOutsourced, notes, proofsLeft, sendAnyway: closeExtras && sendAnyway });
  /* E-176: "Send to Quality Check anyway" is offered when only other departments' production tasks keep the Deal from moving. */
  const canSendAnyway =
    closeExtras && step !== "order" && dept !== "graphicdesign" && plan.stillOpen.length > 0 && PRODUCTION_STAGES.includes(String(deal.Stage || ""));
  const doClose = () =>
    run("Closing the task(s)", async () => {
      const openAfter = closeExtras ? openAfterClose(tasks, plan.close) : [];
      if (Object.keys(plan.fields).length) await write(plan.fields, false);
      for (const id of plan.close) {
        const r = await ZOHO.CRM.API.updateRecord({ Entity: "Tasks", APIData: { id, Status: "Completed" }, Trigger: plan.workflowOnClose ? ["workflow"] : [] });
        if (!ok(r)) throw new Error("task " + id + ": " + JSON.stringify(r?.data?.[0] || r));
      }
      await note(closeNote({ dept, step, who, when: stamp(), tasks, closing: plan.close, answers, rows, inkLeft, feedback, stage: plan.stage, forced: plan.forced, openAfter }));
      if (plan.stage.move) await write({ Stage: plan.stage.to }, true);
      setClosing([]);
      setAnswers({});
      setSendAnyway(false);
      if (closeExtras && plan.stage.move) {
        const lead = plan.forced.length
          ? `${plan.close.length} task(s) closed. Sent to Quality Check with ${plan.forced.length} production task(s) still open: ${plan.forced.map(taskTitle).join("; ")}.`
          : `${plan.close.length} task(s) closed. That was the last production task in the run: the Deal is going to Quality Check.`;
        const left = openAfter.filter((t) => !plan.forced.some((f) => f.id === t.id));
        return lead + (left.length ? `\nStill open on the Deal (not closed): ${left.map((t) => taskTitle(t) + (ownerOf(t).name ? " - " + ownerOf(t).name : "")).join("; ")}.` : "");
      }
      if (plan.workflowOnClose)
        return `${plan.close.length} order task(s) closed. Zoho makes the Package Outsourced Products task in a few seconds; reopen the cards if it does not show yet.`;
      return `${plan.close.length} task(s) closed.` + (plan.stage.move ? " Every production task is done: the Deal moved to Quality Check." : ` ${plan.stage.reason}.`);
    });

  return (
    <Section title={title}>
      {mine.length > 0 && mine.length < list.length && (
        <FormControlLabel control={<Checkbox size="small" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />} label="Only my tasks" />
      )}
      {shown.map((t) => (
        <Box key={t.id} sx={{ mb: 1 }}>
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={closing.includes(t.id)}
                disabled={!!busy}
                onChange={(e) => setClosing(e.target.checked ? [...closing, t.id] : closing.filter((x) => x !== t.id))}
              />
            }
            label={`${taskTitle(t)}${ownerOf(t).name ? " - " + ownerOf(t).name : ""}${t.Due_Date ? " - due " + t.Due_Date : ""}`}
          />
          {closing.includes(t.id) && (
            <TextField
              size="small"
              fullWidth
              label="Feedback on this job (optional): anything to watch for next time"
              value={feedback[t.id] || ""}
              onChange={(e) => setFeedback({ ...feedback, [t.id]: e.target.value })}
              sx={{ ml: 4, maxWidth: "calc(100% - 32px)" }}
            />
          )}
        </Box>
      ))}
      <Divider sx={{ my: 1 }} />
      {closeQuestionsFor(dept, step).map((q) => (
        <Box key={q.key}>
          <Typography variant="body2">{q.question}</Typography>
          {COUNT_QUESTION_KEYS.includes(q.key) && <ExpectedCount expected={expected} />}
          <YesNo value={answers[q.key]} disabled={!!busy} onChange={(v) => setAnswers({ ...answers, [q.key]: v })} />
          {answers[q.key] === "no" && <Alert severity="warning" sx={{ mb: 1 }}>Please ensure that step is completed before closing the task.</Alert>}
        </Box>
      ))}
      {d.inks && rows.length > 0 && (
        <Box sx={{ mt: 1 }}>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Ink left over (grams), per Pantone:
          </Typography>
          {rows.map((r, i) => inkRow(r, i, inkLeft, setInkLeft, "left", busy))}
        </Box>
      )}
      {canSendAnyway && (
        <Box sx={{ mt: 1, p: 1, border: "1px solid #f0c36d", bgcolor: "#fffaf0" }}>
          <Typography variant="body2">
            Other production task(s) still open on this Deal: {plan.stillOpen.map((t) => taskTitle(t) + (ownerOf(t).name ? " - " + ownerOf(t).name : "")).join("; ")}.
            The Deal waits for them before Quality Check.
          </Typography>
          <FormControlLabel
            control={<Checkbox size="small" checked={sendAnyway} disabled={!!busy} onChange={(e) => setSendAnyway(e.target.checked)} />}
            label="Send to Quality Check anyway (those tasks stay open and are listed on the Deal)"
          />
        </Box>
      )}
      <Button variant="contained" size="small" disabled={!!plan.problems.length || !!busy} onClick={doClose} sx={{ mt: 1 }}>
        Close {closing.length > 1 ? `${closing.length} tasks` : "task"}
      </Button>
      {plan.problems.length > 0 && closing.length > 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Before closing: {plan.problems.join(" · ")}
        </Typography>
      )}
      {closing.length > 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {plan.stage.move && plan.forced.length
            ? "Closing this sends the Deal to Quality Check now, with the other production task(s) still open."
            : plan.stage.move && closeExtras
            ? "This is the last production task in the run: closing it sends the Deal to Quality Check."
            : plan.stage.move ? "Closing this finishes production: the Deal will move to Quality Check." : step === "order" ? "Closing the order makes the Package Outsourced Products task (the Deal stays where it is)." : `The Deal stays where it is (${plan.stage.reason}).`}
        </Typography>
      )}
    </Section>
  );
};

/* E-174: the test garment (proof print) step -- one approval per garment on this card; the last one on the order moves the Deal. */
const ProofStep = ({ dept, proof, busy, run, write, note, who, deal, data, notes }) => {
  const [ticked, setTicked] = useState([]);
  const label = DEPARTMENTS[dept].label;
  const doApprove = () =>
    run("Recording the approved test garment", async () => {
      const labels = proof.items.filter((it) => ticked.includes(it.key)).map((it) => it.label);
      const content = proofNote({ dept, who, when: stamp(), labels });
      const after = proofWrites({ deal, data, notes: [...(notes || []), pendingNote(content)], dept });
      await note(content);
      if (Object.keys(after.fields).length) await write(after.fields, false);
      if (after.stage.move) await write({ Stage: after.stage.to }, true);
      setTicked([]);
      return (
        `Test garment approved: ${labels.join("; ")}.` +
        (after.deptDone ? ` Every ${label} proof is approved: you can close the task when the job is done.` : "") +
        (after.stage.move ? " Every proof on the order is approved: the Deal moved to Test Garment Approved." : after.allDone ? ` (${after.stage.reason}.)` : after.deptDone ? ` The Deal moves to Test Garment Approved once ${after.stage.reason.replace(/^waiting for /, "")} are approved.` : "")
      );
    });
  return (
    <Section title="Test garment (proof print)">
      <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
        Print one of each garment with all its graphics and check it against the mock-up, the notes and the original art. Approve each one
        when it passes. Closing the task waits for these.
      </Typography>
      {proof.items.map((it) =>
        it.approved ? (
          <Typography key={it.key} variant="body2" sx={{ pl: 1, py: 0.25 }}>
            <b>Approved</b> - {it.label} <span style={{ color: "#666" }}>({[it.approved.who, it.approved.when].filter(Boolean).join(", ")})</span>
          </Typography>
        ) : (
          <FormControlLabel
            key={it.key}
            sx={{ display: "flex" }}
            control={
              <Checkbox size="small" checked={ticked.includes(it.key)} disabled={!!busy} onChange={(e) => setTicked(e.target.checked ? [...ticked, it.key] : ticked.filter((k) => k !== it.key))} />
            }
            label={it.label}
          />
        )
      )}
      {proof.left.length > 0 && (
        <Button variant="contained" size="small" disabled={!ticked.length || !!busy} onClick={doApprove} sx={{ mt: 0.5 }}>
          Test garment approved{ticked.length > 1 ? ` (${ticked.length})` : ""}
        </Button>
      )}
      {proof.done && <Alert severity="success" sx={{ mt: 0.5 }}>Every {label} proof is approved.</Alert>}
    </Section>
  );
};

/* E-176: the card's flow stays visible -- what was done so far on this tab, oldest first. */
const History = ({ entries }) => (
  <Section title="Done so far on this card">
    {entries.map((e, i) => (
      <Box key={i} sx={{ pl: 1, mb: 0.5, borderLeft: "2px solid #ddd" }}>
        <Typography variant="body2" fontWeight="bold">
          {e.head}
        </Typography>
        {e.lines
          .filter((l) => !/\? (Yes|No|-)$/.test(l))
          .slice(0, 6)
          .map((l, j) => (
            <Typography key={j} variant="body2" color="text.secondary" sx={{ pl: 1 }}>
              {l}
            </Typography>
          ))}
      </Box>
    ))}
  </Section>
);

const ProductionFlow = ({ dept, ctx, refresh, onRevision }) => {
  const d = DEPARTMENTS[dept];
  const { entity, recordId, deal = {}, data, tasks = [], notes = [], user = {} } = ctx || {};
  const myTasks = useMemo(() => openDeptTasks(tasks, dept), [tasks, dept]);
  const hasStart = hasStartSteps(dept);
  const withOutsourced = outsourcedOn(PRODUCTION_CONFIG);
  const started = useMemo(() => !hasStart || deptStarted(notes, dept), [hasStart, notes, dept]);
  const orderOpen = useMemo(() => (dept === "outsourced" ? openOrderTasks(tasks) : []), [dept, tasks]);
  const rows = useMemo(() => (d.inks ? pantoneSlots(deal, pantonesOf(data)) : []), [d.inks, deal, data]);
  const garments = useMemo(() => orderGarments(data), [data]);
  const expected = useMemo(() => (expectedCountsOn(PRODUCTION_CONFIG) ? expectedFor(data, dept) : null), [data, dept]);
  const due = useMemo(() => (dueFlagsOn(PRODUCTION_CONFIG) ? dueStatus(tasks, dept, ymd()) : null), [tasks, dept]);
  /* E-174 / E-176 (switch proofStepOn): the proof step, Close waiting for it, the last-task notice, send anyway, the history. */
  const proofsOn = proofStepOn(PRODUCTION_CONFIG);
  const proof = useMemo(() => (proofsOn && PROOF_DEPTS.includes(dept) ? proofStatus(data, notes, dept) : null), [proofsOn, data, notes, dept]);
  const history = useMemo(() => (proofsOn ? flowHistory(notes, dept) : []), [proofsOn, notes, dept]);

  const [start, setStart] = useState({});
  const [inkMixed, setInkMixed] = useState(() => rows.map((r) => (r.mixed != null ? String(r.mixed) : "")));
  const [missing, setMissing] = useState(null); // the open "missing garments" form
  const [callNotes, setCallNotes] = useState(null); // the open Call Client form
  const [busy, setBusy] = useState("");
  const [result, setResult] = useState(null); // { severity, text }

  const who = user.name || "";

  const write = async (fields, workflow) => {
    const r = await ZOHO.CRM.API.updateRecord({ Entity: entity, APIData: { id: recordId, ...fields }, Trigger: workflow ? ["workflow"] : [] });
    if (!ok(r)) throw new Error(JSON.stringify(r?.data?.[0] || r));
  };
  const note = async (content) => {
    const r = await ZOHO.CRM.API.addNotes({ Entity: entity, RecordID: recordId, Title: FLOW_NOTE_TITLE, Content: content });
    if (!ok(r)) throw new Error("note: " + JSON.stringify(r?.data?.[0] || r));
  };
  const run = async (label, fn) => {
    setBusy(label);
    setResult(null);
    try {
      const text = await fn();
      setResult({ severity: "success", text });
      if (refresh) await refresh();
    } catch (e) {
      setResult({ severity: "error", text: `${label} did not finish: ${String(e?.message || e)}. Nothing after that step was saved.` });
    }
    setBusy("");
  };

  /* ---------- start ---------- */
  const stopStep = START_STEPS.find((s) => start[s.key] === "no");
  const startReady = START_STEPS.every((s) => start[s.key] === "yes") && (!d.inks || rows.every((r, i) => grams(inkMixed[i]) != null));
  const artworkOk = started || start.artwork === "yes";
  const doStart = () =>
    run("Starting the job", async () => {
      const fields = { ...(deal.Garments_Received ? {} : { Garments_Received: true }), ...(d.inks ? pantoneFields(rows, "Mixed", inkMixed) : {}) };
      if (Object.keys(fields).length) await write(fields, false);
      await note(startNote({ dept, who, when: stamp(), answers: start, rows, inkMixed }));
      return `${d.label} job started.${deal.Garments_Received ? "" : " Garments Received ticked."}${d.inks && rows.length ? " Ink mixed recorded." : ""}`;
    });

  /* ---------- actions ---------- */
  const missingRows = missing && garments[missing.g] ? garments[missing.g].rows : [];
  const colors = [...new Set(missingRows.map((r) => r.color).filter(Boolean))];
  const sizes = [...new Set(missingRows.filter((r) => !missing?.color || r.color === missing.color).map((r) => r.size).filter(Boolean))];
  const missingReady = missing && garments[missing.g] && Number(missing.quantity) > 0 && missing.reason;
  const doMissing = () =>
    run("Recording missing garments", async () => {
      const line = missingLine({ ...missing, garment: garments[missing.g].garment, who, date: ymd() });
      await write({ Missing_Garments: appendDated(deal.Missing_Garments, line) }, false);
      for (const w of reTick("Reorder_Needed", deal.Reorder_Needed === true)) await write(w.fields, w.workflow);
      await note(actionNote(dept, stamp(), who, "Missing / damaged garments (Reorder Needed ticked): " + line));
      setMissing(null);
      return "Missing Garments updated and Reorder Needed ticked: the Account Manager gets a reorder task.";
    });
  const doCall = () =>
    run("Flagging Call Client", async () => {
      const line = `[${ymd()}${who ? " " + who : ""}] ${callNotes.trim()}`;
      await write({ Call_Client_Notes: appendDated(deal.Call_Client_Notes, line) }, false);
      for (const w of reTick("Call_Client", deal.Call_Client === true)) await write(w.fields, w.workflow);
      await note(actionNote(dept, stamp(), who, "Call Client: " + callNotes.trim()));
      setCallNotes(null);
      return "Call Client flagged: the Sales Person gets a \"Call Client\" task with your notes on the Deal.";
    });

  const common = {
    dept, tasks, deal, rows, withOutsourced, busy, run, write, note, who, userId: user.id, expected, notes,
    proofsLeft: proof && proof.items.length ? proof.left : [],
    closeExtras: proofsOn,
  };

  return (
    <Box sx={{ p: 2, bgcolor: "#fff", borderBottom: 2, borderColor: "#1a1a1a" }}>
      <Typography variant="h6" fontWeight="bold">
        {d.label} production flow
      </Typography>
      {due && due.late.length > 0 && (
        <Alert severity="error" sx={{ mt: 1 }}>
          Past due: {due.late.map(lateLine).join("; ")}
        </Alert>
      )}
      {due && due.today.length > 0 && (
        <Alert severity="warning" sx={{ mt: 1 }}>
          Due today: {due.today.map((x) => taskTitle(x.task)).join("; ")}
        </Alert>
      )}
      {!myTasks.length && !orderOpen.length && (
        <Alert severity="info" sx={{ mt: 1 }}>
          No open {dept === "outsourced" ? "outsourced (order or packing)" : dept === "graphicdesign" ? "Graphic Design" : d.label + " production"} task on this Deal. You can still report
          missing garments or flag Call Client below.
        </Alert>
      )}

      {/* 1. START */}
      {hasStart && !started && myTasks.length > 0 && (
        <Section title="Start the job">
          {START_STEPS.map((s, i) => {
            const before = START_STEPS.slice(0, i).every((p) => start[p.key] === "yes");
            return (
              <Box key={s.key} sx={{ opacity: before ? 1 : 0.4 }}>
                <Typography variant="body2">
                  {i + 1}. {s.question}
                </Typography>
                {COUNT_QUESTION_KEYS.includes(s.key) && <ExpectedCount expected={expected} />}
                <YesNo value={start[s.key]} disabled={!before || !!busy} onChange={(v) => setStart({ ...start, [s.key]: v })} />
                {start[s.key] === "no" && <Alert severity="error" sx={{ mb: 1 }}>{s.stop}</Alert>}
              </Box>
            );
          })}
          {d.inks && rows.length > 0 && !stopStep && START_STEPS.every((s) => start[s.key] === "yes") && (
            <Box sx={{ mt: 1 }}>
              <Typography variant="body2" sx={{ mb: 1 }}>
                4. Ink mixed for this job (grams), per Pantone:
              </Typography>
              {rows.map((r, i) => inkRow(r, i, inkMixed, setInkMixed, "mixed", busy))}
            </Box>
          )}
          <Button variant="contained" size="small" disabled={!startReady || !!busy} onClick={doStart} sx={{ mt: 1 }}>
            Start the job
          </Button>
        </Section>
      )}
      {hasStart && started && myTasks.length > 0 && <Alert severity="success" sx={{ mt: 1 }}>Job started (count, artwork and tools checked).</Alert>}

      {/* E-174: 2. TEST GARMENT (proof print), after Start, before Close */}
      {proof && proof.items.length > 0 && started && myTasks.length > 0 && (
        <ProofStep dept={dept} proof={proof} busy={busy} run={run} write={write} note={note} who={who} deal={deal} data={data} notes={notes} />
      )}

      {/* E-162: the upload step (Graphic Design tab) */}
      {dept === "graphicdesign" && (
        <GraphicUpload
          entity={entity}
          recordId={recordId}
          deal={deal}
          data={data}
          who={who}
          notes={notes}
          defaultDept={myTasks.map((t) => deptOfDesignTask(t.Subject)).find(Boolean) || ""}
          uploadsOn={uploadsOn(PRODUCTION_CONFIG)}
          startFiling={filingOn(PRODUCTION_CONFIG)}
          alsoOn={PRODUCTION_CONFIG.gdAlsoUsedByOn === true}
          otherOn={PRODUCTION_CONFIG.otherFormatTypedOn === true}
          refresh={refresh}
        />
      )}

      {/* 2. ACTIONS */}
      {artworkOk && (
        <Section title="If something comes up">
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            <Button variant="outlined" size="small" disabled={!!busy || !garments.length} onClick={() => setMissing({ g: 0, quantity: "1" })}>
              Missing or damaged garments
            </Button>
            <Button variant="outlined" size="small" disabled={!!busy} onClick={() => setCallNotes("")}>
              Call Client
            </Button>
          </Box>
          {onRevision ? (
            /* E-175 (David 10-30): the Revision / Correction button under the other two, in job order. */
            <Box sx={{ mt: 1 }}>
              <Button variant="outlined" size="small" color="warning" disabled={!!busy} onClick={onRevision}>
                Order Revision / Correction
              </Button>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Something printed wrong that must be redone: opens the revision / correction form for this Deal.
              </Typography>
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {PRODUCTION_CONFIG.revisionInCardsOn === true
                ? "Something printed wrong that must be redone: use the Revision / Correction button at the top of the cards."
                : "Something printed wrong that must be redone: close this window and use the Revision / Correction button on the Deal."}
            </Typography>
          )}
          {missing && (
            <Box sx={{ mt: 1, p: 1.5, border: "1px solid #ddd", display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
              <TextField select size="small" label="Garment" value={missing.g} onChange={(e) => setMissing({ ...missing, g: Number(e.target.value), color: "", size: "" })} sx={{ minWidth: 220 }}>
                {garments.map((g, i) => (
                  <MenuItem key={i} value={i}>
                    {g.garment}
                  </MenuItem>
                ))}
              </TextField>
              <TextField select size="small" label="Color" value={missing.color || ""} onChange={(e) => setMissing({ ...missing, color: e.target.value, size: "" })} sx={{ minWidth: 120 }}>
                {colors.map((c) => (
                  <MenuItem key={c} value={c}>
                    {c}
                  </MenuItem>
                ))}
              </TextField>
              <TextField select size="small" label="Size" value={missing.size || ""} onChange={(e) => setMissing({ ...missing, size: e.target.value })} sx={{ minWidth: 90 }}>
                {sizes.map((s) => (
                  <MenuItem key={s} value={s}>
                    {s}
                  </MenuItem>
                ))}
              </TextField>
              <TextField size="small" label="How many" type="number" value={missing.quantity} onChange={(e) => setMissing({ ...missing, quantity: e.target.value })} sx={{ width: 100 }} />
              <TextField select size="small" label="Why" value={missing.reason || ""} onChange={(e) => setMissing({ ...missing, reason: e.target.value })} sx={{ minWidth: 230 }}>
                {MISSING_REASONS.map((r) => (
                  <MenuItem key={r} value={r}>
                    {r}
                  </MenuItem>
                ))}
              </TextField>
              <TextField size="small" label="Note (optional)" value={missing.note || ""} onChange={(e) => setMissing({ ...missing, note: e.target.value })} sx={{ flexGrow: 1 }} />
              <Button variant="contained" size="small" disabled={!missingReady || !!busy} onClick={doMissing}>
                Record and ask for a reorder
              </Button>
              <Button size="small" onClick={() => setMissing(null)}>
                Cancel
              </Button>
            </Box>
          )}
          {callNotes != null && (
            <Box sx={{ mt: 1, p: 1.5, border: "1px solid #ddd" }}>
              <TextField
                multiline
                minRows={2}
                fullWidth
                size="small"
                label="What does the sales person need to ask or tell the client?"
                value={callNotes}
                onChange={(e) => setCallNotes(e.target.value)}
              />
              <Box sx={{ mt: 1, display: "flex", gap: 1 }}>
                <Button variant="contained" size="small" disabled={!callNotes.trim() || !!busy} onClick={doCall}>
                  Flag Call Client
                </Button>
                <Button size="small" onClick={() => setCallNotes(null)}>
                  Cancel
                </Button>
              </Box>
            </Box>
          )}
        </Section>
      )}

      {/* 3. CLOSE */}
      {dept !== "outsourced" && started && myTasks.length > 0 && <CloseTask key="work" step="work" title="Close task" list={myTasks} {...common} />}
      {dept === "outsourced" && orderOpen.length > 0 && (
        <CloseTask key="order" step="order" title="1. Order: close the order task" list={orderOpen} {...common} />
      )}
      {dept === "outsourced" && myTasks.length > 0 && (
        <CloseTask key="package" step="package" title="2. Package: close the packing task" list={myTasks} {...common} />
      )}
      {dept === "outsourced" && !myTasks.length && orderOpen.length > 0 && (
        <Alert severity="info" sx={{ mt: 2 }}>
          2. Package: the Package Outsourced Products task appears here once the order task is closed.
        </Alert>
      )}

      {busy && (
        <Box sx={{ display: "flex", gap: 1, alignItems: "center", mt: 1 }}>
          <CircularProgress size={16} /> <Typography variant="body2">{busy}…</Typography>
        </Box>
      )}
      {/* E-176: the flow stays visible after Close */}
      {history.length > 0 && <History entries={history} />}

      {result && (
        <Alert severity={result.severity} sx={{ mt: 1, whiteSpace: "pre-line" }}>
          {result.text}
        </Alert>
      )}
    </Box>
  );
};

export default ProductionFlow;
