import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Zap, TrendingUp, Target, Shield, Check, ChevronRight, Link2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { generateMonthDays, APR_2026_SEED } from '@/lib/trading-utils'

const MONTHS_TO_SEED = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']

export function OnboardingPage() {
  const navigate = useNavigate()
  const { user, fetchProfile } = useAuthStore()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)

  const [settings, setSettings] = useState({
    full_name: '',
    starting_capital: 4184,
    monthly_target: 20920,
    max_daily_loss: 1255.2,
    currency: 'INR',
  })

  const seedTradeData = async (userId: string, startingCapital: number) => {
    const entries: Record<string, unknown>[] = []

    for (const yearMonth of MONTHS_TO_SEED) {
      const days = generateMonthDays(yearMonth)
      for (const day of days) {
        const seedEntry = APR_2026_SEED.find(s => s.date === day.date)
        entries.push({
          user_id: userId,
          date: day.date,
          weekday: day.weekday,
          day_type: day.day_type,
          daily_target_inr: day.daily_target_inr,
          actual_pl: seedEntry?.actual_pl ?? null,
          cumulative_pl: 0,
          running_capital: startingCapital,
          daily_loss_allowed: settings.max_daily_loss,
          notes: '',
          source: seedEntry ? 'manual' : 'manual',
        })
      }
    }

    // Compute cumulative for Apr
    let cumulative = 0
    for (const entry of entries) {
      if ((entry.actual_pl as number | null) != null && entry.day_type === 'Trading Day') {
        cumulative += entry.actual_pl as number
      }
      entry.cumulative_pl = parseFloat(cumulative.toFixed(2))
      entry.running_capital = parseFloat((startingCapital + cumulative).toFixed(2))
    }

    // Insert in batches of 100
    for (let i = 0; i < entries.length; i += 100) {
      await supabase.from('trade_entries').upsert(entries.slice(i, i + 100), { onConflict: 'user_id,date' })
    }
  }

  const handleComplete = async () => {
    if (!user) return
    setLoading(true)

    try {
      // Update profile
      await supabase.from('profiles').update({
        full_name: settings.full_name,
        starting_capital: settings.starting_capital,
        monthly_target: settings.monthly_target,
        max_daily_loss: settings.max_daily_loss,
        currency: settings.currency,
        onboarding_completed: true,
      }).eq('id', user.id)

      // Seed trade data
      await seedTradeData(user.id, settings.starting_capital)

      // Seed default categories
      const defaultCategories = [
        { name: 'Food', type: 'expense', color: '#f97316', icon: '🍔', is_default: true },
        { name: 'Transport', type: 'expense', color: '#3b82f6', icon: '🚗', is_default: true },
        { name: 'Housing', type: 'expense', color: '#8b5cf6', icon: '🏠', is_default: true },
        { name: 'Utilities', type: 'expense', color: '#06b6d4', icon: '⚡', is_default: true },
        { name: 'Healthcare', type: 'expense', color: '#ef4444', icon: '🏥', is_default: true },
        { name: 'Entertainment', type: 'expense', color: '#ec4899', icon: '🎭', is_default: true },
        { name: 'Trading P/L', type: 'trading', color: '#22c55e', icon: '📈', is_default: true },
        { name: 'Brokerage Fees', type: 'expense', color: '#f59e0b', icon: '💸', is_default: true },
        { name: 'Salary', type: 'income', color: '#10b981', icon: '💰', is_default: true },
        { name: 'Trading Profit', type: 'income', color: '#22c55e', icon: '📊', is_default: true },
        { name: 'Other', type: 'expense', color: '#6b7280', icon: '📦', is_default: true },
      ]
      await supabase.from('categories').insert(
        defaultCategories.map(c => ({ ...c, user_id: user.id }))
      )

      await fetchProfile(user.id)
      toast.success('Setup complete! Welcome to TradeTrackr 🚀')
      navigate('/dashboard')
    } catch (err) {
      toast.error('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-svh bg-background flex items-center justify-center p-4">
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary">
            <Zap className="size-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-bold">TradeTrackr</h1>
            <p className="text-xs text-muted-foreground">Setup your account</p>
          </div>
        </div>

        {/* Progress */}
        <div className="mb-8">
          <div className="flex justify-between text-xs text-muted-foreground mb-2">
            <span>Step {step} of 3</span>
            <span>{Math.round((step / 3) * 100)}% complete</span>
          </div>
          <Progress value={(step / 3) * 100} className="h-1.5" />
          <div className="flex justify-between mt-3">
            {['Capital Settings', 'Currency', 'Connect Broker'].map((label, i) => (
              <div key={label} className="flex items-center gap-1.5">
                <div className={`flex size-5 items-center justify-center rounded-full text-xs font-medium ${
                  i + 1 < step ? 'bg-green-500 text-white' :
                  i + 1 === step ? 'bg-primary text-primary-foreground' :
                  'bg-muted text-muted-foreground'
                }`}>
                  {i + 1 < step ? <Check className="size-3" /> : i + 1}
                </div>
                <span className={`text-xs hidden sm:block ${i + 1 === step ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Step 1: Capital Settings */}
        {step === 1 && (
          <Card>
            <CardContent className="pt-6 space-y-6">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="size-5 text-primary" />
                  <h2 className="text-xl font-semibold">Capital Settings</h2>
                </div>
                <p className="text-sm text-muted-foreground">Configure your trading parameters from your Excel plan</p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Your Name</Label>
                  <Input
                    placeholder="Enter your full name"
                    value={settings.full_name}
                    onChange={e => setSettings(s => ({ ...s, full_name: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Starting Capital (₹)</Label>
                  <Input
                    type="number"
                    value={settings.starting_capital}
                    onChange={e => setSettings(s => ({ ...s, starting_capital: parseFloat(e.target.value) || 0 }))}
                  />
                  <p className="text-xs text-muted-foreground">Your initial trading capital</p>
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2"><Target className="size-4" /> Monthly Target (₹)</Label>
                  <Input
                    type="number"
                    value={settings.monthly_target}
                    onChange={e => setSettings(s => ({ ...s, monthly_target: parseFloat(e.target.value) || 0 }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2"><Shield className="size-4 text-destructive" /> Max Daily Loss (₹)</Label>
                  <Input
                    type="number"
                    value={settings.max_daily_loss}
                    onChange={e => setSettings(s => ({ ...s, max_daily_loss: parseFloat(e.target.value) || 0 }))}
                  />
                  <p className="text-xs text-muted-foreground">Stop trading if daily loss exceeds this amount</p>
                </div>
              </div>

              <Button className="w-full" onClick={() => setStep(2)}>
                Continue <ChevronRight className="ml-2 size-4" />
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Currency */}
        {step === 2 && (
          <Card>
            <CardContent className="pt-6 space-y-6">
              <div>
                <h2 className="text-xl font-semibold mb-1">Currency Preference</h2>
                <p className="text-sm text-muted-foreground">Choose your primary currency for display</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {['INR', 'USD', 'EUR', 'GBP'].map(c => (
                  <button
                    key={c}
                    onClick={() => setSettings(s => ({ ...s, currency: c }))}
                    className={`p-4 rounded-lg border-2 text-center transition-all ${
                      settings.currency === c
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-border/80'
                    }`}
                  >
                    <div className="text-2xl mb-1">
                      {c === 'INR' ? '₹' : c === 'USD' ? '$' : c === 'EUR' ? '€' : '£'}
                    </div>
                    <div className="text-sm font-medium">{c}</div>
                    {c === 'INR' && <div className="text-xs text-muted-foreground mt-0.5">Recommended</div>}
                  </button>
                ))}
              </div>

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>Back</Button>
                <Button className="flex-1" onClick={() => setStep(3)}>
                  Continue <ChevronRight className="ml-2 size-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Broker */}
        {step === 3 && (
          <Card>
            <CardContent className="pt-6 space-y-6">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Link2 className="size-5 text-primary" />
                  <h2 className="text-xl font-semibold">Connect Broker</h2>
                </div>
                <p className="text-sm text-muted-foreground">Connect your broker for auto-sync or skip to enter manually</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {['Zerodha', 'Upstox', 'Groww', 'Angel One', 'Fyers', 'Other'].map(broker => (
                  <button
                    key={broker}
                    className="p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-muted/50 text-sm font-medium transition-all text-left flex items-center gap-2"
                    onClick={() => {
                      toast.info(`Broker connect coming soon! For now, entries will be added manually.`)
                    }}
                  >
                    <Link2 className="size-4 text-muted-foreground" />
                    {broker}
                  </button>
                ))}
              </div>

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setStep(2)}>Back</Button>
                <Button className="flex-1" onClick={handleComplete} disabled={loading}>
                  {loading ? 'Setting up...' : 'Complete Setup'}
                  {!loading && <Check className="ml-2 size-4" />}
                </Button>
              </div>

              <button
                className="w-full text-sm text-muted-foreground hover:text-foreground text-center underline-offset-2 hover:underline"
                onClick={handleComplete}
                disabled={loading}
              >
                Skip for now, I'll add manually
              </button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
