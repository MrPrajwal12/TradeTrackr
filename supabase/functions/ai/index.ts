// Supabase Edge Function: AI helper
// Deploy with: supabase functions deploy ai
// Set secret with: supabase secrets set OPENAI_API_KEY=...

import "jsr:@supabase/functions-js/edge-runtime.d.ts"

declare const Deno: {
  env: { get: (key: string) => string | undefined }
  serve: (handler: (req: Request) => Response | Promise<Response>) => void
}

type AiRequest = {
  prompt: string
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

  const openaiKey = Deno.env.get("OPENAI_API_KEY")
  if (!openaiKey) {
    return Response.json({ error: "OPENAI_API_KEY is not set" }, { status: 500, headers: corsHeaders })
  }

  let body: AiRequest
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400, headers: corsHeaders })
  }

  const prompt = (body?.prompt ?? "").trim()
  if (prompt.length < 3) {
    return Response.json({ error: "Prompt is too short" }, { status: 400, headers: corsHeaders })
  }
  if (prompt.length > 4000) {
    return Response.json({ error: "Prompt is too long" }, { status: 400, headers: corsHeaders })
  }

  const upstream = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content:
            "You are TradeTrackr AI. Be concise, practical, and focus on trading journaling insights. Never request secrets.",
        },
        { role: "user", content: prompt },
      ],
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
  const outputText =
    data?.output?.[0]?.content?.find((c: { type: string }) => c?.type === "output_text")?.text ??
    ""

  return Response.json({ text: outputText }, { headers: corsHeaders })
})

