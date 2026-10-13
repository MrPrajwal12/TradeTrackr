// Sync today's P/L from DhanHQ positions (+ trades fallback) into trade_entries.
// Deploy: supabase functions deploy dhan-sync
//
// Body: { broker_id: string, include_unrealized?: boolean }
// Auth: user JWT (Authorization: Bearer …)

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

declare const Deno: {
  env: { get: (key: string) => string | undefined }
  serve: (handler: (req: Request) => Response | Promise<Response>) => void
}

type SyncBody = {
  broker_id?: string
  include_unrealized?: boolean
}

type DhanPosition = {
  tradingSymbol?: string
  netQty?: number
  realizedProfit?: number
  unrealizedProfit?: number
  productType?: string
  positionType?: string
  multiplier?: number
}

type DhanTrade = {
  tradingSymbol?: string
  securityId?: string
  productType?: string
  transactionType?: string
  tradedQuantity?: number
  tradedPrice?: number
}

const corsHeaders: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
}

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: corsHeaders })
}

function localISODateIST(d = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d)
  const y = parts.find((p) => p.type === "year")?.value
  const m = parts.find((p) => p.type === "month")?.value
  const day = parts.find((p) => p.type === "day")?.value
  return `${y}-${m}-${day}`
}

function weekdayIST(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number)
  const utc = new Date(Date.UTC(y, m - 1, d, 6, 30))
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][utc.getUTCDay()]
}

function dhanHeaders(accessToken: string, clientId: string) {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    "access-token": accessToken,
    "client-id": clientId,
  }
}

function asArray<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[]
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>
    if (Array.isArray(obj.data)) return obj.data as T[]
    if (obj.data && typeof obj.data === "object") {
      const nested = obj.data as Record<string, unknown>
      if (Array.isArray(nested.data)) return nested.data as T[]
    }
  }
  return []
}

/** Average-cost realized P/L from today's trade book (when positions are empty/flat). */
function realizedFromTrades(trades: DhanTrade[]): {
  realized: number
  symbols: string[]
} {
  type Bucket = {
    symbol: string
    buyQty: number
    sellQty: number
    buyValue: number
    sellValue: number
  }
  const map = new Map<string, Bucket>()

  for (const t of trades) {
    const qty = Number(t.tradedQuantity) || 0
    const price = Number(t.tradedPrice) || 0
    if (qty <= 0) continue
    const key = `${t.securityId || t.tradingSymbol || "unknown"}|${t.productType || ""}`
    const bucket =
      map.get(key) ||
      ({
        symbol: t.tradingSymbol || t.securityId || key,
        buyQty: 0,
        sellQty: 0,
        buyValue: 0,
        sellValue: 0,
      } satisfies Bucket)
    const side = String(t.transactionType || "").toUpperCase()
    if (side === "BUY") {
      bucket.buyQty += qty
      bucket.buyValue += qty * price
    } else if (side === "SELL") {
      bucket.sellQty += qty
      bucket.sellValue += qty * price
    }
    map.set(key, bucket)
  }

  let realized = 0
  const symbols: string[] = []
  for (const b of map.values()) {
    if (b.buyQty <= 0 || b.sellQty <= 0) continue
    const buyAvg = b.buyValue / b.buyQty
    const sellAvg = b.sellValue / b.sellQty
    const matched = Math.min(b.buyQty, b.sellQty)
    realized += (sellAvg - buyAvg) * matched
    symbols.push(b.symbol)
  }

  return { realized: parseFloat(realized.toFixed(2)), symbols }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders })
  }
  if (req.method !== "POST") {
    return json({ error: "Method Not Allowed" }, 405)
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const anonKey =
    Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SB_PUBLISHABLE_KEY")
  if (!supabaseUrl || !anonKey) {
    return json({ error: "Supabase env not configured" }, 500)
  }

  const authHeader = req.headers.get("Authorization")
  if (!authHeader) return json({ error: "Missing Authorization" }, 401)

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser()
  if (userErr || !user) {
    return json(
      { error: "Unauthorized", details: userErr?.message || "No user" },
      401
    )
  }

  let body: SyncBody
  try {
    body = await req.json()
  } catch {
    return json({ error: "Invalid JSON body" }, 400)
  }

  const brokerId = (body.broker_id || "").trim()
  if (!brokerId) return json({ error: "broker_id is required" }, 400)
  const includeUnrealized = body.include_unrealized !== false

  const { data: broker, error: brokerErr } = await userClient
    .from("brokers")
    .select(
      "id, user_id, name, type, account_id, api_key, access_token, api_secret"
    )
    .eq("id", brokerId)
    .eq("user_id", user.id)
    .maybeSingle()

  if (brokerErr) {
    return json(
      { error: "Failed to load broker", details: brokerErr.message },
      500
    )
  }
  if (!broker) {
    return json(
      {
        error: "Broker not found for this account",
        broker_id: brokerId,
        user_id: user.id,
      },
      404
    )
  }

  const typeName = `${broker.type || ""} ${broker.name || ""}`.toLowerCase()
  if (!typeName.includes("dhan")) {
    return json(
      {
        error: "This sync endpoint only supports Dhan",
        type: broker.type,
        name: broker.name,
      },
      400
    )
  }

  // Prefer broker row; optional project secrets as fallback (Supabase function secrets)
  const accessToken = String(
    broker.access_token ||
      broker.api_secret ||
      Deno.env.get("DHAN_ACCESS_TOKEN") ||
      ""
  )
    .trim()
    .replace(/^"+|"+$/g, "")

  function clientIdFromJwt(jwt: string): string {
    try {
      const part = jwt.split(".")[1]
      if (!part) return ""
      const b64 = part.replace(/-/g, "+").replace(/_/g, "/")
      const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4))
      const payload = JSON.parse(atob(b64 + pad)) as {
        dhanClientId?: string | number
      }
      return payload.dhanClientId != null ? String(payload.dhanClientId) : ""
    } catch {
      return ""
    }
  }

  const jwtClientId = clientIdFromJwt(accessToken)
  const storedClientId = String(
    broker.account_id || broker.api_key || Deno.env.get("DHAN_CLIENT_ID") || ""
  ).trim()
  // Token embeds the real client id — always prefer it when present
  const clientId = jwtClientId || storedClientId

  if (!clientId || !accessToken) {
    return json(
      {
        error:
          "Dhan Client ID and Access Token are required. Reconnect under Brokers.",
      },
      400
    )
  }
  if (accessToken.length < 40) {
    return json(
      {
        error:
          "Dhan Access Token looks too short. Paste the full token from web.dhan.co (Profile → DhanHQ APIs).",
        token_length: accessToken.length,
      },
      400
    )
  }
  if (jwtClientId && storedClientId && jwtClientId !== storedClientId) {
    // Auto-correct stored id so next sync / UI stay consistent
    await userClient
      .from("brokers")
      .update({ account_id: jwtClientId, api_key: jwtClientId })
      .eq("id", brokerId)
  }

  const headers = dhanHeaders(accessToken, clientId)

  const dhanRes = await fetch("https://api.dhan.co/v2/positions", {
    method: "GET",
    headers,
  })

  const dhanText = await dhanRes.text()
  let dhanJson: unknown
  try {
    dhanJson = dhanText ? JSON.parse(dhanText) : []
  } catch {
    await userClient.from("broker_sync_logs").insert({
      broker_id: brokerId,
      status: "failed",
      records_imported: 0,
      error_message: `Invalid JSON from Dhan positions (${dhanRes.status})`,
    })
    return json(
      {
        error: "Dhan returned invalid JSON",
        status: dhanRes.status,
        details: dhanText.slice(0, 500),
      },
      502
    )
  }

  if (!dhanRes.ok) {
    const errObj = dhanJson as { errorMessage?: string; errorCode?: string }
    const msg = errObj?.errorMessage || `Dhan API error ${dhanRes.status}`
    await userClient.from("broker_sync_logs").insert({
      broker_id: brokerId,
      status: "failed",
      records_imported: 0,
      error_message: msg.slice(0, 500),
    })
    return json(
      {
        error: msg,
        errorCode: errObj?.errorCode,
        status: dhanRes.status,
      },
      502
    )
  }

  const positions = asArray<DhanPosition>(dhanJson)

  let realized = 0
  let unrealized = 0
  const openSymbols: string[] = []
  for (const p of positions) {
    realized += Number(p.realizedProfit) || 0
    unrealized += Number(p.unrealizedProfit) || 0
    if ((p.netQty || 0) !== 0 && p.tradingSymbol) {
      openSymbols.push(p.tradingSymbol)
    }
  }

  let source: "positions" | "trades" | "empty" = "positions"
  let tradesCount = 0
  let tradeSymbols: string[] = []

  // When flat / empty positions book, fall back to today's trade book P/L
  if (positions.length === 0 || (realized === 0 && unrealized === 0)) {
    const tradesRes = await fetch("https://api.dhan.co/v2/trades", {
      method: "GET",
      headers,
    })
    const tradesText = await tradesRes.text()
    if (tradesRes.ok) {
      let tradesJson: unknown = []
      try {
        tradesJson = tradesText ? JSON.parse(tradesText) : []
      } catch {
        tradesJson = []
      }
      const trades = asArray<DhanTrade>(tradesJson)
      tradesCount = trades.length
      if (trades.length > 0) {
        const fromTrades = realizedFromTrades(trades)
        // Prefer trade-book realized when positions are empty or also zero
        if (positions.length === 0 || Math.abs(realized) < 0.0001) {
          realized = fromTrades.realized
          source = "trades"
          tradeSymbols = fromTrades.symbols
        }
      } else if (positions.length === 0) {
        source = "empty"
      }
    } else if (positions.length === 0) {
      source = "empty"
    }
  }

  const dayPl = parseFloat(
    (includeUnrealized ? realized + unrealized : realized).toFixed(2)
  )

  const today = localISODateIST()
  const weekday = weekdayIST(today)

  const { data: profile } = await userClient
    .from("profiles")
    .select("monthly_target, max_daily_loss, starting_capital")
    .eq("id", user.id)
    .maybeSingle()

  const monthlyTarget = Number(profile?.monthly_target) || 20920
  const dailyTarget = parseFloat((monthlyTarget / 22).toFixed(2))

  const symbolHint =
    openSymbols.length > 0
      ? `open: ${openSymbols.slice(0, 8).join(", ")}${openSymbols.length > 8 ? "…" : ""}`
      : tradeSymbols.length > 0
        ? `traded: ${tradeSymbols.slice(0, 8).join(", ")}${tradeSymbols.length > 8 ? "…" : ""}`
        : source === "empty"
          ? "no positions or trades today on Dhan"
          : "no open positions"

  const noteParts = [
    source === "trades"
      ? "Synced from Dhan trade book"
      : "Synced from Dhan positions",
    `realized ${realized.toFixed(2)}`,
    includeUnrealized ? `unrealized ${unrealized.toFixed(2)}` : null,
    `${positions.length} pos / ${tradesCount} trades`,
    symbolHint,
  ].filter(Boolean)

  const { error: upsertErr } = await userClient.from("trade_entries").upsert(
    {
      user_id: user.id,
      date: today,
      weekday,
      day_type: "Trading Day",
      daily_target_inr: dailyTarget,
      actual_pl: dayPl,
      daily_loss_allowed: Number(profile?.max_daily_loss) || 1255.2,
      notes: noteParts.join(" · "),
      broker_id: brokerId,
      source: "broker_auto",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,date" }
  )

  if (upsertErr) {
    await userClient.from("broker_sync_logs").insert({
      broker_id: brokerId,
      status: "failed",
      records_imported: 0,
      error_message: upsertErr.message.slice(0, 500),
    })
    return json({ error: upsertErr.message }, 500)
  }

  await userClient
    .from("brokers")
    .update({ last_synced_at: new Date().toISOString(), is_active: true })
    .eq("id", brokerId)

  await userClient.from("broker_sync_logs").insert({
    broker_id: brokerId,
    status: "success",
    records_imported: 1,
    error_message: "",
  })

  return json({
    ok: true,
    date: today,
    actual_pl: dayPl,
    realized: parseFloat(realized.toFixed(2)),
    unrealized: parseFloat(unrealized.toFixed(2)),
    positions: positions.length,
    trades: tradesCount,
    open_positions: openSymbols.length,
    include_unrealized: includeUnrealized,
    source,
  })
})
