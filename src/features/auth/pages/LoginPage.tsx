import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { PageFrame } from '@/components/layout/PageFrame'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { apiLogin } from '@/services/api'
import { useAuthStore } from '@/store/auth-store'

const schema = z.object({
  email: z.email('유효한 이메일을 입력하세요.'),
  password: z.string().min(6, '비밀번호는 6자 이상 입력하세요.'),
})

type FormValues = z.infer<typeof schema>

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const setUser = useAuthStore((state) => state.setUser)
  const setInitialized = useAuthStore((state) => state.setInitialized)
  const fromPath = (location.state as { from?: string } | null)?.from

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: '',
      password: '',
    },
  })

  const loginMutation = useMutation({
    mutationFn: apiLogin,
    onSuccess(profile) {
      setUser(profile)
      setInitialized(true)
      navigate(fromPath ?? '/groups', { replace: true })
    },
  })

  return (
    <PageFrame className="space-y-4 pt-6">
      <Card className="space-y-4" tone="elevated">
        <h1 className="font-display text-4xl leading-none tracking-[0.03em]">로그인</h1>

        <form
          className="space-y-2"
          onSubmit={handleSubmit((values) => loginMutation.mutate({ email: values.email, password: values.password }))}
        >
          <Input label="이메일" type="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
          <Input
            label="비밀번호"
            type="password"
            autoComplete="current-password"
            error={errors.password?.message}
            {...register('password')}
          />
          {loginMutation.error ? (
            <p className="text-base font-semibold text-danger">{(loginMutation.error as Error).message}</p>
          ) : null}
          <Button type="submit" fullWidth size="lg" intent="primary" disabled={loginMutation.isPending}>
            {loginMutation.isPending ? '로그인 중...' : '로그인'}
          </Button>
        </form>
      </Card>

      <p className="text-center text-lg text-surface-600">
        계정이 없나요?{' '}
        <Link className="font-bold text-primary-strong" to="/signup">
          회원가입
        </Link>
      </p>
    </PageFrame>
  )
}
