import { createFileRoute } from "@tanstack/react-router";
import { PayInvoiceFlow } from "@/components/PayInvoiceFlow";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Pay an invoice — Second Look" },
      {
        name: "description",
        content:
          "Upload an invoice PDF and Second Look checks it for fraud before payment: bank detail changes, lookalike domains, unusual totals.",
      },
      { property: "og:title", content: "Pay an invoice — Second Look" },
      {
        property: "og:description",
        content: "Every invoice checked against supplier history before payment. Warn, never block.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return <PayInvoiceFlow />;
}
