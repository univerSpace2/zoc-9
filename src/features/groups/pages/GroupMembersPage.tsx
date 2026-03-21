import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, Copy, Plus, Star, X } from 'lucide-react'
import { useMemo, useState } from 'react'
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
import { ERR, PERMISSION_LABEL, PERMISSION_OPTIONS } from '@/lib/constants'
import { useAuthStore } from '@/store/auth-store'
import type { MemberPositionStat, PermissionKey, Role } from '@/types/domain'

const inviteSchema = z.object({
  role: z.enum(['admin', 'member']),
  invitedEmail: z.string().email('유효한 이메일을 입력하세요.').optional().or(z.literal('')),
  expiresInDays: z.coerce.number().int().min(1).max(30),
})

type InviteFormValues = z.infer<typeof inviteSchema>
type InviteFormInput = z.input<typeof inviteSchema>

type SortMode = 'winRate' | 'name' | 'recent'

const POSITION_LABELS: Record<number, string> = {
  1: 'ATTACK',
  2: 'SETTER',
  3: 'DEFENSE',
  4: 'LIBERO',
}

const POSITION_DOT_COLORS: Record<number, string> = {
  1: 'bg-primary',
  2: 'bg-tertiary',
  3: 'bg-[#b45309]',
  4: 'bg-surface-600',
}

function getOverallWinRate(stats: MemberPositionStat[]): number {
  const totalWins = stats.reduce((sum, s) => sum + s.wins, 0)
  const totalLosses = stats.reduce((sum, s) => sum + s.losses, 0)
  const total = totalWins + totalLosses
  if (total === 0) return 0
  return Math.round((totalWins / total) * 100)
}

function getPrimaryPosition(stats: MemberPositionStat[]): number | null {
  if (stats.length === 0) return null
  const sorted = [...stats].sort((a, b) => b.sampleSize - a.sampleSize)
  return sorted[0].positionNo
}

/** Mini bar chart for position-level stats */
function MiniBarChart({ stats }: { stats: MemberPositionStat[] }) {
  const maxSample = Math.max(...stats.map((s) => s.sampleSize), 1)

  return (
    <div className="flex items-end gap-1.5" style={{ height: 40 }}>
      {stats.slice(0, 6).map((stat, i) => {
        const barH = Math.max(4, (stat.winRate / 100) * 36)
        return (
          <div key={i} className="flex flex-col items-center gap-0.5">
            <div
              className="w-3 rounded-sm bg-[#d1fc00]"
              style={{ height: barH }}
            />
            <span className="text-[8px] text-[#d1fc00]/60">{stat.winRate}</span>
          </div>
        )
      })}
    </div>
  )
}

export function GroupMembersPage() {
  const { groupId } = useParams<{ groupId: string }>()
  const user = useAuthStore((state) => state.user)
  const queryClient = useQueryClient()
  const [memberError, setMemberError] = useState<string | null>(null)
  const [showInviteForm, setShowInviteForm] = useState(false)
  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null)
  const [sortMode, setSortMode] = useState<SortMode>('winRate')
  const [showAllMembers, setShowAllMembers] = useState(false)

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
    queryKey: queryKeys.permission(user?.id ?? '', groupId ?? '', 'manage_members'),
    queryFn: () => apiHasPermission(user!.id, groupId!, 'manage_members'),
    enabled: Boolean(user && groupId),
  })

  const manageInvitesPermissionQuery = useQuery({
    queryKey: queryKeys.permission(user?.id ?? '', groupId ?? '', 'manage_invites'),
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
        throw new Error(ERR.INVALID_USER_GROUP)
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
      setShowInviteForm(false)
      await queryClient.invalidateQueries({ queryKey: queryKeys.invites(groupId ?? '') })
    },
  })

  const roleMutation = useMutation({
    mutationFn: async (payload: { targetProfileId: string; role: Exclude<Role, 'owner'> }) => {
      if (!groupId || !user) {
        throw new Error(ERR.INVALID_USER_GROUP)
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
        throw new Error(ERR.INVALID_USER_GROUP)
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
        throw new Error(ERR.INVALID_USER_GROUP)
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
        throw new Error(ERR.INVALID_USER_GROUP)
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
        throw new Error(ERR.LOGIN_REQUIRED)
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
        throw new Error(ERR.LOGIN_REQUIRED)
      }

      await apiReissueInvite(user.id, inviteId, 7)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.invites(groupId ?? '') })
    },
  })

  // Aggregate position stats for the bento grid
  const aggregatedPositionStats = useMemo(() => {
    const stats = positionStatsQuery.data ?? []
    const byPosition = new Map<number, { wins: number; losses: number; stats: MemberPositionStat[] }>()

    for (const stat of stats) {
      const existing = byPosition.get(stat.positionNo) ?? { wins: 0, losses: 0, stats: [] }
      existing.wins += stat.wins
      existing.losses += stat.losses
      existing.stats.push(stat)
      byPosition.set(stat.positionNo, existing)
    }

    return byPosition
  }, [positionStatsQuery.data])

  // Sorted members
  const sortedMembers = useMemo(() => {
    const members = membersQuery.data ?? []
    const stats = positionStatsQuery.data ?? []

    return [...members].sort((a, b) => {
      if (sortMode === 'name') {
        return a.profile.name.localeCompare(b.profile.name, 'ko')
      }
      if (sortMode === 'winRate') {
        const aStats = stats.filter((s) => s.profileId === a.profileId)
        const bStats = stats.filter((s) => s.profileId === b.profileId)
        return getOverallWinRate(bStats) - getOverallWinRate(aStats)
      }
      // recent: keep original order (most recently added)
      return 0
    })
  }, [membersQuery.data, positionStatsQuery.data, sortMode])

  if (!groupId) {
    return null
  }

  const canManageMembers = Boolean(manageMembersPermissionQuery.data)
  const canManageInvites = Boolean(manageInvitesPermissionQuery.data)
  const displayedMembers = showAllMembers ? sortedMembers : sortedMembers.slice(0, 5)
  const allStats = positionStatsQuery.data ?? []

  return (
    <PageFrame className="space-y-5 pt-6">
      {/* ── Page Header ── */}
      <div>
        <h1 className="font-display text-4xl font-black leading-none tracking-[0.03em] text-text-primary">
          멤버 & 통계
        </h1>
        <p className="mt-1 text-base text-surface-600">포지션 성과와 멤버를 한눈에 관리합니다.</p>
      </div>

      {/* ── Section 1: 포지션별 통계 (Bento Grid) ── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-xl font-bold tracking-tight text-text-primary">포지션별 통계</h2>
          <span className="rounded-full bg-surface-300 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-surface-700">
            Season 24-2
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* ATTACK card */}
          {(() => {
            const posData = aggregatedPositionStats.get(1)
            const total = (posData?.wins ?? 0) + (posData?.losses ?? 0)
            const rate = total > 0 ? Math.round(((posData?.wins ?? 0) / total) * 100) : 0
            return (
              <div className="rounded-xl bg-white p-4 shadow-[0_20px_40px_rgba(44,47,48,0.06)]">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-surface-600">ATTACK</p>
                <p className="mt-1 font-display text-2xl font-black text-primary">{rate}%</p>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-200">
                  <div
                    className="h-full rounded-full bg-primary-container transition-all duration-500"
                    style={{ width: `${rate}%` }}
                  />
                </div>
                <p className="mt-1 text-[10px] text-surface-600">{total} matches</p>
              </div>
            )
          })()}

          {/* SETTER card */}
          {(() => {
            const posData = aggregatedPositionStats.get(2)
            const total = (posData?.wins ?? 0) + (posData?.losses ?? 0)
            const rate = total > 0 ? Math.round(((posData?.wins ?? 0) / total) * 100) : 0
            return (
              <div className="rounded-xl border-l-[3px] border-tertiary bg-white p-4 shadow-[0_20px_40px_rgba(44,47,48,0.06)]">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-surface-600">SETTER</p>
                <p className="mt-1 font-display text-2xl font-black text-tertiary">{rate}%</p>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-200">
                  <div
                    className="h-full rounded-full bg-tertiary/30 transition-all duration-500"
                    style={{ width: `${rate}%` }}
                  />
                </div>
                <p className="mt-1 text-[10px] text-surface-600">{total} matches</p>
              </div>
            )
          })()}

          {/* DEFENSE EFFICIENCY card (spans 2 cols) */}
          {(() => {
            const posData = aggregatedPositionStats.get(3)
            const total = (posData?.wins ?? 0) + (posData?.losses ?? 0)
            const rate = total > 0 ? Math.round(((posData?.wins ?? 0) / total) * 100) : 0
            const memberStats = posData?.stats ?? []
            return (
              <div className="col-span-2 rounded-xl bg-[#0c0f10] p-4 shadow-[0_20px_40px_rgba(44,47,48,0.06)]">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#d1fc00]/60">
                      DEFENSE EFFICIENCY
                    </p>
                    <p className="mt-1 font-display text-3xl font-black text-[#d1fc00]">{rate}%</p>
                    <p className="mt-0.5 text-[10px] text-white/40">{total} total matches</p>
                  </div>
                  {memberStats.length > 0 && <MiniBarChart stats={memberStats} />}
                </div>
              </div>
            )
          })()}
        </div>
      </section>

      {/* ── Section 2: 전체 멤버 ── */}
      <section className="space-y-3">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <h2 className="font-display text-xl font-bold tracking-tight text-text-primary">전체 멤버</h2>
            <span className="font-display text-lg font-black text-primary-container">
              {membersQuery.data?.length ?? 0}
            </span>
          </div>
          {canManageInvites && (
            <button
              type="button"
              onClick={() => setShowInviteForm((prev) => !prev)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary-container text-[#0c0f10] shadow-[0_20px_40px_rgba(44,47,48,0.06)] transition hover:brightness-95 active:scale-95"
              aria-label="멤버 초대"
            >
              {showInviteForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            </button>
          )}
        </div>

        {/* Invite form (toggled) */}
        {showInviteForm && canManageInvites && (
          <Card className="space-y-3" tone="info">
            <h3 className="font-display text-lg font-bold">멤버 초대</h3>
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
        )}

        {/* Filter chips */}
        <div className="flex gap-2">
          {([
            { key: 'winRate' as const, label: '승률순' },
            { key: 'name' as const, label: '이름순' },
            { key: 'recent' as const, label: '최근 활동순' },
          ]).map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => setSortMode(chip.key)}
              className={
                sortMode === chip.key
                  ? 'rounded-full bg-primary-container px-3.5 py-1.5 text-xs font-bold text-[#0c0f10] transition'
                  : 'rounded-full bg-surface-200 px-3.5 py-1.5 text-xs font-semibold text-surface-600 transition hover:bg-surface-300'
              }
            >
              {chip.label}
            </button>
          ))}
        </div>

        {/* Member list */}
        <div className="overflow-hidden rounded-xl bg-white shadow-[0_20px_40px_rgba(44,47,48,0.06)]">
          {displayedMembers.length > 0 ? (
            displayedMembers.map((member, index) => {
              const isExpanded = expandedMemberId === member.id
              const editableRole = member.role !== 'owner' && canManageMembers
              const editablePermissions = member.role !== 'owner' && canManageMembers
              const removable = member.role !== 'owner' && canManageMembers && member.profileId !== user?.id
              const memberStats = allStats.filter((item) => item.profileId === member.profileId)
              const winRate = getOverallWinRate(memberStats)
              const primaryPos = getPrimaryPosition(memberStats)
              const isOwner = member.role === 'owner'
              const isEvenRow = index % 2 === 1

              // Avatar initials
              const initials = member.profile.name.slice(0, 1)

              return (
                <div key={member.id}>
                  {/* Main row */}
                  <button
                    type="button"
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left transition ${
                      isEvenRow ? 'bg-surface-100' : 'bg-white'
                    } ${canManageMembers ? 'cursor-pointer hover:bg-surface-200/60' : ''}`}
                    onClick={() => {
                      if (canManageMembers) {
                        setExpandedMemberId(isExpanded ? null : member.id)
                      }
                    }}
                    aria-expanded={isExpanded}
                  >
                    {/* Avatar */}
                    <div className="relative flex-shrink-0">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-300 font-display text-sm font-bold text-surface-700">
                        {initials}
                      </div>
                      {isOwner && (
                        <div className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary-container">
                          <Star className="h-2.5 w-2.5 fill-[#0c0f10] text-[#0c0f10]" />
                        </div>
                      )}
                    </div>

                    {/* Name + position */}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-bold text-text-primary">{member.profile.name}</p>
                      <div className="flex items-center gap-1.5">
                        {primaryPos !== null && (
                          <>
                            <span
                              className={`inline-block h-2 w-2 rounded-full ${POSITION_DOT_COLORS[primaryPos] ?? 'bg-surface-400'}`}
                            />
                            <span className="text-xs text-surface-600">
                              {POSITION_LABELS[primaryPos] ?? `P${primaryPos}`}
                            </span>
                          </>
                        )}
                        {primaryPos === null && (
                          <span className="text-xs uppercase tracking-wide text-surface-600">{member.role}</span>
                        )}
                      </div>
                    </div>

                    {/* Win rate */}
                    <div className="flex-shrink-0 text-right">
                      <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-surface-600">WIN RATE</p>
                      <p className="font-display text-xl font-black text-text-primary">{winRate}%</p>
                    </div>

                    {/* Expand chevron (only if manageable) */}
                    {canManageMembers && (
                      <ChevronDown
                        className={`h-4 w-4 flex-shrink-0 text-surface-500 transition-transform duration-200 ${
                          isExpanded ? 'rotate-180' : ''
                        }`}
                      />
                    )}
                  </button>

                  {/* Expanded management panel */}
                  {isExpanded && (
                    <div className={`space-y-3 px-4 pb-4 pt-2 ${isEvenRow ? 'bg-surface-100' : 'bg-white'}`}>
                      {/* Contact info */}
                      <div className="flex items-center justify-between rounded-lg bg-surface-200 px-3 py-2">
                        <div className="text-sm text-surface-700">
                          <p>전화번호: {member.profile.phone}</p>
                          <p>계좌번호: {member.profile.bankAccount ?? '-'}</p>
                        </div>
                        <button
                          type="button"
                          className="rounded-lg bg-surface-300 p-2 transition hover:bg-surface-400"
                          onClick={async () => {
                            await navigator.clipboard.writeText(`${member.profile.phone} / ${member.profile.bankAccount ?? '-'}`)
                          }}
                          aria-label="연락처 복사"
                        >
                          <Copy className="h-4 w-4 text-surface-700" />
                        </button>
                      </div>

                      {/* Position stats detail */}
                      {memberStats.length > 0 && (
                        <div className="rounded-lg bg-surface-200 px-3 py-2">
                          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-surface-600">
                            POSITION STATS
                          </p>
                          <div className="space-y-1">
                            {memberStats.map((stat) => (
                              <div
                                key={`${stat.profileId}-${stat.teamSize}-${stat.positionNo}`}
                                className="flex items-center justify-between text-sm"
                              >
                                <span className="text-surface-700">
                                  {stat.teamSize}인 {POSITION_LABELS[stat.positionNo] ?? `P${stat.positionNo}`}
                                </span>
                                <span className="font-semibold text-text-primary">
                                  {stat.wins}W {stat.losses}L ({stat.winRate}%)
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Role management */}
                      {editableRole && (
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
                              size="sm"
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
                      )}

                      {/* Permissions */}
                      {editablePermissions && (
                        <div className="rounded-lg bg-surface-200 p-3">
                          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.1em] text-surface-600">
                            PERMISSIONS
                          </p>
                          <p className="mb-2 text-[10px] text-surface-600">
                            {member.permissionsOverride ? '개별 오버라이드 모드' : '역할 기본값'}
                          </p>
                          <div className="grid grid-cols-2 gap-1">
                            {PERMISSION_OPTIONS.map((permission) => {
                              const checked = member.permissions.includes(permission)
                              return (
                                <label key={permission} className="flex min-h-10 items-center gap-2 text-xs">
                                  <input
                                    className="h-4 w-4 accent-primary"
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
                                  {PERMISSION_LABEL[permission]}
                                </label>
                              )
                            })}
                          </div>
                          <Button
                            intent="neutral"
                            className="mt-2 w-full"
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
                      )}
                    </div>
                  )}
                </div>
              )
            })
          ) : (
            <p className="px-4 py-6 text-center text-base text-surface-600">등록된 멤버가 없습니다.</p>
          )}
        </div>

        {memberError && <p className="text-sm text-danger">{memberError}</p>}

        {/* Show more button */}
        {sortedMembers.length > 5 && !showAllMembers && (
          <button
            type="button"
            onClick={() => setShowAllMembers(true)}
            className="w-full rounded-xl bg-surface-200 py-3 text-sm font-semibold text-surface-700 transition hover:bg-surface-300"
          >
            멤버 더보기 ({sortedMembers.length - 5}명 더)
          </button>
        )}
      </section>

      {/* ── Section 3: 초대 목록 ── */}
      {(invitesQuery.data?.length ?? 0) > 0 && (
        <section className="space-y-3">
          <h2 className="font-display text-xl font-bold tracking-tight text-text-primary">초대 목록</h2>
          <div className="overflow-hidden rounded-xl bg-white shadow-[0_20px_40px_rgba(44,47,48,0.06)]">
            {invitesQuery.data!.map((invite, index) => (
              <div
                key={invite.id}
                className={`px-4 py-3 ${index % 2 === 1 ? 'bg-surface-100' : 'bg-white'}`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-text-primary">
                      {invite.role}
                      <span
                        className={`ml-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                          invite.status === 'pending'
                            ? 'bg-primary-container/20 text-primary'
                            : invite.status === 'accepted'
                              ? 'bg-primary-container text-[#0c0f10]'
                              : 'bg-surface-200 text-surface-600'
                        }`}
                      >
                        {invite.status}
                      </span>
                    </p>
                    <p className="mt-0.5 break-all text-xs text-surface-600">토큰: {invite.token}</p>
                    <p className="text-xs text-surface-600">만료: {new Date(invite.expiresAt).toLocaleString('ko-KR')}</p>
                  </div>
                </div>
                {canManageInvites && (
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
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </PageFrame>
  )
}
