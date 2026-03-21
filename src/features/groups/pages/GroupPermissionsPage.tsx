import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { PageFrame } from '@/components/layout/PageFrame'
import { SubPageHeader } from '@/components/layout/SubPageHeader'
import { Card } from '@/components/ui/Card'
import {
  apiGetGroupMember,
  apiGetGroupPermissionPolicy,
  apiUpdateGroupPermissionPolicy,
  queryKeys,
} from '@/services/api'
import { ERR, PERMISSION_LABEL, PERMISSION_OPTIONS } from '@/lib/constants'
import { useAuthStore } from '@/store/auth-store'
import type { PermissionKey } from '@/types/domain'

export function GroupPermissionsPage() {
  const { groupId } = useParams<{ groupId: string }>()
  const user = useAuthStore((state) => state.user)
  const queryClient = useQueryClient()

  const groupMemberQuery = useQuery({
    queryKey: queryKeys.groupMember(user?.id ?? '', groupId ?? ''),
    queryFn: () => apiGetGroupMember(user!.id, groupId!),
    enabled: Boolean(user && groupId),
  })

  const permissionPolicyQuery = useQuery({
    queryKey: queryKeys.groupPermissionPolicy(groupId ?? ''),
    queryFn: () => apiGetGroupPermissionPolicy(groupId ?? ''),
    enabled: Boolean(groupId),
  })

  const updatePermissionPolicyMutation = useMutation({
    mutationFn: async (payload: { admin: PermissionKey[]; member: PermissionKey[] }) => {
      if (!groupId || !user) {
        throw new Error(ERR.INVALID_USER_GROUP)
      }

      return apiUpdateGroupPermissionPolicy(user.id, groupId, payload)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.groupPermissionPolicy(groupId ?? '') })
      await queryClient.invalidateQueries({ queryKey: queryKeys.members(groupId ?? '') })
      await queryClient.invalidateQueries({ queryKey: queryKeys.auditLogs(groupId ?? '') })
    },
  })

  if (!groupId) {
    return null
  }

  const isOwner = groupMemberQuery.data?.role === 'owner'
  const permissionPolicy = permissionPolicyQuery.data

  return (
    <PageFrame className="space-y-4 pt-6">
      <SubPageHeader title="권한 관리" />

      <Card className="space-y-3">
        {isOwner ? (
          <div className="space-y-3">
            <div className="rounded-xl bg-surface-100 px-3 py-2 text-sm text-surface-700">
              owner 권한 템플릿은 고정이며, admin/member 템플릿만 수정할 수 있습니다.
            </div>
            {(['admin', 'member'] as const).map((role) => (
              <div key={role} className="rounded-xl bg-surface-200 px-3 py-2">
                <p className="mb-2 text-lg font-black">{role} 기본 권한</p>
                <div className="grid grid-cols-2 gap-1">
                  {PERMISSION_OPTIONS.map((permission) => {
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
                        {PERMISSION_LABEL[permission]}
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
    </PageFrame>
  )
}
