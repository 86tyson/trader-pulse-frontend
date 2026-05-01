// Module-level alert pub/sub. Components push alerts; <AlertCenter />
// subscribes and renders the top N visible. Persistent across renders
// (unlike toasts, which auto-dismiss).
//
// Tones map cleanly to what the user spec'd:
//   - "critical" → red, action needed (SELL_REJECTED, ROBINHOOD_AUTH_FAILED, etc.)
//   - "warning"  → yellow, attention but not blocking (SELL_TIMEOUT, SELL_PARTIAL)
//   - "success"  → green, last successful action

import { ApiError, describeError, type ApiErrorCode } from "@/lib/api";

export type AlertTone = "critical" | "warning" | "success";

export interface Alert {
  id: string;
  tone: AlertTone;
  title: string;
  detail?: string;
  code?: ApiErrorCode | string;
  createdAt: number;
}

const MAX_ALERTS = 25;

let alerts: Alert[] = [];
const subscribers = new Set<(list: Alert[]) => void>();

function notify() {
  const snapshot = [...alerts];
  subscribers.forEach((fn) => fn(snapshot));
}

function nextId() {
  return (
    Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8)
  );
}

export function pushAlert(input: Omit<Alert, "id" | "createdAt">) {
  const a: Alert = {
    ...input,
    id: nextId(),
    createdAt: Date.now(),
  };
  alerts = [a, ...alerts].slice(0, MAX_ALERTS);
  notify();
  return a.id;
}

export function dismissAlert(id: string) {
  const before = alerts.length;
  alerts = alerts.filter((a) => a.id !== id);
  if (alerts.length !== before) notify();
}

export function clearAllAlerts() {
  if (alerts.length === 0) return;
  alerts = [];
  notify();
}

export function subscribeAlerts(fn: (list: Alert[]) => void): () => void {
  subscribers.add(fn);
  fn([...alerts]);
  return () => {
    subscribers.delete(fn);
  };
}

// ----- Convenience: classify an error and push a properly-toned alert. -----
const CRITICAL_CODES: ReadonlySet<ApiErrorCode> = new Set([
  "ROBINHOOD_AUTH_FAILED",
  "ROBINHOOD_API_FAILED",
  "ROBINHOOD_KEYS_MISSING",
  "SELL_REJECTED",
  "SELL_FAILED",
  "BACKEND_OFFLINE",
  "INTERNAL_ERROR",
]);
const WARNING_CODES: ReadonlySet<ApiErrorCode> = new Set([
  "SELL_TIMEOUT",
  "SELL_PARTIAL",
  "SELL_CANCELLED",
  "CLOSE_IN_PROGRESS",
  "DAILY_LOSS_CAP_HIT",
  "OPEN_POSITION_EXISTS",
  "BUY_NOT_FILLED",
  "RATE_LIMITED",
]);

export function pushAlertFromError(e: unknown): string | null {
  const { title, detail } = describeError(e);
  let tone: AlertTone = "critical";
  let code: ApiErrorCode | string | undefined;
  if (e instanceof ApiError) {
    code = e.code;
    if (WARNING_CODES.has(e.code)) tone = "warning";
    else if (CRITICAL_CODES.has(e.code)) tone = "critical";
    else tone = "warning";
  }
  return pushAlert({ tone, title, detail, code });
}

export function pushSuccessAlert(title: string, detail?: string) {
  return pushAlert({ tone: "success", title, detail });
}
