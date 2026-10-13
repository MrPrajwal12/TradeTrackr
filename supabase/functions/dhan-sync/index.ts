// Sync today's P/L from DhanHQ positions into trade_entries.
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
  // Asia/Kolkata calendar date for the journal day
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
  // Noon UTC avoids DST edge cases; weekday label for IST calendar date
  const utc = new Date(Date.UTC(y, m - 1, d, 6, 30))
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][utc.getUTCDay()]
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders })
  }
  if (req.method !== "POST") {
    return json({ error: "Method Not Allowed" }, 405)
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!supabaseUrl || !anonKey || !serviceKey) {
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
  if (userErr || !user) return json({ error: "Unauthorized" }, 401)

  let body: SyncBody
  try {
    body = await req.json()
  } catch {
    return json({ error: "Invalid JSON body" }, 400)
  }

  const brokerId = (body.broker_id || "").trim()
  if (!brokerId) return json({ error: "broker_id is required" }, 400)
  const includeUnrealized = body.include_unrealized !== false

  const admin = createClient(supabaseUrl, serviceKey)

  const { data: broker, error: brokerErr } = await admin
    .from("brokers")
    .select("*")
    .eq("id", brokerId)
    .eq("user_id", user.id)
    .maybeSingle()

  if (brokerErr || !broker) {
    return json({ error: "Broker not found" }, 404)
  }

  const isDhan =
    String(broker.type).toLowerCase() === "dhan" ||
    String(broker.name).toLowerCase() === "dhan"
  if (!isDhan) {
    return json({ error: "This sync endpoint only supports Dhan" }, 400)
  }

  const clientId = (broker.account_id || broker.api_key || "").trim()
  const accessToken = (broker.access_token || broker.api_secret || "").trim()
  if (!clientId || !accessToken) {
    return json(
      {
        error:
          "Dhan Client ID and Access Token are required. Update the broker connection.",
      },
      400
    )
  }

  const dhanRes = await fetch("https://api.dhan.co/v2/positions", {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "access-token": accessToken,
      "client-id": clientId,
    },
  })

  const dhanText = await dhanRes.text()
  let dhanJson: unknown
  try {
    dhanJson = dhanText ? JSON.parse(dhanText) : []
  } catch {
    await admin.from("broker_sync_logs").insert({
      broker_id: brokerId,
      status: "failed",
      records_imported: 0,
      error_message: `Invalid JSON from Dhan (${dhanRes.status})`,
    })
    return json(
      { error: "Dhan returned invalid JSON", status: dhanRes.status, details: dhanText.slice(0, 500) },
      502
    )
  }

  if (!dhanRes.ok) {
    const errObj = dhanJson as { errorMessage?: string; errorCode?: string }
    const msg =
      errObj?.errorMessage ||
      `Dhan API error ${dhanRes.status}`
    await admin.from("broker_sync_logs").insert({
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

  const positions: DhanPosition[] = Array.isArray(dhanJson)
    ? (dhanJson as DhanPosition[])
    : Array.isArray((dhanJson as { data?: DhanPosition[] })?.data)
      ? ((dhanJson as { data: DhanPosition[] }).data)
      : []

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

  const dayPl = parseFloat(
    (includeUnrealized ? realized + unrealized : realized).toFixed(2)
  )

  const today = localISODateIST()
  const weekday = weekdayIST(today)

  const { data: profile } = await admin
    .from("profiles")
    .select("monthly_target, max_daily_loss, starting_capital")
    .eq("id", user.id)
    .maybeSingle()

  const monthlyTarget = Number(profile?.monthly_target) || 20920
  // Approximate daily target; Trading page regenerates exact targets on load
  const dailyTarget = parseFloat((monthlyTarget / 22).toFixed(2))

  const noteParts = [
    "Synced from Dhan positions",
    `realized ${realized.toFixed(2)}`,
    includeUnrealized ? `unrealized ${unrealized.toFixed(2)}` : null,
    openSymbols.length ? `open: ${openSymbols.slice(0, 8).join(", ")}${openSymbols.length > 8 ? "…" : ""}` : "no open positions",
  ].filter(Boolean)

  const { error: upsertErr } = await admin.from("trade_entries").upsert(
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
    await admin.from("broker_sync_logs").insert({
      broker_id: brokerId,
      status: "failed",
      records_imported: 0,
      error_message: upsertErr.message.slice(0, 500),
    })
    return json({ error: upsertErr.message }, 500)
  }

  await admin
    .from("brokers")
    .update({ last_synced_at: new Date().toISOString(), is_active: true })
    .eq("id", brokerId)

  await admin.from("broker_sync_logs").insert({
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
    open_positions: openSymbols.length,
    include_unrealized: includeUnrealized,
  })
})
