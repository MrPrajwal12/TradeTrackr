import { useEffect, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { User, Shield, Bell, Download, Save } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuthStore } from '@/store/authStore'
import { supabase } from '@/lib/supabase'
import { generateMonthDays } from '@/lib/trading-utils'

export function SettingsPage() {
  const { user, profile, fetchProfile } = useAuthStore()
  const [saving, setSaving] = useState(false)
  const [notifications, setNotifications] = useState({
    dailyLoss: true,
    monthlyTarget: true,
    weeklySummary: true,
    brokerSync: true,
  })

  const { register, handleSubmit, reset, control } = useForm({
    defaultValues: {
      full_name: profile?.full_name || '',
      starting_capital: profile?.starting_capital || 4184,
      monthly_target: profile?.monthly_target || 20920,
      max_daily_loss: profile?.max_daily_loss || 1255.2,
      currency: profile?.currency || 'INR',
    },
  })

  useEffect(() => {
    reset({
      full_name: profile?.full_name || '',
      starting_capital: profile?.starting_capital || 4184,
      monthly_target: profile?.monthly_target || 20920,
      max_daily_loss: profile?.max_daily_loss || 1255.2,
      currency: profile?.currency || 'INR',
    })
  }, [profile, reset])

  const syncDailyTargets = async (
    userId: string,
    monthlyTarget: number,
    maxDailyLoss: number
  ) => {
    const { data: rows } = await supabase
      .from('trade_entries')
      .select('id, date, day_type')
      .eq('user_id', userId)

    if (!rows?.length) return

    const months = [...new Set(rows.map((r) => r.date.slice(0, 7)))]
    const targetByDate = new Map<string, number>()
    for (const ym of months) {
      for (const day of generateMonthDays(ym, monthlyTarget)) {
        targetByDate.set(day.date, day.daily_target_inr)
      }
    }

    // Update in chunks to avoid huge payloads
    const updates = rows
      .map((r) => ({
        id: r.id,
        daily_target_inr: targetByDate.get(r.date) ?? 0,
        daily_loss_allowed: maxDailyLoss,
      }))
      .filter((u) => u.id)

    for (let i = 0; i < updates.length; i += 50) {
      const chunk = updates.slice(i, i + 50)
      await Promise.all(
        chunk.map((u) =>
          supabase
            .from('trade_entries')
            .update({
              daily_target_inr: u.daily_target_inr,
              daily_loss_allowed: u.daily_loss_allowed,
              updated_at: new Date().toISOString(),
            })
            .eq('id', u.id)
        )
      )
    }
  }

  const onSave = async (data: {
    full_name: string
    starting_capital: number
    monthly_target: number
    max_daily_loss: number
    currency: string
  }) => {
    if (!user) return
    setSaving(true)

    const targetChanged =
      data.monthly_target !== profile?.monthly_target ||
      data.max_daily_loss !== profile?.max_daily_loss

    const { error } = await supabase.from('profiles').update(data).eq('id', user.id)
    if (error) {
      setSaving(false)
      toast.error('Failed to save settings')
      return
    }

    if (targetChanged) {
      await syncDailyTargets(user.id, data.monthly_target, data.max_daily_loss)
    }

    await fetchProfile(user.id)
    setSaving(false)
    toast.success(
      targetChanged
        ? 'Settings saved — daily targets recalculated for your journal.'
        : 'Settings saved successfully!'
    )
  }

  const handleExportCSV = () => {
    toast.info('CSV export coming soon!')
  }

  return (
    <div className="space-y-6 w-full max-w-4xl mx-auto animate-in fade-in-0 slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your account and trading preferences</p>
      </div>

      {/* Profile */}
      <form onSubmit={handleSubmit(onSave)}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <User className="size-4" /> Profile Settings
            </CardTitle>
            <CardDescription>Update your personal information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input {...register('full_name')} placeholder="Your full name" />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={user?.email || ''} disabled className="bg-muted" />
              <p className="text-xs text-muted-foreground">Email cannot be changed</p>
            </div>
          </CardContent>
        </Card>

        {/* Trading Settings */}
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="size-4" /> Trading Parameters
            </CardTitle>
            <CardDescription>Configure your capital settings and risk limits</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Starting Capital (₹)</Label>
                <Input type="number" {...register('starting_capital', { valueAsNumber: true })} />
              </div>
              <div className="space-y-2">
                <Label>Monthly Target (₹)</Label>
                <Input type="number" {...register('monthly_target', { valueAsNumber: true })} />
              </div>
              <div className="space-y-2">
                <Label>Max Daily Loss (₹)</Label>
                <Input type="number" step="0.01" {...register('max_daily_loss', { valueAsNumber: true })} />
                <p className="text-xs text-muted-foreground">Trading stops if daily loss exceeds this</p>
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
                <Controller
                  name="currency"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value as string} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="INR">₹ INR — Indian Rupee</SelectItem>
                        <SelectItem value="USD">$ USD — US Dollar</SelectItem>
                        <SelectItem value="EUR">€ EUR — Euro</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Button type="submit" className="mt-4" disabled={saving}>
          <Save className="size-4 mr-2" /> {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </form>

      {/* Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="size-4" /> Notification Preferences
          </CardTitle>
          <CardDescription>Control which alerts you receive</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {[
            { key: 'dailyLoss', label: 'Daily Loss Breach Alert', desc: 'Alert when P&L exceeds max daily loss' },
            { key: 'monthlyTarget', label: 'Monthly Target Reached', desc: 'Celebration when you hit your monthly goal' },
            { key: 'weeklySummary', label: 'Weekly AI Summary', desc: 'Auto-generate AI insights every Monday' },
            { key: 'brokerSync', label: 'Broker Sync Status', desc: 'Notify when broker tokens expire' },
          ].map((item) => (
            <div key={item.key} className="flex items-center justify-between py-1">
              <div>
                <p className="text-sm font-medium">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
              <Switch
                checked={notifications[item.key as keyof typeof notifications]}
                onCheckedChange={(checked) => setNotifications(prev => ({ ...prev, [item.key]: checked }))}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Export */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Download className="size-4" /> Data Export
          </CardTitle>
          <CardDescription>Export your trading and financial data</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" size="sm" onClick={handleExportCSV}>
              <Download className="size-4 mr-2" /> Export Trading CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => toast.info('Excel export coming soon!')}>
              <Download className="size-4 mr-2" /> Export Excel (.xlsx)
            </Button>
            <Button variant="outline" size="sm" onClick={() => toast.info('PDF report coming soon!')}>
              <Download className="size-4 mr-2" /> Monthly PDF Report
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-base text-destructive">Danger Zone</CardTitle>
          <CardDescription>Irreversible account actions</CardDescription>
        </CardHeader>
        <CardContent>
          <Separator className="mb-4" />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Delete Account</p>
              <p className="text-xs text-muted-foreground">Permanently delete your account and all data</p>
            </div>
            <Button variant="destructive" size="sm" onClick={() => toast.error('Please contact support to delete your account')}>
              Delete Account
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
