import { describe, expect, it } from "vitest";
import {
  diffSegments,
  extractDomain,
  levenshtein,
  matchSupplier,
  normalizeName,
  runChecks,
  verdictFromFlags,
  type SupplierRecord,
} from "@/lib/checks";

const hartwell: SupplierRecord = {
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  legal_name: "Hartwell Print & Packaging Ltd",
  aliases: ["Hartwell Print", "Hartwell Packaging"],
  company_number: "08841276",
  vat_number: "GB 284 6619 37",
  email_domain: "hartwellprint.co.uk",
  phone_on_file: "0161 496 0732",
  bank_name: "Barclays Bank UK PLC",
  account_name: "Hartwell Print & Packaging Ltd",
  sort_code: "20-71-64",
  account_number: "43819027",
  usual_terms_days: 30,
  status: "verified",
};

const past = [
  { total: 2238.0, extracted_json: { line_items: [{ description: "Printed boxes" }] } },
  { total: 2244.0, extracted_json: { line_items: [{ description: "Printed boxes" }] } },
  { total: 2379.6, extracted_json: { line_items: [{ description: "Labels" }] } },
];

const cleanInvoice = {
  supplier_name: "Hartwell Print & Packaging Ltd",
  company_number: "08841276",
  vat_number: "GB 284 6619 37",
  email: "accounts@hartwellprint.co.uk",
  phone: "0161 496 0732",
  account_name: "Hartwell Print & Packaging Ltd",
  sort_code: "20-71-64",
  account_number: "43819027",
  terms: "30 days",
  total: 2300,
  line_items: [{ description: "Printed boxes", qty: 100, unit: 23, amount: 2300 }],
};

describe("supplier matching", () => {
  it("matches on company number first", () => {
    const hit = matchSupplier({ supplier_name: "Totally Different Name", company_number: "08841276" }, [hartwell]);
    expect(hit?.id).toBe(hartwell.id);
  });

  it("fuzzy-matches legal name ignoring Ltd, & and punctuation", () => {
    expect(normalizeName("Hartwell Print and Packaging")).toBe(normalizeName("Hartwell Print & Packaging Ltd"));
    const hit = matchSupplier({ supplier_name: "hartwell print & packaging" }, [hartwell]);
    expect(hit?.id).toBe(hartwell.id);
  });

  it("matches on alias", () => {
    const hit = matchSupplier({ supplier_name: "Hartwell Packaging" }, [hartwell]);
    expect(hit?.id).toBe(hartwell.id);
  });

  it("returns null for an unknown supplier", () => {
    expect(matchSupplier({ supplier_name: "Acme Widgets Ltd", company_number: "99999999" }, [hartwell])).toBeNull();
  });
});

describe("fraud rules", () => {
  it("clean invoice from known supplier is GREEN", () => {
    const flags = runChecks(cleanInvoice, hartwell, past, "Invoice for printed boxes, terms 30 days");
    expect(flags).toEqual([]);
    expect(verdictFromFlags(flags)).toBe("GREEN");
  });

  it("changed sort code or account number is HIGH / RED", () => {
    const flags = runChecks({ ...cleanInvoice, account_number: "99112233" }, hartwell, past, "");
    expect(flags.find((f) => f.id === "bank-details")?.severity).toBe("HIGH");
    expect(verdictFromFlags(flags)).toBe("RED");
  });

  it("account name missing '&' counts as HIGH", () => {
    const flags = runChecks(
      { ...cleanInvoice, account_name: "Hartwell Print Packaging Ltd" },
      hartwell,
      past,
      "",
    );
    expect(flags.find((f) => f.id === "account-name")?.severity).toBe("HIGH");
  });

  it("lookalike domain (Levenshtein ≤ 2) is labelled lookalike and HIGH", () => {
    expect(levenshtein("hartwellprint.co.uk", "hartwellprnt.co.uk")).toBeLessThanOrEqual(2);
    expect(extractDomain("accounts@hartwellprnt.co.uk")).toBe("hartwellprnt.co.uk");
    const flags = runChecks({ ...cleanInvoice, email: "accounts@hartwellprnt.co.uk" }, hartwell, past, "");
    const flag = flags.find((f) => f.id === "domain");
    expect(flag?.severity).toBe("HIGH");
    expect(flag?.title).toBe("Lookalike domain");
  });

  it("landline changed to a mobile is HIGH", () => {
    const flags = runChecks({ ...cleanInvoice, phone: "07700 900123" }, hartwell, past, "");
    expect(flags.find((f) => f.id === "phone")?.severity).toBe("HIGH");
  });

  it("VAT mismatch is MEDIUM / AMBER", () => {
    const flags = runChecks({ ...cleanInvoice, vat_number: "GB 999 9999 99" }, hartwell, past, "");
    expect(flags.find((f) => f.id === "vat")?.severity).toBe("MEDIUM");
    expect(verdictFromFlags(flags)).toBe("AMBER");
  });

  it("total above 1.5× the past average is MEDIUM", () => {
    const flags = runChecks({ ...cleanInvoice, total: 8000 }, hartwell, past, "");
    expect(flags.find((f) => f.id === "total-outlier")?.severity).toBe("MEDIUM");
  });

  it("urgent terms wording is MEDIUM", () => {
    const flags = runChecks({ ...cleanInvoice, terms: "Payment due on receipt" }, hartwell, past, "");
    expect(flags.find((f) => f.id === "terms-urgent")?.severity).toBe("MEDIUM");
  });

  it("bank-change wording in the text is MEDIUM", () => {
    const flags = runChecks(cleanInvoice, hartwell, past, "Please note our change of bank details below.");
    expect(flags.find((f) => f.id === "bank-change-text")?.severity).toBe("MEDIUM");
  });

  it("vague new line items are LOW", () => {
    const flags = runChecks(
      { ...cleanInvoice, line_items: [{ description: "Outstanding balance adjustment", amount: 2300 }] },
      hartwell,
      past,
      "",
    );
    expect(flags.find((f) => f.id === "line-items")?.severity).toBe("LOW");
  });
});

describe("diffSegments", () => {
  it("highlights only changed characters", () => {
    const segs = diffSegments("hartwellprint.co.uk", "hartwellprnt.co.uk");
    const changed = segs.filter((s) => s.changed).map((s) => s.text).join("");
    expect(changed).not.toContain("hartwell");
    expect(segs.map((s) => s.text).join("")).toBe("hartwellprnt.co.uk");
  });
});
