import { Dialog, DialogContent, DialogTitle } from "@mui/material";
import React, { useEffect, useState } from "react";
import NewProductForm from "./NewProductForm";

/* E-100: the New Product form opened from a SKU row in the onboarding / Amendment form. */
export default function NewProductDialog({ open, initialStyle, garmentKind, onClose, onCreated }) {
  const [user, setUser] = useState("");
  useEffect(() => {
    const zoho = typeof window !== "undefined" ? window.ZOHO : null;
    if (zoho && zoho.CRM && zoho.CRM.CONFIG && zoho.CRM.CONFIG.getCurrentUser)
      zoho.CRM.CONFIG.getCurrentUser()
        .then((r) => setUser((r && r.users && r.users[0] && r.users[0].full_name) || ""))
        .catch(() => {});
  }, []);
  return (
    <Dialog open={open} onClose={onClose} fullScreen>
      <DialogTitle>Add a new product to Books</DialogTitle>
      <DialogContent>
        <NewProductForm initialStyle={initialStyle} garmentKind={garmentKind} submittedBy={user} onCancel={onClose} onCreated={onCreated} />
      </DialogContent>
    </Dialog>
  );
}
