import { useMemo, type ReactNode } from "react"

import { AnalysisDatePicker } from "@/components/analysis-date-picker"
import { SelectDropdown } from "@/components/select-dropdown"
import {
  buildPeriodOptions, datePresetOf, monthRange, selectedMonthRange, selectedPeriodValue, todayRange, weekRange, yearRange,
  type DatePreset, type DateRange,
} from "@/lib/date-ranges"

const PRESETS: Array<{ value: Exclude<DatePreset, "custom">; label: string }> = [
  { value: "today", label: "当天" },
  { value: "week", label: "本周" },
  { value: "month", label: "本月" },
  { value: "year", label: "本年" },
  { value: "all", label: "全部" },
]

/** 统计周期栏：年份/月份下拉 + 自定义日期 + 当天/本周/本月/本年/全部（与自定义筛选同一套） */
export function AnalysisPeriodFilter({ dateFrom, dateTo, onChange, label = "统计周期", hint, leading, inlineLabel = false, variant = "bar" }: {
  dateFrom: string
  dateTo: string
  onChange: (range: DateRange) => void
  label?: string
  hint?: string
  /** 同一栏里排在最前面的控件（比如组织/俱乐部筛选） */
  leading?: ReactNode
  /** true 时标签显示为一行小字（跟前面的控件并排），而不是两行的标题块 */
  inlineLabel?: boolean
  /** bar：灰底一栏（自定义筛选、转化分析用）；inline：无底色的一行，快捷档做成分段按钮（列表页用） */
  variant?: "bar" | "inline"
}) {
  const options = useMemo(() => buildPeriodOptions(), [])
  const preset = datePresetOf(dateFrom, dateTo)

  const applyPreset = (value: Exclude<DatePreset, "custom">) => {
    if (value === "today") return onChange(todayRange())
    if (value === "week") return onChange(weekRange())
    if (value === "month") return onChange(monthRange())
    if (value === "year") return onChange(yearRange())
    onChange({ date_from: "", date_to: "" })
  }
  const applyPeriod = (value: string) => {
    if (value.startsWith("year-")) {
      const year = Number(value.slice(5))
      if (year) onChange(yearRange(year))
      return
    }
    if (value.startsWith("month-")) {
      const range = selectedMonthRange(value.slice(6))
      if (range) onChange(range)
    }
  }

  if (variant === "inline") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {label && <span className="text-[11px] font-medium text-[#4e535a]">{label}</span>}
        <SelectDropdown
          value={selectedPeriodValue(dateFrom, dateTo)}
          options={options}
          onChange={applyPeriod}
          placeholder="选择年份或月份"
          placeholderColor="text-[#8f959e]"
          size="sm"
          className="w-[150px]"
          buttonClassName="!h-7 !rounded-[4px] !border !border-[#e1e4e7] !bg-white !px-2 !text-[11px] !shadow-none"
          dropdownWidth={176}
          menuMaxHeight={320}
        />
        <span className="text-[10px] text-[#b0b5bb]">或自定义</span>
        <div className="flex items-center gap-1.5">
          <AnalysisDatePicker value={dateFrom} onChange={value => onChange({ date_from: value, date_to: dateTo })} ariaLabel={`${label}开始日期`} />
          <span className="text-[11px] text-[#8f959e]">至</span>
          <AnalysisDatePicker value={dateTo} onChange={value => onChange({ date_from: dateFrom, date_to: value })} ariaLabel={`${label}结束日期`} />
        </div>
        <div className="flex items-center rounded-[4px] border border-[#e1e4e7] bg-white p-0.5">
          {PRESETS.map(item => (
            <button
              key={item.value}
              type="button"
              onClick={() => applyPreset(item.value)}
              className={`h-6 rounded-[3px] px-2.5 text-[11px] ${preset === item.value ? "bg-[#f0f5ff] text-[#3370ff]" : "text-[#646a73] hover:text-[#2b2f36]"}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[4px] bg-[#f7f8fa] px-2.5 py-2">
      {leading}
      {inlineLabel ? (
        <span className="text-[11px] font-medium text-[#4e535a]">{label}</span>
      ) : (
        <div className="mr-1 min-w-[190px]">
          <div className="text-[12px] font-medium text-[#4e535a]">{label}</div>
          {hint && <div className="mt-0.5 text-[10px] text-[#8f959e]">{hint}</div>}
        </div>
      )}
      <SelectDropdown
        value={selectedPeriodValue(dateFrom, dateTo)}
        options={options}
        onChange={applyPeriod}
        placeholder="选择年份或月份"
          placeholderColor="text-[#8f959e]"
        size="sm"
        className="w-[156px]"
        buttonClassName="!h-7 !rounded-[4px] !border !border-[#e1e4e7] !bg-white !px-2 !text-[11px] !shadow-none"
        dropdownWidth={176}
        menuMaxHeight={320}
      />
      <span className="text-[10px] text-[#b0b5bb]">或自定义</span>
      <div className="flex flex-wrap items-center gap-1.5">
        <AnalysisDatePicker value={dateFrom} onChange={value => onChange({ date_from: value, date_to: dateTo })} ariaLabel={`${label}开始日期`} />
        <span className="text-[11px] text-[#8f959e]">至</span>
        <AnalysisDatePicker value={dateTo} onChange={value => onChange({ date_from: dateFrom, date_to: value })} ariaLabel={`${label}结束日期`} />
      </div>
      {PRESETS.map(item => (
        <button
          key={item.value}
          type="button"
          onClick={() => applyPreset(item.value)}
          className={`h-6 rounded-[3px] px-2 text-[11px] ${preset === item.value ? "bg-[#1f2329] text-white" : "border border-[#e1e4e7] bg-white text-[#646a73]"}`}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
