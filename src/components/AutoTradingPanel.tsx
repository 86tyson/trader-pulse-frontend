import { useCallback, useEffect, useState } from "react";
import { Panel } from "@/components/panel/Panel";
import { StatusBadge } from "@/components/panel/StatusBadge";
import {
  getTradingMode,
  setTradingMode,
  describeError,
  type TradingMode,
  type TradingModeStatus,
} from "@/lib/api";
import { ShieldCheck, Zap, Pause, Lock, AlertTriangle, Loader2 } from "lucide-react";
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const s = await getTradingMode();
      setStatus(s);
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
