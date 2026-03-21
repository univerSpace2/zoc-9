import { cn } from '@/lib/utils'

interface DeuceBadgeProps {
  state: 'deuce' | 'advantage'
  teamName?: string
}

export function DeuceBadge({ state, teamName }: DeuceBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex min-h-10 items-center rounded-full px-4 text-base font-extrabold',
        state === 'deuce' ? 'bg-[#FEF3C7] text-warning' : 'bg-[#d1fc00]/20 text-[#516200]',
      )}
    >
      {state === 'deuce' ? '듀스' : `어드밴티지 ${teamName ?? ''}`.trim()}
    </span>
  )
}
