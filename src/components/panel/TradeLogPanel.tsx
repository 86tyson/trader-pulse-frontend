import { Panel } from "@/components/panel/Panel";
import { StatusBadge } from "@/components/panel/StatusBadge";
import type { TradeLogEntry, TradeStatus } from "@/lib/trading/types";

const statusTone: Record<TradeStatus, "bull" | "bear" | "muted" | "warning" | "accent"> = {
  APPROVED: "accent",
  SIMULATED: "accent",
  DECLINED: "muted",
  SKIPPED: "warning",
  CLOSED_WIN: "bull",
  CLOSED_LOSS: "bear",
};

const fmtTime = (t: number) => new Date(t).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

export function TradeLogPanel({ entries }: { entries: TradeLogEntry[] }) {
  return (
    <Panel title="Trade Log" subtitle="All entries are simulated paper records.">
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No trades logged yet.</p>
      ) : (
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                <th className="px-2 py-2 font-medium">Time</th>
                <th className="px-2 py-2 font-medium">Asset</th>
                <th className="px-2 py-2 font-medium">Signal</th>
                <th className="px-2 py-2 font-medium">Status</th>
                <th className="px-2 py-2 font-medium text-right">Entry</th>
                <th className="px-2 py-2 font-medium text-right">Exit</th>
                <th className="px-2 py-2 font-medium text-right">Result</th>
                <th className="px-2 py-2 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-border/40 hover:bg-muted/20">
                  <td className="px-2 py-2 font-mono-tnum text-xs text-muted-foreground whitespace-nowrap">{fmtTime(e.timestamp)}</td>
                  <td className="px-2 py-2 font-medium">{e.symbol}</td>
                  <td className="px-2 py-2">
                    <StatusBadge tone={e.side === "BUY" ? "bull" : "bear"}>{e.side}</StatusBadge>
                  </td>
                  <td className="px-2 py-2">
                    <StatusBadge tone={statusTone[e.status]}>{e.status.replace("_", " ")}</StatusBadge>
                  </td>
                  <td className="px-2 py-2 font-mono-tnum text-right">{e.entry ? `$${e.entry.toLocaleString()}` : "—"}</td>
                  <td className="px-2 py-2 font-mono-tnum text-right">{e.exit ? `$${e.exit.toLocaleString()}` : "—"}</td>
                  <td className={`px-2 py-2 font-mono-tnum text-right ${e.resultPct == null ? "" : e.resultPct >= 0 ? "text-bull" : "text-bear"}`}>
                    {e.resultPct == null ? "—" : `${e.resultPct >= 0 ? "+" : ""}${e.resultPct.toFixed(2)}%`}
                  </td>
                  <td className="px-2 py-2 text-xs text-muted-foreground max-w-[260px] truncate" title={e.notes}>{e.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
