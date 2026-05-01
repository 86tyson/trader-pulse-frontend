import { useEffect, useMemo, useState } from "react";
import {
  closeLivePosition,
  describeError,
  getLiveQuote,
  getTrades,
  reconcileLiveFills,
} from "@/lib/api";
import { Panel } from "@/components/panel/Panel";
import { StatusBadge } from "@/components/panel/StatusBadge";
import { useLiveStatus } from "@/hooks/useLiveStatus";
import { refreshLiveStatusNow } from "@/lib/liveStatusStore";
import { pushAlertFromError, pushSuccessAlert } from "@/lib/alertCenter";
import { toast } from "@/hooks/use-toast";
import { RefreshCw, X as CloseIcon } from "lucide-react";

// Active-trade panel — the centerpiece of the trading control system.
//
// Two states:
//   - No open position → quiet "No active trade" empty state.
//   - Open position    → entry/quantity/now/unrealized + Close + Reconcile.
//
// Data sources (read-only, no order placement):
//   - shared useLiveStatus()        → openLivePositions
//   - GET /trades                   → find open buy row, read entry_price,
//                                     filled_quantity, created_at
//   - GET /live/quote/ETH-USD       → current price for unrealized P/L
//
// The Close Position button calls POST /live/close (which polls until
// terminal state and uses ACTUAL sell fill price for realized P/L).
// The Reconcile Fills button calls POST /live/reconcile.

interface OpenPositionView {
  buyTradeId: number;
  symbol: string;
  entryPrice: number | null;
  quantity: number | null;
  createdAtIso: string;
}

interface QuoteView {
  bid: number | null;
  ask: number | null;
  mid: number | null;
}

interface TradeRow {
  id: number;
  recommendation_id: string;
  symbol: string;
  side: "buy" | "sell";
  status: string;
  mode: "paper" | "live";
  outcome: string | null;
  simulated_pnl_usd: number | null;
  entry_price: number | null;
  filled_quantity: number | null;
  created_at: string;
}

interface TradesResponse {
  ok: true;
  count: number;
  trades: TradeRow[];
}

const fmtUsd = (n: number | null | undefined, dp = 2) => {
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n < 0 ? "−" : "";
  return `${sign}$${Math.abs(n).toFixed(dp)}`;
};

const fmtPrice = (n: number | null | undefined) => fmtUsd(n, 2);

const fmtQty = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n)
    ? "—"
    : `${n.toLocaleString(undefined, {
        minimumFractionDigits: 6,
        maximumFractionDigits: 6,
      })} ETH`;

function formatRelativeTime(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  const remM = minutes % 60;
  if (hours < 24) return `${hours}h ${remM}m ago`;
  const days = Math.floor(hours / 24);
  const remH = hours % 24;
  return `${days}d ${remH}h ago`;
}

export default function ActiveTradePanel({
  refreshKey,
  onTradeClosed,
  onClosingChange,
}: {
  refreshKey?: number;
  onTradeClosed?: () => void;
  onClosingChange?: (closing: boolean) => void;
}) {
  const { status } = useLiveStatus();
  const hasOpenPosition = (status?.today.openLivePositions ?? 0) > 0;

  const [openTrade, setOpenTrade] = useState<OpenPositionView | null>(null);
  const [quote, setQuote] = useState<QuoteView | null>(null);
  const [closing, setClosing] = useState(false);
  const [closeConfirmed, setCloseConfirmed] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [tradesError, setTradesError] = useState<string | null>(null);
  const [, setTick] = useState(0); // for "time since entry" repaint

  // Notify the parent (App.tsx → SystemStatusBar) when closing toggles.
  useEffect(() => {
    onClosingChange?.(closing);
  }, [closing, onClosingChange]);

  // Repaint every 30s so "time since entry" stays fresh.
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  // Fetch the open buy from /trades whenever the position state changes.
  useEffect(() => {
    let alive = true;
    if (!hasOpenPosition) {
      setOpenTrade(null);
      return;
    }
    (async () => {
      try {
        const r = (await getTrades()) as TradesResponse;
        if (!alive) return;
        const open = r.trades.find(
          (t) =>
            t.mode === "live" &&
            t.side === "buy" &&
            t.outcome == null &&
            t.status === "executed",
        );
        if (open) {
          setOpenTrade({
            buyTradeId: open.id,
            symbol: open.symbol,
            entryPrice: open.entry_price ?? null,
            quantity: open.filled_quantity ?? null,
            createdAtIso: open.created_at,
          });
          setTradesError(null);
        } else {
          // Status says we have a position but trades doesn't match. Drift
          // case — surface so the user reconciles.
          setOpenTrade(null);
          setTradesError(
            "Status reports an open position but no matching live BUY found in /trades. Run Reconcile.",
          );
        }
      } catch (e) {
        if (!alive) return;
        setTradesError(describeError(e).detail);
      }
    })();
    return () => {
      alive = false;
    };
  }, [hasOpenPosition, refreshKey]);

  // Fetch current ETH-USD quote when there's an open position. Repoll every 30s.
  useEffect(() => {
    if (!hasOpenPosition) {
      setQuote(null);
      return;
    }
    let alive = true;
    const fetch = async () => {
      try {
        const r = await getLiveQuote("ETH-USD");
        if (!alive) return;
        const result =
          (r.data as { results?: Record<string, unknown>[] })?.results?.[0] ??
          (r.data as Record<string, unknown> | undefined) ??
          {};
        const r2 = result as Record<string, unknown>;
        const bid = Number(
          r2.bid_inclusive_of_sell_spread ??
            r2.bid_price ??
            r2.bid ??
            NaN,
        );
        const ask = Number(
          r2.ask_inclusive_of_buy_spread ??
            r2.ask_price ??
            r2.ask ??
            NaN,
        );
        const midRaw = Number(r2.price ?? NaN);
        const mid = Number.isFinite(midRaw)
          ? midRaw
          : Number.isFinite(bid) && Number.isFinite(ask)
          ? (bid + ask) / 2
          : null;
        setQuote({
          bid: Number.isFinite(bid) ? bid : null,
          ask: Number.isFinite(ask) ? ask : null,
          mid,
        });
      } catch {
        if (!alive) return;
        setQuote(null);
      }
    };
    void fetch();
    const id = setInterval(fetch, 30_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [hasOpenPosition]);

  const unrealizedUsd = useMemo(() => {
    if (
      !openTrade ||
      openTrade.entryPrice == null ||
      openTrade.quantity == null ||
      quote?.mid == null
    ) {
      return null;
    }
    return (quote.mid - openTrade.entryPrice) * openTrade.quantity;
  }, [openTrade, quote]);

  async function handleClose() {
    if (!closeConfirmed) return;
    setClosing(true);
    try {
      const result = await closeLivePosition({
        confirmedRealMoney: true,
        note: "Phase 3 close-out from ActiveTradePanel",
      });
      const pnl = result.fill.realizedPnlUsd;
      const sign = pnl >= 0 ? "+" : "−";
      const msg = `Sold ${result.fill.sellFilledQty} ETH @ $${result.fill.sellAvgPrice.toFixed(2)} (actual fill). Realized P/L ${sign}$${Math.abs(pnl).toFixed(2)}.`;
      toast({
        title:
          result.fill.buyOutcome === "win"
            ? "Position closed — winner"
            : "Position closed — loser",
        description: msg,
      });
      pushSuccessAlert(
        result.fill.buyOutcome === "win"
          ? "Position closed (winner)"
          : "Position closed (loser)",
        msg,
      );
      setCloseConfirmed(false);
      onTradeClosed?.();
      refreshLiveStatusNow();
    } catch (e) {
      const { title, detail } = describeError(e);
      toast({ title, description: detail, variant: "destructive" });
      pushAlertFromError(e);
    } finally {
      setClosing(false);
    }
  }

  async function handleReconcile() {
    setReconciling(true);
    try {
      const r = await reconcileLiveFills();
      const summary = `${r.ordersChecked} orders checked · ${r.rowsUpdated} updated`;
      const detail =
        r.rowsUpdated === 0
          ? "Local state already in sync with Robinhood."
          : `Filled ${r.filledFound} · cancelled ${r.cancelledFound} · rejected/failed ${r.rejectedFound} · partial ${r.partialFound}`;
      toast({ title: "Reconciliation complete", description: summary });
      if (r.warnings.length > 0) {
        pushAlertFromError(
          new (class extends Error {
            constructor() {
              super(r.warnings[0]);
            }
          })(),
        );
      } else if (r.rowsUpdated > 0) {
        pushSuccessAlert("Reconciliation applied updates", detail);
      }
      onTradeClosed?.();
      refreshLiveStatusNow();
    } catch (e) {
      const { title, detail } = describeError(e);
      toast({ title, description: detail, variant: "destructive" });
      pushAlertFromError(e);
    } finally {
      setReconciling(false);
    }
  }

  // ---------- Render ----------

  // Empty state — quiet, calm, but visually present.
  if (!hasOpenPosition) {
    return (
      <Panel
        title="Active Trade"
        right={<StatusBadge tone="muted">No Position</StatusBadge>}
      >
        <div className="rounded-xl border border-dashed border-border bg-muted/10 p-8 text-center">
          <div className="text-2xl font-semibold tracking-tight text-foreground/85">
            No active trade
          </div>
          <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
            When a live ETH-USD position is open, this panel will show entry,
            quantity, current price, and unrealized P/L — plus the close
            controls.
          </p>
        </div>
      </Panel>
    );
  }

  // Loading / drift case.
  if (!openTrade) {
    return (
      <Panel
        title="Active Trade"
        right={<StatusBadge tone="warning">Drift</StatusBadge>}
      >
        <p className="text-sm text-muted-foreground">
          {tradesError ?? "Loading position data…"}
        </p>
      </Panel>
    );
  }

  const tone =
    unrealizedUsd == null
      ? "muted"
      : unrealizedUsd >= 0
      ? "bull"
      : "bear";
  const unrealizedClass =
    tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : "";

  return (
    <Panel
      title="Active Trade"
      subtitle={`${openTrade.symbol} · entered ${formatRelativeTime(openTrade.createdAtIso)}`}
      right={
        <StatusBadge tone={closing ? "warning" : "accent"} pulse>
          {closing ? "CLOSING" : "OPEN"}
        </StatusBadge>
      }
    >
      {/* Stat row — emphasise the price + unrealized P/L. */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-px bg-border/60 rounded-xl overflow-hidden border border-border/60">
        <Stat label="Symbol" value={openTrade.symbol} />
        <Stat label="Entry" value={fmtPrice(openTrade.entryPrice)} />
        <Stat label="Quantity" value={fmtQty(openTrade.quantity)} />
        <Stat label="Now" value={fmtPrice(quote?.mid ?? null)} />
        <Stat
          label="Unrealized"
          value={fmtUsd(unrealizedUsd)}
          valueClass={unrealizedClass}
          emphasis
        />
      </div>

      {/* Action row — Close + Reconcile. */}
      <div className="mt-5 rounded-xl border border-accent/30 bg-accent/5 p-4 sm:p-5">
        <label className="flex items-start gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={closeConfirmed}
            onChange={(e) => setCloseConfirmed(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-border accent-bear"
          />
          <span className="text-sm">
            <span className="font-medium text-foreground">
              I understand this closes a real-money position.
            </span>{" "}
            <span className="text-muted-foreground">
              A SELL limit at bid − 0.5% will be sent to Robinhood. Realized
              P/L uses the ACTUAL fill price, not the limit estimate.
            </span>
          </span>
        </label>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleClose}
            disabled={!closeConfirmed || closing || reconciling}
            className="px-6 py-3 rounded-lg bg-accent text-accent-foreground font-semibold text-sm uppercase tracking-wider transition-all hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <CloseIcon className="h-4 w-4" />
            {closing ? "Closing… waiting for fill" : "Close Position"}
          </button>
          <button
            type="button"
            onClick={handleReconcile}
            disabled={reconciling || closing}
            className="px-5 py-3 rounded-lg border border-border bg-card hover:bg-muted/40 text-foreground font-medium text-sm uppercase tracking-wider transition-all disabled:opacity-50 flex items-center gap-2"
          >
            <RefreshCw
              className={`h-4 w-4 ${reconciling ? "animate-spin" : ""}`}
            />
            {reconciling ? "Reconciling…" : "Reconcile Fills"}
          </button>
        </div>

        {closing && (
          <p className="text-[11px] text-accent mt-3 animate-pulse">
            Polling Robinhood every 2s for terminal state (up to 60s)…
          </p>
        )}
      </div>
    </Panel>
  );
}

interface StatProps {
  label: string;
  value: string;
  valueClass?: string;
  emphasis?: boolean;
}
function Stat({ label, value, valueClass = "", emphasis = false }: StatProps) {
  return (
    <div className="bg-card px-4 py-3 sm:px-5 sm:py-4">
      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/80">
        {label}
      </div>
      <div
        className={`mt-1 font-mono-tnum font-semibold ${
          emphasis ? "text-xl sm:text-2xl" : "text-base sm:text-lg"
        } ${valueClass || "text-foreground"}`}
      >
        {value}
      </div>
    </div>
  );
}
