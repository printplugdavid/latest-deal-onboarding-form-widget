/*
 * ATTACHMENT READ PROBE  --  throwaway diagnostic, not the revision form.
 *
 * Purpose: find out whether the Zoho embedded-app JS SDK can read the CONTENTS
 * of a Deal attachment (the onboarding payload JSON) from inside the widget
 * iframe. Metadata access is already known to work; reading the bytes is the
 * open question the revision form depends on.
 *
 * This deliberately DISCOVERS rather than assumes: it enumerates what the SDK
 * actually exposes, lists every attachment it finds, and only calls methods
 * that exist. Results render on the page, so there is no need to open devtools
 * inside the Zoho iframe.
 *
 * The onboarding form lives on main and is untouched by this branch.
 */
import { useEffect, useState } from "react";

const ZOHO = window.ZOHO;

function preview(value, max = 1200) {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "string") {
    return value.length > max
      ? value.slice(0, max) + "\n… (" + value.length + " chars total)"
      : value;
  }
  try {
    const s = JSON.stringify(value, null, 2);
    if (s === undefined) return String(value);
    return s.length > max ? s.slice(0, max) + "\n… (" + s.length + " chars total)" : s;
  } catch (e) {
    return String(value);
  }
}

export default function App() {
  const [entries, setEntries] = useState([]);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const add = (label, value, kind) =>
      setEntries((prev) => [...prev, { label: label, value: preview(value), kind: kind || "info" }]);

    if (!ZOHO || !ZOHO.embeddedApp) {
      add(
        "FATAL",
        "window.ZOHO.embeddedApp is not present. This page is not running inside a Zoho widget iframe.",
        "bad"
      );
      setDone(true);
      return;
    }

    ZOHO.embeddedApp.on("PageLoad", async (data) => {
      try {
        ZOHO.CRM.UI.Resize({ height: "90%", width: "70%" });
      } catch (e) {
        /* resize is cosmetic; ignore if unavailable */
      }

      const entity = data && data.Entity;
      const recordId = data && data.EntityId && data.EntityId[0];
      add("PageLoad data", data);
      add("Entity / RecordID", String(entity) + " / " + String(recordId));

      // ---- 1. What does this SDK build actually expose? -------------------
      const surface = {};
      const groups = ["API", "CONNECTION", "UI", "FUNCTIONS", "CONFIG"];
      for (let i = 0; i < groups.length; i++) {
        const key = groups[i];
        const obj = ZOHO && ZOHO.CRM ? ZOHO.CRM[key] : null;
        surface[key] = obj ? Object.keys(obj) : "(absent)";
      }
      add("ZOHO.CRM surface", surface);

      if (!entity || !recordId) {
        add("STOP", "No Entity/RecordID from PageLoad — open this widget from a Deal record.", "bad");
        setDone(true);
        return;
      }

      // ---- 2. Attachment metadata (known to work) -------------------------
      let attachments = [];
      try {
        const resp = await ZOHO.CRM.API.getRelatedRecords({
          Entity: entity,
          RecordID: recordId,
          RelatedList: "Attachments",
          page: 1,
          per_page: 200,
        });
        attachments = (resp && resp.data) || [];
        add(
          "Attachments found: " + attachments.length,
          attachments.map(function (a) {
            return {
              id: a && a.id,
              File_Name: a && a.File_Name,
              Size: a && a.Size,
              Created_Time: a && a.Created_Time,
            };
          }),
          attachments.length ? "ok" : "bad"
        );
      } catch (err) {
        add("getRelatedRecords FAILED", (err && err.message) || err, "bad");
      }

      // Pick the newest .json attachment rather than assuming a filename.
      const jsonFiles = attachments
        .filter(function (a) {
          return String((a && a.File_Name) || "")
            .toLowerCase()
            .endsWith(".json");
        })
        .sort(function (a, b) {
          return new Date((b && b.Created_Time) || 0) - new Date((a && a.Created_Time) || 0);
        });

      if (!jsonFiles.length) {
        add("STOP", "No .json attachment on this record. Open a deal that has a payload attached.", "bad");
        setDone(true);
        return;
      }

      const target = jsonFiles[0];
      add("Target attachment", target, "ok");

      // ---- 3. Can we get the bytes? ---------------------------------------
      // Only attempt methods that actually exist on this SDK build.
      const api = (ZOHO && ZOHO.CRM && ZOHO.CRM.API) || {};
      const conn = (ZOHO && ZOHO.CRM && ZOHO.CRM.CONNECTION) || {};
      const attempts = [];

      Object.keys(api).forEach(function (name) {
        if (/file|attach|download/i.test(name) && typeof api[name] === "function") {
          attempts.push({
            label: "ZOHO.CRM.API." + name,
            run: function () {
              return api[name]({ Entity: entity, RecordID: recordId, id: target.id });
            },
          });
        }
      });

      if (typeof conn.invoke === "function") {
        attempts.push({
          label: 'ZOHO.CRM.CONNECTION.invoke("crm", …/Attachments/{id})',
          run: function () {
            return conn.invoke("crm", {
              url:
                "https://www.zohoapis.com/crm/v8/" +
                entity +
                "/" +
                recordId +
                "/Attachments/" +
                target.id,
              method: "GET",
              param_type: 1,
            });
          },
        });
      }

      if (!attempts.length) {
        add(
          "No candidate methods",
          "Nothing on ZOHO.CRM.API matched /file|attach|download/ and CONNECTION.invoke is absent. " +
            "The SDK surface listed above is the full set available — the read path will need a " +
            "server-side Deluge function instead.",
          "bad"
        );
      }

      for (let i = 0; i < attempts.length; i++) {
        const attempt = attempts[i];
        try {
          const result = await attempt.run();
          add(attempt.label + " → returned", result, "ok");

          // If it looks like JSON text, try parsing so we know it is usable.
          let asText = null;
          if (typeof result === "string") asText = result;
          else if (result && typeof result.details === "string") asText = result.details;

          if (asText) {
            try {
              const parsed = JSON.parse(asText);
              add(attempt.label + " → PARSED OK", Object.keys(parsed), "ok");
            } catch (e) {
              add(attempt.label + " → not parseable as JSON", asText.slice(0, 300));
            }
          }
        } catch (err) {
          add(attempt.label + " → threw", (err && err.message) || err, "bad");
        }
      }

      setDone(true);
    });

    ZOHO.embeddedApp.init();
  }, []);

  return (
    <div style={{ font: "13px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace", padding: 16 }}>
      <h1 style={{ font: "600 16px/1.3 system-ui, sans-serif", margin: "0 0 4px" }}>
        Attachment read probe
      </h1>
      <p style={{ font: "13px/1.5 system-ui, sans-serif", color: "#555", margin: "0 0 16px" }}>
        Diagnostic only — checks whether the widget can read an attachment&rsquo;s contents.
        {done ? " Finished." : " Running…"}
      </p>

      {entries.map(function (e, i) {
        const accent = e.kind === "bad" ? "#b5372c" : e.kind === "ok" ? "#136b54" : "#bbbbbb";
        return (
          <div
            key={i}
            style={{
              borderLeft: "3px solid " + accent,
              background: "#f6f6f7",
              padding: "8px 12px",
              margin: "0 0 8px",
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 4 }}>{e.label}</div>
            <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{e.value}</pre>
          </div>
        );
      })}
    </div>
  );
}
