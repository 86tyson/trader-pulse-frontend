import { useEffect, useState } from "react";
import {
  dismissAlert,
  subscribeAlerts,
  type Alert as AlertEntry,
  type AlertTone,
} from "@/lib/alertCenter";
import { AlertTriangle, AlertCircle, CheckCircle2, X } from "lucide-react";

const VISIBLE_LIMIT = 3;

const TONE_STYLES: Record<
  AlertTone,
  { border: string; bg: string; text: string; Icon: typeof AlertCircle }
> = {
  critical: {
    border: "border-bear/50",
    bg: "bg-bear/10",
    text: "text-bear",
    Icon: AlertCircle,
  },
  warning: {
    border: "border-warning/50",
    bg: "bg-warning/10",
    text: "text-warning",
    Icon: AlertTriangle,
  },
  success: {
    border: "border-bull/40",
    bg: "bg-bull/5",
    text: "text-bull",
    Icon: CheckCircle2,
  },
};

export default function AlertCenter() {
  const [alerts, setAlerts] = useState<AlertEntry[]>([]);
  useEffect(() => subscribeAlerts(setAlerts), []);

  if (alerts.length === 0) return null;

  const visible = alerts.slice(0, VISIBLE_LIMIT);
  const overflow = alerts.length - visible.length;

  return (
    <div className="space-y-2">
      {visible.map((a) => {
        const s = TONE_STYLES[a.tone];
        const Icon = s.Icon;
        return (
          <div
            key={a.id}
            className={`rounded-xl border ${s.border} ${s.bg} px-4 py-3 flex items-start gap-3 backdrop-blur-sm animate-fade-in`}
          >
            <Icon className={`h-4 w-4 ${s.text} shrink-0 mt-0.5`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-sm font-semibold ${s.text}`}>
                  {a.title}
                </span>
                {a.code && (
                  <code className="text-[10px] px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground font-mono uppercase tracking-wider">
                    {a.code}
                  </code>
                )}
              </div>
              {a.detail && (
                <div className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  {a.detail}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismissAlert(a.id)}
              className="shrink-0 -mr-1 -mt-1 h-9 w-9 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              aria-label="Dismiss alert"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
      {overflow > 0 && (
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 text-right pr-1">
          {overflow} more older alert{overflow === 1 ? "" : "s"}
        </div>
      )}
    </div>
  );
}
