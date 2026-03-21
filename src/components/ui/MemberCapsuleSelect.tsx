import { Check } from 'lucide-react'
import { useMemo } from 'react'
import { cn } from '@/lib/utils'

type TeamTone = 'a' | 'b'

interface MemberCapsule {
  id: string
  name: string
}

interface MemberCapsuleSelectProps {
  title: string
  members: MemberCapsule[]
  selectedIds: string[]
  disabledIds: Set<string>
  maxSelectable: number
  teamTone: TeamTone
  onToggle?: (memberId: string) => void
  onPressMember?: (memberId: string) => void
  positionByMemberId?: Record<string, number>
  error?: string
  testId?: string
}

const teamToneClass: Record<TeamTone, string> = {
  a: 'bg-[#d1fc00]/20 text-[#516200]',
  b: 'bg-[#0059b6]/15 text-[#0059b6]',
}

export function MemberCapsuleSelect({
  title,
  members,
  selectedIds,
  disabledIds,
  maxSelectable,
  teamTone,
  onToggle,
  onPressMember,
  positionByMemberId,
  error,
  testId,
}: MemberCapsuleSelectProps) {
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])

  return (
    <section data-testid={testId} className="space-y-2 rounded-2xl bg-surface-100 px-3 py-3" aria-label={title}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-text-primary">{title}</p>
        <p className="text-xs font-semibold text-surface-600">
          {selectedIds.length}/{maxSelectable}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {members.map((member) => {
          const selected = selectedSet.has(member.id)
          const disabled = disabledIds.has(member.id)
          const disabledReason = disabled && !selected ? '배정됨' : null

          return (
            <button
              key={member.id}
              type="button"
              data-member-id={member.id}
              aria-pressed={selected}
              aria-disabled={disabled}
              disabled={disabled}
              onClick={() => (onPressMember ?? onToggle)?.(member.id)}
              className={cn(
                'inline-flex min-h-12 items-center gap-1 rounded-full px-3 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#d1fc00]/40 disabled:cursor-not-allowed disabled:opacity-55',
                selected ? teamToneClass[teamTone] : 'bg-surface-200 text-text-primary',
              )}
              data-position-no={positionByMemberId?.[member.id] ?? undefined}
            >
              {selected ? <Check className="h-4 w-4" aria-hidden /> : null}
              <span>{member.name}</span>
              {selected && positionByMemberId?.[member.id] ? (
                <span className="rounded-full bg-surface-50/85 px-2 py-0.5 text-[11px] font-bold text-surface-800">
                  {positionByMemberId[member.id]}번
                </span>
              ) : null}
              {disabledReason ? <span className="text-[11px] text-surface-600">({disabledReason})</span> : null}
            </button>
          )
        })}
      </div>

      {error ? <p className="text-sm font-semibold text-danger">{error}</p> : null}
    </section>
  )
}
