import { Check, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

interface PositionPickerSheetProps {
  open: boolean
  title: string
  maxPosition: number
  selectedPositionNo?: number
  occupancyByPosition?: Record<number, string>
  allowClear?: boolean
  clearLabel?: string
  onSelect: (positionNo: number) => void
  onClear?: () => void
  onClose: () => void
}

export function PositionPickerSheet({
  open,
  title,
  maxPosition,
  selectedPositionNo,
  occupancyByPosition = {},
  allowClear = false,
  clearLabel = '선택 해제',
  onSelect,
  onClear,
  onClose,
}: PositionPickerSheetProps) {
  if (!open) {
    return null
  }

  const options = Array.from({ length: maxPosition }, (_, index) => index + 1)

  return createPortal(
    <div className="fixed inset-0 z-[90]">
      <button type="button" className="absolute inset-0 bg-surface-900/45" aria-label="포지션 선택 닫기" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className="absolute inset-x-0 bottom-0 rounded-t-[1.75rem] border-t border-surface-200 bg-surface pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-28px_44px_-30px_rgba(15,23,42,0.45)]"
      >
        <div className="flex items-center justify-between px-5 py-4">
          <p className="text-xl font-bold text-text-primary">{title}</p>
          <button
            type="button"
            className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-2xl border border-surface-200 bg-surface-50 text-surface-700"
            onClick={onClose}
            aria-label="닫기"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[65vh] space-y-2 overflow-y-auto px-4 pb-1">
          {options.map((positionNo) => {
            const active = selectedPositionNo === positionNo
            const occupiedBy = occupancyByPosition[positionNo]

            return (
              <button
                type="button"
                key={positionNo}
                className={cn(
                  'flex min-h-[54px] w-full items-center justify-between gap-3 rounded-2xl border px-4 py-2 text-left transition',
                  active ? 'border-primary bg-primary/10' : 'border-surface-200 bg-surface-50',
                )}
                onClick={() => {
                  onSelect(positionNo)
                  onClose()
                }}
              >
                <span>
                  <span className="block text-lg font-semibold text-text-primary">{positionNo}번</span>
                  {occupiedBy ? <span className="mt-0.5 block text-sm text-surface-600">현재: {occupiedBy}</span> : null}
                </span>
                {active ? <Check className="h-5 w-5 text-primary" aria-hidden /> : null}
              </button>
            )
          })}
          {allowClear ? (
            <button
              type="button"
              className="mt-2 flex min-h-[52px] w-full items-center justify-center rounded-2xl border border-danger/30 bg-danger/10 px-4 py-2 text-base font-semibold text-danger"
              onClick={() => {
                onClear?.()
                onClose()
              }}
            >
              {clearLabel}
            </button>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  )
}
