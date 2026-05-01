import { Panel } from "@/components/panel/Panel";
import { StatusBadge } from "@/components/panel/StatusBadge";
import type { Account } from "@/lib/trading/types";

const usd = (n: number) =>
  n.toLocaleString(undefined, { style: "currency", currency: "USD", minimumFractionDigits: 2 });

export function AccountSummaryPanel({ account }: { account: Account }) {
  const stats = [
    { label: "Buying Power", value: usd(account.buyingPower) },
    { label: "Portfolio Value", value: usd(account.portfolioValue) },
    { label: "BTC Holdings", value: `${account.btcHoldings.toFixed(6)} BTC` },
    { label: "ETH Holdings", value: `${account.ethHoldings.toFixed(4)} ETH` },
    { label: "Open Positions", value: String(account.openPositions) },
  ];
  return (
    <Panel title="Account Summary" right={<StatusBadge tone="warning">MOCK</StatusBadge>}>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg bg-muted/30 border border-border/60 p-3">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{s.label}</div>
            <div className="mt-1 font-mono-tnum text-base font-medium">{s.value}</div>
          </div>
        ))}
        <PnlCard label="Daily P/L" value={account.dailyPnl} />
        <PnlCard label="Weekly P/L" value={account.weeklyPnl} />
      </div>
    </Panel>
  );
}

function PnlCard({ label, value }: { label: string; value: number }) {
  const positive = value >= 0;
  return (
    <div className="rounded-lg bg-muted/30 border border-border/60 p-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 font-mono-tnum text-base font-medium ${positive ? "text-bull" : "text-bear"}`}>
        {positive ? "+" : ""}
        {usd(value)}
      </div>
    </div>
  );
}
