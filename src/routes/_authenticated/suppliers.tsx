import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface SupplierRow {
  id: string;
  legal_name: string;
  company_number: string | null;
  email_domain: string | null;
  status: string;
  staff: { name: string } | null;
  invoices: { count: number }[];
}

export const Route = createFileRoute("/_authenticated/suppliers")({
  head: () => ({
    meta: [
      { title: "Suppliers — Second Look" },
      { name: "description", content: "Your verified supplier list with bank details and invoice history." },
      { property: "og:title", content: "Suppliers — Second Look" },
      { property: "og:description", content: "Your verified supplier list with bank details and invoice history." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SuppliersPage,
});

function SuppliersPage() {
  const [rows, setRows] = useState<SupplierRow[] | null>(null);

  useEffect(() => {
    void supabase
      .from("suppliers")
      .select("id, legal_name, company_number, email_domain, status, staff:internal_owner_staff_id(name), invoices(count)")
      .order("legal_name")
      .then(({ data }) => setRows((data ?? []) as unknown as SupplierRow[]));
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-foreground">Suppliers</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        The details on file are what every new invoice is checked against.
      </p>
      <div className="mt-6 overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              <th className="px-4 py-3">Supplier</th>
              <th className="px-4 py-3">Company no.</th>
              <th className="px-4 py-3">Domain</th>
              <th className="px-4 py-3">Owner</th>
              <th className="px-4 py-3">Invoices</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((s) => (
              <tr key={s.id} className="border-b border-border last:border-0 hover:bg-accent/50">
                <td className="px-4 py-3">
                  <Link
                    to="/suppliers/$id"
                    params={{ id: s.id }}
                    className="font-medium text-primary hover:underline"
                  >
                    {s.legal_name}
                  </Link>
                </td>
                <td className="px-4 py-3 font-mono text-muted-foreground">{s.company_number ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{s.email_domain ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{s.staff?.name ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{s.invoices?.[0]?.count ?? 0}</td>
                <td className="px-4 py-3">
                  <span
                    className={
                      s.status === "verified"
                        ? "rounded-full bg-risk-green-soft px-2.5 py-0.5 text-xs font-medium text-risk-green"
                        : "rounded-full bg-risk-amber-soft px-2.5 py-0.5 text-xs font-medium text-risk-amber-foreground"
                    }
                  >
                    {s.status}
                  </span>
                </td>
              </tr>
            ))}
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
