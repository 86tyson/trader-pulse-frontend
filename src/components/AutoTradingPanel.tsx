import { Panel } from "@/components/panel/Panel";
import { StatusBadge } from "@/components/panel/StatusBadge";
import { useLiveStatus } from "@/hooks/useLiveStatus";
import { ShieldCheck, Zap, Lock, AlertTriangle } from "lucide-react";

// AutoTradingPanel — surfaces the manual-vs-auto trading mode.
//
// IMPORTANT INVARIANTS:
//   - There is currently NO bot execution loop in the codebase.
//   - This panel is STATUS-ONLY: it shows the current mode and explains
//     the safety hierarchy. It does NOT include a runtime toggle button
//     (toggling would require modifying .env and restarting the backend).
//   - Auto trading cannot be enabled without LIVE_TRADING_ENABLED=true and
//     BOT_ENABLED=true; the backend boot guard refuses otherwise.
//   - Manual approval ALWAYS works whenever LIVE_TRADING_ENABLED=true,
//     regardless of AUTO_TRADING_ENABLED.

export default function AutoTradingPanel() {
  const { status } = useLiveStatus();

  if (!status) {
    return (
      <Panel title="Trading Mode">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </Panel>
    );
  }

  const liveOn = status.liveTradingEnabled;
  const autoOn = status.autoTradingEnabled;
  const botOn = status.botEnabled;
  const manualRequired = status.manualApprovalRequired;

  // Determine the dominant state to show.
  let mode: "auto-on" | "manual-required" | "live-off";
  if (autoOn && liveOn) mode = "auto-on";
  else if (manualRequired) mode = "manual-required";
  else mode = "live-off";

  const tone =
    mode === "auto-on" ? "bear" : mode === "manual-required" ? "warning" : "muted";
  const headline =
    mode === "auto-on"
      ? "Auto Trading: ACTIVE"
      : mode === "manual-required"
      ? "Manual Approval Required"
      : "Manual Approval Mode";
  const subtext =
    mode === "auto-on"
      ? "Auto trading is active. The system may place real trades without manual approval."
      : mode === "manual-required"
      ? "Manual approval required. The system will not place trades automatically."
      : "Live trading is off. The system will not place any trades. Manual approval mode would activate if the kill switch were on.";

  const Icon = mode === "auto-on" ? Zap : mode === "manual-required" ? ShieldCheck : Lock;

  return (
    <Panel
      title="Trading Mode"
      subtitle="Manual approval vs. automated execution"
      right={
        <StatusBadge tone={tone} pulse={mode === "auto-on"}>
          {mode === "auto-on" ? "AUTO ON" : mode === "manual-required" ? "MANUAL" : "LIVE OFF"}
        </StatusBadge>
      }
    >
      {/* Dominant headline card */}
      <div
        className={`rounded-xl border p-4 sm:p-5 flex items-start gap-4 ${
          mode === "auto-on"
            ? "border-bear/40 bg-bear/5"
            : mode === "manual-required"
            ? "border-warning/40 bg-warning/5"
            : "border-border bg-card/40"
        }`}
      >
        <div
          className={`h-10 w-10 rounded-xl border flex items-center justify-center shrink-0 ${
            mode === "auto-on"
              ? "bg-bear/15 border-bear/40"
              : mode === "manual-required"
              ? "bg-warning/15 border-warning/40"
              : "bg-muted/40 border-border"
          }`}
        >
          <Icon
            className={`h-5 w-5 ${
              mode === "auto-on"
                ? "text-bear"
                : mode === "manual-required"
                ? "text-warning"
                : "text-muted-foreground"
            }`}
          />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base sm:text-lg font-semibold tracking-tight">
            {headline}
          </h3>
          <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
            {subtext}
          </p>
        </div>
      </div>

      {/* Hierarchy grid — at-a-glance state of every safety flag */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-px bg-border/60 rounded-xl overflow-hidden border border-border/60">
        <FlagCell label="Live Trading" on={liveOn} onLabel="ENABLED" offLabel="DISABLED" toneOn="bear" toneOff="bull" />
        <FlagCell label="Auto Trading" on={autoOn} onLabel="ENABLED" offLabel="DISABLED" toneOn="bear" toneOff="bull" />
        <FlagCell label="Bot Loop" on={botOn} onLabel="ENABLED" offLabel="DISABLED" toneOn="warning" toneOff="muted" />
        <FlagCell label="Manual Approval" on={manualRequired} onLabel="REQUIRED" offLabel="N/A" toneOn="warning" toneOff="muted" />
      </div>

      {/* Strong warning when auto is on */}
      {mode === "auto-on" && (
        <div className="mt-4 rounded-xl border border-bear/40 bg-bear/10 p-4 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-bear shrink-0 mt-0.5" />
          <div className="text-sm">
            <div className="font-semibold text-bear">
              Auto trading can place real trades without manual approval.
            </div>
            <div className="text-muted-foreground text-xs mt-1 leading-relaxed">
              All other safety gates still apply at the order level: $
              {status.caps.maxOrderUsd} per-order cap, $
              {status.caps.dailyLossCapUsd} daily loss cap, ETH-USD only,
              one open position max. Currently NO bot execution loop is
              implemented — flipping this flag changes status display only
              until a loop exists.
            </div>
          </div>
        </div>
      )}

      {/* Operator instructions — how to actually flip */}
      <div className="mt-4 text-xs text-muted-foreground/85 leading-relaxed border-t border-border/60 pt-3">
        <p>
          <span className="font-semibold text-foreground/85">To change this mode:</span>{" "}
          edit{" "}
          <code className="px-1 py-0.5 rounded bg-muted/60 font-mono">.env</code>{" "}
          and restart the backend. AUTO_TRADING_ENABLED=true requires
          LIVE_TRADING_ENABLED=true AND BOT_ENABLED=true; the backend will
          refuse to start otherwise.
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
      <div className={`mt-1 flex items-center gap-2 text-sm font-mono-tnum font-semibold ${valueClass}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} aria-hidden />
        {on ? onLabel : offLabel}
      </div>
    </div>
  );
}
