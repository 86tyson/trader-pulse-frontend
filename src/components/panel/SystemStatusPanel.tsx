import { Panel } from "@/components/panel/Panel";
import { StatusBadge } from "@/components/panel/StatusBadge";
import { Switch } from "@/components/ui/switch";
import type { SystemState } from "@/lib/trading/types";

interface Props {
  state: SystemState;
  onToggleBot: (v: boolean) => void;
}

function fmtTime(t: number | null) {
  if (!t) return "—";
  const d = new Date(t);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function SystemStatusPanel({ state, onToggleBot }: Props) {
  const items: Array<{ label: string; value: React.ReactNode }> = [
    { label: "Paper Mode", value: <StatusBadge tone="warning" pulse>ON</StatusBadge> },
    { label: "Mock Data", value: <StatusBadge tone="warning">ON</StatusBadge> },
    { label: "Auto Execution", value: <StatusBadge tone="bear">OFF</StatusBadge> },
    { label: "Approval Required", value: <StatusBadge tone="bull">YES</StatusBadge> },
    {
      label: "Bot Enabled",
      value: (
        <div className="flex items-center gap-2">
          <Switch checked={state.botEnabled} onCheckedChange={onToggleBot} />
          <StatusBadge tone={state.botEnabled ? "bull" : "muted"}>
            {state.botEnabled ? "ON" : "OFF"}
          </StatusBadge>
        </div>
      ),
    },
    { label: "Last Scan", value: <span className="font-mono-tnum text-sm">{fmtTime(state.lastScanAt)}</span> },
    { label: "Next Scan", value: <span className="font-mono-tnum text-sm">{fmtTime(state.nextScanAt)}</span> },
  ];

  return (
    <Panel title="System Status" right={<StatusBadge tone="warning" pulse>PAPER MODE</StatusBadge>}>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
        {items.map((it) => (
          <li key={it.label} className="flex items-center justify-between gap-4 py-1.5 border-b border-border/50 last:border-0">
            <span className="text-sm text-muted-foreground">{it.label}</span>
            {it.value}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
