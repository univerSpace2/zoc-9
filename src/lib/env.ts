export const env = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string | undefined,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
  dataMode: (import.meta.env.VITE_DATA_MODE as 'supabase' | 'local' | undefined) ?? 'supabase',
  uiRevamp: (import.meta.env.VITE_UI_REVAMP as string | undefined) ?? 'true',
}

export const supabaseEnabled = Boolean(env.supabaseUrl && env.supabaseAnonKey)
export const useLocalDataMode = env.dataMode === 'local' || !supabaseEnabled
export const uiRevampEnabled = env.uiRevamp.toLowerCase() !== 'false'
