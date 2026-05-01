import { useEffect, useRef, useState } from "react";
import { askAccountChat, describeError } from "@/lib/api";
import { MessageSquare, X, Send, ShieldCheck, Sparkles } from "lucide-react";

// Floating Account Assistant — read-only chat bubble.
//
// SAFETY DISPLAY:
//   - Panel header includes a "READ-ONLY" badge.
//   - Panel footer disclaimer reminds the user this assistant cannot trade.
//   - The backend route enforces all the actual safety gates; the UI labels
//     are honest reflections of that, not the gates themselves.
//
// State: chat history is local-only (no localStorage / no DB persistence).
// Closing the bubble does NOT clear history; reloading the page does.

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "error";
  text: string;
  source?: string;
  timestamp: number;
}

const PLACEHOLDER =
  "Ask about your account, holdings, trades, or performance...";

function nextId() {
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

export default function ChatBubble() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll the message list when a new message arrives.
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const userMsg: ChatMessage = {
      id: nextId(),
      role: "user",
      text: trimmed,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const r = await askAccountChat({ message: trimmed });
      const assistantMsg: ChatMessage = {
        id: nextId(),
        role: "assistant",
        text: r.answer,
        source: r.source,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (e) {
      const { detail } = describeError(e);
      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          role: "error",
          text: detail,
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift+Enter inserts newline.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  return (
    <>
      {/* Floating Action Button — slightly smaller on mobile so it doesn't
          dominate the viewport, full-size on tablet+. Always ≥44px tap target. */}
      {!open && (
        <button
          type="button"
          aria-label="Open Account Assistant"
          onClick={() => setOpen(true)}
          className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 h-12 w-12 sm:h-14 sm:w-14 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 hover:bg-primary-glow transition-all flex items-center justify-center border border-primary/40"
        >
          <MessageSquare className="h-5 w-5 sm:h-6 sm:w-6" />
        </button>
      )}

      {/* Chat panel — fills more of the viewport on phone, fixed-size on tablet+. */}
      {open && (
        <div
          role="dialog"
          aria-label="Account Assistant"
          className="fixed bottom-4 right-4 left-4 sm:left-auto sm:bottom-6 sm:right-6 z-50 w-auto sm:w-[min(380px,calc(100vw-3rem))] h-[min(560px,calc(100vh-2rem))] sm:h-[min(560px,calc(100vh-3rem))] flex flex-col rounded-2xl border border-border bg-card shadow-2xl shadow-primary/10 backdrop-blur-md animate-fade-in overflow-hidden"
        >
          {/* Header */}
          <header className="px-4 py-3 border-b border-border bg-card/80 flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-8 w-8 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center shrink-0">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold tracking-tight truncate">
                    Account Assistant
                  </h3>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-bull/15 text-bull border border-bull/30 uppercase tracking-wider font-mono-tnum font-semibold">
                    Read-Only
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground truncate">
                  Read-only answers from your Robinhood and app data.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="shrink-0 -mr-1 -mt-1 h-9 w-9 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          {/* Disclaimer banner */}
          <div className="px-4 py-2 border-b border-border bg-bull/5 flex items-center gap-2">
            <ShieldCheck className="h-3.5 w-3.5 text-bull shrink-0" />
            <p className="text-[11px] text-foreground/80 leading-snug">
              This assistant is read-only and cannot place trades.
            </p>
          </div>

          {/* Messages */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
          >
            {messages.length === 0 && !loading && (
              <div className="text-center py-6">
                <p className="text-sm text-muted-foreground">
                  Try asking:
                </p>
                <ul className="mt-3 space-y-1.5 text-xs text-muted-foreground">
                  <li>"What's my buying power?"</li>
                  <li>"How many ETH do I hold?"</li>
                  <li>"Show me my last trade."</li>
                  <li>"Am I in a live position?"</li>
                </ul>
              </div>
            )}

            {messages.map((m) => (
              <MessageBubble key={m.id} msg={m} />
            ))}

            {loading && (
              <div className="flex items-start gap-2">
                <div className="h-7 w-7 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center shrink-0">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="rounded-xl rounded-tl-sm bg-muted/40 border border-border px-3 py-2">
                  <div className="flex gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-pulse" />
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-pulse"
                      style={{ animationDelay: "0.2s" }}
                    />
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-pulse"
                      style={{ animationDelay: "0.4s" }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-border bg-card/80 p-3">
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={PLACEHOLDER}
                rows={1}
                disabled={loading}
                className="flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/40 disabled:opacity-50 max-h-24"
                maxLength={1000}
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={!input.trim() || loading}
                aria-label="Send"
                className="shrink-0 h-11 w-11 rounded-lg bg-primary text-primary-foreground hover:bg-primary-glow disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground/70 mt-1.5 px-0.5">
              Press Enter to send · Shift+Enter for newline
            </p>
          </div>
        </div>
      )}
    </>
  );
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-xl rounded-tr-sm bg-primary text-primary-foreground px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words">
          {msg.text}
        </div>
      </div>
    );
  }
  if (msg.role === "error") {
    return (
      <div className="flex items-start gap-2">
        <div className="h-7 w-7 rounded-full bg-bear/15 border border-bear/40 flex items-center justify-center shrink-0">
          <X className="h-3.5 w-3.5 text-bear" />
        </div>
        <div className="max-w-[85%] rounded-xl rounded-tl-sm bg-bear/10 border border-bear/30 px-3 py-2 text-sm leading-relaxed text-bear whitespace-pre-wrap break-words">
          {msg.text}
        </div>
      </div>
    );
  }
  // Assistant message
  const isSafetyGate = msg.source === "safety-gate" || msg.source === "output-guard";
  return (
    <div className="flex items-start gap-2">
      <div className="h-7 w-7 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center shrink-0">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
      </div>
      <div
        className={`max-w-[85%] rounded-xl rounded-tl-sm px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words ${
          isSafetyGate
            ? "bg-warning/10 border border-warning/30 text-foreground"
            : "bg-muted/40 border border-border text-foreground"
        }`}
      >
        {msg.text}
        {msg.source === "fallback" && (
          <div className="text-[10px] text-muted-foreground/70 mt-1.5 italic">
            (Fallback mode — set ANTHROPIC_API_KEY for natural-language answers)
          </div>
        )}
      </div>
    </div>
  );
}
