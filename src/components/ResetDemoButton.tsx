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
      await supabase.from("audit_log").delete().not("id", "is", null);
      const { data: testInvoices } = await supabase
        .from("invoices")
        .select("id, pdf_path, extracted_json")
        .or("extracted_json->>source.is.null,extracted_json->>source.neq.history");
      const ids = (testInvoices ?? []).map((i) => i.id);
      const paths = (testInvoices ?? []).map((i) => i.pdf_path).filter((p): p is string => !!p);
      if (ids.length > 0) {
        await supabase.from("invoices").delete().in("id", ids);
      }
      if (paths.length > 0) {
        await supabase.storage.from("invoices").remove(paths);
      }
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
