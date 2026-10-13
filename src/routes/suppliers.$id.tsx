import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { extractInvoiceData } from "@/lib/ai.functions";
import { getSignedPdfUrl, logEvent } from "@/lib/audit";
import { extractPdfText } from "@/lib/pdf";
import { StatusChip, VerdictChip } from "@/components/ui-bits";
import type { ExtractedInvoice, SupplierRecord } from "@/lib/checks";

interface HistoryInvoice {
  id: string;
  invoice_number: string | null;
  invoice_date: string | null;
  total: number | null;
  verdict: string | null;
  status: string;
  pdf_path: string | null;
  created_at: string;
}

export const Route = createFileRoute("/suppliers/$id")({
  head: () => ({
    meta: [
      { title: "Supplier — Second Look" },
      { name: "description", content: "Supplier details on file and past invoice history." },
      { property: "og:title", content: "Supplier — Second Look" },
      { property: "og:description", content: "Supplier details on file and past invoice history." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SupplierPage,
});

function SupplierPage() {
  const { id } = Route.useParams();
  const [supplier, setSupplier] = useState<(SupplierRecord & { staff?: { name: string } | null }) | null>(null);
  const [history, setHistory] = useState<HistoryInvoice[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const { data: s } = await supabase
      .from("suppliers")
      .select("*, staff:internal_owner_staff_id(name)")
      .eq("id", id)
      .single();
    setSupplier(s as unknown as SupplierRecord & { staff?: { name: string } | null });
    const { data: inv } = await supabase
      .from("invoices")
      .select("id, invoice_number, invoice_date, total, verdict, status, pdf_path, created_at")
      .eq("supplier_id", id)
      .order("created_at", { ascending: false });
    setHistory((inv ?? []) as HistoryInvoice[]);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const uploadHistory = async (file: File) => {
    if (file.type !== "application/pdf") {
      toast.error("Please upload a PDF");
      return;
    }
    setBusy(`Processing ${file.name}…`);
    try {
      const text = await extractPdfText(file);
      const path = `${crypto.randomUUID()}.pdf`;
      const { error: upErr } = await supabase.storage.from("invoices").upload(path, file);
      if (upErr) throw upErr;
      const res = await extractInvoiceData({ data: { text } });
      const extracted = res.ok ? (res.data as ExtractedInvoice) : {};
      const { data: inv, error: invErr } = await supabase
        .from("invoices")
        .insert({
          supplier_id: id,
          pdf_path: path,
          invoice_number: extracted.invoice_number ?? null,
          invoice_date: extracted.invoice_date ?? null,
          total: extracted.total ?? null,
          extracted_json: { ...extracted, source: "history" },
          status: "paid",
        })
        .select("id")
        .single();
      if (invErr) throw invErr;
      await logEvent(inv.id, "history_upload", { file: file.name, supplier_id: id, total: extracted.total });
      toast.success(`Added ${file.name} to history`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(null);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const openPdf = async (path: string | null) => {
    const url = await getSignedPdfUrl(path);
    if (url) window.open(url, "_blank");
  };

  if (!supplier) return <p className="text-muted-foreground">Loading…</p>;

  const details: [string, string | null | undefined][] = [
    ["Company number", supplier.company_number],
    ["VAT number", supplier.vat_number],
    ["Email domain", supplier.email_domain],
    ["Phone on file", supplier.phone_on_file],
    ["Bank", supplier.bank_name],
    ["Account name", supplier.account_name],
    ["Sort code", supplier.sort_code],
    ["Account number", supplier.account_number],
    ["Usual terms", supplier.usual_terms_days ? `${supplier.usual_terms_days} days` : null],
    ["Internal owner", supplier.staff?.name],
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link to="/suppliers" className="text-sm text-primary hover:underline">
          ← All suppliers
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{supplier.legal_name}</h1>
          <span
            className={
              supplier.status === "verified"
                ? "rounded-full bg-risk-green-soft px-2.5 py-0.5 text-xs font-medium text-risk-green"
                : "rounded-full bg-risk-amber-soft px-2.5 py-0.5 text-xs font-medium text-risk-amber-foreground"
            }
          >
            {supplier.status}
          </span>
        </div>
        {(supplier.aliases ?? []).length > 0 && (
          <p className="mt-1 text-sm text-muted-foreground">Also known as: {supplier.aliases.join(", ")}</p>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground">Details on file</h2>
          <dl className="mt-4 space-y-2 text-sm">
            {details.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 border-b border-border pb-2 last:border-0">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-mono text-foreground">{value ?? "—"}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Invoice history</h2>
            <button
              onClick={() => fileInput.current?.click()}
              disabled={!!busy}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {busy ?? "Upload past invoice"}
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadHistory(f);
              }}
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Past invoices are run through the same AI extraction and stored as paid — they become the baseline for
            future checks.
          </p>
          <ul className="mt-4 space-y-2">
            {history.map((inv) => (
              <li
                key={inv.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm"
              >
                <div>
                  <button onClick={() => openPdf(inv.pdf_path)} className="font-medium text-primary hover:underline">
                    {inv.invoice_number ?? "Invoice"}
                  </button>
                  <span className="ml-2 text-muted-foreground">{inv.invoice_date ?? ""}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-foreground">
                    {inv.total !== null ? `£${Number(inv.total).toFixed(2)}` : "—"}
                  </span>
                  <VerdictChip verdict={inv.verdict as never} />
                  <StatusChip status={inv.status} />
                </div>
              </li>
            ))}
            {history.length === 0 && (
              <li className="py-6 text-center text-sm text-muted-foreground">No past invoices yet.</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
