import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { useParams } from 'react-router-dom'
import { z } from 'zod'
import { PageFrame } from '@/components/layout/PageFrame'
import { SubPageHeader } from '@/components/layout/SubPageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import {
  apiGetGroup,
  apiGetGroupMember,
  apiUpdateGroupName,
  queryKeys,
} from '@/services/api'
import { ERR } from '@/lib/constants'
import { useAuthStore } from '@/store/auth-store'

const groupSchema = z.object({
  name: z.string().min(2, '그룹 이름은 2자 이상 입력하세요.'),
})

type GroupFormValues = z.infer<typeof groupSchema>

export function GroupSettingsPage() {
  const { groupId } = useParams<{ groupId: string }>()
  const user = useAuthStore((state) => state.user)
  const queryClient = useQueryClient()

  const groupQuery = useQuery({
    queryKey: queryKeys.group(groupId ?? ''),
    queryFn: () => apiGetGroup(groupId ?? ''),
    enabled: Boolean(groupId),
  })

  const groupMemberQuery = useQuery({
    queryKey: queryKeys.groupMember(user?.id ?? '', groupId ?? ''),
    queryFn: () => apiGetGroupMember(user!.id, groupId!),
    enabled: Boolean(user && groupId),
  })

  const groupForm = useForm<GroupFormValues>({
    resolver: zodResolver(groupSchema),
    values: {
      name: groupQuery.data?.name ?? '',
    },
  })

  const updateGroupMutation = useMutation({
    mutationFn: async (values: GroupFormValues) => {
      if (!groupId || !user) {
        throw new Error(ERR.INVALID_USER_GROUP)
      }

      return apiUpdateGroupName(user.id, groupId, values.name)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.group(groupId ?? '') })
      await queryClient.invalidateQueries({ queryKey: queryKeys.groups(user?.id ?? '') })
    },
  })

  if (!groupId) {
    return null
  }

  const canUpdateGroupName = groupMemberQuery.data?.role === 'owner'

  return (
    <PageFrame className="space-y-4 pt-6">
      <SubPageHeader title="그룹 설정" />

      <Card className="space-y-2">
        <h2 className="font-display text-2xl font-black tracking-tight">그룹 이름</h2>
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
    </PageFrame>
  )
}
