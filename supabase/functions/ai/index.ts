// Supabase Edge Function: AI helper
// Deploy with: supabase functions deploy ai
// Set secret with: supabase secrets set GROQ_API_KEY=...

import "jsr:@supabase/functions-js/edge-runtime.d.ts"

declare const Deno: {
  env: { get: (key: string) => string | undefined }
  serve: (handler: (req: Request) => Response | Promise<Response>) => void
}

type AiRequest = {
  prompt: string
  context?: unknown
}

const corsHeaders: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders })
  }

  const groqKey = Deno.env.get("GROQ_API_KEY")
  if (!groqKey) {
    return Response.json({ error: "GROQ_API_KEY is not set" }, { status: 500, headers: corsHeaders })
  }

  let body: AiRequest
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400, headers: corsHeaders })
  }

  const rawPrompt = (body?.prompt ?? "").trim()
  const context = body?.context
  const prompt = context
    ? `Context (user data snapshot):\n${JSON.stringify(context)}\n\nUser request:\n${rawPrompt}`
    : rawPrompt
  if (prompt.length < 3) {
    return Response.json({ error: "Prompt is too short" }, { status: 400, headers: corsHeaders })
  }
  if (prompt.length > 4000) {
    return Response.json({ error: "Prompt is too long" }, { status: 400, headers: corsHeaders })
  }

  const upstream = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${groqKey}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content:
            "You are TradeTrackr AI. Be concise, practical, and focus on trading journaling insights. Never request secrets.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
    }),
  })

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => "")
    return Response.json(
      { error: "Upstream error", status: upstream.status, details: text.slice(0, 4000) },
      { status: 502, headers: corsHeaders }
    )
  }

  const data = await upstream.json()
  const outputText = data?.choices?.[0]?.message?.content ?? ""

  return Response.json({ text: outputText }, { headers: corsHeaders })
})

