import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { StatusChip, VerdictChip } from "@/components/ui-bits";
import type { Verdict } from "@/lib/checks";

interface InvoiceRow {
  id: string;
  invoice_number: string | null;
  invoice_date: string | null;
  total: number | null;
  verdict: Verdict | null;
  status: string;
  created_at: string;
  suppliers: { legal_name: string } | null;
}

export const Route = createFileRoute("/invoices")({
  head: () => ({
    meta: [
      { title: "Invoices — Second Look" },
      { name: "description", content: "All invoices with their fraud-check verdict and payment status." },
      { property: "og:title", content: "Invoices — Second Look" },
      { property: "og:description", content: "All invoices with their fraud-check verdict and payment status." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: InvoicesPage,
});

function InvoicesPage() {
  const [rows, setRows] = useState<InvoiceRow[] | null>(null);

  useEffect(() => {
    void supabase
      .from("invoices")
      .select("id, invoice_number, invoice_date, total, verdict, status, created_at, suppliers:supplier_id(legal_name)")
      .order("created_at", { ascending: false })
      .then(({ data }) => setRows((data ?? []) as unknown as InvoiceRow[]));
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-foreground">Invoices</h1>
      <p className="mt-1 text-sm text-muted-foreground">Every invoice and the verdict it received.</p>
      <div className="mt-6 overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              <th className="px-4 py-3">Invoice</th>
              <th className="px-4 py-3">Supplier</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3">Verdict</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((inv) => (
              <tr key={inv.id} className="border-b border-border last:border-0 hover:bg-accent/50">
                <td className="px-4 py-3 font-medium text-foreground">{inv.invoice_number ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{inv.suppliers?.legal_name ?? "Unknown"}</td>
                <td className="px-4 py-3 text-muted-foreground">{inv.invoice_date ?? "—"}</td>
                <td className="px-4 py-3 text-right font-mono text-foreground">
                  {inv.total !== null ? `£${Number(inv.total).toFixed(2)}` : "—"}
                </td>
                <td className="px-4 py-3">
                  <VerdictChip verdict={inv.verdict} />
                </td>
                <td className="px-4 py-3">
                  <StatusChip status={inv.status} />
                </td>
              </tr>
            ))}
            {rows !== null && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  No invoices yet. <Link to="/" className="text-primary hover:underline">Pay an invoice</Link> to run
                  the first check.
                </td>
              </tr>
            )}
            {rows === null && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
