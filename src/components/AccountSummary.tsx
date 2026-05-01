import { useEffect, useState } from "react";
import { getAccount, describeError } from "@/lib/api";
import { Panel } from "@/components/panel/Panel";
import { StatusBadge } from "@/components/panel/StatusBadge";

interface AccountResponse {
  ok: true;
  mode: "paper" | "live";
  account: { cashUsd: number; equityUsd: number; buyingPowerUsd: number };
  holdings: { symbol: string; quantity: number; avgCostUsd: number; marketValueUsd: number }[];
  note?: string;
}

const usd = (n: number) =>
  n.toLocaleString(undefined, { style: "currency", currency: "USD", minimumFractionDigits: 2 });

export default function AccountSummary() {
  const [data, setData] = useState<AccountResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAccount()
      .then((r) => setData(r as AccountResponse))
      .catch((e) => setError(describeError(e).detail));
  }, []);

  if (error) {
    return (
      <Panel title="Account Summary" right={<StatusBadge tone="bear">ERROR</StatusBadge>}>
        <p className="text-sm text-bear">{error}</p>
      </Panel>
    );
  }
  if (!data) {
    return (
      <Panel title="Account Summary">
        <p className="text-sm text-muted-foreground">Loading account…</p>
      </Panel>
    );
  }

  const stats = [
    { label: "Cash", value: usd(data.account.cashUsd) },
    { label: "Equity", value: usd(data.account.equityUsd) },
    { label: "Buying Power", value: usd(data.account.buyingPowerUsd) },
  ];

  return (
    <Panel
      title="Account Summary"
      right={
        <StatusBadge tone={data.mode === "paper" ? "warning" : "accent"} pulse>
          {data.mode}
        </StatusBadge>
      }
    >
      <div className="grid grid-cols-3 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg bg-muted/30 border border-border/60 p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.label}</div>
            <div className="text-base sm:text-lg font-semibold font-mono-tnum mt-1">{s.value}</div>
          </div>
        ))}
      </div>

      {data.holdings.length > 0 && (
        <div className="mt-4 rounded-lg border border-border/60 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/30">
                <th className="text-left px-3 py-2">Symbol</th>
                <th className="text-right px-3 py-2">Qty</th>
                <th className="text-right px-3 py-2">Avg cost</th>
                <th className="text-right px-3 py-2">Mkt value</th>
              </tr>
            </thead>
            <tbody>
              {data.holdings.map((h, i) => (
                <tr
                  key={h.symbol}
                  className={i < data.holdings.length - 1 ? "border-b border-border/40" : ""}
                >
                  <td className="px-3 py-2 font-medium">{h.symbol}</td>
                  <td className="px-3 py-2 text-right font-mono-tnum">{h.quantity}</td>
                  <td className="px-3 py-2 text-right font-mono-tnum text-muted-foreground">
                    {usd(h.avgCostUsd)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono-tnum">{usd(h.marketValueUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data.note && (
        <p className="text-xs text-muted-foreground italic mt-3">{data.note}</p>
      )}
    </Panel>
  );
}
