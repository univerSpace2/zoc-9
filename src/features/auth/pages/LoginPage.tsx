import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { PageFrame } from '@/components/layout/PageFrame'
import { Button } from '@/components/ui/Button'
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
  const user = useAuthStore((state) => state.user)
  const setUser = useAuthStore((state) => state.setUser)
  const setInitialized = useAuthStore((state) => state.setInitialized)
  const fromPath = (location.state as { from?: string } | null)?.from

  if (user) {
    return <Navigate to={fromPath ?? '/groups'} replace />
  }

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
    <PageFrame className="flex min-h-screen flex-col pt-10">
      {/* Brand */}
      <div className="mb-10 flex items-baseline gap-1.5">
        <span className="font-display text-3xl font-bold tracking-tight text-[#0c0f10]">ZOC9</span>
      </div>

      {/* Heading */}
      <h1 className="mb-2 font-display text-2xl font-bold tracking-tight text-[#0c0f10]">로그인</h1>
      <p className="mb-8 text-sm text-surface-600">이메일과 비밀번호를 입력하세요.</p>

      {/* Form */}
      <form
        className="w-full space-y-1"
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
          <p className="text-sm font-semibold text-danger">{(loginMutation.error as Error).message}</p>
        ) : null}
        <div className="pt-2">
          <Button
            type="submit"
            fullWidth
            size="lg"
            className="bg-[#0c0f10] text-white shadow-[0_20px_40px_rgba(44,47,48,0.08)] hover:bg-[#1a1f22]"
            disabled={loginMutation.isPending}
          >
            {loginMutation.isPending ? '로그인 중...' : '로그인'}
          </Button>
        </div>
      </form>

      {/* Signup link */}
      <p className="mt-8 text-center text-sm text-surface-600">
        계정이 없나요?{' '}
        <Link className="font-bold text-[#516200]" to="/signup">
          회원가입
        </Link>
      </p>
    </PageFrame>
  )
}
