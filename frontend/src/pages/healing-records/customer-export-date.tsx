import { useState } from "react"
import { SelectDropdown } from "@/components/select-dropdown"

type Mode = "all" | "day" | "month" | "year" | "custom"
type Range = { date_from: string; date_to: string }

export function CustomerExportDate({ value, onChange, onModeChange, initialMode = 'all' }: { value: Range; onChange: (range: Range) => void; onModeChange: (mode: Mode) => void; initialMode?: Mode }) {
  const today = new Date().toLocaleDateString("sv-SE")
  const [mode, setMode] = useState<Mode>(initialMode)
  const [day, setDay] = useState(today)
  const [month, setMonth] = useState(today.slice(0, 7))
  const [year, setYear] = useState(today.slice(0, 4))
  const yearOptions = Array.from({ length: Number(today.slice(0, 4)) - 1989 + 5 }, (_, i) => String(Number(today.slice(0, 4)) + 5 - i))
    .map(value => ({ value, label: `${value}年` }))
  const monthRange = (value: string) => {
    const [y, m] = value.split("-").map(Number)
    return { date_from: `${value}-01`, date_to: `${value}-${new Date(y, m, 0).getDate()}` }
  }
  const changeMode = (next: Mode) => {
    setMode(next)
    onModeChange(next)
    onChange(next === "all" ? { date_from: "", date_to: "" }
      : next === "day" ? { date_from: day, date_to: day }
      : next === "month" ? monthRange(month)
      : next === "year" ? { date_from: `${year}-01-01`, date_to: `${year}-12-31` }
      : { date_from: value.date_from || `${today.slice(0, 7)}-01`, date_to: value.date_to || today })
  }
  const inputClass = "h-8 min-w-0 w-full rounded-[4px] border border-[#e1e4e7] bg-white px-2 text-[12px] text-[#2b2f36] outline-none focus:border-[#3370ff]"
  return <div className="space-y-2">
    <div className="text-[12px] text-[#646a73]">引流日期</div>
    <div className="grid grid-cols-5 gap-2">
      {([['all', '全部'], ['day', '按天'], ['month', '按月'], ['year', '按年'], ['custom', '自选']] as const).map(([key, label]) =>
        <button key={key} type="button" onClick={() => changeMode(key)} className={`h-8 rounded-[4px] border text-[12px] ${mode === key ? "border-[#3370ff] bg-[#f0f5ff] text-[#3370ff]" : "border-[#dee0e3] bg-white text-[#4e535a] hover:bg-[#f5f6f7]"}`}>{label}</button>)}
    </div>
    {mode === "day" && <input aria-label="引流日期" type="date" className={inputClass} value={day} onChange={event => { setDay(event.target.value); onChange({ date_from: event.target.value, date_to: event.target.value }) }} />}
    {mode === "month" && <div className="grid grid-cols-2 gap-2">
      <SelectDropdown value={month.slice(0, 4)} options={yearOptions} onChange={value => { const next = `${value}-${month.slice(5)}`; setMonth(next); onChange(monthRange(next)) }} className="w-full" />
      <SelectDropdown value={month.slice(5)} options={Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1).padStart(2, '0'), label: `${i + 1}月` }))} onChange={value => { const next = `${month.slice(0, 4)}-${value}`; setMonth(next); onChange(monthRange(next)) }} className="w-full" />
    </div>}
    {mode === "year" && <SelectDropdown value={year} options={yearOptions} onChange={value => { setYear(value); onChange({ date_from: `${value}-01-01`, date_to: `${value}-12-31` }) }} className="w-full" />}
    {mode === "custom" && <div className="flex items-center gap-2">
      <input aria-label="引流开始日期" type="date" className={inputClass} value={value.date_from} onChange={event => onChange({ ...value, date_from: event.target.value })} />
      <span className="text-[12px] text-[#8f959e]">至</span>
      <input aria-label="引流结束日期" type="date" className={inputClass} value={value.date_to} onChange={event => onChange({ ...value, date_to: event.target.value })} />
    </div>}
  </div>
}
