import { Panel } from "@/components/panel/Panel";
import { StatusBadge } from "@/components/panel/StatusBadge";
import type { Confidence, Recommendation } from "@/lib/trading/types";
import type { ScanResult } from "@/lib/trading/strategy";
import { Check, X, ShieldAlert } from "lucide-react";

const fmt = (n: number, sym: "BTC" | "ETH") =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: sym === "BTC" ? 0 : 2, maximumFractionDigits: sym === "BTC" ? 0 : 2 })}`;

function confTone(c: Confidence) {
  return c === "HIGH" ? "bull" : c === "MEDIUM" ? "accent" : "muted";
}

interface Props {
  results: ScanResult[];
  onApprove: (rec: Recommendation) => void;
  onDecline: (rec: Recommendation) => void;
}

export function RecommendationPanel({ results, onApprove, onDecline }: Props) {
  const valid = results.filter((r) => r.recommendation);
  const blocked = results.filter((r) => !r.recommendation);

  return (
    <Panel
      title="Trade Recommendations"
      right={<StatusBadge tone="warning">PAPER ONLY</StatusBadge>}
    >
      {valid.length === 0 && blocked.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-4 text-sm">
          <p className="font-medium text-foreground/90">Waiting for signal</p>
          <p className="text-muted-foreground mt-1">
            No live recommendation source is connected. Backtests can be run via{" "}
            <code className="text-xs px-1 py-0.5 rounded bg-muted">npm run backtest</code> against
            historical CSV data; live recommendations require a market data feed which is not yet
            wired.
          </p>
        </div>
      )}

      <div className="space-y-4">
        {valid.map(({ recommendation: r, snapshot: s }) => (
          <article
            key={r!.id}
            className={`rounded-xl border p-5 bg-gradient-panel ${
              r!.confidence === "HIGH" ? "border-bull/40 glow-bull" : "border-accent/40"
            }`}
          >
            <header className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-base font-semibold tracking-tight">
                    {r!.symbol} {r!.side} Setup Detected
                  </span>
                  <StatusBadge tone={confTone(r!.confidence)}>{r!.confidence} CONFIDENCE</StatusBadge>
                </div>
                <p className="text-sm text-foreground/85 mt-2">{r!.reasoning}</p>
              </div>
              <div className="text-right">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Suggested Action</div>
                <div className="font-mono-tnum text-lg">
                  {r!.side} ${r!.amountUsd} of {r!.symbol}
                </div>
              </div>
            </header>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
              <Stat label="Entry" value={fmt(r!.entry, r!.symbol)} />
              <Stat label="Profit Target" value={fmt(r!.profitTarget, r!.symbol)} tone="bull" />
              <Stat label="Stop Loss" value={fmt(r!.stopLoss, r!.symbol)} tone="bear" />
              <Stat label="R/R" value={`${r!.riskRewardRatio}:1`} />
            </div>

            <div className="mt-4 grid gap-2 text-sm">
              <Line label="Support / Resistance" value={r!.srNotes} />
              <Line label="Invalidation" value={`If ${r!.symbol} breaks below ${fmt(r!.invalidation, r!.symbol)}, the setup is no longer valid.`} />
              <Line label="Market" value={r!.marketSummary} />
            </div>

            <div className="mt-5 flex gap-3">
              <button
                onClick={() => onApprove(r!)}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-bull text-bull-foreground font-medium hover:bg-bull/90 transition-colors"
              >
                <Check className="h-4 w-4" /> Execute Trade (Paper)
              </button>
              <button
                onClick={() => onDecline(r!)}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-border bg-muted/30 hover:bg-muted/60 transition-colors text-foreground/90"
              >
                <X className="h-4 w-4" /> Decline
              </button>
            </div>
          </article>
        ))}

        {blocked.map((b) => (
          <article key={b.snapshot.symbol} className="rounded-xl border border-border bg-muted/20 p-4 stripe-warning">
            <div className="flex items-start gap-3">
              <ShieldAlert className="h-5 w-5 text-warning mt-0.5 shrink-0" />
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{b.snapshot.symbol}</span>
                  <StatusBadge tone="warning">No Trade</StatusBadge>
                  {b.skippedConfidence && <StatusBadge tone="muted">Logged as Skipped</StatusBadge>}
                </div>
                <p className="text-sm text-foreground/85 mt-1.5">
                  No trade recommended. Market conditions do not meet the required filters.
                </p>
                <ul className="mt-2 space-y-1">
                  {b.skipReasons.map((r) => (
                    <li key={r} className="text-xs text-muted-foreground flex gap-2">
                      <span className="text-warning">•</span> {r}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </article>
        ))}
      </div>
    </Panel>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "bull" | "bear" }) {
  return (
    <div className="rounded-lg bg-muted/30 border border-border/60 p-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`font-mono-tnum text-sm mt-0.5 ${tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : ""}`}>
        {value}
      </div>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-sm">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground mr-2">{label}:</span>
      <span className="text-foreground/90">{value}</span>
    </div>
  );
}
