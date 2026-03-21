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
  apiCreateVenue,
  apiDeleteVenue,
  apiHasPermission,
  apiListVenues,
  apiUpdateVenue,
  queryKeys,
} from '@/services/api'
import { ERR } from '@/lib/constants'
import { useAuthStore } from '@/store/auth-store'

const venueSchema = z.object({
  name: z.string().min(2, '구장 이름을 입력하세요.'),
  reservationRequired: z.boolean(),
  reservationUrl: z.string().url('올바른 URL을 입력하세요.').optional().or(z.literal('')),
})

type VenueFormValues = z.infer<typeof venueSchema>

export function GroupVenuesPage() {
  const { groupId } = useParams<{ groupId: string }>()
  const user = useAuthStore((state) => state.user)
  const queryClient = useQueryClient()

  const venuesQuery = useQuery({
    queryKey: queryKeys.venues(groupId ?? ''),
    queryFn: () => apiListVenues(groupId ?? ''),
    enabled: Boolean(groupId),
  })

  const manageVenuesPermissionQuery = useQuery({
    queryKey: queryKeys.permission(user?.id ?? '', groupId ?? '', 'manage_venues'),
    queryFn: () => apiHasPermission(user!.id, groupId!, 'manage_venues'),
    enabled: Boolean(user && groupId),
  })

  const venueForm = useForm<VenueFormValues>({
    resolver: zodResolver(venueSchema),
    defaultValues: {
      name: '',
      reservationRequired: false,
      reservationUrl: '',
    },
  })

  const createVenueMutation = useMutation({
    mutationFn: async (values: VenueFormValues) => {
      if (!groupId || !user) {
        throw new Error(ERR.INVALID_USER_GROUP)
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
    },
  })

  const updateVenueMutation = useMutation({
    mutationFn: async (payload: { id: string; name: string; reservationRequired: boolean; reservationUrl?: string }) => {
      if (!user) {
        throw new Error(ERR.LOGIN_REQUIRED)
      }

      return apiUpdateVenue(user.id, payload.id, {
        name: payload.name,
        reservationRequired: payload.reservationRequired,
        reservationUrl: payload.reservationUrl,
      })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.venues(groupId ?? '') })
    },
  })

  const deleteVenueMutation = useMutation({
    mutationFn: async (venueId: string) => {
      if (!user) {
        throw new Error(ERR.LOGIN_REQUIRED)
      }

      await apiDeleteVenue(user.id, venueId)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.venues(groupId ?? '') })
    },
  })

  if (!groupId) {
    return null
  }

  const canManageVenues = Boolean(manageVenuesPermissionQuery.data)

  return (
    <PageFrame className="space-y-4 pt-6">
      <SubPageHeader title="구장 관리" />

      <Card className="space-y-3">
        <h2 className="font-display text-2xl font-black tracking-tight">구장 등록</h2>
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
      </Card>

      {venuesQuery.data?.map((venue) => (
        <Card key={venue.id} className="space-y-1" tone="info">
          <p className="font-display text-lg font-bold tracking-tight">{venue.name}</p>
          <p className="text-sm text-surface-700">예약 필요: {venue.reservationRequired ? '예' : '아니오'}</p>
          {venue.reservationUrl ? <p className="break-all text-xs text-surface-600">{venue.reservationUrl}</p> : null}
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
        </Card>
      ))}
    </PageFrame>
  )
}
