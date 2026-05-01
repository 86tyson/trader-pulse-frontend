import { useEffect, useState } from "react";
import { getTrades, describeError } from "@/lib/api";
import { Panel } from "@/components/panel/Panel";
import { StatusBadge } from "@/components/panel/StatusBadge";

// Trade History — last 10 trades. Per spec columns: Time / Symbol / Entry /
// Exit / Quantity / P/L / Outcome. Live trades use real entry_price + sell
// fill price; paper trades use the simulated values.

interface TradeRow {
  id: number;
  recommendation_id: string;
  symbol: string;
  side: "buy" | "sell";
  suggested_amount_usd: number;
  status: "simulated" | "executed" | "rejected";
  mode: "paper" | "live";
  simulated_pnl_usd: number | null;
  outcome: string | null;
  created_at: string;
  exit_price: number | null;
  exit_timestamp: string | null;
  entry_price: number | null;
  filled_quantity: number | null;
}

interface TradesResponse {
  ok: true;
  count: number;
  trades: TradeRow[];
}

const HISTORY_LIMIT = 10;

const fmtTime = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const fmtPnl = (n: number | null) => {
  if (n == null) return "—";
  const sign = n >= 0 ? "+" : "−";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
};

const fmtPrice = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? "—" : `$${n.toFixed(2)}`;

const fmtQty = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n)
    ? "—"
    : n.toLocaleString(undefined, {
        minimumFractionDigits: 6,
        maximumFractionDigits: 6,
      });

function outcomeBadge(t: TradeRow) {
  // Win/Loss for closed trades. For live "buy" rows, the outcome reflects
  // the close P/L. For paper, same logic.
  if (t.outcome === "win") return <StatusBadge tone="bull">WIN</StatusBadge>;
  if (t.outcome === "loss") return <StatusBadge tone="bear">LOSS</StatusBadge>;
  if (t.outcome === "breakeven")
    return <StatusBadge tone="muted">FLAT</StatusBadge>;
  if (t.outcome === "cancelled" || t.outcome === "rejected" || t.outcome === "failed")
    return <StatusBadge tone="muted">{t.outcome.toUpperCase()}</StatusBadge>;
  if (t.outcome === "closed")
    return <StatusBadge tone="muted">CLOSED</StatusBadge>;
  if (t.outcome === "partial" || t.outcome === "timeout")
    return <StatusBadge tone="warning">{t.outcome.toUpperCase()}</StatusBadge>;
  return <StatusBadge tone="muted">OPEN</StatusBadge>;
}

export default function TradeLog({ refreshKey }: { refreshKey?: number }) {
  const [trades, setTrades] = useState<TradeRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getTrades()
      .then((r) => {
        if (!alive) return;
        setTrades((r as TradesResponse).trades);
        setError(null);
      })
      .catch((e) => {
        if (!alive) return;
        setError(describeError(e).detail);
      });
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  if (error) {
    return (
      <Panel
        title="Trade History"
        right={<StatusBadge tone="bear">ERROR</StatusBadge>}
      >
        <p className="text-sm text-bear">{error}</p>
      </Panel>
    );
  }
  if (!trades || trades.length === 0) {
    return (
      <Panel
        title="Trade History"
        subtitle="Last 10 closed trades"
        right={<StatusBadge tone="muted">EMPTY</StatusBadge>}
      >
        <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground text-center">
          No trades yet. Approved paper or live orders will appear here once
          they close.
        </div>
      </Panel>
    );
  }

  // Last 10 entries, newest first.
  const recent = trades.slice(0, HISTORY_LIMIT);

  return (
    <Panel
      title="Trade History"
      subtitle={`Last ${recent.length} of ${trades.length} trades`}
    >
      {/* Mobile: stacked cards (one per trade). No horizontal scroll. */}
      <div className="sm:hidden space-y-2">
        {recent.map((t) => {
          const pnl = t.simulated_pnl_usd;
          const pnlClass =
            pnl == null
              ? ""
              : pnl > 0
              ? "text-bull"
              : pnl < 0
              ? "text-bear"
              : "";
          return (
            <div
              key={t.id}
              className="rounded-lg border border-border/60 bg-muted/10 p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold text-sm">{t.symbol}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {fmtTime(t.created_at)}
                  </div>
                </div>
                {outcomeBadge(t)}
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-border/40 text-xs">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground/80">
                    Entry
                  </div>
                  <div className="font-mono-tnum mt-0.5">
                    {fmtPrice(t.entry_price)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground/80">
                    Exit
                  </div>
                  <div className="font-mono-tnum mt-0.5">
                    {fmtPrice(t.exit_price)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground/80">
                    P/L
                  </div>
                  <div className={`font-mono-tnum font-semibold mt-0.5 ${pnlClass}`}>
                    {fmtPnl(pnl)}
                  </div>
                </div>
              </div>
              <div className="text-[10px] text-muted-foreground/70 mt-2 font-mono-tnum">
                Qty {fmtQty(t.filled_quantity)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Tablet+: full table. */}
      <div className="hidden sm:block rounded-lg border border-border/60 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/30">
                <th className="text-left px-3 py-2">Time</th>
                <th className="text-left px-3 py-2">Symbol</th>
                <th className="text-right px-3 py-2">Entry</th>
                <th className="text-right px-3 py-2">Exit</th>
                <th className="text-right px-3 py-2">Quantity</th>
                <th className="text-right px-3 py-2">P/L</th>
                <th className="text-left px-3 py-2">Outcome</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((t, i) => {
                const pnl = t.simulated_pnl_usd;
                const pnlClass =
                  pnl == null
                    ? ""
                    : pnl > 0
                    ? "text-bull"
                    : pnl < 0
                    ? "text-bear"
                    : "";
                return (
                  <tr
                    key={t.id}
                    className={
                      i < recent.length - 1 ? "border-b border-border/40" : ""
                    }
                  >
                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                      {fmtTime(t.created_at)}
                    </td>
                    <td className="px-3 py-2 font-medium">{t.symbol}</td>
                    <td className="px-3 py-2 text-right font-mono-tnum">
                      {fmtPrice(t.entry_price)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono-tnum">
                      {fmtPrice(t.exit_price)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono-tnum text-muted-foreground">
                      {fmtQty(t.filled_quantity)}
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-mono-tnum ${pnlClass}`}
                    >
                      {fmtPnl(pnl)}
                    </td>
                    <td className="px-3 py-2">{outcomeBadge(t)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Panel>
  );
}
