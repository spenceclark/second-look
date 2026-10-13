import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

const EXTRACTION_SCHEMA = `{
  "supplier_name": string | null,
  "company_number": string | null,
  "vat_number": string | null,
  "email": string | null,
  "website": string | null,
  "phone": string | null,
  "bank_name": string | null,
  "account_name": string | null,
  "sort_code": string | null,
  "account_number": string | null,
  "invoice_number": string | null,
  "invoice_date": string | null,
  "due_date": string | null,
  "terms": string | null,
  "line_items": [{ "description": string, "qty": number | null, "unit": number | null, "amount": number | null }],
  "total": number | null
}`;

async function callGateway(messages: { role: string; content: string }[]): Promise<string> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI gateway key not configured");
  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: MODEL, messages, temperature: 0 }),
  });
  if (!res.ok) throw new Error(`AI gateway error ${res.status}`);
  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("Empty AI response");
  return content;
}

export const extractInvoiceData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { text: string }) => input)
  .handler(async ({ data }) => {
    const content = await callGateway([
      {
        role: "system",
        content:
          "You extract structured data from UK business invoices. Return ONLY valid JSON matching the schema exactly. Use null for anything not present. Dates as YYYY-MM-DD. Money as numbers in GBP. Sort codes as XX-XX-XX when possible.",
      },
      {
        role: "user",
        content: `Extract this invoice into this JSON schema:\n${EXTRACTION_SCHEMA}\n\nINVOICE TEXT:\n${data.text.slice(0, 20000)}`,
      },
    ]);
    const cleaned = content.replace(/```json|```/g, "").trim();
    try {
      return { ok: true as const, data: JSON.parse(cleaned) };
    } catch {
      return { ok: false as const, error: "Could not parse extracted JSON", raw: cleaned };
    }
  });

export const summarizeFlags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { flags: { severity: string; title: string; detail?: string }[]; verdict: string }) => input)
  .handler(async ({ data }) => {
    const list = data.flags
      .map((f) => `- [${f.severity}] ${f.title}${f.detail ? `: ${f.detail}` : ""}`)
      .join("\n");
    const content = await callGateway([
      {
        role: "system",
        content:
          "You write plain-English summaries of invoice fraud checks for a small-business owner. Exactly 3 sentences. No jargon. The last sentence must state the single action to take. Never change the verdict; only explain the flags you are given.",
      },
      {
        role: "user",
        content: `Verdict: ${data.verdict}\nFlags:\n${list || "(no flags)"}\n\nWrite the 3-sentence summary.`,
      },
    ]);
    return { ok: true as const, summary: content.trim() };
  });
