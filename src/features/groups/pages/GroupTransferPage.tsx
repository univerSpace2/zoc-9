import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { PageFrame } from '@/components/layout/PageFrame'
import { SubPageHeader } from '@/components/layout/SubPageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { SelectField } from '@/components/ui/SelectField'
import {
  apiGetGroupMember,
  apiListMembers,
  apiTransferGroupOwner,
  queryKeys,
} from '@/services/api'
import { useAuthStore } from '@/store/auth-store'

export function GroupTransferPage() {
  const { groupId } = useParams<{ groupId: string }>()
  const user = useAuthStore((state) => state.user)
  const queryClient = useQueryClient()

  const [ownerTransferTargetId, setOwnerTransferTargetId] = useState<string>('')

  const groupMemberQuery = useQuery({
    queryKey: queryKeys.groupMember(user?.id ?? '', groupId ?? ''),
    queryFn: () => apiGetGroupMember(user!.id, groupId!),
    enabled: Boolean(user && groupId),
  })

  const membersQuery = useQuery({
    queryKey: queryKeys.members(groupId ?? ''),
    queryFn: () => apiListMembers(groupId ?? ''),
    enabled: Boolean(groupId),
  })

  const isOwner = groupMemberQuery.data?.role === 'owner'
  const ownerCandidates = (membersQuery.data ?? []).filter((member) => member.role !== 'owner')
  const resolvedOwnerTransferTargetId = ownerTransferTargetId || ownerCandidates[0]?.profileId || ''

  const transferOwnerMutation = useMutation({
    mutationFn: async () => {
      if (!groupId || !user || !resolvedOwnerTransferTargetId) {
        throw new Error('위임 대상을 선택하세요.')
      }

      return apiTransferGroupOwner(user.id, groupId, resolvedOwnerTransferTargetId)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.groupMember(user?.id ?? '', groupId ?? '') })
      await queryClient.invalidateQueries({ queryKey: queryKeys.members(groupId ?? '') })
      await queryClient.invalidateQueries({ queryKey: queryKeys.groupPermissionPolicy(groupId ?? '') })
      await queryClient.invalidateQueries({ queryKey: queryKeys.auditLogs(groupId ?? '') })
    },
  })

  if (!groupId) {
    return null
  }

  return (
    <PageFrame className="space-y-4 pt-6">
      <SubPageHeader title="그룹장 위임" />

      <Card className="space-y-3">
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
    </PageFrame>
  )
}
