import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

interface QueryErrorProps {
  message?: string
  onRetry?: () => void
}

export function QueryError({ message = '데이터를 불러오는 중 오류가 발생했습니다.', onRetry }: QueryErrorProps) {
  return (
    <Card tone="warning" className="space-y-2">
      <p className="text-base font-semibold text-warning">{message}</p>
      {onRetry ? (
        <Button intent="neutral" size="sm" onClick={onRetry}>
          다시 시도
        </Button>
      ) : null}
    </Card>
  )
}
