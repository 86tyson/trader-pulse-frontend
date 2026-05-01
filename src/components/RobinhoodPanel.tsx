import { useEffect, useState } from "react";
import {
  describeError,
  getLiveAccount,
  getLiveHoldings,
  getLiveQuote,
  getLiveStatus,
  type LiveStatusResponse,
} from "@/lib/api";
import { Panel } from "@/components/panel/Panel";
import { StatusBadge } from "@/components/panel/StatusBadge";

// Read-only Robinhood account panel. Pure display — NO trading buttons here,
// by design. The user verifies live data is flowing in safe mode before any
// order is ever placed. This panel is independent of LIVE_TRADING_ENABLED;
// it requires only that Robinhood credentials are configured on the backend.

const POLL_INTERVAL_MS = 60_000;

// ---------- Defensive parsers ----------
// Robinhood's response shapes can drift; we try several common field names
// and fall back to null. The component renders whatever it could parse and
// shows a "Raw response" details block when the parse came up empty.

function pickNumber(...vals: unknown[]): number | null {
  for (const v of vals) {
    if (v == null) continue;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

interface AccountFacts {
  buyingPower: number | null;
  cash: number | null;
  portfolioValue: number | null;
}

function parseAccount(data: unknown): AccountFacts {
  const empty: AccountFacts = { buyingPower: null, cash: null, portfolioValue: null };
  if (!data || typeof data !== "object") return empty;
  const d = data as Record<string, unknown>;
  return {
    buyingPower: pickNumber(d.buying_power, d.buyingPower),
    cash: pickNumber(d.cash, d.cash_balance, d.available_cash, d.cashUsd),
    portfolioValue: pickNumber(
      d.portfolio_value,
      d.portfolioValue,
      d.total_equity,
      d.equity,
    ),
  };
}

interface HoldingsFacts {
  eth: number;
  btc: number;
  raw: unknown[];
}

function parseHoldings(data: unknown): HoldingsFacts {
  const empty: HoldingsFacts = { eth: 0, btc: 0, raw: [] };
  if (!data || typeof data !== "object") return empty;
  const d = data as Record<string, unknown>;
  const list = Array.isArray(d.results) ? d.results : Array.isArray(d) ? d : [];
  let eth = 0;
  let btc = 0;
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const h = item as Record<string, unknown>;
    const code = String(h.asset_code ?? h.assetCode ?? h.symbol ?? "")
      .toUpperCase()
      .replace("-USD", "");
    const qty =
      pickNumber(
        h.total_quantity,
        h.totalQuantity,
        h.quantity,
        h.quantity_available_for_trading,
        h.amount,
      ) ?? 0;
    if (code === "ETH") eth += qty;
    else if (code === "BTC") btc += qty;
  }
  return { eth, btc, raw: list };
}

interface QuoteFacts {
  bid: number | null;
  ask: number | null;
  mid: number | null;
}

function parseQuote(data: unknown): QuoteFacts {
  // Robinhood Crypto market-data response (verified against live API):
  //   { results: [{ symbol, price, bid_inclusive_of_sell_spread,
  //     ask_inclusive_of_buy_spread, sell_spread, buy_spread, timestamp }] }
  // Older / alternate shapes use bid_price/ask_price; we accept both so the
  // panel keeps working if Robinhood reverts or we get a different feed.
  const empty: QuoteFacts = { bid: null, ask: null, mid: null };
  if (!data || typeof data !== "object") return empty;
  const d = data as Record<string, unknown>;
  const result = Array.isArray(d.results)
    ? (d.results[0] as Record<string, unknown> | undefined)
    : (d as Record<string, unknown>);
  if (!result) return empty;
  const bid = pickNumber(
    result.bid_inclusive_of_sell_spread,
    result.bid_price,
    result.bidPrice,
    result.bid,
  );
  const ask = pickNumber(
    result.ask_inclusive_of_buy_spread,
    result.ask_price,
    result.askPrice,
    result.ask,
  );
  // RH gives a mid via top-level `price`; fall back to (bid+ask)/2.
  const mid =
    pickNumber(result.price, result.mid_price, result.mid) ??
    (bid != null && ask != null ? (bid + ask) / 2 : null);
  return { bid, ask, mid };
}

// ---------- Formatters ----------
const fmtUsd = (n: number | null) =>
  n == null
    ? "—"
    : n.toLocaleString(undefined, {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
      });

const fmtCrypto = (n: number, sym: "ETH" | "BTC") =>
  `${n.toLocaleString(undefined, {
    minimumFractionDigits: sym === "BTC" ? 8 : 6,
    maximumFractionDigits: sym === "BTC" ? 8 : 6,
  })} ${sym}`;

const fmtPrice = (n: number | null) =>
  n == null ? "—" : `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ---------- Component ----------
export default function RobinhoodPanel() {
  const [status, setStatus] = useState<LiveStatusResponse | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [accountRaw, setAccountRaw] = useState<unknown>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [holdingsRaw, setHoldingsRaw] = useState<unknown>(null);
  const [holdingsError, setHoldingsError] = useState<string | null>(null);
  const [quoteRaw, setQuoteRaw] = useState<unknown>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    const tick = async () => {
      // Always fetch /live/status first — it's cheap and tells us whether
      // it's even worth attempting the RH-backed fetches.
      try {
        const s = await getLiveStatus();
        if (!alive) return;
        setStatus(s);
        setStatusError(null);
        if (!s.robinhoodConnected) {
          // No keys configured — skip the four RH calls; they'd just 412.
          setAccountRaw(null);
          setHoldingsRaw(null);
          setQuoteRaw(null);
          setAccountError(null);
          setHoldingsError(null);
          setQuoteError(null);
          setLoading(false);
          return;
        }
      } catch (e) {
        if (!alive) return;
        setStatusError(describeError(e).detail);
        setLoading(false);
        return;
      }

      // Connected — fetch account/holdings/quote in parallel; surface each
      // endpoint's error independently so a single failure doesn't blank
      // the whole panel.
      const [acctRes, holdRes, quoteRes] = await Promise.allSettled([
        getLiveAccount(),
        getLiveHoldings(),
        getLiveQuote("ETH-USD"),
      ]);

      if (!alive) return;

      if (acctRes.status === "fulfilled") {
        setAccountRaw(acctRes.value.data);
        setAccountError(null);
      } else {
        setAccountRaw(null);
        setAccountError(describeError(acctRes.reason).detail);
      }
      if (holdRes.status === "fulfilled") {
        setHoldingsRaw(holdRes.value.data);
        setHoldingsError(null);
      } else {
        setHoldingsRaw(null);
        setHoldingsError(describeError(holdRes.reason).detail);
      }
      if (quoteRes.status === "fulfilled") {
        setQuoteRaw(quoteRes.value.data);
        setQuoteError(null);
      } else {
        setQuoteRaw(null);
        setQuoteError(describeError(quoteRes.reason).detail);
      }
      setLoading(false);
    };

    tick();
    const id = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  // ---------- Render ----------
  if (statusError) {
    return (
      <Panel
        title="Robinhood (Read-Only)"
        right={<StatusBadge tone="bear">UNREACHABLE</StatusBadge>}
      >
        <p className="text-sm text-bear">{statusError}</p>
      </Panel>
    );
  }

  if (loading && !status) {
    return (
      <Panel title="Robinhood (Read-Only)">
        <p className="text-sm text-muted-foreground">Loading Robinhood data…</p>
      </Panel>
    );
  }

  const connected = status?.robinhoodConnected === true;
  const anyAuthFailure =
    accountError?.toLowerCase().includes("signature") ||
    holdingsError?.toLowerCase().includes("signature") ||
    quoteError?.toLowerCase().includes("signature");

  const badgeTone: "bull" | "bear" | "warning" = connected
    ? anyAuthFailure
      ? "bear"
      : "bull"
    : "warning";
  const badgeLabel = connected
    ? anyAuthFailure
      ? "AUTH FAILED"
      : "CONNECTED"
    : "NOT CONNECTED";

  // Not connected — empty-state with instructions.
  if (!connected) {
    return (
      <Panel
        title="Robinhood (Read-Only)"
        right={<StatusBadge tone="warning">{badgeLabel}</StatusBadge>}
      >
        <div className="rounded-lg border border-dashed border-border p-5">
          <p className="text-sm text-foreground/90 font-medium">
            Robinhood credentials are not configured on the backend.
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Set <code className="text-xs px-1 py-0.5 rounded bg-muted">ROBINHOOD_API_KEY</code>{" "}
            and <code className="text-xs px-1 py-0.5 rounded bg-muted">ROBINHOOD_PRIVATE_KEY</code>{" "}
            in <code className="text-xs px-1 py-0.5 rounded bg-muted">.env</code> and restart
            the backend. Read-only access does NOT require{" "}
            <code className="text-xs px-1 py-0.5 rounded bg-muted">LIVE_TRADING_ENABLED</code>.
          </p>
        </div>
      </Panel>
    );
  }

  const account = parseAccount(accountRaw);
  const holdings = parseHoldings(holdingsRaw);
  const quote = parseQuote(quoteRaw);

  // Computed portfolio value: account.portfolioValue if RH provides one,
  // else best-effort from buying power + ETH holdings × mid price.
  const computedPortfolioValue =
    account.portfolioValue ??
    (account.buyingPower != null && quote.mid != null
      ? account.buyingPower + holdings.eth * quote.mid
      : null);

  return (
    <Panel
      title="Robinhood (Read-Only)"
      subtitle="Live account data via the official Robinhood Crypto API · no trading buttons"
      right={<StatusBadge tone={badgeTone}>{badgeLabel}</StatusBadge>}
    >
      {/* Per-endpoint inline errors. Each is independent — one failure does
          not hide the rest of the data. */}
      {(accountError || holdingsError || quoteError) && (
        <div className="rounded-lg border border-bear/40 bg-bear/5 p-3 mb-4 space-y-1 text-xs">
          {accountError && (
            <p>
              <span className="text-bear font-semibold">/live/account:</span>{" "}
              <span className="text-muted-foreground">{accountError}</span>
            </p>
          )}
          {holdingsError && (
            <p>
              <span className="text-bear font-semibold">/live/holdings:</span>{" "}
              <span className="text-muted-foreground">{holdingsError}</span>
            </p>
          )}
          {quoteError && (
            <p>
              <span className="text-bear font-semibold">/live/quote/ETH-USD:</span>{" "}
              <span className="text-muted-foreground">{quoteError}</span>
            </p>
          )}
        </div>
      )}

      {/* Cash / portfolio strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-border/60 rounded-xl overflow-hidden border border-border/60">
        <Stat label="Buying Power" value={fmtUsd(account.buyingPower)} />
        <Stat
          label="Cash"
          value={fmtUsd(account.cash ?? account.buyingPower)}
        />
        <Stat
          label="Portfolio Value"
          value={fmtUsd(computedPortfolioValue)}
        />
      </div>

      {/* Holdings + ETH quote */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
        <HoldingCard label="ETH Holdings" value={fmtCrypto(holdings.eth, "ETH")} />
        <HoldingCard label="BTC Holdings" value={fmtCrypto(holdings.btc, "BTC")} />
        <div className="rounded-lg bg-muted/30 border border-border/60 p-3">
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/80">
            ETH-USD Quote
          </div>
          <div className="font-mono-tnum text-sm mt-1 space-y-0.5">
            <div>
              <span className="text-muted-foreground text-xs">bid</span>{" "}
              <span className="text-bull">{fmtPrice(quote.bid)}</span>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">ask</span>{" "}
              <span className="text-bear">{fmtPrice(quote.ask)}</span>
            </div>
          </div>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground/80 mt-4 leading-relaxed border-t border-border/60 pt-3">
        Read-only — no orders can be placed from this panel.{" "}
        <span className="font-medium text-foreground/90">
          LIVE_TRADING_ENABLED is{" "}
          {status?.liveTradingEnabled ? "ON" : "OFF"}
        </span>
        . Account and holdings come straight from Robinhood; quote is the live
        best bid/ask.
      </p>
    </Panel>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card px-4 py-3 sm:px-5 sm:py-4">
      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/80">
        {label}
      </div>
      <div className="mt-1 text-base sm:text-lg font-semibold font-mono-tnum">
        {value}
      </div>
    </div>
  );
}

function HoldingCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/30 border border-border/60 p-3">
      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/80">
        {label}
      </div>
      <div className="font-mono-tnum text-base font-semibold mt-1">{value}</div>
    </div>
  );
}
