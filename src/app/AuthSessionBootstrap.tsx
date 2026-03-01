import { useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import { useLocalDataMode } from '@/lib/env'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth-store'
import type { Profile } from '@/types/domain'

function profileFromAuthUser(user: User): Profile {
  return {
    id: user.id,
    email: user.email ?? '',
    name:
      typeof user.user_metadata?.name === 'string' && user.user_metadata.name.length > 0
        ? user.user_metadata.name
        : (user.email?.split('@')[0] ?? '사용자'),
    phone: typeof user.user_metadata?.phone === 'string' ? user.user_metadata.phone : '',
    bankAccount: undefined,
  }
}

async function loadProfile(user: User): Promise<Profile> {
  if (!supabase) {
    return profileFromAuthUser(user)
  }

  const fallback = profileFromAuthUser(user)

  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, name, phone, bank_account')
    .eq('id', user.id)
    .maybeSingle()

  if (error || !data) {
    const upsertPayload = {
      id: user.id,
      email: user.email ?? fallback.email,
      name: fallback.name,
      phone: fallback.phone,
    }

    const { data: upserted } = await supabase
      .from('profiles')
      .upsert(upsertPayload, { onConflict: 'id' })
      .select('id, email, name, phone, bank_account')
      .maybeSingle()

    if (!upserted) {
      return fallback
    }

    return {
      id: upserted.id,
      email: upserted.email ?? fallback.email,
      name: upserted.name,
      phone: upserted.phone,
      bankAccount: upserted.bank_account ?? undefined,
    }
  }

  return {
    id: data.id,
    email: data.email ?? fallback.email,
    name: data.name,
    phone: data.phone,
    bankAccount: data.bank_account ?? undefined,
  }
}

export function AuthSessionBootstrap() {
  const setUser = useAuthStore((state) => state.setUser)
  const clearUser = useAuthStore((state) => state.clearUser)
  const setInitialized = useAuthStore((state) => state.setInitialized)

  useEffect(() => {
    let active = true

    const applyUser = async (user: User | null): Promise<void> => {
      if (!active) {
        return
      }

      if (!user) {
        clearUser()
        return
      }

      const profile = await loadProfile(user)

      if (!active) {
        return
      }

      setUser(profile)
    }

    if (useLocalDataMode || !supabase) {
      setInitialized(true)
      return () => {
        active = false
      }
    }

    void supabase.auth
      .getSession()
      .then(async ({ data }) => {
        await applyUser(data.session?.user ?? null)
      })
      .finally(() => {
        if (active) {
          setInitialized(true)
        }
      })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void applyUser(session?.user ?? null)
      if (active) {
        setInitialized(true)
      }
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [clearUser, setInitialized, setUser])

  return null
}
