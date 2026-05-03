import { useEffect, useState } from "react";

// Strategy Risk Mode — UI-only preference, persisted in localStorage.
// Default: "standard". Backend uses it ONLY for paper-mode simulation
// sizing — it has no effect on live trading.
//
// 'soloway_playbook' is a SEPARATE concept that's persisted SERVER-side
// in `system_settings` and read by the bot loop / scanner to switch
// strategies. The selector UI presents all four as a single choice for
// the operator; under the hood, picking Soloway pushes the strategyMode
// to the backend AND sets the local riskMode to 'standard' (since
// Soloway carries its own sizing rules and doesn't use the paper-sizing
// preference). See src/components/RiskModeSelector.tsx for the wiring.

export type RiskMode = "conservative" | "standard" | "aggressive" | "soloway_playbook";

const STORAGE_KEY = "strategy.riskMode";
const DEFAULT_MODE: RiskMode = "standard";
const VALID: RiskMode[] = ["conservative", "standard", "aggressive", "soloway_playbook"];

function isValid(v: unknown): v is RiskMode {
  return typeof v === "string" && (VALID as string[]).includes(v);
}

function readFromStorage(): RiskMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (isValid(v)) return v;
  } catch {
    /* SSR / private mode — fall through */
  }
  return DEFAULT_MODE;
}

export function useRiskMode(): {
  mode: RiskMode;
  setMode: (m: RiskMode) => void;
} {
  const [mode, setModeState] = useState<RiskMode>(readFromStorage);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      /* ignore */
    }
  }, [mode]);

  // Cross-tab sync: if the user changes the mode in another tab/window, this
  // tab picks it up too.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      const v = e.newValue;
      if (isValid(v)) setModeState(v);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return { mode, setMode: setModeState };
}

// Static metadata for each mode. Single source of truth for UI labels.
export const RISK_MODE_META: Record<
  RiskMode,
  { label: string; sizeLabel: string; freqLabel: string; description: string }
> = {
  conservative: {
    label: "Conservative",
    sizeLabel: "0.5× size",
    freqLabel: "HIGH-confidence only",
    description:
      "Half the simulated trade size; only HIGH-confidence setups (raises minConfidence to 0.85). Fewer trades, smaller bets.",
  },
  standard: {
    label: "Standard",
    sizeLabel: "1× size",
    freqLabel: "HIGH + MEDIUM",
    description:
      "Current paper-mode behavior. Default sizing and confidence threshold.",
  },
  aggressive: {
    label: "Aggressive",
    sizeLabel: "2× size",
    freqLabel: "HIGH + MEDIUM + LOW",
    description:
      "Double the simulated trade size (capped at MAX_TRADE_USD); accepts LOW-confidence setups (lowers minConfidence to 0.4). More trades, larger bets.",
  },
  soloway_playbook: {
    label: "Soloway Playbook",
    sizeLabel: "Confluence-only",
    freqLabel: "Strict, ≥2:1 R:R",
    description:
      "Technical-only strategy using confluence support, RSI, ATR, and hard blocks. Waits for high-confluence technical setups. No forced trades. ETH-USD live; BTC-USD watchlist only. No weekend entries.",
  },
};
