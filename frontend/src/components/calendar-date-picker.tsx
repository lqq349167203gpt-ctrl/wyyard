import { useState, useRef, useEffect, memo } from "react"
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react"

const today = new Date().toISOString().split("T")[0]

function formatDateChinese(d: string): string {
  const [y, m, day] = d.split("-")
  return `${y}年${parseInt(m)}月${parseInt(day)}日`
}

export const CalendarDatePicker = memo(function CalendarDatePicker({ detailDate, onSelectDate }: { detailDate: string; onSelectDate: (date: string) => void }) {
  const [open, setOpen] = useState(false)
  const [month, setMonth] = useState(() => detailDate.substring(0, 7))
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest("[data-dropdown]")) return
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener("mousedown", handler)
    }
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  const displayMonth = month || today.substring(0, 7)
  const [year, monthNum] = displayMonth.split("-").map(Number)
  const firstDay = new Date(year, monthNum - 1, 1)
  const lastDay = new Date(year, monthNum, 0)
  const startWeekday = firstDay.getDay()
  const daysInMonth = lastDay.getDate()
  const cells: (number | null)[] = []
  for (let i = 0; i < startWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  return (
    <div data-dropdown className="relative inline-block shrink-0">
      <button
        className="flex items-center gap-1 px-1 py-0.5 rounded hover:bg-[#f7f8fa] transition-colors"
        onClick={() => {
          setMonth(detailDate.substring(0, 7))
          setOpen(!open)
        }}
      >
        <span className="text-[16px] text-[#2b2f36] font-medium whitespace-nowrap">
          {formatDateChinese(detailDate)}
        </span>
        <ChevronDown className="h-4 w-4 text-[#8f959e]" />
      </button>
      {open && (
        <div ref={ref} className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-lg border border-[#e8e8e8] p-3 z-50 w-[280px]">
          <div className="flex items-center justify-between mb-3">
            <button
              className="h-6 w-6 flex items-center justify-center rounded hover:bg-[#f0f0f0]"
              onClick={() => setMonth(`${monthNum === 1 ? year - 1 : year}-${String(monthNum === 1 ? 12 : monthNum - 1).padStart(2, "0")}`)}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="text-[13px] font-medium text-[#2b2f36]">{year}年{monthNum}月</span>
            <button
              className="h-6 w-6 flex items-center justify-center rounded hover:bg-[#f0f0f0]"
              onClick={() => setMonth(`${monthNum === 12 ? year + 1 : year}-${String(monthNum === 12 ? 1 : monthNum + 1).padStart(2, "0")}`)}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {["日", "一", "二", "三", "四", "五", "六"].map((w) => (
              <div key={w} className="text-center text-[10px] text-[#8f959e] py-1">{w}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((day, i) => {
              if (!day) return <div key={`empty-${i}`} className="h-7" />
              const dateStr = `${displayMonth}-${String(day).padStart(2, "0")}`
              const isSelected = dateStr === detailDate
              const isTodayDate = dateStr === today
              return (
                <button
                  key={dateStr}
                  className={`h-7 w-7 flex items-center justify-center rounded text-[12px] leading-none transition-colors ${
                    isSelected ? "bg-[#3370ff] text-white" : isTodayDate ? "bg-[#f0f5ff] text-[#3370ff]" : "hover:bg-[#f7f8fa] text-[#2b2f36]"
                  }`}
                  onClick={() => {
                    onSelectDate(dateStr)
                    setOpen(false)
                  }}
                >
                  <span className="inline-flex items-center justify-center h-4">{day}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
})
