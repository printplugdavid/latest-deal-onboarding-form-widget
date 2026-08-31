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

function preview(value, max = 2500) {
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
      add(
        "Target attachment",
        {
          id: target.id,
          File_Name: target.File_Name,
          Size: target.Size,
          $file_id: target["$file_id"],
          $download_url: target["$download_url"],
        },
        "ok"
      );

      // ---- 3. Can we get the bytes? ---------------------------------------
      // READ-ONLY allowlist. Do NOT sweep in uploadFile / attachFile /
      // addNotesAttachment -- those are write operations and must never be
      // called speculatively against a live record.
      const api = (ZOHO && ZOHO.CRM && ZOHO.CRM.API) || {};
      const conn = (ZOHO && ZOHO.CRM && ZOHO.CRM.CONNECTION) || {};
      const attempts = [];

      // getFile signature is unknown -- try the attachment record id and the
      // internal $file_id, which is the likelier of the two.
      if (typeof api.getFile === "function") {
        if (target["$file_id"]) {
          attempts.push({
            label: 'getFile({ id: $file_id })',
            run: function () {
              return api.getFile({ id: target["$file_id"] });
            },
          });
        }
        attempts.push({
          label: "getFile({ id: attachment record id })",
          run: function () {
            return api.getFile({ id: target.id });
          },
        });
        attempts.push({
          label: "getFile({ Entity, RecordID, id })",
          run: function () {
            return api.getFile({ Entity: entity, RecordID: recordId, id: target.id });
          },
        });
      } else {
        add("getFile absent", "ZOHO.CRM.API.getFile is not a function on this SDK build.", "bad");
      }

      if (typeof conn.invoke === "function") {
        attempts.push({
          label: 'CONNECTION.invoke("crm", .../Attachments/{id})',
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

      // A hung promise must not freeze the whole run.
      function withTimeout(promise, ms) {
        return Promise.race([
          Promise.resolve(promise),
          new Promise(function (_, reject) {
            setTimeout(function () {
              reject(new Error("timed out after " + ms + "ms (no response)"));
            }, ms);
          }),
        ]);
      }

      for (let i = 0; i < attempts.length; i++) {
        const attempt = attempts[i];
        try {
          const result = await withTimeout(attempt.run(), 12000);
          add(attempt.label + " -> returned", result, "ok");

          let asText = null;
          if (typeof result === "string") asText = result;
          else if (result && typeof result.details === "string") asText = result.details;
          else if (result && typeof result.data === "string") asText = result.data;

          if (asText) {
            try {
              const parsed = JSON.parse(asText);
              add(
                attempt.label + " -> PARSED OK",
                { topLevelKeys: Object.keys(parsed), products: parsed.products ? parsed.products.length : null },
                "ok"
              );
            } catch (e) {
              add(attempt.label + " -> not parseable as JSON", asText.slice(0, 400));
            }
          }
        } catch (err) {
          add(attempt.label + " -> threw", (err && err.message) || err, "bad");
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
