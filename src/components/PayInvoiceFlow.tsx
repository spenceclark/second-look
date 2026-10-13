import { useMemo, useRef, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { extractInvoiceData, summarizeFlags } from "@/lib/ai.functions";
import { CURRENT_USER, getSignedPdfUrl, logEvent } from "@/lib/audit";
import {
  matchSupplier,
  runChecks,
  verdictFromFlags,
  type ExtractedInvoice,
  type Flag,
  type SupplierRecord,
  type Verdict,
} from "@/lib/checks";
import { extractPdfText } from "@/lib/pdf";
import { DiffText, SeverityBadge, Sparkline, VerdictChip } from "@/components/ui-bits";
import { cn } from "@/lib/utils";

type Step = "upload" | "confirm" | "checks" | "decide" | "done";

interface StaffMember {
  id: string;
  name: string;
  role: string;
}

interface PastInvoice {
  id: string;
  total: number | null;
  pdf_path: string | null;
  status: string | null;
  extracted_json: ExtractedInvoice | null;
}

/** History that counts for comparisons: paid or approved invoices only. */
function isHistory(p: PastInvoice): boolean {
  return p.status === "paid" || p.status === "approved";
}

const FIELD_LABELS: [keyof ExtractedInvoice, string][] = [
  ["supplier_name", "Supplier name"],
  ["company_number", "Company number"],
  ["vat_number", "VAT number"],
  ["email", "Email"],
  ["website", "Website"],
  ["phone", "Phone"],
  ["bank_name", "Bank name"],
  ["account_name", "Account name"],
  ["sort_code", "Sort code"],
  ["account_number", "Account number"],
  ["invoice_number", "Invoice number"],
  ["invoice_date", "Invoice date"],
  ["due_date", "Due date"],
  ["terms", "Payment terms"],
  ["total", "Total (£)"],
];

export function PayInvoiceFlow() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("upload");
  const [busy, setBusy] = useState<string | null>(null);
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [pdfPath, setPdfPath] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [rawText, setRawText] = useState("");
  const [extracted, setExtracted] = useState<ExtractedInvoice>({});
  const [supplier, setSupplier] = useState<SupplierRecord | null>(null);
  const [pastInvoices, setPastInvoices] = useState<PastInvoice[]>([]);
  const [flags, setFlags] = useState<Flag[]>([]);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [compare, setCompare] = useState(false);
  const [pastPdfUrl, setPastPdfUrl] = useState<string | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [fileName, setFileName] = useState("");

  // ---- Step 1: upload + extract ----
  const handleFile = async (file: File) => {
    if (file.type !== "application/pdf") {
      toast.error("Please upload a PDF invoice");
      return;
    }
    setBusy("Reading PDF…");
    setFileName(file.name);
    try {
      const text = await extractPdfText(file);
      setRawText(text);

      const path = `${crypto.randomUUID()}.pdf`;
      const { error: upErr } = await supabase.storage.from("invoices").upload(path, file);
      if (upErr) throw upErr;
      setPdfPath(path);
      setPdfUrl(await getSignedPdfUrl(path));

      const { data: inv, error: invErr } = await supabase
        .from("invoices")
        .insert({ pdf_path: path, status: "pending" })
        .select("id")
        .single();
      if (invErr) throw invErr;
      setInvoiceId(inv.id);
      await logEvent(inv.id, "upload", { file: file.name, pdf_path: path });

      setBusy("Extracting invoice data with AI…");
      const res = await extractInvoiceData({ data: { text } });
      if (!res.ok) throw new Error(res.error);
      setExtracted(res.data as ExtractedInvoice);
      await supabase.from("invoices").update({ extracted_json: res.data as Json }).eq("id", inv.id);
      setStep("confirm");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(null);
    }
  };

  // ---- Step 2: confirm extraction + match supplier ----
  const confirmExtraction = async () => {
    if (!invoiceId) return;
    setBusy("Matching supplier…");
    try {
      await supabase
        .from("invoices")
        .update({
          extracted_json: extracted as Json,
          invoice_number: extracted.invoice_number ?? null,
          invoice_date: extracted.invoice_date ?? null,
          total: extracted.total ?? null,
        })
        .eq("id", invoiceId);
      await logEvent(invoiceId, "extraction_confirmed", { extracted });

      const { data: suppliers } = await supabase.from("suppliers").select("*");
      const { data: staffRows } = await supabase.from("staff").select("id, name, role");
      setStaff(staffRows ?? []);

      const match = matchSupplier(extracted, (suppliers ?? []) as SupplierRecord[]);
      setSupplier(match);

      if (match) {
        const { data: past } = await supabase
          .from("invoices")
          .select("id, total, pdf_path, status, extracted_json")
          .eq("supplier_id", match.id)
          .neq("id", invoiceId)
          .order("created_at", { ascending: false });
        const pastRows = (past ?? []) as PastInvoice[];
        setPastInvoices(pastRows);

        const found = runChecks(extracted, match, pastRows, rawText);
        setFlags(found);
        const v = verdictFromFlags(found);
        setVerdict(v);
        await supabase.from("invoices").update({ supplier_id: match.id, verdict: v }).eq("id", invoiceId);
        await logEvent(invoiceId, "supplier_match", {
          matched: true,
          supplier: match.legal_name,
          past_invoices: pastRows.length,
        });
        await logEvent(invoiceId, "checks_run", { verdict: v, flags: found });
        void fetchSummary(found, v);
      } else {
        setFlags([]);
        setVerdict("AMBER");
        await supabase.from("invoices").update({ verdict: "AMBER" }).eq("id", invoiceId);
        await logEvent(invoiceId, "supplier_match", { matched: false, supplier_name: extracted.supplier_name });
      }
      setStep("checks");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Matching failed");
    } finally {
      setBusy(null);
    }
  };

  const fetchSummary = async (found: Flag[], v: Verdict) => {
    try {
      const res = await summarizeFlags({ data: { flags: found, verdict: v } });
      setAiSummary(res.summary);
    } catch {
      setAiSummary(templateSummary(found, v));
    }
  };

  const toggleCompare = async () => {
    if (!compare && !pastPdfUrl && pastInvoices[0]?.pdf_path) {
      setPastPdfUrl(await getSignedPdfUrl(pastInvoices[0].pdf_path));
    }
    setCompare(!compare);
  };

  // ---- Step 3b: unknown-supplier checklist ----
  const [checklist, setChecklist] = useState({
    orderedBy: "",
    confirmedWithStaff: "",
    phonedIndependently: "",
    phoneUsed: "",
    bankConfirmed: "",
    amountConfirmed: "",
    contactName: "",
  });
  const checklistComplete =
    checklist.orderedBy &&
    checklist.confirmedWithStaff === "yes" &&
    checklist.phonedIndependently === "yes" &&
    checklist.phoneUsed.trim() &&
    checklist.bankConfirmed === "yes" &&
    checklist.amountConfirmed === "yes" &&
    checklist.contactName.trim();

  const approveAndAddSupplier = async () => {
    if (!invoiceId) return;
    setBusy("Adding supplier…");
    try {
      const { data: newSupplier, error } = await supabase
        .from("suppliers")
        .insert({
          legal_name: extracted.supplier_name ?? "Unknown supplier",
          company_number: extracted.company_number ?? null,
          vat_number: extracted.vat_number ?? null,
          email_domain: extracted.email?.split("@")[1] ?? extracted.website ?? null,
          phone_on_file: extracted.phone ?? null,
          bank_name: extracted.bank_name ?? null,
          account_name: extracted.account_name ?? null,
          sort_code: extracted.sort_code ?? null,
          account_number: extracted.account_number ?? null,
          internal_owner_staff_id: checklist.orderedBy || null,
          status: "pending",
        })
        .select("id")
        .single();
      if (error) throw error;
      await supabase
        .from("invoices")
        .update({ supplier_id: newSupplier.id, status: "approved" })
        .eq("id", invoiceId);
      await logEvent(invoiceId, "checklist_completed", { ...checklist });
      await logEvent(invoiceId, "supplier_created", { supplier_id: newSupplier.id, status: "pending" });
      await logEvent(invoiceId, "decision", { decision: "approved", path: "new_supplier" });
      setStep("done");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add supplier");
    } finally {
      setBusy(null);
    }
  };

  // ---- Step 4: decide ----
  const [verify, setVerify] = useState({ phonedOnFile: false, spokeTo: "", outcome: "", reason: "" });
  const [fraudScreen, setFraudScreen] = useState(false);
  const [askBankUpdate, setAskBankUpdate] = useState(false);
  const needsVerification = verdict === "RED" || verdict === "AMBER";
  const bankChanged = flags.some((f) => f.id === "bank-details");

  const holdInvoice = async () => {
    if (!invoiceId) return;
    await supabase.from("invoices").update({ status: "held" }).eq("id", invoiceId);
    await logEvent(invoiceId, "decision", { decision: "held" });
    toast("Invoice held");
    router.navigate({ to: "/invoices" });
  };

  const approveInvoice = async () => {
    if (!invoiceId) return;
    if (needsVerification && !verify.phonedOnFile) {
      setStep("decide");
      return;
    }
    if (verify.outcome === "not_them") {
      await supabase.from("invoices").update({ status: "held" }).eq("id", invoiceId);
      await logEvent(invoiceId, "decision", { decision: "held", reason: "supplier_says_not_from_them", verify });
      setFraudScreen(true);
      const ownerName = staff.find((s) => s.id === (supplier as SupplierRecord & { internal_owner_staff_id?: string })?.internal_owner_staff_id)?.name;
      toast.warning(`${ownerName ?? "The supplier's internal owner"} notified`);
      return;
    }
    if (bankChanged && verify.outcome === "confirmed" && !askBankUpdate) {
      setAskBankUpdate(true);
      return;
    }
    await supabase.from("invoices").update({ status: "approved" }).eq("id", invoiceId);
    await logEvent(invoiceId, "decision", { decision: "approved", verify });
    setStep("done");
  };

  const updateBankDetails = async (doIt: boolean) => {
    if (!invoiceId || !supplier) return;
    if (doIt) {
      await supabase
        .from("suppliers")
        .update({ sort_code: extracted.sort_code ?? null, account_number: extracted.account_number ?? null })
        .eq("id", supplier.id);
      await logEvent(invoiceId, "bank_details_updated", {
        supplier: supplier.legal_name,
        old: { sort_code: supplier.sort_code, account_number: supplier.account_number },
        new: { sort_code: extracted.sort_code, account_number: extracted.account_number },
      });
      toast.success("Bank details updated on file");
    } else {
      await logEvent(invoiceId, "bank_details_update_declined", {
        old: { sort_code: supplier.sort_code, account_number: supplier.account_number },
        new: { sort_code: extracted.sort_code, account_number: extracted.account_number },
      });
    }
    setAskBankUpdate(false);
    await supabase.from("invoices").update({ status: "approved" }).eq("id", invoiceId);
    await logEvent(invoiceId, "decision", { decision: "approved", verify });
    setStep("done");
  };

  // ---------- render ----------
  if (fraudScreen) {
    return (
      <div className="mx-auto max-w-2xl rounded-xl border-2 border-risk-red bg-risk-red-soft p-8 text-center">
        <div className="text-5xl">🛑</div>
        <h1 className="mt-4 text-2xl font-bold text-risk-red">Likely fraud. Don't pay.</h1>
        <p className="mt-3 text-risk-red">
          The supplier says this invoice is not from them. The invoice has been marked <strong>held</strong>.
        </p>
        <p className="mt-2 text-sm text-risk-red">
          Report this to your bank and to Action Fraud (actionfraud.police.uk, 0300 123 2040).
        </p>
        <button
          onClick={() => router.navigate({ to: "/invoices" })}
          className="mt-6 rounded-md bg-risk-red px-4 py-2 text-sm font-medium text-risk-red-foreground"
        >
          Back to invoices
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Pay an invoice</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every invoice gets a second look before payment. Signed in as {CURRENT_USER}.
        </p>
      </div>

      <Stepper step={step} />

      {step === "upload" && (
        <div
          className={cn(
            "flex min-h-64 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-card p-10 text-center transition-colors hover:border-primary/50",
            busy && "pointer-events-none opacity-70",
          )}
          onClick={() => fileInput.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) void handleFile(f);
          }}
        >
          <input
            ref={fileInput}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
            }}
          />
          {busy ? (
            <p className="text-sm font-medium text-foreground">{busy}</p>
          ) : (
            <>
              <p className="text-lg font-medium text-foreground">Drop an invoice PDF here</p>
              <p className="mt-1 text-sm text-muted-foreground">or click to choose a file</p>
            </>
          )}
        </div>
      )}

      {step === "confirm" && (
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground">AI-extracted, please check</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The AI read <span className="font-medium">{fileName}</span>. Correct anything it got wrong before we run
            the checks.
          </p>
          <div className="mt-4 overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <tbody>
                {FIELD_LABELS.map(([key, label]) => (
                  <tr key={key} className="border-b border-border last:border-0">
                    <td className="w-48 bg-muted/50 px-3 py-2 font-medium text-muted-foreground">{label}</td>
                    <td className="px-3 py-1.5">
                      <input
                        className="w-full rounded border border-transparent bg-transparent px-2 py-1 text-foreground focus:border-input focus:bg-background focus:outline-none"
                        value={String(extracted[key] ?? "")}
                        onChange={(e) =>
                          setExtracted((prev) => ({
                            ...prev,
                            [key]: key === "total" ? Number(e.target.value) || null : e.target.value || null,
                          }))
                        }
                      />
                    </td>
                  </tr>
                ))}
                <tr>
                  <td className="bg-muted/50 px-3 py-2 font-medium text-muted-foreground">Line items</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {(extracted.line_items ?? []).map((li, i) => (
                      <div key={i}>
                        {li.description} — {li.qty ?? "–"} × £{li.unit ?? "–"} = £{li.amount ?? "–"}
                      </div>
                    ))}
                    {(extracted.line_items ?? []).length === 0 && "None extracted"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <button
            onClick={confirmExtraction}
            disabled={!!busy}
            className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {busy ?? "Confirm & run checks"}
          </button>
        </div>
      )}

      {step === "checks" && supplier && (
        <div className="space-y-4">
          <VerdictBanner verdict={verdict} />
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  Matched: {supplier.legal_name}{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    ({supplier.status}, {pastInvoices.filter(isHistory).length} past invoice{pastInvoices.filter(isHistory).length === 1 ? "" : "s"})
                  </span>
                </h2>
              </div>
              {pastInvoices.some((p) => p.pdf_path) && (
                <button
                  onClick={toggleCompare}
                  className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-accent"
                >
                  {compare ? "Hide comparison" : "Compare side by side"}
                </button>
              )}
            </div>

            {flags.length === 0 ? (
              <p className="mt-4 text-sm text-risk-green">
                No deviations found — bank details, contacts, VAT and totals all match this supplier's history.
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {flags.map((f) => (
                  <li key={f.id} className="rounded-lg border border-border p-4">
                    <div className="flex items-center gap-2">
                      <SeverityBadge severity={f.severity} />
                      <span className="font-medium text-foreground">{f.title}</span>
                    </div>
                    {(f.was || f.now) && (
                      <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                        {f.was && (
                          <div className="rounded bg-muted/60 px-3 py-2">
                            <span className="block text-xs font-medium text-muted-foreground">Was</span>
                            <span className="font-mono break-all">{f.was}</span>
                          </div>
                        )}
                        {f.now && (
                          <div className="rounded bg-muted/60 px-3 py-2">
                            <span className="block text-xs font-medium text-muted-foreground">Now</span>
                            {f.was ? <DiffText was={f.was} now={f.now} /> : <span className="font-mono">{f.now}</span>}
                          </div>
                        )}
                      </div>
                    )}
                    {f.detail && <p className="mt-2 text-sm text-muted-foreground">{f.detail}</p>}
                    {f.id === "total-outlier" && (
                      <div className="mt-2">
                        <Sparkline values={pastInvoices.filter(isHistory).map((p) => Number(p.total)).filter((t) => t > 0).reverse()} />
                        <p className="text-xs text-muted-foreground">Past invoice totals</p>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <AiSummaryBox summary={aiSummary} />
          </div>

          {compare && (
            <div className="grid gap-4 md:grid-cols-2">
              <PdfPane title="New invoice" url={pdfUrl} />
              <PdfPane title="Most recent past invoice" url={pastPdfUrl} />
            </div>
          )}

          <DecisionBar
            onApprove={() => (needsVerification ? setStep("decide") : void approveInvoice())}
            onHold={holdInvoice}
            approveLabel="Approve for payment"
          />
        </div>
      )}

      {step === "checks" && !supplier && (
        <div className="space-y-4">
          <VerdictBanner verdict="AMBER" message="New supplier: verify before paying" />
          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-lg font-semibold text-foreground">Supplier not found</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              “{extracted.supplier_name ?? "This supplier"}” is not in your supplier list. Complete every check before
              paying.
            </p>
            <div className="mt-4 space-y-4">
              <label className="block text-sm">
                <span className="font-medium text-foreground">1. Which staff member ordered this?</span>
                <select
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2"
                  value={checklist.orderedBy}
                  onChange={(e) => setChecklist({ ...checklist, orderedBy: e.target.value })}
                >
                  <option value="">Choose…</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} — {s.role}
                    </option>
                  ))}
                </select>
              </label>
              <YesNo
                label={`2. I have spoken to ${staff.find((s) => s.id === checklist.orderedBy)?.name ?? "the staff member"} and they confirm they ordered these goods/services`}
                value={checklist.confirmedWithStaff}
                onChange={(v) => setChecklist({ ...checklist, confirmedWithStaff: v })}
              />
              <div>
                <YesNo
                  label="3. I phoned the supplier on a number I found independently (their website or Companies House), NOT the number on the invoice"
                  value={checklist.phonedIndependently}
                  onChange={(v) => setChecklist({ ...checklist, phonedIndependently: v })}
                />
                {checklist.phonedIndependently === "yes" && (
                  <input
                    placeholder="Number used"
                    className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={checklist.phoneUsed}
                    onChange={(e) => setChecklist({ ...checklist, phoneUsed: e.target.value })}
                  />
                )}
              </div>
              <YesNo
                label={`4. The supplier confirmed the bank details: sort code ${extracted.sort_code ?? "—"}, account ${extracted.account_number ?? "—"}`}
                value={checklist.bankConfirmed}
                onChange={(v) => setChecklist({ ...checklist, bankConfirmed: v })}
              />
              <YesNo
                label={`5. The supplier confirmed the amount: £${Number(extracted.total ?? 0).toFixed(2)}`}
                value={checklist.amountConfirmed}
                onChange={(v) => setChecklist({ ...checklist, amountConfirmed: v })}
              />
              <label className="block text-sm">
                <span className="font-medium text-foreground">6. Name of the person spoken to at the supplier</span>
                <input
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2"
                  value={checklist.contactName}
                  onChange={(e) => setChecklist({ ...checklist, contactName: e.target.value })}
                />
              </label>
            </div>
            <div className="mt-6 flex gap-3">
              <button
                onClick={approveAndAddSupplier}
                disabled={!checklistComplete || !!busy}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
              >
                {busy ?? "Approve & add supplier"}
              </button>
              <button
                onClick={holdInvoice}
                className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
              >
                Hold
              </button>
            </div>
            {!checklistComplete && (
              <p className="mt-2 text-xs text-muted-foreground">
                All answers must be “yes” (with the number used and contact name) to approve a new supplier.
              </p>
            )}
          </div>
        </div>
      )}

      {step === "decide" && (
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground">Verify before approving</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            This invoice is {verdict}. Approving is allowed — but never silent. Confirm you've verified it first.
          </p>
          <div className="mt-4 space-y-4">
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={verify.phonedOnFile}
                onChange={(e) => setVerify({ ...verify, phonedOnFile: e.target.checked })}
              />
              <span>
                I phoned the supplier on the number <strong>on file</strong> (
                {supplier?.phone_on_file ?? "no number on file"}), not the one on this invoice
              </span>
            </label>
            <label className="block text-sm">
              <span className="font-medium text-foreground">Who I spoke to</span>
              <input
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2"
                value={verify.spokeTo}
                onChange={(e) => setVerify({ ...verify, spokeTo: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-foreground">Outcome</span>
              <select
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2"
                value={verify.outcome}
                onChange={(e) => setVerify({ ...verify, outcome: e.target.value })}
              >
                <option value="">Choose…</option>
                <option value="confirmed">Confirmed genuine</option>
                <option value="not_them">Supplier says NOT from them</option>
                <option value="unreachable">Couldn't reach</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-medium text-foreground">Reason for approving despite the warnings</span>
              <textarea
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2"
                rows={2}
                value={verify.reason}
                onChange={(e) => setVerify({ ...verify, reason: e.target.value })}
              />
            </label>
          </div>
          <div className="mt-6 flex gap-3">
            <button
              onClick={approveInvoice}
              disabled={!verify.phonedOnFile || !verify.outcome || !verify.reason.trim()}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
            >
              Approve for payment
            </button>
            <button
              onClick={holdInvoice}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
            >
              Hold
            </button>
          </div>
        </div>
      )}

      {askBankUpdate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-foreground">Update bank details on file?</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              You confirmed the bank change is genuine. Update {supplier?.legal_name}'s record?
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded bg-muted/60 p-3">
                <span className="block text-xs font-medium text-muted-foreground">Old</span>
                <span className="font-mono">
                  {supplier?.sort_code} · {supplier?.account_number}
                </span>
              </div>
              <div className="rounded bg-muted/60 p-3">
                <span className="block text-xs font-medium text-muted-foreground">New</span>
                <span className="font-mono">
                  {extracted.sort_code} · {extracted.account_number}
                </span>
              </div>
            </div>
            <div className="mt-4 flex gap-3">
              <button
                onClick={() => updateBankDetails(true)}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
              >
                Yes, update
              </button>
              <button
                onClick={() => updateBankDetails(false)}
                className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
              >
                No, keep old
              </button>
            </div>
          </div>
        </div>
      )}

      {step === "done" && (
        <div className="rounded-xl border border-risk-green/40 bg-risk-green-soft p-8 text-center">
          <h2 className="text-xl font-bold text-risk-green">Approved for payment</h2>
          <p className="mt-2 text-sm text-risk-green">
            The invoice is marked approved. No money has moved — pay it through your normal bank process.
          </p>
          <div className="mt-4 flex justify-center gap-3">
            <button
              onClick={() => router.navigate({ to: "/invoices" })}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              View invoices
            </button>
            <button
              onClick={() => window.location.reload()}
              className="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground"
            >
              Check another invoice
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stepper({ step }: { step: Step }) {
  const steps = [
    ["upload", "Upload"],
    ["confirm", "Check extraction"],
    ["checks", "Fraud checks"],
    ["decide", "Decide"],
  ] as const;
  const order: Step[] = ["upload", "confirm", "checks", "decide", "done"];
  const current = order.indexOf(step);
  return (
    <ol className="flex flex-wrap items-center gap-2 text-xs">
      {steps.map(([key, label], i) => (
        <li
          key={key}
          className={cn(
            "flex items-center gap-2 rounded-full border px-3 py-1",
            i < current
              ? "border-risk-green/40 bg-risk-green-soft text-risk-green"
              : i === current
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground",
          )}
        >
          <span className="font-semibold">{i + 1}</span> {label}
        </li>
      ))}
    </ol>
  );
}

function VerdictBanner({ verdict, message }: { verdict: Verdict | null; message?: string }) {
  if (!verdict) return null;
  const styles: Record<Verdict, string> = {
    GREEN: "border-risk-green/40 bg-risk-green-soft text-risk-green",
    AMBER: "border-risk-amber/50 bg-risk-amber-soft text-risk-amber-foreground",
    RED: "border-risk-red/40 bg-risk-red-soft text-risk-red",
  };
  const defaults: Record<Verdict, string> = {
    GREEN: "No issues found — matches this supplier's history.",
    AMBER: "Some things need a second look before you pay.",
    RED: "High-risk changes detected. Verify by phone before paying.",
  };
  return (
    <div className={cn("flex items-center gap-3 rounded-xl border px-5 py-4", styles[verdict])}>
      <VerdictChip verdict={verdict} />
      <span className="text-sm font-medium">{message ?? defaults[verdict]}</span>
    </div>
  );
}

function AiSummaryBox({ summary }: { summary: string | null }) {
  return (
    <div className="mt-4 rounded-lg border border-navy/20 bg-navy-soft p-4">
      <span className="text-xs font-semibold tracking-wide text-primary uppercase">AI summary of the checks above</span>
      <p className="mt-1 text-sm text-foreground">{summary ?? "Writing summary…"}</p>
    </div>
  );
}

function PdfPane({ title, url }: { title: string; url: string | null }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border bg-muted/50 px-4 py-2 text-sm font-medium text-foreground">{title}</div>
      {url ? (
        <iframe src={url} title={title} className="h-[560px] w-full" />
      ) : (
        <div className="flex h-[560px] items-center justify-center text-sm text-muted-foreground">No PDF available</div>
      )}
    </div>
  );
}

function DecisionBar({
  onApprove,
  onHold,
  approveLabel,
}: {
  onApprove: () => void;
  onHold: () => void;
  approveLabel: string;
}) {
  return (
    <div className="flex gap-3">
      <button
        onClick={onApprove}
        className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        {approveLabel}
      </button>
      <button
        onClick={onHold}
        className="rounded-md border border-border px-5 py-2.5 text-sm font-medium text-foreground hover:bg-accent"
      >
        Hold
      </button>
    </div>
  );
}

function YesNo({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="text-sm">
      <span className="font-medium text-foreground">{label}</span>
      <div className="mt-1 flex gap-2">
        {["yes", "no"].map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={cn(
              "rounded-md border px-4 py-1.5 capitalize",
              value === v
                ? v === "yes"
                  ? "border-risk-green bg-risk-green-soft text-risk-green"
                  : "border-risk-red bg-risk-red-soft text-risk-red"
                : "border-border text-muted-foreground hover:bg-accent",
            )}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}

function templateSummary(flags: Flag[], verdict: Verdict): string {
  if (flags.length === 0) {
    return "This invoice matches the supplier's details and history on every check we run. Nothing unusual stood out. You can approve it for payment.";
  }
  const top = flags[0]!;
  const action =
    verdict === "RED"
      ? "Phone the supplier on the number you already have on file before paying."
      : "Double-check the flagged items with the supplier before paying.";
  return `This invoice raised ${flags.length} flag${flags.length === 1 ? "" : "s"}, most importantly: ${top.title.toLowerCase()}. The overall risk level is ${verdict}. ${action}`;
}
