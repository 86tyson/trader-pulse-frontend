import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are the in-app assistant for the "Crypto Trade Control Panel" — a paper-mode (simulation only) crypto trading dashboard mockup. Help users understand how the app works.

Key facts about the app:
- 100% PAPER MODE / MOCK DATA. No real trades, no real Robinhood connection, no real API keys, no real money.
- Scans BTC and ETH using mock market snapshots and a simple rule-based strategy.
- Strategy filters for a BUY setup require: price above 50-period MA, pullback >= 3% from recent high, and risk/reward ratio >= 1.5:1.
- Confidence is scored HIGH / MEDIUM / LOW based on trend strength and volume. LOW-confidence setups are auto-skipped.
- Recommendations show entry, stop loss, profit target, R/R, and a plain-English rationale. The user can Approve or Decline.
- Approving a recommendation simulates an immediate close (win biased by confidence: HIGH ~70%, otherwise ~55%) and updates the mock account P/L.
- The dashboard includes: System Status, Account Summary, Scenario selector (Bullish / Bearish / Choppy / Low Vol / Random), Market Scan, Recommendations, Performance, Weekly Report, and Trade Log.
- A scan auto-runs every 30 seconds when the bot is enabled. Users can also click "Run Scan".
- All state is persisted in browser localStorage. There is no real database for trade data.

Be concise, friendly, and accurate. If asked about real trading, real money, or connecting to Robinhood — clearly explain this is a paper-mode mockup only and no real integration exists. Use markdown for formatting when helpful.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages } = await req.json();
    if (!Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "messages must be an array" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit reached. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits in Settings → Workspace → Usage." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
