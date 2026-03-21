import type { PropsWithChildren } from 'react'
import { cn } from '@/lib/utils'

interface FloatingControllerProps {
  className?: string
}

export function FloatingController({ children, className }: PropsWithChildren<FloatingControllerProps>) {
  return (
    <div
      className={cn(
        'fixed inset-x-0 bottom-0 z-50 glass rounded-t-xl px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-10px_40px_rgba(44,47,48,0.08)]',
        className,
      )}
    >
      <div className="mx-auto max-w-md">{children}</div>
    </div>
  )
}
