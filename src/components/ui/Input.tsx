import type { InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
  helperText?: string
}

export function Input({ label, className, error, helperText, ...props }: InputProps) {
  return (
    <label className="flex w-full flex-col gap-2 text-sm font-semibold text-text-secondary">
      <span className="leading-tight">{label}</span>
      <input
        className={cn(
          'min-h-14 w-full rounded-[0.75rem] bg-surface-200 ring-1 ring-[#abadae]/15 px-4 py-2 text-base leading-snug text-text-primary outline-none transition focus:ring-2 focus:ring-[#516200]/30',
          error && 'ring-2 ring-danger/30 focus:ring-danger/30',
          className,
        )}
        {...props}
      />
      <span className={cn('min-h-6 text-sm', error ? 'font-semibold text-danger' : 'text-surface-600')}>
        {error ?? helperText ?? ' '}
      </span>
    </label>
  )
}
