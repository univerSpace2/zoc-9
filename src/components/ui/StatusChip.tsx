import { cn } from '@/lib/utils'
import type { MatchStatus, MeetingStatus, SetStatus } from '@/types/domain'

type Status = MatchStatus | MeetingStatus | SetStatus

const statusStyle: Record<Status, string> = {
  scheduled: 'bg-[#DBEAFE] text-[#1E3A8A]',
  in_progress: 'bg-[#D1FAE5] text-[#065F46]',
  completed: 'bg-[#0B1220] text-white',
  planned: 'bg-[#E0E7FF] text-[#1E3A8A]',
  pending: 'bg-[#FEF3C7] text-[#92400E]',
  ignored: 'bg-[#E5E7EB] text-[#374151]',
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
        emphasize ? 'shadow-[0_12px_24px_-20px_rgba(15,23,42,0.8)]' : '',
        statusStyle[status],
      )}
    >
      {statusLabel[status]}
    </span>
  )
}
