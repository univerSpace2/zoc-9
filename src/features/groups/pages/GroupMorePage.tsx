import { ChevronRight, FileText, MapPin, ScrollText, Settings, Shield, Send, Crown } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { PageFrame } from '@/components/layout/PageFrame'

const menuItems = [
  {
    to: 'settings',
    icon: Settings,
    iconBg: 'bg-[#d1fc00]/15',
    iconColor: 'text-[#516200]',
    title: '그룹 설정',
    description: '그룹 이름 변경',
  },
  {
    to: 'venues',
    icon: MapPin,
    iconBg: 'bg-[#0059b6]/10',
    iconColor: 'text-[#0059b6]',
    title: '구장 관리',
    description: '구장 등록, 수정, 삭제',
  },
  {
    to: 'notices',
    icon: FileText,
    iconBg: 'bg-[#d1fc00]/15',
    iconColor: 'text-[#516200]',
    title: '공지 관리',
    description: '공지 작성 및 수정',
  },
  {
    to: 'invites',
    icon: Send,
    iconBg: 'bg-[#0059b6]/10',
    iconColor: 'text-[#0059b6]',
    title: '초대 관리',
    description: '초대 생성, 취소, 재발급',
  },
  {
    to: 'permissions',
    icon: Shield,
    iconBg: 'bg-[#d1fc00]/15',
    iconColor: 'text-[#516200]',
    title: '권한 관리',
    description: '역할별 권한 템플릿 설정',
  },
  {
    to: 'transfer',
    icon: Crown,
    iconBg: 'bg-[#b02500]/10',
    iconColor: 'text-[#b02500]',
    title: '그룹장 위임',
    description: 'Owner 권한 이전',
  },
  {
    to: 'audit',
    icon: ScrollText,
    iconBg: 'bg-surface-300',
    iconColor: 'text-surface-700',
    title: '감사로그',
    description: '변경 이력 조회',
  },
]

export function GroupMorePage() {
  const { groupId } = useParams<{ groupId: string }>()

  if (!groupId) {
    return null
  }

  return (
    <PageFrame className="space-y-6 pt-6 pb-32">
      {/* Header */}
      <div className="px-1">
        <h1 className="font-display text-2xl font-bold tracking-tight">더보기</h1>
        <p className="mt-1 text-sm text-surface-600">그룹을 관리합니다.</p>
      </div>

      {/* Menu Items */}
      <div className="space-y-3">
        {menuItems.map((item) => {
          const Icon = item.icon
          return (
            <Link
              key={item.to}
              to={`/g/${groupId}/more/${item.to}`}
              className="flex items-center gap-4 rounded-3xl bg-white p-5 shadow-[0_20px_40px_rgba(44,47,48,0.06)] transition active:translate-y-px hover:shadow-lg"
            >
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${item.iconBg}`}>
                <Icon className={`h-5 w-5 ${item.iconColor}`} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-display text-base font-bold text-text-primary">{item.title}</p>
                <p className="mt-0.5 text-xs text-surface-600">{item.description}</p>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-surface-400" />
            </Link>
          )
        })}
      </div>
    </PageFrame>
  )
}
