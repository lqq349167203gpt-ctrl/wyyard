import { useState, useRef, useEffect, memo } from "react"
import { ChevronDown } from "lucide-react"
import type { Space } from "@/lib/api"

export const SpaceDropdown = memo(function SpaceDropdown({ spaces, selectedSpaceId, onSelect }: { spaces: Space[]; selectedSpaceId: string; onSelect: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener("mousedown", handler)
    }
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  if (spaces.length === 0) return null

  const selectedName = spaces.find(s => s.id === selectedSpaceId)?.name || spaces[0]?.name || ""

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        className="flex items-center gap-1 px-1 py-0.5 rounded hover:bg-[#f7f8fa] transition-colors"
        onClick={() => setOpen(!open)}
      >
        <span className="text-[16px] text-[#2b2f36] font-medium whitespace-nowrap">{selectedName}</span>
        <ChevronDown className="h-4 w-4 text-[#8f959e]" />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-lg border border-[#e8e8e8] py-1 z-50 min-w-[140px]">
          {spaces.map(s => (
            <button
              key={s.id}
              className={`w-full text-left px-4 py-2 text-[13px] hover:bg-[#f7f8fa] ${s.id === selectedSpaceId ? "text-[#3370ff] bg-[#f0f5ff]" : "text-[#2b2f36]"}`}
              onClick={() => { onSelect(s.id); setOpen(false) }}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
})
