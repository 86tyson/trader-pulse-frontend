import { Panel } from "@/components/panel/Panel";
import { StatusBadge } from "@/components/panel/StatusBadge";
import {
  RISK_MODE_META,
  useRiskMode,
  type RiskMode,
} from "@/hooks/useRiskMode";
import { ShieldCheck } from "lucide-react";

// Strategy Risk Mode selector — paper-only.
//
// THIS DOES NOT AFFECT LIVE TRADING. The live route uses a separate strict
// schema that rejects any `riskMode` field, and the live position size is
// fixed in backend config (LIVE_MAX_ORDER_USD). The fine print at the
// bottom of the panel makes this explicit to the user.

const ORDER: RiskMode[] = ["conservative", "standard", "aggressive"];

export default function RiskModeSelector() {
  const { mode, setMode } = useRiskMode();
  const current = RISK_MODE_META[mode];

  return (
    <Panel
      title="Strategy Risk Mode"
      subtitle="Paper-mode simulation preference · live trading is unaffected"
      right={
        <StatusBadge tone="warning">
          PAPER ONLY
        </StatusBadge>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {ORDER.map((key) => {
          const meta = RISK_MODE_META[key];
          const selected = key === mode;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setMode(key)}
              className={[
                "text-left rounded-xl border p-4 transition-all",
                selected
                  ? "border-primary bg-primary/10 shadow-[0_0_0_1px_hsl(var(--primary)/0.4)]"
                  : "border-border bg-card/40 hover:border-border/80 hover:bg-card/70",
              ].join(" ")}
              aria-pressed={selected}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`text-[11px] uppercase tracking-[0.2em] font-semibold ${
                    selected ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  {meta.label}
                </span>
                {selected && (
                  <span className="text-[10px] uppercase tracking-wider text-primary font-mono-tnum">
                    Active
                  </span>
                )}
              </div>
              <div className="mt-3 space-y-1 text-sm">
                <div className="font-mono-tnum text-foreground/90">
                  {meta.sizeLabel}
                </div>
                <div className="text-muted-foreground text-xs">
                  {meta.freqLabel}
                </div>
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
        {current.description}
      </div>

      {/* CRITICAL: live-trading safety disclaimer. Never remove this. */}
      <div className="mt-4 rounded-lg border border-bear/30 bg-bear/5 p-3 flex items-start gap-3">
        <ShieldCheck className="h-4 w-4 text-bear shrink-0 mt-0.5" />
        <div className="text-xs leading-relaxed">
          <div className="font-medium text-foreground">
            Live trading is unaffected by this setting.
          </div>
          <div className="text-muted-foreground mt-0.5">
            Real-money orders use the fixed safety limits configured in the
            backend: ETH-USD only, $10 max per order, $10 daily loss cap, one
            position at a time, manual approval required. The Risk Mode you
            select here cannot increase live size, lower the live confidence
            bar, or bypass any live safety gate.
          </div>
        </div>
      </div>
    </Panel>
  );
}
