import { useEffect, useState, useCallback } from 'react'
import {
  BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { useAuthStore } from '@/store/authStore'
import { supabase } from '@/lib/supabase'
import { formatCurrency, computeCumulativePL, parseLocalDate } from '@/lib/trading-utils'

const COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)']

export function AnalyticsPage() {
  const { user, profile } = useAuthStore()
  const [loading, setLoading] = useState(true)
  const [monthlyData, setMonthlyData] = useState<Array<{ month: string; earned: number; target: number; profit: number; loss: number }>>([])
  const [runningCapital, setRunningCapital] = useState<Array<{ date: string; capital: number }>>([])
  const [expenseCategories, setExpenseCategories] = useState<Array<{ name: string; value: number }>>([])
  const [incomeVsExpense, setIncomeVsExpense] = useState<Array<{ month: string; income: number; expense: number }>>([])

  const loadData = useCallback(async () => {
    if (!user || !profile) return
    setLoading(true)

    // All trade entries
    const { data: trades } = await supabase
      .from('trade_entries')
      .select('date, actual_pl, cumulative_pl, running_capital, day_type')
      .eq('user_id', user.id)
      .order('date')

    // All expenses
    const { data: expenses } = await supabase
      .from('expenses')
      .select('date, type, category, amount')
      .eq('user_id', user.id)
      .eq('is_deleted', false)
      .order('date')

    if (trades) {
      // Monthly aggregation
      const monthMap = new Map<string, { earned: number; profit: number; loss: number }>()
      trades.forEach((t) => {
        if (t.actual_pl == null || t.day_type !== 'Trading Day') return
        const ym = t.date.slice(0, 7)
        const cur = monthMap.get(ym) || { earned: 0, profit: 0, loss: 0 }
        cur.earned += t.actual_pl
        if (t.actual_pl > 0) cur.profit += t.actual_pl
        else cur.loss += t.actual_pl
        monthMap.set(ym, cur)
      })

      const months = Array.from(monthMap.entries()).map(([ym, v]) => ({
        month: parseLocalDate(`${ym}-01`).toLocaleString('default', {
          month: 'short',
          year: '2-digit',
        }),
        earned: parseFloat(v.earned.toFixed(2)),
        target: profile.monthly_target,
        profit: parseFloat(v.profit.toFixed(2)),
        loss: parseFloat(Math.abs(v.loss).toFixed(2)),
      }))
      setMonthlyData(months)

      // Recompute capital from actual P/L so stale DB cumulative doesn't hide journal edits
      const recomputed = computeCumulativePL(
        trades.map((t) => ({
          date: t.date,
          actual_pl: t.actual_pl,
          day_type: t.day_type,
        })),
        profile.starting_capital
      )
      const capital = recomputed
        .filter((_, i, arr) => i === 0 || arr[i].running_capital !== arr[i - 1].running_capital)
        .map((t) => ({
          date: parseLocalDate(t.date).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
          }),
          capital: t.running_capital,
        }))
      setRunningCapital(capital)
    }

    if (expenses) {
      // Category donut
      const catMap = new Map<string, number>()
      expenses.filter(e => e.type === 'expense').forEach(e => {
        catMap.set(e.category, (catMap.get(e.category) || 0) + e.amount)
      })
      setExpenseCategories(Array.from(catMap.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 6))

      // Income vs Expense by month
      const ivMap = new Map<string, { income: number; expense: number }>()
      expenses.forEach(e => {
        const ym = e.date.slice(0, 7)
        const cur = ivMap.get(ym) || { income: 0, expense: 0 }
        if (e.type === 'income') cur.income += e.amount
        else cur.expense += e.amount
        ivMap.set(ym, cur)
      })
      const ivData = Array.from(ivMap.entries()).map(([ym, v]) => ({
        month: parseLocalDate(`${ym}-01`).toLocaleString('default', { month: 'short', year: '2-digit' }),
        income: parseFloat(v.income.toFixed(2)),
        expense: parseFloat(v.expense.toFixed(2)),
      }))
      setIncomeVsExpense(ivData)
    }

    setLoading(false)
  }, [user, profile])

  useEffect(() => { loadData() }, [loadData])

  const totalProfit = monthlyData.reduce((s, m) => s + Math.max(0, m.earned), 0)
  const totalLoss = monthlyData.reduce((s, m) => s + Math.max(0, -m.earned), 0)
  const bestMonth = monthlyData.reduce((best, m) => m.earned > (best?.earned ?? -Infinity) ? m : best, monthlyData[0])
  const avgMonthly = monthlyData.length ? monthlyData.reduce((s, m) => s + m.earned, 0) / monthlyData.length : 0

  return (
    <div className="space-y-6 animate-in fade-in-0 slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
        <p className="text-sm text-muted-foreground">Comprehensive view of your trading and financial performance</p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Profit', value: formatCurrency(totalProfit), color: 'text-green-600 dark:text-green-400' },
          { label: 'Total Loss', value: formatCurrency(totalLoss), color: 'text-destructive' },
          { label: 'Best Month', value: bestMonth ? formatCurrency(bestMonth.earned) : '—', color: 'text-foreground' },
          { label: 'Avg Monthly', value: formatCurrency(avgMonthly), color: avgMonthly >= 0 ? 'text-green-600 dark:text-green-400' : 'text-destructive' },
        ].map(stat => (
          <Card key={stat.label}>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              {loading ? <Skeleton className="h-7 w-24 mt-1" /> : <p className={`text-xl font-bold mt-0.5 ${stat.color}`}>{stat.value}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Monthly P&L Bar Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Monthly P&L vs Target</CardTitle>
          <CardDescription>Earned per month compared to ₹{(profile?.monthly_target || 20920).toLocaleString('en-IN')} target</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? <Skeleton className="h-[280px] w-full" /> : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={(v, n) => [formatCurrency(Number(v)), n === 'earned' ? 'Earned' : 'Target']} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--background)' }} />
                <Legend />
                <Bar dataKey="earned" fill="var(--chart-1)" radius={[4, 4, 0, 0]} name="earned" />
                <Bar dataKey="target" fill="var(--chart-2)" radius={[4, 4, 0, 0]} name="target" opacity={0.4} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Running Capital + Income vs Expense */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Running Capital */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Running Capital Trend</CardTitle>
            <CardDescription>Portfolio growth from {formatCurrency(profile?.starting_capital || 4184)}</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-[220px] w-full" /> : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={runningCapital}>
                  <defs>
                    <linearGradient id="capitalGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v) => [formatCurrency(Number(v)), 'Capital']} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--background)' }} />
                  <Area type="monotone" dataKey="capital" stroke="var(--chart-1)" strokeWidth={2} fill="url(#capitalGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Income vs Expense */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Income vs Expenses</CardTitle>
            <CardDescription>Monthly comparison over time</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-[220px] w-full" /> : incomeVsExpense.length === 0 ? (
              <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">No transaction data yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={incomeVsExpense}>
                  <defs>
                    <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--chart-2)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--chart-2)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--chart-5)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--chart-5)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v, n) => [formatCurrency(Number(v)), n === 'income' ? 'Income' : 'Expense']} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--background)' }} />
                  <Legend />
                  <Area type="monotone" dataKey="income" stroke="var(--chart-2)" strokeWidth={2} fill="url(#incomeGrad)" name="income" />
                  <Area type="monotone" dataKey="expense" stroke="var(--chart-5)" strokeWidth={2} fill="url(#expenseGrad)" name="expense" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Expense Categories */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top Expense Categories</CardTitle>
            <CardDescription>All time breakdown</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-[220px] w-full" /> : expenseCategories.length === 0 ? (
              <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">No expense data yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={expenseCategories} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                    {expenseCategories.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => [formatCurrency(Number(v)), 'Amount']} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Legend iconType="circle" iconSize={8} formatter={v => <span className="text-xs text-muted-foreground">{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Monthly Target Tracker */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Monthly Progress Tracker</CardTitle>
            <CardDescription>Earnings vs {formatCurrency(profile?.monthly_target || 20920)} target per month</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-[220px] w-full" /> : monthlyData.length === 0 ? (
              <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">No trading data yet</div>
            ) : (
              <div className="space-y-3 max-h-[220px] overflow-y-auto pr-2">
                {monthlyData.map(m => {
                  const pct = Math.min(Math.round((m.earned / (profile?.monthly_target || 20920)) * 100), 100)
                  return (
                    <div key={m.month}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-medium">{m.month}</span>
                        <div className="flex items-center gap-2">
                          <span className={m.earned >= 0 ? 'text-green-600 dark:text-green-400' : 'text-destructive'}>{formatCurrency(m.earned)}</span>
                          <Badge variant={pct >= 100 ? 'default' : 'outline'} className="text-[10px] h-4 px-1.5">{pct}%</Badge>
                        </div>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${m.earned >= profile?.monthly_target! ? 'bg-green-500' : m.earned > 0 ? 'bg-primary' : 'bg-destructive'}`}
                          style={{ width: `${Math.max(0, pct)}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
