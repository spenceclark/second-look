import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Set a new password — Second Look" },
      { name: "description", content: "Choose a new password for your Second Look account." },
      { property: "og:title", content: "Set a new password — Second Look" },
      { property: "og:description", content: "Choose a new password for your Second Look account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Recovery links arrive with type=recovery in the URL hash; the Supabase
    // client exchanges it for a session automatically.
    const hash = new URLSearchParams(window.location.hash.slice(1));
    if (hash.get("type") !== "recovery") {
      setInvalid(true);
      return;
    }
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords don't match");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      navigate({ to: "/", replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Set a new password</h1>
        {invalid ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              This reset link is invalid or has expired. Request a new one from the sign-in page.
            </p>
            <Link to="/auth" className="text-sm text-primary underline-offset-4 hover:underline">
              Back to sign in
            </Link>
          </div>
        ) : !ready ? (
          <p className="mt-4 text-sm text-muted-foreground">Checking your reset link…</p>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="new-password" className="mb-1 block text-sm font-medium text-foreground">
                New password
              </label>
              <input
                id="new-password"
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label htmlFor="confirm-password" className="mb-1 block text-sm font-medium text-foreground">
                Confirm password
              </label>
              <input
                id="confirm-password"
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            {error && (
              <p className="rounded-md bg-risk-red-soft px-3 py-2 text-sm text-risk-red-foreground">{error}</p>
            )}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {busy ? "Saving…" : "Save new password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
