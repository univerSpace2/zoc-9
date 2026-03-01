import { create } from 'zustand'
import { uiRevampEnabled } from '@/lib/env'
import type { AccessibilityScale } from '@/types/domain'

interface UiState {
  uiRevampEnabled: boolean
  fontScale: AccessibilityScale
  motionReduced: boolean
  syncingOfflineQueue: boolean
  setUiRevampEnabled: (value: boolean) => void
  setFontScale: (value: AccessibilityScale) => void
  setMotionReduced: (value: boolean) => void
  setSyncingOfflineQueue: (value: boolean) => void
}

export const useUiStore = create<UiState>((set) => ({
  uiRevampEnabled,
  fontScale: 1,
  motionReduced: false,
  syncingOfflineQueue: false,
  setUiRevampEnabled: (value) => set({ uiRevampEnabled: value }),
  setFontScale: (value) => set({ fontScale: value }),
  setMotionReduced: (value) => set({ motionReduced: value }),
  setSyncingOfflineQueue: (value) => set({ syncingOfflineQueue: value }),
}))
