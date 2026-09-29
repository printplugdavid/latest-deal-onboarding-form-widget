import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";

// One app, three Zoho buttons:
//   default                    -> the Deal Onboarding Form
//   ?view=cards    or #cards    -> the production card viewer (see CardViewer.jsx)
//   ?view=revision or #revision -> the Revision / Correction Form (see RevisionApp.jsx)
// Each is loaded on demand, so a button only downloads the UI it opens.
const App = lazy(() => import("./App"));
const CardViewer = lazy(() => import("./CardViewer"));
const RevisionApp = lazy(() => import("./RevisionApp"));

const params = new URLSearchParams(window.location.search);
const view = params.get("view") || window.location.hash.replace("#", "");
const showCards = view === "cards";
const showRevision = view === "revision";

const loading = (label) => (
  <div style={{ padding: 32, fontFamily: "Roboto, sans-serif", color: "#1a1a1a", background: "#fff", minHeight: "100vh" }}>
    {label}
  </div>
);

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <Suspense
      fallback={
        showCards
          ? loading("Loading production cards…")
          : showRevision
          ? loading("Loading revision form…")
          : null
      }
    >
      {showCards ? <CardViewer /> : showRevision ? <RevisionApp /> : <App />}
    </Suspense>
  </React.StrictMode>
);
