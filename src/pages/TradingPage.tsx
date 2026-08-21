import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { toast } from 'sonner'
import {
  ChevronLeft,
  ChevronRight,
  TriangleAlert as AlertTriangle,
  Target,
  CreditCard as Edit2,
  Check,
  X,
  Sparkles,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
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
  computeCumulativePL,
  computeMonthTargetInsights,
  enrichEntriesWithPace,
  buildCapitalTrail,
  sumTradingPL,
  localISODate,
  localYearMonth,
  shiftYearMonth,
  parseLocalDate,
  monthEndDate,
  type CapitalTrail,
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
  const monthlyTarget = profile?.monthly_target || 20920
  const startingCapital = profile?.starting_capital || 4184
  const maxDailyLoss = profile?.max_daily_loss || 1255.2
  const today = localISODate()

  const [entries, setEntries] = useState<MergedDay[]>([])
  const [monthOpeningCapital, setMonthOpeningCapital] = useState(4184)
  const [capitalTrail, setCapitalTrail] = useState<CapitalTrail | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editPL, setEditPL] = useState<string>('')
  const [editNotes, setEditNotes] = useState<string>('')
  const [breachAlert, setBreachAlert] = useState<string | null>(null)
  const [showOffDays, setShowOffDays] = useState(false)

  const prevMonth = () => setSelectedMonth((m) => shiftYearMonth(m, -1))
  const nextMonth = () => setSelectedMonth((m) => shiftYearMonth(m, 1))

  const loadEntries = useCallback(async () => {
    if (!user || !profile) return
    setLoading(true)

    const days = generateMonthDays(selectedMonth, monthlyTarget)
    const startDate = `${selectedMonth}-01`
    const endDate = days[days.length - 1].date

    // Prior months' P/L rolls into this month's opening capital
    const { data: priorRows, error: priorError } = await supabase
      .from('trade_entries')
      .select('actual_pl, day_type')
      .eq('user_id', user.id)
      .lt('date', startDate)

    if (priorError) {
      toast.error(priorError.message)
      setLoading(false)
      return
    }

    const priorPL = sumTradingPL(priorRows || [])
    const opening = parseFloat((startingCapital + priorPL).toFixed(2))
    setMonthOpeningCapital(opening)

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

    const merged = computeCumulativePL(withPl, opening).map((row) => ({
      ...row,
      daily_loss_allowed: maxDailyLoss,
    })) as MergedDay[]

    const monthPL = sumTradingPL(merged)
    setCapitalTrail(buildCapitalTrail(startingCapital, priorPL, monthPL, monthlyTarget))
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

    const nextBase = entries.map((e) =>
      e.date === entry.date
        ? { ...e, actual_pl: pl, notes: editNotes }
        : e
    )
    const nextMerged = computeCumulativePL(nextBase, monthOpeningCapital).map((row) => ({
      ...row,
      daily_loss_allowed: maxDailyLoss,
    })) as MergedDay[]

    setEntries(nextMerged)
    const monthPL = sumTradingPL(nextMerged)
    const priorPL = parseFloat((monthOpeningCapital - startingCapital).toFixed(2))
    setCapitalTrail(buildCapitalTrail(startingCapital, priorPL, monthPL, monthlyTarget))

    const { error } = await persistMonthTotals(nextMerged)
    setSaving(false)

    if (error) {
      toast.error(error.message)
      await loadEntries()
      return
    }

    toast.success('Saved. Tomorrow’s target is updated.')
    setEditingId(null)
    await loadEntries()
  }

  const isCurrentMonth = selectedMonth === localYearMonth()
  const asOfDate = isCurrentMonth ? today : monthEndDate(selectedMonth)

  const insights = computeMonthTargetInsights(entries, monthlyTarget, asOfDate)
  const displayEntries = enrichEntriesWithPace(
    entries,
    insights.adjustedDailyTarget,
    asOfDate
  )
  const visibleEntries = displayEntries.filter(
    (e) => showOffDays || e.day_type === 'Trading Day'
  )

  const tradingDays = entries.filter((e) => e.day_type === 'Trading Day' && e.actual_pl != null)
  const monthlyEarned = insights.monthlyEarned
  const winDays = tradingDays.filter((e) => (e.actual_pl ?? 0) > 0).length
  const winRate = tradingDays.length > 0 ? Math.round((winDays / tradingDays.length) * 100) : 0
  const progress = Math.min(Math.round((monthlyEarned / monthlyTarget) * 100), 100)
  const monthLabel = parseLocalDate(`${selectedMonth}-01`).toLocaleString('default', {
    month: 'long',
    year: 'numeric',
  })
  const tradingDayCount = entries.filter((e) => e.day_type === 'Trading Day').length

  const nextSessionLabel = insights.nextTradingDay
    ? parseLocalDate(insights.nextTradingDay).toLocaleDateString('en-IN', {
        weekday: 'long',
        day: 'numeric',
        month: 'short',
      })
    : null

  const todayEntry = displayEntries.find((e) => e.date === today)
  const focusNeed =
    todayEntry?.needed_pl ??
    (insights.nextTradingDayNeeded > 0 ? insights.nextTradingDayNeeded : null)

  return (
    <div className="space-y-5 animate-in fade-in-0 slide-in-from-bottom-4 duration-500 max-w-5xl">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Trading Journal</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Log a day, then see what tomorrow needs to stay on target.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-full border bg-card px-1 py-1">
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={prevMonth}>
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-sm font-medium min-w-[132px] text-center px-2">{monthLabel}</span>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={nextMonth}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {breachAlert && (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertDescription className="font-medium">{breachAlert} Stop trading today.</AlertDescription>
        </Alert>
      )}

      {isCurrentMonth && !loading && !insights.goalReached && focusNeed != null && (
        <div className="rounded-2xl border bg-gradient-to-br from-primary/8 via-card to-card p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
              <Sparkles className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-muted-foreground">
                {todayEntry?.needed_pl != null ? 'Aim for today' : `Aim for ${nextSessionLabel}`}
              </p>
              <p className="text-3xl font-semibold tracking-tight mt-1 text-primary">
                {formatCurrency(focusNeed)}
              </p>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                {insights.remainingToTarget > 0
                  ? `${formatCurrency(insights.remainingToTarget)} left this month, spread over ${insights.remainingTradingDays} trading day${insights.remainingTradingDays === 1 ? '' : 's'}.`
                  : 'Monthly target is covered.'}
                {insights.yesterdayWasLoss && todayEntry?.needed_pl != null && (
                  <> Yesterday was a loss of {formatCurrency(insights.yesterdayLoss)} — this number already includes the catch-up.</>
                )}
                {insights.todayGap != null && insights.todayGap < 0 && insights.nextTradingDay && (
                  <> Today missed by {formatCurrency(Math.abs(insights.todayGap))}. Next session ({nextSessionLabel}) needs {formatCurrency(insights.nextTradingDayNeeded)}.</>
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      {isCurrentMonth && !loading && insights.goalReached && (
        <div className="rounded-2xl border border-green-500/30 bg-green-500/8 p-5">
          <p className="text-sm font-medium text-green-700 dark:text-green-400">Monthly goal reached</p>
          <p className="text-sm text-muted-foreground mt-1">
            {formatCurrency(insights.monthlyEarned)} earned vs {formatCurrency(insights.monthlyTarget)} target. Extra profit is bonus.
          </p>
        </div>
      )}

      {capitalTrail && !loading && (
        <Card className="shadow-none border-primary/15">
          <CardContent className="p-4 sm:p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                <Wallet className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">Capital carry-forward</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  Losses reduce capital into the next month. Profits (including surplus above your monthly target) add to capital and continue forward.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="rounded-xl bg-muted/40 p-3">
                <p className="text-[11px] text-muted-foreground">Opened {monthLabel}</p>
                <p className="text-base font-semibold tabular-nums mt-1">{formatCurrency(capitalTrail.monthOpeningCapital)}</p>
                {capitalTrail.priorPL !== 0 && (
                  <p className={cn('text-[11px] mt-0.5', capitalTrail.priorPL >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive')}>
                    Prior months {capitalTrail.priorPL >= 0 ? '+' : ''}{formatCurrency(capitalTrail.priorPL)}
                  </p>
                )}
              </div>
              <div className="rounded-xl bg-muted/40 p-3">
                <p className="text-[11px] text-muted-foreground">This month P/L</p>
                <p className={cn('text-base font-semibold tabular-nums mt-1', capitalTrail.monthPL >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive')}>
                  {capitalTrail.monthPL >= 0 ? '+' : ''}{formatCurrency(capitalTrail.monthPL)}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Target {formatCurrency(monthlyTarget)}
                </p>
              </div>
              <div className="rounded-xl bg-muted/40 p-3">
                <p className="text-[11px] text-muted-foreground">Capital now</p>
                <p className="text-base font-semibold tabular-nums mt-1">{formatCurrency(capitalTrail.monthClosingCapital)}</p>
                {capitalTrail.surplusOverTarget > 0 && (
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5">
                    +{formatCurrency(capitalTrail.surplusOverTarget)} above target rolls next
                  </p>
                )}
              </div>
              <div className="rounded-xl bg-muted/40 p-3">
                <p className="text-[11px] text-muted-foreground">Since you started</p>
                <p className={cn(
                  'text-base font-semibold tabular-nums mt-1 flex items-center gap-1',
                  capitalTrail.vsStart >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'
                )}>
                  {capitalTrail.vsStart >= 0 ? <ArrowUpRight className="size-4" /> : <ArrowDownRight className="size-4" />}
                  {capitalTrail.vsStart >= 0 ? '+' : ''}{formatCurrency(capitalTrail.vsStart)}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  From {formatCurrency(capitalTrail.baseCapital)}
                </p>
              </div>
            </div>

            <p className={cn(
              'text-sm rounded-xl px-3 py-2',
              capitalTrail.vsStart >= 0
                ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
                : 'bg-destructive/10 text-destructive'
            )}>
              {capitalTrail.vsStart >= 0
                ? `Overall you are ahead by ${formatCurrency(capitalTrail.vsStart)}. Keep compounding into next month.`
                : `Overall you are down ${formatCurrency(Math.abs(capitalTrail.vsStart))} from start. Next month opens lower — focus on recovering that gap.`}
              {capitalTrail.vsMonthlyTarget < 0 && (
                <> This month is {formatCurrency(Math.abs(capitalTrail.vsMonthlyTarget))} behind target.</>
              )}
              {capitalTrail.vsMonthlyTarget > 0 && (
                <> This month is {formatCurrency(capitalTrail.vsMonthlyTarget)} above target — surplus stays in capital.</>
              )}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="shadow-none">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">This month</p>
            <p className={cn('text-lg font-semibold mt-1 tabular-nums', monthlyEarned >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive')}>
              {formatCurrency(monthlyEarned)}
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-none">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Capital now</p>
            <p className="text-lg font-semibold mt-1 tabular-nums">
              {formatCurrency(capitalTrail?.monthClosingCapital ?? monthOpeningCapital)}
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-none">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Win rate</p>
            <p className="text-lg font-semibold mt-1">{winRate}%</p>
            <p className="text-[11px] text-muted-foreground">{winDays}/{tradingDays.length} days</p>
          </CardContent>
        </Card>
        <Card className="shadow-none">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Days left</p>
            <p className="text-lg font-semibold mt-1">{insights.remainingTradingDays}</p>
            <p className="text-[11px] text-muted-foreground">of {tradingDayCount} trading days</p>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-none">
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3 mb-2">
            <p className="text-sm font-medium flex items-center gap-2">
              <Target className="size-4 text-primary" />
              Monthly progress
            </p>
            <span className="text-sm font-semibold tabular-nums">{progress}%</span>
          </div>
          <Progress value={progress} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground mt-2">
            <span>{formatCurrency(monthlyEarned)}</span>
            <span>{formatCurrency(monthlyTarget)}</span>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-none overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 sm:px-5 py-4 border-b">
          <div>
            <p className="font-medium">{monthLabel} log</p>
            <p className="text-xs text-muted-foreground mt-0.5">Tap a trading day to add P/L</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="rounded-full h-8"
            onClick={() => setShowOffDays((v) => !v)}
          >
            {showOffDays ? 'Hide weekends' : 'Show weekends'}
          </Button>
        </div>

        {loading ? (
          <div className="p-5 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="divide-y">
            {visibleEntries.map((entry) => {
              const isEditing = editingId === (entry.id ?? entry.date)
              const isToday = entry.date === today
              const isOff = entry.day_type !== 'Trading Day'
              const pl = entry.actual_pl
              const status =
                isOff ? 'off'
                : pl == null ? (entry.needed_pl != null ? 'need' : 'empty')
                : pl < 0 ? 'loss'
                : pl >= entry.daily_target_inr ? 'hit'
                : 'short'

              return (
                <div
                  key={entry.date}
                  className={cn(
                    'px-4 sm:px-5 py-3.5 transition-colors',
                    isToday && 'bg-primary/5',
                    isOff && 'opacity-55'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        'size-2.5 shrink-0 rounded-full',
                        status === 'hit' && 'bg-emerald-500',
                        status === 'short' && 'bg-amber-400',
                        status === 'loss' && 'bg-red-400',
                        status === 'need' && 'bg-primary',
                        (status === 'empty' || status === 'off') && 'bg-muted-foreground/30'
                      )}
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className={cn('text-sm font-medium', isToday && 'text-primary')}>
                          {parseLocalDate(entry.date).toLocaleDateString('en-IN', {
                            weekday: 'short',
                            day: 'numeric',
                            month: 'short',
                          })}
                        </p>
                        {isToday && (
                          <Badge variant="outline" className="text-[10px] h-5 rounded-full px-2">
                            Today
                          </Badge>
                        )}
                        {isOff && (
                          <Badge variant="secondary" className="text-[10px] h-5 rounded-full px-2">
                            {entry.day_type}
                          </Badge>
                        )}
                        {entry.needed_pl != null && (
                          <Badge className="text-[10px] h-5 rounded-full px-2 bg-primary/15 text-primary hover:bg-primary/15">
                            Need {formatCurrency(entry.needed_pl)}
                          </Badge>
                        )}
                      </div>

                      {!isEditing && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {isOff
                            ? 'Market closed'
                            : pl != null
                              ? `${entry.daily_gap != null && entry.daily_gap >= 0 ? 'Ahead' : 'Behind'} ${formatCurrency(Math.abs(entry.daily_gap ?? 0))} · Capital ${formatCurrency(entry.running_capital)}`
                              : `Base target ${formatCurrency(entry.daily_target_inr)}`}
                        </p>
                      )}
                    </div>

                    {!isEditing && (
                      <div className="shrink-0 text-right">
                        <p
                          className={cn(
                            'text-sm font-semibold tabular-nums',
                            pl == null && 'text-muted-foreground',
                            pl != null && pl >= 0 && 'text-emerald-600 dark:text-emerald-400',
                            pl != null && pl < 0 && 'text-destructive'
                          )}
                        >
                          {isOff || pl == null ? '—' : formatCurrency(pl)}
                        </p>
                      </div>
                    )}

                    {entry.day_type === 'Trading Day' && !isEditing && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 rounded-full"
                        onClick={() => startEdit(entry)}
                      >
                        <Edit2 className="size-3.5" />
                      </Button>
                    )}
                  </div>

                  {isEditing && (
                    <div className="mt-3 ml-5 space-y-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <Input
                          type="number"
                          value={editPL}
                          onChange={(e) => setEditPL(e.target.value)}
                          className="h-10"
                          placeholder="P/L for the day"
                          autoFocus
                        />
                        <Input
                          value={editNotes}
                          onChange={(e) => setEditNotes(e.target.value)}
                          className="h-10"
                          placeholder="Optional note"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button className="rounded-full" disabled={saving} onClick={() => saveEdit(entry)}>
                          <Check className="size-4 mr-1.5" /> Save
                        </Button>
                        <Button variant="ghost" className="rounded-full" onClick={() => setEditingId(null)}>
                          <X className="size-4 mr-1.5" /> Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Card>

      <p className="text-xs text-muted-foreground px-1">
        Opening capital for each month = your start capital + every prior month’s P/L. Losses shrink next month’s opening balance; surplus above target grows it.
      </p>
    </div>
  )
}
