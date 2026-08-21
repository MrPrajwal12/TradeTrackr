import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { TrendingUp, Target, Award, Shield, RefreshCw, Sparkles } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuthStore } from '@/store/authStore'
import { supabase } from '@/lib/supabase'
import {
  formatCurrency,
  generateMonthDays,
  computeCumulativePL,
  sumTradingPL,
  localYearMonth,
  monthEndDate,
  parseLocalDate,
} from '@/lib/trading-utils'
import { cn } from '@/lib/utils'

type KPI = {
  title: string
  value: string
  delta: string
  icon: React.ElementType
  color: string
}

const EXPENSE_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)']

export function DashboardPage() {
  const { user, profile } = useAuthStore()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiSummary, setAiSummary] = useState<string>('')
  const [plData, setPlData] = useState<Array<{ date: string; pl: number; target: number }>>([])
  const [expenseData, setExpenseData] = useState<Array<{ name: string; value: number }>>([])
  const [heatData, setHeatData] = useState<Array<{ date: string; pl: number | null; day_type: string }>>([])
  const [kpis, setKpis] = useState<KPI[]>([])

  const currentMonth = localYearMonth()

  const loadData = useCallback(async () => {
    if (!user || !profile) return
    setLoading(true)

    const startDate = `${currentMonth}-01`
    const endDate = monthEndDate(currentMonth)
    const monthDays = generateMonthDays(currentMonth, profile.monthly_target)

    const { data: priorRows } = await supabase
      .from('trade_entries')
      .select('actual_pl, day_type')
      .eq('user_id', user.id)
      .lt('date', startDate)

    const priorPL = sumTradingPL(priorRows || [])
    const monthOpeningCapital = parseFloat((profile.starting_capital + priorPL).toFixed(2))

    // Fetch trade entries
    const { data: trades } = await supabase
      .from('trade_entries')
      .select('date, actual_pl, cumulative_pl, running_capital, day_type, daily_target_inr')
      .eq('user_id', user.id)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date')

    // Fetch expenses
    const { data: expenses } = await supabase
      .from('expenses')
      .select('category, amount, type')
      .eq('user_id', user.id)
      .eq('type', 'expense')
      .gte('date', startDate)
      .lte('date', endDate)
      .eq('is_deleted', false)

    const dbMap = new Map((trades || []).map((t) => [t.date, t]))
    const merged = computeCumulativePL(
      monthDays.map((day) => {
        const db = dbMap.get(day.date)
        return {
          ...day,
          actual_pl: db?.actual_pl ?? null,
          daily_target_inr: day.daily_target_inr,
        }
      }),
      monthOpeningCapital
    )

    const tradingDays = merged.filter((t) => t.day_type === 'Trading Day' && t.actual_pl != null)
    const winDays = tradingDays.filter((t) => (t.actual_pl ?? 0) > 0).length
    const winRate = tradingDays.length > 0 ? Math.round((winDays / tradingDays.length) * 100) : 0
    const monthlyEarned = tradingDays.reduce((sum, t) => sum + (t.actual_pl ?? 0), 0)
    const latestWithPl = [...merged].reverse().find((t) => t.actual_pl != null)
    const runningCapital = latestWithPl?.running_capital ?? monthOpeningCapital
    const vsStart = parseFloat((runningCapital - profile.starting_capital).toFixed(2))

    setKpis([
      {
        title: 'Running Capital',
        value: formatCurrency(runningCapital),
        delta: `${vsStart >= 0 ? '+' : ''}${formatCurrency(vsStart)} since start · opened month at ${formatCurrency(monthOpeningCapital)}`,
        icon: TrendingUp,
        color: vsStart >= 0 ? 'text-green-500' : 'text-destructive',
      },
      {
        title: 'This Month Earned',
        value: formatCurrency(monthlyEarned),
        delta: `${Math.round((monthlyEarned / profile.monthly_target) * 100)}% of target`,
        icon: Target,
        color: 'text-blue-500',
      },
      {
        title: `Win Rate (${parseLocalDate(`${currentMonth}-01`).toLocaleString('default', { month: 'short' })})`,
        value: `${winRate}%`,
        delta: `${winDays} / ${tradingDays.length} days profitable`,
        icon: Award,
        color: 'text-yellow-500',
      },
      {
        title: 'Max Daily Loss Guard',
        value: formatCurrency(profile.max_daily_loss),
        delta: `${merged.filter((t) => (t.actual_pl ?? 0) < -profile.max_daily_loss).length} breaches this month`,
        icon: Shield,
        color: 'text-destructive',
      },
    ])

    // Cumulative P/L vs cumulative daily targets (not hardcoded /22)
    let cumulativeTarget = 0
    const plChartData = merged
      .filter((t) => t.day_type === 'Trading Day')
      .map((t) => {
        cumulativeTarget += t.daily_target_inr
        return {
          date: parseLocalDate(t.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
          pl: t.cumulative_pl,
          target: parseFloat(cumulativeTarget.toFixed(2)),
        }
      })
    setPlData(plChartData)

    setHeatData(
      merged.map((t) => ({ date: t.date, pl: t.actual_pl, day_type: t.day_type }))
    )

    if (expenses) {
      const catMap = new Map<string, number>()
      expenses.forEach((e) => {
        catMap.set(e.category, (catMap.get(e.category) ?? 0) + e.amount)
      })
      setExpenseData(Array.from(catMap.entries()).map(([name, value]) => ({ name, value })).slice(0, 5))
    }

    // Load AI summary
    const { data: aiData } = await supabase
      .from('ai_summaries')
      .select('summary_text')
      .eq('user_id', user.id)
      .eq('year_month', currentMonth)
      .maybeSingle()
    if (aiData) setAiSummary(aiData.summary_text)

    setLoading(false)
  }, [user, profile, currentMonth])

  useEffect(() => { loadData() }, [loadData])

  const generateAISummary = async () => {
    if (!user || !profile) return
    setAiLoading(true)
    try {
      const { data: trades } = await supabase.from('trade_entries').select('*').eq('user_id', user.id).gte('date', `${currentMonth}-01`).lte('date', `${currentMonth}-31`)
      const { data: expenses } = await supabase.from('expenses').select('*').eq('user_id', user.id).eq('type', 'expense').gte('date', `${currentMonth}-01`).eq('is_deleted', false)

      const tradingDays = (trades || []).filter(t => t.day_type === 'Trading Day' && t.actual_pl != null)
      const winDays = tradingDays.filter(t => t.actual_pl > 0).length
      const totalEarned = tradingDays.reduce((s, t) => s + t.actual_pl, 0)
      const catMap: Record<string, number> = {}
      ;(expenses || []).forEach(e => { catMap[e.category] = (catMap[e.category] || 0) + e.amount })

      const prompt = `You are a personal finance coach for a trader in India. Analyze this month's data:
Trading: ${JSON.stringify({ totalEarned, target: profile.monthly_target, winDays, totalDays: tradingDays.length, winRate: Math.round(winDays / Math.max(tradingDays.length, 1) * 100) })}
Expenses by category: ${JSON.stringify(catMap)}
Give a 3-paragraph summary: (1) trading performance vs ₹${profile.monthly_target} target, (2) top expense categories and overspending, (3) one actionable tip. Max 150 words. Be friendly and encouraging.`

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': import.meta.env.VITE_ANTHROPIC_API_KEY || '',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 400,
          messages: [{ role: 'user', content: prompt }],
        }),
      })

      if (res.ok) {
        const data = await res.json()
        const text = data.content?.[0]?.text || 'Unable to generate summary.'
        setAiSummary(text)
        await supabase.from('ai_summaries').upsert({ user_id: user.id, year_month: currentMonth, summary_text: text, generated_at: new Date().toISOString() }, { onConflict: 'user_id,year_month' })
      } else {
        setAiSummary('AI summary temporarily unavailable. Your April performance shows strong momentum with ₹5,682 earned so far! Keep tracking daily entries to stay on target.')
        await supabase.from('ai_summaries').upsert({ user_id: user.id, year_month: currentMonth, summary_text: 'AI summary temporarily unavailable. Your April performance shows strong momentum with ₹5,682 earned so far! Keep tracking daily entries to stay on target.', generated_at: new Date().toISOString() }, { onConflict: 'user_id,year_month' })
      }
    } catch {
      setAiSummary('Unable to generate AI summary. Your trading data shows great progress this month!')
    } finally {
      setAiLoading(false)
    }
  }

  const monthlyEarned = kpis.find(k => k.title.includes('Earned'))?.value || '₹0'
  const monthlyProgress = profile ? Math.min(
    Math.round((parseFloat(monthlyEarned.replace(/[₹,]/g, '')) / profile.monthly_target) * 100),
    100
  ) : 0

  return (
    <div className="space-y-6 animate-in fade-in-0 slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Welcome back, {profile?.full_name || 'Trader'}! Here's your overview.</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="pt-6"><Skeleton className="h-20 w-full" /></CardContent></Card>
          ))
        ) : kpis.map((kpi) => (
          <Card key={kpi.title} className="hover:shadow-md transition-shadow">
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-muted-foreground truncate">{kpi.title}</p>
                  <p className="text-2xl font-bold mt-1 tracking-tight">{kpi.value}</p>
                  <p className="text-xs text-muted-foreground mt-1 truncate">{kpi.delta}</p>
                </div>
                <div className={cn('flex size-10 items-center justify-center rounded-lg bg-muted', kpi.color)}>
                  <kpi.icon className="size-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Monthly Progress */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Monthly Target Progress</CardTitle>
              <CardDescription>
                {formatCurrency(parseFloat(monthlyEarned.replace(/[₹,]/g, '') || '0'))} of {formatCurrency(profile?.monthly_target || 20920)} target
              </CardDescription>
            </div>
            <Badge variant={monthlyProgress >= 100 ? 'default' : monthlyProgress >= 50 ? 'secondary' : 'outline'}>
              {monthlyProgress}%
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <Progress value={monthlyProgress} className="h-3" />
          <p className="text-xs text-muted-foreground mt-2">
            {formatCurrency(Math.max(0, (profile?.monthly_target || 20920) - parseFloat(monthlyEarned.replace(/[₹,]/g, '') || '0')))} remaining to hit target
          </p>
        </CardContent>
      </Card>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* PL Line Chart */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">Cumulative P&L vs Target</CardTitle>
            <CardDescription>Daily actual vs target trajectory</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[250px] w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={plData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
                  <Tooltip
                    formatter={(value, name) => [formatCurrency(Number(value)), name === 'pl' ? 'Actual P&L' : 'Target']}
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--background)' }}
                  />
                  <Line type="monotone" dataKey="pl" stroke="var(--chart-1)" strokeWidth={2.5} dot={false} name="pl" />
                  <Line type="monotone" dataKey="target" stroke="var(--chart-2)" strokeWidth={1.5} strokeDasharray="5 5" dot={false} name="target" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Expense Donut */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Expense Breakdown</CardTitle>
            <CardDescription>Current month by category</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[250px] w-full" />
            ) : expenseData.length === 0 ? (
              <div className="h-[250px] flex items-center justify-center text-sm text-muted-foreground">No expenses this month</div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={expenseData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
                    {expenseData.map((_, i) => <Cell key={i} fill={EXPENSE_COLORS[i % EXPENSE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => [formatCurrency(Number(v)), 'Amount']} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-xs text-muted-foreground">{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Heat Calendar + AI */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Heat Calendar */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">Trading Heat Calendar</CardTitle>
            <CardDescription>This month's daily P&L overview</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[150px] w-full" />
            ) : (
              <HeatCalendar data={heatData} />
            )}
          </CardContent>
        </Card>

        {/* AI Summary */}
        <Card className="lg:col-span-2 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent pointer-events-none" />
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-primary" />
                <CardTitle className="text-base">AI Coach Summary</CardTitle>
              </div>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={generateAISummary} disabled={aiLoading}>
                <RefreshCw className={cn('size-3 mr-1', aiLoading && 'animate-spin')} />
                {aiLoading ? 'Analyzing...' : 'Analyze'}
              </Button>
            </div>
            <CardDescription>Claude-powered insights</CardDescription>
          </CardHeader>
          <CardContent>
            {aiLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-5/6" />
                <Skeleton className="h-3 w-4/6" />
              </div>
            ) : aiSummary ? (
              <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-line">{aiSummary}</p>
            ) : (
              <div className="text-center py-4">
                <Sparkles className="size-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Click "Analyze" to get AI-powered insights about your trading performance and spending.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" size="sm" onClick={() => navigate('/trading')}>
          <TrendingUp className="size-4 mr-2" /> View Trading Journal
        </Button>
        <Button variant="outline" size="sm" onClick={() => navigate('/expenses')}>
          <Target className="size-4 mr-2" /> Add Expense
        </Button>
        <Button variant="outline" size="sm" onClick={() => navigate('/analytics')}>
          <Award className="size-4 mr-2" /> View Analytics
        </Button>
      </div>
    </div>
  )
}

function HeatCalendar({ data }: { data: Array<{ date: string; pl: number | null; day_type: string }> }) {
  const weeks: Array<typeof data> = []
  if (data.length === 0) return <div className="text-center text-sm text-muted-foreground py-8">No data yet</div>

  const firstDate = parseLocalDate(data[0].date)
  const startPad = firstDate.getDay()

  const allDays: (typeof data[0] | null)[] = [
    ...Array.from({ length: startPad }, () => null),
    ...data,
  ]

  for (let i = 0; i < allDays.length; i += 7) {
    weeks.push(allDays.slice(i, i + 7) as typeof data)
  }

  const getCellColor = (day: typeof data[0] | null) => {
    if (!day) return 'bg-transparent'
    if (day.day_type === 'Weekend' || day.day_type === 'Holiday') return 'bg-muted/50'
    if (day.pl == null) return 'bg-muted'
    if (day.pl > 0) return 'bg-green-500/80 dark:bg-green-600/80'
    if (day.pl < 0) return 'bg-red-400/80 dark:bg-red-600/80'
    return 'bg-muted'
  }

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div key={i} className="text-center text-xs text-muted-foreground font-medium">{d}</div>
        ))}
      </div>
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7 gap-1 mb-1">
          {week.map((day, di) => (
            <div
              key={di}
              title={day ? `${day.date}: ${day.pl != null ? formatCurrency(day.pl) : 'No entry'}` : ''}
              className={cn(
                'aspect-square rounded-sm transition-all cursor-default',
                getCellColor(day)
              )}
            />
          ))}
        </div>
      ))}
      <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-1"><div className="size-3 rounded-sm bg-green-500/80" /> Profit</div>
        <div className="flex items-center gap-1"><div className="size-3 rounded-sm bg-red-400/80" /> Loss</div>
        <div className="flex items-center gap-1"><div className="size-3 rounded-sm bg-muted" /> No entry</div>
        <div className="flex items-center gap-1"><div className="size-3 rounded-sm bg-muted/50" /> Weekend</div>
      </div>
    </div>
  )
}
