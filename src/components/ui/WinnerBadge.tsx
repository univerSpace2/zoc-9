interface WinnerBadgeProps {
  teamName?: string
  compact?: boolean
}

export function WinnerBadge({ teamName, compact = false }: WinnerBadgeProps) {
  if (!teamName) {
    return null
  }

  return (
    <span
      className={`inline-flex items-center rounded-full bg-[#d1fc00]/15 font-bold text-[#516200] ${
        compact ? 'min-h-8 px-3 text-sm' : 'min-h-10 px-4 text-base'
      }`}
    >
      승리팀: {teamName}
    </span>
  )
}
