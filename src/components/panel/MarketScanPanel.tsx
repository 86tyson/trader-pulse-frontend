import { Panel } from "@/components/panel/Panel";
import { StatusBadge } from "@/components/panel/StatusBadge";
import type { MarketSnapshot } from "@/lib/trading/types";
import type { ScanResult } from "@/lib/trading/strategy";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

const fmt = (n: number, sym: "BTC" | "ETH") =>
  `$${n.toLocaleString(undefined, {
    minimumFractionDigits: sym === "BTC" ? 0 : 2,
    maximumFractionDigits: sym === "BTC" ? 0 : 2,
  })}`;

// Reduce the snapshot to a SINGLE clear decision: BUY / NO TRADE / WAIT.
// Mapping:
//   - has recommendation               → BUY (green)
//   - filters say "wait/insufficient"  → WAIT (yellow)
//   - filters say "no setup"           → NO TRADE (red)
//
// We treat "weak risk/reward" / "low volume" / "low volatility" / "choppy"
// as WAIT (the structural conditions might improve), and trend / regime
// failures as NO TRADE (won't change in the short term).
type Decision = "BUY" | "NO TRADE" | "WAIT";

function decideAndExplain(r: ScanResult): { decision: Decision; reason: string } {
  if (r.recommendation) {
    return { decision: "BUY", reason: "Filters passed — execute trade below." };
  }
  const reasons = r.skipReasons ?? [];
  const primary =
    reasons.find((s) => /MA|trend|regime|downtrend/i.test(s)) ??
    reasons.find((s) => /risk[/_-]?reward|R:?R/i.test(s)) ??
    reasons.find((s) => /volume|volat|choppy/i.test(s)) ??
    reasons[0] ??
    "Filters not satisfied";

  // Trend / regime failure → NO TRADE (doesn't shift in seconds).
  if (/MA|trend|regime|downtrend/i.test(primary)) {
    return { decision: "NO TRADE", reason: primary };
  }
  // R/R, volume, volatility → WAIT (could improve).
  return { decision: "WAIT", reason: primary };
}

const DECISION_STYLES: Record<
  Decision,
  { tone: "bull" | "bear" | "warning"; label: string }
> = {
  BUY: { tone: "bull", label: "BUY" },
  "NO TRADE": { tone: "bear", label: "NO TRADE" },
  WAIT: { tone: "warning", label: "WAIT" },
};

function trendIcon(t: MarketSnapshot["trend"]) {
  if (t === "UPTREND")
    return <TrendingUp className="h-4 w-4 text-bull" />;
  if (t === "DOWNTREND")
    return <TrendingDown className="h-4 w-4 text-bear" />;
  return <Minus className="h-4 w-4 text-muted-foreground" />;
}

export function MarketScanPanel({
  results,
  onScan,
  isLoading = false,
}: {
  results: ScanResult[];
  onScan?: () => void;
  isLoading?: boolean;
}) {
  const hasData = results.length > 0;

  return (
    <Panel
      title="Market"
      subtitle="1H pullback scanner · BTC + ETH"
      right={
        <button
          onClick={onScan}
          disabled={isLoading || !onScan}
          className="text-[11px] uppercase tracking-wider px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary-glow transition-colors font-semibold disabled:opacity-50 disabled:cursor-wait"
        >
          {isLoading ? "Scanning…" : "Scan for Trades"}
        </button>
      }
    >
      {!hasData && !isLoading && (
        <div className="rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground">
          Click <span className="text-foreground font-medium">Scan for Trades</span>{" "}
          to pull live BTC-USD and ETH-USD candles and evaluate the 1h pullback
          filter.
        </div>
      )}
      {isLoading && !hasData && (
        <div className="rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground">
          Fetching live market data…
        </div>
      )}

      {hasData && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {results.map((r) => {
            const s: MarketSnapshot = r.snapshot;
            const { decision, reason } = decideAndExplain(r);
            const style = DECISION_STYLES[decision];
            const positive = s.change24h >= 0;
            return (
              <div
                key={s.symbol}
                className={`rounded-xl border p-5 transition-colors ${
                  decision === "BUY"
                    ? "border-bull/40 bg-bull/5 glow-bull"
                    : decision === "WAIT"
                    ? "border-warning/30 bg-warning/5"
                    : "border-border bg-card/40"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-base font-semibold tracking-tight">
                      {s.symbol}
                    </div>
                    <div className="font-mono-tnum text-2xl sm:text-3xl mt-1 font-semibold">
                      {fmt(s.price, s.symbol)}
                    </div>
                    <div
                      className={`text-xs font-mono-tnum mt-1 flex items-center gap-1.5 ${
                        positive ? "text-bull" : "text-bear"
                      }`}
                    >
                      {trendIcon(s.trend)}
                      {positive ? "▲" : "▼"} {Math.abs(s.change24h).toFixed(2)}%{" "}
                      <span className="text-muted-foreground">24h</span>
                    </div>
                  </div>
                  <StatusBadge tone={style.tone}>{style.label}</StatusBadge>
                </div>
                <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
                  {reason}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
