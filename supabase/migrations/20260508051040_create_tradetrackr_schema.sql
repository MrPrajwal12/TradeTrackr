/*
  # TradeTrackr Full Schema

  ## Tables Created
  1. `profiles` - User profile with capital settings
  2. `brokers` - Broker account connections
  3. `trade_entries` - Daily trading P&L entries
  4. `expenses` - Personal finance income/expense entries
  5. `categories` - User-managed categories
  6. `broker_sync_logs` - Broker sync history
  7. `monthly_summaries` - Pre-aggregated monthly stats
  8. `ai_summaries` - Cached AI-generated summaries

  ## Security
  - RLS enabled on all tables
  - All policies check auth.uid() ownership
*/

-- =====================
-- PROFILES
-- =====================
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text DEFAULT '',
  avatar_url text DEFAULT '',
  currency text DEFAULT 'INR',
  starting_capital numeric DEFAULT 4184,
  monthly_target numeric DEFAULT 20920,
  max_daily_loss numeric DEFAULT 1255.2,
  onboarding_completed boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- =====================
-- BROKERS
-- =====================
CREATE TABLE IF NOT EXISTS brokers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text DEFAULT 'manual' CHECK (type IN ('zerodha','upstox','groww','angel','fyers','iifl','sharekhan','5paisa','manual','other')),
  connection_method text DEFAULT 'manual' CHECK (connection_method IN ('api','csv_import','manual')),
  api_key text DEFAULT '',
  api_secret text DEFAULT '',
  access_token text DEFAULT '',
  token_expiry timestamptz,
  account_id text DEFAULT '',
  is_active boolean DEFAULT true,
  last_synced_at timestamptz,
  auto_detect boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE brokers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own brokers"
  ON brokers FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own brokers"
  ON brokers FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own brokers"
  ON brokers FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own brokers"
  ON brokers FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- =====================
-- TRADE ENTRIES
-- =====================
CREATE TABLE IF NOT EXISTS trade_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date date NOT NULL,
  weekday text DEFAULT '',
  day_type text DEFAULT 'Trading Day' CHECK (day_type IN ('Trading Day','Holiday','Weekend')),
  daily_target_inr numeric DEFAULT 0,
  actual_pl numeric,
  cumulative_pl numeric DEFAULT 0,
  running_capital numeric DEFAULT 0,
  daily_loss_allowed numeric DEFAULT 0,
  notes text DEFAULT '',
  broker_id uuid REFERENCES brokers(id) ON DELETE SET NULL,
  source text DEFAULT 'manual' CHECK (source IN ('manual','broker_auto')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, date)
);

CREATE INDEX IF NOT EXISTS trade_entries_user_date ON trade_entries(user_id, date);

ALTER TABLE trade_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own trade entries"
  ON trade_entries FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own trade entries"
  ON trade_entries FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own trade entries"
  ON trade_entries FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own trade entries"
  ON trade_entries FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- =====================
-- CATEGORIES
-- =====================
CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text DEFAULT 'expense' CHECK (type IN ('income','expense','trading')),
  color text DEFAULT '#6366f1',
  icon text DEFAULT '📦',
  is_default boolean DEFAULT false
);

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own categories"
  ON categories FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own categories"
  ON categories FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own categories"
  ON categories FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own categories"
  ON categories FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- =====================
-- EXPENSES
-- =====================
CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date date NOT NULL,
  type text DEFAULT 'expense' CHECK (type IN ('income','expense')),
  category text DEFAULT 'Other',
  amount numeric NOT NULL DEFAULT 0,
  description text DEFAULT '',
  tags text[] DEFAULT '{}',
  broker_id uuid REFERENCES brokers(id) ON DELETE SET NULL,
  source text DEFAULT 'manual' CHECK (source IN ('manual','broker_auto')),
  is_deleted boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS expenses_user_date ON expenses(user_id, date);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own expenses"
  ON expenses FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own expenses"
  ON expenses FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own expenses"
  ON expenses FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own expenses"
  ON expenses FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- =====================
-- BROKER SYNC LOGS
-- =====================
CREATE TABLE IF NOT EXISTS broker_sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_id uuid NOT NULL REFERENCES brokers(id) ON DELETE CASCADE,
  synced_at timestamptz DEFAULT now(),
  status text DEFAULT 'success' CHECK (status IN ('success','failed','partial')),
  records_imported int DEFAULT 0,
  error_message text DEFAULT ''
);

ALTER TABLE broker_sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own sync logs"
  ON broker_sync_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM brokers WHERE brokers.id = broker_sync_logs.broker_id AND brokers.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own sync logs"
  ON broker_sync_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM brokers WHERE brokers.id = broker_sync_logs.broker_id AND brokers.user_id = auth.uid()
    )
  );

-- =====================
-- MONTHLY SUMMARIES
-- =====================
CREATE TABLE IF NOT EXISTS monthly_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  year_month text NOT NULL,
  trading_days int DEFAULT 0,
  monthly_target_inr numeric DEFAULT 20920,
  daily_target_inr numeric DEFAULT 0,
  monthly_earned numeric DEFAULT 0,
  total_profit numeric DEFAULT 0,
  total_loss numeric DEFAULT 0,
  win_rate numeric DEFAULT 0,
  max_drawdown numeric DEFAULT 0,
  best_day numeric DEFAULT 0,
  worst_day numeric DEFAULT 0,
  UNIQUE(user_id, year_month)
);

ALTER TABLE monthly_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own monthly summaries"
  ON monthly_summaries FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own monthly summaries"
  ON monthly_summaries FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own monthly summaries"
  ON monthly_summaries FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- =====================
-- AI SUMMARIES
-- =====================
CREATE TABLE IF NOT EXISTS ai_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  year_month text NOT NULL,
  summary_text text NOT NULL,
  generated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, year_month)
);

ALTER TABLE ai_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own ai summaries"
  ON ai_summaries FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own ai summaries"
  ON ai_summaries FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own ai summaries"
  ON ai_summaries FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
