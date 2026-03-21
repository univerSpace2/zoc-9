import { Link } from 'react-router-dom'
import { PageFrame } from '@/components/layout/PageFrame'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'

export function LandingPage() {
  return (
    <PageFrame className="flex min-h-screen flex-col items-center pt-10">
      {/* Brand */}
      <div className="mb-8">
        <span className="font-display text-3xl font-bold tracking-tight text-[#0c0f10]">
          ZOC9
        </span>
      </div>

      {/* Hero Card */}
      <Card
        className="relative mb-8 w-full overflow-hidden border-0 bg-[#d1fc00] p-0 shadow-[0_24px_48px_rgba(44,47,48,0.10)] sm:p-0"
        tone="default"
      >
        <div className="relative flex min-h-[220px] items-end justify-center overflow-hidden">
          <div className="absolute inset-0 bg-[linear-gradient(160deg,#d1fc00_0%,#b8e000_60%,#a0c800_100%)]" />
          {/* Tagline overlay */}
          <div className="relative z-10 w-full px-5 pb-6 pt-32">
            <h1 className="font-display text-xl font-bold leading-snug tracking-tight text-[#0c0f10]">
              족구 동호회의 모든 것
              <br />
              실시간 기록부터 상세 통계까지
            </h1>
          </div>
        </div>
      </Card>

      {/* Login Button */}
      <div className="mb-3 w-full">
        <Link to="/login" className="block">
          <Button
            fullWidth
            size="lg"
            className="bg-[#0c0f10] text-white shadow-[0_20px_40px_rgba(44,47,48,0.08)] hover:bg-[#1a1f22] active:translate-y-px"
          >
            로그인
          </Button>
        </Link>
      </div>

      {/* Signup Link */}
      <Link to="/signup" className="block">
        <span className="text-sm font-semibold text-[#0c0f10]/50 transition hover:text-[#0c0f10]/80">
          회원가입
        </span>
      </Link>
    </PageFrame>
  )
}
