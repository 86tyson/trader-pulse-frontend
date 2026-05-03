import { useCallback, useEffect, useState } from "react";
import { Panel } from "@/components/panel/Panel";
import { StatusBadge } from "@/components/panel/StatusBadge";
import {
  RISK_MODE_META,
  useRiskMode,
  type RiskMode,
} from "@/hooks/useRiskMode";
import {
  getStrategyMode,
  setStrategyMode,
  describeError,
  type StrategyMode,
} from "@/lib/api";
import { ShieldCheck, BookOpen, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "@/hooks/use-toast";

// Strategy Risk Mode selector — admin UI for picking how the system trades.
//
// THREE OPTIONS shown to the operator:
//   Conservative      — paper-mode sizing preference (frontend only)
//   Aggressive        — paper-mode sizing preference (frontend only)
//   Soloway Playbook  — server-side strategy mode (changes the bot loop)
//
// 'Standard' is the implicit default and isn't surfaced as a card; it's
// what you get when none of the above is selected. Existing local
// preferences for "standard" still work.
//
// CRITICAL SAFETY:
//   - Conservative/Aggressive only affect PAPER simulation sizing. They
//     cannot bypass any live safety gate.
//   - Soloway Playbook changes WHICH STRATEGY the scanner runs. It still
//     produces RECOMMENDATIONS only — every order requires manual approval
//     and runs through liveRiskManager.evaluateLive. No execution bypass.
//   - The Soloway card pushes the choice to the BACKEND
//     (POST /admin/strategy-mode); the other two are localStorage only.

const VISIBLE_MODES: RiskMode[] = ["conservative", "aggressive", "soloway_playbook"];

export default function RiskModeSelector() {
  const { mode: localMode, setMode: setLocalMode } = useRiskMode();
  const [serverStrategy, setServerStrategy] = useState<StrategyMode | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Effective mode shown as "active" — Soloway is active iff server-side
  // strategy is soloway_playbook, regardless of the localStorage value.
  const effectiveMode: RiskMode =
    serverStrategy === "soloway_playbook" ? "soloway_playbook" : localMode;

  const refreshServerMode = useCallback(async () => {
    try {
      const r = await getStrategyMode();
      setServerStrategy(r.mode);
      setError(null);
    } catch (e) {
      setError(describeError(e).detail);
    }
  }, []);

  useEffect(() => {
    void refreshServerMode();
  }, [refreshServerMode]);

  const handleSelect = useCallback(
    async (chosen: RiskMode) => {
      if (chosen === effectiveMode) return;
      if (busy) return;

      // Soloway Playbook needs an explicit confirmation because it changes
      // the system's actual strategy, not just sizing.
      if (chosen === "soloway_playbook") {
        const ok = window.confirm(
          "Switch to the SOLOWAY PLAYBOOK strategy?\n\n" +
            "The bot loop will use confluence-support pullback rules with:\n" +
            "  • Minimum 2:1 risk/reward (3:1 preferred)\n" +
            "  • No weekend entries (Sat 00:00 → Sun 18:00 PT)\n" +
            "  • ETH-USD only for live signals; BTC-USD watchlist-only\n" +
            "  • All existing caps + manual approval still apply\n\n" +
            "Recommendations only — no orders are placed automatically.\n\n" +
            "Proceed?",
        );
        if (!ok) return;

        setBusy(true);
        try {
          const r = await setStrategyMode("soloway_playbook");
          setServerStrategy(r.mode);
          // Reset the local sizing preference to standard while Soloway
          // is active — it carries its own sizing rules.
          setLocalMode("standard");
          toast({
            title: "Soloway Playbook active",
            description: "Bot loop will use confluence-support rules on next tick.",
          });
        } catch (e) {
          const { title, detail } = describeError(e);
          toast({ title, description: detail, variant: "destructive" });
        } finally {
          setBusy(false);
        }
        return;
      }

      // Conservative / Aggressive: switch the LOCAL paper-sizing preference
      // AND push backend strategy back to 'default' so the scanner runs
      // the original strategy.
      setBusy(true);
      try {
        if (serverStrategy === "soloway_playbook") {
          const r = await setStrategyMode("default");
          setServerStrategy(r.mode);
        }
        setLocalMode(chosen);
      } catch (e) {
        const { title, detail } = describeError(e);
        toast({ title, description: detail, variant: "destructive" });
      } finally {
        setBusy(false);
      }
    },
    [effectiveMode, busy, serverStrategy, setLocalMode],
  );

  return (
    <Panel
      title="Strategy Risk Mode"
      subtitle="Sizing preference + scanner strategy"
      right={
        <StatusBadge tone={effectiveMode === "soloway_playbook" ? "accent" : "warning"}>
          {effectiveMode === "soloway_playbook" ? "SOLOWAY · LIVE" : "PAPER ONLY"}
        </StatusBadge>
      }
    >
      {error && (
        <div className="mb-3 rounded-lg border border-bear/40 bg-bear/5 p-3 text-sm text-bear flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {VISIBLE_MODES.map((key) => {
          const meta = RISK_MODE_META[key];
          const selected = key === effectiveMode;
          const isSoloway = key === "soloway_playbook";

          return (
            <button
              key={key}
              type="button"
              onClick={() => handleSelect(key)}
              disabled={busy}
              className={[
                "relative text-left rounded-xl border p-4 transition-all disabled:opacity-60",
                selected
                  ? isSoloway
                    ? "border-accent bg-accent/10 shadow-[0_0_0_1px_hsl(var(--accent)/0.4)]"
                    : "border-primary bg-primary/10 shadow-[0_0_0_1px_hsl(var(--primary)/0.4)]"
                  : "border-border bg-card/40 hover:border-border/80 hover:bg-card/70",
              ].join(" ")}
              aria-pressed={selected}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`text-[11px] uppercase tracking-[0.2em] font-semibold inline-flex items-center gap-1.5 ${
                    selected
                      ? isSoloway
                        ? "text-accent"
                        : "text-primary"
                      : "text-muted-foreground"
                  }`}
                >
                  {isSoloway && <BookOpen className="h-3 w-3" />}
                  {meta.label}
                </span>
                {selected && (
                  <span className="text-[10px] uppercase tracking-wider font-mono-tnum">
                    {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : "Active"}
                  </span>
                )}
              </div>
              <div className="mt-3 space-y-1 text-sm">
                <div className="font-mono-tnum text-foreground/90">{meta.sizeLabel}</div>
                <div className="text-muted-foreground text-xs">{meta.freqLabel}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Active-mode description */}
      <div className="mt-4 rounded-lg border border-border/60 bg-muted/20 p-3 text-xs text-foreground/85 leading-relaxed">
        <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/80 mr-2">
          Active behavior
        </span>
        {RISK_MODE_META[effectiveMode].description}
      </div>

      {/* Soloway-specific explainer */}
      {effectiveMode === "soloway_playbook" && (
        <div className="mt-4 rounded-lg border border-accent/30 bg-accent/5 p-3 flex items-start gap-3">
          <BookOpen className="h-4 w-4 text-accent shrink-0 mt-0.5" />
          <div className="text-xs leading-relaxed">
            <div className="font-medium text-foreground">
              Soloway Playbook — recommendations only.
            </div>
            <div className="text-muted-foreground mt-0.5">
              Hard blocks: weekends (Sat 00:00 → Sun 18:00 PT), open
              position, daily loss cap, daily count cap, paused mode.
              Setup: pullback to confluence support (≥2 of: 50MA, swing
              low, round number). Min ≥2:1 R:R. Confidence ≥ 0.50. Live
              eligibility: ETH-USD only. BTC-USD signals are
              watchlist-only. The scanner queues recommendations; you
              still click Approve to place each order.
            </div>
          </div>
        </div>
      )}

      {/* CRITICAL: live-trading safety disclaimer. Never remove this. */}
      <div className="mt-4 rounded-lg border border-bear/30 bg-bear/5 p-3 flex items-start gap-3">
        <ShieldCheck className="h-4 w-4 text-bear shrink-0 mt-0.5" />
        <div className="text-xs leading-relaxed">
          <div className="font-medium text-foreground">
            Live trading safety gates always apply.
          </div>
          <div className="text-muted-foreground mt-0.5">
            Real-money orders use the fixed safety limits configured in the
            backend: ETH-USD only, $10 max per order, $10 daily loss cap,
            5 trades/day, one position at a time, manual approval required.
            No mode you select here can increase live size, lower the live
            confidence bar, or bypass any live safety gate.
          </div>
        </div>
      </div>
    </Panel>
  );
}
