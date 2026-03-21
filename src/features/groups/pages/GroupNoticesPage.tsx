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
  apiCreateNotice,
  apiDeleteNotice,
  apiHasPermission,
  apiListNotices,
  apiUpdateNotice,
  queryKeys,
} from '@/services/api'
import { ERR } from '@/lib/constants'
import { useAuthStore } from '@/store/auth-store'

const noticeSchema = z.object({
  title: z.string().min(2, '공지 제목을 입력하세요.'),
  body: z.string().min(2, '공지 내용을 입력하세요.'),
})

type NoticeFormValues = z.infer<typeof noticeSchema>

export function GroupNoticesPage() {
  const { groupId } = useParams<{ groupId: string }>()
  const user = useAuthStore((state) => state.user)
  const queryClient = useQueryClient()

  const noticesQuery = useQuery({
    queryKey: queryKeys.notices(groupId ?? ''),
    queryFn: () => apiListNotices(groupId ?? ''),
    enabled: Boolean(groupId),
  })

  const manageNoticesPermissionQuery = useQuery({
    queryKey: queryKeys.permission(user?.id ?? '', groupId ?? '', 'manage_notices'),
    queryFn: () => apiHasPermission(user!.id, groupId!, 'manage_notices'),
    enabled: Boolean(user && groupId),
  })

  const noticeForm = useForm<NoticeFormValues>({
    resolver: zodResolver(noticeSchema),
    defaultValues: {
      title: '',
      body: '',
    },
  })

  const createNoticeMutation = useMutation({
    mutationFn: async (values: NoticeFormValues) => {
      if (!groupId || !user) {
        throw new Error(ERR.INVALID_USER_GROUP)
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
    },
  })

  const updateNoticeMutation = useMutation({
    mutationFn: async (payload: { noticeId: string; title: string; body: string }) => {
      if (!user) {
        throw new Error(ERR.LOGIN_REQUIRED)
      }

      return apiUpdateNotice(user.id, payload.noticeId, {
        title: payload.title,
        body: payload.body,
      })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.notices(groupId ?? '') })
    },
  })

  const deleteNoticeMutation = useMutation({
    mutationFn: async (noticeId: string) => {
      if (!user) {
        throw new Error(ERR.LOGIN_REQUIRED)
      }

      await apiDeleteNotice(user.id, noticeId)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.notices(groupId ?? '') })
    },
  })

  if (!groupId) {
    return null
  }

  const canManageNotices = Boolean(manageNoticesPermissionQuery.data)

  return (
    <PageFrame className="space-y-4 pt-6">
      <SubPageHeader title="공지 관리" />

      <Card className="space-y-3">
        <h2 className="font-display text-2xl font-black tracking-tight">공지 등록</h2>
        {canManageNotices ? (
          <form className="space-y-2" onSubmit={noticeForm.handleSubmit((values) => createNoticeMutation.mutate(values))}>
            <Input label="공지 제목" error={noticeForm.formState.errors.title?.message} {...noticeForm.register('title')} />
            <label className="flex flex-col gap-1 text-base font-semibold text-surface-700">
              <span>공지 내용</span>
              <textarea
                rows={4}
                className="w-full rounded-xl bg-surface-200 px-3 py-2 text-lg text-surface-900 outline-none transition focus:ring-2 focus:ring-[#516200]/30"
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
      </Card>

      {noticesQuery.data?.map((notice) => (
        <Card key={notice.id} className="space-y-1" tone="info">
          <p className="font-display text-lg font-bold tracking-tight">{notice.title}</p>
          <p className="whitespace-pre-wrap text-sm text-surface-700">{notice.body}</p>
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
        </Card>
      ))}
    </PageFrame>
  )
}
