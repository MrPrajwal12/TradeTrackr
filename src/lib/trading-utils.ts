// Generate all calendar days for a given year-month
export function generateMonthDays(yearMonth: string): Array<{
  date: string
  weekday: string
  day_type: 'Trading Day' | 'Holiday' | 'Weekend'
  daily_target_inr: number
}> {
  const [year, month] = yearMonth.split('-').map(Number)
  const daysInMonth = new Date(year, month, 0).getDate()
  const days = []

  // Public holidays (simplified - April 2026)
  const holidays = new Set([
    '2026-04-02', '2026-04-06', '2026-04-07', '2026-04-08', // Tamil/Ram Navami etc
    '2026-04-14', // Dr. Ambedkar Jayanti
  ])

  // Count trading days for target calculation
  let tradingDayCount = 0
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const dayOfWeek = new Date(date).getDay()
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
    const isHoliday = holidays.has(date)
    if (!isWeekend && !isHoliday) tradingDayCount++
  }

  // Daily target = monthly target / trading days
  const monthlyTarget = 20920
  const dailyTarget = tradingDayCount > 0 ? monthlyTarget / tradingDayCount : 0

  const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const dayOfWeek = new Date(date).getDay()
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
    const isHoliday = holidays.has(date)

    let day_type: 'Trading Day' | 'Holiday' | 'Weekend' = 'Trading Day'
    if (isWeekend) day_type = 'Weekend'
    else if (isHoliday) day_type = 'Holiday'

    days.push({
      date,
      weekday: weekdays[dayOfWeek].slice(0, 3),
      day_type,
      daily_target_inr: day_type === 'Trading Day' ? parseFloat(dailyTarget.toFixed(2)) : 0,
    })
  }

  return days
}

export function computeCumulativePL(
  entries: Array<{ date: string; actual_pl: number | null; day_type: string }>,
  startingCapital: number
) {
  let cumulative = 0
  return entries.map((entry) => {
    if (entry.actual_pl != null && entry.day_type === 'Trading Day') {
      cumulative += entry.actual_pl
    }
    return {
      ...entry,
      cumulative_pl: parseFloat(cumulative.toFixed(2)),
      running_capital: parseFloat((startingCapital + cumulative).toFixed(2)),
    }
  })
}

export function formatCurrency(amount: number, currency = 'INR'): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function getRowColor(actualPL: number | null, dailyTarget: number, dayType: string): string {
  if (dayType !== 'Trading Day') return 'bg-muted/30'
  if (actualPL == null) return ''
  if (actualPL >= dailyTarget) return 'bg-green-50 dark:bg-green-950/20 border-l-4 border-green-500'
  if (actualPL > 0) return 'bg-yellow-50 dark:bg-yellow-950/20 border-l-4 border-yellow-400'
  if (actualPL < 0) return 'bg-red-50 dark:bg-red-950/20 border-l-4 border-red-400'
  return ''
}

// Seed data for Apr 2026
export const APR_2026_SEED = [
  { date: '2026-04-09', actual_pl: 2329 },
  { date: '2026-04-10', actual_pl: -1140 },
  { date: '2026-04-13', actual_pl: -860 },
  { date: '2026-04-14', actual_pl: 87 },
  { date: '2026-04-15', actual_pl: 806 },
  { date: '2026-04-16', actual_pl: -1998 },
  { date: '2026-04-17', actual_pl: 1348.75 },
  { date: '2026-04-20', actual_pl: 2135.25 },
  { date: '2026-04-21', actual_pl: 1992.25 },
  { date: '2026-04-22', actual_pl: 982 },
]
