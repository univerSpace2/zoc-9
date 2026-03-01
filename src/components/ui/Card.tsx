import type { HTMLAttributes, PropsWithChildren } from 'react'
import { cn } from '@/lib/utils'

type CardTone = 'default' | 'elevated' | 'info' | 'warning'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  tone?: CardTone
}

const toneClass: Record<CardTone, string> = {
  default: 'border-surface-200 bg-surface',
  elevated: 'border-primary/20 bg-surface shadow-[0_24px_42px_-30px_rgba(15,23,42,0.5)]',
  info: 'border-primary/30 bg-[linear-gradient(145deg,rgba(29,78,216,0.08),rgba(255,255,255,0.95))]',
  warning: 'border-warning/35 bg-[linear-gradient(145deg,rgba(180,83,9,0.08),rgba(255,255,255,0.95))]',
}

export function Card({ children, className, tone = 'default', ...props }: PropsWithChildren<CardProps>) {
  return (
    <div
      className={cn(
        'rounded-[1.75rem] border p-4 shadow-[0_20px_34px_-30px_rgba(15,23,42,0.65)] backdrop-blur-sm sm:p-5',
        toneClass[tone],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}
