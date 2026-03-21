import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { PageFrame } from '@/components/layout/PageFrame'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ERR } from '@/lib/constants'
import { apiAcceptInvite, apiDeclineInvite, apiGetInvite, queryKeys } from '@/services/api'
import { useAuthStore } from '@/store/auth-store'

export function InvitePage() {
  const { token } = useParams<{ token: string }>()
  const user = useAuthStore((state) => state.user)

  const inviteQuery = useQuery({
    queryKey: queryKeys.inviteByToken(token ?? ''),
    queryFn: () => apiGetInvite(token ?? ''),
    enabled: Boolean(token),
  })

  const acceptMutation = useMutation({
    mutationFn: async () => {
      if (!token || !user) {
        throw new Error(ERR.LOGIN_REQUIRED)
      }

      await apiAcceptInvite(user.id, token)
    },
    onSuccess: () => inviteQuery.refetch(),
  })

  const declineMutation = useMutation({
    mutationFn: async () => {
      if (!token) {
        throw new Error('잘못된 초대 링크입니다.')
      }

      await apiDeclineInvite(token)
    },
    onSuccess: () => inviteQuery.refetch(),
  })

  const payload = inviteQuery.data

  return (
    <PageFrame className="space-y-4 pt-6">
      <Card className="space-y-4" tone="elevated">
        <h1 className="font-display text-4xl leading-none tracking-[0.03em]">초대 확인</h1>

        {inviteQuery.isLoading ? <p className="text-base">초대 정보를 불러오는 중...</p> : null}

        {!payload && !inviteQuery.isLoading ? (
          <p className="text-base font-semibold text-danger">유효하지 않은 초대 링크입니다.</p>
        ) : null}

        {payload ? (
          <div className="space-y-2 rounded-2xl bg-surface-50 p-3 text-base">
            <p>
              <span className="font-semibold">그룹:</span> {payload.groupName}
            </p>
            <p>
              <span className="font-semibold">초대자:</span> {payload.inviterName}
            </p>
            <p>
              <span className="font-semibold">권한:</span> {payload.invite.role}
            </p>
            <p>
              <span className="font-semibold">만료:</span>{' '}
              {payload.isExpired ? '만료됨' : new Date(payload.invite.expiresAt).toLocaleString('ko-KR')}
            </p>
            <p>
              <span className="font-semibold">상태:</span> {payload.invite.status}
            </p>
          </div>
        ) : null}

        {!user ? (
          <div className="space-y-2">
            <p className="text-base">수락하려면 로그인 또는 회원가입이 필요합니다.</p>
            <div className="grid grid-cols-2 gap-2">
              <Link to="/login">
                <Button fullWidth size="md" intent="primary">
                  로그인
                </Button>
              </Link>
              <Link to="/signup">
                <Button fullWidth size="md" intent="secondary">
                  회원가입
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Button
              fullWidth
              onClick={() => acceptMutation.mutate()}
              disabled={acceptMutation.isPending || payload?.invite.status !== 'pending'}
              size="md"
            >
              수락
            </Button>
            <Button
              intent="danger"
              fullWidth
              onClick={() => declineMutation.mutate()}
              disabled={declineMutation.isPending || payload?.invite.status !== 'pending'}
              size="md"
            >
              거절
            </Button>
          </div>
        )}

        {acceptMutation.error ? <p className="text-base text-danger">{(acceptMutation.error as Error).message}</p> : null}
        {declineMutation.error ? <p className="text-base text-danger">{(declineMutation.error as Error).message}</p> : null}
      </Card>
    </PageFrame>
  )
}
