import { supabase } from '@/lib/supabase'

export type DhanSyncResult = {
  ok: true
  date: string
  actual_pl: number
  realized: number
  unrealized: number
  positions: number
  open_positions: number
  include_unrealized: boolean
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
    throw new Error(error.message || 'Dhan sync failed')
  }

  if (data?.error) {
    throw new Error(String(data.error))
  }

  return data as DhanSyncResult
}
