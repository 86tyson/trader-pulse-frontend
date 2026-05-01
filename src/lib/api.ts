import type { Confidence, MarketSnapshot, Recommendation } from "@/lib/trading/types";
import type { ScanResult } from "@/lib/trading/strategy";

// Backend base URL. In production this points at the Railway deployment;
// in local dev override via .env to point at the local backend.
//
// PUBLIC-ONLY DEPLOYMENT: this frontend talks ONLY to the read-only public
// endpoints exposed by the backend (`/api/public/status`,
// `/api/public/performance`, `/api/public/trades`). No Authorization or
// x-api-key header is sent by any function in this module.
const BASE = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:3001";

// Stable error codes the backend can emit (plus our synthetic BACKEND_OFFLINE for fetch failures).
export type ApiErrorCode =
  | "BACKEND_OFFLINE"
  | "UNAUTHENTICATED"
  | "BOT_DISABLED"
  | "MISSING_FIELDS"
  | "INVALID_SIDE"
  | "SYMBOL_NOT_ALLOWED"
  | "AMOUNT_OUT_OF_RANGE"
  | "RISK_FIELDS_INVALID"
  | "CONFIDENCE_TOO_LOW"
  | "DAILY_LOSS_CAP_HIT"
  | "DUPLICATE_RECOMMENDATION"
  | "INVALID_BODY"
  | "RATE_LIMITED"
  | "NOT_IMPLEMENTED"
  | "PAYLOAD_TOO_LARGE"
  | "NOT_FOUND"
  | "INTERNAL_ERROR"
  | "MARKET_DATA_UNAVAILABLE"
  // Phase 3 live trading
  | "LIVE_TRADING_DISABLED"
  | "ROBINHOOD_KEYS_MISSING"
  | "ROBINHOOD_AUTH_FAILED"
  | "ROBINHOOD_API_FAILED"
  | "CONFIRMATION_MISSING"
  | "SYMBOL_NOT_ALLOWED_LIVE"
  | "OPEN_POSITION_EXISTS"
  | "NO_OPEN_POSITION"
  | "BUY_NOT_FILLED"
  | "CLOSE_IN_PROGRESS"
  | "SELL_REJECTED"
  | "SELL_FAILED"
  | "SELL_CANCELLED"
  | "SELL_TIMEOUT"
  | "SELL_PARTIAL";

export class ApiError extends Error {
  code: ApiErrorCode;
  reason: string;
  httpStatus: number | null;
  constructor(code: ApiErrorCode, reason: string, httpStatus: number | null = null) {
    super(reason);
    this.name = "ApiError";
    this.code = code;
    this.reason = reason;
    this.httpStatus = httpStatus;
  }
}

type RequestOpts = RequestInit;

async function request<T = unknown>(path: string, opts: RequestOpts = {}): Promise<T> {
  const headers = new Headers(opts.headers);
  // No Authorization / x-api-key header is ever attached. The frontend
  // calls public endpoints only. Auth-protected endpoints (live trading,
  // AI chat, scan, approve/decline) will return 401 in production — that
  // is intentional and expected.
  if (opts.body) headers.set("Content-Type", "application/json");

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { ...opts, headers });
  } catch {
    // network / DNS / CORS failures all collapse here
    throw new ApiError(
      "BACKEND_OFFLINE",
      "Cannot reach backend (offline, CORS, or wrong VITE_BACKEND_URL).",
    );
  }

  let body: { code?: ApiErrorCode; reason?: string; [k: string]: unknown } | null = null;
  try { body = await res.json(); } catch { /* empty body */ }

  if (!res.ok) {
    const code = (body?.code as ApiErrorCode) ?? "INTERNAL_ERROR";
    const reason = body?.reason ?? `HTTP ${res.status}`;
    throw new ApiError(code, reason, res.status);
  }
  return body as T;
}

// =============================================================================
// PUBLIC dashboard endpoints — no auth header, deployed at /api/public/*.
// These three are the only routes that work in the public deployment. The
// adapters below expose the same shapes the components have been consuming,
// synthesizing missing fields with safe defaults so no UI breaks.
// =============================================================================

interface PublicStatusResponse {
  ok: true;
  paperMode: boolean;
  botEnabled: boolean;
  liveTradingEnabled: boolean;
  autoTradingEnabled: boolean;
  manualApprovalRequired: boolean;
  allowedSymbols: string[];
  liveAllowedSymbols?: string[];
  timestamp: string;
}

interface PublicPerformanceResponse {
  ok: true;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number | null;
  avgWinUsd: number | null;
  avgLossUsd: number | null;
  realizedRR: number | null;
  netPnlUsd: number;
  weeklyPnlUsd: number;
}

interface PublicTradesResponse {
  ok: true;
  count: number;
  trades: Array<{
    id: number;
    recommendation_id?: string;
    symbol: string;
    side: "buy" | "sell";
    suggested_amount_usd?: number;
    confidence_score?: number;
    status: "simulated" | "executed" | "rejected";
    mode: "paper" | "live";
    simulated_pnl_usd: number | null;
    outcome: string | null;
    created_at: string;
    exit_price: number | null;
    exit_timestamp: string | null;
    entry_price?: number | null;
    filled_quantity?: number | null;
    robinhood_order_id?: string | null;
  }>;
}

// Raw public-endpoint accessors. Keep these unexported — components consume
// the legacy adapters below.
function fetchPublicStatus() {
  return request<PublicStatusResponse>("/api/public/status");
}
function fetchPublicPerformance() {
  return request<PublicPerformanceResponse>("/api/public/performance");
}
function fetchPublicTrades() {
  return request<PublicTradesResponse>("/api/public/trades");
}

// ---------- Health (now backed by /api/public/status) ----------
export interface HealthResponse {
  ok: true;
  server: string;
  paperMode: boolean;
  botEnabled: boolean;
  liveTradingEnabled?: boolean;
  autoTradingEnabled?: boolean;
  manualApprovalRequired?: boolean;
  allowedSymbols: string[];
  liveAllowedSymbols?: string[];
  timestamp: string;
}
export async function getHealth(): Promise<HealthResponse> {
  const s = await fetchPublicStatus();
  return {
    ok: true,
    server: "running",
    paperMode: s.paperMode,
    botEnabled: s.botEnabled,
    liveTradingEnabled: s.liveTradingEnabled,
    autoTradingEnabled: s.autoTradingEnabled,
    manualApprovalRequired: s.manualApprovalRequired,
    allowedSymbols: s.allowedSymbols,
    liveAllowedSymbols: s.liveAllowedSymbols,
    timestamp: s.timestamp,
  };
}

// ---------- Account ----------
// /api/public/status does not expose account balances (privacy). The
// adapter returns nulls so the UI can render "—" gracefully.
export async function getAccount() {
  const s = await fetchPublicStatus();
  return {
    ok: true as const,
    mode: (s.paperMode ? "paper" : "live") as "paper" | "live",
    account: {
      cashUsd: null as number | null,
      equityUsd: null as number | null,
      buyingPowerUsd: null as number | null,
    },
    holdings: [] as Array<{
      symbol: string;
      quantity: number;
      avgCostUsd: number;
      marketValueUsd: number;
    }>,
    note: "Account balances are not exposed in public read-only mode.",
  };
}

// ---------- Performance ----------
// /api/public/performance lacks `openOrUnsettled` (the auth-protected
// version computes it from open trades). Add it as 0 — the public dashboard
// counts open positions through /api/public/status anyway.
export async function getPerformance() {
  const p = await fetchPublicPerformance();
  return {
    ...p,
    openOrUnsettled: 0,
    note: "Public performance summary. Open positions are not exposed here.",
  };
}

// ---------- Trades ----------
export async function getTrades() {
  return fetchPublicTrades();
}

// ---------- Weekly Report ----------
// No public weekly-report endpoint. Synthesize an empty payload so the
// WeeklyReport component renders its empty state instead of erroring.
export async function getWeeklyReport() {
  return {
    ok: true as const,
    period: "last_7_days" as const,
    totalTrades: 0,
    wins: 0,
    losses: 0,
    netPnlUsd: 0,
    bestSetup: null as null | { recommendationId: string; entryReason: string | null; pnlUsd: number },
    worstSetup: null as null | { recommendationId: string; entryReason: string | null; pnlUsd: number },
    notes:
      "Weekly report is not exposed in public read-only mode. " +
      "See the trade history panel for individual trades.",
  };
}

// ---------- ETH 1D Forward Validation ----------
//
// Read-only snapshot of the locked ETH 1D Compression Breakout forward-validation
// runner. The backend serves whatever the offline runner most recently wrote to
// `data/forward/latest.json`. The frontend NEVER computes the strategy itself.
export type ForwardStatus = "inactive" | "waiting" | "open" | "closed";

export interface ForwardLatestResponse {
  ok: true;
  schemaVersion: number;
  lastUpdatedIso: string;
  strategy: {
    name: string;
    source: string;
    timeframe: string;
    symbol: string;
    costBps: number;
    notionalUsd: number;
    exitPlan: string;
  };
  forwardWindow: {
    startIso: string;
    lastCandleIso: string;
    lastClose: number;
    barsElapsed: number;
  };
  today: {
    dateIso: string;
    status: ForwardStatus;
    signal: boolean;
    classification:
      | "no-signal"
      | "signal-trade-opened"
      | "position-open-no-action"
      | "trade-closed-today"
      | null;
    entryPrice: number | null;
    stopLoss: number | null;
    profitTarget: number | null;
    rMultiple: number | null;
    unrealizedPnlUsd: number | null;
    realizedPnlUsd: number | null;
    notes: string;
  };
  openTrade: {
    entryDateIso: string;
    entryPrice: number;
    stopLoss: number;
    profitTarget: number;
    rUsd: number;
    side: "BUY" | "SELL";
  } | null;
  summary: {
    totalSignals: number;
    tradesOpened: number;
    tradesClosed: number;
    wins: number;
    losses: number;
    winRate: number | null;
    realizedPnlUsd: number;
    expectancyPerTradeUsd: number | null;
  };
  safety: {
    paperMode: boolean;
    liveTrading: boolean;
    robinhoodConnected: boolean;
  };
}

// /api/public/trades is the closest public equivalent of the forward feed.
// We synthesize a minimal ForwardLatestResponse so EthForwardPanel renders
// its inactive/standing-by state cleanly instead of erroring. When a real
// public forward-feed endpoint is added later, swap this implementation.
export async function getForwardLatest(): Promise<ForwardLatestResponse> {
  const today = new Date();
  const dateIso = today.toISOString().slice(0, 10);
  return {
    ok: true,
    schemaVersion: 1,
    lastUpdatedIso: today.toISOString(),
    strategy: {
      name: "ETH 1D Compression Breakout",
      source: "src/lib/trading/fundingCompressionStrategy.ts",
      timeframe: "1d",
      symbol: "ETH",
      costBps: 30,
      notionalUsd: 25,
      exitPlan: "staged-r-trail (BE@1R, prior-bar-low trail from 2R, 48-bar time stop)",
    },
    forwardWindow: {
      startIso: today.toISOString(),
      lastCandleIso: dateIso,
      lastClose: 0,
      barsElapsed: 0,
    },
    today: {
      dateIso,
      status: "inactive",
      signal: false,
      classification: null,
      entryPrice: null,
      stopLoss: null,
      profitTarget: null,
      rMultiple: null,
      unrealizedPnlUsd: null,
      realizedPnlUsd: null,
      notes: "Forward-feed snapshot is not exposed in public read-only mode.",
    },
    openTrade: null,
    summary: {
      totalSignals: 0,
      tradesOpened: 0,
      tradesClosed: 0,
      wins: 0,
      losses: 0,
      winRate: null,
      realizedPnlUsd: 0,
      expectancyPerTradeUsd: null,
    },
    safety: {
      paperMode: true,
      liveTrading: false,
      robinhoodConnected: false,
    },
  };
}

// ---------- Phase 3: micro live testing ----------
//
// Read-only `/live/status` is cheap (DB only — no Robinhood calls). Used by
// the live panel to render the kill-switch state, caps, today's live P/L,
// and open-position count.
//
// `POST /live/approve` is the single live-order-placement endpoint. The
// frontend MUST send `confirmedRealMoney: true` from a UI element the user
// has explicitly interacted with (a checkbox), AND the backend re-verifies
// every safety gate before forwarding to Robinhood.

export interface LiveStatusResponse {
  ok: true;
  liveTradingEnabled: boolean;
  autoTradingEnabled: boolean;
  botEnabled: boolean;
  paperMode: boolean;
  requireApproval: boolean;
  // Derived: true when manual approval is the ONLY way an order can be placed
  // right now (i.e. liveTradingEnabled=true AND autoTradingEnabled=false).
  manualApprovalRequired: boolean;
  robinhoodConnected: boolean;
  caps: {
    maxOrderUsd: number;
    dailyLossCapUsd: number;
    allowedSymbols: string[];
  };
  today: {
    liveRealizedLossUsd: number;
    openLivePositions: number;
  };
}

export interface LiveApproveRequest {
  recommendationId: string;
  symbol: "ETH-USD";
  side: "buy" | "sell";
  usdAmount: number;
  confirmedRealMoney: true;
  orderType?: "limit" | "market";
  note?: string;
}

export interface LiveApproveSuccess {
  ok: true;
  status: "placed";
  mode: "live";
  tradeId: number;
  recommendationId: string;
  order: unknown;
  sizing: {
    clientOrderId: string;
    orderType: "limit" | "market";
    assetQuantity: number;
    limitPrice: number | null;
    referencePrice: number;
  };
}

// Backed by /api/public/status. Fields not exposed publicly
// (`robinhoodConnected`, `caps`, `today.*`) are filled with safe defaults.
// Components that gate on `robinhoodConnected` (LivePanel, RobinhoodPanel,
// ActiveTradePanel, ReconcilePanel) will hide themselves cleanly.
export async function getLiveStatus(): Promise<LiveStatusResponse> {
  const s = await fetchPublicStatus();
  return {
    ok: true,
    liveTradingEnabled: s.liveTradingEnabled,
    autoTradingEnabled: s.autoTradingEnabled,
    botEnabled: s.botEnabled,
    paperMode: s.paperMode,
    requireApproval: true,
    manualApprovalRequired: s.manualApprovalRequired,
    robinhoodConnected: false,
    caps: {
      maxOrderUsd: 0,
      dailyLossCapUsd: 0,
      allowedSymbols: s.liveAllowedSymbols ?? [],
    },
    today: {
      liveRealizedLossUsd: 0,
      openLivePositions: 0,
    },
  };
}

export function approveLiveTrade(req: LiveApproveRequest): Promise<LiveApproveSuccess> {
  return request<LiveApproveSuccess>("/live/approve", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

// Close-out the single open live position. Server side derives the asset
// quantity (from the original RH buy fill) and side (sell) — caller only
// supplies the explicit real-money confirmation.
export interface LiveCloseRequest {
  confirmedRealMoney: true;
  note?: string;
}

// Phase-3-hardened response. The backend now polls the sell to a terminal
// state and returns ACTUAL fill data — not the limit-price estimate.
export interface LiveCloseSuccess {
  ok: true;
  status: "closed";
  mode: "live";
  buyTradeId: number;
  sellTradeId: number;
  sellOrderFinal: unknown;
  fill: {
    buyAvgPrice: number;
    buyQty: number;
    sellAvgPrice: number;     // ACTUAL average fill price from Robinhood
    sellFilledQty: number;    // ACTUAL filled quantity
    sellLimitPrice: number;
    realizedPnlUsd: number;   // ACTUAL realized P/L (sell fill − buy fill)
    buyOutcome: "win" | "loss";
  };
  poll: {
    pollCount: number;
    elapsedMs: number;
  };
}

export function closeLivePosition(req: LiveCloseRequest): Promise<LiveCloseSuccess> {
  return request<LiveCloseSuccess>("/live/close", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

// Reconcile local trade rows with actual Robinhood order state.
// READ-ONLY against Robinhood — no orders placed. Does NOT require
// LIVE_TRADING_ENABLED. Available whenever Robinhood credentials are set.
export interface ReconcileSummary {
  ok: true;
  ordersChecked: number;
  rowsUpdated: number;
  filledFound: number;
  cancelledFound: number;
  rejectedFound: number;
  partialFound: number;
  warnings: string[];
  actions: Array<{ rowId: number; action: string; reason: string }>;
}

export function reconcileLiveFills(): Promise<ReconcileSummary> {
  return request<ReconcileSummary>("/live/reconcile", {
    method: "POST",
  });
}

// ---------- Account Assistant (read-only AI) ----------
//
// Calls POST /ai/account-chat. The backend builds a sanitized context from
// read-only sources (live status / RH account / holdings / quote / orders /
// local trades) and asks the AI model. The route NEVER places trades.
export interface AccountChatRequest {
  message: string;
}
export interface AccountChatResponse {
  ok: true;
  answer: string;
  source: "claude" | "fallback" | "safety-gate" | "output-guard" | "api-error" | "empty" | "invalid";
  durationMs?: number;
  contextKeys?: string[];
  rhFetches?: {
    account: boolean;
    holdings: boolean;
    quote: boolean;
    orders: boolean;
  };
}

export function askAccountChat(req: AccountChatRequest): Promise<AccountChatResponse> {
  return request<AccountChatResponse>("/ai/account-chat", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

// Read-only Robinhood passthroughs. These hit the Robinhood Crypto Trading
// API via the backend's signed-request client — no order is ever placed by
// these calls. Returned `data` shape comes straight from Robinhood; callers
// should parse defensively because the upstream schema can drift.
export interface LiveDataResponse<T = unknown> {
  ok: true;
  data: T;
}

export function getLiveAccount(): Promise<LiveDataResponse> {
  return request<LiveDataResponse>("/live/account");
}

export function getLiveHoldings(): Promise<LiveDataResponse> {
  return request<LiveDataResponse>("/live/holdings");
}

export function getLiveQuote(symbol: string): Promise<LiveDataResponse> {
  return request<LiveDataResponse>(`/live/quote/${encodeURIComponent(symbol)}`);
}

// ---------- Scan (real-market recommendation generator) ----------
export interface ScanResponse {
  ok: true;
  timeframe: "5m" | "15m" | "1h" | "1d";
  generatedAt: string;
  cached: boolean;
  results: ScanResult[];
}

/**
 * Trigger a real-market scan. The backend pulls live BTC-USD and ETH-USD
 * candles from Coinbase, builds MarketSnapshots, runs evaluateMarket(), and
 * returns one ScanResult per symbol. Cached server-side for 60 seconds.
 *
 * Surfaces:
 *   - MARKET_DATA_UNAVAILABLE (502) when the upstream public API can't be reached
 *   - BACKEND_OFFLINE         when this backend itself is unreachable
 *   - UNAUTHENTICATED         in public-only deployment, /scan is auth-protected
 *                             on the backend so it returns 401 here. Trade
 *                             execution / scan / approvals do not function in
 *                             the public deployment.
 */
export function runScan(timeframe: "5m" | "15m" | "1h" | "1d" = "1h"): Promise<ScanResponse> {
  const qs = timeframe === "1h" ? "" : `?timeframe=${timeframe}`;
  return request<ScanResponse>(`/scan${qs}`);
}

// Re-export for components consuming /scan results.
export type { Confidence, MarketSnapshot, Recommendation, ScanResult };

// ---------- Approve / Decline ----------

/**
 * Convert a Lovable strategy `Recommendation` into the backend's `TradeRequest` payload.
 *
 * Field mapping notes:
 *  - symbol: backend expects "BTC-USD" / "ETH-USD" (its ALLOWED_SYMBOLS default).
 *  - side: backend expects lowercase "buy" / "sell".
 *  - confidenceScore: backend expects 0..1 numeric. The Lovable strategy returns a
 *    bucket string (HIGH | MEDIUM | LOW). We map to numbers comfortably above the
 *    backend's MIN_CONFIDENCE=0.5 floor for HIGH/MEDIUM (LOW would be filtered).
 *  - riskReward: the Lovable strategy's `riskRewardRatio` is the S/R-quality score
 *    used by its filter, NOT the placed-trade R. The actual order has stop=entry*0.98
 *    and target=entry*1.03, which is exactly 1.5R. We send 1.5 so the backend's paper
 *    simulator can derive the entry price correctly from (stop, target, R).
 */
// `riskMode` is OPTIONAL and only valid for the paper /trade/approve flow.
// The backend's liveApproveSchema is strict and rejects this field — passing
// it to live trading would fail at the validation layer. Frontend code
// should NEVER pass riskMode to approveLiveTrade / closeLivePosition.
type RiskModeStr = "conservative" | "standard" | "aggressive";

function recommendationToBackendPayload(rec: Recommendation, riskMode?: RiskModeStr) {
  return {
    recommendationId: rec.id,
    symbol: rec.symbol === "BTC" ? "BTC-USD" : "ETH-USD",
    side: rec.side.toLowerCase() as "buy" | "sell",
    suggestedAmountUsd: rec.amountUsd,
    confidenceScore: rec.confidence === "HIGH" ? 0.85 : rec.confidence === "MEDIUM" ? 0.65 : 0.4,
    entryReason: rec.reasoning,
    stopLoss: rec.stopLoss,
    profitTarget: rec.profitTarget,
    invalidationLevel: rec.invalidation,
    riskReward: 1.5,
    // Only attach when set; backend treats omitted as "standard".
    ...(riskMode && riskMode !== "standard" ? { riskMode } : {}),
  };
}

export interface ApproveResponse {
  ok: true;
  status: "simulated" | "executed";
  mode: "paper" | "live";
  tradeId: number;
  recommendationId: string;
  outcome?: "win" | "loss";
  exitPrice?: number;
  entryPrice?: number;
  pnlUsd?: number;
  realizedRR?: number;
  riskMode?: RiskModeStr;
  effectiveAmountUsd?: number;
  message?: string;
}

export function approveRecommendation(
  rec: Recommendation,
  riskMode?: RiskModeStr,
): Promise<ApproveResponse> {
  return request<ApproveResponse>("/trade/approve", {
    method: "POST",
    body: JSON.stringify(recommendationToBackendPayload(rec, riskMode)),
  });
}

export function declineRecommendation(recommendationId: string, reason = "user declined") {
  return request("/trade/decline", {
    method: "POST",
    body: JSON.stringify({ recommendationId, reason }),
  });
}

// ---------- Error → human-readable description ----------
export function describeError(e: unknown): { title: string; detail: string } {
  if (e instanceof ApiError) {
    switch (e.code) {
      case "BACKEND_OFFLINE":
        return {
          title: "Backend offline",
          detail: "Check VITE_BACKEND_URL, CORS allow-list, and that the backend is running.",
        };
      case "UNAUTHENTICATED":
        return {
          title: "Not available in public mode",
          detail:
            "This action requires a private endpoint that the public deployment does not expose. " +
            "Run a local backend with full credentials to use this feature.",
        };
      case "BOT_DISABLED":
        return {
          title: "Bot disabled",
          detail: "BOT_ENABLED is false on the backend. Trades will be rejected until it is enabled.",
        };
      case "DUPLICATE_RECOMMENDATION":
        return {
          title: "Already processed",
          detail: "This recommendation was already approved or declined. Generate a new one.",
        };
      case "SYMBOL_NOT_ALLOWED":
      case "AMOUNT_OUT_OF_RANGE":
      case "CONFIDENCE_TOO_LOW":
      case "RISK_FIELDS_INVALID":
      case "INVALID_SIDE":
      case "MISSING_FIELDS":
      case "INVALID_BODY":
      case "DAILY_LOSS_CAP_HIT":
        return { title: "Trade rejected", detail: e.reason };
      case "RATE_LIMITED":
        return { title: "Slow down", detail: "Too many trade requests in a short window." };
      case "NOT_IMPLEMENTED":
        return {
          title: "Live mode not ready",
          detail: "Robinhood live execution is not yet wired. Stay in paper mode.",
        };
      case "MARKET_DATA_UNAVAILABLE":
        return {
          title: "Market data unavailable",
          detail: "Could not reach the upstream price feed. Try again in a minute.",
        };
      case "LIVE_TRADING_DISABLED":
        return {
          title: "Live trading disabled",
          detail:
            "LIVE_TRADING_ENABLED is false on the backend. Set it to true and restart to place real orders.",
        };
      case "ROBINHOOD_KEYS_MISSING":
        return {
          title: "Robinhood not configured",
          detail:
            "ROBINHOOD_API_KEY and ROBINHOOD_PRIVATE_KEY must be set on the backend.",
        };
      case "ROBINHOOD_AUTH_FAILED":
        return {
          title: "Robinhood rejected the request",
          detail:
            "Signature verification failed. Check the API key, private key, and the canonical-message format.",
        };
      case "ROBINHOOD_API_FAILED":
        return { title: "Robinhood API error", detail: e.reason };
      case "CONFIRMATION_MISSING":
        return {
          title: "Confirmation required",
          detail: "Tick the real-money confirmation checkbox before approving.",
        };
      case "SYMBOL_NOT_ALLOWED_LIVE":
        return {
          title: "Live trading is ETH-only",
          detail: e.reason,
        };
      case "OPEN_POSITION_EXISTS":
        return {
          title: "One live position max",
          detail: "Close the existing live position before placing another.",
        };
      case "NO_OPEN_POSITION":
        return {
          title: "Nothing to close",
          detail: "No open live position exists.",
        };
      case "BUY_NOT_FILLED":
        return {
          title: "Buy not yet filled",
          detail:
            "The original buy order has not fully filled. Cannot close until it does.",
        };
      case "CLOSE_IN_PROGRESS":
        return {
          title: "Close already in progress",
          detail:
            "A previous close attempt for this position is unresolved. Reconcile manually before retrying.",
        };
      case "SELL_REJECTED":
      case "SELL_FAILED":
      case "SELL_CANCELLED":
        return {
          title: "Robinhood refused the sell",
          detail:
            (e.reason || "The sell did not fill.") +
            " The position remains OPEN — no fill occurred.",
        };
      case "SELL_TIMEOUT":
        return {
          title: "Sell did not fill within 60s",
          detail:
            "The sell may still be live at Robinhood. Position may still be open. Check `/live/orders/<sell_id>` and reconcile manually.",
        };
      case "SELL_PARTIAL":
        return {
          title: "Sell partially filled",
          detail:
            "Position is partially closed at Robinhood. Manual reconciliation required before retrying.",
        };
      default:
        return { title: "Error", detail: e.reason };
    }
  }
  return { title: "Error", detail: e instanceof Error ? e.message : "Unknown error" };
}
