import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { PageFrame } from '@/components/layout/PageFrame'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { apiChangePassword, apiUpdateProfile } from '@/services/api'
import { useAuthStore } from '@/store/auth-store'

const schema = z.object({
  name: z.string().min(2, '이름은 2자 이상 입력하세요.'),
  phone: z.string().min(8, '전화번호를 입력하세요.'),
  bankAccount: z.string().optional(),
  password: z
    .string()
    .optional()
    .refine((value) => !value || value.length >= 6, '비밀번호는 6자 이상 입력하세요.'),
})

type FormValues = z.infer<typeof schema>

export function ProfilePage() {
  const user = useAuthStore((state) => state.user)
  const setUser = useAuthStore((state) => state.setUser)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: user?.name ?? '',
      phone: user?.phone ?? '',
      bankAccount: user?.bankAccount ?? '',
      password: '',
    },
  })

  useEffect(() => {
    reset({
      name: user?.name ?? '',
      phone: user?.phone ?? '',
      bankAccount: user?.bankAccount ?? '',
      password: '',
    })
  }, [reset, user])

  const updateMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!user) {
        throw new Error('로그인이 필요합니다.')
      }

      return apiUpdateProfile(user.id, {
        name: values.name,
        phone: values.phone,
        bankAccount: values.bankAccount,
      })
    },
    onSuccess(profile) {
      setUser(profile)
    },
  })

  const passwordMutation = useMutation({
    mutationFn: async (password: string) => {
      await apiChangePassword(password)
    },
  })

  if (!user) {
    return null
  }

  return (
    <PageFrame className="space-y-4 pt-6">
      <Card className="space-y-3" tone="elevated">
        <h1 className="font-display text-4xl leading-none tracking-[0.03em]">내 정보</h1>
        <p className="text-base text-surface-700">이메일: {user.email}</p>
        <form
          className="space-y-2"
          onSubmit={handleSubmit((values) => {
            updateMutation.mutate(values)

            const nextPassword = values.password?.trim()
            if (nextPassword) {
              passwordMutation.mutate(nextPassword)
            }
          })}
        >
          <Input label="이름" error={errors.name?.message} {...register('name')} />
          <Input label="전화번호" error={errors.phone?.message} {...register('phone')} />
          <Input label="계좌번호" error={errors.bankAccount?.message} {...register('bankAccount')} />
          <Input
            label="비밀번호 변경 (데모)"
            type="password"
            error={errors.password?.message}
            {...register('password')}
          />
          {updateMutation.error ? <p className="text-base text-danger">{(updateMutation.error as Error).message}</p> : null}
          {passwordMutation.error ? <p className="text-base text-danger">{(passwordMutation.error as Error).message}</p> : null}
          {passwordMutation.isSuccess ? <p className="text-base font-semibold text-live">비밀번호가 변경되었습니다.</p> : null}
          <Button type="submit" fullWidth size="lg" intent="primary" disabled={updateMutation.isPending}>
            {updateMutation.isPending ? '저장 중...' : '저장'}
          </Button>
        </form>
      </Card>
    </PageFrame>
  )
}
