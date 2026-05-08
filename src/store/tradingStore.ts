import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type { TradeEntry } from '@/lib/supabase'

type TradingState = {
  entries: TradeEntry[]
  selectedMonth: string
  loading: boolean
  setEntries: (entries: TradeEntry[]) => void
  setSelectedMonth: (month: string) => void
  setLoading: (loading: boolean) => void
  fetchEntries: (userId: string, yearMonth: string) => Promise<void>
  updateEntry: (id: string, updates: Partial<TradeEntry>) => Promise<void>
}

export const useTradingStore = create<TradingState>((set) => ({
  entries: [],
  selectedMonth: new Date().toISOString().slice(0, 7),
  loading: false,
  setEntries: (entries) => set({ entries }),
  setSelectedMonth: (month) => set({ selectedMonth: month }),
  setLoading: (loading) => set({ loading }),
  fetchEntries: async (userId, yearMonth) => {
    set({ loading: true })
    const startDate = `${yearMonth}-01`
    const endDate = new Date(parseInt(yearMonth.slice(0, 4)), parseInt(yearMonth.slice(5, 7)), 0)
      .toISOString()
      .slice(0, 10)
    const { data } = await supabase
      .from('trade_entries')
      .select('*')
      .eq('user_id', userId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true })
    set({ entries: data || [], loading: false })
  },
  updateEntry: async (id, updates) => {
    await supabase.from('trade_entries').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id)
    set((state) => ({
      entries: state.entries.map((e) => (e.id === id ? { ...e, ...updates } : e)),
    }))
  },
}))
