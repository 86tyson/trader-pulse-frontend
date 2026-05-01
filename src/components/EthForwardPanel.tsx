import { useEffect, useState } from "react";
import {
  getForwardLatest,
  describeError,
  type ForwardLatestResponse,
  type ForwardStatus,
} from "@/lib/api";
import { StatusBadge } from "@/components/panel/StatusBadge";
import { CircleDashed, Activity, Check, AlertCircle } from "lucide-react";

// Hero card for the ETH 1D Compression Breakout forward-validation runner.
// State-driven — the dominant headline answers the user's question
// ("what's happening today, and what should I do?") in one phrase.
// Read-only. No strategy logic in the frontend.

const POLL_INTERVAL_MS = 60_000;

const fmtPrice = (n: number | null | undefined): string =>
  n == null || !Number.isFinite(n) ? "—" : `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtUsd = (n: number | null | undefined): string => {
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n >= 0 ? "+" : "−";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
};

const fmtR = (n: number | null | undefined): string => {
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}R`;
};

const fmtDate = (iso: string): string =>
  new Date(iso).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

// Map raw forward state into a presentation tone + headline. The same status
// can render differently depending on signal/realized data (e.g. "closed" with
// positive vs negative P/L).
type Tone = "muted" | "accent" | "bull" | "bear" | "warning";

interface HeroState {
  tone: Tone;
  caption: string; // upper eyebrow (e.g. "ETH 1D · DAY 12")
  headline: string; // the dominant phrase
  body: string; // supporting sentence
  Icon: typeof Activity;
  glow: boolean;
}

function deriveHeroState(data: ForwardLatestResponse): HeroState {
  const { today, forwardWindow, openTrade } = data;
  const dayN = forwardWindow.barsElapsed;
  const eyebrowBase = `ETH 1D Strategy${dayN > 0 ? ` · Day ${dayN}` : ""}`;

  if (today.status === "inactive") {
    return {
      tone: "muted",
      caption: "ETH 1D Strategy · Pre-launch",
      headline: "Standing by",
      body: `Forward validation begins ${fmtDate(forwardWindow.startIso)}. The first daily candle will appear here once it closes.`,
      Icon: CircleDashed,
      glow: false,
    };
  }

  if (today.status === "closed") {
    const pnl = today.realizedPnlUsd ?? 0;
    const win = pnl > 0;
    return {
      tone: win ? "bull" : "bear",
      caption: `${eyebrowBase} · Trade closed today`,
      headline: win ? "Trade closed — winner" : "Trade closed — loser",
      body:
        today.classification === "trade-closed-today"
          ? today.notes.replace(/^Trade closed\.\s*/, "")
          : "Position settled at today's close.",
      Icon: win ? Check : AlertCircle,
      glow: true,
    };
  }

  if (today.status === "open") {
    // Distinguish the entry-bar from a subsequent open bar.
    if (today.classification === "signal-trade-opened") {
      return {
        tone: "bull",
        caption: `${eyebrowBase} · Entry triggered today`,
        headline: "New position opened",
        body: `Compression-breakout setup. Stop is the locked exit point — staged trail and 48-bar time stop applied automatically.`,
        Icon: Activity,
        glow: true,
      };
    }
    const enteredIso = openTrade?.entryDateIso ?? null;
    return {
      tone: "accent",
      caption: `${eyebrowBase} · Position open`,
      headline: "Position open",
      body: enteredIso
        ? `Entered ${fmtDate(enteredIso)}. Staged-trail exit active — no manual action required.`
        : "Open position. Staged-trail exit active.",
      Icon: Activity,
      glow: true,
    };
  }

  // waiting
  return {
    tone: "muted",
    caption: eyebrowBase,
    headline: "No trade today",
    body: `ETH closed at ${fmtPrice(forwardWindow.lastClose)}. The compression-breakout filter is passive — it requires an NR7 contraction with price above the 50-day moving average. Standing by for the next signal.`,
    Icon: CircleDashed,
    glow: false,
  };
}

const toneStyles: Record<Tone, { surface: string; ring: string; iconBg: string; iconText: string }> = {
  muted: {
    surface: "bg-card border-border",
    ring: "",
    iconBg: "bg-muted/60 border-border",
    iconText: "text-muted-foreground",
  },
  accent: {
    surface: "bg-card border-accent/30",
    ring: "shadow-[0_0_0_1px_hsl(var(--accent)/0.25),0_30px_80px_-30px_hsl(var(--accent)/0.4)]",
    iconBg: "bg-accent/15 border-accent/40",
    iconText: "text-accent",
  },
  bull: {
    surface: "bg-card border-bull/30",
    ring: "glow-bull",
    iconBg: "bg-bull/15 border-bull/40",
    iconText: "text-bull",
  },
  bear: {
    surface: "bg-card border-bear/30",
    ring: "glow-bear",
    iconBg: "bg-bear/15 border-bear/40",
    iconText: "text-bear",
  },
  warning: {
    surface: "bg-card border-warning/30",
    ring: "",
    iconBg: "bg-warning/15 border-warning/40",
    iconText: "text-warning",
  },
};

export default function EthForwardPanel() {
  const [data, setData] = useState<ForwardLatestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const r = await getForwardLatest();
        if (!alive) return;
        setData(r);
        setError(null);
      } catch (e) {
        if (!alive) return;
        setError(describeError(e).detail);
      }
    };
    tick();
    const id = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  if (error) {
    return (
      <section className="rounded-2xl border border-bear/40 bg-bear/5 p-8 sm:p-10 animate-fade-in">
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          ETH 1D Strategy
        </p>
        <h2 className="text-2xl font-semibold mt-3 text-bear">
          Forward feed unavailable
        </h2>
        <p className="text-sm text-muted-foreground mt-2 max-w-2xl">{error}</p>
      </section>
    );
  }
  if (!data) {
    return (
      <section className="rounded-2xl border border-border bg-card/60 p-8 sm:p-10 animate-fade-in">
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          ETH 1D Strategy
        </p>
        <h2 className="text-2xl font-semibold mt-3 text-muted-foreground">Loading…</h2>
      </section>
    );
  }

  const hero = deriveHeroState(data);
  const styles = toneStyles[hero.tone];
  const { today, openTrade, forwardWindow } = data;

  const showTradeStrip =
    today.status === "open" || today.status === "closed";
  const showOpenStrip = today.status === "open" && openTrade != null;
  const showClosedStrip = today.status === "closed";

  return (
    <section
      className={`relative rounded-2xl border ${styles.surface} ${styles.ring} p-6 sm:p-10 animate-fade-in overflow-hidden`}
    >
      {/* Soft radial highlight at top */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-glow opacity-60"
      />

      <div className="relative">
        {/* Eyebrow */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            {hero.caption}
          </p>
          <StatusBadge tone="warning">Paper</StatusBadge>
        </div>

        {/* Hero row */}
        <div className="mt-4 flex items-start gap-4 sm:gap-6">
          <div
            className={`shrink-0 h-12 w-12 sm:h-14 sm:w-14 rounded-xl border ${styles.iconBg} flex items-center justify-center`}
          >
            <hero.Icon className={`h-6 w-6 sm:h-7 sm:w-7 ${styles.iconText}`} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight leading-tight">
              {hero.headline}
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground mt-3 max-w-2xl leading-relaxed">
              {hero.body}
            </p>
          </div>
        </div>

        {/* Active-trade detail strip — only when relevant */}
        {showOpenStrip && openTrade && (
          <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-px bg-border/60 rounded-xl overflow-hidden border border-border/60">
            <TradeStat label="Entry" value={fmtPrice(openTrade.entryPrice)} />
            <TradeStat label="Stop" value={fmtPrice(openTrade.stopLoss)} />
            <TradeStat label="Mark" value={fmtPrice(forwardWindow.lastClose)} />
            <TradeStat
              label="Unrealized"
              value={
                today.rMultiple != null
                  ? `${fmtR(today.rMultiple)}  ·  ${fmtUsd(today.unrealizedPnlUsd)}`
                  : fmtUsd(today.unrealizedPnlUsd)
              }
              tone={
                today.unrealizedPnlUsd == null
                  ? "muted"
                  : today.unrealizedPnlUsd >= 0
                  ? "bull"
                  : "bear"
              }
              emphasis
            />
          </div>
        )}

        {showClosedStrip && (
          <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 gap-px bg-border/60 rounded-xl overflow-hidden border border-border/60">
            <TradeStat
              label="P/L"
              value={fmtUsd(today.realizedPnlUsd)}
              tone={
                today.realizedPnlUsd == null
                  ? "muted"
                  : today.realizedPnlUsd >= 0
                  ? "bull"
                  : "bear"
              }
              emphasis
            />
            <TradeStat
              label="R Realized"
              value={fmtR(today.rMultiple)}
              tone={
                today.rMultiple == null
                  ? "muted"
                  : today.rMultiple >= 0
                  ? "bull"
                  : "bear"
              }
            />
            <TradeStat label="Entry" value={fmtPrice(today.entryPrice)} />
          </div>
        )}

        {/* Subtle footer line — last bar context — only when there's NO trade detail */}
        {!showTradeStrip && (
          <p className="mt-8 text-xs text-muted-foreground/70">
            Last evaluated bar:{" "}
            <span className="text-muted-foreground font-mono-tnum">
              {forwardWindow.lastCandleIso}
            </span>{" "}
            · Close{" "}
            <span className="text-muted-foreground font-mono-tnum">
              {fmtPrice(forwardWindow.lastClose)}
            </span>
          </p>
        )}
      </div>
    </section>
  );
}

interface TradeStatProps {
  label: string;
  value: string;
  tone?: "bull" | "bear" | "muted";
  emphasis?: boolean;
}

function TradeStat({ label, value, tone, emphasis }: TradeStatProps) {
  const valueClass = `font-mono-tnum ${emphasis ? "text-xl sm:text-2xl" : "text-base sm:text-lg"} font-semibold ${
    tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : "text-foreground"
  }`;
  return (
    <div className="bg-card px-4 py-3 sm:px-5 sm:py-4">
      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/80">
        {label}
      </div>
      <div className={`mt-1 ${valueClass}`}>{value}</div>
    </div>
  );
}
