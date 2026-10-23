import React, { useState } from "react";
import { Alert, Autocomplete, Box, Button, TextField, Typography } from "@mui/material";
import { Controller, useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { applyGarmentSplits } from "../garmentSplit";
import { buildBillingLines, itemName, snapshotRate } from "../invoice/billingLines";
import { prepareDraft, sendDraft, draftsOn } from "../invoice/billingDraft";
import { OTHER_CHARGES, chargeLabel, suggestCharges } from "../invoice/otherCharges";
import { screenPrintShortfall } from "../invoice/minimums";

/*
 * E-108 (docs/63): the onboarding form's billing section. "Invoice or Estimate?" and "Paying by card?" (both required), the
 * "Other charges" a rep adds (with suggestions, never added on their own), and a preview of the draft: the lines the form will
 * send, what Zoho adds, and what the rep must add by hand. "Check prices in Books" runs the draft function as a dry run
 * (Deluge docs/43: creates nothing).
 */
const money = (n) => (n == null || n === "" || !Number.isFinite(Number(n)) ? "" : `$${Number(n).toFixed(2)}`);
const firstLine = (s) => String(s || "").split("\n")[0];

const yesNo = (control, name, label, options, helper) => (
  <Controller
    control={control}
    name={name}
    defaultValue=""
    rules={{ validate: (v) => !!v || label }}
    render={({ field, fieldState }) => (
      <Autocomplete
        {...field}
        size="small"
        options={options}
        value={field.value || null}
        onChange={(_, v) => field.onChange(v || "")}
        renderInput={(params) => (
          <TextField
            {...params}
            label={label}
            error={!!fieldState.error}
            helperText={fieldState.error ? "Required" : helper}
            sx={{ mb: "0.8rem", mt: "5px" }}
          />
        )}
      />
    )}
  />
);

function LinesTable({ lines, priced }) {
  if (!lines.length)
    return (
      <Typography variant="body2">
        No lines yet. Add products at the top of the form (Select Product Types): their garments, sizes and graphics fill this list.
      </Typography>
    );
  const cell = { padding: "2px 8px", borderBottom: "1px solid #ddd", verticalAlign: "top", fontSize: "0.85rem" };
  let total = 0;
  return (
    <table style={{ borderCollapse: "collapse", width: "100%", background: "#fff" }}>
      <thead>
        <tr>
          {["SKU", "Item", "Description", "Qty", priced ? "Books price" : "Price list", "Amount"].map((h) => (
            <th key={h} style={{ ...cell, textAlign: "left" }}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {lines.map((l, i) => {
          const rate = l.rate != null ? l.rate : snapshotRate(l.sku);
          const amount = rate != null ? Number(rate) * Number(l.quantity) : null;
          if (amount != null) total += amount;
          return (
            <tr key={i}>
              <td style={cell}>{l.sku}</td>
              <td style={cell}>{itemName(l.sku)}</td>
              <td style={{ ...cell, whiteSpace: "pre-line" }}>{l.description}</td>
              <td style={cell}>{l.quantity}</td>
              <td style={cell}>{money(rate)}</td>
              <td style={cell}>{money(amount)}</td>
            </tr>
          );
        })}
        <tr>
          <td style={cell} colSpan={5}>
            <b>{priced ? "Lines before tax and the fees added on the draft" : "Priced so far (garments get their Books price at Submit, or press Check prices in Books)"}</b>
          </td>
          <td style={cell}>
            <b>{money(total)}</b>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export function HandList({ items }) {
  if (!items || !items.length) return null;
  return (
    <Alert severity="warning" sx={{ mt: 1 }}>
      <b>Add by hand in Books</b> (the form has no Books price for these; nothing was guessed):
      <ul style={{ margin: "4px 0 0", paddingLeft: "1.2rem" }}>
        {items.map((h, i) => (
          <li key={i}>
            {h.what}
            {h.quantity ? ` (${h.quantity})` : ""}: {h.reason}
          </li>
        ))}
      </ul>
    </Alert>
  );
}

export default function BillingSection({ dealId, submittedBy }) {
  const { control, getValues } = useFormContext();
  const { fields, append, remove } = useFieldArray({ control, name: "otherCharges" });
  const watched = useWatch({
    control,
    name: [
      "products",
      "otherCharges",
      "billingDocument",
      "payingByCard",
      "hardDueDate",
      "upchargedForRushTurnaround",
      "addOneWeekToProductionTime",
      "tenFourteenBusinessDayTurnaround",
      "roundUpForCharity",
      "isRepeatOrder",
    ],
  });
  const [products, otherCharges, billingDocument, payingByCard, hardDueDate, rush, oneWeek, tenFourteen, roundUp, isRepeatOrder] = watched;
  const [check, setCheck] = useState(null); // { busy } | { prepared, answer }

  let built = null;
  let suggestions = [];
  let shortfall = null;
  try {
    const data = applyGarmentSplits({
      products,
      otherCharges,
      billingDocument,
      payingByCard,
      hardDueDate,
      upchargedForRushTurnaround: rush,
      addOneWeekToProductionTime: oneWeek,
      tenFourteenBusinessDayTurnaround: tenFourteen,
      roundUpForCharity: roundUp,
      isRepeatOrder,
    });
    built = buildBillingLines(data);
    shortfall = screenPrintShortfall(data);
    suggestions = suggestCharges(data);
  } catch (e) {
    console.log("Invoice preview failed:", e); // a preview must never take the form down
  }

  const runCheck = async () => {
    setCheck({ busy: true });
    try {
      const data = applyGarmentSplits(getValues());
      const prepared = await prepareDraft(data);
      const answer = await sendDraft(dealId, prepared, { submittedBy, dryRun: true });
      setCheck({ prepared, answer });
    } catch (e) {
      setCheck({ answer: { message: "The check failed: " + String((e && e.message) || e) } });
    }
  };

  const zohoAdds = built
    ? [
        built.flags.rush && "Rush: 20% of the lines (PPFEE1)",
        built.flags.extendedTurnaround && "Extended turnaround: minus 5% of the lines (PPETD)",
        built.flags.payingByCard &&
          (built.flags.document === "estimate" ? "Card fee: a 3% line on the estimate (PPFEE6)" : "Card fee: Books adds 3% (PPFEE6) about 30 seconds after the draft is made"),
        built.clientFee.length && "Client-provided garment fee: 10% of the decoration on the client's garments (PPFEE8, worked out at Submit with Books prices)",
      ].filter(Boolean)
    : [];

  return (
    <Box sx={{ mt: 2 }}>
      <Typography sx={{ pt: "1rem", fontSize: "1.2rem", fontWeight: "bold" }}>Invoice</Typography>
      <Typography variant="body2" sx={{ mb: 1 }}>
        On Submit, a draft is made in Books from this order. It is never sent: you check it in Books and send it from there.
      </Typography>
      {yesNo(control, "billingDocument", "Invoice or Estimate?", ["Invoice", "Estimate"], "One per Deal")}
      {yesNo(control, "payingByCard", "Paying by card?", ["Yes", "No"], "Yes adds the 3% card processing fee")}

      <Typography sx={{ fontWeight: "bold", mt: 1 }}>Other charges</Typography>
      <Typography variant="body2" sx={{ mb: 1 }}>
        Setup, digitizing, art time and other fees go on the draft only when you add them here.
      </Typography>
      {fields.map((f, i) => (
        <Box key={f.id} sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
          <Controller
            control={control}
            name={`otherCharges.${i}.sku`}
            defaultValue=""
            render={({ field }) => (
              <Autocomplete
                {...field}
                size="small"
                sx={{ flex: 3 }}
                options={OTHER_CHARGES.map((c) => c.sku)}
                getOptionLabel={(s) => (s ? chargeLabel(s) : "")}
                value={field.value || null}
                onChange={(_, v) => field.onChange(v || "")}
                renderInput={(params) => <TextField {...params} label="Charge" sx={{ mb: "0.6rem" }} />}
              />
            )}
          />
          <Controller
            control={control}
            name={`otherCharges.${i}.quantity`}
            defaultValue=""
            render={({ field }) => <TextField {...field} size="small" type="number" label="Quantity" sx={{ flex: 1, mb: "0.6rem" }} />}
          />
          <Button size="small" onClick={() => remove(i)} sx={{ mt: "4px" }}>
            Remove
          </Button>
        </Box>
      ))}
      <Button size="small" variant="outlined" onClick={() => append({ sku: "", quantity: "1" })}>
        Add a charge
      </Button>
      {suggestions.length > 0 && (
        <Box sx={{ mt: 1 }}>
          <Typography variant="body2">Often added for an order like this (only if it applies):</Typography>
          {suggestions.map((s) => (
            <Box key={s.sku} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Button size="small" onClick={() => append({ sku: s.sku, quantity: String(s.quantity) })}>
                Add
              </Button>
              <Typography variant="body2">
                {chargeLabel(s.sku)} x {s.quantity}: {s.why}
              </Typography>
            </Box>
          ))}
        </Box>
      )}

      {shortfall && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {shortfall.message} The form cannot be submitted until then.
        </Alert>
      )}
      <Typography sx={{ fontWeight: "bold", mt: 2 }}>Draft preview</Typography>
      {!draftsOn() && (
        <Alert severity="info" sx={{ mb: 1 }}>
          Draft invoices are switched off for now: Submit will not make one.
        </Alert>
      )}
      {built ? (
        <>
          <LinesTable lines={check && check.prepared ? check.prepared.lines : built.lines} priced={!!(check && check.prepared)} />
          {zohoAdds.length > 0 && (
            <Typography variant="body2" sx={{ mt: 1 }}>
              Added on the draft: {zohoAdds.join(" · ")}
            </Typography>
          )}
          <HandList items={check && check.prepared ? check.prepared.handList : built.handList} />
        </>
      ) : null}
      <Box sx={{ mt: 1, display: "flex", gap: 1, alignItems: "center" }}>
        <Button size="small" variant="outlined" disabled={!!(check && check.busy) || !dealId} onClick={runCheck}>
          {check && check.busy ? "Checking..." : "Check prices in Books"}
        </Button>
        <Typography variant="body2">Asks Books for today's prices. Creates nothing.</Typography>
      </Box>
      {check && check.answer && <DryRunAnswer answer={check.answer} prepared={check.prepared} />}
    </Box>
  );
}

function DryRunAnswer({ answer, prepared }) {
  const a = answer || {};
  const parts = [
    a.base_total != null && `Lines: ${money(a.base_total)}`,
    Number(a.rush_amount) ? `Rush: ${money(a.rush_amount)}` : "",
    Number(a.etd_amount) ? `Extended turnaround: ${money(a.etd_amount)}` : "",
    Number(a.card_fee_amount) ? `Card fee: ${money(a.card_fee_amount)}` : "",
  ].filter(Boolean);
  const ok = a.result === "dry_run";
  return (
    <Alert severity={ok ? "success" : "info"} sx={{ mt: 1 }}>
      {ok ? "Books would make this draft." : a.message || "No answer from Books."}
      {ok && a.message ? ` ${a.message}` : ""}
      {parts.length > 0 && <div>{parts.join(" · ")} (before tax)</div>}
      {prepared && prepared.lookup && <div>{prepared.lookup}</div>}
      {(a.not_added || []).length > 0 && (
        <div>
          Books would leave off:{" "}
          {a.not_added.map((n) => `${n.sku} x ${n.quantity} (${n.reason})`).join("; ")}
        </div>
      )}
      {(a.notes || []).map((n, i) => (
        <div key={i}>{n}</div>
      ))}
      {prepared && prepared.lines.some((l) => l.sku === "PPFEE8") && (
        <div>Client-provided garment fee: {money(prepared.lines.find((l) => l.sku === "PPFEE8").rate)} ({firstLine(prepared.lines.find((l) => l.sku === "PPFEE8").description)})</div>
      )}
    </Alert>
  );
}
