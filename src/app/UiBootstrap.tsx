import { useEffect } from 'react'
import { useUiStore } from '@/store/ui-store'

export function UiBootstrap() {
  const fontScale = useUiStore((state) => state.fontScale)
  const motionReduced = useUiStore((state) => state.motionReduced)
  const setMotionReduced = useUiStore((state) => state.setMotionReduced)

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setMotionReduced(media.matches)

    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [setMotionReduced])

  useEffect(() => {
    document.documentElement.style.setProperty('--app-font-scale', String(fontScale))
  }, [fontScale])

  useEffect(() => {
    document.documentElement.dataset.motionReduced = motionReduced ? 'true' : 'false'
  }, [motionReduced])

  return null
}
