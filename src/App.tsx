import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { AppLayout } from '@/components/layout/AppLayout'
import { LandingPage } from '@/pages/LandingPage'
import { AuthPage } from '@/pages/AuthPage'
import { OnboardingPage } from '@/pages/OnboardingPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { TradingPage } from '@/pages/TradingPage'
import { ExpensesPage } from '@/pages/ExpensesPage'
import { AnalyticsPage } from '@/pages/AnalyticsPage'
import { BrokersPage } from '@/pages/BrokersPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { Toaster } from '@/components/ui/sonner'

function FullScreenSpinner({ label }: { label: string }) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuthStore()
  if (loading) {
    return <FullScreenSpinner label="Loading TradeTrackr..." />
  }
  if (!user) return <Navigate to="/auth" replace />
  if (!profile) {
    return <FullScreenSpinner label="Setting up your account…" />
  }
  if (!profile.onboarding_completed) return <Navigate to="/onboarding" replace />
  return <>{children}</>
}

/** Requires auth; sends finished users to dashboard; blocks guests. */
function OnboardingRoute({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuthStore()
  if (loading) {
    return <FullScreenSpinner label="Loading TradeTrackr..." />
  }
  if (!user) return <Navigate to="/auth" replace />
  if (!profile) {
    return <FullScreenSpinner label="Setting up your account…" />
  }
  if (profile.onboarding_completed) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

export function App() {
  const { setUser, setSession, setLoading, setProfile, fetchProfile } = useAuthStore()

  useEffect(() => {
    let cancelled = false

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchProfile(session.user.id).finally(() => {
          if (!cancelled) setLoading(false)
        })
      } else {
        setLoading(false)
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      setUser(session?.user ?? null)

      if (event === 'SIGNED_OUT' || !session?.user) {
        setProfile(null)
        setLoading(false)
        return
      }

      // Keep ProtectedRoute on the setup spinner until profile is ready
      // (avoids a brief !user / auth flash during late session updates).
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        const currentProfile = useAuthStore.getState().profile
        if (!currentProfile || currentProfile.id !== session.user.id) {
          setProfile(null)
        }
        void fetchProfile(session.user.id)
      }
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [setUser, setSession, setLoading, setProfile, fetchProfile])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route
          path="/onboarding"
          element={
            <OnboardingRoute>
              <OnboardingPage />
            </OnboardingRoute>
          }
        />
        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/trading" element={<TradingPage />} />
          <Route path="/trading/:month" element={<TradingPage />} />
          <Route path="/expenses" element={<ExpensesPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/brokers" element={<BrokersPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster richColors position="top-right" />
    </BrowserRouter>
  )
}

export default App
