import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/lib/supabase'
import type { User, Session } from '@supabase/supabase-js'

type AuthState = {
  user: User | null
  session: Session | null
  profile: Profile | null
  loading: boolean
  setUser: (user: User | null) => void
  setSession: (session: Session | null) => void
  setProfile: (profile: Profile | null) => void
  setLoading: (loading: boolean) => void
  fetchProfile: (userId: string) => Promise<void>
  signOut: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  session: null,
  profile: null,
  loading: true,
  setUser: (user) => set({ user }),
  setSession: (session) => set({ session }),
  setProfile: (profile) => set({ profile }),
  setLoading: (loading) => set({ loading }),
  fetchProfile: async (userId) => {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
    if (error) {
      set({ profile: null })
      return
    }
    if (!data) {
      const { data: inserted, error: upsertError } = await supabase
        .from('profiles')
        .upsert({
          id: userId,
          full_name: '',
          currency: 'INR',
          starting_capital: 4184,
          monthly_target: 20920,
          max_daily_loss: 1255.2,
          onboarding_completed: false,
        }, { onConflict: 'id' })
        .select('*')
        .maybeSingle()
      if (upsertError) {
        set({ profile: null })
        return
      }
      set({ profile: inserted ?? null })
      return
    }
    set({ profile: data })
  },
  signOut: async () => {
    await supabase.auth.signOut()
    set({ user: null, session: null, profile: null })
  },
}))
