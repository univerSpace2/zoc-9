import { cn } from '@/lib/utils'

interface TeamScoreRowProps {
  label: string
  score: number
  serving?: boolean
  winner?: boolean
}

function TeamScoreRow({ label, score, serving = false, winner = false }: TeamScoreRowProps) {
  return (
    <div
      className={cn(
        'flex min-h-[84px] items-center justify-between rounded-2xl border px-4 py-3',
        winner ? 'border-winner/35 bg-[#ECFDF3]' : 'border-surface-200 bg-surface-50',
      )}
    >
      <div className="space-y-1">
        <p className="text-2xl font-black tracking-wide text-text-primary">{label}</p>
        <p className="text-sm font-semibold text-surface-700">
          {winner ? '세트 승리' : serving ? '현재 서브' : '리시브'}
        </p>
      </div>
      <p className={cn('font-display text-[2.8rem] leading-none', winner ? 'text-winner' : 'text-text-primary')}>{score}</p>
    </div>
  )
}

interface ScoreBoardProps {
  teamAName: string
  teamBName: string
  teamAScore: number
  teamBScore: number
  servingTeam?: 'A' | 'B'
  winnerTeam?: 'A' | 'B'
}

export function ScoreBoard({
  teamAName,
  teamBName,
  teamAScore,
  teamBScore,
  servingTeam,
  winnerTeam,
}: ScoreBoardProps) {
  return (
    <div className="space-y-2">
      <TeamScoreRow
        label={teamAName}
        score={teamAScore}
        serving={servingTeam === 'A'}
        winner={winnerTeam === 'A'}
      />
      <TeamScoreRow
        label={teamBName}
        score={teamBScore}
        serving={servingTeam === 'B'}
        winner={winnerTeam === 'B'}
      />
    </div>
  )
}
