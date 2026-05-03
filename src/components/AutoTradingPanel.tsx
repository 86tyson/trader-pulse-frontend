import { useCallback, useEffect, useState } from "react";
import { Panel } from "@/components/panel/Panel";
import { StatusBadge } from "@/components/panel/StatusBadge";
import {
  getTradingMode,
  setTradingMode,
  getBotLoopStatus,
  describeError,
  type TradingMode,
  type TradingModeStatus,
  type BotLoopStatus,
} from "@/lib/api";
import {
  ShieldCheck,
  Zap,
  Pause,
  Lock,
  AlertTriangle,
  Loader2,
  Clock,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { pushAlertFromError } from "@/lib/alertCenter";

// AutoTradingPanel — interactive mode selector for the admin dashboard.
//
// Three modes (paused / assisted / auto) are surfaced as cards with click
// handlers. The current mode is loaded from /admin/mode on mount; changes
// POST back to /admin/mode and re-render based on the response.
//
// Auto is locked in this build: the API rejects setMode('auto') with
// NOT_IMPLEMENTED. The card is rendered with a lock icon and a tooltip
// explaining the gate.
//
// Env-level ceilings are surfaced as a hierarchy grid below the cards so
// the operator always sees the unmovable safety floor.

const POLL_INTERVAL_MS = 60_000;

interface ModeCardProps {
  mode: TradingMode;
  current: TradingMode;
  locked?: string;
  busy: boolean;
  onSelect: (mode: TradingMode) => void;
}

const MODE_META: Record<TradingMode, {
  title: string;
  blurb: string;
  Icon: typeof ShieldCheck;
  toneActive: "muted" | "warning" | "bear";
}> = {
  paused: {
    title: "Paused",
    blurb: "Bot does not evaluate or trade. Manual approval still works. Emergency stop.",
    Icon: Pause,
    toneActive: "muted",
  },
  assisted: {
    title: "Assisted",
    blurb: "Bot proposes trades. Every order requires your manual approval before placement.",
    Icon: ShieldCheck,
    toneActive: "warning",
  },
  auto: {
    title: "Full Auto",
    blurb: "Bot places orders automatically without manual approval. Locked until implemented.",
    Icon: Zap,
    toneActive: "bear",
  },
};

function ModeCard({ mode, current, locked, busy, onSelect }: ModeCardProps) {
  const meta = MODE_META[mode];
  const isCurrent = current === mode;
  const isLocked = !!locked;
  const tone = isCurrent ? meta.toneActive : "muted";

  const surfaceClass = isCurrent
    ? tone === "bear"
      ? "border-bear/50 bg-bear/10"
      : tone === "warning"
      ? "border-warning/50 bg-warning/10"
      : "border-primary/40 bg-primary/5"
    : isLocked
    ? "border-border/60 bg-muted/20 opacity-70"
    : "border-border bg-card hover:border-primary/40 hover:bg-primary/5";

  return (
    <button
      type="button"
      disabled={busy || isLocked || isCurrent}
      onClick={() => onSelect(mode)}
      title={locked || (isCurrent ? "Currently active" : "Click to switch")}
      className={`relative text-left rounded-xl border p-4 transition ${surfaceClass} ${
        !isLocked && !isCurrent ? "cursor-pointer" : "cursor-default"
      } disabled:cursor-default`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`shrink-0 h-9 w-9 rounded-lg border flex items-center justify-center ${
            isCurrent
              ? tone === "bear"
                ? "border-bear/40 bg-bear/15 text-bear"
                : tone === "warning"
                ? "border-warning/40 bg-warning/15 text-warning"
                : "border-primary/40 bg-primary/15 text-primary"
              : "border-border bg-muted/40 text-muted-foreground"
          }`}
        >
          {isLocked && !isCurrent ? <Lock className="h-4 w-4" /> : <meta.Icon className="h-4 w-4" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold">{meta.title}</span>
            {isCurrent && <StatusBadge tone={tone}>ACTIVE</StatusBadge>}
            {isLocked && !isCurrent && <StatusBadge tone="muted">LOCKED</StatusBadge>}
          </div>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{meta.blurb}</p>
          {isLocked && !isCurrent && (
            <p className="mt-2 text-[11px] text-muted-foreground/80 leading-snug">{locked}</p>
          )}
        </div>
      </div>
    </button>
  );
}

export default function AutoTradingPanel() {
  const [status, setStatus] = useState<TradingModeStatus | null>(null);
  const [botLoop, setBotLoop] = useState<BotLoopStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      // Fetch both in parallel; mode is required, bot-loop is best-effort.
      const [s, bl] = await Promise.all([
        getTradingMode(),
        getBotLoopStatus().catch(() => null),
      ]);
      setStatus(s);
      setBotLoop(bl);
      setError(null);
    } catch (e) {
      setError(describeError(e).detail);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const handleSelect = useCallback(
    async (mode: TradingMode) => {
      if (!status || mode === status.mode) return;

      // Confirm any non-pause transition. Going UP in trading capability
      // (paused → assisted) gets a softer confirm; auto is rejected by API.
      const confirmText =
        mode === "paused"
          ? `PAUSE the bot?\n\nThe bot will stop evaluating new trades. ` +
            `Manual approval still works. Existing live positions are unaffected.`
          : mode === "assisted"
          ? `Enable ASSISTED trading?\n\n` +
            `The bot will evaluate scans and propose live trades. ` +
            `Each proposed trade requires your manual approval before placement.\n\n` +
            `Daily caps still apply ($10/order, $10 daily loss, ETH-USD only).\n\n` +
            `Proceed?`
          : `Switch to ${mode}?`;
      if (!window.confirm(confirmText)) return;

      setBusy(true);
      try {
        const next = await setTradingMode(mode);
        setStatus(next);
        toast({
          title: "Trading mode changed",
          description: `Now in ${mode.toUpperCase()} mode.`,
        });
      } catch (e) {
        const { title, detail } = describeError(e);
        toast({ title, description: detail, variant: "destructive" });
        pushAlertFromError(e);
      } finally {
        setBusy(false);
      }
    },
    [status],
  );

  if (!status) {
    return (
      <Panel title="Trading Mode">
        {error ? (
          <p className="text-sm text-bear">{error}</p>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        )}
      </Panel>
    );
  }

  const { mode, ceilings, lockedModes } = status;

  return (
    <Panel
      title="Trading Mode"
      subtitle="Admin-controlled · paused / assisted / auto"
      right={
        <StatusBadge
          tone={mode === "paused" ? "muted" : mode === "assisted" ? "warning" : "bear"}
          pulse={mode !== "paused"}
        >
          {mode.toUpperCase()}
        </StatusBadge>
      }
    >
      {/* Three mode cards. Click to switch; current is non-clickable. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <ModeCard
          mode="paused"
          current={mode}
          busy={busy}
          onSelect={handleSelect}
        />
        <ModeCard
          mode="assisted"
          current={mode}
          locked={lockedModes.assisted}
          busy={busy}
          onSelect={handleSelect}
        />
        <ModeCard
          mode="auto"
          current={mode}
          locked={lockedModes.auto}
          busy={busy}
          onSelect={handleSelect}
        />
      </div>

      {/* Hierarchy grid — env ceilings the UI cannot change. */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-px bg-border/60 rounded-xl overflow-hidden border border-border/60">
        <FlagCell
          label="Live Trading"
          on={ceilings.liveTradingEnabled}
          onLabel="ENABLED"
          offLabel="DISABLED"
          toneOn="bear"
          toneOff="bull"
        />
        <FlagCell
          label="Auto Allowed"
          on={ceilings.autoTradingEnabled}
          onLabel="ENABLED"
          offLabel="DISABLED"
          toneOn="bear"
          toneOff="muted"
        />
        <FlagCell
          label="Bot Loop"
          on={ceilings.botEnabled}
          onLabel="ENABLED"
          offLabel="DISABLED"
          toneOn="warning"
          toneOff="muted"
        />
        <FlagCell
          label="Manual Approval"
          on={ceilings.requireApproval}
          onLabel="REQUIRED"
          offLabel="N/A"
          toneOn="warning"
          toneOff="muted"
        />
      </div>

      {mode === "assisted" && (
        <div className="mt-4 rounded-xl border border-warning/40 bg-warning/5 p-4 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
          <div className="text-sm">
            <div className="font-semibold text-warning">
              Assisted mode — bot proposes, you approve.
            </div>
            <div className="text-muted-foreground text-xs mt-1 leading-relaxed">
              Run a scan to populate the Pending Approvals queue. Each row
              requires your explicit click before any order is placed.
              Robinhood credentials are NOT used until you approve. All
              order-level safety gates still apply (per-order USD cap,
              daily loss cap, daily count cap, one open position max,
              ETH-USD only).
            </div>
          </div>
        </div>
      )}

      {mode === "paused" && (
        <div className="mt-4 rounded-xl border border-border bg-card/40 p-4 flex items-start gap-3">
          <Pause className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
          <div className="text-sm">
            <div className="font-semibold">
              Paused.
            </div>
            <div className="text-muted-foreground text-xs mt-1 leading-relaxed">
              The bot will not propose or execute any new trades until you
              switch to Assisted. Existing live positions and pending
              approvals are unaffected.
            </div>
          </div>
        </div>
      )}

      {/* Bot loop status — read-only. Loop is env-gated; UI cannot toggle. */}
      {botLoop && <BotLoopStatusBlock status={botLoop} />}

      <div className="mt-4 text-xs text-muted-foreground/85 leading-relaxed border-t border-border/60 pt-3">
        <p>
          <span className="font-semibold text-foreground/85">Env-level ceilings</span>{" "}
          (set on Railway) are the unmovable floor. The UI can only choose
          modes the env permits — e.g. assisted requires LIVE_TRADING_ENABLED=true.
          Mode changes are audit-logged.
        </p>
      </div>
    </Panel>
  );
}

function BotLoopStatusBlock({ status }: { status: BotLoopStatus }) {
  // Three displayable states for the operator:
  //   1. Loop disabled by env (intervalMin=0 OR running=false because BOT_LOOP_INTERVAL_MIN=0)
  //   2. Loop running but currently gated off (e.g. mode=paused, or BOT_ENABLED=false)
  //   3. Loop running and ticking
  const { running, intervalMin, lastTick, gates, wouldRunIfTicked } = status;

  let label: string;
  let tone: "muted" | "warning" | "bull";
  let Icon: typeof Clock;
  let detail: string;

  if (!running) {
    label = "Bot Loop: DISABLED";
    tone = "muted";
    Icon = Lock;
    detail =
      "Set BOT_LOOP_INTERVAL_MIN > 0 on Railway and redeploy to enable scheduled scans.";
  } else if (!gates.botEnabled) {
    label = "Bot Loop: GATED";
    tone = "muted";
    Icon = Lock;
    detail = "BOT_ENABLED=false on the backend. The interval is scheduled but every tick is skipped.";
  } else if (!gates.liveTradingEnabled) {
    label = "Bot Loop: GATED";
    tone = "muted";
    Icon = Lock;
    detail = "LIVE_TRADING_ENABLED=false on the backend. Every tick is skipped.";
  } else if (!gates.tradingModeOk) {
    label = "Bot Loop: PAUSED";
    tone = "muted";
    Icon = Pause;
    detail = `Trading mode is '${gates.tradingMode}'. Loop only runs in 'assisted'.`;
  } else if (wouldRunIfTicked) {
    label = "Bot Loop: ACTIVE";
    tone = "warning";
    Icon = Clock;
    detail = `Scanning every ${intervalMin}m. Each tick may queue recommendations for your approval — never places orders.`;
  } else {
    label = "Bot Loop: IDLE";
    tone = "muted";
    Icon = Clock;
    detail = "Scheduled but inactive.";
  }

  const lastTickLine = (() => {
    if (!lastTick) return "No ticks yet.";
    const when = new Date(lastTick.finishedAt).toLocaleTimeString();
    if (lastTick.status === "ok") {
      return `Last tick at ${when} — queued ${lastTick.queued ?? 0} recommendation${
        lastTick.queued === 1 ? "" : "s"
      } (found ${lastTick.recommendationsFound ?? 0}).`;
    }
    if (lastTick.status === "skipped") {
      return `Last tick at ${when} skipped — ${lastTick.reason || "unknown reason"}.`;
    }
    return `Last tick at ${when} ERRORED — ${lastTick.error || "unknown error"}.`;
  })();

  const surfaceClass =
    tone === "warning"
      ? "border-warning/40 bg-warning/5"
      : tone === "bull"
      ? "border-bull/30 bg-bull/5"
      : "border-border bg-card/40";
  const iconBgClass =
    tone === "warning"
      ? "bg-warning/15 border-warning/40 text-warning"
      : tone === "bull"
      ? "bg-bull/15 border-bull/40 text-bull"
      : "bg-muted/40 border-border text-muted-foreground";

  const LastIcon =
    lastTick?.status === "ok"
      ? CheckCircle2
      : lastTick?.status === "error"
      ? XCircle
      : Clock;

  return (
    <div className={`mt-4 rounded-xl border p-4 ${surfaceClass}`}>
      <div className="flex items-start gap-3">
        <div className={`shrink-0 h-9 w-9 rounded-lg border flex items-center justify-center ${iconBgClass}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold">{label}</span>
            {running && (
              <StatusBadge tone={tone === "warning" ? "warning" : "muted"}>
                {intervalMin}m
              </StatusBadge>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{detail}</p>
          <p className="mt-2 text-[11px] text-muted-foreground/80 leading-relaxed flex items-center gap-1.5">
            <LastIcon className="h-3 w-3 shrink-0" />
            {lastTickLine}
          </p>
        </div>
      </div>
    </div>
  );
}

interface FlagCellProps {
  label: string;
  on: boolean;
  onLabel: string;
  offLabel: string;
  toneOn: "bull" | "bear" | "warning" | "muted";
  toneOff: "bull" | "bear" | "warning" | "muted";
}

function FlagCell({ label, on, onLabel, offLabel, toneOn, toneOff }: FlagCellProps) {
  const tone = on ? toneOn : toneOff;
  const valueClass =
    tone === "bull"
      ? "text-bull"
      : tone === "bear"
      ? "text-bear"
      : tone === "warning"
      ? "text-warning"
      : "text-muted-foreground";
  const dotClass =
    tone === "bull"
      ? "bg-bull"
      : tone === "bear"
      ? "bg-bear"
      : tone === "warning"
      ? "bg-warning"
      : "bg-muted-foreground/60";
  return (
    <div className="bg-card px-4 py-3 sm:py-4">
      <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground/80">
        {label}
      </div>
      <div
        className={`mt-1 flex items-center gap-2 text-sm font-mono-tnum font-semibold ${valueClass}`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} aria-hidden />
        {on ? onLabel : offLabel}
      </div>
    </div>
  );
}
