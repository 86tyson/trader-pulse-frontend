import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type Tone = "bull" | "bear" | "warning" | "neutral" | "accent" | "muted";

const tones: Record<Tone, string> = {
  bull: "bg-bull/15 text-bull border-bull/30",
  bear: "bg-bear/15 text-bear border-bear/30",
  warning: "bg-warning/15 text-warning border-warning/40",
  neutral: "bg-muted text-muted-foreground border-border",
  accent: "bg-accent/15 text-accent border-accent/30",
  muted: "bg-muted/60 text-muted-foreground border-border",
};

export function StatusBadge({
  tone = "neutral",
  pulse = false,
  className,
  children,
}: {
  tone?: Tone;
  pulse?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-medium uppercase tracking-wider font-mono-tnum",
        tones[tone],
        className,
      )}
    >
      {pulse && <span className={cn("h-1.5 w-1.5 rounded-full ticker-pulse", tone === "bull" ? "bg-bull" : tone === "bear" ? "bg-bear" : tone === "warning" ? "bg-warning" : "bg-current")} />}
      {children}
    </span>
  );
}
