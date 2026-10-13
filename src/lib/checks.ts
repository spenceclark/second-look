// Fixed-rule fraud checks for Second Look.
// AI extracts and explains; these rules decide the risk. Pure functions, no I/O.

export interface ExtractedInvoice {
  supplier_name?: string | null;
  company_number?: string | null;
  vat_number?: string | null;
  email?: string | null;
  website?: string | null;
  phone?: string | null;
  bank_name?: string | null;
  account_name?: string | null;
  sort_code?: string | null;
  account_number?: string | null;
  invoice_number?: string | null;
  invoice_date?: string | null;
  due_date?: string | null;
  terms?: string | null;
  line_items?: { description?: string; qty?: number; unit?: number; amount?: number }[] | null;
  total?: number | null;
}

export interface SupplierRecord {
  id: string;
  legal_name: string;
  aliases: string[];
  company_number: string | null;
  vat_number: string | null;
  email_domain: string | null;
  phone_on_file: string | null;
  bank_name: string | null;
  account_name: string | null;
  sort_code: string | null;
  account_number: string | null;
  usual_terms_days: number | null;
  status: string;
}

export type Severity = "HIGH" | "MEDIUM" | "LOW";
export type Verdict = "GREEN" | "AMBER" | "RED";

export interface Flag {
  id: string;
  severity: Severity;
  title: string;
  was?: string;
  now?: string;
  detail?: string;
}

export function normalizeName(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(ltd|limited|plc|llp|uk|co)\b/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j]! + 1,
        cur[j - 1]! + 1,
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[n]!;
}

export function normalizeDigits(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

export function extractDomain(s: string | null | undefined): string {
  if (!s) return "";
  let v = s.trim().toLowerCase();
  if (v.includes("@")) v = v.split("@")[1]!;
  v = v.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]!;
  return v;
}

export function isMobileNumber(phone: string | null | undefined): boolean {
  const d = normalizeDigits(phone);
  return d.startsWith("07") || d.startsWith("447");
}

/** Match a supplier by company number first, then fuzzy legal name / alias. */
export function matchSupplier(
  extracted: ExtractedInvoice,
  suppliers: SupplierRecord[],
): SupplierRecord | null {
  const cn = normalizeDigits(extracted.company_number);
  if (cn) {
    const hit = suppliers.find((s) => normalizeDigits(s.company_number) === cn);
    if (hit) return hit;
  }
  const name = normalizeName(extracted.supplier_name);
  if (!name) return null;
  for (const s of suppliers) {
    const candidates = [s.legal_name, ...(s.aliases ?? [])].map(normalizeName);
    if (candidates.some((c) => c && (c === name || c.includes(name) || name.includes(c)))) {
      return s;
    }
  }
  return null;
}

const URGENT_TERMS = ["48 hours", "immediately", "due on receipt", "immediate payment"];
const BANK_CHANGE_PHRASES = [
  "change of bank details",
  "moved banks",
  "update your records",
  "old account",
  "new bank account",
  "bank details have changed",
];
const VAGUE_ITEMS = ["adjustment", "outstanding balance", "balance brought forward", "misc"];

export function runChecks(
  extracted: ExtractedInvoice,
  supplier: SupplierRecord,
  pastInvoices: { total: number | null; extracted_json: ExtractedInvoice | null; status?: string | null }[],
  rawText: string,
): Flag[] {
  const flags: Flag[] = [];

  // History = paid or approved invoices only. Pending/held rows (including the
  // invoice being checked, or earlier aborted runs) must not skew the average.
  const history = pastInvoices.filter(
    (p) => p.status === undefined || p.status === null || p.status === "paid" || p.status === "approved",
  );

  // Bank details
  const fileSort = normalizeDigits(supplier.sort_code);
  const newSort = normalizeDigits(extracted.sort_code);
  const fileAcc = normalizeDigits(supplier.account_number);
  const newAcc = normalizeDigits(extracted.account_number);
  if ((newSort && fileSort && newSort !== fileSort) || (newAcc && fileAcc && newAcc !== fileAcc)) {
    flags.push({
      id: "bank-details",
      severity: "HIGH",
      title: "Bank details changed",
      was: `Sort ${supplier.sort_code ?? "—"} · Acc ${supplier.account_number ?? "—"}`,
      now: `Sort ${extracted.sort_code ?? "—"} · Acc ${extracted.account_number ?? "—"}`,
      detail: "Sort code or account number differs from the details on file.",
    });
  }

  // Account name (a missing "&" or "Ltd" counts)
  const fileAccName = (supplier.account_name ?? "").trim().toLowerCase();
  const newAccName = (extracted.account_name ?? "").trim().toLowerCase();
  if (fileAccName && newAccName && fileAccName !== newAccName) {
    flags.push({
      id: "account-name",
      severity: "HIGH",
      title: "Account name differs",
      was: supplier.account_name ?? "",
      now: extracted.account_name ?? "",
      detail: "The bank account name does not exactly match the name on file.",
    });
  }

  // Email / web domain
  const fileDomain = extractDomain(supplier.email_domain);
  const newDomain = extractDomain(extracted.email) || extractDomain(extracted.website);
  if (fileDomain && newDomain && fileDomain !== newDomain) {
    const dist = levenshtein(fileDomain, newDomain);
    flags.push({
      id: "domain",
      severity: "HIGH",
      title: dist <= 2 ? "Lookalike domain" : "Domain differs",
      was: fileDomain,
      now: newDomain,
      detail:
        dist <= 2
          ? `The domain is only ${dist} character${dist === 1 ? "" : "s"} off the real one — a classic impersonation trick.`
          : "The email/web domain does not match the domain on file.",
    });
  }

  // Phone
  const filePhone = normalizeDigits(supplier.phone_on_file);
  const newPhone = normalizeDigits(extracted.phone);
  if (filePhone && newPhone && filePhone !== newPhone) {
    const toMobile = !isMobileNumber(supplier.phone_on_file) && isMobileNumber(extracted.phone);
    flags.push({
      id: "phone",
      severity: "HIGH",
      title: toMobile ? "Phone changed to a mobile" : "Phone number differs",
      was: supplier.phone_on_file ?? "",
      now: extracted.phone ?? "",
      detail: toMobile
        ? "A landline on file has been replaced by a mobile (07…) number on this invoice."
        : "The phone number on this invoice differs from the number on file.",
    });
  }

  // VAT number
  const fileVat = normalizeDigits(supplier.vat_number);
  const newVat = normalizeDigits(extracted.vat_number);
  if (fileVat && newVat && fileVat !== newVat) {
    flags.push({
      id: "vat",
      severity: "MEDIUM",
      title: "VAT number differs",
      was: supplier.vat_number ?? "",
      now: extracted.vat_number ?? "",
    });
  }

  // Total vs average of past invoices
  const totals = history
    .map((p) => (typeof p.total === "number" ? p.total : Number(p.total)))
    .filter((t) => Number.isFinite(t) && t > 0);
  if (totals.length > 0 && typeof extracted.total === "number" && extracted.total > 0) {
    const avg = totals.reduce((a, b) => a + b, 0) / totals.length;
    const ratio = extracted.total / avg;
    if (ratio > 1.5 || ratio < 0.5) {
      const pct = Math.round((ratio - 1) * 100);
      flags.push({
        id: "total-outlier",
        severity: "MEDIUM",
        title: "Total is unusual for this supplier",
        was: `Average £${avg.toFixed(2)}`,
        now: `£${extracted.total.toFixed(2)} (${pct > 0 ? "+" : ""}${pct}%)`,
        detail: `This invoice is ${ratio.toFixed(1)}× the average of ${totals.length} past invoices.`,
      });
    }
  }

  // Terms
  const termsText = (extracted.terms ?? "").toLowerCase();
  const urgent = URGENT_TERMS.find((t) => termsText.includes(t));
  const termsDaysMatch = termsText.match(/(\d+)\s*day/);
  const termsDays = termsDaysMatch ? Number(termsDaysMatch[1]) : null;
  if (urgent) {
    flags.push({
      id: "terms-urgent",
      severity: "MEDIUM",
      title: "Urgent payment wording",
      now: extracted.terms ?? "",
      detail: `Pressure wording detected: "${urgent}". Fraudsters rush you so you skip checks.`,
    });
  } else if (
    termsDays !== null &&
    supplier.usual_terms_days !== null &&
    termsDays < supplier.usual_terms_days
  ) {
    flags.push({
      id: "terms-shorter",
      severity: "MEDIUM",
      title: "Payment terms shortened",
      was: `${supplier.usual_terms_days} days`,
      now: `${termsDays} days`,
    });
  }

  // Bank-change wording in the text
  const lower = rawText.toLowerCase();
  const phrase = BANK_CHANGE_PHRASES.find((p) => lower.includes(p));
  if (phrase) {
    flags.push({
      id: "bank-change-text",
      severity: "MEDIUM",
      title: "Mentions a bank change",
      detail: `The invoice text says "${phrase}". Verify any bank change by phone on the number on file.`,
    });
  }

  // New / vague line items
  const pastDescriptions = new Set(
    history.flatMap((p) =>
      (p.extracted_json?.line_items ?? []).map((li) => normalizeName(li.description)),
    ),
  );
  const newItems = (extracted.line_items ?? []).filter((li) => {
    const d = normalizeName(li.description);
    if (!d) return false;
    if (VAGUE_ITEMS.some((v) => d.includes(v))) return true;
    return pastDescriptions.size > 0 && ![...pastDescriptions].some((pd) => pd.includes(d) || d.includes(pd));
  });
  if (newItems.length > 0) {
    flags.push({
      id: "line-items",
      severity: "LOW",
      title: "New or vague line items",
      now: newItems.map((li) => li.description ?? "").join("; "),
      detail: "These items have not appeared on past invoices from this supplier.",
    });
  }

  return flags;
}

export function verdictFromFlags(flags: Flag[]): Verdict {
  if (flags.some((f) => f.severity === "HIGH")) return "RED";
  if (flags.some((f) => f.severity === "MEDIUM")) return "AMBER";
  return "GREEN";
}

/** Character-level diff: returns segments of `now` marking which chars differ from `was`. */
export function diffSegments(was: string, now: string): { text: string; changed: boolean }[] {
  // Simple LCS-based diff on characters.
  const a = was;
  const b = now;
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i]![j] =
        a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const segments: { text: string; changed: boolean }[] = [];
  let i = 0;
  let j = 0;
  let buf = "";
  let bufChanged = false;
  const push = (ch: string, changed: boolean) => {
    if (buf && changed !== bufChanged) {
      segments.push({ text: buf, changed: bufChanged });
      buf = "";
    }
    buf += ch;
    bufChanged = changed;
  };
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      push(b[j]!, false);
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      i++;
    } else {
      push(b[j]!, true);
      j++;
    }
  }
  while (j < n) push(b[j++]!, true);
  if (buf) segments.push({ text: buf, changed: bufChanged });
  return segments;
}
