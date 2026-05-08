import { useNavigate } from 'react-router-dom'
import { TrendingUp, ChartBar as BarChart2, Shield, Zap, ArrowRight, Check, Wallet, Brain } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { ModeToggle } from '@/components/mode-toggle'

const features = [
  { icon: TrendingUp, title: 'Trading Journal', desc: 'Track daily P&L with auto-computed cumulative returns. Color-coded rows for instant insight.' },
  { icon: BarChart2, title: 'Advanced Analytics', desc: 'Heat calendars, P&L charts, win-rate gauges, and running capital trends.' },
  { icon: Wallet, title: 'Expense Tracking', desc: 'Personal finance CRUD with categories, filters, and CSV import from brokers.' },
  { icon: Brain, title: 'AI Coach', desc: 'Claude-powered weekly summaries analyzing your trading patterns and spending.' },
  { icon: Shield, title: 'Daily Loss Guard', desc: 'Automatic alerts when you breach your max daily loss limit of ₹1,255.' },
  { icon: Zap, title: 'Broker Connect', desc: 'Connect Zerodha, Upstox, Angel One and more via API or CSV import.' },
]

const stats = [
  { label: 'Starting Capital', value: '₹4,184' },
  { label: 'Monthly Target', value: '₹20,920' },
  { label: 'Current Capital', value: '₹9,866' },
  { label: 'Win Rate', value: '64%' },
]

export function LandingPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-svh bg-background flex flex-col">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary">
              <Zap className="size-4 text-primary-foreground" />
            </div>
            <span className="text-base sm:text-lg font-bold tracking-tight truncate">TradeTrackr</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <ModeToggle />
            <Button variant="ghost" size="sm" className="hidden sm:inline-flex" onClick={() => navigate('/auth')}>
              Sign In
            </Button>
            <Button size="sm" className="gap-1.5 px-3" onClick={() => navigate('/auth')}>
              <span className="hidden sm:inline">Get Started</span>
              <span className="sm:hidden">Start</span>
              <ArrowRight className="size-3.5" />
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="flex-1 max-w-6xl mx-auto px-4 py-20 md:py-32 text-center">
        <Badge variant="secondary" className="mb-6 px-3 py-1 text-xs">
          Personal Finance + Trading Performance Tracker
        </Badge>
        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-balance mb-6 bg-gradient-to-br from-foreground to-foreground/60 bg-clip-text text-transparent">
          Master Your Trades.<br />Own Your Finances.
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 text-balance">
          TradeTrackr mirrors your Excel trading plan exactly — with real-time P&L tracking, AI coaching, broker integrations, and beautiful analytics.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
          <Button size="lg" onClick={() => navigate('/auth')} className="gap-2 text-base h-12 px-8">
            Start Tracking Free <ArrowRight className="size-4" />
          </Button>
          <Button size="lg" variant="outline" className="gap-2 text-base h-12 px-8" onClick={() => navigate('/auth')}>
            View Demo
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
          {stats.map((stat) => (
            <Card key={stat.label} className="border-border/50">
              <CardContent className="pt-4 pb-4 text-center">
                <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-border bg-muted/30 py-20">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-3">Everything you need to trade smarter</h2>
          <p className="text-muted-foreground text-center mb-12 max-w-xl mx-auto">Built for Indian retail traders. Designed around your real trading workflow.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <Card key={feature.title} className="border-border/50 hover:border-border transition-colors hover:shadow-sm">
                <CardContent className="pt-6">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 mb-4">
                    <feature.icon className="size-5 text-primary" />
                  </div>
                  <h3 className="font-semibold mb-2">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{feature.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 text-center">
        <div className="max-w-2xl mx-auto px-4">
          <h2 className="text-3xl font-bold mb-4">Ready to track your trading journey?</h2>
          <p className="text-muted-foreground mb-8">Join traders already using TradeTrackr to hit their monthly targets.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {['No credit card needed', 'INR-first design', 'All brokers supported'].map((item) => (
              <div key={item} className="flex items-center gap-2 text-sm text-muted-foreground justify-center">
                <Check className="size-4 text-green-500" />
                {item}
              </div>
            ))}
          </div>
          <Button size="lg" className="mt-8 gap-2" onClick={() => navigate('/auth')}>
            Get Started for Free <ArrowRight className="size-4" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        <p>© 2026 TradeTrackr. Built for traders, by traders.</p>
      </footer>
    </div>
  )
}
