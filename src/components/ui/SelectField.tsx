import { Check, ChevronDown, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

export interface SelectOption {
  value: string
  label: string
  description?: string
}

interface SelectFieldProps {
  value?: string
  options: SelectOption[]
  onChange: (value: string) => void
  placeholder?: string
  label?: string
  disabled?: boolean
  error?: string
}

export function SelectField({
  value,
  options,
  onChange,
  placeholder = '선택하세요',
  label,
  disabled = false,
  error,
}: SelectFieldProps) {
  const [open, setOpen] = useState(false)
  const selected = useMemo(() => options.find((option) => option.value === value), [options, value])

  useEffect(() => {
    if (!open) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open])

  return (
    <div className="space-y-2">
      {label ? <p className="text-base font-semibold text-text-secondary">{label}</p> : null}
      <button
        type="button"
        disabled={disabled}
        className={cn(
          'inline-flex min-h-14 w-full items-center justify-between gap-3 rounded-[0.75rem] bg-surface-200 ring-1 ring-[#abadae]/15 px-4 text-left text-lg font-semibold text-text-primary transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#d1fc00]/40 disabled:cursor-not-allowed disabled:opacity-60',
          open && 'ring-2 ring-[#516200]/30',
          error && 'ring-2 ring-danger/30 focus-visible:ring-danger/30',
        )}
        onClick={() => setOpen(true)}
        aria-label={label ?? placeholder}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className={cn(!selected && 'text-surface-600')}>{selected?.label ?? placeholder}</span>
        <ChevronDown className="h-5 w-5 text-surface-700" aria-hidden />
      </button>
      <span className={cn('block min-h-6 text-sm', error ? 'font-semibold text-danger' : 'text-surface-600')}>
        {error ?? ' '}
      </span>

      {open
        ? createPortal(
            <div className="fixed inset-0 z-[80]">
              <button
                type="button"
                className="absolute inset-0 bg-surface-900/45"
                aria-label="선택 창 닫기"
                onClick={() => setOpen(false)}
              />
              <div
                role="dialog"
                aria-modal="true"
                className="absolute inset-x-0 bottom-0 rounded-t-xl bg-surface-50 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_20px_40px_rgba(44,47,48,0.06)]"
              >
                <div className="flex items-center justify-between px-5 py-4">
                  <p className="text-xl font-bold text-text-primary">{label ?? '옵션 선택'}</p>
                  <button
                    type="button"
                    className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-[0.75rem] bg-surface-200 text-surface-700"
                    onClick={() => setOpen(false)}
                    aria-label="닫기"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="max-h-[65vh] space-y-2 overflow-y-auto px-4 pb-1">
                  {options.map((option) => {
                    const active = option.value === value
                    return (
                      <button
                        type="button"
                        key={option.value}
                        className={cn(
                          'flex min-h-[54px] w-full items-center justify-between gap-3 rounded-[0.75rem] px-4 py-2 text-left transition',
                          active ? 'bg-[#d1fc00]/15' : 'bg-surface-200',
                        )}
                        onClick={() => {
                          onChange(option.value)
                          setOpen(false)
                        }}
                      >
                        <span>
                          <span className="block text-lg font-semibold text-text-primary">{option.label}</span>
                          {option.description ? (
                            <span className="mt-0.5 block text-sm text-surface-600">{option.description}</span>
                          ) : null}
                        </span>
                        {active ? <Check className="h-5 w-5 text-primary" aria-hidden /> : null}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
