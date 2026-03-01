import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { PageFrame } from '@/components/layout/PageFrame'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { apiRegister } from '@/services/api'
import { useAuthStore } from '@/store/auth-store'

const schema = z.object({
  email: z.email('유효한 이메일을 입력하세요.'),
  name: z.string().min(2, '이름은 2자 이상 입력하세요.'),
  phone: z.string().min(8, '전화번호를 입력하세요.'),
  bankAccount: z.string().optional(),
  password: z.string().min(6, '비밀번호는 6자 이상 입력하세요.'),
})

type FormValues = z.infer<typeof schema>

export function SignupPage() {
  const navigate = useNavigate()
  const setUser = useAuthStore((state) => state.setUser)
  const setInitialized = useAuthStore((state) => state.setInitialized)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: '',
      name: '',
      phone: '',
      bankAccount: '',
      password: '',
    },
  })

  const mutation = useMutation({
    mutationFn: apiRegister,
    onSuccess(profile) {
      setUser(profile)
      setInitialized(true)
      navigate('/groups', { replace: true })
    },
  })

  return (
    <PageFrame className="space-y-4 pt-6">
      <Card className="space-y-4" tone="elevated">
        <h1 className="font-display text-4xl leading-none tracking-[0.03em]">회원가입</h1>
        <form className="space-y-2" onSubmit={handleSubmit((values) => mutation.mutate(values))}>
          <Input label="이메일" type="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
          <Input label="이름" autoComplete="name" error={errors.name?.message} {...register('name')} />
          <Input label="전화번호" autoComplete="tel" error={errors.phone?.message} {...register('phone')} />
          <Input label="계좌번호 (선택)" error={errors.bankAccount?.message} {...register('bankAccount')} />
          <Input
            label="비밀번호"
            type="password"
            autoComplete="new-password"
            error={errors.password?.message}
            {...register('password')}
          />
          {mutation.error ? <p className="text-base font-semibold text-danger">{(mutation.error as Error).message}</p> : null}
          <Button type="submit" fullWidth size="lg" intent="primary" disabled={mutation.isPending}>
            {mutation.isPending ? '가입 처리 중...' : '가입 완료'}
          </Button>
        </form>
      </Card>

      <p className="text-center text-lg text-surface-600">
        이미 계정이 있나요?{' '}
        <Link className="font-bold text-primary-strong" to="/login">
          로그인
        </Link>
      </p>
    </PageFrame>
  )
}
