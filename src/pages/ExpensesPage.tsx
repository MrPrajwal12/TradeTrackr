import { useEffect, useState, useCallback } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod/v4'
import { toast } from 'sonner'
import { Plus, Search, ListFilter as Filter, Trash2, CreditCard as Edit2, X, TrendingUp, TrendingDown } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { useAuthStore } from '@/store/authStore'
import { supabase } from '@/lib/supabase'
import { formatCurrency, localISODate, localYearMonth } from '@/lib/trading-utils'
import { cn } from '@/lib/utils'
import type { Expense } from '@/lib/supabase'

const EXPENSE_CATEGORIES = ['Food', 'Transport', 'Housing', 'Utilities', 'Healthcare', 'Entertainment', 'Shopping', 'Education', 'Trading P/L', 'Brokerage Fees', 'Other']
const INCOME_CATEGORIES = ['Salary', 'Freelance', 'Trading Profit', 'Dividends', 'Other Income']

const expenseSchema = z.object({
  date: z.string().min(1, 'Date is required'),
  type: z.enum(['income', 'expense']),
  category: z.string().min(1, 'Category is required'),
  amount: z.number().positive('Amount must be positive'),
  description: z.string().optional(),
})

type ExpenseForm = z.infer<typeof expenseSchema>

function toYearMonth(date: string) {
  // date is stored as YYYY-MM-DD
  return date.slice(0, 7)
}

function formatYearMonth(ym: string) {
  const d = new Date(`${ym}-01T00:00:00`)
  return d.toLocaleString('default', { month: 'long', year: 'numeric' })
}

export function ExpensesPage() {
  const { user } = useAuthStore()
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all')
  const [filterCategory, setFilterCategory] = useState('all')
  const [selectedMonth, setSelectedMonth] = useState(localYearMonth())
  const [, setUndoItem] = useState<Expense | null>(null)

  const { register, handleSubmit, control, watch, reset, setValue, formState: { errors } } = useForm<ExpenseForm>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      date: localISODate(),
      type: 'expense',
      category: 'Other',
      description: '',
    },
  })

  const watchType = watch('type')

  const loadExpenses = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const { data } = await supabase
      .from('expenses')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_deleted', false)
      .order('date', { ascending: false })
    setExpenses(data || [])
    setLoading(false)
  }, [user])

  useEffect(() => { loadExpenses() }, [loadExpenses])

  const onSubmit = async (data: ExpenseForm) => {
    if (!user) return

    if (editingExpense) {
      const { error } = await supabase.from('expenses').update(data).eq('id', editingExpense.id)
      if (error) {
        toast.error(error.message)
        return
      }
      toast.success('Expense updated!')
    } else {
      const { error } = await supabase.from('expenses').insert({ ...data, user_id: user.id })
      if (error) {
        toast.error(error.message)
        return
      }
      toast.success('Expense added!')
    }

    reset({ date: localISODate(), type: 'expense', category: 'Other', description: '' })
    setEditingExpense(null)
    setSheetOpen(false)
    loadExpenses()
  }

  const handleDelete = async (expense: Expense) => {
    const { error } = await supabase.from('expenses').update({ is_deleted: true }).eq('id', expense.id)
    if (error) {
      toast.error(error.message)
      return
    }
    setUndoItem(expense)
    setExpenses(prev => prev.filter(e => e.id !== expense.id))
    const toastId = toast.warning('Expense deleted', {
      action: {
        label: 'Undo',
        onClick: async () => {
          const { error: undoError } = await supabase.from('expenses').update({ is_deleted: false }).eq('id', expense.id)
          if (undoError) {
            toast.error(undoError.message)
            return
          }
          setUndoItem(null)
          loadExpenses()
          toast.dismiss(toastId)
        },
      },
      duration: 5000,
    })
  }

  const handleEdit = (expense: Expense) => {
    setEditingExpense(expense)
    setValue('date', expense.date)
    setValue('type', expense.type)
    setValue('category', expense.category)
    setValue('amount', expense.amount)
    setValue('description', expense.description || '')
    setSheetOpen(true)
  }

  const filtered = expenses.filter(e => {
    const matchSearch = search === '' || e.description?.toLowerCase().includes(search.toLowerCase()) || e.category.toLowerCase().includes(search.toLowerCase())
    const matchType = filterType === 'all' || e.type === filterType
    const matchCat = filterCategory === 'all' || e.category === filterCategory
    return matchSearch && matchType && matchCat
  })

  const overallIncome = expenses.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0)
  const overallExpense = expenses.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0)
  const overallNet = overallIncome - overallExpense

  const monthExpenses = expenses.filter(e => toYearMonth(e.date) === selectedMonth)
  const monthIncome = monthExpenses.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0)
  const monthExpense = monthExpenses.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0)
  const monthNet = monthIncome - monthExpense

  const monthMap = new Map<string, { income: number; expense: number }>()
  for (const e of expenses) {
    const ym = toYearMonth(e.date)
    const cur = monthMap.get(ym) ?? { income: 0, expense: 0 }
    if (e.type === 'income') cur.income += e.amount
    else cur.expense += e.amount
    monthMap.set(ym, cur)
  }
  const monthRows = Array.from(monthMap.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([ym, v]) => ({ ym, ...v, net: v.income - v.expense }))

  const monthOptions = Array.from(new Set([selectedMonth, ...monthRows.map(r => r.ym)])).sort((a, b) => b.localeCompare(a))

  const allCategories = [...new Set(expenses.map(e => e.category))]

  return (
    <div className="space-y-6 animate-in fade-in-0 slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Expenses & Income</h1>
          <p className="text-sm text-muted-foreground">Track all your personal finance entries</p>
        </div>
        <Button onClick={() => { setEditingExpense(null); reset({ date: localISODate(), type: 'expense', category: 'Other', description: '' }); setSheetOpen(true) }}>
          <Plus className="size-4 mr-2" /> Add Transaction
        </Button>
      </div>

      {/* Monthly + Overall Summary */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">Monthly summary</p>
          <p className="text-xs text-muted-foreground">Choose a month to see Income, Expenses, and Net</p>
        </div>
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-full sm:w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {monthOptions.map((ym) => (
              <SelectItem key={ym} value={ym}>
                {formatYearMonth(ym)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Selected Month</p>
                <p className="text-sm font-semibold">{formatYearMonth(selectedMonth)}</p>
              </div>
              <Badge variant="outline">Monthly</Badge>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border p-3">
                <p className="text-[11px] text-muted-foreground">Income</p>
                <p className="text-sm font-bold text-green-600 dark:text-green-400">{formatCurrency(monthIncome)}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-[11px] text-muted-foreground">Expenses</p>
                <p className="text-sm font-bold text-destructive">{formatCurrency(monthExpense)}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-[11px] text-muted-foreground">Net</p>
                <p className={cn('text-sm font-bold', monthNet >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-orange-600 dark:text-orange-400')}>
                  {formatCurrency(monthNet)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Overall</p>
                <p className="text-sm font-semibold">All time totals</p>
              </div>
              <Badge variant="secondary">Overall</Badge>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border p-3">
                <p className="text-[11px] text-muted-foreground">Income</p>
                <p className="text-sm font-bold text-green-600 dark:text-green-400">{formatCurrency(overallIncome)}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-[11px] text-muted-foreground">Expenses</p>
                <p className="text-sm font-bold text-destructive">{formatCurrency(overallExpense)}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-[11px] text-muted-foreground">Net</p>
                <p className={cn('text-sm font-bold', overallNet >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-orange-600 dark:text-orange-400')}>
                  {formatCurrency(overallNet)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Month-wise totals list */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-medium">Month-wise totals</p>
              <p className="text-xs text-muted-foreground">Income / Expenses / Net by month</p>
            </div>
          </div>
          <div className="space-y-2">
            {monthRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data yet.</p>
            ) : (
              monthRows.slice(0, 12).map((r) => (
                <button
                  key={r.ym}
                  type="button"
                  onClick={() => setSelectedMonth(r.ym)}
                  className={cn(
                    "w-full flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition-colors hover:bg-muted/40",
                    r.ym === selectedMonth && "border-primary/40 bg-primary/5"
                  )}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{formatYearMonth(r.ym)}</p>
                    <p className="text-[11px] text-muted-foreground">
                      Income {formatCurrency(r.income)} • Expenses {formatCurrency(r.expense)}
                    </p>
                  </div>
                  <div className={cn("text-sm font-semibold", r.net >= 0 ? "text-blue-600 dark:text-blue-400" : "text-orange-600 dark:text-orange-400")}>
                    {formatCurrency(r.net)}
                  </div>
                </button>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search transactions..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterType} onValueChange={(v) => setFilterType(v as 'all' | 'income' | 'expense')}>
          <SelectTrigger className="w-[130px]">
            <Filter className="size-3.5 mr-2 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="income">Income</SelectItem>
            <SelectItem value="expense">Expense</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {allCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Overall Summary Cards (kept for quick glance) */}
      <div className="hidden">
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/30">
              <TrendingUp className="size-4 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Income</p>
              <p className="text-lg font-bold text-green-600">{formatCurrency(overallIncome)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/30">
              <TrendingDown className="size-4 text-destructive" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Expenses</p>
              <p className="text-lg font-bold text-destructive">{formatCurrency(overallExpense)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className={cn('flex size-9 items-center justify-center rounded-lg', overallNet >= 0 ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-orange-100 dark:bg-orange-900/30')}>
              <TrendingUp className={cn('size-4', overallNet >= 0 ? 'text-blue-600' : 'text-orange-600')} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Net Balance</p>
              <p className={cn('text-lg font-bold', overallNet >= 0 ? 'text-blue-600' : 'text-orange-600')}>{formatCurrency(overallNet)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <p className="text-sm">No transactions found. Add your first transaction!</p>
            </div>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="md:hidden divide-y">
                {filtered.map((expense) => (
                  <div key={expense.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{expense.category}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(expense.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
                          {expense.description ? ` • ${expense.description}` : ''}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <Badge
                            variant={expense.type === 'income' ? 'default' : 'secondary'}
                            className={cn(
                              'text-xs',
                              expense.type === 'income'
                                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-0'
                                : ''
                            )}
                          >
                            {expense.type === 'income' ? '↑ Income' : '↓ Expense'}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {expense.source}
                          </Badge>
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        <p
                          className={cn(
                            'text-sm font-semibold',
                            expense.type === 'income'
                              ? 'text-green-600 dark:text-green-400'
                              : 'text-destructive'
                          )}
                        >
                          {expense.type === 'income' ? '+' : '-'}
                          {formatCurrency(expense.amount)}
                        </p>
                        <div className="mt-2 flex items-center justify-end gap-2">
                          <Button variant="outline" size="sm" className="h-8 px-2" onClick={() => handleEdit(expense)}>
                            <Edit2 className="size-4" />
                          </Button>
                          <Button variant="destructive" size="sm" className="h-8 px-2" onClick={() => handleDelete(expense)}>
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                      <th className="text-left px-3 py-3 font-medium text-muted-foreground">Type</th>
                      <th className="text-left px-3 py-3 font-medium text-muted-foreground">Category</th>
                      <th className="text-right px-3 py-3 font-medium text-muted-foreground">Amount</th>
                      <th className="text-left px-3 py-3 font-medium text-muted-foreground">Description</th>
                      <th className="text-left px-3 py-3 font-medium text-muted-foreground">Source</th>
                      <th className="px-3 py-3 w-[80px]"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(expense => (
                      <tr key={expense.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                          {new Date(expense.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
                        </td>
                        <td className="px-3 py-3">
                          <Badge variant={expense.type === 'income' ? 'default' : 'secondary'} className={cn('text-xs', expense.type === 'income' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-0' : '')}>
                            {expense.type === 'income' ? '↑ Income' : '↓ Expense'}
                          </Badge>
                        </td>
                        <td className="px-3 py-3 font-medium">{expense.category}</td>
                        <td className={cn('px-3 py-3 text-right font-semibold', expense.type === 'income' ? 'text-green-600 dark:text-green-400' : 'text-destructive')}>
                          {expense.type === 'income' ? '+' : '-'}{formatCurrency(expense.amount)}
                        </td>
                        <td className="px-3 py-3 text-muted-foreground max-w-[200px] truncate">{expense.description || '—'}</td>
                        <td className="px-3 py-3">
                          <Badge variant="outline" className="text-xs">{expense.source}</Badge>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => handleEdit(expense)} className="text-muted-foreground hover:text-foreground transition-colors">
                              <Edit2 className="size-3.5" />
                            </button>
                            <button onClick={() => handleDelete(expense)} className="text-muted-foreground hover:text-destructive transition-colors">
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-md px-4 sm:px-6">
          <SheetHeader>
            <SheetTitle>{editingExpense ? 'Edit Transaction' : 'Add Transaction'}</SheetTitle>
            <SheetDescription>Enter the transaction details below</SheetDescription>
          </SheetHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label>Date</Label>
              <Input className="w-full" type="date" {...register('date')} aria-invalid={!!errors.date} />
              {errors.date && <p className="text-xs text-destructive">{errors.date.message}</p>}
            </div>

            <div className="space-y-2">
              <Label>Type</Label>
              <Controller
                name="type"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full" aria-invalid={!!errors.type}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="income">Income</SelectItem>
                      <SelectItem value="expense">Expense</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-2">
              <Label>Category</Label>
              <Controller
                name="category"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(watchType === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map(c => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-2">
              <Label>Amount (₹)</Label>
              <Input
                className="w-full"
                type="number"
                step="0.01"
                placeholder="0.00"
                {...register('amount', { valueAsNumber: true })}
                aria-invalid={!!errors.amount}
              />
              {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
            </div>

            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Input className="w-full" placeholder="Enter description..." {...register('description')} />
            </div>

            <Separator className="my-1" />

            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
              <Button
                type="button"
                variant="outline"
                className="w-full sm:flex-1"
                onClick={() => setSheetOpen(false)}
              >
                <X className="size-4 mr-2" /> Cancel
              </Button>
              <Button type="submit" className="w-full sm:flex-1">
                {editingExpense ? 'Update' : 'Add'} Transaction
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  )
}
