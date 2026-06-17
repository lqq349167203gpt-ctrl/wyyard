import { useState, useRef, useEffect, memo, useCallback } from "react"
import { createPortal } from "react-dom"
import type { Space } from "@/lib/api"

interface SpaceRoomDropdownProps {
  spaces: Space[]
  spaceId: string
  roomId: string
  onSpaceChange: (spaceId: string) => void
  onRoomChange: (roomId: string) => void
  placeholder?: string
  className?: string
}

export const SpaceRoomDropdown = memo(function SpaceRoomDropdown({
  spaces, spaceId, roomId, onSpaceChange, onRoomChange, placeholder = "选择空间", className = "",
}: SpaceRoomDropdownProps) {
  const [open, setOpen] = useState(false)
  const [hoveredSpaceId, setHoveredSpaceId] = useState<string | null>(null)
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 })
  const ref = useRef<HTMLDivElement | null>(null)
  const dropdownRef = useRef<HTMLDivElement | null>(null)

  const updatePos = useCallback(() => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect()
      setPos({ top: rect.bottom + 4, left: rect.left, width: rect.width })
    }
  }, [])

  useEffect(() => {
    if (open) {
      updatePos()
      window.addEventListener("scroll", updatePos, true)
      window.addEventListener("resize", updatePos)
      return () => {
        window.removeEventListener("scroll", updatePos, true)
        window.removeEventListener("resize", updatePos)
      }
    }
  }, [open, updatePos])

  useEffect(() => {
    const handler = (e: PointerEvent) => {
      if (
        ref.current && !ref.current.contains(e.target as Node) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
        setHoveredSpaceId(null)
      }
    }
    if (open) {
      document.addEventListener("pointerdown", handler)
    }
    return () => document.removeEventListener("pointerdown", handler)
  }, [open])

  const selectedSpace = spaces.find(s => s.id === spaceId)
  const selectedRoom = selectedSpace?.rooms?.find(r => r.id === roomId)
  const displayText = selectedSpace
    ? selectedRoom ? `${selectedSpace.name}/${selectedRoom.name}` : selectedSpace.name
    : ""

  const dropdown = open ? createPortal(
    <div
      ref={dropdownRef}
      className="fixed bg-white rounded-md border border-[#e8e8e8] shadow-lg z-[2147483647]"
      style={{ top: pos.top, left: pos.left, minWidth: 200 }}
    >
      <div className="flex">
        {/* 空间列表 */}
        <div className="w-[100px] border-r border-[#f0f1f2] max-h-[200px] overflow-y-auto">
          {spaces.map(s => (
            <button
              key={s.id}
              type="button"
              className={`w-full text-left px-2 py-1.5 text-[12px] hover:bg-[#f7f8fa] ${
                s.id === spaceId ? "text-[#3370ff] bg-[#f0f5ff]" : "text-[#2b2f36]"
              }`}
              onMouseEnter={() => setHoveredSpaceId(s.id)}
              onClick={() => {
                onSpaceChange(s.id)
                const firstRoom = s.rooms?.[0]?.id || ""
                onRoomChange(firstRoom)
                if (!s.rooms?.length) {
                  setOpen(false)
                }
              }}
            >
              {s.name}
            </button>
          ))}
        </div>
        {/* 房间列表 */}
        <div className="flex-1 max-h-[200px] overflow-y-auto">
          {(hoveredSpaceId || spaceId) && (() => {
            const currentSpace = spaces.find(s => s.id === (hoveredSpaceId || spaceId))
            if (!currentSpace?.rooms?.length) {
              return <div className="px-2 py-1.5 text-[12px] text-[#c9cdd4]">无房间</div>
            }
            return currentSpace.rooms.map(r => (
              <button
                key={r.id}
                type="button"
                className={`w-full text-left px-2 py-1.5 text-[12px] hover:bg-[#f7f8fa] ${
                  r.id === roomId && (hoveredSpaceId === null || hoveredSpaceId === spaceId) ? "text-[#3370ff] bg-[#f0f5ff]" : "text-[#2b2f36]"
                }`}
                onClick={() => {
                  if (hoveredSpaceId && hoveredSpaceId !== spaceId) {
                    onSpaceChange(hoveredSpaceId)
                  }
                  onRoomChange(r.id)
                  setOpen(false)
                  setHoveredSpaceId(null)
                }}
              >
                {r.name}
              </button>
            ))
          })()}
        </div>
      </div>
    </div>,
    document.body
  ) : null

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        className="flex items-center justify-between w-full h-7 px-1.5 text-[12px] rounded-md border-[0.5px] border-[#dee0e3] bg-transparent"
        onClick={() => setOpen(!open)}
      >
        <span className={`truncate ${displayText ? "text-[#2b2f36]" : "text-[#c9cdd4]"}`}>
          {displayText || placeholder}
        </span>
      </button>
      {dropdown}
    </div>
  )
})
