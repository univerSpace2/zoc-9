import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { PageFrame } from '@/components/layout/PageFrame'
import { SubPageHeader } from '@/components/layout/SubPageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import {
  apiCancelInvite,
  apiHasPermission,
  apiListInvites,
  apiReissueInvite,
  queryKeys,
} from '@/services/api'
import { ERR } from '@/lib/constants'
import { useAuthStore } from '@/store/auth-store'

export function GroupInvitesPage() {
  const { groupId } = useParams<{ groupId: string }>()
  const user = useAuthStore((state) => state.user)
  const queryClient = useQueryClient()

  const invitesQuery = useQuery({
    queryKey: queryKeys.invites(groupId ?? ''),
    queryFn: () => apiListInvites(groupId ?? ''),
    enabled: Boolean(groupId),
  })

  const manageInvitesPermissionQuery = useQuery({
    queryKey: queryKeys.permission(user?.id ?? '', groupId ?? '', 'manage_invites'),
    queryFn: () => apiHasPermission(user!.id, groupId!, 'manage_invites'),
    enabled: Boolean(user && groupId),
  })

  const cancelInviteMutation = useMutation({
    mutationFn: async (inviteId: string) => {
      if (!user) {
        throw new Error(ERR.LOGIN_REQUIRED)
      }

      await apiCancelInvite(user.id, inviteId)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.invites(groupId ?? '') })
      await queryClient.invalidateQueries({ queryKey: queryKeys.auditLogs(groupId ?? '') })
    },
  })

  const reissueInviteMutation = useMutation({
    mutationFn: async (inviteId: string) => {
      if (!user) {
        throw new Error(ERR.LOGIN_REQUIRED)
      }

      await apiReissueInvite(user.id, inviteId, 7)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.invites(groupId ?? '') })
      await queryClient.invalidateQueries({ queryKey: queryKeys.auditLogs(groupId ?? '') })
    },
  })

  if (!groupId) {
    return null
  }

  const canManageInvites = Boolean(manageInvitesPermissionQuery.data)

  return (
    <PageFrame className="space-y-4 pt-6">
      <SubPageHeader title="초대 관리" />

      <Card className="space-y-3">
        {invitesQuery.data?.length ? (
          invitesQuery.data.map((invite) => (
            <div key={invite.id} className="rounded-xl bg-surface-200 px-3 py-2 text-xs">
              <p className="font-semibold">역할: {invite.role}</p>
              <p>상태: {invite.status}</p>
              <p className="break-all">토큰: {invite.token}</p>
              <p>만료: {new Date(invite.expiresAt).toLocaleString('ko-KR')}</p>
              {canManageInvites ? (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Button
                    intent="neutral"
                    size="sm"
                    onClick={() => cancelInviteMutation.mutate(invite.id)}
                    disabled={cancelInviteMutation.isPending || invite.status !== 'pending'}
                  >
                    취소
                  </Button>
                  <Button
                    intent="secondary"
                    size="sm"
                    onClick={() => reissueInviteMutation.mutate(invite.id)}
                    disabled={reissueInviteMutation.isPending}
                  >
                    재발급
                  </Button>
                </div>
              ) : (
                <p className="mt-2 text-sm text-surface-600">초대 관리 권한이 없습니다.</p>
              )}
            </div>
          ))
        ) : (
          <p className="text-base text-surface-700">생성된 초대가 없습니다.</p>
        )}
      </Card>
    </PageFrame>
  )
}
