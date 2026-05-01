import { useEffect, useState } from "react";
import { getWeeklyReport, describeError } from "@/lib/api";
import { Panel } from "@/components/panel/Panel";
import { StatusBadge } from "@/components/panel/StatusBadge";

interface SetupRef {
  recommendationId: string;
  entryReason: string | null;
  pnlUsd: number;
}

interface WeeklyReportResponse {
  ok: true;
  period: "last_7_days";
  totalTrades: number;
  wins: number;
  losses: number;
  netPnlUsd: number;
  bestSetup: SetupRef | null;
  worstSetup: SetupRef | null;
  notes?: string;
}

const fmtPnl = (n: number) => {
  const sign = n >= 0 ? "+" : "−";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
};

export default function WeeklyReport() {
  const [data, setData] = useState<WeeklyReportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getWeeklyReport()
      .then((r) => setData(r as WeeklyReportResponse))
      .catch((e) => setError(describeError(e).detail));
  }, []);

  if (error) {
    return (
      <Panel title="Weekly Report" right={<StatusBadge tone="bear">ERROR</StatusBadge>}>
        <p className="text-sm text-bear">{error}</p>
      </Panel>
    );
  }
  // Hide entirely until there's at least one closed trade in the last 7 days.
  if (!data || data.totalTrades === 0) return null;

  const stats = [
    { label: "Trades", value: String(data.totalTrades) },
    { label: "Wins / Losses", value: `${data.wins} / ${data.losses}` },
    {
      label: "Net P/L",
      value: fmtPnl(data.netPnlUsd),
      tone: data.netPnlUsd >= 0 ? ("bull" as const) : ("bear" as const),
    },
  ];

  return (
    <Panel
      title="Weekly Report"
      subtitle="Last 7 days"
      right={<StatusBadge tone="muted">{data.totalTrades} trades</StatusBadge>}
    >
      <div className="grid grid-cols-3 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg bg-muted/30 border border-border/60 p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {s.label}
            </div>
            <div
              className={`text-base sm:text-lg font-semibold font-mono-tnum mt-1 ${
                s.tone === "bull" ? "text-bull" : s.tone === "bear" ? "text-bear" : ""
              }`}
            >
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {(data.bestSetup || data.worstSetup) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
          {data.bestSetup && (
            <div className="rounded-lg border border-bull/30 bg-bull/5 p-3">
              <div className="flex items-center gap-2 mb-1">
                <StatusBadge tone="bull">Best</StatusBadge>
                <span className="text-bull font-semibold font-mono-tnum">
                  +${data.bestSetup.pnlUsd.toFixed(2)}
                </span>
              </div>
              <p className="text-sm text-foreground/90">
                {data.bestSetup.entryReason ?? "—"}
              </p>
            </div>
          )}
          {data.worstSetup && (
            <div className="rounded-lg border border-bear/30 bg-bear/5 p-3">
              <div className="flex items-center gap-2 mb-1">
                <StatusBadge tone="bear">Worst</StatusBadge>
                <span className="text-bear font-semibold font-mono-tnum">
                  ${data.worstSetup.pnlUsd.toFixed(2)}
                </span>
              </div>
              <p className="text-sm text-foreground/90">
                {data.worstSetup.entryReason ?? "—"}
              </p>
            </div>
          )}
        </div>
      )}

      {data.notes && (
        <p className="text-xs text-muted-foreground italic mt-3 border-t border-border/60 pt-3">
          {data.notes}
        </p>
      )}
    </Panel>
  );
}
