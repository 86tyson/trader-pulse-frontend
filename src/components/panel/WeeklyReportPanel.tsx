import { useMemo, useState } from "react";
import { Panel } from "@/components/panel/Panel";
import { StatusBadge } from "@/components/panel/StatusBadge";
import { computeStats } from "./PerformancePanel";
import type { TradeLogEntry } from "@/lib/trading/types";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function WeeklyReportPanel({ entries }: { entries: TradeLogEntry[] }) {
  const [generatedAt, setGeneratedAt] = useState<number | null>(null);
  const weekly = useMemo(() => entries.filter((e) => Date.now() - e.timestamp <= WEEK_MS), [entries]);
  const stats = computeStats(weekly);

  const advice = stats.total === 0
    ? "No closed trades this week. Wait for higher-probability setups; do not force entries."
    : stats.winRate < 50
      ? "Win rate below 50% — tighten filters: require pullback ≥ 4% and R/R ≥ 2:1 next week."
      : stats.netUsd < 0
        ? "Wins outnumber losses but net is negative — losses too large. Consider tighter stops."
        : "Strategy performing within expected range. Maintain discipline; do not increase size.";

  return (
    <Panel
      title="Weekly Report"
      right={
        <button
          onClick={() => setGeneratedAt(Date.now())}
          className="text-xs uppercase tracking-wider px-3 py-1.5 rounded-md border border-border bg-muted/40 hover:bg-muted/70 transition-colors"
        >
          {generatedAt ? "Update Report" : "Generate Report"}
        </button>
      }
    >
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Cell label="Trades This Week" value={String(weekly.filter(e => e.status !== "DECLINED").length)} />
        <Cell label="Wins" value={String(stats.wins)} tone="bull" />
        <Cell label="Losses" value={String(stats.losses)} tone="bear" />
        <Cell
          label="Net Gain / Loss"
          value={`${stats.netUsd >= 0 ? "+" : ""}$${stats.netUsd.toFixed(2)}`}
          tone={stats.netUsd >= 0 ? "bull" : "bear"}
        />
        <Cell label="Best Setup" value={stats.best} />
        <Cell label="Worst Setup" value={stats.worst} />
      </div>
      <div className="mt-4 rounded-lg border border-border/60 bg-muted/20 p-3">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">System Notes</span>
          <StatusBadge tone="accent">Improvement</StatusBadge>
        </div>
        <p className="text-sm text-foreground/85">{advice}</p>
        {generatedAt && (
          <p className="text-[11px] text-muted-foreground mt-2 font-mono-tnum">
            Generated {new Date(generatedAt).toLocaleString()}
          </p>
        )}
      </div>
    </Panel>
  );
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: "bull" | "bear" }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 font-mono-tnum text-base ${tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : ""}`}>
        {value}
      </div>
    </div>
  );
}
