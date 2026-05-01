import { useState } from "react";
import {
  approveLiveTrade,
  describeError,
} from "@/lib/api";
import { Panel } from "@/components/panel/Panel";
import { StatusBadge } from "@/components/panel/StatusBadge";
import { ShieldAlert, Lock } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useLiveStatus } from "@/hooks/useLiveStatus";
import { refreshLiveStatusNow } from "@/lib/liveStatusStore";
import { pushAlertFromError, pushSuccessAlert } from "@/lib/alertCenter";

// LivePanel — Phase 3 BUY entry point. Slim and focused:
//   - Renders ONLY when LIVE_TRADING_ENABLED is true AND there is no open
//     live position. Close-out lives in ActiveTradePanel; reconcile lives
//     in ReconcilePanel (always visible when RH connected).
//   - Single concern: stage and submit a $10 ETH live BUY.
//   - All risk gates are enforced by the backend regardless; the UI is just
//     the editor's hat over the same rules. Defence in depth.

const fmtUsd = (n: number) =>
  n.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });

export default function LivePanel({
  onTradePlaced,
}: {
  onTradePlaced?: () => void;
}) {
  const { status } = useLiveStatus();
  const [buyConfirmed, setBuyConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Hide the panel entirely unless we have a clean buy lane:
  //   - Robinhood connected
  //   - Kill switch on
  //   - No open position (close-out flow lives in ActiveTradePanel)
  if (!status) return null;
  if (!status.robinhoodConnected) return null;
  if (!status.liveTradingEnabled) return null;
  if (status.today.openLivePositions >= 1) return null;

  const remainingLossBudget = Math.max(
    0,
    status.caps.dailyLossCapUsd - status.today.liveRealizedLossUsd,
  );
  const blockedByLossCap = remainingLossBudget <= 0;
  const orderUsd = status.caps.maxOrderUsd;

  async function handleApprove() {
    if (!buyConfirmed) return;
    setSubmitting(true);
    try {
      const recommendationId = `live-eth-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const result = await approveLiveTrade({
        recommendationId,
        symbol: "ETH-USD",
        side: "buy",
        usdAmount: orderUsd,
        confirmedRealMoney: true,
        orderType: "limit",
        note: "Phase 3 manual approval",
      });
      const msg = `Trade #${result.tradeId} · ${result.sizing.assetQuantity} ETH @ $${result.sizing.limitPrice}`;
      toast({ title: "Live order placed", description: msg });
      pushSuccessAlert("Live BUY order placed", msg);
      setBuyConfirmed(false);
      onTradePlaced?.();
      refreshLiveStatusNow();
    } catch (e) {
      const { title, detail } = describeError(e);
      toast({ title, description: detail, variant: "destructive" });
      pushAlertFromError(e);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Panel
      title="Live BUY"
      subtitle="Real money — ETH-USD only · approval required"
      right={
        <StatusBadge tone="bear" pulse>
          ⚠ LIVE ON
        </StatusBadge>
      }
    >
      <div className="rounded-xl border border-bear/40 bg-bear/5 p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <ShieldAlert className="h-5 w-5 text-bear shrink-0" />
          <p className="text-sm text-foreground/90 leading-relaxed">
            Orders submitted here are sent to Robinhood Crypto and use real
            funds. Phase 3: ETH-USD only, capped at{" "}
            <span className="font-semibold">{fmtUsd(orderUsd)}</span> per order,
            daily loss cap{" "}
            <span className="font-semibold">
              {fmtUsd(status.caps.dailyLossCapUsd)}
            </span>
            .
          </p>
        </div>
      </div>

      {blockedByLossCap ? (
        <div className="mt-4 rounded-xl border border-warning/40 bg-warning/5 p-4 flex items-start gap-3">
          <Lock className="h-4 w-4 text-warning shrink-0 mt-0.5" />
          <div className="text-sm">
            <div className="font-medium text-warning">
              Today's loss cap reached
            </div>
            <div className="text-muted-foreground mt-0.5">
              Live BUY is locked until UTC midnight. Daily loss budget:{" "}
              {fmtUsd(status.caps.dailyLossCapUsd)} · realized:{" "}
              {fmtUsd(status.today.liveRealizedLossUsd)}.
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-border bg-card/40 p-4 sm:p-5">
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={buyConfirmed}
              onChange={(e) => setBuyConfirmed(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-border accent-bear"
            />
            <span className="text-sm">
              <span className="font-medium text-foreground">
                I understand this uses real money.
              </span>{" "}
              <span className="text-muted-foreground">
                A {fmtUsd(orderUsd)} ETH-USD limit order will be sent to
                Robinhood immediately upon approval (price = ask + 0.5%).
              </span>
            </span>
          </label>

          <button
            type="button"
            onClick={handleApprove}
            disabled={!buyConfirmed || submitting}
            className="mt-4 w-full sm:w-auto px-6 py-3 rounded-lg bg-bear text-bear-foreground font-semibold text-sm uppercase tracking-wider transition-all hover:bg-bear/90 disabled:opacity-40 disabled:cursor-not-allowed glow-bear"
          >
            {submitting
              ? "Placing order…"
              : `Approve ${fmtUsd(orderUsd)} LIVE ETH trade`}
          </button>

          <p className="text-[10px] text-muted-foreground mt-3 leading-relaxed">
            Server re-verifies every safety gate before forwarding to Robinhood.
            Order type: limit · time-in-force: gtc · price: ask + 0.5% buffer.
          </p>
        </div>
      )}
    </Panel>
  );
}
