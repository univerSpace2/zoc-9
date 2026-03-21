import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MapPin } from 'lucide-react'
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
  address: z.string().optional().or(z.literal('')),
  memo: z.string().optional().or(z.literal('')),
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
      address: '',
      memo: '',
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
        address: values.address?.trim() || undefined,
        memo: values.memo?.trim() || undefined,
        reservationRequired: values.reservationRequired,
        reservationUrl: values.reservationUrl?.trim() || undefined,
      })
    },
    onSuccess: async () => {
      venueForm.reset({ name: '', address: '', memo: '', reservationRequired: false, reservationUrl: '' })
      await queryClient.invalidateQueries({ queryKey: queryKeys.venues(groupId ?? '') })
    },
  })

  const updateVenueMutation = useMutation({
    mutationFn: async (payload: { id: string; name: string; address?: string; memo?: string; reservationRequired: boolean; reservationUrl?: string }) => {
      if (!user) {
        throw new Error(ERR.LOGIN_REQUIRED)
      }

      return apiUpdateVenue(user.id, payload.id, {
        name: payload.name,
        address: payload.address,
        memo: payload.memo,
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
            <Input label="주소 (선택)" placeholder="서울시 강남구..." error={venueForm.formState.errors.address?.message} {...venueForm.register('address')} />
            <Input label="메모 (선택)" placeholder="주차, 준비물 등" error={venueForm.formState.errors.memo?.message} {...venueForm.register('memo')} />
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
          {venue.address && (
            <a
              href={`https://map.naver.com/v5/search/${encodeURIComponent(venue.address)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-sm text-[#516200] underline underline-offset-2"
            >
              <MapPin className="h-3.5 w-3.5" />
              {venue.address}
            </a>
          )}
          {venue.memo && <p className="text-xs text-surface-600">{venue.memo}</p>}
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

                  const nextAddress = window.prompt('주소 (비워두면 없음)', venue.address ?? '')
                  const nextMemo = window.prompt('메모 (비워두면 없음)', venue.memo ?? '')
                  const nextUrl = window.prompt('예약 URL (비워두면 없음)', venue.reservationUrl ?? '')

                  updateVenueMutation.mutate({
                    id: venue.id,
                    name: nextName.trim(),
                    address: nextAddress?.trim() || undefined,
                    memo: nextMemo?.trim() || undefined,
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
