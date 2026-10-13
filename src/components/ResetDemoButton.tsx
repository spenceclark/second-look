import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

/** Deletes test invoices and the audit log, but keeps seeded staff, suppliers and supplier history invoices. */
export function ResetDemoButton() {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const reset = async () => {
    if (!window.confirm("Reset the demo? Test invoices and the audit log will be deleted. Suppliers, staff and supplier history are kept.")) {
      return;
    }
    setBusy(true);
    try {
      // Delete audit log first (FK), then non-history invoices.
      const { error: auditErr } = await supabase.from("audit_log").delete().not("id", "is", null);
      if (auditErr) throw new Error(auditErr.message);
      const { data: testInvoices, error: selErr } = await supabase
        .from("invoices")
        .select("id, pdf_path, extracted_json")
        .or("extracted_json->>source.is.null,extracted_json->>source.neq.history");
      if (selErr) throw new Error(selErr.message);
      const ids = (testInvoices ?? []).map((i) => i.id);
      const paths = (testInvoices ?? []).map((i) => i.pdf_path).filter((p): p is string => !!p);
      if (ids.length > 0) {
        const { error: invErr } = await supabase.from("invoices").delete().in("id", ids);
        if (invErr) throw new Error(invErr.message);
      }
      if (paths.length > 0) {
        const { error: storErr } = await supabase.storage.from("invoices").remove(paths);
        if (storErr) throw new Error(storErr.message);
      }
      // Suppliers added during the demo are always 'pending' — seeded ones are 'verified'.
      const { error: supErr } = await supabase.from("suppliers").delete().eq("status", "pending");
      if (supErr) throw new Error(supErr.message);
      toast.success("Demo reset — seeded data kept");
      router.invalidate();
    } catch (e) {
      toast.error("Reset failed: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={reset}
      disabled={busy}
      className="rounded-md border border-navy-foreground/30 px-3 py-1.5 text-sm text-navy-foreground/85 transition-colors hover:bg-navy-foreground/10 disabled:opacity-50"
    >
      {busy ? "Resetting…" : "Reset demo"}
    </button>
  );
}
