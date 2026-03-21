import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { PageFrame } from '@/components/layout/PageFrame'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import {
  apiAcceptInvite,
  apiCreateGroup,
  apiDeclineInvite,
  apiListGroups,
  apiListReceivedInvites,
  queryKeys,
} from '@/services/api'
import { ERR } from '@/lib/constants'
import { useAuthStore } from '@/store/auth-store'

const schema = z.object({
  name: z.string().min(2, '그룹 이름은 2자 이상 입력하세요.'),
  inviteToken: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

export function GroupSelectPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)

  const groupsQuery = useQuery({
    queryKey: queryKeys.groups(user?.id ?? ''),
    queryFn: () => apiListGroups(user!.id),
    enabled: Boolean(user),
  })

  const receivedInvitesQuery = useQuery({
    queryKey: queryKeys.receivedInvites(user?.id ?? ''),
    queryFn: () => apiListReceivedInvites(user!.id),
    enabled: Boolean(user),
  })

  useEffect(() => {
    if (groupsQuery.data && groupsQuery.data.length === 1) {
      navigate(`/g/${groupsQuery.data[0].id}/meetings`, { replace: true })
    }
  }, [groupsQuery.data, navigate])

  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      inviteToken: '',
    },
  })

  const createGroupMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!user) {
        throw new Error(ERR.LOGIN_REQUIRED)
      }

      return apiCreateGroup(user.id, values.name)
    },
    onSuccess: async (group) => {
      reset({ name: '', inviteToken: '' })
      await queryClient.invalidateQueries({ queryKey: queryKeys.groups(user!.id) })
      navigate(`/g/${group.id}/meetings`)
    },
  })

  const acceptInviteMutation = useMutation({
    mutationFn: async (token: string) => {
      if (!user) {
        throw new Error(ERR.LOGIN_REQUIRED)
      }

      await apiAcceptInvite(user.id, token)
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.groups(user!.id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.receivedInvites(user!.id) }),
      ])
    },
  })

  const declineInviteMutation = useMutation({
    mutationFn: async (token: string) => {
      await apiDeclineInvite(token)
    },
    onSuccess: async () => {
      if (!user) {
        return
      }

      await queryClient.invalidateQueries({ queryKey: queryKeys.receivedInvites(user.id) })
    },
  })

  const submitInviteToken = handleSubmit(async (values) => {
    const token = values.inviteToken?.trim()

    if (!token) {
      setError('inviteToken', { message: '초대 코드를 입력하세요.' })
      return
    }

    try {
      await acceptInviteMutation.mutateAsync(token)
      reset({ name: values.name, inviteToken: '' })
    } catch (error) {
      setError('inviteToken', { message: (error as Error).message })
    }
  })

  return (
    <PageFrame className="space-y-4 pt-6">
      <Card className="space-y-3" tone="elevated">
        <h1 className="font-display text-4xl leading-none tracking-[0.03em]">그룹 선택</h1>
        <p className="text-base text-surface-700">참여 중인 그룹을 선택하거나 새 그룹을 만들 수 있습니다.</p>

        {groupsQuery.data?.length ? (
          <div className="space-y-2">
            {groupsQuery.data.map((group) => (
              <Link key={group.id} to={`/g/${group.id}/meetings`} className="block">
                <Card className="rounded-2xl px-3 py-3 transition hover:-translate-y-0.5">
                  <p className="text-xl font-bold">{group.name}</p>
                  <p className="text-sm text-surface-600">생성일 {new Date(group.createdAt).toLocaleDateString('ko-KR')}</p>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-base text-surface-600">현재 참여 중인 그룹이 없습니다.</p>
        )}
      </Card>

      <Card className="space-y-3" tone="info">
        <h2 className="text-2xl font-black">초대 코드로 참여</h2>
        <form className="space-y-3" onSubmit={submitInviteToken}>
          <Input label="초대 코드" error={errors.inviteToken?.message} {...register('inviteToken')} />
          <Button type="submit" intent="primary" fullWidth size="lg" disabled={acceptInviteMutation.isPending}>
            {acceptInviteMutation.isPending ? '참여 처리 중...' : '코드로 참여'}
          </Button>
          {acceptInviteMutation.error ? (
            <p className="text-base text-danger">{(acceptInviteMutation.error as Error).message}</p>
          ) : null}
        </form>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-2xl font-black">받은 초대</h2>
        {receivedInvitesQuery.data?.length ? (
          <div className="space-y-2">
            {receivedInvitesQuery.data.map((item) => (
              <div key={item.invite.id} className="rounded-xl bg-surface-200 px-3 py-3">
                <p className="text-xl font-bold">{item.groupName}</p>
                <p className="text-sm text-surface-600">
                  초대자 {item.inviterName} · 권한 {item.invite.role} · 상태 {item.invite.status}
                </p>
                <p className="text-sm text-surface-600">
                  만료 {new Date(item.invite.expiresAt).toLocaleString('ko-KR')} {item.isExpired ? '(만료됨)' : ''}
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Button
                    fullWidth
                    disabled={item.invite.status !== 'pending' || acceptInviteMutation.isPending}
                    onClick={() => acceptInviteMutation.mutate(item.invite.token)}
                    size="md"
                  >
                    수락
                  </Button>
                  <Button
                    intent="neutral"
                    fullWidth
                    disabled={item.invite.status !== 'pending' || declineInviteMutation.isPending}
                    onClick={() => declineInviteMutation.mutate(item.invite.token)}
                    size="md"
                  >
                    거절
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-base text-surface-700">받은 초대가 없습니다.</p>
        )}
      </Card>

      <Card className="space-y-3">
        <h2 className="text-2xl font-black">새 그룹 만들기</h2>
        <form className="space-y-3" onSubmit={handleSubmit((values) => createGroupMutation.mutate(values))}>
          <Input label="그룹 이름" error={errors.name?.message} {...register('name')} />
          {createGroupMutation.error ? (
            <p className="text-base text-danger">{(createGroupMutation.error as Error).message}</p>
          ) : null}
          <Button type="submit" intent="secondary" fullWidth size="lg" disabled={createGroupMutation.isPending}>
            {createGroupMutation.isPending ? '생성 중...' : '그룹 생성'}
          </Button>
        </form>
      </Card>
    </PageFrame>
  )
}
