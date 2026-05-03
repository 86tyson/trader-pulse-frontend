import { useCallback, useEffect, useState } from "react";
import {
  getPendingRecommendations,
  declinePendingRecommendation,
  approvePendingRecommendation,
  describeError,
  ApiError,
  type PendingRecommendation,
} from "@/lib/api";
import { Panel } from "@/components/panel/Panel";
import { StatusBadge } from "@/components/panel/StatusBadge";
import { CheckCircle2, XCircle, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { pushAlertFromError, pushSuccessAlert } from "@/lib/alertCenter";

// PendingRecommendations — admin queue of bot-proposed live trades.
//
// Visible only when IS_ADMIN. The queue is populated by /scan when
// tradingMode='assisted'. Each row shows the proposed symbol/side/size,
// the confidence and risk targets, and Approve/Decline buttons.
//
// SAFETY UI:
//   - Approve sends `confirmedRealMoney:true` and triggers a confirm dialog
//     in the browser before placing the order. There is no way to "approve
//     all" — every order requires its own click.
//   - Decline sends an admin-typed reason (or default "admin declined").
//   - Rate-limit / risk-gate failures surface inline; the row stays in
//     pending state so the admin can retry or decline.

interface Props {
  refreshKey: number;
  onResolved: () => void;
}

const POLL_INTERVAL_MS = 30_000;

const fmtUsd = (n: number | null | undefined): string => {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${n.toFixed(2)}`;
};
const fmtPrice = (n: number | null | undefined): string => {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const fmtPct = (n: number | null | undefined): string => {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(0)}%`;
};

export default function PendingRecommendations({ refreshKey, onResolved }: Props) {
  const [recs, setRecs] = useState<PendingRecommendation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await getPendingRecommendations();
      setRecs(r.recommendations);
      setError(null);
    } catch (e) {
      setError(describeError(e).detail);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refresh, refreshKey]);

  const handleDecline = useCallback(
    async (rec: PendingRecommendation) => {
      const reason = window.prompt(
        `Decline ${rec.symbol} ${rec.side.toUpperCase()} for ${fmtUsd(
          rec.suggestedAmountUsd,
        )}?\n\nOptional reason:`,
        "",
      );
      if (reason === null) return; // cancelled
      setBusyId(rec.id);
      try {
        await declinePendingRecommendation(rec.id, reason || undefined);
        toast({
          title: "Recommendation declined",
          description: `${rec.symbol} ${rec.side} • #${rec.id}`,
        });
        await refresh();
        onResolved();
      } catch (e) {
        const { title, detail } = describeError(e);
        toast({ title, description: detail, variant: "destructive" });
        pushAlertFromError(e);
      } finally {
        setBusyId(null);
      }
    },
    [refresh, onResolved],
  );

  const handleApprove = useCallback(
    async (rec: PendingRecommendation) => {
      // Two-step confirmation: native confirm, with explicit dollar amount + symbol.
      const confirmed = window.confirm(
        `APPROVE LIVE ORDER\n\n` +
          `Symbol:   ${rec.symbol}\n` +
          `Side:     ${rec.side.toUpperCase()}\n` +
          `Amount:   ${fmtUsd(rec.suggestedAmountUsd)}\n` +
          `Stop:     ${fmtPrice(rec.stopLoss)}\n` +
          `Target:   ${fmtPrice(rec.profitTarget)}\n\n` +
          `This will place a REAL Robinhood order. ` +
          `Daily caps + open-position limits still apply.\n\n` +
          `Proceed?`,
      );
      if (!confirmed) return;

      setBusyId(rec.id);
      try {
        const result = await approvePendingRecommendation(rec.id);
        toast({
          title: "Order placed",
          description: `${rec.symbol} ${rec.side} @ ${fmtPrice(result.refPrice)} • RH #${
            result.robinhoodOrderId ?? "—"
          }`,
        });
        pushSuccessAlert(
          "Live order placed",
          `${rec.symbol} ${rec.side} ${fmtUsd(rec.suggestedAmountUsd)}`,
        );
        await refresh();
        onResolved();
      } catch (e) {
        const { title, detail } = describeError(e);
        toast({ title, description: detail, variant: "destructive" });
        pushAlertFromError(e);
        // Re-fetch so the row's state matches whatever the backend now thinks.
        await refresh();
      } finally {
        setBusyId(null);
      }
    },
    [refresh, onResolved],
  );

  if (recs == null) {
    return (
      <Panel title="Pending Approvals">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      </Panel>
    );
  }

  return (
    <Panel
      title="Pending Approvals"
      subtitle="Bot-proposed live trades awaiting your click"
      right={
        <StatusBadge tone={recs.length > 0 ? "warning" : "muted"}>
          {recs.length} pending
        </StatusBadge>
      }
    >
      {error && (
        <div className="mb-3 rounded-lg border border-bear/40 bg-bear/5 p-3 text-sm text-bear flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {recs.length === 0 ? (
        <div className="rounded-lg border border-border bg-card/40 p-5 text-sm text-muted-foreground text-center">
          No pending recommendations.
          <div className="mt-1 text-xs text-muted-foreground/70">
            Run a scan in Assisted mode to propose new trades.
          </div>
        </div>
      ) : (
        <ul className="space-y-3">
          {recs.map((rec) => {
            const isBusy = busyId === rec.id;
            return (
              <li
                key={rec.id}
                className="rounded-xl border border-warning/30 bg-warning/5 p-4"
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="text-base font-semibold tracking-tight">
                      {rec.symbol} · {rec.side.toUpperCase()} · {fmtUsd(rec.suggestedAmountUsd)}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Proposed {new Date(rec.proposedAt + "Z").toLocaleString()} ·
                      Confidence {fmtPct(rec.confidenceScore)}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleDecline(rec)}
                      disabled={isBusy}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs hover:bg-muted/40 disabled:opacity-60"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Decline
                    </button>
                    <button
                      onClick={() => handleApprove(rec)}
                      disabled={isBusy}
                      className="inline-flex items-center gap-1.5 rounded-md bg-bear text-bear-foreground px-3 py-1.5 text-xs font-medium hover:bg-bear/90 disabled:opacity-60"
                    >
                      {isBusy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      )}
                      Approve · LIVE
                    </button>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-px bg-border/60 rounded-lg overflow-hidden border border-border/60 text-xs">
                  <Stat label="Stop" value={fmtPrice(rec.stopLoss)} />
                  <Stat label="Target" value={fmtPrice(rec.profitTarget)} />
                  <Stat label="Invalidate" value={fmtPrice(rec.invalidationLevel)} />
                  <Stat
                    label="R:R"
                    value={rec.riskReward != null ? `${rec.riskReward.toFixed(2)}` : "—"}
                  />
                </div>

                {rec.entryReason && (
                  <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
                    {rec.entryReason}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground/80">
        {label}
      </div>
      <div className="mt-0.5 font-mono-tnum text-sm">{value}</div>
    </div>
  );
}
