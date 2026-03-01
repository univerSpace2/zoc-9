import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/types/domain'

interface AuthState {
  user: Profile | null
  initialized: boolean
  setUser: (profile: Profile) => void
  clearUser: () => void
  setInitialized: (value: boolean) => void
  signOut: () => Promise<void>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      initialized: false,
      setUser: (profile) => set({ user: profile }),
      clearUser: () => set({ user: null }),
      setInitialized: (value) => set({ initialized: value }),
      signOut: async () => {
        if (supabase) {
          await supabase.auth.signOut()
        }

        set({ user: null })
      },
    }),
    {
      name: 'zoc9-auth-v1',
      version: 1,
      partialize: (state) => ({
        user: state.user,
      }),
    },
  ),
)
