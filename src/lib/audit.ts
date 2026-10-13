import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export const CURRENT_USER = "Spencer Clark";

/** Append an event to the audit log. Append-only: no update/delete anywhere in the app. */
export async function logEvent(
  invoiceId: string | null,
  event: string,
  details?: Record<string, unknown>,
  actor: string = CURRENT_USER,
) {
  await supabase.from("audit_log").insert({
    invoice_id: invoiceId,
    actor,
    event,
    details_json: (details ?? null) as Json,
  });
}

export async function getSignedPdfUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from("invoices").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}
