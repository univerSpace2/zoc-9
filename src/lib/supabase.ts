import { createClient } from '@supabase/supabase-js'
import { env, supabaseEnabled } from '@/lib/env'

export const supabase = supabaseEnabled
  ? createClient(env.supabaseUrl!, env.supabaseAnonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null
