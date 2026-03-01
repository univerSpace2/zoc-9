import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useParams } from 'react-router-dom'
import { z } from 'zod'
import { PageFrame } from '@/components/layout/PageFrame'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { SelectField } from '@/components/ui/SelectField'
import {
  apiCancelInvite,
  apiCreateNotice,
  apiCreateVenue,
  apiDeleteNotice,
  apiDeleteVenue,
  apiGetGroup,
  apiGetGroupMember,
  apiGetGroupPermissionPolicy,
  apiHasPermission,
  apiListAuditLogs,
  apiListInvites,
  apiListMembers,
  apiListNotices,
  apiListVenues,
  apiReissueInvite,
  apiTransferGroupOwner,
  apiUpdateGroupName,
  apiUpdateGroupPermissionPolicy,
  apiUpdateNotice,
  apiUpdateVenue,
  queryKeys,
} from '@/services/api'
import { useAuthStore } from '@/store/auth-store'
import type { PermissionKey } from '@/types/domain'

const groupSchema = z.object({
  name: z.string().min(2, '그룹 이름은 2자 이상 입력하세요.'),
})

const venueSchema = z.object({
  name: z.string().min(2, '구장 이름을 입력하세요.'),
  reservationRequired: z.boolean(),
  reservationUrl: z.string().url('올바른 URL을 입력하세요.').optional().or(z.literal('')),
})

const noticeSchema = z.object({
  title: z.string().min(2, '공지 제목을 입력하세요.'),
  body: z.string().min(2, '공지 내용을 입력하세요.'),
})

type GroupFormValues = z.infer<typeof groupSchema>
type VenueFormValues = z.infer<typeof venueSchema>
type NoticeFormValues = z.infer<typeof noticeSchema>

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

export function GroupMorePage() {
  const { groupId } = useParams<{ groupId: string }>()
  const user = useAuthStore((state) => state.user)
  const queryClient = useQueryClient()

  const groupQuery = useQuery({
    queryKey: queryKeys.group(groupId ?? ''),
    queryFn: () => apiGetGroup(groupId ?? ''),
    enabled: Boolean(groupId),
  })

  const venuesQuery = useQuery({
    queryKey: queryKeys.venues(groupId ?? ''),
    queryFn: () => apiListVenues(groupId ?? ''),
    enabled: Boolean(groupId),
  })

  const invitesQuery = useQuery({
    queryKey: queryKeys.invites(groupId ?? ''),
    queryFn: () => apiListInvites(groupId ?? ''),
    enabled: Boolean(groupId),
  })

  const noticesQuery = useQuery({
    queryKey: queryKeys.notices(groupId ?? ''),
    queryFn: () => apiListNotices(groupId ?? ''),
    enabled: Boolean(groupId),
  })

  const auditQuery = useQuery({
    queryKey: queryKeys.auditLogs(groupId ?? ''),
    queryFn: () => apiListAuditLogs(groupId ?? ''),
    enabled: Boolean(groupId),
  })

  const groupMemberQuery = useQuery({
    queryKey: ['groupMember', user?.id, groupId],
    queryFn: () => apiGetGroupMember(user!.id, groupId!),
    enabled: Boolean(user && groupId),
  })

  const membersQuery = useQuery({
    queryKey: queryKeys.members(groupId ?? ''),
    queryFn: () => apiListMembers(groupId ?? ''),
    enabled: Boolean(groupId),
  })

  const permissionPolicyQuery = useQuery({
    queryKey: queryKeys.groupPermissionPolicy(groupId ?? ''),
    queryFn: () => apiGetGroupPermissionPolicy(groupId ?? ''),
    enabled: Boolean(groupId),
  })

  const [ownerTransferTargetId, setOwnerTransferTargetId] = useState<string>('')

  const manageVenuesPermissionQuery = useQuery({
    queryKey: ['permission', user?.id, groupId, 'manage_venues'],
    queryFn: () => apiHasPermission(user!.id, groupId!, 'manage_venues'),
    enabled: Boolean(user && groupId),
  })

  const manageNoticesPermissionQuery = useQuery({
    queryKey: ['permission', user?.id, groupId, 'manage_notices'],
    queryFn: () => apiHasPermission(user!.id, groupId!, 'manage_notices'),
    enabled: Boolean(user && groupId),
  })

  const manageInvitesPermissionQuery = useQuery({
    queryKey: ['permission', user?.id, groupId, 'manage_invites'],
    queryFn: () => apiHasPermission(user!.id, groupId!, 'manage_invites'),
    enabled: Boolean(user && groupId),
  })

  const groupForm = useForm<GroupFormValues>({
    resolver: zodResolver(groupSchema),
    values: {
      name: groupQuery.data?.name ?? '',
    },
  })

  const venueForm = useForm<VenueFormValues>({
    resolver: zodResolver(venueSchema),
    defaultValues: {
      name: '',
      reservationRequired: false,
      reservationUrl: '',
    },
  })

  const noticeForm = useForm<NoticeFormValues>({
    resolver: zodResolver(noticeSchema),
    defaultValues: {
      title: '',
      body: '',
    },
  })

  const updateGroupMutation = useMutation({
    mutationFn: async (values: GroupFormValues) => {
      if (!groupId || !user) {
        throw new Error('유효한 사용자/그룹이 필요합니다.')
      }

      return apiUpdateGroupName(user.id, groupId, values.name)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.group(groupId ?? '') })
      await queryClient.invalidateQueries({ queryKey: queryKeys.groups(user?.id ?? '') })
      await queryClient.invalidateQueries({ queryKey: queryKeys.auditLogs(groupId ?? '') })
    },
  })

  const createVenueMutation = useMutation({
    mutationFn: async (values: VenueFormValues) => {
      if (!groupId || !user) {
        throw new Error('유효한 사용자/그룹이 필요합니다.')
      }

      return apiCreateVenue(user.id, {
        groupId,
        name: values.name,
        reservationRequired: values.reservationRequired,
        reservationUrl: values.reservationUrl?.trim() || undefined,
      })
    },
    onSuccess: async () => {
      venueForm.reset({ name: '', reservationRequired: false, reservationUrl: '' })
      await queryClient.invalidateQueries({ queryKey: queryKeys.venues(groupId ?? '') })
      await queryClient.invalidateQueries({ queryKey: queryKeys.auditLogs(groupId ?? '') })
    },
  })

  const updateVenueMutation = useMutation({
    mutationFn: async (payload: { id: string; name: string; reservationRequired: boolean; reservationUrl?: string }) => {
      if (!user) {
        throw new Error('로그인이 필요합니다.')
      }

      return apiUpdateVenue(user.id, payload.id, {
        name: payload.name,
        reservationRequired: payload.reservationRequired,
        reservationUrl: payload.reservationUrl,
      })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.venues(groupId ?? '') })
      await queryClient.invalidateQueries({ queryKey: queryKeys.auditLogs(groupId ?? '') })
    },
  })

  const deleteVenueMutation = useMutation({
    mutationFn: async (venueId: string) => {
      if (!user) {
        throw new Error('로그인이 필요합니다.')
      }

      await apiDeleteVenue(user.id, venueId)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.venues(groupId ?? '') })
      await queryClient.invalidateQueries({ queryKey: queryKeys.auditLogs(groupId ?? '') })
    },
  })

  const createNoticeMutation = useMutation({
    mutationFn: async (values: NoticeFormValues) => {
      if (!groupId || !user) {
        throw new Error('유효한 사용자/그룹이 필요합니다.')
      }

      return apiCreateNotice(user.id, {
        groupId,
        title: values.title,
        body: values.body,
      })
    },
    onSuccess: async () => {
      noticeForm.reset({ title: '', body: '' })
      await queryClient.invalidateQueries({ queryKey: queryKeys.notices(groupId ?? '') })
      await queryClient.invalidateQueries({ queryKey: queryKeys.auditLogs(groupId ?? '') })
    },
  })

  const updateNoticeMutation = useMutation({
    mutationFn: async (payload: { noticeId: string; title: string; body: string }) => {
      if (!user) {
        throw new Error('로그인이 필요합니다.')
      }

      return apiUpdateNotice(user.id, payload.noticeId, {
        title: payload.title,
        body: payload.body,
      })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.notices(groupId ?? '') })
      await queryClient.invalidateQueries({ queryKey: queryKeys.auditLogs(groupId ?? '') })
    },
  })

  const deleteNoticeMutation = useMutation({
    mutationFn: async (noticeId: string) => {
      if (!user) {
        throw new Error('로그인이 필요합니다.')
      }

      await apiDeleteNotice(user.id, noticeId)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.notices(groupId ?? '') })
      await queryClient.invalidateQueries({ queryKey: queryKeys.auditLogs(groupId ?? '') })
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
      await queryClient.invalidateQueries({ queryKey: queryKeys.auditLogs(groupId ?? '') })
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
      await queryClient.invalidateQueries({ queryKey: queryKeys.auditLogs(groupId ?? '') })
    },
  })

  const updatePermissionPolicyMutation = useMutation({
    mutationFn: async (payload: { admin: PermissionKey[]; member: PermissionKey[] }) => {
      if (!groupId || !user) {
        throw new Error('유효한 사용자/그룹이 필요합니다.')
      }

      return apiUpdateGroupPermissionPolicy(user.id, groupId, payload)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.groupPermissionPolicy(groupId ?? '') })
      await queryClient.invalidateQueries({ queryKey: queryKeys.members(groupId ?? '') })
      await queryClient.invalidateQueries({ queryKey: queryKeys.auditLogs(groupId ?? '') })
    },
  })

  const transferOwnerMutation = useMutation({
    mutationFn: async () => {
      if (!groupId || !user || !resolvedOwnerTransferTargetId) {
        throw new Error('위임 대상을 선택하세요.')
      }

      return apiTransferGroupOwner(user.id, groupId, resolvedOwnerTransferTargetId)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['groupMember', user?.id, groupId] })
      await queryClient.invalidateQueries({ queryKey: queryKeys.members(groupId ?? '') })
      await queryClient.invalidateQueries({ queryKey: queryKeys.groupPermissionPolicy(groupId ?? '') })
      await queryClient.invalidateQueries({ queryKey: queryKeys.auditLogs(groupId ?? '') })
    },
  })

  if (!groupId) {
    return null
  }

  const canUpdateGroupName = groupMemberQuery.data?.role === 'owner'
  const isOwner = groupMemberQuery.data?.role === 'owner'
  const canManageVenues = Boolean(manageVenuesPermissionQuery.data)
  const canManageNotices = Boolean(manageNoticesPermissionQuery.data)
  const canManageInvites = Boolean(manageInvitesPermissionQuery.data)
  const permissionPolicy = permissionPolicyQuery.data
  const ownerCandidates = (membersQuery.data ?? []).filter((member) => member.role !== 'owner')
  const resolvedOwnerTransferTargetId = ownerTransferTargetId || ownerCandidates[0]?.profileId || ''

  return (
    <PageFrame className="space-y-4 pt-6">
      <Card className="space-y-2" tone="elevated">
        <h1 className="font-display text-4xl leading-none tracking-[0.03em]">더보기</h1>
        <p className="text-base text-surface-700">그룹 설정, 초대/구장/공지 관리, 감사로그를 확인합니다.</p>
      </Card>

      <Card className="space-y-2">
        <h2 className="text-2xl font-black">그룹 설정</h2>
        {canUpdateGroupName ? (
          <form className="space-y-2" onSubmit={groupForm.handleSubmit((values) => updateGroupMutation.mutate(values))}>
            <Input label="그룹 이름" error={groupForm.formState.errors.name?.message} {...groupForm.register('name')} />
            {updateGroupMutation.error ? (
              <p className="text-sm text-red-600">{(updateGroupMutation.error as Error).message}</p>
            ) : null}
            <Button fullWidth size="lg" intent="primary" type="submit" disabled={updateGroupMutation.isPending}>
              그룹 이름 저장
            </Button>
          </form>
        ) : (
          <p className="text-base text-surface-700">그룹 이름 변경은 owner만 가능합니다.</p>
        )}
      </Card>

      <Card className="space-y-2">
        <h2 className="text-2xl font-black">권한 관리</h2>
        {isOwner ? (
          <div className="space-y-3">
            <div className="rounded-xl bg-surface-100 px-3 py-2 text-sm text-surface-700">
              owner 권한 템플릿은 고정이며, admin/member 템플릿만 수정할 수 있습니다.
            </div>
            {(['admin', 'member'] as const).map((role) => (
              <div key={role} className="rounded-xl border border-surface-200 bg-surface-50 px-3 py-2">
                <p className="mb-2 text-lg font-black">{role} 기본 권한</p>
                <div className="grid grid-cols-2 gap-1">
                  {permissionOptions.map((permission) => {
                    const checked = (permissionPolicy?.[role] ?? []).includes(permission)
                    return (
                      <label key={`${role}-${permission}`} className="flex min-h-10 items-center gap-2 text-sm">
                        <input
                          className="h-4 w-4"
                          type="checkbox"
                          checked={checked}
                          disabled={updatePermissionPolicyMutation.isPending}
                          onChange={(event) => {
                            const currentAdmin = [...(permissionPolicy?.admin ?? [])]
                            const currentMember = [...(permissionPolicy?.member ?? [])]
                            const current = role === 'admin' ? currentAdmin : currentMember
                            const next = event.target.checked
                              ? Array.from(new Set([...current, permission]))
                              : current.filter((item) => item !== permission)

                            updatePermissionPolicyMutation.mutate({
                              admin: role === 'admin' ? next : currentAdmin,
                              member: role === 'member' ? next : currentMember,
                            })
                          }}
                        />
                        {permissionLabel[permission]}
                      </label>
                    )
                  })}
                </div>
              </div>
            ))}
            {updatePermissionPolicyMutation.error ? (
              <p className="text-sm text-red-600">{(updatePermissionPolicyMutation.error as Error).message}</p>
            ) : null}
          </div>
        ) : (
          <p className="text-base text-surface-700">권한 정책 변경은 owner만 가능합니다.</p>
        )}
      </Card>

      <Card className="space-y-2">
        <h2 className="text-2xl font-black">그룹장 위임</h2>
        {isOwner ? (
          <div className="space-y-2">
            <SelectField
              label="위임 대상"
              value={resolvedOwnerTransferTargetId}
              onChange={setOwnerTransferTargetId}
              options={
                ownerCandidates.length > 0
                  ? ownerCandidates.map((member) => ({
                      value: member.profileId,
                      label: `${member.profile.name} (${member.role})`,
                    }))
                  : [{ value: '', label: '위임 가능한 멤버 없음' }]
              }
              disabled={ownerCandidates.length === 0}
            />
            <Button
              intent="danger"
              size="lg"
              fullWidth
              onClick={() => transferOwnerMutation.mutate()}
              disabled={transferOwnerMutation.isPending || ownerCandidates.length === 0 || !resolvedOwnerTransferTargetId}
            >
              그룹장 위임
            </Button>
            {transferOwnerMutation.error ? (
              <p className="text-sm text-red-600">{(transferOwnerMutation.error as Error).message}</p>
            ) : null}
          </div>
        ) : (
          <p className="text-base text-surface-700">그룹장 위임은 owner만 가능합니다.</p>
        )}
      </Card>

      <Card className="space-y-2">
        <h2 className="text-2xl font-black">구장 관리</h2>
        {canManageVenues ? (
          <form className="space-y-2" onSubmit={venueForm.handleSubmit((values) => createVenueMutation.mutate(values))}>
            <Input label="구장 이름" error={venueForm.formState.errors.name?.message} {...venueForm.register('name')} />
            <label className="flex min-h-[52px] items-center gap-2 rounded-xl bg-surface-100 px-3 py-2 text-base font-semibold">
              <input className="h-5 w-5" type="checkbox" {...venueForm.register('reservationRequired')} /> 예약 필요
            </label>
            <Input
              label="예약 URL (선택)"
              error={venueForm.formState.errors.reservationUrl?.message}
              {...venueForm.register('reservationUrl')}
            />
            {createVenueMutation.error ? (
              <p className="text-sm text-red-600">{(createVenueMutation.error as Error).message}</p>
            ) : null}
            <Button intent="secondary" size="lg" fullWidth type="submit" disabled={createVenueMutation.isPending}>
              구장 등록
            </Button>
          </form>
        ) : (
          <p className="text-base text-surface-700">구장 관리 권한이 없습니다.</p>
        )}

        {venuesQuery.data?.map((venue) => (
          <div key={venue.id} className="rounded-xl border border-surface-200 bg-surface-50 px-3 py-2 text-sm">
            <p className="font-semibold">{venue.name}</p>
            <p>예약 필요: {venue.reservationRequired ? '예' : '아니오'}</p>
            {venue.reservationUrl ? <p className="break-all text-xs">{venue.reservationUrl}</p> : null}
            {canManageVenues ? (
            <div className="mt-2 grid grid-cols-2 gap-2">
                <Button
                  intent="neutral"
                  size="sm"
                  onClick={() => {
                    const nextName = window.prompt('구장 이름', venue.name)
                    if (!nextName || nextName.trim().length < 2) {
                      return
                    }

                    const nextUrl = window.prompt('예약 URL (비워두면 없음)', venue.reservationUrl ?? '')

                    updateVenueMutation.mutate({
                      id: venue.id,
                      name: nextName.trim(),
                      reservationRequired: venue.reservationRequired,
                      reservationUrl: nextUrl?.trim() || undefined,
                    })
                  }}
                  disabled={updateVenueMutation.isPending}
                >
                  수정
                </Button>
                <Button
                  intent="danger"
                  size="sm"
                  onClick={() => deleteVenueMutation.mutate(venue.id)}
                  disabled={deleteVenueMutation.isPending}
                >
                  삭제
                </Button>
              </div>
            ) : null}
          </div>
        ))}
      </Card>

      <Card className="space-y-2">
        <h2 className="text-2xl font-black">공지 관리</h2>
        {canManageNotices ? (
          <form className="space-y-2" onSubmit={noticeForm.handleSubmit((values) => createNoticeMutation.mutate(values))}>
            <Input label="공지 제목" error={noticeForm.formState.errors.title?.message} {...noticeForm.register('title')} />
            <label className="flex flex-col gap-1 text-base font-semibold text-surface-700">
              <span>공지 내용</span>
              <textarea
                rows={4}
                className="w-full rounded-xl border border-surface-300 bg-white px-3 py-2 text-lg text-surface-900 outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/20"
                {...noticeForm.register('body')}
              />
              {noticeForm.formState.errors.body?.message ? (
                <span className="text-xs font-semibold text-red-600">{noticeForm.formState.errors.body.message}</span>
              ) : null}
            </label>
            {createNoticeMutation.error ? (
              <p className="text-sm text-red-600">{(createNoticeMutation.error as Error).message}</p>
            ) : null}
            <Button intent="secondary" size="lg" fullWidth type="submit" disabled={createNoticeMutation.isPending}>
              공지 등록
            </Button>
          </form>
        ) : (
          <p className="text-base text-surface-700">공지 관리 권한이 없습니다.</p>
        )}

        {noticesQuery.data?.map((notice) => (
          <div key={notice.id} className="rounded-xl border border-surface-200 bg-surface-50 px-3 py-2 text-sm">
            <p className="font-semibold">{notice.title}</p>
            <p className="whitespace-pre-wrap text-xs text-surface-700">{notice.body}</p>
            <p className="mt-1 text-xs text-surface-600">작성 {new Date(notice.createdAt).toLocaleString('ko-KR')}</p>
            {canManageNotices ? (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Button
                  intent="neutral"
                  size="sm"
                  onClick={() => {
                    const nextTitle = window.prompt('공지 제목', notice.title)
                    if (!nextTitle || nextTitle.trim().length < 2) {
                      return
                    }

                    const nextBody = window.prompt('공지 내용', notice.body)
                    if (!nextBody || nextBody.trim().length < 2) {
                      return
                    }

                    updateNoticeMutation.mutate({
                      noticeId: notice.id,
                      title: nextTitle.trim(),
                      body: nextBody.trim(),
                    })
                  }}
                  disabled={updateNoticeMutation.isPending}
                >
                  수정
                </Button>
                <Button
                  intent="danger"
                  size="sm"
                  onClick={() => deleteNoticeMutation.mutate(notice.id)}
                  disabled={deleteNoticeMutation.isPending}
                >
                  삭제
                </Button>
              </div>
            ) : null}
          </div>
        ))}
      </Card>

      <Card className="space-y-2">
        <h2 className="text-2xl font-black">초대 관리</h2>
        {invitesQuery.data?.length ? (
          invitesQuery.data.map((invite) => (
            <div key={invite.id} className="rounded-xl border border-surface-200 bg-surface-50 px-3 py-2 text-xs">
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

      <Card className="space-y-2">
        <h2 className="text-2xl font-black">감사로그</h2>
        {auditQuery.data?.length ? (
          auditQuery.data.map((log) => (
            <div key={log.id} className="rounded-xl border border-surface-200 bg-surface-50 px-3 py-2 text-sm">
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
