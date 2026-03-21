import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { PageFrame } from '@/components/layout/PageFrame'
import { SubPageHeader } from '@/components/layout/SubPageHeader'
import { Card } from '@/components/ui/Card'
import { apiListAuditLogs, queryKeys } from '@/services/api'

export function GroupAuditPage() {
  const { groupId } = useParams<{ groupId: string }>()

  const auditQuery = useQuery({
    queryKey: queryKeys.auditLogs(groupId ?? ''),
    queryFn: () => apiListAuditLogs(groupId ?? ''),
    enabled: Boolean(groupId),
  })

  if (!groupId) {
    return null
  }

  return (
    <PageFrame className="space-y-4 pt-6">
      <SubPageHeader title="감사로그" />

      <Card className="space-y-3">
        {auditQuery.data?.length ? (
          auditQuery.data.map((log) => (
            <div key={log.id} className="rounded-xl bg-surface-200 px-3 py-2 text-sm">
              <p className="font-semibold">{log.action}</p>
              <p>
                {log.entityType} / {log.entityId}
              </p>
              <p>{new Date(log.createdAt).toLocaleString('ko-KR')}</p>
            </div>
          ))
        ) : (
          <p className="text-base text-surface-700">감사로그가 없습니다.</p>
        )}
      </Card>
    </PageFrame>
  )
}
