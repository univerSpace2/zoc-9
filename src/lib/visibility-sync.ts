import { useEffect } from 'react'

export function useVisibilityAndOnlineSync(onSync: () => void): void {
  useEffect(() => {
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') {
        onSync()
      }
    }

    const onOnline = (): void => {
      onSync()
    }

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('online', onOnline)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('online', onOnline)
    }
  }, [onSync])
}
