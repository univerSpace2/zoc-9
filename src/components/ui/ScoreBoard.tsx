import { Minus, Plus } from 'lucide-react'
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
        'flex min-h-[84px] items-center justify-between rounded-xl px-4 py-3',
        winner ? 'bg-[#d1fc00]/15' : 'bg-surface-200',
      )}
    >
      <div className="space-y-1">
        <p className="text-2xl font-black tracking-wide text-text-primary">{label}</p>
        <p className="text-sm font-semibold text-surface-700">
          {winner ? '세트 승리' : serving ? '현재 서브' : '리시브'}
        </p>
      </div>
      <p className={cn('font-display text-[3.5rem] leading-none', winner ? 'text-[#516200]' : 'text-text-primary')}>
        {score}
      </p>
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

interface ScoreBoardLiveProps {
  teamAName: string
  teamBName: string
  teamAScore: number
  teamBScore: number
  servingTeam?: 'A' | 'B'
  winnerTeam?: 'A' | 'B'
  onScoreA?: () => void
  onScoreB?: () => void
  disabled?: boolean
}

function LiveTeamPanel({
  name,
  score,
  serving,
  winner,
  onScore,
  disabled,
}: {
  name: string
  score: number
  serving?: boolean
  winner?: boolean
  onScore?: () => void
  disabled?: boolean
}) {
  return (
    <div
      className={cn(
        'flex flex-1 flex-col items-center gap-2 rounded-xl px-3 py-4',
        winner ? 'bg-[#d1fc00]/15' : 'bg-surface-200',
      )}
    >
      {serving ? (
        <span className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-widest text-[#516200]">
          <span className="inline-block h-2 w-2 rounded-full bg-[#516200]" />
          SERVING
        </span>
      ) : (
        <span className="h-4" />
      )}
      <p className="text-sm font-bold text-surface-700">{name}</p>
      <p
        aria-live="polite"
        aria-atomic="true"
        aria-label={`${name} 점수 ${score}`}
        className={cn(
          'font-display text-[3.5rem] leading-none tabular-nums',
          winner ? 'text-[#516200]' : 'text-text-primary',
        )}
      >
        {String(score).padStart(2, '0')}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={disabled}
          className="inline-flex h-11 w-11 items-center justify-center rounded-[0.75rem] bg-[#d1fc00] text-[#0c0f10] transition hover:brightness-95 active:translate-y-px disabled:opacity-40"
          aria-label={`${name} 감점`}
        >
          <Minus className="h-5 w-5" strokeWidth={3} />
        </button>
        <button
          type="button"
          onClick={onScore}
          disabled={disabled}
          className="inline-flex h-11 w-11 items-center justify-center rounded-[0.75rem] bg-[#d1fc00] text-[#0c0f10] transition hover:brightness-95 active:translate-y-px disabled:opacity-40"
          aria-label={`${name} 득점`}
        >
          <Plus className="h-5 w-5" strokeWidth={3} />
        </button>
      </div>
    </div>
  )
}

export function ScoreBoardLive({
  teamAName,
  teamBName,
  teamAScore,
  teamBScore,
  servingTeam,
  winnerTeam,
  onScoreA,
  onScoreB,
  disabled,
}: ScoreBoardLiveProps) {
  return (
    <div className="flex gap-3">
      <LiveTeamPanel
        name={teamAName}
        score={teamAScore}
        serving={servingTeam === 'A'}
        winner={winnerTeam === 'A'}
        onScore={onScoreA}
        disabled={disabled}
      />
      <LiveTeamPanel
        name={teamBName}
        score={teamBScore}
        serving={servingTeam === 'B'}
        winner={winnerTeam === 'B'}
        onScore={onScoreB}
        disabled={disabled}
      />
    </div>
  )
}
