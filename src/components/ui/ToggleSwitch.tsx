import { cn } from '@/lib/utils'

interface ToggleSwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description?: string
  disabled?: boolean
  id?: string
}

export function ToggleSwitch({ checked, onChange, label, description, disabled = false, id }: ToggleSwitchProps) {
  return (
    <div className="rounded-2xl border border-surface-200 bg-surface-50 px-3 py-3">
      <div className="flex min-h-12 items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="text-base font-semibold text-text-primary">{label}</p>
          {description ? <p className="text-sm text-surface-600">{description}</p> : null}
        </div>
        <button
          id={id}
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label={label}
          disabled={disabled}
          onClick={() => {
            if (!disabled) {
              onChange(!checked)
            }
          }}
          onKeyDown={(event) => {
            if (disabled) {
              return
            }

            if (event.key === ' ' || event.key === 'Enter') {
              event.preventDefault()
              onChange(!checked)
            }
          }}
          className={cn(
            'relative inline-flex h-8 w-14 items-center rounded-full transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-50',
            checked ? 'bg-primary' : 'bg-surface-300',
          )}
        >
          <span
            className={cn(
              'inline-block h-6 w-6 transform rounded-full bg-white shadow transition',
              checked ? 'translate-x-7' : 'translate-x-1',
            )}
          />
        </button>
      </div>
    </div>
  )
}
