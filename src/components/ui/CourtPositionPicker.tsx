import { useState } from 'react'
import { cn } from '@/lib/utils'
import {
  assignMemberPositionWithSwap,
  type PositionMap,
} from '@/features/meetings/lib/match-form'

interface CourtPositionPickerProps {
  teamTone: 'a' | 'b'
  teamSize: 2 | 3 | 4
  members: { id: string; name: string }[]
  positionMap: PositionMap
  onChange: (positionMap: PositionMap) => void
  selectedIds?: string[]
  onSelectionChange?: (selectedIds: string[], positionMap: PositionMap) => void
  disabledIds?: Set<string>
  error?: string
}

interface PositionCoord {
  x: number
  y: number
}

// A팀 좌표 (코트 왼쪽 절반 기준, %)
// 이미지 참고: 1=좌하, 2=좌상, 3=네트쪽상, 4=네트쪽하
const A_COORDS_4: Record<number, PositionCoord> = {
  1: { x: 18, y: 78 },
  2: { x: 18, y: 22 },
  3: { x: 40, y: 22 },
  4: { x: 40, y: 78 },
}
const A_COORDS_3: Record<number, PositionCoord> = {
  1: { x: 18, y: 50 },
  2: { x: 40, y: 22 },
  3: { x: 40, y: 78 },
}
const A_COORDS_2: Record<number, PositionCoord> = {
  1: { x: 18, y: 50 },
  2: { x: 40, y: 50 },
}

// B팀 좌표 (코트 오른쪽 절반 기준, 미러링)
// 이미지 참고: 1=우상, 2=우하, 3=네트쪽하, 4=네트쪽상
const B_COORDS_4: Record<number, PositionCoord> = {
  1: { x: 82, y: 22 },
  2: { x: 82, y: 78 },
  3: { x: 60, y: 78 },
  4: { x: 60, y: 22 },
}
const B_COORDS_3: Record<number, PositionCoord> = {
  1: { x: 82, y: 50 },
  2: { x: 60, y: 22 },
  3: { x: 60, y: 78 },
}
const B_COORDS_2: Record<number, PositionCoord> = {
  1: { x: 82, y: 50 },
  2: { x: 60, y: 50 },
}

function getTeamCoords(teamTone: 'a' | 'b', teamSize: number): Record<number, PositionCoord> {
  if (teamTone === 'a') {
    if (teamSize === 2) return A_COORDS_2
    if (teamSize === 3) return A_COORDS_3
    return A_COORDS_4
  }
  if (teamSize === 2) return B_COORDS_2
  if (teamSize === 3) return B_COORDS_3
  return B_COORDS_4
}

function findNextFreePosition(positionMap: PositionMap, teamSize: number): number {
  const used = new Set(Object.values(positionMap))
  for (let i = 1; i <= teamSize; i++) {
    if (!used.has(i)) return i
  }
  return 1
}

const TONE_SLOT = {
  a: {
    filled: 'bg-[#516200] text-white ring-[#d1fc00]/40',
    empty: 'bg-white/90 text-[#516200] ring-white/50',
    pulse: 'ring-[#d1fc00] ring-[3px] animate-pulse',
  },
  b: {
    filled: 'bg-[#0059b6] text-white ring-[#0059b6]/30',
    empty: 'bg-white/90 text-[#0059b6] ring-white/50',
    pulse: 'ring-[#0059b6] ring-[3px] animate-pulse',
  },
}

const TONE_MEMBER = {
  a: {
    idle: 'bg-[#d1fc00]/20 text-[#516200] border-[#516200]/15',
    selected: 'bg-[#d1fc00] text-[#3c4a00] border-[#516200] shadow-md',
    assigned: 'opacity-40',
  },
  b: {
    idle: 'bg-[#0059b6]/10 text-[#0059b6] border-[#0059b6]/15',
    selected: 'bg-[#0059b6]/20 text-[#0059b6] border-[#0059b6] shadow-md',
    assigned: 'opacity-40',
  },
}

/** Render just the court (shared between single-team and dual-team views) */
export function CourtView({
  teamTone,
  teamSize,
  positionMap,
  nameMap,
  activeIds,
  selectedMemberId,
  onSlotTap,
}: {
  teamTone: 'a' | 'b'
  teamSize: number
  positionMap: PositionMap
  nameMap: Map<string, string>
  activeIds: string[]
  selectedMemberId: string | null
  onSlotTap: (positionNo: number) => void
}) {
  const coords = getTeamCoords(teamTone, teamSize)
  const toneSlot = TONE_SLOT[teamTone]

  const memberByPosition = new Map<number, string>()
  for (const [memberId, posNo] of Object.entries(positionMap)) {
    if (activeIds.includes(memberId)) {
      memberByPosition.set(posNo, memberId)
    }
  }

  return (
    <>
      {Object.entries(coords).map(([posStr, coord]) => {
        const posNo = Number(posStr)
        const occupantId = memberByPosition.get(posNo)
        const occupantName = occupantId ? nameMap.get(occupantId) : undefined
        const isFilled = Boolean(occupantId)
        const isTarget = selectedMemberId !== null && !isFilled

        return (
          <button
            key={`${teamTone}-${posNo}`}
            type="button"
            onClick={() => onSlotTap(posNo)}
            className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-0.5"
            style={{ left: `${coord.x}%`, top: `${coord.y}%` }}
          >
            <div
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-full ring-2 shadow-md transition-all',
                isFilled ? toneSlot.filled : toneSlot.empty,
                isTarget && toneSlot.pulse,
              )}
            >
              {isFilled ? (
                <span className="text-[11px] font-black leading-none">
                  {(occupantName ?? '?').charAt(0)}
                </span>
              ) : (
                <span className="font-display text-sm font-black">{posNo}</span>
              )}
            </div>
            {isFilled && (
              <span className="max-w-[3.5rem] truncate text-[8px] font-bold text-white drop-shadow-sm">
                {occupantName}
              </span>
            )}
          </button>
        )
      })}
    </>
  )
}

export function CourtPositionPicker({
  teamTone,
  teamSize,
  members,
  positionMap,
  onChange,
  selectedIds,
  onSelectionChange,
  disabledIds,
  error,
}: CourtPositionPickerProps) {
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)

  const selectionMode = selectedIds !== undefined && onSelectionChange !== undefined
  const nameMap = new Map(members.map((m) => [m.id, m.name]))
  const activeIds = selectionMode ? selectedIds : members.map((m) => m.id)

  const memberByPosition = new Map<number, string>()
  for (const [memberId, posNo] of Object.entries(positionMap)) {
    if (activeIds.includes(memberId)) {
      memberByPosition.set(posNo, memberId)
    }
  }

  const handleSlotTap = (positionNo: number) => {
    if (!selectedMemberId) {
      const occupant = memberByPosition.get(positionNo)
      if (occupant) setSelectedMemberId(occupant)
      return
    }

    const result = assignMemberPositionWithSwap({
      selectedIds: activeIds,
      positionMap,
      memberId: selectedMemberId,
      positionNo,
      teamSize,
    })
    if (selectionMode) {
      onSelectionChange(result.selectedIds, result.positionMap)
    } else {
      onChange(result.positionMap)
    }
    setSelectedMemberId(null)
  }

  const handleMemberTap = (memberId: string) => {
    if (disabledIds?.has(memberId)) return

    if (selectionMode) {
      const isSelected = selectedIds.includes(memberId)
      if (isSelected) {
        if (selectedMemberId === memberId) {
          setSelectedMemberId(null)
          return
        }
        setSelectedMemberId(memberId)
      } else {
        if (selectedIds.length >= teamSize) return
        const nextPos = findNextFreePosition(positionMap, teamSize)
        const result = assignMemberPositionWithSwap({
          selectedIds,
          positionMap,
          memberId,
          positionNo: nextPos,
          teamSize,
        })
        onSelectionChange(result.selectedIds, result.positionMap)
      }
    } else {
      if (selectedMemberId === memberId) {
        setSelectedMemberId(null)
      } else {
        setSelectedMemberId(memberId)
      }
    }
  }

  const toneMember = TONE_MEMBER[teamTone]

  return (
    <div className="space-y-3">
      {/* Court */}
      <div className="relative rounded-xl bg-[#d2b48c] p-2">
        <div className="relative aspect-[2/1] overflow-hidden rounded-lg bg-[#2e8b57]">
          {/* Boundary */}
          <div className="absolute inset-[6%] border-2 border-white/60" />
          {/* Net (vertical center) */}
          <div className="absolute top-[6%] bottom-[6%] left-1/2 w-[3px] -translate-x-1/2 bg-[#333]" />
          {/* Net posts */}
          <div className="absolute top-[5%] left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-[#333]" />
          <div className="absolute bottom-[5%] left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-[#333]" />

          {/* Slots */}
          <CourtView
            teamTone={teamTone}
            teamSize={teamSize}
            positionMap={positionMap}
            nameMap={nameMap}
            activeIds={activeIds}
            selectedMemberId={selectedMemberId}
            onSlotTap={handleSlotTap}
          />
        </div>
      </div>

      {/* Member List */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-text-primary">
            {selectionMode ? '멤버 선택' : '대기 명단'}
          </span>
          <span className="rounded-full bg-surface-200 px-2 py-0.5 text-[10px] font-semibold text-surface-600">
            {selectionMode
              ? `${activeIds.length}/${teamSize}`
              : `${members.length - memberByPosition.size}명 남음`}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {members.map((member) => {
            const isOnTeam = activeIds.includes(member.id)
            const assignedPos = isOnTeam ? positionMap[member.id] : undefined
            const isAssigned = assignedPos !== undefined
            const isHighlighted = selectedMemberId === member.id
            const isDisabled = disabledIds?.has(member.id) ?? false

            return (
              <button
                key={member.id}
                type="button"
                disabled={isDisabled}
                onClick={() => handleMemberTap(member.id)}
                className={cn(
                  'flex min-h-9 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold transition-all',
                  isDisabled && 'opacity-30 cursor-not-allowed',
                  isHighlighted
                    ? toneMember.selected
                    : isAssigned
                      ? `${toneMember.idle} ${toneMember.assigned}`
                      : selectionMode && !isOnTeam
                        ? 'bg-surface-100 text-surface-500 border-surface-200'
                        : toneMember.idle,
                )}
              >
                <div
                  className={cn(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-black',
                    isAssigned
                      ? teamTone === 'a'
                        ? 'bg-[#516200] text-white'
                        : 'bg-[#0059b6] text-white'
                      : 'bg-surface-300 text-surface-600',
                  )}
                >
                  {isAssigned ? assignedPos : member.name.charAt(0)}
                </div>
                <span>{member.name}</span>
              </button>
            )
          })}
        </div>
        {error && <p className="text-xs font-semibold text-danger">{error}</p>}
      </div>
    </div>
  )
}
