import { useState, useRef, useEffect, memo, useCallback, useMemo } from "react"
import { createPortal } from "react-dom"
import type { Course } from "@/lib/api"

interface CourseDropdownProps {
  courses: Course[]
  value: string // course_id
  onChange: (courseId: string) => void
  placeholder?: string
  className?: string
  dropdownWidth?: number
}

export const CourseDropdown = memo(function CourseDropdown({
  courses, value, onChange, placeholder = "选择课程", className = "",
  dropdownWidth = 220,
}: CourseDropdownProps) {
  const [open, setOpen] = useState(false)
  const [hoveredType, setHoveredType] = useState<string | null>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const ref = useRef<HTMLDivElement | null>(null)
  const dropdownRef = useRef<HTMLDivElement | null>(null)

  // 按类型分组
  const grouped = useMemo(() => {
    const map = new Map<string, Course[]>()
    for (const c of courses) {
      const arr = map.get(c.type) || []
      arr.push(c)
      map.set(c.type, arr)
    }
    return map
  }, [courses])

  const types = useMemo(() => [...grouped.keys()], [grouped])

  const updatePos = useCallback(() => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect()
      setPos({ top: rect.bottom + 4, left: rect.left })
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
        setHoveredType(null)
      }
    }
    if (open) {
      document.addEventListener("pointerdown", handler)
    }
    return () => document.removeEventListener("pointerdown", handler)
  }, [open])

  const selectedCourse = courses.find(c => c.id === value)
  const displayText = selectedCourse?.name || ""

  // 选中课程所在类型
  const selectedType = selectedCourse?.type || null

  const dropdown = open ? createPortal(
    <div
      ref={dropdownRef}
      className="fixed bg-white rounded-md border border-[#e8e8e8] shadow-lg z-[2147483647]"
      style={{ top: pos.top, left: pos.left, width: dropdownWidth }}
    >
      <div className="flex">
        {/* 类型列表 */}
        <div className="w-[110px] border-r border-[#f0f1f2] max-h-[200px] overflow-y-auto">
          {types.map(t => (
            <button
              key={t}
              type="button"
              className={`w-full text-left px-2 py-1.5 text-[11px] hover:bg-[#f7f8fa] ${
                t === selectedType && hoveredType === null ? "text-[#3370ff] bg-[#f0f5ff]" : "text-[#2b2f36]"
              } ${t === hoveredType ? "text-[#3370ff] bg-[#f0f5ff]" : ""}`}
              onMouseEnter={() => setHoveredType(t)}
            >
              {t}
            </button>
          ))}
        </div>
        {/* 课程列表 */}
        <div className="flex-1 max-h-[200px] overflow-y-auto">
          {(hoveredType || selectedType) && (() => {
            const type = hoveredType || selectedType!
            const items = grouped.get(type) || []
            if (!items.length) {
              return <div className="px-2 py-1.5 text-[11px] text-[#c9cdd4]">无课程</div>
            }
            return items.map(c => (
              <button
                key={c.id}
                type="button"
                className={`w-full text-left px-2 py-1.5 text-[11px] hover:bg-[#f7f8fa] ${
                  c.id === value && (hoveredType === null || hoveredType === selectedType) ? "text-[#3370ff] bg-[#f0f5ff]" : "text-[#2b2f36]"
                }`}
                onClick={() => {
                  onChange(c.id)
                  setOpen(false)
                  setHoveredType(null)
                }}
              >
                {c.name}
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
        className="flex items-center justify-between w-full h-7 px-2 text-[11px] rounded-md border-[0.5px] border-[#dee0e3] bg-transparent"
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
