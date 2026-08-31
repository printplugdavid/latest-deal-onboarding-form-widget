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


// JSON.stringify() renders Blob / ArrayBuffer / Response / File as "{}", which
// hides the very thing we are looking for. Report the real shape instead.
function describe(v) {
  if (v === null || v === undefined) return String(v);
  const tag = Object.prototype.toString.call(v);
  const ctor = v && v.constructor && v.constructor.name;
  const info = { typeof: typeof v, tag: tag, constructor: ctor || "(none)" };
  try {
    info.ownKeys = Object.getOwnPropertyNames(v).slice(0, 40);
  } catch (e) {
    info.ownKeys = "(unreadable)";
  }
  if (typeof v === "object") {
    if (typeof v.size === "number") info.size = v.size;
    if (typeof v.type === "string") info.mime = v.type;
    if (typeof v.byteLength === "number") info.byteLength = v.byteLength;
    if (typeof v.status === "number") info.httpStatus = v.status;
    if (typeof v.text === "function") info.hasTextMethod = true;
    if (typeof v.arrayBuffer === "function") info.hasArrayBufferMethod = true;
  }
  return info;
}

async function extractText(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v;
  if (typeof v.text === "function") {
    try {
      return await v.text();
    } catch (e) {
      /* fall through */
    }
  }
  if (typeof v.arrayBuffer === "function") {
    try {
      return new TextDecoder().decode(await v.arrayBuffer());
    } catch (e) {
      /* fall through */
    }
  }
  if (v instanceof ArrayBuffer) return new TextDecoder().decode(v);
  if (v && v.buffer instanceof ArrayBuffer) return new TextDecoder().decode(v.buffer);
  const fields = ["data", "details", "body", "content", "fileContent", "response"];
  for (let i = 0; i < fields.length; i++) {
    const val = v[fields[i]];
    if (typeof val === "string") return val;
    if (val && (typeof val.text === "function" || val instanceof ArrayBuffer)) {
      return await extractText(val);
    }
  }
  return null;
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
          add(attempt.label + " -> SHAPE", describe(result), "info");

          let text = null;
          try {
            text = await withTimeout(extractText(result), 10000);
          } catch (e) {
            add(attempt.label + " -> extractText failed", (e && e.message) || e, "bad");
          }

          if (text === null) {
            add(attempt.label + " -> no text extractable", "Nothing string-like found on this value.", "bad");
          } else {
            add(attempt.label + " -> TEXT (" + text.length + " chars)", text.slice(0, 800), "ok");
            try {
              const parsed = JSON.parse(text);
              add(
                attempt.label + " -> PARSED OK",
                {
                  topLevelKeys: Object.keys(parsed),
                  products: parsed.products ? parsed.products.length : null,
                  firstGarmentQty:
                    parsed.products &&
                    parsed.products[0] &&
                    parsed.products[0].primaryBranches &&
                    parsed.products[0].primaryBranches[0]
                      ? parsed.products[0].primaryBranches[0].garmentQuantity
                      : null,
                },
                "ok"
              );
            } catch (e) {
              add(attempt.label + " -> not JSON", (e && e.message) || e, "bad");
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
