import { useCallback, useEffect, useState } from "react";
import {
  adminLogin,
  adminLogout,
  getAdminMe,
  describeError,
  ApiError,
} from "@/lib/api";
import { ShieldAlert, LogIn, Loader2 } from "lucide-react";

// AdminLoginGate
// =============================================================================
// Wraps the admin dashboard. On mount, GETs /admin/me to learn whether the
// browser already has a valid tpai_admin session cookie. If yes, renders
// children. If no, renders a password form that POSTs /admin/login.
//
// The cookie is HttpOnly; this component never sees the cookie value
// directly — it only ever knows authenticated:true|false based on what
// /admin/me returns.
//
// Children also receive a `logout` callback via context-free prop drilling
// (see useAdminLogout hook below). This is exposed so the dashboard's
// logout button can call it without re-importing.
//
// Should be rendered ONLY when IS_ADMIN is true. The public-deployment
// build never reaches this component.

interface AdminLoginGateProps {
  children: React.ReactNode;
}

type GateState =
  | { kind: "loading" }
  | { kind: "needs-login"; error?: string }
  | { kind: "authed" }
  | { kind: "error"; message: string };

export function useAdminLogout(onLoggedOut: () => void) {
  return useCallback(async () => {
    try {
      await adminLogout();
    } catch {
      // Even if the request errors, clear the UI state — the user
      // wants out, and the cookie was either already gone or will be
      // re-validated on next request.
    }
    onLoggedOut();
  }, [onLoggedOut]);
}

export default function AdminLoginGate({ children }: AdminLoginGateProps) {
  const [state, setState] = useState<GateState>({ kind: "loading" });

  const checkAuth = useCallback(async () => {
    try {
      const me = await getAdminMe();
      if (me.authenticated) {
        setState({ kind: "authed" });
      } else {
        setState({ kind: "needs-login" });
      }
    } catch (e) {
      const { detail } = describeError(e);
      setState({ kind: "error", message: detail });
    }
  }, []);

  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  const onLoggedOut = useCallback(() => {
    setState({ kind: "needs-login" });
  }, []);

  if (state.kind === "loading") {
    return <CenteredCard><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></CenteredCard>;
  }

  if (state.kind === "error") {
    return (
      <CenteredCard>
        <div className="flex items-start gap-3 max-w-md">
          <ShieldAlert className="h-6 w-6 text-bear shrink-0 mt-0.5" />
          <div>
            <h2 className="text-lg font-semibold text-foreground">Cannot reach backend</h2>
            <p className="text-sm text-muted-foreground mt-1">{state.message}</p>
            <button
              onClick={() => {
                setState({ kind: "loading" });
                void checkAuth();
              }}
              className="mt-4 text-sm text-primary hover:text-primary/80 underline underline-offset-4"
            >
              Retry
            </button>
          </div>
        </div>
      </CenteredCard>
    );
  }

  if (state.kind === "needs-login") {
    return (
      <LoginForm
        initialError={state.error}
        onSuccess={() => setState({ kind: "authed" })}
      />
    );
  }

  // authed
  return (
    <AdminAuthContext.Provider value={{ logout: onLoggedOut }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

// Minimal context so the dashboard can find the logout callback without
// having to thread it through every component. Defaults to a no-op so
// non-admin renders don't blow up.
import { createContext, useContext } from "react";
const AdminAuthContext = createContext<{ logout: () => void }>({
  logout: () => {
    /* no-op when not in admin context */
  },
});

// Convenience hook for any descendant that wants a logout button.
export function useAdminAuth() {
  return useContext(AdminAuthContext);
}

// ---------------------------------------------------------------------------

function LoginForm({
  initialError,
  onSuccess,
}: {
  initialError?: string;
  onSuccess: () => void;
}) {
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>(initialError);

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!password || submitting) return;
      setSubmitting(true);
      setError(undefined);
      try {
        await adminLogin(password);
        // Re-check via /admin/me so we depend on the same source of truth.
        const me = await getAdminMe();
        if (me.authenticated) {
          onSuccess();
        } else {
          setError("Login appeared to succeed but session check failed. Try again.");
        }
      } catch (e) {
        if (e instanceof ApiError && e.code === "RATE_LIMITED") {
          setError("Too many attempts. Wait 15 minutes before trying again.");
        } else if (e instanceof ApiError && e.code === "UNAUTHENTICATED") {
          setError("Invalid password.");
        } else {
          const { detail } = describeError(e);
          setError(detail);
        }
        // Clear the password field on failure so the operator types fresh.
        setPassword("");
      } finally {
        setSubmitting(false);
      }
    },
    [password, submitting, onSuccess],
  );

  return (
    <CenteredCard>
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-5">
        <div className="space-y-2 text-center">
          <div className="mx-auto h-12 w-12 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center">
            <LogIn className="h-5 w-5 text-primary" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Admin sign-in</h1>
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Trader Pulse AI · live trading dashboard
          </p>
        </div>

        <label className="block">
          <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Password
          </span>
          <input
            type="password"
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={submitting}
            className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono-tnum focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60"
          />
        </label>

        {error && (
          <div className="rounded-lg border border-bear/40 bg-bear/5 px-3 py-2 text-sm text-bear">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || !password}
          className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
          {submitting ? "Signing in…" : "Sign in"}
        </button>

        <p className="text-[11px] text-center text-muted-foreground/80 leading-relaxed">
          Backend session cookie · no API key in this bundle. Failed attempts
          are rate-limited.
        </p>
      </form>
    </CenteredCard>
  );
}

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-4">
      <div className="rounded-2xl border border-border bg-card/60 p-8 sm:p-10 flex items-center justify-center">
        {children}
      </div>
    </div>
  );
}
