import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase env vars. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY and restart the dev server.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Profile = {
  id: string
  full_name: string
  avatar_url: string
  currency: string
  starting_capital: number
  monthly_target: number
  max_daily_loss: number
  onboarding_completed: boolean
  created_at: string
}

export type TradeEntry = {
  id: string
  user_id: string
  date: string
  weekday: string
  day_type: 'Trading Day' | 'Holiday' | 'Weekend'
  daily_target_inr: number
  actual_pl: number | null
  cumulative_pl: number
  running_capital: number
  daily_loss_allowed: number
  notes: string
  broker_id: string | null
  source: 'manual' | 'broker_auto'
  created_at: string
  updated_at: string
}

export type Expense = {
  id: string
  user_id: string
  date: string
  type: 'income' | 'expense'
  category: string
  amount: number
  description: string
  tags: string[]
  source: 'manual' | 'broker_auto'
  is_deleted: boolean
  created_at: string
}

export type Broker = {
  id: string
  user_id: string
  name: string
  type: string
  connection_method: 'api' | 'csv_import' | 'manual'
  account_id: string
  is_active: boolean
  last_synced_at: string | null
  created_at: string
}

export type MonthlySummary = {
  id: string
  user_id: string
  year_month: string
  trading_days: number
  monthly_target_inr: number
  daily_target_inr: number
  monthly_earned: number
  total_profit: number
  total_loss: number
  win_rate: number
  max_drawdown: number
  best_day: number
  worst_day: number
}
