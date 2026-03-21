import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'

interface AdminScoreEditorProps {
  teamAName: string
  teamBName: string
  manualScore: { teamA: string; teamB: string }
  onScoreChange: (score: { teamA: string; teamB: string }) => void
  onSubmit: () => void
  isPending: boolean
  error: string | null
}

export function AdminScoreEditor({
  teamAName,
  teamBName,
  manualScore,
  onScoreChange,
  onSubmit,
  isPending,
  error,
}: AdminScoreEditorProps) {
  return (
    <Card className="space-y-3 bg-danger/5">
      <h2 className="text-2xl font-black">관리자 예외 수정</h2>
      <div className="grid grid-cols-2 gap-2">
        <Input
          label={`${teamAName} 점수`}
          type="number"
          value={manualScore.teamA}
          onChange={(event) => onScoreChange({ ...manualScore, teamA: event.target.value })}
        />
        <Input
          label={`${teamBName} 점수`}
          type="number"
          value={manualScore.teamB}
          onChange={(event) => onScoreChange({ ...manualScore, teamB: event.target.value })}
        />
      </div>
      <Button intent="danger" size="lg" fullWidth onClick={onSubmit} disabled={isPending}>
        완료 기록 수정
      </Button>
      {error ? <p className="text-base text-danger">{error}</p> : null}
    </Card>
  )
}
