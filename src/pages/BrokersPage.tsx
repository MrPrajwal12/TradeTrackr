import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { Plus, Link2, RefreshCw, Clock, Upload, X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuthStore } from '@/store/authStore'
import { supabase } from '@/lib/supabase'
import { syncDhanPositions } from '@/lib/dhan'
import { formatCurrency } from '@/lib/trading-utils'
import type { Broker } from '@/lib/supabase'
import { cn } from '@/lib/utils'

const SUPPORTED_BROKERS = [
  { name: 'Dhan', logo: '🔵', method: 'api' as const, color: 'border-blue-200 dark:border-blue-800', type: 'dhan' },
  { name: 'Zerodha', logo: '🟢', method: 'api' as const, color: 'border-green-200 dark:border-green-800', type: 'zerodha' },
  { name: 'Upstox', logo: '🟣', method: 'api' as const, color: 'border-orange-200 dark:border-orange-800', type: 'upstox' },
  { name: 'Groww', logo: '🌱', method: 'csv_import' as const, color: 'border-green-200 dark:border-green-800', type: 'groww' },
  { name: 'Angel One', logo: '👼', method: 'api' as const, color: 'border-red-200 dark:border-red-800', type: 'angel' },
  { name: 'Fyers', logo: '🦅', method: 'api' as const, color: 'border-blue-200 dark:border-blue-800', type: 'fyers' },
  { name: '5Paisa', logo: '5️⃣', method: 'csv_import' as const, color: 'border-slate-200 dark:border-slate-800', type: '5paisa' },
  { name: 'IIFL', logo: '🏦', method: 'csv_import' as const, color: 'border-yellow-200 dark:border-yellow-800', type: 'iifl' },
  { name: 'Sharekhan', logo: '📊', method: 'csv_import' as const, color: 'border-cyan-200 dark:border-cyan-800', type: 'sharekhan' },
]

function isDhanBroker(broker: Broker) {
  return broker.type === 'dhan' || broker.name.toLowerCase() === 'dhan'
}

export function BrokersPage() {
  const { user } = useAuthStore()
  const [brokers, setBrokers] = useState<Broker[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedBroker, setSelectedBroker] = useState<typeof SUPPORTED_BROKERS[0] | null>(null)
  const [step, setStep] = useState<'select' | 'configure'>('select')
  const [clientId, setClientId] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [apiSecret, setApiSecret] = useState('')
  const [manualName, setManualName] = useState('')
  const [manualAccountId, setManualAccountId] = useState('')
  const [saving, setSaving] = useState(false)
  const [syncingId, setSyncingId] = useState<string | null>(null)

  const loadBrokers = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const { data } = await supabase.from('brokers').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
    setBrokers(data || [])
    setLoading(false)
  }, [user])

  useEffect(() => { loadBrokers() }, [loadBrokers])

  const resetModal = () => {
    setModalOpen(false)
    setStep('select')
    setSelectedBroker(null)
    setClientId('')
    setAccessToken('')
    setApiKey('')
    setApiSecret('')
    setManualName('')
    setManualAccountId('')
  }

  const addBroker = async (isManual = false) => {
    if (!user) return
    setSaving(true)

    const isDhan = !isManual && selectedBroker?.type === 'dhan'

    if (isDhan && (!clientId.trim() || !accessToken.trim())) {
      setSaving(false)
      toast.error('Enter Dhan Client ID and Access Token')
      return
    }

    const brokerData = isManual
      ? {
          user_id: user.id,
          name: manualName || 'My Broker',
          type: 'manual',
          connection_method: 'manual' as const,
          account_id: manualAccountId || '',
          is_active: true,
        }
      : isDhan
        ? {
            user_id: user.id,
            name: 'Dhan',
            type: 'dhan',
            connection_method: 'api' as const,
            account_id: clientId.trim(),
            api_key: clientId.trim(),
            access_token: accessToken.trim(),
            api_secret: '',
            is_active: true,
          }
        : {
            user_id: user.id,
            name: selectedBroker?.name || '',
            type: selectedBroker?.type || 'other',
            connection_method: (selectedBroker?.method || 'manual') as 'api' | 'csv_import' | 'manual',
            api_key: apiKey,
            api_secret: apiSecret,
            is_active: true,
          }

    const { error } = await supabase.from('brokers').insert(brokerData)
    setSaving(false)

    if (error) {
      toast.error(error.message || 'Failed to add broker')
      return
    }

    toast.success(`${isManual ? manualName || 'Broker' : selectedBroker?.name} connected`)
    resetModal()
    loadBrokers()
  }

  const deleteBroker = async (id: string) => {
    await supabase.from('brokers').delete().eq('id', id)
    setBrokers((prev) => prev.filter((b) => b.id !== id))
    toast.success('Broker removed')
  }

  const syncBroker = async (broker: Broker) => {
    if (!isDhanBroker(broker)) {
      toast.info('Live sync is available for Dhan right now. Other brokers coming soon.')
      return
    }
    setSyncingId(broker.id)
    try {
      const result = await syncDhanPositions(broker.id)
      toast.success(
        `Dhan synced for ${result.date}: ${formatCurrency(result.actual_pl)} (realized ${formatCurrency(result.realized)}, unrealized ${formatCurrency(result.unrealized)})`
      )
      await loadBrokers()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Dhan sync failed')
    } finally {
      setSyncingId(null)
    }
  }

  const getStatusBadge = (broker: Broker) => {
    if (!broker.is_active) return <Badge variant="destructive" className="text-xs">Inactive</Badge>
    if (broker.connection_method === 'manual') return <Badge variant="secondary" className="text-xs">Manual</Badge>
    if (broker.last_synced_at) return <Badge className="text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-0">Synced</Badge>
    return <Badge variant="outline" className="text-xs">Ready to sync</Badge>
  }

  return (
    <div className="space-y-6 animate-in fade-in-0 slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Broker Connect</h1>
          <p className="text-sm text-muted-foreground">
            Connect Dhan to pull today&apos;s positions into your trading journal
          </p>
        </div>
        <Button onClick={() => { setStep('select'); setModalOpen(true) }}>
          <Plus className="size-4 mr-2" /> Add Broker
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}><CardContent className="pt-6"><Skeleton className="h-24 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : brokers.length === 0 ? (
        <Card>
          <CardContent className="pt-12 pb-12 text-center">
            <Link2 className="size-10 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-semibold mb-2">No brokers connected</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Connect Dhan with Client ID + Access Token to auto-fill today&apos;s P/L
            </p>
            <Button onClick={() => { setStep('select'); setModalOpen(true) }}>
              <Plus className="size-4 mr-2" /> Connect Dhan
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {brokers.map((broker) => (
            <Card key={broker.id} className="hover:shadow-md transition-shadow">
              <CardContent className="pt-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-lg bg-muted text-xl">
                      {SUPPORTED_BROKERS.find((b) => b.name.toLowerCase() === broker.name.toLowerCase())?.logo || '🏦'}
                    </div>
                    <div>
                      <p className="font-semibold">{broker.name}</p>
                      <p className="text-xs text-muted-foreground capitalize">{broker.connection_method?.replace('_', ' ')}</p>
                    </div>
                  </div>
                  {getStatusBadge(broker)}
                </div>

                {broker.account_id && (
                  <p className="text-xs text-muted-foreground mb-2">Client ID: {broker.account_id}</p>
                )}

                {broker.last_synced_at && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mb-3">
                    <Clock className="size-3" />
                    Last synced: {new Date(broker.last_synced_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                  </div>
                )}

                <div className="flex gap-2 mt-3">
                  {broker.connection_method === 'api' && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs flex-1"
                      disabled={syncingId === broker.id}
                      onClick={() => syncBroker(broker)}
                    >
                      <RefreshCw className={cn('size-3 mr-1.5', syncingId === broker.id && 'animate-spin')} />
                      {syncingId === broker.id ? 'Syncing…' : 'Sync Now'}
                    </Button>
                  )}
                  {broker.connection_method === 'csv_import' && (
                    <Button variant="outline" size="sm" className="h-7 text-xs flex-1" onClick={() => toast.info('CSV import coming soon!')}>
                      <Upload className="size-3 mr-1.5" /> Import CSV
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => deleteBroker(broker.id)}>
                    <X className="size-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">How Dhan sync works</CardTitle>
          <CardDescription>
            We call Dhan&apos;s positions API and write today&apos;s realized + unrealized P/L into your Trading Journal (source: broker auto).
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>1. Generate an Access Token from web.dhan.co → My Profile → Access DhanHQ APIs.</p>
          <p>2. Connect with your Client ID + token here (stored on your broker row).</p>
          <p>3. Tap Sync Now — today&apos;s journal day updates automatically. You can still edit manually.</p>
        </CardContent>
      </Card>

      <Dialog open={modalOpen} onOpenChange={(open) => { if (!open) resetModal(); else setModalOpen(true) }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Connect Broker</DialogTitle>
            <DialogDescription>Prefer Dhan for live position sync</DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="auto">
            <TabsList className="w-full">
              <TabsTrigger value="auto" className="flex-1">Connect via API / CSV</TabsTrigger>
              <TabsTrigger value="manual" className="flex-1">Manual Entry</TabsTrigger>
            </TabsList>

            <TabsContent value="auto" className="mt-4">
              {step === 'select' ? (
                <div>
                  <p className="text-sm text-muted-foreground mb-4">Select your broker:</p>
                  <div className="grid grid-cols-2 gap-2">
                    {SUPPORTED_BROKERS.map((b) => (
                      <button
                        key={b.name}
                        onClick={() => { setSelectedBroker(b); setStep('configure') }}
                        className={cn(
                          'flex items-center gap-2.5 p-3 rounded-lg border hover:bg-muted/50 transition-colors text-left',
                          b.color
                        )}
                      >
                        <span className="text-xl">{b.logo}</span>
                        <div>
                          <p className="text-sm font-medium">{b.name}</p>
                          <p className="text-[10px] text-muted-foreground capitalize">
                            {b.type === 'dhan' ? 'positions API' : b.method.replace('_', ' ')}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : selectedBroker && (
                <div className="space-y-4">
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setStep('select')}>← Back</Button>

                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <span className="text-2xl">{selectedBroker.logo}</span>
                    <div>
                      <p className="font-medium">{selectedBroker.name}</p>
                      <p className="text-xs text-muted-foreground capitalize">{selectedBroker.method.replace('_', ' ')}</p>
                    </div>
                  </div>

                  {selectedBroker.type === 'dhan' ? (
                    <>
                      <div className="space-y-2">
                        <Label>Dhan Client ID</Label>
                        <Input
                          placeholder="e.g. 1104029799"
                          value={clientId}
                          onChange={(e) => setClientId(e.target.value)}
                          autoComplete="off"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Access Token</Label>
                        <Input
                          type="password"
                          placeholder="Paste JWT access token from DhanHQ"
                          value={accessToken}
                          onChange={(e) => setAccessToken(e.target.value)}
                          autoComplete="off"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Token is stored on your broker row and used only by the sync function. Refresh the token when Dhan expires it.
                      </p>
                    </>
                  ) : selectedBroker.method === 'api' ? (
                    <>
                      <div className="space-y-2">
                        <Label>API Key</Label>
                        <Input placeholder={`Enter ${selectedBroker.name} API Key`} value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>API Secret</Label>
                        <Input type="password" placeholder="Enter API Secret" value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} />
                      </div>
                      <p className="text-xs text-muted-foreground">Live sync for this broker is not wired yet — connection is saved for later.</p>
                    </>
                  ) : (
                    <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
                      <Upload className="size-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm font-medium mb-1">Upload CSV Statement</p>
                      <p className="text-xs text-muted-foreground mb-3">CSV parsing coming soon</p>
                      <Button variant="outline" size="sm" onClick={() => toast.info('CSV parsing coming soon!')}>Choose File</Button>
                    </div>
                  )}

                  <Separator />
                  <div className="flex gap-3">
                    <Button variant="outline" className="flex-1" onClick={resetModal}>Cancel</Button>
                    <Button className="flex-1" onClick={() => addBroker(false)} disabled={saving}>
                      {saving ? 'Connecting...' : 'Connect Broker'}
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="manual" className="mt-4 space-y-4">
              <p className="text-sm text-muted-foreground">Add a broker manually for tracking. Prefer Dhan API for auto P/L.</p>
              <div className="space-y-2">
                <Label>Broker Name</Label>
                <Input placeholder="e.g., My Broker" value={manualName} onChange={(e) => setManualName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Account ID (optional)</Label>
                <Input placeholder="e.g., ZX1234567" value={manualAccountId} onChange={(e) => setManualAccountId(e.target.value)} />
              </div>
              <Separator />
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={resetModal}>Cancel</Button>
                <Button className="flex-1" onClick={() => addBroker(true)} disabled={saving || !manualName}>
                  {saving ? 'Adding...' : 'Add Broker'}
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  )
}
