import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

interface SubPageHeaderProps {
  title: string
}

export function SubPageHeader({ title }: SubPageHeaderProps) {
  const navigate = useNavigate()

  return (
    <div className="mb-6 flex items-center gap-3 px-1">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-surface-200 text-surface-700 transition hover:bg-surface-300 active:scale-95"
        aria-label="뒤로가기"
      >
        <ArrowLeft className="h-5 w-5" />
      </button>
      <h1 className="font-display text-2xl font-bold tracking-tight">{title}</h1>
    </div>
  )
}
