import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { PageFrame } from '@/components/layout/PageFrame'
import { Button } from '@/components/ui/Button'
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
    <PageFrame className="space-y-6 pt-6 pb-32">
      {/* Header */}
      <div className="px-1">
        <h1 className="font-display text-2xl font-bold tracking-tight">그룹 선택</h1>
        <p className="mt-1 text-sm text-surface-600">참여 중인 그룹을 선택하거나 새 그룹을 만들 수 있습니다.</p>
      </div>

      {/* My Groups */}
      {groupsQuery.data?.length ? (
        <section className="space-y-3">
          {groupsQuery.data.map((group) => (
            <Link key={group.id} to={`/g/${group.id}/meetings`} className="block">
              <div className="flex items-center justify-between rounded-xl bg-surface-50 px-5 py-4 shadow-[0_20px_40px_rgba(44,47,48,0.06)] transition active:translate-y-px">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#d1fc00]/20 font-display text-lg font-bold text-[#516200]">
                    {group.name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-lg font-bold text-text-primary">{group.name}</p>
                    <p className="text-xs text-surface-600">
                      생성일 {new Date(group.createdAt).toLocaleDateString('ko-KR')}
                    </p>
                  </div>
                </div>
                <span className="text-surface-400">→</span>
              </div>
            </Link>
          ))}
        </section>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-xl bg-surface-50 py-12 shadow-[0_20px_40px_rgba(44,47,48,0.06)]">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-200">
            <span className="text-2xl text-surface-600">👥</span>
          </div>
          <p className="text-base font-semibold text-surface-700">참여 중인 그룹이 없습니다.</p>
          <p className="mt-1 text-sm text-surface-600">초대 코드로 참여하거나 새 그룹을 만들어 보세요.</p>
        </div>
      )}

      {/* Invite Code */}
      <section className="rounded-xl bg-surface-50 p-5 shadow-[0_20px_40px_rgba(44,47,48,0.06)]">
        <h2 className="mb-3 font-display text-lg font-bold">초대 코드로 참여</h2>
        <form className="space-y-3" onSubmit={submitInviteToken}>
          <Input label="초대 코드" error={errors.inviteToken?.message} {...register('inviteToken')} />
          <Button type="submit" intent="primary" fullWidth size="lg" disabled={acceptInviteMutation.isPending}>
            {acceptInviteMutation.isPending ? '참여 처리 중...' : '코드로 참여'}
          </Button>
          {acceptInviteMutation.error ? (
            <p className="text-sm text-danger">{(acceptInviteMutation.error as Error).message}</p>
          ) : null}
        </form>
      </section>

      {/* Received Invites */}
      {receivedInvitesQuery.data?.length ? (
        <section className="space-y-3">
          <h2 className="px-1 font-display text-lg font-bold">받은 초대</h2>
          {receivedInvitesQuery.data.map((item) => (
            <div key={item.invite.id} className="rounded-xl bg-surface-50 px-5 py-4 shadow-[0_20px_40px_rgba(44,47,48,0.06)]">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-lg font-bold text-text-primary">{item.groupName}</p>
                  <p className="mt-0.5 text-xs text-surface-600">
                    초대자 {item.inviterName} · {item.invite.role}
                  </p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  item.invite.status === 'pending'
                    ? 'bg-[#d1fc00]/20 text-[#516200]'
                    : 'bg-surface-200 text-surface-600'
                }`}>
                  {item.invite.status === 'pending' ? '대기중' : item.invite.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-surface-600">
                만료 {new Date(item.invite.expiresAt).toLocaleString('ko-KR')} {item.isExpired ? '(만료됨)' : ''}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button
                  fullWidth
                  disabled={item.invite.status !== 'pending' || acceptInviteMutation.isPending}
                  onClick={() => acceptInviteMutation.mutate(item.invite.token)}
                  size="sm"
                >
                  수락
                </Button>
                <Button
                  intent="neutral"
                  fullWidth
                  disabled={item.invite.status !== 'pending' || declineInviteMutation.isPending}
                  onClick={() => declineInviteMutation.mutate(item.invite.token)}
                  size="sm"
                >
                  거절
                </Button>
              </div>
            </div>
          ))}
        </section>
      ) : null}

      {/* Create Group */}
      <section className="rounded-xl bg-surface-50 p-5 shadow-[0_20px_40px_rgba(44,47,48,0.06)]">
        <h2 className="mb-3 font-display text-lg font-bold">새 그룹 만들기</h2>
        <form className="space-y-3" onSubmit={handleSubmit((values) => createGroupMutation.mutate(values))}>
          <Input label="그룹 이름" error={errors.name?.message} {...register('name')} />
          {createGroupMutation.error ? (
            <p className="text-sm text-danger">{(createGroupMutation.error as Error).message}</p>
          ) : null}
          <Button type="submit" intent="secondary" fullWidth size="lg" disabled={createGroupMutation.isPending}>
            {createGroupMutation.isPending ? '생성 중...' : '그룹 생성'}
          </Button>
        </form>
      </section>
    </PageFrame>
  )
}
