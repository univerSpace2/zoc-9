import { cn } from '@/lib/utils'
import type { MatchStatus, MeetingStatus, SetStatus } from '@/types/domain'

type Status = MatchStatus | MeetingStatus | SetStatus

const statusStyle: Record<Status, string> = {
  scheduled: 'bg-surface-300 text-surface-700',
  in_progress: 'bg-[#d1fc00]/20 text-[#516200]',
  completed: 'bg-[#0c0f10] text-white',
  planned: 'bg-surface-200 text-surface-700',
  pending: 'bg-[#FEF3C7] text-[#92400E]',
  ignored: 'bg-surface-200 text-surface-600',
}

const statusLabel: Record<Status, string> = {
  scheduled: '예정',
  in_progress: '진행중',
  completed: '완료',
  planned: '대기',
  pending: '대기',
  ignored: '무시됨',
}

export function StatusChip({ status, emphasize = false }: { status: Status; emphasize?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex min-h-8 items-center rounded-full px-3.5 text-sm font-bold tracking-wide',
        emphasize ? 'shadow-[0_20px_40px_rgba(44,47,48,0.06)]' : '',
        statusStyle[status],
      )}
    >
      {statusLabel[status]}
    </span>
  )
}
