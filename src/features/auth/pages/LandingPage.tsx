import { Link } from 'react-router-dom'
import { PageFrame } from '@/components/layout/PageFrame'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'

export function LandingPage() {
  return (
    <PageFrame className="space-y-5 pt-6">
      <Card className="overflow-hidden bg-[linear-gradient(150deg,#0c0f10_0%,#516200_58%,#0c0f10_100%)] text-white" tone="elevated">
        <div className="space-y-4 px-2 py-3">
          <p className="font-display text-base tracking-[0.22em] text-[#d1fc00]">KINETIC PRECISION</p>
          <h1 className="font-display text-5xl leading-none tracking-[0.03em]">ZOC9</h1>
          <p className="text-lg font-medium text-[#dadddf]">
            야외에서도 빠르게.
            <br />
            큰 글자에서도 정확하게.
          </p>
          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-white/10 p-3 text-center text-sm font-bold">
            <span className="rounded-xl bg-white/15 px-2 py-2">오프라인 큐</span>
            <span className="rounded-xl bg-white/15 px-2 py-2">듀스 자동 판정</span>
            <span className="rounded-xl bg-white/15 px-2 py-2">완료 기록 잠금</span>
            <span className="rounded-xl bg-white/15 px-2 py-2">운영 탭 지원</span>
          </div>
        </div>
      </Card>

      <div className="space-y-3">
        <Link to="/login" className="block">
          <Button fullWidth size="lg" intent="primary">
            로그인
          </Button>
        </Link>
        <Link to="/signup" className="block">
          <Button fullWidth size="lg" intent="secondary">
            회원가입
          </Button>
        </Link>
      </div>
    </PageFrame>
  )
}
