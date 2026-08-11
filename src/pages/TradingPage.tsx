import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, TriangleAlert as AlertTriangle, TrendingUp, Target, Trophy, CreditCard as Edit2, Check, X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuthStore } from '@/store/authStore'
import { supabase } from '@/lib/supabase'
import {
  generateMonthDays,
  formatCurrency,
  getRowColor,
  computeCumulativePL,
  localISODate,
  localYearMonth,
  shiftYearMonth,
  parseLocalDate,
} from '@/lib/trading-utils'
import { cn } from '@/lib/utils'
import type { TradeEntry } from '@/lib/supabase'

type MergedDay = ReturnType<typeof generateMonthDays>[0] & {
  id?: string
  notes: string
  actual_pl: number | null
  source?: TradeEntry['source']
  cumulative_pl: number
  running_capital: number
  daily_loss_allowed: number
}

export function TradingPage() {
  const { month } = useParams()
  const { user, profile } = useAuthStore()
  const [selectedMonth, setSelectedMonth] = useState(month || localYearMonth())
  const [entries, setEntries] = useState<MergedDay[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editPL, setEditPL] = useState<string>('')
  const [editNotes, setEditNotes] = useState<string>('')
  const [breachAlert, setBreachAlert] = useState<string | null>(null)

  const monthlyTarget = profile?.monthly_target || 20920
  const startingCapital = profile?.starting_capital || 4184
  const maxDailyLoss = profile?.max_daily_loss || 1255.2
  const today = localISODate()

  const prevMonth = () => setSelectedMonth((m) => shiftYearMonth(m, -1))
  const nextMonth = () => setSelectedMonth((m) => shiftYearMonth(m, 1))

  const loadEntries = useCallback(async () => {
    if (!user || !profile) return
    setLoading(true)

    const days = generateMonthDays(selectedMonth, monthlyTarget)
    const startDate = `${selectedMonth}-01`
    const endDate = days[days.length - 1].date

    const { data, error } = await supabase
      .from('trade_entries')
      .select('*')
      .eq('user_id', user.id)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date')

    if (error) {
      toast.error(error.message)
      setLoading(false)
      return
    }

    const dbMap = new Map((data || []).map((e) => [e.date, e]))

    // Prefer freshly computed day fields (target/type) so Settings monthly_target is reflected.
    const withPl = days.map((day) => {
      const db = dbMap.get(day.date)
      return {
        ...day,
        id: db?.id,
        notes: db?.notes || '',
        actual_pl: db?.actual_pl ?? null,
        source: db?.source,
        daily_loss_allowed: maxDailyLoss,
      }
    })

    const merged = computeCumulativePL(withPl, startingCapital).map((row) => ({
      ...row,
      daily_loss_allowed: maxDailyLoss,
    })) as MergedDay[]

    setEntries(merged)

    const breach = merged.find(
      (e) => e.actual_pl != null && e.actual_pl < -maxDailyLoss
    )
    if (breach) {
      setBreachAlert(
        `Max daily loss breached on ${parseLocalDate(breach.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}!`
      )
    } else {
      setBreachAlert(null)
    }

    setLoading(false)
  }, [user, profile, selectedMonth, monthlyTarget, startingCapital, maxDailyLoss])

  useEffect(() => {
    loadEntries()
  }, [loadEntries])

  const startEdit = (entry: MergedDay) => {
    setEditingId(entry.id ?? entry.date)
    setEditPL(entry.actual_pl?.toString() ?? '')
    setEditNotes(entry.notes || '')
  }

  /** Persist P/L for one day, then rewrite cumulative/capital for the whole month. */
  const persistMonthTotals = async (
    monthEntries: Array<{
      id?: string
      date: string
      weekday: string
      day_type: string
      daily_target_inr: number
      actual_pl: number | null
      notes?: string
      cumulative_pl: number
      running_capital: number
    }>
  ) => {
    if (!user) return { error: new Error('Not signed in') as Error | null }

    const rows = monthEntries.map((e) => ({
      user_id: user.id,
      date: e.date,
      weekday: e.weekday,
      day_type: e.day_type,
      daily_target_inr: e.daily_target_inr,
      actual_pl: e.actual_pl,
      notes: e.notes || '',
      cumulative_pl: e.cumulative_pl,
      running_capital: e.running_capital,
      daily_loss_allowed: maxDailyLoss,
      source: 'manual' as const,
      updated_at: new Date().toISOString(),
    }))

    // Only upsert days that have data or already existed — keep DB lean.
    const toUpsert = rows.filter((r) => {
      const existing = monthEntries.find((e) => e.date === r.date)
      return Boolean(existing?.id) || r.actual_pl != null || (r.notes && r.notes.length > 0)
    })

    if (toUpsert.length === 0) return { error: null }

    const { error } = await supabase
      .from('trade_entries')
      .upsert(toUpsert, { onConflict: 'user_id,date' })

    return { error }
  }

  const saveEdit = async (entry: MergedDay) => {
    if (!user || !profile) return

    const trimmed = editPL.trim()
    const pl = trimmed === '' ? null : Number(trimmed)
    if (pl != null && !Number.isFinite(pl)) {
      toast.error('Enter a valid P/L number')
      return
    }

    if (pl != null && pl < -maxDailyLoss) {
      toast.error(
        `Max daily loss breached! Loss of ${formatCurrency(Math.abs(pl))} exceeds limit of ${formatCurrency(maxDailyLoss)}. Stop trading today!`,
        { duration: 8000 }
      )
    }

    setSaving(true)

    // Optimistic local rebuild so UI updates immediately
    const nextBase = entries.map((e) =>
      e.date === entry.date
        ? { ...e, actual_pl: pl, notes: editNotes }
        : e
    )
    const nextMerged = computeCumulativePL(nextBase, startingCapital).map((row) => ({
      ...row,
      daily_loss_allowed: maxDailyLoss,
    })) as MergedDay[]

    setEntries(nextMerged)

    const { error } = await persistMonthTotals(nextMerged)
    setSaving(false)

    if (error) {
      toast.error(error.message)
      await loadEntries()
      return
    }

    toast.success('Entry saved — P/L, cumulative and capital updated.')
    setEditingId(null)
    await loadEntries()
  }

  // Monthly stats
  const tradingDays = entries.filter(e => e.day_type === 'Trading Day' && e.actual_pl != null)
  const monthlyEarned = tradingDays.reduce((s, e) => s + (e.actual_pl ?? 0), 0)
  const winDays = tradingDays.filter(e => (e.actual_pl ?? 0) > 0).length
  const winRate = tradingDays.length > 0 ? Math.round((winDays / tradingDays.length) * 100) : 0
  const progress = Math.min(Math.round((monthlyEarned / monthlyTarget) * 100), 100)
  const monthLabel = parseLocalDate(`${selectedMonth}-01`).toLocaleString('default', { month: 'long', year: 'numeric' })
  const tradingDayCount = entries.filter((e) => e.day_type === 'Trading Day').length
  const dailyTargetPreview = tradingDayCount > 0 ? monthlyTarget / tradingDayCount : 0

  return (
    <div className="space-y-6 animate-in fade-in-0 slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Trading Journal</h1>
          <p className="text-sm text-muted-foreground">Monthly P&L tracking — mirrors your Excel plan exactly</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={prevMonth}>
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-sm font-semibold min-w-[140px] text-center">{monthLabel}</span>
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={nextMonth}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {/* Breach Alert */}
      {breachAlert && (
        <Alert variant="destructive" className="animate-in fade-in-0">
          <AlertTriangle className="size-4" />
          <AlertDescription className="font-medium">{breachAlert} Stop trading today.</AlertDescription>
        </Alert>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Monthly Earned</p>
            <p className={cn('text-xl font-bold mt-0.5', monthlyEarned >= 0 ? 'text-green-600 dark:text-green-400' : 'text-destructive')}>{formatCurrency(monthlyEarned)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Win Rate</p>
            <p className="text-xl font-bold mt-0.5">{winRate}%</p>
            <p className="text-xs text-muted-foreground">{winDays}/{tradingDays.length} days</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Best Day</p>
            <p className="text-xl font-bold mt-0.5 text-green-600 dark:text-green-400">{formatCurrency(Math.max(0, ...tradingDays.map(e => e.actual_pl ?? 0)))}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Worst Day</p>
            <p className="text-xl font-bold mt-0.5 text-destructive">{formatCurrency(Math.min(0, ...tradingDays.map(e => e.actual_pl ?? 0)))}</p>
          </CardContent>
        </Card>
      </div>

      {/* Progress Bar */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Target className="size-4 text-primary" />
              Monthly Target Progress
            </CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold">{progress}%</span>
              {progress >= 100 && <Badge className="bg-green-500">Goal Achieved! 🎉</Badge>}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Progress value={progress} className="h-2.5" />
          <div className="flex justify-between text-xs text-muted-foreground mt-1.5">
            <span>{formatCurrency(monthlyEarned)} earned</span>
            <span>{formatCurrency(monthlyTarget)} target</span>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Daily target ≈ {formatCurrency(dailyTargetPreview)} ({tradingDayCount} trading days this month)
          </p>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="size-4" />
            {monthLabel} — Daily Trading Log
          </CardTitle>
          <CardDescription>Click the edit icon on any trading day to enter P&L</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="md:hidden divide-y">
                {entries.map((entry) => {
                  const isEditing = editingId === (entry.id ?? entry.date)
                  const isToday = entry.date === today
                  const plClass =
                    entry.actual_pl == null
                      ? "text-muted-foreground"
                      : entry.actual_pl >= 0
                        ? "text-green-600 dark:text-green-400"
                        : "text-destructive"

                  return (
                    <div key={entry.date} className={cn("p-4", entry.day_type !== "Trading Day" && "opacity-70")}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className={cn("text-sm font-semibold", isToday && "text-primary")}>
                              {parseLocalDate(entry.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                            </p>
                            {isToday ? (
                              <Badge variant="outline" className="text-[10px] h-4 px-1">
                                Today
                              </Badge>
                            ) : null}
                            <Badge
                              variant={entry.day_type === "Trading Day" ? "outline" : "secondary"}
                              className={cn("text-[10px] h-4 px-1", entry.day_type === "Trading Day" && "border-primary/30")}
                            >
                              {entry.day_type === "Trading Day" ? "Trading" : entry.day_type}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {entry.weekday} • Target {entry.day_type === "Trading Day" ? formatCurrency(entry.daily_target_inr) : "—"} • Loss guard{" "}
                            {formatCurrency(entry.daily_loss_allowed)}
                          </p>
                        </div>

                        <div className="shrink-0 text-right">
                          <p className={cn("text-sm font-bold", plClass)}>
                            {entry.day_type === "Trading Day"
                              ? entry.actual_pl != null
                                ? formatCurrency(entry.actual_pl)
                                : "—"
                              : "—"}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            Capital {formatCurrency(entry.running_capital)}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3">
                        {isEditing ? (
                          <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                              <Input
                                type="number"
                                value={editPL}
                                onChange={(e) => setEditPL(e.target.value)}
                                className="h-9"
                                placeholder="P/L"
                                autoFocus
                              />
                              <Input
                                value={editNotes}
                                onChange={(e) => setEditNotes(e.target.value)}
                                className="h-9"
                                placeholder="Notes"
                              />
                            </div>
                            <div className="flex gap-2">
                              <Button className="flex-1" disabled={saving} onClick={() => saveEdit(entry)}>
                                <Check className="size-4 mr-2" /> Save
                              </Button>
                              <Button variant="outline" className="flex-1" onClick={() => setEditingId(null)}>
                                <X className="size-4 mr-2" /> Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs text-muted-foreground truncate flex-1">{entry.notes || "No notes"}</p>
                            {entry.day_type === "Trading Day" ? (
                              <Button variant="outline" size="sm" className="h-8" onClick={() => startEdit(entry)}>
                                <Edit2 className="size-4 mr-2" /> Edit
                              </Button>
                            ) : null}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap w-[110px]">Date</th>
                      <th className="text-left px-3 py-3 font-medium text-muted-foreground w-[70px]">Day</th>
                      <th className="text-left px-3 py-3 font-medium text-muted-foreground w-[110px]">Type</th>
                      <th className="text-right px-3 py-3 font-medium text-muted-foreground w-[120px]">Daily Target</th>
                      <th className="text-right px-3 py-3 font-medium text-muted-foreground w-[120px]">Actual P/L</th>
                      <th className="text-right px-3 py-3 font-medium text-muted-foreground w-[130px]">Cumulative</th>
                      <th className="text-right px-3 py-3 font-medium text-muted-foreground w-[130px]">Capital</th>
                      <th className="text-right px-3 py-3 font-medium text-muted-foreground w-[110px]">Loss Guard</th>
                      <th className="text-left px-3 py-3 font-medium text-muted-foreground min-w-[150px]">Notes</th>
                      <th className="px-3 py-3 w-[60px]"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry) => {
                      const isEditing = editingId === (entry.id ?? entry.date)
                      const rowClass = getRowColor(entry.actual_pl ?? null, entry.daily_target_inr, entry.day_type)
                      const isToday = entry.date === today

                      return (
                        <tr
                          key={entry.date}
                          className={cn(
                            'border-b border-border/50 transition-colors',
                            rowClass,
                            isToday && 'ring-1 ring-inset ring-primary/30',
                            entry.day_type !== 'Trading Day' && 'opacity-60'
                          )}
                        >
                          <td className="px-4 py-3 font-medium whitespace-nowrap">
                            <span className={cn(isToday && 'text-primary font-bold')}>
                              {parseLocalDate(entry.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                            </span>
                            {isToday && <Badge variant="outline" className="ml-1.5 text-[10px] h-4 px-1">Today</Badge>}
                          </td>
                          <td className="px-3 py-3 text-muted-foreground">{entry.weekday}</td>
                          <td className="px-3 py-3">
                            <Badge
                              variant={entry.day_type === 'Trading Day' ? 'outline' : 'secondary'}
                              className={cn('text-xs', entry.day_type === 'Trading Day' && 'border-primary/30')}
                            >
                              {entry.day_type === 'Trading Day' ? 'Trading' : entry.day_type}
                            </Badge>
                          </td>
                          <td className="px-3 py-3 text-right text-muted-foreground">
                            {entry.day_type === 'Trading Day' ? formatCurrency(entry.daily_target_inr) : '—'}
                          </td>
                          <td className="px-3 py-3 text-right">
                            {isEditing ? (
                              <Input
                                type="number"
                                value={editPL}
                                onChange={e => setEditPL(e.target.value)}
                                className="h-7 w-24 text-right text-xs ml-auto"
                                autoFocus
                              />
                            ) : entry.day_type === 'Trading Day' ? (
                              <span className={cn(
                                'font-semibold',
                                entry.actual_pl == null ? 'text-muted-foreground' :
                                entry.actual_pl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-destructive'
                              )}>
                                {entry.actual_pl != null ? formatCurrency(entry.actual_pl) : '—'}
                              </span>
                            ) : '—'}
                          </td>
                          <td className="px-3 py-3 text-right font-medium">
                            <span className={cn(entry.cumulative_pl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-destructive')}>
                              {formatCurrency(entry.cumulative_pl)}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right font-medium">
                            {formatCurrency(entry.running_capital)}
                          </td>
                          <td className="px-3 py-3 text-right text-muted-foreground text-xs">
                            {formatCurrency(entry.daily_loss_allowed)}
                          </td>
                          <td className="px-3 py-3">
                            {isEditing ? (
                              <Input
                                value={editNotes}
                                onChange={e => setEditNotes(e.target.value)}
                                className="h-7 text-xs"
                                placeholder="Notes..."
                              />
                            ) : (
                              <span className="text-xs text-muted-foreground truncate max-w-[180px] block">{entry.notes || ''}</span>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            {entry.day_type === 'Trading Day' && (
                              isEditing ? (
                                <div className="flex gap-1">
                                  <button
                                    disabled={saving}
                                    onClick={() => saveEdit(entry)}
                                    className="text-green-500 hover:text-green-600 disabled:opacity-50"
                                  >
                                    <Check className="size-4" />
                                  </button>
                                  <button onClick={() => setEditingId(null)} className="text-muted-foreground hover:text-foreground">
                                    <X className="size-4" />
                                  </button>
                                </div>
                              ) : (
                                <button onClick={() => startEdit(entry)} className="text-muted-foreground hover:text-foreground transition-colors">
                                  <Edit2 className="size-3.5" />
                                </button>
                              )
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-green-500/40 border-l-2 border-green-500" /> Profit ≥ Target</div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-yellow-400/40 border-l-2 border-yellow-400" /> Profit &lt; Target</div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-red-400/40 border-l-2 border-red-400" /> Loss</div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-muted" /> No Entry / Holiday</div>
        <div className="flex items-center gap-1.5"><Trophy className="size-3 text-yellow-500" /> Click edit icon to enter P&L</div>
      </div>
    </div>
  )
}
