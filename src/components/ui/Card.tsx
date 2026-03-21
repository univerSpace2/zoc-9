import type { HTMLAttributes, PropsWithChildren } from 'react'
import { cn } from '@/lib/utils'

type CardTone = 'default' | 'elevated' | 'info' | 'warning'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  tone?: CardTone
}

const toneClass: Record<CardTone, string> = {
  default: 'bg-surface-50',
  elevated: 'bg-surface-50 shadow-[0_20px_40px_rgba(44,47,48,0.06)]',
  info: 'bg-surface-200',
  warning: 'bg-[#FFF8F0]',
}

export function Card({ children, className, tone = 'default', ...props }: PropsWithChildren<CardProps>) {
  return (
    <div
      className={cn(
        'rounded-xl p-4 shadow-[0_20px_40px_rgba(44,47,48,0.06)] sm:p-5',
        toneClass[tone],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}
