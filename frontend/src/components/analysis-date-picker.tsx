import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react"

import { SelectDropdown } from "@/components/select-dropdown"
import { onOtherPopoverOpen } from "@/lib/popover"


export function AnalysisDatePicker({ value, onChange, ariaLabel, fullWidth = false, widthClassName = "w-[132px]" }: { value: string; onChange: (value: string) => void; ariaLabel: string; fullWidth?: boolean; widthClassName?: string }) {
  const today = new Date()
  const todayValue = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`
  const [open, setOpen] = useState(false)
  const [viewMonth, setViewMonth] = useState(() => value.slice(0, 7) || todayValue.slice(0, 7))
  const [position, setPosition] = useState<React.CSSProperties>({})
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) setViewMonth(value.slice(0, 7) || todayValue.slice(0, 7))
  }, [open, todayValue, value])

  useEffect(() => {
    if (!open) return
    const updatePosition = () => {
      const trigger = triggerRef.current
      if (!trigger) return
      const rect = trigger.getBoundingClientRect()
      const width = 280
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))
      const spaceBelow = window.innerHeight - rect.bottom
      setPosition(spaceBelow >= 330
        ? { left, top: rect.bottom + 4, width }
        : { bottom: window.innerHeight - rect.top + 4, left, width })
    }
    const closeOnOutsideClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      const clickedDropdown = event.composedPath().some(node => node instanceof HTMLElement && node.hasAttribute("data-dropdown"))
      if (clickedDropdown) return
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return
      setOpen(false)
    }
    updatePosition()
    document.addEventListener("mousedown", closeOnOutsideClick)
    window.addEventListener("resize", updatePosition)
    window.addEventListener("scroll", updatePosition, true)
    // 旁边的下拉（比如月份/范围）打开时，日历自己收起来；日历里的年/月下拉不算
    const unsubscribe = onOtherPopoverOpen(panelRef.current, () => setOpen(false))
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick)
      window.removeEventListener("resize", updatePosition)
      window.removeEventListener("scroll", updatePosition, true)
      unsubscribe()
    }
  }, [open])

  const [year, month] = viewMonth.split("-").map(Number)
  const firstWeekday = new Date(year, month - 1, 1).getDay()
  const daysInMonth = new Date(year, month, 0).getDate()
  const cells = [...Array.from({ length: firstWeekday }, () => null), ...Array.from({ length: daysInMonth }, (_, index) => index + 1)]
  const yearOptions = useMemo(
    () => Array.from({ length: 26 }, (_, index) => today.getFullYear() + 1 - index).map(item => ({ value: String(item), label: `${item}年` })),
    [today],
  )
  const calendarMonthOptions = useMemo(
    () => Array.from({ length: 12 }, (_, index) => ({ value: String(index + 1).padStart(2, "0"), label: `${index + 1}月` })),
    [],
  )
  const moveMonth = (offset: number) => {
    const next = new Date(year, month - 1 + offset, 1)
    setViewMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`)
  }
  const displayValue = value
    ? `${value.slice(0, 4)}年${Number(value.slice(5, 7))}月${Number(value.slice(8, 10))}日`
    : "选择日期"

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        onClick={() => setOpen(current => !current)}
        className={`flex h-7 ${fullWidth ? "w-full" : `${widthClassName} shrink-0`} items-center gap-1 rounded-[4px] border border-[#e1e4e7] bg-white px-2 text-left text-[11px] ${value ? "text-[#2b2f36]" : "text-[#8f959e]"}`}
      >
        <CalendarDays className="h-3.5 w-3.5 shrink-0 text-[#8f959e]" />
        <span className="min-w-0 flex-1 truncate">{displayValue}</span>
        <ChevronDown className={`h-3 w-3 shrink-0 text-[#8f959e] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <div ref={panelRef} className="fixed z-[2147483646] rounded-[6px] border border-[#e1e4e7] bg-white p-3 shadow-[0_8px_24px_rgba(31,35,41,0.14)]" style={position}>
          <div className="mb-2.5 flex items-center gap-1.5">
            <button type="button" onClick={() => moveMonth(-1)} className="flex h-7 w-7 items-center justify-center rounded-[3px] text-[#646a73] hover:bg-[#f5f6f7]" aria-label="上个月"><ChevronLeft className="h-3.5 w-3.5" /></button>
            <SelectDropdown value={String(year)} options={yearOptions} onChange={next => setViewMonth(`${next}-${String(month).padStart(2, "0")}`)} size="sm" className="w-[92px]" buttonClassName="!h-7 !border !border-[#e1e4e7] !bg-white !px-2 !text-[12px] !shadow-none" dropdownWidth={104} menuMaxHeight={260} />
            <SelectDropdown value={String(month).padStart(2, "0")} options={calendarMonthOptions} onChange={next => setViewMonth(`${year}-${next}`)} size="sm" className="w-[72px]" buttonClassName="!h-7 !border !border-[#e1e4e7] !bg-white !px-2 !text-[12px] !shadow-none" dropdownWidth={80} menuMaxHeight={260} />
            <button type="button" onClick={() => moveMonth(1)} className="ml-auto flex h-7 w-7 items-center justify-center rounded-[3px] text-[#646a73] hover:bg-[#f5f6f7]" aria-label="下个月"><ChevronRight className="h-3.5 w-3.5" /></button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 border-b border-[#f0f0f0] pb-1">
            {["日", "一", "二", "三", "四", "五", "六"].map(weekday => <div key={weekday} className="flex h-6 items-center justify-center text-[10px] text-[#8f959e]">{weekday}</div>)}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-0.5">
            {cells.map((day, index) => {
              if (!day) return <span key={`empty-${index}`} className="h-7" />
              const dateValue = `${viewMonth}-${String(day).padStart(2, "0")}`
              const selected = dateValue === value
              const isToday = dateValue === todayValue
              return <button key={dateValue} type="button" onClick={() => { onChange(dateValue); setOpen(false) }} className={`flex h-7 items-center justify-center rounded-[3px] text-[11px] ${selected ? "bg-[#3370ff] text-white" : isToday ? "bg-[#f0f5ff] text-[#3370ff]" : "text-[#2b2f36] hover:bg-[#f5f6f7]"}`}>{day}</button>
            })}
          </div>
          <div className="mt-2 flex justify-end border-t border-[#f0f0f0] pt-2">
            <button type="button" onClick={() => { onChange(todayValue); setOpen(false) }} className="h-6 px-2 text-[11px] text-[#3370ff] hover:text-[#285dcc]">今天</button>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
