import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface AuditRow {
  id: string;
  invoice_id: string | null;
  timestamp: string;
  actor: string;
  event: string;
  details_json: Record<string, unknown> | null;
  invoices: { invoice_number: string | null } | null;
}

const EVENT_LABELS: Record<string, string> = {
  upload: "Invoice uploaded",
  extraction_confirmed: "Extraction confirmed",
  supplier_match: "Supplier match",
  checks_run: "Fraud checks run",
  checklist_completed: "New-supplier checklist completed",
  supplier_created: "Supplier created",
  decision: "Decision",
  bank_details_updated: "Bank details updated",
  bank_details_update_declined: "Bank detail update declined",
  history_upload: "Past invoice added to history",
};

export const Route = createFileRoute("/audit-log")({
  head: () => ({
    meta: [
      { title: "Audit log — Second Look" },
      { name: "description", content: "Append-only timeline of every check, flag and decision." },
      { property: "og:title", content: "Audit log — Second Look" },
      { property: "og:description", content: "Append-only timeline of every check, flag and decision." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuditLogPage,
});

function AuditLogPage() {
  const [rows, setRows] = useState<AuditRow[] | null>(null);

  useEffect(() => {
    void supabase
      .from("audit_log")
      .select("id, invoice_id, timestamp, actor, event, details_json, invoices:invoice_id(invoice_number)")
      .order("timestamp", { ascending: false })
      .then(({ data }) => setRows((data ?? []) as unknown as AuditRow[]));
  }, []);

  const exportJson = () => {
    if (!rows) return;
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `second-look-evidence-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Evidence exported");
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Audit log</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Append-only. Every upload, check, flag and decision — no editing, no deleting.
          </p>
        </div>
        <button
          onClick={exportJson}
          disabled={!rows || rows.length === 0}
          className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-40"
        >
          Export evidence (JSON)
        </button>
      </div>

      <ol className="mt-6 space-y-0 border-l-2 border-border pl-6">
        {(rows ?? []).map((row) => (
          <li key={row.id} className="relative pb-6 last:pb-0">
            <span className="absolute -left-[31px] top-1 h-3 w-3 rounded-full border-2 border-primary bg-background" />
            <div className="flex flex-wrap items-baseline gap-x-3">
              <span className="font-medium text-foreground">{EVENT_LABELS[row.event] ?? row.event}</span>
              <span className="text-xs text-muted-foreground">
                {new Date(row.timestamp).toLocaleString("en-GB")} · {row.actor}
                {row.invoices?.invoice_number ? ` · Invoice ${row.invoices.invoice_number}` : ""}
              </span>
            </div>
            {row.details_json && (
              <pre className="mt-2 max-w-2xl overflow-x-auto rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
                {JSON.stringify(row.details_json, null, 2)}
              </pre>
            )}
          </li>
        ))}
      </ol>
      {rows !== null && rows.length === 0 && (
        <p className="mt-6 text-sm text-muted-foreground">No events yet — they appear as invoices are checked.</p>
      )}
      {rows === null && <p className="mt-6 text-sm text-muted-foreground">Loading…</p>}
    </div>
  );
}
