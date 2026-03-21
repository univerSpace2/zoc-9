import { useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { CourtView } from '@/components/ui/CourtPositionPicker'
import {
  assignMemberPositionWithSwap,
  type PositionMap,
} from '@/features/meetings/lib/match-form'

interface DualCourtDragPickerProps {
  teamSize: 2 | 3 | 4
  members: { id: string; name: string }[]
  teamAName: string
  teamBName: string
  teamAPlayerIds: string[]
  teamBPlayerIds: string[]
  teamAPositionMap: PositionMap
  teamBPositionMap: PositionMap
  disabledIds?: Set<string>
  onChangeA: (ids: string[], map: PositionMap) => void
  onChangeB: (ids: string[], map: PositionMap) => void
  errorA?: string
  errorB?: string
}

export function DualCourtDragPicker({
  teamSize,
  members,
  teamAName,
  teamBName,
  teamAPlayerIds,
  teamBPlayerIds,
  teamAPositionMap,
  teamBPositionMap,
  disabledIds,
  onChangeA,
  onChangeB,
  errorA,
  errorB,
}: DualCourtDragPickerProps) {
  const [dragMemberId, setDragMemberId] = useState<string | null>(null)
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)
  const courtRef = useRef<HTMLDivElement>(null)

  const nameMap = new Map(members.map((m) => [m.id, m.name]))
  const handleSlotTap = (team: 'a' | 'b', posNo: number) => {
    const memberId = selectedMemberId ?? dragMemberId
    if (!memberId) return

    const ids = team === 'a' ? teamAPlayerIds : teamBPlayerIds
    const map = team === 'a' ? teamAPositionMap : teamBPositionMap
    const onChange = team === 'a' ? onChangeA : onChangeB

    // Don't allow if already on the other team
    const otherTeam = team === 'a' ? teamBPlayerIds : teamAPlayerIds
    if (otherTeam.includes(memberId)) return

    if (ids.length >= teamSize && !ids.includes(memberId)) return

    const result = assignMemberPositionWithSwap({
      selectedIds: ids,
      positionMap: map,
      memberId,
      positionNo: posNo,
      teamSize,
    })
    onChange(result.selectedIds, result.positionMap)
    setSelectedMemberId(null)
    setDragMemberId(null)
  }

  // Touch drag support
  const handleTouchStart = (memberId: string) => {
    if (disabledIds?.has(memberId)) return
    setDragMemberId(memberId)
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!dragMemberId || !courtRef.current) {
      setDragMemberId(null)
      return
    }

    const touch = e.changedTouches[0]
    const target = document.elementFromPoint(touch.clientX, touch.clientY)
    const slotEl = target?.closest('[data-slot]') as HTMLElement | null

    if (slotEl) {
      const team = slotEl.dataset.slotTeam as 'a' | 'b'
      const posNo = Number(slotEl.dataset.slotPos)
      if (team && posNo) handleSlotTap(team, posNo)
    }

    setDragMemberId(null)
  }

  // Desktop drag
  const handleDragStart = (memberId: string) => {
    if (disabledIds?.has(memberId)) return
    setDragMemberId(memberId)
  }

  const handleDrop = (team: 'a' | 'b', posNo: number) => {
    if (dragMemberId) handleSlotTap(team, posNo)
  }

  // Tap to select flow
  const handleMemberTap = (memberId: string) => {
    if (disabledIds?.has(memberId)) return
    setSelectedMemberId(selectedMemberId === memberId ? null : memberId)
  }

  return (
    <div className="space-y-3">
      {/* Court */}
      <div ref={courtRef} className="relative rounded-xl bg-[#d2b48c] p-2" onTouchEnd={handleTouchEnd}>
        <div className="relative aspect-[2/1] overflow-hidden rounded-lg bg-[#2e8b57]">
          {/* Boundary */}
          <div className="absolute inset-[6%] border-2 border-white/60" />
          {/* Net */}
          <div className="absolute top-[6%] bottom-[6%] left-1/2 w-[3px] -translate-x-1/2 bg-[#333]" />
          <div className="absolute top-[5%] left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-[#333]" />
          <div className="absolute bottom-[5%] left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-[#333]" />
          {/* Team labels */}
          <span className="absolute top-1 left-3 text-[9px] font-black text-white/40">{teamAName}</span>
          <span className="absolute top-1 right-3 text-[9px] font-black text-white/40">{teamBName}</span>

          {/* Drop-target slots overlay — Team A */}
          <SlotTargets team="a" teamSize={teamSize} onDrop={handleDrop} onTap={handleSlotTap} hasActiveDrag={Boolean(dragMemberId || selectedMemberId)} />
          {/* Drop-target slots overlay — Team B */}
          <SlotTargets team="b" teamSize={teamSize} onDrop={handleDrop} onTap={handleSlotTap} hasActiveDrag={Boolean(dragMemberId || selectedMemberId)} />

          {/* Rendered slots */}
          <CourtView
            teamTone="a" teamSize={teamSize}
            positionMap={teamAPositionMap}
            nameMap={nameMap}
            activeIds={teamAPlayerIds}
            selectedMemberId={null}
            onSlotTap={(posNo) => handleSlotTap('a', posNo)}
          />
          <CourtView
            teamTone="b" teamSize={teamSize}
            positionMap={teamBPositionMap}
            nameMap={nameMap}
            activeIds={teamBPlayerIds}
            selectedMemberId={null}
            onSlotTap={(posNo) => handleSlotTap('b', posNo)}
          />
        </div>
      </div>

      {/* Member List */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-text-primary">멤버 선택</span>
          <span className="text-[10px] text-surface-600">
            {teamAName} {teamAPlayerIds.length}/{teamSize} · {teamBName} {teamBPlayerIds.length}/{teamSize}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {members.map((member) => {
            const isOnA = teamAPlayerIds.includes(member.id)
            const isOnB = teamBPlayerIds.includes(member.id)
            const isAssigned = isOnA || isOnB
            const posNo = isOnA ? teamAPositionMap[member.id] : isOnB ? teamBPositionMap[member.id] : undefined
            const isSelected = selectedMemberId === member.id
            const isDragging = dragMemberId === member.id
            const isDisabled = disabledIds?.has(member.id) ?? false

            const teamColor = isOnA ? 'a' : isOnB ? 'b' : null

            return (
              <button
                key={member.id}
                type="button"
                disabled={isDisabled}
                draggable={!isDisabled}
                onDragStart={() => handleDragStart(member.id)}
                onDragEnd={() => setDragMemberId(null)}
                onTouchStart={() => handleTouchStart(member.id)}
                onClick={() => handleMemberTap(member.id)}
                className={cn(
                  'flex min-h-9 touch-none items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold transition-all select-none',
                  isDisabled && 'opacity-30 cursor-not-allowed',
                  isDragging && 'opacity-50 scale-95',
                  isSelected
                    ? 'bg-[#d1fc00] border-[#516200] text-[#3c4a00] shadow-md'
                    : isAssigned
                      ? teamColor === 'a'
                        ? 'bg-[#d1fc00]/20 border-[#516200]/15 text-[#516200] opacity-50'
                        : 'bg-[#0059b6]/10 border-[#0059b6]/15 text-[#0059b6] opacity-50'
                      : 'bg-surface-100 text-surface-600 border-surface-200',
                )}
              >
                {posNo ? (
                  <span className={cn(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-black text-white',
                    teamColor === 'a' ? 'bg-[#516200]' : 'bg-[#0059b6]',
                  )}>
                    {posNo}
                  </span>
                ) : (
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-300 text-[10px] font-black text-surface-600">
                    {member.name.charAt(0)}
                  </span>
                )}
                <span>{member.name}</span>
              </button>
            )
          })}
        </div>
        {errorA && <p className="text-xs font-semibold text-danger">{errorA}</p>}
        {errorB && <p className="text-xs font-semibold text-danger">{errorB}</p>}
      </div>
    </div>
  )
}

/** Invisible drop-target overlay for each position slot */
function SlotTargets({
  team,
  teamSize,
  onDrop,
  onTap,
  hasActiveDrag,
}: {
  team: 'a' | 'b'
  teamSize: number
  onDrop: (team: 'a' | 'b', posNo: number) => void
  onTap: (team: 'a' | 'b', posNo: number) => void
  hasActiveDrag: boolean
}) {
  // Import coords inline to avoid circular deps
  const A4: Record<number, { x: number; y: number }> = { 1: { x: 18, y: 78 }, 2: { x: 18, y: 22 }, 3: { x: 40, y: 22 }, 4: { x: 40, y: 78 } }
  const A3: Record<number, { x: number; y: number }> = { 1: { x: 18, y: 50 }, 2: { x: 40, y: 22 }, 3: { x: 40, y: 78 } }
  const A2: Record<number, { x: number; y: number }> = { 1: { x: 18, y: 50 }, 2: { x: 40, y: 50 } }
  const B4: Record<number, { x: number; y: number }> = { 1: { x: 82, y: 22 }, 2: { x: 82, y: 78 }, 3: { x: 60, y: 78 }, 4: { x: 60, y: 22 } }
  const B3: Record<number, { x: number; y: number }> = { 1: { x: 82, y: 50 }, 2: { x: 60, y: 22 }, 3: { x: 60, y: 78 } }
  const B2: Record<number, { x: number; y: number }> = { 1: { x: 82, y: 50 }, 2: { x: 60, y: 50 } }

  const coords = team === 'a'
    ? teamSize === 2 ? A2 : teamSize === 3 ? A3 : A4
    : teamSize === 2 ? B2 : teamSize === 3 ? B3 : B4

  return (
    <>
      {Object.entries(coords).map(([posStr, coord]) => {
        const posNo = Number(posStr)
        return (
          <div
            key={`drop-${team}-${posNo}`}
            data-slot
            data-slot-team={team}
            data-slot-pos={posNo}
            className={cn(
              'absolute -translate-x-1/2 -translate-y-1/2 h-12 w-12 rounded-full z-20',
              hasActiveDrag && 'cursor-pointer',
            )}
            style={{ left: `${coord.x}%`, top: `${coord.y}%` }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDrop(team, posNo)}
            onClick={() => onTap(team, posNo)}
          />
        )
      })}
    </>
  )
}
