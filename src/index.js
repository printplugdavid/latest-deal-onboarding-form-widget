import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";

// One app, three Zoho buttons:
//   default                 -> the Deal Onboarding Form
//   ?view=cards  or  #cards -> the production card viewer (see CardViewer.jsx)
//   ?view=amendment         -> the Onboarding Amendment Form (see amendment/AmendmentApp.jsx, E-24/D-24)
// Each is loaded on demand, so one view never downloads another -- and a runtime crash in one
// cannot reach the others. (A COMPILE error still breaks all three: the build is the gate.)
const App = lazy(() => import("./App"));
const CardViewer = lazy(() => import("./CardViewer"));
const AmendmentApp = lazy(() => import("./amendment/AmendmentApp"));

const params = new URLSearchParams(window.location.search);
const showCards =
  params.get("view") === "cards" || window.location.hash.replace("#", "") === "cards";
const showAmendment = !showCards && params.get("view") === "amendment";

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
      {showCards ? <CardViewer /> : showAmendment ? <AmendmentApp /> : <App />}
    </Suspense>
  </React.StrictMode>
);
