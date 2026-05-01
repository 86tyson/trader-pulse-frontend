import { useEffect, useState } from "react";
import { getAccount, getPerformance, describeError } from "@/lib/api";

// Compact, supporting-cast horizontal strip combining account + performance.
// Replaces the two large side-by-side panels — these numbers should sit
// beneath the Hero, not compete with it.

interface AccountResponse {
  ok: true;
  account: { cashUsd: number; equityUsd: number; buyingPowerUsd: number };
}

interface PerformanceResponse {
  ok: true;
  totalTrades: number;
  wins: number;
  losses: number;
  openOrUnsettled: number;
  winRate: number | null;
  netPnlUsd: number;
}

interface BarData {
  // equityUsd is null when the backend doesn't expose account balances
  // (public read-only deployment). UI renders "—" for null.
  equityUsd: number | null;
  netPnlUsd: number;
  wins: number;
  losses: number;
  winRate: number | null;
  open: number;
}

const usd = (n: number | null) =>
  n == null
    ? "—"
    : n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const fmtPnl = (n: number) => {
  const sign = n >= 0 ? "+" : "−";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
};

interface StatProps {
  label: string;
  value: string;
  tone?: "bull" | "bear" | "muted";
  className?: string;
}

function Stat({ label, value, tone, className = "" }: StatProps) {
  const valueClass =
    tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : "text-foreground";
  return (
    <div
      className={`min-w-0 px-4 sm:px-6 py-3 bg-card/40 ${className}`}
    >
      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/80">
        {label}
      </div>
      <div
        className={`text-base sm:text-xl font-semibold font-mono-tnum mt-0.5 truncate ${valueClass}`}
      >
        {value}
      </div>
    </div>
  );
}

export default function StatsBar({ refreshKey }: { refreshKey?: number }) {
  const [data, setData] = useState<BarData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([getAccount(), getPerformance()])
      .then(([a, p]) => {
        if (!alive) return;
        const acct = a as AccountResponse;
        const perf = p as PerformanceResponse;
        setData({
          equityUsd: acct.account.equityUsd,
          netPnlUsd: perf.netPnlUsd,
          wins: perf.wins,
          losses: perf.losses,
          winRate: perf.winRate,
          open: perf.openOrUnsettled,
        });
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
      <div className="rounded-xl border border-bear/40 bg-bear/10 px-4 py-3 text-sm text-bear">
        Stats unavailable: {error}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="rounded-xl border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  const winRateLabel = data.winRate == null ? "—" : `${(data.winRate * 100).toFixed(0)}%`;
  const wlLabel = `${data.wins} / ${data.losses}`;
  const pnlTone: "bull" | "bear" | "muted" =
    data.netPnlUsd === 0 ? "muted" : data.netPnlUsd > 0 ? "bull" : "bear";

  return (
    // Mobile: 2-col grid (4 cells fill 2 rows + 5th spans full width).
    // sm+: 5-col single row with vertical dividers.
    <div className="rounded-xl border border-border backdrop-blur-sm grid grid-cols-2 sm:grid-cols-5 gap-px bg-border/60 overflow-hidden">
      <Stat label="Equity" value={usd(data.equityUsd)} />
      <Stat label="Net P/L" value={fmtPnl(data.netPnlUsd)} tone={pnlTone} />
      <Stat label="W / L" value={wlLabel} />
      <Stat label="Win Rate" value={winRateLabel} />
      <Stat label="Open" value={String(data.open)} className="col-span-2 sm:col-span-1" />
    </div>
  );
}
