import { useEffect, useState } from "react";
import { getPerformance, describeError } from "@/lib/api";
import { Panel } from "@/components/panel/Panel";
import { StatusBadge } from "@/components/panel/StatusBadge";

interface PerformanceResponse {
  ok: true;
  totalTrades: number;
  wins: number;
  losses: number;
  openOrUnsettled: number;
  winRate: number | null;
  avgWinUsd: number | null;
  avgLossUsd: number | null;
  realizedRR: number | null;
  netPnlUsd: number;
  weeklyPnlUsd: number;
  note?: string;
}

const fmtUsd = (n: number | null | undefined) => {
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n >= 0 ? "+" : "−";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
};

const pnlClass = (n: number | null | undefined) =>
  n == null ? "" : n >= 0 ? "text-bull" : "text-bear";

export default function PerformancePanel() {
  const [data, setData] = useState<PerformanceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPerformance()
      .then((r) => setData(r as PerformanceResponse))
      .catch((e) => setError(describeError(e).detail));
  }, []);

  if (error) {
    return (
      <Panel title="Performance" right={<StatusBadge tone="bear">ERROR</StatusBadge>}>
        <p className="text-sm text-bear">{error}</p>
      </Panel>
    );
  }
  if (!data) {
    return (
      <Panel title="Performance">
        <p className="text-sm text-muted-foreground">Loading performance…</p>
      </Panel>
    );
  }

  const winRatePct = data.winRate == null ? "—" : `${(data.winRate * 100).toFixed(1)}%`;
  const rrLabel = data.realizedRR == null ? "—" : `${data.realizedRR.toFixed(2)} : 1`;

  const stats: Array<{ label: string; value: string; tone?: "bull" | "bear" | "muted" }> = [
    { label: "Total Trades", value: String(data.totalTrades) },
    { label: "Win Rate", value: winRatePct },
    { label: "Wins / Losses", value: `${data.wins} / ${data.losses}` },
    { label: "Open", value: String(data.openOrUnsettled) },
    { label: "Realized R:R", value: rrLabel },
    { label: "Avg Win", value: fmtUsd(data.avgWinUsd), tone: "bull" },
    { label: "Avg Loss", value: fmtUsd(data.avgLossUsd), tone: "bear" },
    { label: "Net P/L", value: fmtUsd(data.netPnlUsd), tone: data.netPnlUsd >= 0 ? "bull" : "bear" },
    { label: "Weekly P/L", value: fmtUsd(data.weeklyPnlUsd), tone: data.weeklyPnlUsd >= 0 ? "bull" : "bear" },
  ];

  return (
    <Panel title="Performance">
      <div className="grid grid-cols-3 gap-3">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-lg bg-muted/30 border border-border/60 p-3"
          >
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {s.label}
            </div>
            <div
              className={`text-sm sm:text-base font-semibold font-mono-tnum mt-1 ${
                s.tone === "bull" ? "text-bull" : s.tone === "bear" ? "text-bear" : ""
              }`}
            >
              {s.value}
            </div>
          </div>
        ))}
      </div>
      {data.note && (
        <p className="text-xs text-muted-foreground italic mt-3">{data.note}</p>
      )}
    </Panel>
  );
}
