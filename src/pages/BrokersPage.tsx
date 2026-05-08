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
import type { Broker } from '@/lib/supabase'
import { cn } from '@/lib/utils'

const SUPPORTED_BROKERS = [
  { name: 'Zerodha', logo: '🟢', method: 'api' as const, color: 'border-green-200 dark:border-green-800' },
  { name: 'Upstox', logo: '🟣', method: 'api' as const, color: 'border-orange-200 dark:border-orange-800' },
  { name: 'Groww', logo: '🌱', method: 'csv_import' as const, color: 'border-green-200 dark:border-green-800' },
  { name: 'Angel One', logo: '👼', method: 'api' as const, color: 'border-red-200 dark:border-red-800' },
  { name: 'Fyers', logo: '🦅', method: 'api' as const, color: 'border-blue-200 dark:border-blue-800' },
  { name: '5Paisa', logo: '5️⃣', method: 'csv_import' as const, color: 'border-slate-200 dark:border-slate-800' },
  { name: 'IIFL', logo: '🏦', method: 'csv_import' as const, color: 'border-yellow-200 dark:border-yellow-800' },
  { name: 'Sharekhan', logo: '📊', method: 'csv_import' as const, color: 'border-cyan-200 dark:border-cyan-800' },
]

export function BrokersPage() {
  const { user } = useAuthStore()
  const [brokers, setBrokers] = useState<Broker[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedBroker, setSelectedBroker] = useState<typeof SUPPORTED_BROKERS[0] | null>(null)
  const [step, setStep] = useState<'select' | 'configure'>('select')
  const [apiKey, setApiKey] = useState('')
  const [apiSecret, setApiSecret] = useState('')
  const [manualName, setManualName] = useState('')
  const [manualAccountId, setManualAccountId] = useState('')
  const [saving, setSaving] = useState(false)

  const loadBrokers = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const { data } = await supabase.from('brokers').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
    setBrokers(data || [])
    setLoading(false)
  }, [user])

  useEffect(() => { loadBrokers() }, [loadBrokers])

  const addBroker = async (isManual = false) => {
    if (!user) return
    setSaving(true)

    const brokerData = {
      user_id: user.id,
      name: isManual ? (manualName || 'My Broker') : (selectedBroker?.name || ''),
      type: isManual ? 'manual' : (selectedBroker?.name.toLowerCase().replace(' ', '') || 'other'),
      connection_method: isManual ? 'manual' : (selectedBroker?.method || 'manual'),
      api_key: isManual ? undefined : apiKey,
      api_secret: isManual ? undefined : apiSecret,
      account_id: isManual ? manualAccountId : undefined,
      is_active: true,
    }

    const { error } = await supabase.from('brokers').insert(brokerData)
    setSaving(false)

    if (error) {
      toast.error('Failed to add broker')
    } else {
      toast.success(`${isManual ? manualName || 'Broker' : selectedBroker?.name} added successfully!`)
      setModalOpen(false)
      setStep('select')
      setSelectedBroker(null)
      setApiKey('')
      setApiSecret('')
      setManualName('')
      setManualAccountId('')
      loadBrokers()
    }
  }

  const deleteBroker = async (id: string) => {
    await supabase.from('brokers').delete().eq('id', id)
    setBrokers(prev => prev.filter(b => b.id !== id))
    toast.success('Broker removed')
  }

  const getStatusBadge = (broker: Broker) => {
    if (!broker.is_active) return <Badge variant="destructive" className="text-xs">Inactive</Badge>
    if (broker.connection_method === 'manual') return <Badge variant="secondary" className="text-xs">Manual</Badge>
    if (broker.last_synced_at) return <Badge className="text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-0">Connected</Badge>
    return <Badge variant="outline" className="text-xs">Pending Sync</Badge>
  }

  return (
    <div className="space-y-6 animate-in fade-in-0 slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Broker Connect</h1>
          <p className="text-sm text-muted-foreground">Connect your broker accounts for auto-sync or manual CSV import</p>
        </div>
        <Button onClick={() => { setStep('select'); setModalOpen(true) }}>
          <Plus className="size-4 mr-2" /> Add Broker
        </Button>
      </div>

      {/* Broker Cards */}
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
            <p className="text-sm text-muted-foreground mb-4">Connect your broker to automatically sync your trades</p>
            <Button onClick={() => { setStep('select'); setModalOpen(true) }}>
              <Plus className="size-4 mr-2" /> Connect Your First Broker
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {brokers.map(broker => (
            <Card key={broker.id} className="hover:shadow-md transition-shadow">
              <CardContent className="pt-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-lg bg-muted text-xl">
                      {SUPPORTED_BROKERS.find(b => b.name.toLowerCase() === broker.name.toLowerCase())?.logo || '🏦'}
                    </div>
                    <div>
                      <p className="font-semibold">{broker.name}</p>
                      <p className="text-xs text-muted-foreground capitalize">{broker.connection_method?.replace('_', ' ')}</p>
                    </div>
                  </div>
                  {getStatusBadge(broker)}
                </div>

                {broker.account_id && (
                  <p className="text-xs text-muted-foreground mb-2">Account: {broker.account_id}</p>
                )}

                {broker.last_synced_at && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mb-3">
                    <Clock className="size-3" />
                    Last synced: {new Date(broker.last_synced_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                  </div>
                )}

                <div className="flex gap-2 mt-3">
                  {broker.connection_method !== 'manual' && (
                    <Button variant="outline" size="sm" className="h-7 text-xs flex-1" onClick={() => toast.info('Sync feature coming soon!')}>
                      <RefreshCw className="size-3 mr-1.5" /> Sync Now
                    </Button>
                  )}
                  {broker.connection_method !== 'api' && (
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

      {/* How it works */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Supported Integrations</CardTitle>
          <CardDescription>Connect via API for real-time sync, or import CSV statements manually</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {SUPPORTED_BROKERS.map(b => (
              <div key={b.name} className={cn('flex items-center gap-2 p-3 rounded-lg border', b.color)}>
                <span className="text-lg">{b.logo}</span>
                <div>
                  <p className="text-xs font-medium">{b.name}</p>
                  <p className="text-[10px] text-muted-foreground capitalize">{b.method.replace('_', ' ')}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Add Broker Dialog */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Connect Broker</DialogTitle>
            <DialogDescription>Choose your broker and connection method</DialogDescription>
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
                    {SUPPORTED_BROKERS.map(b => (
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
                          <p className="text-[10px] text-muted-foreground capitalize">{b.method.replace('_', ' ')}</p>
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

                  {selectedBroker.method === 'api' ? (
                    <>
                      <div className="space-y-2">
                        <Label>API Key</Label>
                        <Input placeholder={`Enter ${selectedBroker.name} API Key`} value={apiKey} onChange={e => setApiKey(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>API Secret</Label>
                        <Input type="password" placeholder="Enter API Secret" value={apiSecret} onChange={e => setApiSecret(e.target.value)} />
                      </div>
                      <p className="text-xs text-muted-foreground">API keys are stored securely. Your trading data will sync automatically after connecting.</p>
                    </>
                  ) : (
                    <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
                      <Upload className="size-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm font-medium mb-1">Upload CSV Statement</p>
                      <p className="text-xs text-muted-foreground mb-3">Download your statement from {selectedBroker.name} and upload here</p>
                      <Button variant="outline" size="sm" onClick={() => toast.info('CSV parsing coming soon!')}>Choose File</Button>
                    </div>
                  )}

                  <Separator />
                  <div className="flex gap-3">
                    <Button variant="outline" className="flex-1" onClick={() => setModalOpen(false)}>Cancel</Button>
                    <Button className="flex-1" onClick={() => addBroker(false)} disabled={saving}>
                      {saving ? 'Connecting...' : 'Connect Broker'}
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="manual" className="mt-4 space-y-4">
              <p className="text-sm text-muted-foreground">Add a broker manually for tracking purposes. You can import CSV statements anytime.</p>
              <div className="space-y-2">
                <Label>Broker Name</Label>
                <Input placeholder="e.g., My Broker, HDFC Securities" value={manualName} onChange={e => setManualName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Account ID (optional)</Label>
                <Input placeholder="e.g., ZX1234567" value={manualAccountId} onChange={e => setManualAccountId(e.target.value)} />
              </div>
              <Separator />
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setModalOpen(false)}>Cancel</Button>
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
