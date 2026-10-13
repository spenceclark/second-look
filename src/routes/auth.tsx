import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => {
    const redirect = search["redirect"];
    return typeof redirect === "string" ? { redirect } : {};
  },
  head: () => ({
    meta: [
      { title: "Sign in — Second Look" },
      { name: "description", content: "Sign in to Second Look to check invoices for fraud before payment." },
      { property: "og:title", content: "Sign in — Second Look" },
      { property: "og:description", content: "Sign in to Second Look to check invoices for fraud before payment." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

type Mode = "signin" | "signup" | "forgot";

function AuthPage() {
  const { redirect: redirectTo } = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Already signed in? Go straight to the app.
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: safeTarget(redirectTo), replace: true });
    });
  }, [navigate, redirectTo]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: safeTarget(redirectTo), replace: true });
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!data.session) {
          setNotice("Account created — check your email to confirm your address, then sign in.");
          setMode("signin");
        } else {
          navigate({ to: safeTarget(redirectTo), replace: true });
        }
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setNotice("If that email has an account, a password reset link is on its way.");
        setMode("signin");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {mode === "signin" && "Sign in to Second Look"}
          {mode === "signup" && "Create your account"}
          {mode === "forgot" && "Reset your password"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "forgot"
            ? "We'll email you a link to set a new password."
            : "Every invoice gets a second look before payment."}
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-foreground">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          {mode !== "forgot" && (
            <div>
              <label htmlFor="password" className="mb-1 block text-sm font-medium text-foreground">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={6}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          )}

          {error && (
            <p className="rounded-md bg-risk-red-soft px-3 py-2 text-sm text-risk-red-foreground">{error}</p>
          )}
          {notice && (
            <p className="rounded-md bg-risk-green-soft px-3 py-2 text-sm text-risk-green-foreground">{notice}</p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {busy
              ? "One moment…"
              : mode === "signin"
                ? "Sign in"
                : mode === "signup"
                  ? "Create account"
                  : "Send reset link"}
          </button>
        </form>

        <div className="mt-4 space-y-1 text-center text-sm">
          {mode === "signin" && (
            <>
              <button
                type="button"
                onClick={() => switchMode(setMode, "forgot")}
                className="block w-full text-muted-foreground underline-offset-4 hover:underline"
              >
                Forgot your password?
              </button>
              <button
                type="button"
                onClick={() => switchMode(setMode, "signup")}
                className="block w-full text-primary underline-offset-4 hover:underline"
              >
                Need an account? Sign up
              </button>
            </>
          )}
          {mode !== "signin" && (
            <button
              type="button"
              onClick={() => switchMode(setMode, "signin")}
              className="block w-full text-primary underline-offset-4 hover:underline"
            >
              Back to sign in
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function switchMode(setMode: (m: Mode) => void, m: Mode) {
  setMode(m);
}

function safeTarget(redirect: string | undefined): string {
  // Only allow same-origin paths; never bounce to an external URL or back to /auth.
  if (!redirect || !redirect.startsWith("/") || redirect.startsWith("//") || redirect.startsWith("/auth")) return "/";
  return redirect;
}
