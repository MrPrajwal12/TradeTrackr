import { supabase } from '@/lib/supabase'

export type DhanSyncResult = {
  ok: true
  date: string
  actual_pl: number
  realized: number
  unrealized: number
  positions: number
  trades?: number
  open_positions: number
  include_unrealized: boolean
  source?: 'positions' | 'trades' | 'empty'
  token_renewed?: boolean
  token_expiry?: string | null
}

export type DhanRenewResult = {
  ok: true
  renewed: boolean
  token_expiry: string | null
  client_id: string
}

async function readFunctionError(error: unknown, data: unknown): Promise<string> {
  if (data && typeof data === 'object' && 'error' in data && (data as { error?: unknown }).error) {
    return String((data as { error: unknown }).error)
  }

  const ctx = (error as { context?: Response })?.context
  if (ctx && typeof ctx.json === 'function') {
    try {
      const body = await ctx.json()
      if (body?.error) return String(body.error)
      if (body?.message) return String(body.message)
      if (typeof body === 'string' && body.trim()) return body
    } catch {
      try {
        const text = await ctx.text()
        if (text.trim()) return text.slice(0, 300)
      } catch {
        /* ignore */
      }
    }
  }

  if (error instanceof Error && error.message) return error.message
  return 'Dhan sync failed'
}

export async function syncDhanPositions(
  brokerId: string,
  opts?: { includeUnrealized?: boolean }
): Promise<DhanSyncResult> {
  const { data, error } = await supabase.functions.invoke('dhan-sync', {
    body: {
      broker_id: brokerId,
      include_unrealized: opts?.includeUnrealized !== false,
    },
  })

  if (error) {
    throw new Error(await readFunctionError(error, data))
  }

  if (data?.error) {
    throw new Error(String(data.error))
  }

  return data as DhanSyncResult
}

/** Renew Dhan access token if close to expiry (server decides the window). */
export async function renewDhanToken(brokerId: string): Promise<DhanRenewResult> {
  const { data, error } = await supabase.functions.invoke('dhan-sync', {
    body: { broker_id: brokerId, renew_only: true },
  })

  if (error) {
    throw new Error(await readFunctionError(error, data))
  }
  if (data?.error) {
    throw new Error(String(data.error))
  }
  return data as DhanRenewResult
}
