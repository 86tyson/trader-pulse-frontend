// Module-level singleton store for /live/status.
//
// Why: SystemStatusBar, ActiveTradePanel, LivePanel, and RobinhoodPanel all
// need this data. With each polling independently every 10–60s, the
// /live-route rate limiter burns fast. This store fetches ONCE every 10s
// and broadcasts to all subscribers via React state.
//
// Safety: this is purely display state — read-only over the existing
// /live/status endpoint. Never used to gate orders.

import { getLiveStatus, type LiveStatusResponse } from "@/lib/api";

const POLL_INTERVAL_MS = 10_000;

let cached: LiveStatusResponse | null = null;
let lastError: string | null = null;
let lastFetchAt: number | null = null;
let pollerStarted = false;
const subscribers = new Set<(snapshot: LiveStatusSnapshot) => void>();

export interface LiveStatusSnapshot {
  status: LiveStatusResponse | null;
  error: string | null;
  lastFetchAt: number | null;
}

function notify() {
  const snap: LiveStatusSnapshot = {
    status: cached,
    error: lastError,
    lastFetchAt,
  };
  subscribers.forEach((fn) => fn(snap));
}

async function tick() {
  try {
    const s = await getLiveStatus();
    cached = s;
    lastError = null;
    lastFetchAt = Date.now();
  } catch (e) {
    lastError = e instanceof Error ? e.message : "fetch failed";
  }
  notify();
}

export function startLiveStatusPoller() {
  if (pollerStarted) return;
  pollerStarted = true;
  void tick();
  setInterval(() => {
    void tick();
  }, POLL_INTERVAL_MS);
}

export function subscribeLiveStatus(
  fn: (s: LiveStatusSnapshot) => void,
): () => void {
  subscribers.add(fn);
  fn({ status: cached, error: lastError, lastFetchAt });
  return () => subscribers.delete(fn);
}

export function refreshLiveStatusNow() {
  void tick();
}
