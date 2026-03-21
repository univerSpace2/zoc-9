import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'

export function NavigationProgress() {
  const location = useLocation()
  const [progress, setProgress] = useState(0)
  const [visible, setVisible] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    // Start progress
    setVisible(true)
    setProgress(30)

    const t1 = setTimeout(() => setProgress(60), 50)
    const t2 = setTimeout(() => setProgress(80), 150)
    const t3 = setTimeout(() => setProgress(100), 250)
    const t4 = setTimeout(() => setVisible(false), 500)

    timerRef.current = t4

    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
      clearTimeout(t4)
    }
  }, [location.pathname])

  if (!visible) {
    return null
  }

  return (
    <div className="fixed inset-x-0 top-0 z-[100]">
      <div
        className="h-[3px] transition-all duration-200 ease-out"
        style={{
          width: `${progress}%`,
          background: 'linear-gradient(135deg, #516200 0%, #d1fc00 100%)',
          opacity: progress >= 100 ? 0 : 1,
        }}
      />
    </div>
  )
}
