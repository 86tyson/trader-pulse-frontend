import { useCallback, useEffect, useState } from "react";
import {
  approveRecommendation,
  declineRecommendation,
  describeError,
  getHealth,
  runScan,
  IS_ADMIN,
  type HealthResponse,
} from "@/lib/api";
import AdminLoginGate, { useAdminAuth } from "@/components/AdminLoginGate";
import PendingRecommendations from "@/components/PendingRecommendations";
import { LogOut } from "lucide-react";
import type { Recommendation } from "@/lib/trading/types";
import type { ScanResult } from "@/lib/trading/strategy";

import TradeLog from "@/components/TradeLog";
import WeeklyReport from "@/components/WeeklyReport";
import EthForwardPanel from "@/components/EthForwardPanel";
import LivePanel from "@/components/LivePanel";
import RobinhoodPanel from "@/components/RobinhoodPanel";
import RiskModeSelector from "@/components/RiskModeSelector";
import StatsBar from "@/components/StatsBar";
import SystemStatusBar from "@/components/SystemStatusBar";
import ActiveTradePanel from "@/components/ActiveTradePanel";
import ReconcilePanel from "@/components/ReconcilePanel";
import AlertCenter from "@/components/AlertCenter";
import AutoTradingPanel from "@/components/AutoTradingPanel";
import ChatBubble from "@/components/ChatBubble";
import { useRiskMode } from "@/hooks/useRiskMode";
import { MarketScanPanel } from "@/components/panel/MarketScanPanel";
import { RecommendationPanel } from "@/components/panel/RecommendationPanel";
import { StatusBadge } from "@/components/panel/StatusBadge";
import { Activity, ShieldAlert, WifiOff } from "lucide-react";
import { pushAlertFromError, pushSuccessAlert } from "@/lib/alertCenter";

import { toast } from "@/hooks/use-toast";

type HealthStatus = "checking" | "online" | "offline";

// ----- SectionHeader -----
// Small "all-caps tracked-out" label between major page sections. Per UX spec:
// MARKET / ACTIVE TRADE / HISTORY / etc. need to be visually distinct from
// the panel titles inside them.
function SectionHeader({
  label,
  hint,
}: {
  label: string;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-l-2 border-primary/40 pl-3">
      <h2 className="text-sm sm:text-base uppercase tracking-[0.25em] text-foreground/85 font-semibold">
        {label}
      </h2>
      {hint && (
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
          {hint}
        </span>
      )}
    </div>
  );
}

export default function App() {
  // Admin builds: wrap the whole dashboard in a session-cookie gate. Public
  // builds skip the gate entirely (and never see live-trading panels).
  if (IS_ADMIN) {
    return (
      <AdminLoginGate>
        <Dashboard />
      </AdminLoginGate>
    );
  }
  return <Dashboard />;
}

function Dashboard() {
  const [healthStatus, setHealthStatus] = useState<HealthStatus>("checking");
  const [health, setHealth] = useState<HealthResponse | null>(null);

  // Populated by clicking Run Scan. Backend pulls live candles from Coinbase,
  // builds MarketSnapshots, runs evaluateMarket() per symbol, and returns one
  // ScanResult per symbol (recommendation OR skipReasons).
  const [results, setResults] = useState<ScanResult[]>([]);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanGeneratedAt, setScanGeneratedAt] = useState<string | null>(null);

  // Bumped after every approve / decline / close so dashboards re-fetch.
  const [refreshKey, setRefreshKey] = useState(0);
  const triggerRefresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  // Tracked here so SystemStatusBar can show "CLOSING" while a close-out
  // is in flight (lifted up from ActiveTradePanel).
  const [closingInFlight, setClosingInFlight] = useState(false);

  // Strategy Risk Mode — paper-only preference. Never passed to live routes.
  const { mode: riskMode } = useRiskMode();

  const handleScan = useCallback(async () => {
    setScanLoading(true);
    try {
      const response = await runScan("1h");
      setResults(response.results);
      setScanGeneratedAt(response.generatedAt);
      const recs = response.results.filter((r) => r.recommendation).length;
      const blocked = response.results.length - recs;
      const desc =
        recs > 0
          ? `${recs} recommendation${recs === 1 ? "" : "s"}, ${blocked} skipped${response.cached ? " (cached)" : ""}.`
          : `No setups passed the filters. ${blocked} symbols skipped${response.cached ? " (cached)" : ""}.`;
      toast({ title: "Scan complete", description: desc });
      if (recs > 0) pushSuccessAlert("Scan: setup found", desc);
    } catch (e) {
      const { title, detail } = describeError(e);
      toast({ title, description: detail, variant: "destructive" });
      pushAlertFromError(e);
    } finally {
      setScanLoading(false);
    }
  }, []);

  // Health polling — every 30s, plus on mount.
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const h = await getHealth();
        if (!alive) return;
        setHealth(h);
        setHealthStatus("online");
      } catch {
        if (!alive) return;
        setHealth(null);
        setHealthStatus("offline");
      }
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const handleApprove = useCallback(
    async (rec: Recommendation) => {
      try {
        const result = await approveRecommendation(rec, riskMode);
        const outcomeLabel =
          result.outcome === "win"
            ? "WIN"
            : result.outcome === "loss"
            ? "LOSS"
            : result.status.toUpperCase();
        const sizeNote =
          result.effectiveAmountUsd != null && result.effectiveAmountUsd !== rec.amountUsd
            ? ` • size $${result.effectiveAmountUsd} (${riskMode})`
            : "";
        toast({
          title: `Trade ${outcomeLabel}`,
          description: `${rec.symbol} ${rec.side} • trade #${result.tradeId}${
            result.pnlUsd != null
              ? ` • ${result.pnlUsd >= 0 ? "+" : "−"}$${Math.abs(result.pnlUsd).toFixed(2)}`
              : ""
          }${sizeNote}`,
        });
        if (result.outcome === "win" || result.outcome === "loss") {
          pushSuccessAlert(
            `Paper trade ${result.outcome.toUpperCase()}`,
            `${rec.symbol} ${rec.side}${result.pnlUsd != null ? ` · ${result.pnlUsd >= 0 ? "+" : "−"}$${Math.abs(result.pnlUsd).toFixed(2)}` : ""}`,
          );
        }
        setResults((prev) => prev.filter((r) => r.recommendation?.id !== rec.id));
        triggerRefresh();
      } catch (e) {
        const { title, detail } = describeError(e);
        toast({ title, description: detail, variant: "destructive" });
        pushAlertFromError(e);
      }
    },
    [riskMode, triggerRefresh]
  );

  const handleDecline = useCallback(
    async (rec: Recommendation) => {
      try {
        await declineRecommendation(rec.id, "user declined");
        toast({
          title: "Recommendation declined",
          description: `${rec.symbol} ${rec.side} setup logged.`,
        });
        setResults((prev) => prev.filter((r) => r.recommendation?.id !== rec.id));
        triggerRefresh();
      } catch (e) {
        const { title, detail } = describeError(e);
        toast({ title, description: detail, variant: "destructive" });
        pushAlertFromError(e);
      }
    },
    [triggerRefresh]
  );

  // SEO + page title
  useEffect(() => {
    document.title = "Trader Pulse AI";
  }, []);

  // Show the backend banner ONLY when there's something the user needs to know.
  const showBanner =
    healthStatus !== "online" ||
    (health != null && !health.paperMode);

  const hasRecommendation = results.some((r) => r.recommendation);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Subtle radial glow behind the hero. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-[60px] h-[480px] bg-gradient-glow"
      />

      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* SystemStatusBar — sticky at the top, always visible while scrolling. */}
        <SystemStatusBar
          scanning={scanLoading}
          closing={closingInFlight}
        />

        <div className="space-y-12 sm:space-y-14 py-8 sm:py-10">
          {/* Header — minimal brand identity. */}
          <header className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center">
                <Activity className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="text-base sm:text-lg font-semibold tracking-tight">
                  Trader Pulse AI
                </div>
                <div className="text-xs text-muted-foreground -mt-0.5">
                  Paper-mode forward validation
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Risk mode pill is desktop-only — full selector lives below
                  in the Controls section, so on mobile we keep the header
                  uncluttered. */}
              <StatusBadge
                tone={
                  riskMode === "aggressive"
                    ? "bear"
                    : riskMode === "conservative"
                    ? "bull"
                    : riskMode === "soloway_playbook"
                    ? "accent"
                    : "muted"
                }
                className="hidden sm:inline-flex"
              >
                {riskMode === "aggressive"
                  ? "Aggressive"
                  : riskMode === "conservative"
                  ? "Conservative"
                  : riskMode === "soloway_playbook"
                  ? "Soloway"
                  : "Standard"}
              </StatusBadge>
              {health?.liveTradingEnabled ? (
                <StatusBadge tone="bear" pulse>
                  ⚠ Live
                </StatusBadge>
              ) : (
                <StatusBadge tone="warning" pulse>
                  Paper
                </StatusBadge>
              )}
              {IS_ADMIN && <AdminLogoutButton />}
            </div>
          </header>

          {/* AlertCenter — visible only when there are pending alerts. */}
          <AlertCenter />

          {/* AUTO MODE BANNER — visible whenever the bot is auto-executing.
              Cannot be missed; cannot be dismissed. The only way to clear
              it is to switch tradingMode back to assisted or paused. */}
          {IS_ADMIN && <AutoModeBanner />}

          {/* Conditional banner — only when there's a problem worth surfacing. */}
          {showBanner && <BackendBanner status={healthStatus} health={health} />}

          {/* SECTION: ACTIVE TRADE — admin only (reads /live/positions). */}
          {IS_ADMIN && (
            <section className="space-y-4">
              <SectionHeader label="Active Trade" />
              <ActiveTradePanel
                refreshKey={refreshKey}
                onTradeClosed={triggerRefresh}
                onClosingChange={setClosingInFlight}
              />
            </section>
          )}

          {/* SECTION: STRATEGY */}
          <section className="space-y-4">
            <SectionHeader label="Strategy" hint="ETH 1D forward validation" />
            <EthForwardPanel />
          </section>

          {/* SECTION: MARKET */}
          <section className="space-y-4">
            <SectionHeader label="Market" hint="1H pullback scanner" />

            {/* Paper account stats strip — supporting context. */}
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground/80">
                Paper Account (Simulation)
              </p>
              <StatsBar refreshKey={refreshKey} />
            </div>

            {/* Robinhood account / holdings — admin only (reads /live/account). */}
            {IS_ADMIN && <RobinhoodPanel />}

            {/* Scanner + recommendations — admin only (uses /scan + /trade/approve). */}
            {IS_ADMIN && (
              <>
                <div className="space-y-3">
                  <MarketScanPanel
                    results={results}
                    onScan={handleScan}
                    isLoading={scanLoading}
                  />
                  {scanGeneratedAt && (
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground/70 text-right pr-1">
                      Last scan {new Date(scanGeneratedAt).toLocaleString()}
                    </p>
                  )}
                </div>

                {hasRecommendation && (
                  <RecommendationPanel
                    results={results}
                    onApprove={handleApprove}
                    onDecline={handleDecline}
                  />
                )}
              </>
            )}
          </section>

          {/* SECTION: PENDING APPROVALS — admin only. Bot-proposed live trades
              waiting for an explicit click. Populated by /scan when
              tradingMode='assisted'. */}
          {IS_ADMIN && (
            <section className="space-y-4">
              <SectionHeader label="Pending Approvals" hint="Bot-proposed · requires manual click" />
              <PendingRecommendations
                refreshKey={refreshKey}
                onResolved={triggerRefresh}
              />
            </section>
          )}

          {/* SECTION: CONTROLS — admin only. The entire section toggles trading
              modes, places live orders, runs reconcile. None of it is safe to
              expose on the public read-only deployment. */}
          {IS_ADMIN && (
            <section className="space-y-4">
              <SectionHeader label="Controls" hint="Trading mode · risk mode · live actions · reconcile" />

              {/* Trading mode (paused / assisted / auto). Backed by /admin/mode. */}
              <AutoTradingPanel />

              <RiskModeSelector />

              {/* Live BUY panel — renders only when LIVE_TRADING_ENABLED=true and no open position. */}
              <LivePanel onTradePlaced={triggerRefresh} />

              {/* Reconcile is its own dedicated panel; visible whenever RH connected. */}
              <ReconcilePanel onComplete={triggerRefresh} />
            </section>
          )}

          {/* SECTION: HISTORY — TradeLog is public (uses /api/public/trades).
              WeeklyReport hits the bearer-protected /weekly-report so it's
              admin only. */}
          <section className="space-y-4">
            <SectionHeader label="History" hint={IS_ADMIN ? "Trade log · weekly report" : "Trade log"} />
            <TradeLog refreshKey={refreshKey} />
            {IS_ADMIN && <WeeklyReport key={`week-${refreshKey}`} />}
          </section>

          <footer className="pt-8 text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60 text-center">
            Paper trading by default · No live orders without explicit approval
          </footer>
        </div>
      </div>

      {/* Floating Account Assistant — admin only (calls bearer-protected /ai/*). */}
      {IS_ADMIN && <ChatBubble />}
    </div>
  );
}

function BackendBanner({
  status,
  health,
}: {
  status: HealthStatus;
  health: HealthResponse | null;
}) {
  const shell = (opts: {
    icon: React.ReactNode;
    badge: React.ReactNode;
    title: string;
    detail?: React.ReactNode;
    border: string;
    bg: string;
  }) => (
    <div
      className={`rounded-xl border ${opts.border} ${opts.bg} px-4 py-3 flex items-center gap-3 backdrop-blur-sm`}
    >
      <div className="shrink-0">{opts.icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">{opts.title}</span>
          {opts.badge}
        </div>
        {opts.detail && (
          <div className="text-xs text-muted-foreground mt-0.5">{opts.detail}</div>
        )}
      </div>
    </div>
  );

  if (status === "checking") {
    return shell({
      icon: <Activity className="h-4 w-4 text-muted-foreground animate-pulse" />,
      badge: <StatusBadge tone="muted">Checking</StatusBadge>,
      title: "Probing backend…",
      border: "border-border",
      bg: "bg-muted/30",
    });
  }

  if (status === "offline") {
    return shell({
      icon: <WifiOff className="h-4 w-4 text-bear" />,
      badge: <StatusBadge tone="bear">Offline</StatusBadge>,
      title: "Backend unreachable",
      detail: "Approvals and the trade log will not work until the backend is restarted.",
      border: "border-bear/40",
      bg: "bg-bear/10",
    });
  }

  if (health && !health.paperMode) {
    return shell({
      icon: <ShieldAlert className="h-4 w-4 text-bear" />,
      badge: <StatusBadge tone="bear">LIVE MODE</StatusBadge>,
      title: "Real-money mode is active.",
      detail: "Orders will hit Robinhood. Set PAPER_MODE=true on the backend.",
      border: "border-bear/40",
      bg: "bg-bear/10",
    });
  }

  return null;
}

// AutoModeBanner — large, undismissable red bar that renders only when
// tradingMode === 'auto' on the server. Polls /admin/mode every 60s so
// switching off via UI clears it within a tick.
function AutoModeBanner() {
  const [isAuto, setIsAuto] = useState(false);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const api = await import("@/lib/api");
        const s = await api.getTradingMode();
        if (!alive) return;
        setIsAuto(s.mode === "auto");
      } catch {
        // If we can't reach the backend, fail closed (assume not auto).
        if (alive) setIsAuto(false);
      }
    };
    void check();
    const id = setInterval(check, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  if (!isAuto) return null;

  return (
    <div className="rounded-xl border-2 border-bear bg-bear/20 px-4 py-3 flex items-center gap-3 shadow-[0_0_0_2px_hsl(var(--bear)/0.4)]">
      <ShieldAlert className="h-5 w-5 text-bear shrink-0 animate-pulse" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-bear uppercase tracking-wider">
          ⚠ AUTO TRADING ACTIVE · REAL MONEY FLOWING
        </div>
        <div className="text-xs text-foreground/85 mt-0.5 leading-relaxed">
          The bot is placing live Robinhood orders <span className="font-semibold">without manual approval</span>.
          Switch to PAUSED below to stop new trades immediately. Caps and existing safety gates still apply.
        </div>
      </div>
    </div>
  );
}

// Small icon button — visible only in admin builds. Calls /admin/logout
// (which clears the HttpOnly cookie at the server) and bounces back to
// the login form via the AdminLoginGate context.
function AdminLogoutButton() {
  const { logout } = useAdminAuth();
  return (
    <button
      onClick={() => {
        // Fire and forget; useAdminLogout in the gate handles errors.
        // We trigger the local "needs-login" state via the context callback.
        import("@/lib/api").then((api) => {
          void api.adminLogout().finally(() => logout());
        });
      }}
      title="Sign out of admin"
      aria-label="Sign out"
      className="ml-1 inline-flex items-center justify-center h-7 w-7 rounded-md border border-border/60 text-muted-foreground hover:text-foreground hover:border-border transition"
    >
      <LogOut className="h-3.5 w-3.5" />
    </button>
  );
}
