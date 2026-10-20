import { Box, Typography } from "@mui/material";
import React, { useEffect, useState } from "react";
import NewProductForm from "../components/NewProductForm";

/*
 * E-85: ?view=newproduct -- the New Product form on its own, for the "New Product" button on the CRM Products list.
 * It needs no record: it only calls the two CRM functions (products/booksItems.js).
 */
export default function NewProductApp() {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState("");
  const [key, setKey] = useState(0);

  useEffect(() => {
    const ZOHO = window.ZOHO;
    if (!ZOHO || !ZOHO.embeddedApp) {
      setReady(true); // outside Zoho: the form still shows, and says Books is not reachable
      return;
    }
    ZOHO.embeddedApp.on("PageLoad", async () => {
      try {
        ZOHO.CRM.UI.Resize({ height: "900", width: "1100" });
      } catch (e) {}
      try {
        const r = await ZOHO.CRM.CONFIG.getCurrentUser();
        setUser((r && r.users && r.users[0] && r.users[0].full_name) || "");
      } catch (e) {}
      setReady(true);
    });
    ZOHO.embeddedApp.init();
  }, []);

  if (!ready) return null;
  return (
    <Box sx={{ p: 3, maxWidth: 1050, fontFamily: "Roboto, sans-serif", background: "#fff", minHeight: "100vh" }}>
      <Typography variant="h6" sx={{ mb: 1 }}>
        New Product
      </Typography>
      <Typography sx={{ fontSize: "0.85rem", color: "#555", mb: 2 }}>
        Answer the questions; the code, name and Books fields are built from the product naming guide.
      </Typography>
      {/* Close / Cancel starts a fresh form for the next product. */}
      <NewProductForm key={key} submittedBy={user} onCancel={() => setKey((k) => k + 1)} />
    </Box>
  );
}
