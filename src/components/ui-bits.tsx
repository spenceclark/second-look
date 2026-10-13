import { diffSegments, type Severity, type Verdict } from "@/lib/checks";
import { cn } from "@/lib/utils";

export function VerdictChip({ verdict, className }: { verdict: Verdict | null | undefined; className?: string }) {
  if (!verdict) return <span className="text-muted-foreground">—</span>;
  const styles: Record<Verdict, string> = {
    GREEN: "bg-risk-green-soft text-risk-green border-risk-green/30",
    AMBER: "bg-risk-amber-soft text-risk-amber-foreground border-risk-amber/40",
    RED: "bg-risk-red-soft text-risk-red border-risk-red/30",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-wide",
        styles[verdict],
        className,
      )}
    >
      <span
        className={cn("h-1.5 w-1.5 rounded-full", {
          "bg-risk-green": verdict === "GREEN",
          "bg-risk-amber": verdict === "AMBER",
          "bg-risk-red": verdict === "RED",
        })}
      />
      {verdict}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  const styles: Record<Severity, string> = {
    HIGH: "bg-risk-red-soft text-risk-red",
    MEDIUM: "bg-risk-amber-soft text-risk-amber-foreground",
    LOW: "bg-secondary text-secondary-foreground",
  };
  return (
    <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider", styles[severity])}>
      {severity}
    </span>
  );
}

/** Renders `now` with characters that differ from `was` highlighted. */
export function DiffText({ was, now }: { was: string; now: string }) {
  const segments = diffSegments(was, now);
  return (
    <span className="font-mono text-sm break-all">
      {segments.map((s, i) =>
        s.changed ? (
          <mark key={i} className="rounded-sm bg-risk-red-soft px-0.5 font-semibold text-risk-red">
            {s.text}
          </mark>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </span>
  );
}

export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  if (values.length === 0) return null;
  const w = 120;
  const h = 32;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const points = values
    .map((v, i) => `${(i / Math.max(values.length - 1, 1)) * w},${h - ((v - min) / range) * (h - 6) - 3}`)
    .join(" ");
  return (
    <svg width={w} height={h} className={cn("text-primary", className)} aria-label="Past invoice totals">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      {values.map((v, i) => (
        <circle
          key={i}
          cx={(i / Math.max(values.length - 1, 1)) * w}
          cy={h - ((v - min) / range) * (h - 6) - 3}
          r="2.5"
          fill="currentColor"
        />
      ))}
    </svg>
  );
}

export function StatusChip({ status }: { status: string }) {
  const styles: Record<string, string> = {
    paid: "bg-risk-green-soft text-risk-green",
    approved: "bg-risk-green-soft text-risk-green",
    held: "bg-risk-red-soft text-risk-red",
    pending: "bg-secondary text-muted-foreground",
  };
  return (
    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium capitalize", styles[status] ?? styles["pending"])}>
      {status === "approved" ? "Approved" : status}
    </span>
  );
}
