import { GripVertical } from 'lucide-react'
import { useRef, useState } from 'react'
import { cn } from '@/lib/utils'

interface DragPositionListProps {
  title: string
  teamTone: 'a' | 'b'
  members: { id: string; name: string }[]
  /** Ordered list of member IDs — index+1 = position number */
  orderedIds: string[]
  onChange: (orderedIds: string[]) => void
}

const toneBg: Record<string, string> = {
  a: 'bg-[#d1fc00]/20 border-[#516200]/20',
  b: 'bg-[#0059b6]/10 border-[#0059b6]/20',
}

const toneAccent: Record<string, string> = {
  a: 'bg-[#516200] text-white',
  b: 'bg-[#0059b6] text-white',
}

export function DragPositionList({ title, teamTone, members, orderedIds, onChange }: DragPositionListProps) {
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [overIdx, setOverIdx] = useState<number | null>(null)
  const touchStartY = useRef(0)
  const touchItemIdx = useRef<number | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const nameMap = new Map(members.map((m) => [m.id, m.name]))

  const reorder = (fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return
    const next = [...orderedIds]
    const [moved] = next.splice(fromIdx, 1)
    next.splice(toIdx, 0, moved)
    onChange(next)
  }

  // Touch handlers for mobile drag
  const handleTouchStart = (idx: number, e: React.TouchEvent) => {
    touchItemIdx.current = idx
    touchStartY.current = e.touches[0].clientY
    setDragIdx(idx)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchItemIdx.current === null || !listRef.current) return
    const currentY = e.touches[0].clientY
    const items = listRef.current.querySelectorAll('[data-drag-item]')
    let targetIdx = touchItemIdx.current

    for (let i = 0; i < items.length; i++) {
      const rect = items[i].getBoundingClientRect()
      const mid = rect.top + rect.height / 2
      if (currentY < mid) {
        targetIdx = i
        break
      }
      targetIdx = i
    }

    setOverIdx(targetIdx)
  }

  const handleTouchEnd = () => {
    if (touchItemIdx.current !== null && overIdx !== null) {
      reorder(touchItemIdx.current, overIdx)
    }
    touchItemIdx.current = null
    setDragIdx(null)
    setOverIdx(null)
  }

  // HTML5 drag handlers for desktop
  const handleDragStart = (idx: number) => {
    setDragIdx(idx)
  }

  const handleDragOver = (idx: number, e: React.DragEvent) => {
    e.preventDefault()
    setOverIdx(idx)
  }

  const handleDrop = (toIdx: number) => {
    if (dragIdx !== null) {
      reorder(dragIdx, toIdx)
    }
    setDragIdx(null)
    setOverIdx(null)
  }

  const handleDragEnd = () => {
    setDragIdx(null)
    setOverIdx(null)
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-text-primary">{title}</p>
      <div
        ref={listRef}
        className="space-y-1.5"
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {orderedIds.map((id, idx) => (
          <div
            key={id}
            data-drag-item
            draggable
            onDragStart={() => handleDragStart(idx)}
            onDragOver={(e) => handleDragOver(idx, e)}
            onDrop={() => handleDrop(idx)}
            onDragEnd={handleDragEnd}
            onTouchStart={(e) => handleTouchStart(idx, e)}
            className={cn(
              'flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-all select-none',
              toneBg[teamTone],
              dragIdx === idx && 'opacity-50 scale-95',
              overIdx === idx && dragIdx !== idx && 'border-dashed border-2',
            )}
          >
            <div className="touch-none cursor-grab text-surface-400 active:cursor-grabbing">
              <GripVertical className="h-5 w-5" />
            </div>
            <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black', toneAccent[teamTone])}>
              {idx + 1}
            </span>
            <span className="flex-1 text-sm font-bold text-text-primary">{nameMap.get(id) ?? id}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
