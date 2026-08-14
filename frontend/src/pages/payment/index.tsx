import { useMemo, useState } from "react"
import { ChevronDown, Download } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { paymentExportApi, type PaymentExportParams, type PaymentExportRangeType } from "@/lib/api"
import { UnifiedPaymentContent } from "./unified-payment"

const TABS = [
  { key: "membership_card", label: "会员卡" },
  { key: "group_case", label: "觉醒游戏" },
  { key: "emotional_release", label: "情绪释放" },
  { key: "oh_card_reading", label: "OH卡诊断" },
  { key: "energy_knot", label: "能量结" },
  { key: "internal_course", label: "内部课程" },
  { key: "tea_seat_fee", label: "茶位费" },
  { key: "offline_course", label: "线下落地课程" },
  { key: "other", label: "其他项目" },
]

const EXPORT_RANGE_OPTIONS: { value: PaymentExportRangeType; label: string }[] = [
  { value: "day", label: "按天" },
  { value: "month", label: "按月" },
  { value: "year", label: "按年" },
  { value: "custom", label: "自定义" },
]

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, index) => {
  const value = String(index + 1).padStart(2, "0")
  return { value, label: `${index + 1}月` }
})

const VALID_TAB_KEYS = new Set(TABS.map(tab => tab.key))
const currentDate = new Date().toLocaleDateString("sv-SE")
const currentMonth = currentDate.slice(0, 7)
const currentYear = currentDate.slice(0, 4)
const currentMonthStart = `${currentMonth}-01`

function getMonthEnd(month: string) {
  const [year, monthNumber] = month.split("-").map(Number)
  if (!year || !monthNumber) return ""
  const lastDay = new Date(year, monthNumber, 0).getDate()
  return `${month}-${String(lastDay).padStart(2, "0")}`
}

export default function PaymentPage() {
  const [activeTab, setActiveTab] = useState(() => {
    try {
      const saved = localStorage.getItem("tab_payment")
      if (saved && VALID_TAB_KEYS.has(saved)) return saved
    } catch {}
    return "membership_card"
  })
  const [exportDialogOpen, setExportDialogOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState("")
  const [rangeType, setRangeType] = useState<PaymentExportRangeType>("month")
  const [selectedDate, setSelectedDate] = useState(currentDate)
  const [selectedMonth, setSelectedMonth] = useState(currentMonth)
  const [selectedYear, setSelectedYear] = useState(currentYear)
  const [dateFrom, setDateFrom] = useState(currentMonthStart)
  const [dateTo, setDateTo] = useState(currentDate)

  const yearOptions = useMemo(() => {
    const year = Number(currentYear)
    return Array.from({ length: year - 1994 }, (_, index) => String(year + 5 - index))
  }, [])

  const rangeSummary = useMemo(() => {
    if (rangeType === "day") return selectedDate
    if (rangeType === "month") return `${selectedMonth}-01 至 ${getMonthEnd(selectedMonth)}`
    if (rangeType === "year") return `${selectedYear}-01-01 至 ${selectedYear}-12-31`
    return `${dateFrom || "请选择"} 至 ${dateTo || "请选择"}`
  }, [dateFrom, dateTo, rangeType, selectedDate, selectedMonth, selectedYear])

  const handleTabChange = (key: string) => {
    setActiveTab(key)
    try { localStorage.setItem("tab_payment", key) } catch {}
  }

  const openExportDialog = () => {
    setExportError("")
    setExportDialogOpen(true)
  }

  const handleExport = async () => {
    if (exporting) return
    if (rangeType === "custom" && (!dateFrom || !dateTo)) {
      setExportError("请选择完整的开始日期和结束日期")
      return
    }
    if (rangeType === "custom" && dateFrom > dateTo) {
      setExportError("开始日期不能晚于结束日期")
      return
    }

    const params: PaymentExportParams = { range_type: rangeType }
    if (rangeType === "day") params.period = selectedDate
    if (rangeType === "month") params.period = selectedMonth
    if (rangeType === "year") params.period = selectedYear
    if (rangeType === "custom") {
      params.date_from = dateFrom
      params.date_to = dateTo
    }

    setExporting(true)
    setExportError("")
    try {
      const { blob, filename } = await paymentExportApi.download(params)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = filename
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
      setExportDialogOpen(false)
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "导出失败，请稍后重试")
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="dv-root bg-[#f4f5f6] h-full p-4 flex flex-col gap-3">
      <style>{`.dv-root { font-family: -apple-system, "PingFang SC", "Helvetica Neue", sans-serif; } .dv-root th, .dv-root td { padding-left: 4px; padding-right: 4px; font-size: 12px; } .dv-root th.pl-4, .dv-root td.pl-4 { padding-left: 16px; } .dv-root th.pr-4, .dv-root td.pr-4 { padding-right: 16px; }`}</style>

      <div className="flex items-center rounded-xl bg-white shadow-[0_1px_3px_rgba(33,38,49,.06)] px-5 h-[52px]">
        <div className="flex flex-1 items-center gap-6">
          {TABS.map(tab => (
            <button
              key={tab.key}
              className={`relative whitespace-nowrap px-1 pb-0 text-[14px] transition-colors ${
                activeTab === tab.key
                  ? "text-[#3370ff]"
                  : "text-[#2b2f36] hover:text-[#4e535a]"
              }`}
              onClick={() => handleTabChange(tab.key)}
            >
              {tab.label}
              {activeTab === tab.key && (
                <span className="absolute bottom-[-16px] left-0 right-0 h-[3px] bg-[#3370ff] rounded-t-sm" />
              )}
            </button>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="ml-4 h-8 shrink-0 rounded-[4px] px-3 text-[12px] font-normal"
          onClick={openExportDialog}
        >
          <Download className="mr-1 h-3.5 w-3.5" />
          导出
        </Button>
      </div>

      <UnifiedPaymentContent key={activeTab} embedded filterTypes={[activeTab as any]} />

      <Dialog
        open={exportDialogOpen}
        onOpenChange={(open) => {
          if (!exporting) setExportDialogOpen(open)
          if (!open) setExportError("")
        }}
      >
        <DialogContent className="w-[420px] max-w-[90vw] p-0 gap-0 rounded-[4px]" initialFocus={false}>
          <DialogHeader className="px-6 pt-4 pb-3 border-b border-[#f0f0f0] gap-1">
            <DialogTitle className="text-[14px] font-normal text-[#1f2329]">导出付费记录</DialogTitle>
            <DialogDescription className="text-[12px] text-[#8f959e]">
              导出所有付费类型，并按成交日期从近到远排列
            </DialogDescription>
          </DialogHeader>

          <div className="px-5 py-4 space-y-4">
            <div className="space-y-2">
              <div className="text-[12px] text-[#4e535a]">导出方式</div>
              <div className="grid grid-cols-4 gap-2">
                {EXPORT_RANGE_OPTIONS.map(option => (
                  <button
                    key={option.value}
                    type="button"
                    className={`h-8 rounded-[4px] border text-[12px] font-normal transition-colors ${
                      rangeType === option.value
                        ? "border-[#3370ff] bg-[#f0f5ff] text-[#3370ff]"
                        : "border-[#dee0e3] bg-white text-[#4e535a] hover:bg-[#f5f6f7]"
                    }`}
                    onClick={() => {
                      setRangeType(option.value)
                      setExportError("")
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-[12px] text-[#4e535a]">
                {rangeType === "day" && "选择日期"}
                {rangeType === "month" && "选择月份"}
                {rangeType === "year" && "选择年份"}
                {rangeType === "custom" && "时间范围"}
              </div>
              {rangeType === "day" && (
                <input
                  type="date"
                  value={selectedDate}
                  onChange={event => setSelectedDate(event.target.value)}
                  className="h-8 w-full rounded-[4px] border border-input bg-white px-2 text-[12px] text-[#2b2f36] outline-none focus:border-[#3370ff]"
                />
              )}
              {rangeType === "month" && (
                <div className="flex items-center gap-2">
                  <div className="group relative min-w-0 flex-1">
                    <select
                      aria-label="导出年份"
                      value={selectedMonth.slice(0, 4)}
                      onChange={event => setSelectedMonth(`${event.target.value}-${selectedMonth.slice(5, 7)}`)}
                      className="h-8 w-full cursor-pointer appearance-none rounded-[4px] border border-input bg-white pl-2 pr-8 text-[12px] text-[#2b2f36] outline-none hover:border-[#c9cdd4] focus:border-[#3370ff]"
                    >
                      {yearOptions.map(year => <option key={year} value={year}>{year}年</option>)}
                    </select>
                    <ChevronDown
                      aria-hidden="true"
                      strokeWidth={1.5}
                      className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#8f959e] transition-colors group-hover:text-[#646a73]"
                    />
                  </div>
                  <div className="group relative min-w-0 flex-1">
                    <select
                      aria-label="导出月份"
                      value={selectedMonth.slice(5, 7)}
                      onChange={event => setSelectedMonth(`${selectedMonth.slice(0, 4)}-${event.target.value}`)}
                      className="h-8 w-full cursor-pointer appearance-none rounded-[4px] border border-input bg-white pl-2 pr-8 text-[12px] text-[#2b2f36] outline-none hover:border-[#c9cdd4] focus:border-[#3370ff]"
                    >
                      {MONTH_OPTIONS.map(month => (
                        <option key={month.value} value={month.value}>{month.label}</option>
                      ))}
                    </select>
                    <ChevronDown
                      aria-hidden="true"
                      strokeWidth={1.5}
                      className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#8f959e] transition-colors group-hover:text-[#646a73]"
                    />
                  </div>
                </div>
              )}
              {rangeType === "year" && (
                <div className="group relative">
                  <select
                    aria-label="导出年份"
                    value={selectedYear}
                    onChange={event => setSelectedYear(event.target.value)}
                    className="h-8 w-full cursor-pointer appearance-none rounded-[4px] border border-input bg-white pl-2 pr-8 text-[12px] text-[#2b2f36] outline-none hover:border-[#c9cdd4] focus:border-[#3370ff]"
                  >
                    {yearOptions.map(year => <option key={year} value={year}>{year}年</option>)}
                  </select>
                  <ChevronDown
                    aria-hidden="true"
                    strokeWidth={1.5}
                    className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#8f959e] transition-colors group-hover:text-[#646a73]"
                  />
                </div>
              )}
              {rangeType === "custom" && (
                <div className="flex items-center h-8 rounded-[4px] border border-input overflow-hidden">
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={event => setDateFrom(event.target.value)}
                    className="h-full min-w-0 flex-1 border-none bg-transparent px-2 text-[12px] text-[#2b2f36] outline-none"
                  />
                  <span className="px-1 text-[12px] text-[#8f959e]">~</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={event => setDateTo(event.target.value)}
                    className="h-full min-w-0 flex-1 border-none bg-transparent px-2 text-[12px] text-[#2b2f36] outline-none"
                  />
                </div>
              )}
            </div>

            <div className="rounded-[4px] bg-[#f7f8fa] px-3 py-2 text-[12px] leading-5 text-[#646a73]">
              将导出全部付费类型 · {rangeSummary}
            </div>
            {exportError && <p className="text-[12px] text-[#f54a45]">{exportError}</p>}
          </div>

          <div className="flex justify-end gap-2 px-5 py-3 border-t border-[#f0f0f0]">
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-[4px] text-[12px] font-normal"
              disabled={exporting}
              onClick={() => setExportDialogOpen(false)}
            >
              取消
            </Button>
            <Button
              size="sm"
              className="h-8 rounded-[4px] text-[12px] font-normal"
              disabled={exporting}
              onClick={handleExport}
            >
              {exporting ? "导出中..." : "导出"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
