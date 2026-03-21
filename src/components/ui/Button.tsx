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
    'bg-[linear-gradient(135deg,#516200_0%,#d1fc00_100%)] text-[#0c0f10] shadow-[0_20px_40px_rgba(44,47,48,0.06)] hover:brightness-95 active:translate-y-px',
  secondary:
    'bg-surface-300 text-[#0c0f10] shadow-[0_20px_40px_rgba(44,47,48,0.06)] hover:bg-surface-400 active:translate-y-px',
  neutral: 'bg-surface-200 text-text-primary hover:bg-surface-300 active:translate-y-px',
  danger:
    'bg-danger text-white shadow-[0_20px_40px_rgba(44,47,48,0.06)] hover:brightness-90 active:translate-y-px',
}

const sizeClass: Record<Size, string> = {
  sm: 'min-h-12 px-4 text-sm',
  md: 'min-h-14 px-5 text-base',
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
        'inline-flex items-center justify-center rounded-[0.75rem] font-semibold tracking-wide transition duration-150 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#d1fc00]/40 disabled:cursor-not-allowed disabled:opacity-50',
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
