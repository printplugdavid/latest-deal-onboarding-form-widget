import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";

// One app, two Zoho buttons:
//   default                 -> the Deal Onboarding Form
//   ?view=cards  or  #cards -> the production card viewer (see CardViewer.jsx)
// Each is loaded on demand, so the card viewer doesn't download the whole form first.
const App = lazy(() => import("./App"));
const CardViewer = lazy(() => import("./CardViewer"));

const params = new URLSearchParams(window.location.search);
const showCards =
  params.get("view") === "cards" || window.location.hash.replace("#", "") === "cards";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <Suspense
      fallback={
        showCards ? (
          <div style={{ padding: 32, fontFamily: "Roboto, sans-serif", color: "#1a1a1a", background: "#fff", minHeight: "100vh" }}>
            Loading production cards…
          </div>
        ) : null
      }
    >
      {showCards ? <CardViewer /> : <App />}
    </Suspense>
  </React.StrictMode>
);
