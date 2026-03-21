import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm, useWatch } from 'react-hook-form'
import { Link, useParams } from 'react-router-dom'
import { z } from 'zod'
import { PageFrame } from '@/components/layout/PageFrame'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { SelectField } from '@/components/ui/SelectField'
import { StatusChip } from '@/components/ui/StatusChip'
import {
  apiCreateMeeting,
  apiListMeetings,
  apiListMembers,
  apiListVenues,
  apiUpdateMeetingStatus,
  queryKeys,
} from '@/services/api'
import { ERR } from '@/lib/constants'
import { useAuthStore } from '@/store/auth-store'

const schema = z.object({
  title: z.string().min(2, '모임명을 입력하세요.'),
  date: z.string().min(1, '날짜를 입력하세요.'),
  startTime: z.string().min(1, '시작시간을 입력하세요.'),
  venueId: z.string().optional(),
  participantIds: z.array(z.string()).default([]),
})

type FormValues = z.infer<typeof schema>
type FormInput = z.input<typeof schema>

export function GroupMeetingsPage() {
  const { groupId } = useParams<{ groupId: string }>()
  const user = useAuthStore((state) => state.user)
  const queryClient = useQueryClient()

  const meetingsQuery = useQuery({
    queryKey: queryKeys.meetings(groupId ?? ''),
    queryFn: () => apiListMeetings(groupId ?? ''),
    enabled: Boolean(groupId),
  })

  const membersQuery = useQuery({
    queryKey: queryKeys.members(groupId ?? ''),
    queryFn: () => apiListMembers(groupId ?? ''),
    enabled: Boolean(groupId),
  })

  const venuesQuery = useQuery({
    queryKey: queryKeys.venues(groupId ?? ''),
    queryFn: () => apiListVenues(groupId ?? ''),
    enabled: Boolean(groupId),
  })

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors },
  } = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: '',
      date: new Date().toISOString().slice(0, 10),
      startTime: '19:00',
      venueId: '',
      participantIds: [],
    },
  })
  const selectedVenueId = useWatch({
    control,
    name: 'venueId',
  })

  const createMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!user || !groupId) {
        throw new Error(ERR.INVALID_USER_GROUP)
      }

      const participantIds = values.participantIds.length > 0 ? values.participantIds : [user.id]

      return apiCreateMeeting(user.id, {
        groupId,
        title: values.title,
        date: values.date,
        startTime: values.startTime,
        participantIds,
        venueId: values.venueId || undefined,
      })
    },
    onSuccess: async () => {
      reset()
      await queryClient.invalidateQueries({ queryKey: queryKeys.meetings(groupId ?? '') })
      await queryClient.invalidateQueries({ queryKey: queryKeys.activeMeeting(groupId ?? '') })
    },
  })

  const statusMutation = useMutation({
    mutationFn: async ({ meetingId, status }: { meetingId: string; status: 'scheduled' | 'in_progress' | 'completed' }) => {
      if (!user) {
        throw new Error(ERR.LOGIN_REQUIRED)
      }

      return apiUpdateMeetingStatus(user.id, meetingId, status)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.meetings(groupId ?? '') })
      await queryClient.invalidateQueries({ queryKey: queryKeys.activeMeeting(groupId ?? '') })
    },
  })

  if (!groupId) {
    return null
  }

  return (
    <PageFrame className="space-y-4 pt-6">
      <Card className="space-y-3" tone="elevated">
        <h1 className="font-display text-4xl leading-none tracking-[0.03em]">모임</h1>

        <form className="space-y-3" onSubmit={handleSubmit((values) => createMutation.mutate(values))}>
          <Input label="모임 이름" error={errors.title?.message} {...register('title')} />
          <div className="grid grid-cols-2 gap-2">
            <Input label="날짜" type="date" error={errors.date?.message} {...register('date')} />
            <Input label="시작시간" type="time" error={errors.startTime?.message} {...register('startTime')} />
          </div>
          <SelectField
            label="구장 선택"
            value={selectedVenueId ?? ''}
            options={[
              { value: '', label: '구장 미지정' },
              ...(venuesQuery.data ?? []).map((venue) => ({
                value: venue.id,
                label: venue.name,
              })),
            ]}
            onChange={(value) => setValue('venueId', value, { shouldValidate: true, shouldDirty: true })}
          />
          <div className="space-y-2 rounded-2xl bg-surface-50 px-3 py-3">
            <p className="text-lg font-bold text-text-secondary">참여 멤버 선택</p>
            {membersQuery.data?.length ? (
              <div className="grid grid-cols-2 gap-2">
                {membersQuery.data.map((member) => (
                  <label key={member.id} className="flex min-h-12 items-center gap-2 rounded-xl bg-surface-200 px-2 text-sm">
                    <input className="h-5 w-5" type="checkbox" value={member.profileId} {...register('participantIds')} />
                    <span className="font-semibold">{member.profile.name}</span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-sm text-surface-700">멤버 정보를 불러오는 중입니다.</p>
            )}
            {errors.participantIds?.message ? (
              <p className="text-sm font-semibold text-danger">{errors.participantIds.message}</p>
            ) : null}
          </div>
          {createMutation.error ? <p className="text-base text-danger">{(createMutation.error as Error).message}</p> : null}
          <Button intent="secondary" size="lg" type="submit" fullWidth disabled={createMutation.isPending}>
            {createMutation.isPending ? '생성 중...' : '모임 생성'}
          </Button>
        </form>
      </Card>

      <div className="space-y-2">
        {meetingsQuery.data?.map((meeting) => (
          <Card key={meeting.id} className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-2xl font-black">{meeting.title}</p>
                <p className="text-base text-surface-600">
                  {meeting.date} {meeting.startTime}
                </p>
              </div>
              <StatusChip status={meeting.status} emphasize />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                intent="neutral"
                onClick={() =>
                  statusMutation.mutate({
                    meetingId: meeting.id,
                    status: meeting.status === 'scheduled' ? 'in_progress' : 'scheduled',
                  })
                }
                disabled={statusMutation.isPending || meeting.status === 'completed'}
                size="md"
              >
                {meeting.status === 'scheduled' ? '모임 시작' : '예정으로'}
              </Button>
              <Button
                intent="primary"
                onClick={() => statusMutation.mutate({ meetingId: meeting.id, status: 'completed' })}
                disabled={statusMutation.isPending || meeting.status === 'completed'}
                size="md"
              >
                모임 완료
              </Button>
            </div>

            <Link to={`/g/${groupId}/m/${meeting.id}/matches`}>
              <Button fullWidth intent="secondary" size="lg">
                모임 입장
              </Button>
            </Link>
          </Card>
        ))}
      </div>
    </PageFrame>
  )
}
