import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { LayoutDashboard, TrendingUp, Wallet, ChartBar as BarChart2, Link2, Settings, LogOut, ChevronLeft, ChevronRight, Plus, Bell, Menu, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { useAuthStore } from '@/store/authStore'
import { cn } from '@/lib/utils'
import { ModeToggle } from '@/components/mode-toggle'
import { AiAssistantWidget } from '@/components/ai/AiAssistantWidget'

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', route: '/dashboard' },
  { icon: TrendingUp, label: 'Trading Journal', route: '/trading' },
  { icon: Wallet, label: 'Expenses', route: '/expenses' },
  { icon: BarChart2, label: 'Analytics', route: '/analytics' },
  { icon: Link2, label: 'Brokers', route: '/brokers' },
  { icon: Settings, label: 'Settings', route: '/settings' },
]

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const { profile, signOut } = useAuthStore()
  const navigate = useNavigate()

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : 'TT'

  return (
    <div className="flex min-h-svh bg-background">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        'fixed inset-y-0 left-0 z-50 flex flex-col bg-sidebar border-r border-sidebar-border transition-all duration-300 ease-in-out',
        collapsed ? 'w-16' : 'w-64',
        mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      )}>
        {/* Logo */}
        <div className={cn('flex items-center h-16 px-4 border-b border-sidebar-border', collapsed ? 'justify-center' : 'justify-between')}>
          {!collapsed && (
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary">
                <Zap className="size-4 text-primary-foreground" />
              </div>
              <span className="text-lg font-bold text-sidebar-foreground tracking-tight">TradeTrackr</span>
            </div>
          )}
          {collapsed && (
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary">
              <Zap className="size-4 text-primary-foreground" />
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden md:flex size-6 items-center justify-center rounded-md text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
          >
            {collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.route}
              to={item.route}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) => cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent',
                isActive && 'bg-sidebar-accent text-sidebar-foreground shadow-sm',
                collapsed && 'justify-center px-2'
              )}
              title={collapsed ? item.label : undefined}
            >
              <item.icon className="size-4 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        <Separator className="bg-sidebar-border" />

        {/* Footer */}
        <div className={cn('p-3 space-y-2', collapsed && 'px-2')}>
          {!collapsed && (
            <div className="flex items-center gap-3 px-2 py-2 rounded-lg">
              <Avatar className="size-8">
                <AvatarImage src={profile?.avatar_url} />
                <AvatarFallback className="text-xs bg-primary text-primary-foreground">{initials}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-sidebar-foreground truncate">{profile?.full_name || 'Trader'}</p>
                <Badge variant="secondary" className="text-[10px] h-4 px-1.5">Pro</Badge>
              </div>
            </div>
          )}
          <button
            onClick={() => { signOut(); navigate('/auth') }}
            className={cn(
              'flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-sidebar-foreground/70 hover:text-destructive hover:bg-destructive/10 transition-colors',
              collapsed && 'justify-center px-2'
            )}
            title={collapsed ? 'Sign Out' : undefined}
          >
            <LogOut className="size-4 shrink-0" />
            {!collapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* Main area */}
      <div className={cn('flex-1 flex flex-col min-w-0 transition-all duration-300', collapsed ? 'md:ml-16' : 'md:ml-64')}>
        {/* Topbar */}
        <header className="sticky top-0 z-30 flex items-center h-16 px-4 md:px-6 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <button
            className="md:hidden mr-3 text-foreground"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="size-5" />
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <Button size="sm" className="gap-1.5 h-8" onClick={() => navigate('/trading')}>
              <Plus className="size-3.5" />
              <span className="hidden sm:inline">Add Trade</span>
            </Button>
            <Button variant="ghost" size="icon" className="size-8 relative">
              <Bell className="size-4" />
              <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-destructive" />
            </Button>
            <ModeToggle />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>

      <AiAssistantWidget />
    </div>
  )
}
