import type { ButtonHTMLAttributes, PropsWithChildren } from 'react'
import { cn } from '@/lib/utils'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Intent = 'primary' | 'secondary' | 'neutral' | 'danger'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  intent?: Intent
  size?: Size
  variant?: Variant
  fullWidth?: boolean
}

const intentClass: Record<Intent, string> = {
  primary:
    'bg-primary text-white shadow-[0_14px_28px_-18px_rgba(29,78,216,0.8)] hover:bg-primary-strong active:translate-y-px',
  secondary:
    'bg-live text-white shadow-[0_14px_28px_-18px_rgba(5,150,105,0.8)] hover:bg-[#047857] active:translate-y-px',
  neutral: 'border border-surface-300 bg-surface text-text-primary hover:bg-surface-50 active:translate-y-px',
  danger:
    'bg-danger text-white shadow-[0_14px_28px_-18px_rgba(220,38,38,0.8)] hover:bg-[#b91c1c] active:translate-y-px',
}

const sizeClass: Record<Size, string> = {
  sm: 'min-h-12 px-4 text-sm',
  md: 'min-h-[52px] px-5 text-base',
  lg: 'min-h-14 px-6 text-lg',
}

const variantToIntent: Record<Variant, Intent> = {
  primary: 'primary',
  secondary: 'secondary',
  ghost: 'neutral',
  danger: 'danger',
}

export function Button({
  children,
  className,
  intent,
  size = 'md',
  variant = 'primary',
  fullWidth,
  type = 'button',
  ...props
}: PropsWithChildren<ButtonProps>) {
  const resolvedIntent = intent ?? variantToIntent[variant]

  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center rounded-2xl font-semibold tracking-wide transition duration-150 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50',
        intentClass[resolvedIntent],
        sizeClass[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}
