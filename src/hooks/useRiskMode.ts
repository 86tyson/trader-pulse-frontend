import { useEffect, useState } from "react";

// Strategy Risk Mode — UI-only preference, persisted in localStorage.
// Default: "standard". Backend uses it ONLY for paper-mode simulation.
// Live trading is unaffected by this setting (the live route's strict
// schema rejects any `riskMode` field).

export type RiskMode = "conservative" | "standard" | "aggressive";

const STORAGE_KEY = "strategy.riskMode";
const DEFAULT_MODE: RiskMode = "standard";

function readFromStorage(): RiskMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "conservative" || v === "standard" || v === "aggressive") {
      return v;
    }
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
  // tab picks it up too. Optional but nice.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      const v = e.newValue;
      if (v === "conservative" || v === "standard" || v === "aggressive") {
        setModeState(v);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return { mode, setMode: setModeState };
}

// Static metadata for the three modes. Single source of truth for UI labels.
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
};
