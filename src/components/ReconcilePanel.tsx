import { useState } from "react";
import {
  describeError,
  reconcileLiveFills,
  type ReconcileSummary,
} from "@/lib/api";
import { Panel } from "@/components/panel/Panel";
import { StatusBadge } from "@/components/panel/StatusBadge";
import { useLiveStatus } from "@/hooks/useLiveStatus";
import { refreshLiveStatusNow } from "@/lib/liveStatusStore";
import { pushAlert, pushAlertFromError, pushSuccessAlert } from "@/lib/alertCenter";
import { toast } from "@/hooks/use-toast";
import { RefreshCw } from "lucide-react";

// ReconcilePanel — dedicated section for syncing local state with Robinhood.
//
// Visible whenever Robinhood is connected (independent of LIVE_TRADING_ENABLED
// — reconciliation is a recovery tool that must be available even when the
// kill switch is off).
//
// Features per spec:
//   - "Reconcile with Robinhood" button
//   - Loading state
//   - Summary of last result (orders checked / rows updated / mismatches)
//   - Last sync timestamp (persists in this component's state during the session)

function fmtRelative(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 1000) return "just now";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return `${Math.floor(diff / 3_600_000)}h ago`;
}

export default function ReconcilePanel({
  onComplete,
}: {
  onComplete?: () => void;
}) {
  const { status } = useLiveStatus();
  const [reconciling, setReconciling] = useState(false);
  const [lastSummary, setLastSummary] = useState<ReconcileSummary | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);

  // Don't render if RH isn't connected — nothing to reconcile against.
  if (!status || !status.robinhoodConnected) return null;

  async function handleReconcile() {
    setReconciling(true);
    try {
      const r = await reconcileLiveFills();
      setLastSummary(r);
      setLastSyncAt(Date.now());

      const headline =
        r.rowsUpdated === 0
          ? "Local state already in sync"
          : `${r.rowsUpdated} row${r.rowsUpdated === 1 ? "" : "s"} updated`;
      toast({
        title: "Reconciliation complete",
        description: `${r.ordersChecked} orders checked · ${headline}`,
      });

      // Push a success or warning alert based on outcome.
      if (r.warnings.length > 0) {
        pushAlert({
          tone: "warning",
          title: `Reconcile finished with ${r.warnings.length} warning${r.warnings.length === 1 ? "" : "s"}`,
          detail: r.warnings.slice(0, 3).join(" · "),
          code: "RECONCILE_WARNINGS",
        });
      } else if (r.rowsUpdated > 0) {
        pushSuccessAlert(
          headline,
          `${r.filledFound} filled · ${r.cancelledFound} cancelled · ${r.rejectedFound} rejected/failed · ${r.partialFound} partial`,
        );
      }

      onComplete?.();
      refreshLiveStatusNow();
    } catch (e) {
      const { title, detail } = describeError(e);
      toast({ title, description: detail, variant: "destructive" });
      pushAlertFromError(e);
    } finally {
      setReconciling(false);
    }
  }

  return (
    <Panel
      title="Reconcile with Robinhood"
      subtitle="Read-only sync · no orders placed · safe with kill switch off"
      right={<StatusBadge tone="muted">Recovery Tool</StatusBadge>}
    >
      <div className="rounded-xl border border-border bg-card/40 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <p className="text-sm text-foreground/90 leading-relaxed">
              Checks your real Robinhood trades and updates your app if anything doesn’t match.
            </p>
            {lastSyncAt && (
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground/80 mt-2">
                Last sync: {fmtRelative(lastSyncAt)}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={handleReconcile}
            disabled={reconciling}
            className="px-5 py-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary-glow font-semibold text-sm uppercase tracking-wider transition-all disabled:opacity-50 disabled:cursor-wait flex items-center gap-2 shrink-0"
          >
            <RefreshCw
              className={`h-4 w-4 ${reconciling ? "animate-spin" : ""}`}
            />
            {reconciling ? "Reconciling…" : "Reconcile with Robinhood"}
          </button>
        </div>
      </div>

      {lastSummary && (
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-px bg-border/60 rounded-xl overflow-hidden border border-border/60">
          <Stat label="Checked" value={String(lastSummary.ordersChecked)} />
          <Stat
            label="Updated"
            value={String(lastSummary.rowsUpdated)}
            tone={lastSummary.rowsUpdated > 0 ? "accent" : "muted"}
          />
          <Stat
            label="Filled"
            value={String(lastSummary.filledFound)}
            tone={lastSummary.filledFound > 0 ? "bull" : "muted"}
          />
          <Stat
            label="Cancelled / Rejected"
            value={String(
              lastSummary.cancelledFound + lastSummary.rejectedFound,
            )}
            tone={
              lastSummary.cancelledFound + lastSummary.rejectedFound > 0
                ? "bear"
                : "muted"
            }
          />
          <Stat
            label="Partial"
            value={String(lastSummary.partialFound)}
            tone={lastSummary.partialFound > 0 ? "warning" : "muted"}
          />
        </div>
      )}

      {lastSummary && lastSummary.warnings.length > 0 && (
        <div className="mt-3 rounded-lg border border-warning/40 bg-warning/5 p-3">
          <p className="text-xs font-semibold text-warning uppercase tracking-wider mb-1">
            {lastSummary.warnings.length} warning
            {lastSummary.warnings.length === 1 ? "" : "s"} — manual review may
            be needed
          </p>
          <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
            {lastSummary.warnings.slice(0, 5).map((w, i) => (
              <li key={i}>{w}</li>
            ))}
            {lastSummary.warnings.length > 5 && (
              <li className="italic">
                …and {lastSummary.warnings.length - 5} more
              </li>
            )}
          </ul>
        </div>
      )}
    </Panel>
  );
}

interface StatProps {
  label: string;
  value: string;
  tone?: "bull" | "bear" | "warning" | "accent" | "muted";
}
function Stat({ label, value, tone = "muted" }: StatProps) {
  const valueClass =
    tone === "bull"
      ? "text-bull"
      : tone === "bear"
      ? "text-bear"
      : tone === "warning"
      ? "text-warning"
      : tone === "accent"
      ? "text-accent"
      : "text-foreground";
  return (
    <div className="bg-card px-4 py-3 sm:px-5 sm:py-4">
      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/80">
        {label}
      </div>
      <div
        className={`mt-1 font-mono-tnum text-base sm:text-lg font-semibold ${valueClass}`}
      >
        {value}
      </div>
    </div>
  );
}
