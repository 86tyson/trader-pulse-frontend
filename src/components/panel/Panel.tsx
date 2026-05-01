import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface PanelProps {
  title?: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Panel({ title, subtitle, right, children, className }: PanelProps) {
  return (
    <section className={cn("panel p-5 sm:p-6 animate-fade-in", className)}>
      {(title || right) && (
        <header className="flex items-start justify-between gap-3 mb-4">
          <div>
            {title && (
              <h2 className="text-xs uppercase tracking-[0.2em] text-muted-foreground font-medium">
                {title}
              </h2>
            )}
            {subtitle && <p className="text-sm text-foreground/80 mt-1">{subtitle}</p>}
          </div>
          {right && <div className="shrink-0">{right}</div>}
        </header>
      )}
      {children}
    </section>
  );
}
