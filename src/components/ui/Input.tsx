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
          'min-h-[52px] w-full rounded-2xl border border-surface-300 bg-surface px-4 py-2 text-base leading-snug text-text-primary outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/20',
          error && 'border-danger focus:border-danger focus:ring-danger/15',
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
