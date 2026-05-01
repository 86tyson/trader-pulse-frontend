import { Panel } from "@/components/panel/Panel";
import type { TradeLogEntry } from "@/lib/trading/types";

export interface PerfStats {
  total: number;
  wins: number;
  losses: number;
  winRate: number;
  avgWinPct: number;
  avgLossPct: number;
  netUsd: number;
  best: string;
  worst: string;
}

export function computeStats(entries: TradeLogEntry[]): PerfStats {
  const closed = entries.filter((e) => e.status === "CLOSED_WIN" || e.status === "CLOSED_LOSS");
  const wins = closed.filter((e) => (e.resultPct ?? 0) > 0);
  const losses = closed.filter((e) => (e.resultPct ?? 0) <= 0);
  const avg = (xs: TradeLogEntry[]) => (xs.length ? xs.reduce((a, b) => a + (b.resultPct ?? 0), 0) / xs.length : 0);
  const netUsd = closed.reduce((a, b) => a + (b.resultUsd ?? 0), 0);
  const best = [...closed].sort((a, b) => (b.resultPct ?? 0) - (a.resultPct ?? 0))[0];
  const worst = [...closed].sort((a, b) => (a.resultPct ?? 0) - (b.resultPct ?? 0))[0];
  return {
    total: closed.length,
    wins: wins.length,
    losses: losses.length,
    winRate: closed.length ? (wins.length / closed.length) * 100 : 0,
    avgWinPct: avg(wins),
    avgLossPct: avg(losses),
    netUsd,
    best: best ? `${best.symbol} ${best.side} ${(best.resultPct ?? 0).toFixed(2)}%` : "—",
    worst: worst ? `${worst.symbol} ${worst.side} ${(worst.resultPct ?? 0).toFixed(2)}%` : "—",
  };
}

export function PerformancePanel({ entries }: { entries: TradeLogEntry[] }) {
  const s = computeStats(entries);
  const items = [
    { label: "Total Trades", value: String(s.total) },
    { label: "Wins", value: String(s.wins), tone: "bull" as const },
    { label: "Losses", value: String(s.losses), tone: "bear" as const },
    { label: "Win Rate", value: `${s.winRate.toFixed(1)}%` },
    { label: "Avg Win", value: `${s.avgWinPct.toFixed(2)}%`, tone: "bull" as const },
    { label: "Avg Loss", value: `${s.avgLossPct.toFixed(2)}%`, tone: "bear" as const },
    { label: "Net P/L", value: `${s.netUsd >= 0 ? "+" : ""}$${s.netUsd.toFixed(2)}`, tone: (s.netUsd >= 0 ? "bull" : "bear") as "bull" | "bear" },
    { label: "Best Setup", value: s.best },
    { label: "Worst Setup", value: s.worst },
  ];
  return (
    <Panel title="Performance Tracking">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {items.map((it) => (
          <div key={it.label} className="rounded-lg border border-border/60 bg-muted/20 p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{it.label}</div>
            <div className={`mt-1 font-mono-tnum text-base ${it.tone === "bull" ? "text-bull" : it.tone === "bear" ? "text-bear" : ""}`}>
              {it.value}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
