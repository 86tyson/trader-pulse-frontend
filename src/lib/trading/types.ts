export type AssetSymbol = "BTC" | "ETH";
export type Side = "BUY" | "SELL";
export type Confidence = "HIGH" | "MEDIUM" | "LOW";
export type MarketCondition = "FAVORABLE" | "CHOPPY" | "LOW_VOLUME" | "LOW_VOLATILITY";
export type TrendStatus = "UPTREND" | "DOWNTREND" | "SIDEWAYS";
export type Quality = "STRONG" | "OK" | "WEAK";

export interface MarketSnapshot {
  symbol: AssetSymbol;
  price: number;
  change24h: number;          // percent
  ma50: number;
  recentHigh: number;
  support: number;
  resistance: number;
  trend: TrendStatus;
  volatility: Quality;
  volume: Quality;
  condition: MarketCondition;
  pullbackPct: number;        // percent off recent high
}

export interface Recommendation {
  id: string;
  symbol: AssetSymbol;
  side: Side;
  amountUsd: number;
  entry: number;
  stopLoss: number;
  profitTarget: number;
  invalidation: number;
  riskRewardRatio: number;
  confidence: Confidence;
  reasoning: string;
  srNotes: string;
  marketSummary: string;
  createdAt: number;
}

export type TradeStatus = "APPROVED" | "DECLINED" | "SIMULATED" | "SKIPPED" | "CLOSED_WIN" | "CLOSED_LOSS";

export interface TradeLogEntry {
  id: string;
  timestamp: number;
  symbol: AssetSymbol;
  side: Side;
  status: TradeStatus;
  entry?: number;
  exit?: number;
  resultPct?: number;
  resultUsd?: number;
  amountUsd: number;
  confidence?: Confidence;
  notes: string;
}

export interface SystemState {
  paperMode: true;
  botEnabled: boolean;
  autoExecution: false;
  approvalRequired: true;
  mockData: true;
  lastScanAt: number | null;
  nextScanAt: number | null;
}

export interface Account {
  buyingPower: number;
  portfolioValue: number;
  btcHoldings: number;       // units
  ethHoldings: number;
  openPositions: number;
  dailyPnl: number;
  weeklyPnl: number;
}

export interface NoTradeReason {
  symbol: AssetSymbol;
  reasons: string[];
}
