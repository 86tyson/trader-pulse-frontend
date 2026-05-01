import { useLiveStatus } from "@/hooks/useLiveStatus";

// Persistent top bar showing the four highest-priority pieces of system state.
// Sticky — always visible while scrolling. Backed by the shared /live/status
// store so all consumers share one 10-second poll cadence.
//
// SystemState (derived):
//   - IDLE         — no scan running, no open position
//   - SCANNING     — caller has a scan in flight (via prop)
//   - IN POSITION  — openLivePositions > 0
//   - CLOSING      — caller has a close-out in flight (via prop)

export type SystemState = "IDLE" | "SCANNING" | "IN POSITION" | "CLOSING";

interface Props {
  /** True when the user has a /scan request in flight. */
  scanning?: boolean;
  /** True when a /live/close request is in flight. */
  closing?: boolean;
}

const dot = (cls: string) => (
  <span className={`h-2 w-2 rounded-full ${cls}`} aria-hidden />
);

interface CellProps {
  label: string;
  value: string;
  tone: "bull" | "bear" | "warning" | "muted" | "accent";
}

function Cell({ label, value, tone }: CellProps) {
  const dotCls =
    tone === "bull"
      ? "bg-bull"
      : tone === "bear"
      ? "bg-bear"
      : tone === "warning"
      ? "bg-warning"
      : tone === "accent"
      ? "bg-accent"
      : "bg-muted-foreground/60";
  const valueCls =
    tone === "bull"
      ? "text-bull"
      : tone === "bear"
      ? "text-bear"
      : tone === "warning"
      ? "text-warning"
      : tone === "accent"
      ? "text-accent"
      : "text-foreground";
  return (
    <div className="min-w-0 px-3 sm:px-5 py-2.5 sm:py-3 bg-background flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground/80 truncate">
          {label}
        </div>
        <div
          className={`text-sm sm:text-base font-semibold font-mono-tnum mt-0.5 truncate flex items-center gap-2 ${valueCls}`}
        >
          {dot(dotCls + (tone !== "muted" ? " ticker-pulse" : ""))}
          <span className="truncate">{value}</span>
        </div>
      </div>
    </div>
  );
}

export default function SystemStatusBar({ scanning, closing }: Props) {
  const { status } = useLiveStatus();

  // Derive each cell from status + caller-supplied flags.
  const liveOn = status?.liveTradingEnabled === true;
  const rhConnected = status?.robinhoodConnected === true;
  const openPos = (status?.today.openLivePositions ?? 0) > 0;

  let systemState: SystemState = "IDLE";
  if (closing) systemState = "CLOSING";
  else if (openPos) systemState = "IN POSITION";
  else if (scanning) systemState = "SCANNING";

  return (
    <div className="sticky top-0 z-40 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 bg-background/85 backdrop-blur-md border-b border-border">
      {/* Mobile: 2×2 grid; sm+: single horizontal strip of 4. Using
          gap-px + bg-border/60 lets us draw both vertical AND horizontal
          dividers in one declaration (the 1px gaps read as borders). */}
      <div className="max-w-5xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-px bg-border/60">
        <Cell
          label="Live Mode"
          value={liveOn ? "ON" : "OFF"}
          tone={liveOn ? "bear" : "bull"}
        />
        <Cell
          label="Robinhood"
          value={rhConnected ? "CONNECTED" : "DISCONNECTED"}
          tone={rhConnected ? "bull" : "bear"}
        />
        <Cell
          label="Open Position"
          value={openPos ? "YES" : "NO"}
          tone={openPos ? "accent" : "muted"}
        />
        <Cell
          label="System"
          value={systemState}
          tone={
            systemState === "CLOSING"
              ? "warning"
              : systemState === "IN POSITION"
              ? "accent"
              : systemState === "SCANNING"
              ? "warning"
              : "muted"
          }
        />
      </div>
    </div>
  );
}
