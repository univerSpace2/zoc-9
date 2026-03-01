import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy } from 'lucide-react'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { useParams } from 'react-router-dom'
import { PageFrame } from '@/components/layout/PageFrame'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { SelectField } from '@/components/ui/SelectField'
import {
  apiCancelInvite,
  apiCreateInvite,
  apiHasPermission,
  apiListGroupMemberPositionStats,
  apiListInvites,
  apiListMembers,
  apiResetMemberPermissions,
  apiReissueInvite,
  apiRemoveMember,
  apiUpdateMemberPermissions,
  apiUpdateMemberRole,
  queryKeys,
} from '@/services/api'
import { useAuthStore } from '@/store/auth-store'
import type { PermissionKey, Role } from '@/types/domain'

const inviteSchema = z.object({
  role: z.enum(['admin', 'member']),
  invitedEmail: z.string().email('유효한 이메일을 입력하세요.').optional().or(z.literal('')),
  expiresInDays: z.coerce.number().int().min(1).max(30),
})

type InviteFormValues = z.infer<typeof inviteSchema>
type InviteFormInput = z.input<typeof inviteSchema>

const permissionOptions: PermissionKey[] = [
  'manage_members',
  'manage_invites',
  'manage_venues',
  'manage_notices',
  'close_meeting',
  'edit_completed_records',
]

const permissionLabel: Record<PermissionKey, string> = {
  manage_members: '멤버 관리',
  manage_invites: '초대 관리',
  manage_venues: '구장 관리',
  manage_notices: '공지 관리',
  close_meeting: '모임 완료',
  edit_completed_records: '완료기록 수정',
}

export function GroupMembersPage() {
  const { groupId } = useParams<{ groupId: string }>()
  const user = useAuthStore((state) => state.user)
  const queryClient = useQueryClient()
  const [memberError, setMemberError] = useState<string | null>(null)

  const membersQuery = useQuery({
    queryKey: queryKeys.members(groupId ?? ''),
    queryFn: () => apiListMembers(groupId ?? ''),
    enabled: Boolean(groupId),
  })

  const invitesQuery = useQuery({
    queryKey: queryKeys.invites(groupId ?? ''),
    queryFn: () => apiListInvites(groupId ?? ''),
    enabled: Boolean(groupId),
  })

  const manageMembersPermissionQuery = useQuery({
    queryKey: ['permission', user?.id, groupId, 'manage_members'],
    queryFn: () => apiHasPermission(user!.id, groupId!, 'manage_members'),
    enabled: Boolean(user && groupId),
  })

  const manageInvitesPermissionQuery = useQuery({
    queryKey: ['permission', user?.id, groupId, 'manage_invites'],
    queryFn: () => apiHasPermission(user!.id, groupId!, 'manage_invites'),
    enabled: Boolean(user && groupId),
  })

  const positionStatsQuery = useQuery({
    queryKey: queryKeys.memberPositionStats(groupId ?? ''),
    queryFn: () => apiListGroupMemberPositionStats(groupId ?? ''),
    enabled: Boolean(groupId),
  })

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors },
  } = useForm<InviteFormInput, unknown, InviteFormValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: {
      role: 'member',
      invitedEmail: '',
      expiresInDays: 7,
    },
  })
  const selectedInviteRole =
    useWatch({
      control,
      name: 'role',
    }) ?? 'member'

  const inviteMutation = useMutation({
    mutationFn: async (values: InviteFormValues) => {
      if (!user || !groupId) {
        throw new Error('유효한 사용자/그룹이 필요합니다.')
      }

      return apiCreateInvite(user.id, {
        groupId,
        role: values.role,
        invitedEmail: values.invitedEmail?.trim() || undefined,
        expiresInDays: values.expiresInDays,
      })
    },
    onSuccess: async () => {
      reset({ role: 'member', invitedEmail: '', expiresInDays: 7 })
      await queryClient.invalidateQueries({ queryKey: queryKeys.invites(groupId ?? '') })
    },
  })

  const roleMutation = useMutation({
    mutationFn: async (payload: { targetProfileId: string; role: Exclude<Role, 'owner'> }) => {
      if (!groupId || !user) {
        throw new Error('유효한 사용자/그룹이 필요합니다.')
      }

      await apiUpdateMemberRole(user.id, groupId, payload.targetProfileId, payload.role)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.members(groupId ?? '') })
    },
  })

  const permissionMutation = useMutation({
    mutationFn: async (payload: { targetProfileId: string; permissions: PermissionKey[] }) => {
      if (!groupId || !user) {
        throw new Error('유효한 사용자/그룹이 필요합니다.')
      }

      await apiUpdateMemberPermissions(user.id, groupId, payload.targetProfileId, payload.permissions)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.members(groupId ?? '') })
    },
  })

  const resetPermissionMutation = useMutation({
    mutationFn: async (targetProfileId: string) => {
      if (!groupId || !user) {
        throw new Error('유효한 사용자/그룹이 필요합니다.')
      }

      await apiResetMemberPermissions(user.id, groupId, targetProfileId)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.members(groupId ?? '') })
    },
  })

  const removeMemberMutation = useMutation({
    mutationFn: async (targetProfileId: string) => {
      if (!groupId || !user) {
        throw new Error('유효한 사용자/그룹이 필요합니다.')
      }

      await apiRemoveMember(user.id, groupId, targetProfileId)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.members(groupId ?? '') })
    },
  })

  const cancelInviteMutation = useMutation({
    mutationFn: async (inviteId: string) => {
      if (!user) {
        throw new Error('로그인이 필요합니다.')
      }

      await apiCancelInvite(user.id, inviteId)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.invites(groupId ?? '') })
    },
  })

  const reissueInviteMutation = useMutation({
    mutationFn: async (inviteId: string) => {
      if (!user) {
        throw new Error('로그인이 필요합니다.')
      }

      await apiReissueInvite(user.id, inviteId, 7)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.invites(groupId ?? '') })
    },
  })

  if (!groupId) {
    return null
  }

  const canManageMembers = Boolean(manageMembersPermissionQuery.data)
  const canManageInvites = Boolean(manageInvitesPermissionQuery.data)

  return (
    <PageFrame className="space-y-4 pt-6">
      <Card className="space-y-3" tone="elevated">
        <h1 className="font-display text-4xl leading-none tracking-[0.03em]">멤버</h1>
        <p className="text-base text-surface-700">멤버 역할, 권한, 초대를 관리합니다.</p>
      </Card>

      {canManageInvites ? (
        <Card className="space-y-3" tone="info">
          <h2 className="text-2xl font-black">멤버 초대</h2>
          <form className="space-y-3" onSubmit={handleSubmit((values) => inviteMutation.mutate(values))}>
            <div className="grid grid-cols-2 gap-2">
              <SelectField
                label="부여 역할"
                value={selectedInviteRole}
                options={[
                  { value: 'member', label: 'member' },
                  { value: 'admin', label: 'admin' },
                ]}
                onChange={(value) => setValue('role', value as 'member' | 'admin', { shouldDirty: true, shouldValidate: true })}
              />
              <Input
                label="만료일수"
                type="number"
                min={1}
                max={30}
                error={errors.expiresInDays?.message}
                {...register('expiresInDays', { valueAsNumber: true })}
              />
            </div>
            <Input
              label="초대 이메일 (선택)"
              placeholder="example@domain.com"
              error={errors.invitedEmail?.message}
              {...register('invitedEmail')}
            />
            {inviteMutation.error ? <p className="text-base text-danger">{(inviteMutation.error as Error).message}</p> : null}
            <Button type="submit" intent="secondary" size="lg" fullWidth disabled={inviteMutation.isPending}>
              {inviteMutation.isPending ? '초대 생성 중...' : '초대 생성'}
            </Button>
          </form>
        </Card>
      ) : null}

      <Card className="space-y-2">
        <h2 className="text-2xl font-black">멤버 목록</h2>
        {membersQuery.data?.length ? (
          membersQuery.data.map((member) => {
            const editableRole = member.role !== 'owner' && canManageMembers
            const editablePermissions = member.role !== 'owner' && canManageMembers
            const removable = member.role !== 'owner' && canManageMembers && member.profileId !== user?.id
            const memberStats =
              positionStatsQuery.data?.filter((item) => item.profileId === member.profileId) ?? []

            return (
              <div key={member.id} className="space-y-2 rounded-2xl border border-surface-200 bg-surface-50 px-3 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xl font-black">{member.profile.name}</p>
                    <p className="text-sm uppercase tracking-wide text-surface-600">{member.role}</p>
                  </div>
                  <button
                    className="rounded-xl border border-surface-200 bg-surface px-3"
                    onClick={async () => {
                      await navigator.clipboard.writeText(`${member.profile.phone} / ${member.profile.bankAccount ?? '-'}`)
                    }}
                    aria-label="연락처 복사"
                  >
                    <Copy className="h-5 w-5" />
                  </button>
                </div>

                <p className="text-sm text-surface-700">전화번호: {member.profile.phone}</p>
                <p className="text-sm text-surface-700">계좌번호: {member.profile.bankAccount ?? '-'}</p>

                {editableRole ? (
                  <div className="grid grid-cols-2 gap-2">
                    <SelectField
                      label="역할 변경"
                      value={member.role}
                      options={[
                        { value: 'member', label: 'member' },
                        { value: 'admin', label: 'admin' },
                      ]}
                      onChange={(value) =>
                        roleMutation.mutate(
                          { targetProfileId: member.profileId, role: value as Exclude<Role, 'owner'> },
                          {
                            onError: (error) => setMemberError((error as Error).message),
                          },
                        )
                      }
                    />
                    {removable ? (
                      <Button
                        intent="danger"
                        className="mt-auto"
                        size="md"
                        onClick={() => {
                          removeMemberMutation.mutate(member.profileId, {
                            onError: (error) => setMemberError((error as Error).message),
                          })
                        }}
                        disabled={removeMemberMutation.isPending}
                      >
                        멤버 제거
                      </Button>
                    ) : (
                      <div />
                    )}
                  </div>
                ) : null}

                {editablePermissions ? (
                  <div className="rounded-xl bg-white p-2">
                    <p className="mb-1 text-sm font-semibold">권한 토글</p>
                    <p className="mb-2 text-xs text-surface-600">
                      현재 모드: {member.permissionsOverride ? '개별 오버라이드' : '역할 기본값'}
                    </p>
                    <div className="grid grid-cols-2 gap-1">
                      {permissionOptions.map((permission) => {
                        const checked = member.permissions.includes(permission)
                        return (
                          <label key={permission} className="flex min-h-10 items-center gap-2 text-sm">
                            <input
                              className="h-4 w-4"
                              type="checkbox"
                              checked={checked}
                              onChange={(event) => {
                                const nextPermissions = event.target.checked
                                  ? [...member.permissions, permission]
                                  : member.permissions.filter((item) => item !== permission)

                                permissionMutation.mutate(
                                  {
                                    targetProfileId: member.profileId,
                                    permissions: Array.from(new Set(nextPermissions)),
                                  },
                                  {
                                    onError: (error) => setMemberError((error as Error).message),
                                  },
                                )
                              }}
                            />
                            {permissionLabel[permission]}
                          </label>
                        )
                      })}
                    </div>
                    <div className="mt-2">
                      <Button
                        intent="neutral"
                        className="w-full"
                        size="sm"
                        onClick={() =>
                          resetPermissionMutation.mutate(member.profileId, {
                            onError: (error) => setMemberError((error as Error).message),
                          })
                        }
                        disabled={resetPermissionMutation.isPending || !member.permissionsOverride}
                      >
                        역할 기본값으로 복원
                      </Button>
                    </div>
                  </div>
                ) : null}

                <div className="rounded-xl bg-white p-2">
                  <p className="mb-1 text-sm font-semibold">포지션 승률</p>
                  {memberStats.length > 0 ? (
                    <div className="space-y-1">
                      {memberStats.map((stat) => (
                        <p key={`${stat.profileId}-${stat.teamSize}-${stat.positionNo}`} className="text-sm text-surface-700">
                          {stat.teamSize}인 {stat.positionNo}번: {stat.wins}승 {stat.losses}패 ({stat.winRate}%)
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-surface-600">완료 매치 기준 데이터가 없습니다.</p>
                  )}
                </div>
              </div>
            )
          })
        ) : (
          <p className="text-base text-surface-700">등록된 멤버가 없습니다.</p>
        )}
        {memberError ? <p className="text-base text-danger">{memberError}</p> : null}
      </Card>

      <Card className="space-y-2">
        <h2 className="text-2xl font-black">초대 목록</h2>
        {invitesQuery.data?.length ? (
          invitesQuery.data.map((invite) => (
            <div key={invite.id} className="rounded-xl border border-surface-200 bg-surface-50 px-3 py-2 text-sm">
              <p className="font-semibold">
                역할 {invite.role} · 상태 {invite.status}
              </p>
              <p className="break-all">토큰: {invite.token}</p>
              <p>만료: {new Date(invite.expiresAt).toLocaleString('ko-KR')}</p>
              {canManageInvites ? (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Button
                    intent="neutral"
                    size="sm"
                    onClick={() => cancelInviteMutation.mutate(invite.id)}
                    disabled={invite.status !== 'pending' || cancelInviteMutation.isPending}
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
              ) : null}
            </div>
          ))
        ) : (
          <p className="text-base text-surface-700">생성된 초대가 없습니다.</p>
        )}
      </Card>
    </PageFrame>
  )
}
