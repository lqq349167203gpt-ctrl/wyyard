import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceLine,
} from "recharts"

import { PaginationBar } from "@/components/pagination-bar"
import { SelectDropdown } from "@/components/select-dropdown"
import { EmptyValue } from "@/components/empty-value"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { usePagination } from "@/hooks/use-pagination"
import {
  customerApi,
  customerDetailApi,
  statisticsApi,
  type CustomerFollowUpStatus,
  type ReferralStatistics,
} from "@/lib/api"
import { calcYAxisWidth } from "@/lib/utils"
import { formatPeriodLabel, getDatePeriodKey } from "@/lib/chart-period"
import DetailView from "@/pages/healing-records/components/detail-view"

function generateColors(count: number, hueStart = 0): string[] {
  if (count === 0) return []
  return Array.from({ length: count }, (_, index) => {
    const hue = hueStart + index * (215 / Math.max(count - 1, 1))
    const lightness = 76 - (index * 20 / Math.max(count - 1, 1))
    return `hsl(${hue}, 58%, ${lightness}%)`
  })
}

const STATUS_COLORS = generateColors(5, 0)

const STATUS_META: Array<{
  name: CustomerFollowUpStatus
  color: string
}> = [
  { name: "新添加", color: STATUS_COLORS[0] },
  { name: "沟通中", color: STATUS_COLORS[1] },
  { name: "已到店", color: STATUS_COLORS[2] },
  { name: "已成交", color: STATUS_COLORS[3] },
  { name: "沉默/流失", color: STATUS_COLORS[4] },
]

type Member = ReferralStatistics["members"][number]

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate()
}

function formatChartLabel(date: string, granularity: "day" | "week" | "month") {
  if (granularity === "day") {
    const parts = date.split("-")
    return `${parts[1]}/${parts[2]}`
  }
  if (granularity === "month") {
    return `${Number(date.split("-")[1])}月`
  }
  return date
}

export default function ReferralStatisticsPage() {
  const now = new Date()
  const [data, setData] = useState<ReferralStatistics | null>(null)
  const [loading, setLoading] = useState(false)
  const [timeView, setTimeView] = useState<"year" | "month">("month")
  const [granularity, setGranularity] = useState<"day" | "week" | "month">("day")
  const [dataType, setDataType] = useState<"total" | "new">("total")
  const [selectedReferrer, setSelectedReferrer] = useState("")
  const [selectedTrendPeriod, setSelectedTrendPeriod] = useState("")
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set())
  const [persistedTypeNames, setPersistedTypeNames] = useState<string[]>([])
  const [persistedReferrerNames, setPersistedReferrerNames] = useState<string[]>([])
  const [startYear, setStartYear] = useState(now.getFullYear())
  const [startMonth, setStartMonth] = useState(now.getMonth() + 1)
  const [startDay, setStartDay] = useState(1)
  const [endYear, setEndYear] = useState(now.getFullYear())
  const [endMonth, setEndMonth] = useState(now.getMonth() + 1)
  const [endDay, setEndDay] = useState(getDaysInMonth(now.getFullYear(), now.getMonth() + 1))
  const [sortField, setSortField] = useState<keyof Member | null>("referral_date")
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc")
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [detailCustomerId, setDetailCustomerId] = useState<string | null>(null)
  const [detailType, setDetailType] = useState<"invited" | "arrived" | "activity" | "payment" | null>(null)
  const [detailRecords, setDetailRecords] = useState<Array<Record<string, unknown>>>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [visibleLines, setVisibleLines] = useState<Record<string, boolean>>(
    () => Object.fromEntries(STATUS_META.map(status => [status.name, true])),
  )
  const [savingStatusCustomerId, setSavingStatusCustomerId] = useState<string | null>(null)
  const [statusError, setStatusError] = useState("")

  const dateRange = useMemo(() => ({
    from: `${startYear}-${String(startMonth).padStart(2, "0")}-${String(startDay).padStart(2, "0")}`,
    to: `${endYear}-${String(endMonth).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`,
  }), [startYear, startMonth, startDay, endYear, endMonth, endDay])

  // 会员类型筛选项（后端返回全量列表，不随筛选塌缩）
  const typeNames = useMemo(() => data?.member_type_names ?? persistedTypeNames, [data?.member_type_names, persistedTypeNames])
  const referrerNames = useMemo(() => data?.referrer_names ?? persistedReferrerNames, [data?.referrer_names, persistedReferrerNames])

  // 数据加载后初始化选中所有类型
  const typesInitializedRef = useRef(false)
  const userHasInteractedRef = useRef(false)
  useEffect(() => {
    if (typeNames.length > 0 && !typesInitializedRef.current) {
      typesInitializedRef.current = true
      setSelectedTypes(new Set(typeNames))
    }
  }, [typeNames])

  // 空 Set = 全选（初始状态），用户主动清空后需要特殊处理
  const isAllTypeSelected = useMemo(() => {
    if (!userHasInteractedRef.current) return true
    return typeNames.length > 0 && typeNames.every(t => selectedTypes.has(t))
  }, [selectedTypes, typeNames])

  // 用户是否主动清空了所有类型
  const hasNoSelection = useMemo(() => {
    return userHasInteractedRef.current && selectedTypes.size === 0
  }, [selectedTypes])

  const toggleType = (type: string) => {
    userHasInteractedRef.current = true
    setSelectedTypes(prev => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
  }

  const toggleAllTypes = () => {
    userHasInteractedRef.current = true
    if (isAllTypeSelected) {
      setSelectedTypes(new Set())
    } else {
      setSelectedTypes(new Set(typeNames))
    }
  }

  const fetchData = useCallback(async (showLoading = true) => {
    // 全不选时直接清空数据，不请求后端
    if (selectedTypes.size === 0 && userHasInteractedRef.current) {
      setData(null)
      return
    }
    if (showLoading) setLoading(true)
    try {
      const result = await statisticsApi.referrals({
        date_from: dateRange.from,
        date_to: dateRange.to,
        granularity,
        referrer: selectedReferrer || undefined,
        member_types: selectedTypes.size > 0 ? Array.from(selectedTypes).join(",") : undefined,
      })
      setData(result)
      if (result.member_type_names) setPersistedTypeNames(result.member_type_names)
      if (result.referrer_names) setPersistedReferrerNames(result.referrer_names)
    } catch {
      if (showLoading) setData(null)
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [dateRange, granularity, selectedReferrer, selectedTypes, hasNoSelection])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    if (!detailCustomerId || !detailType) {
      setDetailRecords([])
      return
    }

    setDetailLoading(true)
    customerDetailApi.get(detailCustomerId)
      .then(result => {
        if (detailType === "invited") {
          setDetailRecords(result.visit_records.map(record => ({
            date: record.visit_date,
            referrer: record.referrer_handler || "-",
            needs: record.needs || "-",
            arrived: record.arrived,
          })))
        } else if (detailType === "arrived") {
          setDetailRecords(result.visit_records.filter(record => record.arrived).map(record => ({
            date: record.visit_date,
            referrer: record.referrer_handler || "-",
            needs: record.needs || "-",
          })))
        } else if (detailType === "activity") {
          setDetailRecords(result.activities.map(activity => ({
            date: activity.date,
            type: activity.type,
            name: activity.name,
            teacher: activity.host || "-",
            role: activity.role || "-",
          })))
        } else {
          setDetailRecords(result.payment_records.filter(record => !record.voided).map(record => ({
            project: record.name || "-",
            amount: record.amount,
            times: record.quantity || 1,
            deal_date: record.created_at ? record.created_at.split("T")[0] : "-",
            effective_date: record.effective_date || "-",
            expiry_date: record.expiry_date || "-",
            salesperson: record.closer_name || "-",
          })))
        }
      })
      .catch(() => setDetailRecords([]))
      .finally(() => setDetailLoading(false))
  }, [detailCustomerId, detailType])

  const chartData = useMemo(() => {
    const source = dataType === "new" ? data?.chart_new : data?.chart_total
    return (source || []).map(item => ({
      ...item,
      label: formatChartLabel(String(item.date), granularity),
    }))
  }, [data?.chart_new, data?.chart_total, dataType, granularity])

  // 前端过滤会员类型（后端 member_types=None 时返回全量，需前端再过滤）
  const filteredMembers = useMemo(() => {
    const all = data?.members || []
    if (isAllTypeSelected) return all
    if (selectedTypes.size === 0) return []
    return all.filter(m => selectedTypes.has(m.member_type))
  }, [data?.members, isAllTypeSelected, selectedTypes])

  const periodFilteredMembers = useMemo(
    () => selectedTrendPeriod
      ? filteredMembers.filter(member => getDatePeriodKey(member.referral_date, granularity) === selectedTrendPeriod)
      : filteredMembers,
    [filteredMembers, granularity, selectedTrendPeriod],
  )

  const distributionData = useMemo(() => {
    const counts: Record<string, number> = {}
    filteredMembers.forEach(m => {
      counts[m.follow_up_status] = (counts[m.follow_up_status] || 0) + 1
    })
    return STATUS_META.map(status => ({
      name: status.name,
      value: counts[status.name] ?? 0,
      color: status.color,
    }))
  }, [filteredMembers])

  const filteredTotalPeople = useMemo(() => filteredMembers.length, [filteredMembers])

  const lineYAxisWidth = useMemo(
    () => calcYAxisWidth(chartData, STATUS_META.map(status => status.name)),
    [chartData],
  )
  const barYAxisWidth = useMemo(
    () => calcYAxisWidth(distributionData, ["value"]),
    [distributionData],
  )

  const sortedMembers = useMemo(() => {
    const members = [...periodFilteredMembers]
    if (!sortField) return members
    return members.sort((a, b) => {
      const left = a[sortField] ?? ""
      const right = b[sortField] ?? ""
      if (left < right) return sortOrder === "asc" ? -1 : 1
      if (left > right) return sortOrder === "asc" ? 1 : -1
      return 0
    })
  }, [periodFilteredMembers, sortField, sortOrder])

  const {
    paginatedItems,
    currentPage,
    totalPages,
    totalItems,
    goToPage,
    startIndex,
    endIndex,
  } = usePagination(sortedMembers, { pageSize: 10 })

  useEffect(() => {
    setSelectedTrendPeriod("")
    goToPage(1)
  }, [dateRange, granularity, selectedReferrer, selectedTypes])

  const handleSort = (field: keyof Member) => {
    if (sortField === field) {
      setSortOrder(previous => previous === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortOrder("asc")
    }
  }

  const SortArrow = ({ field }: { field: keyof Member }) => (
    <span className="ml-1 inline-flex flex-col align-middle">
      <span className={`text-[8px] leading-[8px] ${sortField === field && sortOrder === "asc" ? "text-[#1f2329]" : "text-[#d0d3d6]"}`}>▲</span>
      <span className={`-mt-px text-[8px] leading-[8px] ${sortField === field && sortOrder === "desc" ? "text-[#1f2329]" : "text-[#d0d3d6]"}`}>▼</span>
    </span>
  )

  const updateFollowUpStatus = async (member: Member, nextStatus: CustomerFollowUpStatus) => {
    if (member.follow_up_status === nextStatus || savingStatusCustomerId !== null) return

    const previousStatus = member.follow_up_status
    setStatusError("")
    setSavingStatusCustomerId(member.id)
    setData(current => current ? {
      ...current,
      status_totals: {
        ...current.status_totals,
        [previousStatus]: Math.max(0, current.status_totals[previousStatus] - 1),
        [nextStatus]: current.status_totals[nextStatus] + 1,
      },
      members: current.members.map(item => (
        item.id === member.id ? { ...item, follow_up_status: nextStatus } : item
      )),
    } : current)

    try {
      await customerApi.update(member.id, { follow_up_status: nextStatus })
      await fetchData(false)
    } catch (error) {
      setData(current => current ? {
        ...current,
        status_totals: {
          ...current.status_totals,
          [nextStatus]: Math.max(0, current.status_totals[nextStatus] - 1),
          [previousStatus]: current.status_totals[previousStatus] + 1,
        },
        members: current.members.map(item => (
          item.id === member.id ? { ...item, follow_up_status: previousStatus } : item
        )),
      } : current)
      setStatusError(error instanceof Error ? error.message : "跟进状态保存失败，请重试")
    } finally {
      setSavingStatusCustomerId(null)
    }
  }

  const setMonthRange = () => {
    setTimeView("month")
    setGranularity("day")
    setStartYear(now.getFullYear())
    setStartMonth(now.getMonth() + 1)
    setStartDay(1)
    setEndYear(now.getFullYear())
    setEndMonth(now.getMonth() + 1)
    setEndDay(getDaysInMonth(now.getFullYear(), now.getMonth() + 1))
  }

  const setYearRange = () => {
    setTimeView("year")
    setGranularity("month")
    setStartYear(now.getFullYear())
    setStartMonth(1)
    setStartDay(1)
    setEndYear(now.getFullYear())
    setEndMonth(12)
    setEndDay(31)
  }

  return (
    <div className="min-h-full bg-[#f7f8fa] px-2.5 pb-6 pt-2.5">
      <div className="mb-1.5 rounded-[4px] bg-white px-[22px] py-4">
        <h1 className="mb-4 text-lg font-medium text-[#1f2329]">引流统计</h1>

        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex w-[62px] shrink-0 items-center gap-[10px] text-[12px] text-[#8f959e]">
              <span className="h-3 w-[2.5px] rounded-[1px] bg-[#d0d3d6]" />
              统计范围
            </span>
            <div className="flex items-center rounded-[4px] bg-[#f0f1f3] p-0.5">
              <button
                onClick={setMonthRange}
                className={`h-[26px] rounded-[2px] px-3 text-[11px] ${timeView === "month" ? "bg-white text-[#1f2329]" : "text-[#646a73] hover:text-[#4e535a]"}`}
              >
                按月
              </button>
              <button
                onClick={setYearRange}
                className={`h-[26px] rounded-[2px] px-3 text-[11px] ${timeView === "year" ? "bg-white text-[#1f2329]" : "text-[#646a73] hover:text-[#4e535a]"}`}
              >
                按年
              </button>
            </div>
            <div className="-ml-[5px] flex items-center rounded-[4px] bg-[#f0f1f3] p-0.5">
              <input
                type="date"
                value={dateRange.from}
                onChange={event => {
                  const [year, month, day] = event.target.value.split("-").map(Number)
                  setStartYear(year)
                  setStartMonth(month)
                  setStartDay(day)
                }}
                className="h-[26px] rounded-[2px] border-none bg-white px-2 text-[11px] outline-none"
              />
              <span className="flex h-[26px] items-center bg-white px-1 text-[11px] text-[#8f959e]">-</span>
              <input
                type="date"
                value={dateRange.to}
                onChange={event => {
                  const [year, month, day] = event.target.value.split("-").map(Number)
                  setEndYear(year)
                  setEndMonth(month)
                  setEndDay(day)
                }}
                className="h-[26px] rounded-[2px] border-none bg-white px-2 text-[11px] outline-none"
              />
            </div>
            <div className="ml-1 flex items-center gap-2">
              <span className="text-[12px] text-[#8f959e]">时间单位</span>
              <div className="flex items-center rounded-[4px] bg-[#f0f1f3] p-0.5">
                {timeView === "month" && (
                  <button
                    onClick={() => setGranularity("day")}
                    className={`h-[26px] rounded-[2px] px-3 text-[11px] ${granularity === "day" ? "bg-white text-[#1f2329]" : "text-[#646a73] hover:text-[#4e535a]"}`}
                  >
                    日
                  </button>
                )}
                <button
                  onClick={() => setGranularity("week")}
                  className={`h-[26px] rounded-[2px] px-3 text-[11px] ${granularity === "week" ? "bg-white text-[#1f2329]" : "text-[#646a73] hover:text-[#4e535a]"}`}
                >
                  周
                </button>
                <button
                  onClick={() => setGranularity("month")}
                  className={`h-[26px] rounded-[2px] px-3 text-[11px] ${granularity === "month" ? "bg-white text-[#1f2329]" : "text-[#646a73] hover:text-[#4e535a]"}`}
                >
                  月
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="inline-flex w-[62px] shrink-0 items-center gap-[10px] text-[12px] text-[#8f959e]">
              <span className="h-3 w-[2.5px] rounded-[1px] bg-[#d0d3d6]" />
              数据类型
            </span>
            <div className="flex items-center rounded-[4px] bg-[#f0f1f3] p-0.5">
              <button
                onClick={() => setDataType("total")}
                className={`h-[26px] rounded-[2px] px-3 text-[11px] ${dataType === "total" ? "bg-white text-[#1f2329]" : "text-[#646a73] hover:text-[#4e535a]"}`}
              >
                总数
              </button>
              <button
                onClick={() => setDataType("new")}
                className={`h-[26px] rounded-[2px] px-3 text-[11px] ${dataType === "new" ? "bg-white text-[#1f2329]" : "text-[#646a73] hover:text-[#4e535a]"}`}
              >
                新增
              </button>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <span className="mt-1 inline-flex w-[62px] shrink-0 items-center gap-[10px] text-[12px] text-[#8f959e]">
              <span className="h-3 w-[2.5px] rounded-[1px] bg-[#d0d3d6]" />
              会员类型
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={toggleAllTypes}
                className={`inline-flex h-[26px] items-center rounded-[2px] border px-3 text-[11px] ${isAllTypeSelected ? "border-[#b3d4ff] bg-[#fafcff] text-[#3370ff]" : "border-[#e8eaed] bg-white text-[#646a73] hover:border-[#c0c4cc]"}`}
              >
                全部
              </button>
              {typeNames.map(type => (
                <button
                  key={type}
                  onClick={() => toggleType(type)}
                  className={`inline-flex h-[26px] items-center rounded-[2px] border px-3 text-[11px] ${isAllTypeSelected || selectedTypes.has(type) ? "border-[#b3d4ff] bg-[#fafcff] text-[#3370ff]" : "border-[#e8eaed] bg-white text-[#646a73] hover:border-[#c0c4cc]"}`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-start gap-3">
            <span className="mt-1 inline-flex w-[62px] shrink-0 items-center gap-[10px] text-[12px] text-[#8f959e]">
              <span className="h-3 w-[2.5px] rounded-[1px] bg-[#d0d3d6]" />
              引流人
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setSelectedReferrer("")}
                className={`inline-flex h-[26px] items-center rounded-[2px] border px-3 text-[11px] ${selectedReferrer === "" ? "border-[#b3d4ff] bg-[#fafcff] text-[#3370ff]" : "border-[#e8eaed] bg-white text-[#646a73] hover:border-[#c0c4cc]"}`}
              >
                全部
              </button>
              {referrerNames.map(referrer => (
                <button
                  key={referrer}
                  onClick={() => setSelectedReferrer(referrer)}
                  className={`inline-flex h-[26px] items-center rounded-[2px] border px-3 text-[11px] ${selectedReferrer === referrer ? "border-[#b3d4ff] bg-[#fafcff] text-[#3370ff]" : "border-[#e8eaed] bg-white text-[#646a73] hover:border-[#c0c4cc]"}`}
                >
                  {referrer}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <section className="mb-1.5 rounded-[4px] bg-white px-[22px] py-4">
        <div className="mb-3 text-[12px] font-medium text-[#4e535a]">
          跟进人数<span className="font-normal text-[#8f959e]">（当前统计）</span>
        </div>
        <div className="grid grid-cols-6 gap-2">
          <div className="rounded-[2px] border border-[#e8eaed] bg-white px-3 py-2">
            <div className="mb-1 flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-[2px] bg-[#1f2329]" />
              <span className="text-[12px] text-[#4e535a]">总人数</span>
            </div>
            <span className="text-lg font-medium tabular-nums text-[#1f2329]">
              {loading ? "..." : filteredTotalPeople}
              <span className="ml-1 text-[12px] font-normal text-[#8f959e]">人</span>
            </span>
          </div>
          {STATUS_META.map(status => (
            <div key={status.name} className="rounded-[2px] border border-[#e8eaed] bg-white px-3 py-2">
              <div className="mb-1 flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-[2px]" style={{ backgroundColor: status.color }} />
                <span className="truncate text-[12px] text-[#4e535a]">{status.name}</span>
              </div>
              <span className="text-lg font-medium tabular-nums text-[#1f2329]">
                {loading ? "..." : distributionData.find(d => d.name === status.name)?.value ?? 0}
                <span className="ml-1 text-[12px] font-normal text-[#8f959e]">人</span>
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-1.5 flex gap-1.5">
        <div
          className="min-w-0 flex-1 select-none rounded-[4px] bg-white px-[22px] py-4 *:outline-none *:focus:outline-none"
          onMouseDown={event => event.preventDefault()}
        >
          <div className="mb-[18px]">
            <div className="mb-2 text-[12px] text-[#4e535a]">
              <span className="font-medium">
                每{granularity === "day" ? "日" : granularity === "week" ? "周" : "月"}跟进状态人数变化
              </span>
              <span className="text-[#8f959e]">
                （{dateRange.from.replace(/(\d+)-(\d+)-(\d+)/, "$1年$2月$3日")}~{dateRange.to.replace(/(\d+)-(\d+)-(\d+)/, "$1年$2月$3日")}）
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              {STATUS_META.map(status => (
                <label
                  key={status.name}
                  className="flex cursor-pointer select-none items-center gap-1"
                  onClick={() => setVisibleLines(previous => ({
                    ...previous,
                    [status.name]: !previous[status.name],
                  }))}
                >
                  <span
                    className="flex h-3.5 w-3.5 items-center justify-center rounded border text-[9px] leading-none"
                    style={{
                      borderColor: visibleLines[status.name] ? status.color : "#c8ccd0",
                      backgroundColor: visibleLines[status.name] ? status.color : "transparent",
                      color: "#fff",
                    }}
                  >
                    {visibleLines[status.name] && "✓"}
                  </span>
                  <span
                    className="text-[11px]"
                    style={{ color: visibleLines[status.name] ? status.color : "#c8ccd0" }}
                  >
                    {status.name}
                  </span>
                </label>
              ))}
            </div>
          </div>
          {loading ? (
            <div className="flex h-[160px] items-center justify-center text-[12px] text-[#8f959e]">加载中...</div>
          ) : chartData.length === 0 ? (
            <div className="flex h-[160px] items-center justify-center text-[12px] text-[#8f959e]">暂无数据</div>
          ) : (
            <ResponsiveContainer width="100%" height={160} tabIndex={-1}>
              <ComposedChart
                data={chartData}
                margin={{ top: 10, right: 10, left: 0, bottom: 2 }}
                className="cursor-pointer"
                onClick={(state) => {
                  if (state.activeLabel !== undefined) {
                    const period = String(state.activeLabel)
                    setSelectedTrendPeriod(period)
                    goToPage(1)
                  }
                }}
              >
                <defs>
                  {STATUS_META.map((status, index) => (
                    <linearGradient key={status.name} id={`referral-status-gradient-${index}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={status.color} stopOpacity={0.4} />
                      <stop offset="100%" stopColor={status.color} stopOpacity={0.02} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="4 4" stroke="#e8eaed" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "#b0b5bd", fontWeight: "normal" }}
                  tickLine={false}
                  axisLine={{ stroke: "#d0d3d6" }}
                  height={20}
                  interval={granularity === "month" ? 0 : Math.max(0, Math.floor(chartData.length / 8))}
                  tickFormatter={value => formatChartLabel(String(value), granularity)}
                />
                {selectedTrendPeriod && <ReferenceLine x={selectedTrendPeriod} stroke="#3370ff" strokeDasharray="3 3" />}
                <YAxis
                  tick={{ fontSize: 11, fill: "#b0b5bd", fontWeight: "normal" }}
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  width={lineYAxisWidth}
                  tickFormatter={value => Number(value) >= 10000 ? `${(Number(value) / 10000).toFixed(0)}万` : String(value)}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null
                    const seen = new Set<string>()
                    return (
                      <div style={{ fontSize: 12, background: "#fff", border: "1px solid #e8eaed", borderRadius: 4, padding: "6px 10px" }}>
                        <div style={{ color: "#8f959e", marginBottom: 4 }}>{label}</div>
                        {payload.map(item => {
                          const key = String(item.dataKey)
                          if (seen.has(key)) return null
                          seen.add(key)
                          const status = STATUS_META.find(option => option.name === key)
                          if (!status || !visibleLines[key]) return null
                          return (
                            <div key={key} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                              <span style={{ width: 8, height: 8, borderRadius: "50%", background: status.color }} />
                              <span style={{ color: status.color }}>{status.name}</span>
                              <span style={{ color: status.color, fontWeight: 500, marginLeft: "auto" }}>{item.value}人</span>
                            </div>
                          )
                        })}
                      </div>
                    )
                  }}
                />
                {STATUS_META.map((status, index) => (
                  visibleLines[status.name] && (
                    <Area
                      key={`area-${status.name}`}
                      type="monotone"
                      dataKey={status.name}
                      fill={`url(#referral-status-gradient-${index})`}
                      stroke="none"
                      tooltipType="none"
                    />
                  )
                ))}
                {STATUS_META.map(status => (
                  visibleLines[status.name] && (
                    <Line
                      key={status.name}
                      type="monotone"
                      dataKey={status.name}
                      stroke={status.color}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  )
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>

        <div
          className="min-w-0 flex-1 select-none rounded-[4px] bg-white px-[22px] py-4 *:outline-none *:focus:outline-none"
          onMouseDown={event => event.preventDefault()}
        >
          <div className="mb-[18px]">
            <div className="mb-2 text-[12px] text-[#4e535a]">
              <span className="font-medium">当前跟进状态分布</span>
              <span className="text-[#8f959e]">
                （{dateRange.from.replace(/(\d+)-(\d+)-(\d+)/, "$1年$2月$3日")}~{dateRange.to.replace(/(\d+)-(\d+)-(\d+)/, "$1年$2月$3日")}）
              </span>
            </div>
          </div>
          {loading ? (
            <div className="flex h-[160px] items-center justify-center text-[12px] text-[#8f959e]">加载中...</div>
          ) : distributionData.every(item => item.value === 0) ? (
            <div className="flex h-[160px] items-center justify-center text-[12px] text-[#8f959e]">暂无数据</div>
          ) : (
            <ResponsiveContainer width="100%" height={160} tabIndex={-1}>
              <BarChart data={distributionData} margin={{ top: 10, right: 5, left: 0, bottom: 2 }}>
                <CartesianGrid strokeDasharray="4 4" stroke="#e8eaed" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: "#b0b5bd" }}
                  axisLine={false}
                  tickLine={false}
                  height={20}
                  tickFormatter={value => String(value).length > 4 ? `${String(value).slice(0, 4)}...` : String(value)}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#b0b5bd" }}
                  allowDecimals={false}
                  axisLine={false}
                  tickLine={false}
                  width={barYAxisWidth}
                  tickFormatter={value => Number(value) >= 10000 ? `${(Number(value) / 10000).toFixed(0)}万` : String(value)}
                />
                <Tooltip
                  formatter={value => [`${value}人`, "人数"]}
                  contentStyle={{ fontSize: 12, borderRadius: 4 }}
                  cursor={{ fill: "transparent" }}
                />
                <Bar dataKey="value" radius={[2, 2, 0, 0]} barSize={20} activeBar={false}>
                  {distributionData.map(item => <Cell key={item.name} fill={item.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <section className="rounded-[4px] bg-white px-[22px] py-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[12px] font-medium text-[#4e535a]">
            <span>人员列表<span className="font-normal text-[#8f959e]">（{periodFilteredMembers.length}人）</span></span>
            {selectedTrendPeriod && <span className="font-normal text-[#8f959e]">{formatPeriodLabel(selectedTrendPeriod, granularity)}</span>}
            {selectedTrendPeriod && <button className="font-normal text-[#3370ff] hover:text-[#245bdb]" onClick={() => { setSelectedTrendPeriod(""); goToPage(1) }}>查看全部</button>}
          </div>
          {statusError && <span className="text-[12px] text-[#c4506a]">{statusError}</span>}
        </div>
        {loading ? (
          <div className="py-16 text-center text-[12px] text-[#8f959e]">加载中...</div>
        ) : sortedMembers.length === 0 ? (
          <div className="py-16 text-center text-[12px] text-[#8f959e]">暂无数据</div>
        ) : (
          <>
              <Table className="w-full table-fixed border-collapse text-left">
                <colgroup>
                  <col className="w-[10%]" />
                  <col className="w-[9%]" />
                  <col className="w-[9%]" />
                  <col className="w-[10%]" />
                  <col className="w-[9%]" />
                  <col className="w-[8%]" />
                  <col className="w-[8%]" />
                  <col className="w-[10%]" />
                  <col className="w-[8%]" />
                  <col className="w-[9%]" />
                  <col className="w-[10%]" />
                </colgroup>
                <TableHeader className="bg-[#fafafa] [&_tr]:border-[#f0f0f0]">
                  <TableRow className="h-9 bg-[#fafafa] text-[11px] font-normal text-[#8f959e] hover:bg-[#fafafa]">
                    <TableHead className="h-9 cursor-pointer select-none overflow-hidden px-3 pl-4 text-[11px] font-normal text-[#8f959e]" onClick={() => handleSort("referral_date")}>引流日期<SortArrow field="referral_date" /></TableHead>
                    <TableHead className="h-9 overflow-hidden px-3 text-[11px] font-normal text-[#8f959e]">昵称</TableHead>
                    <TableHead className="h-9 cursor-pointer select-none overflow-hidden px-3 text-[11px] font-normal text-[#8f959e]" onClick={() => handleSort("member_type")}>会员身份<SortArrow field="member_type" /></TableHead>
                    <TableHead className="h-9 overflow-hidden px-3 text-[11px] font-normal text-[#8f959e]">引流人</TableHead>
                    <TableHead className="h-9 cursor-pointer select-none overflow-hidden px-3 text-[11px] font-normal text-[#8f959e]" onClick={() => handleSort("first_visit_date")}>首次到店<SortArrow field="first_visit_date" /></TableHead>
                    <TableHead className="h-9 cursor-pointer select-none overflow-hidden px-3 text-[11px] font-normal text-[#8f959e]" onClick={() => handleSort("invited_count")}>受邀次数<SortArrow field="invited_count" /></TableHead>
                    <TableHead className="h-9 cursor-pointer select-none overflow-hidden px-3 text-[11px] font-normal text-[#8f959e]" onClick={() => handleSort("visit_count")}>到店次数<SortArrow field="visit_count" /></TableHead>
                    <TableHead className="h-9 cursor-pointer select-none overflow-hidden px-3 text-[11px] font-normal text-[#8f959e]" onClick={() => handleSort("visit_interval")}>平均到店间隔<SortArrow field="visit_interval" /></TableHead>
                    <TableHead className="h-9 cursor-pointer select-none overflow-hidden px-3 text-[11px] font-normal text-[#8f959e]" onClick={() => handleSort("activity_count")}>参与活动<SortArrow field="activity_count" /></TableHead>
                    <TableHead className="h-9 cursor-pointer select-none overflow-hidden px-3 text-[11px] font-normal text-[#8f959e]" onClick={() => handleSort("total_consumption")}>消费总额<SortArrow field="total_consumption" /></TableHead>
                    <TableHead className="h-9 cursor-pointer select-none overflow-hidden px-3 pr-4 text-[11px] font-normal text-[#8f959e]" onClick={() => handleSort("follow_up_status")}>跟进状态<SortArrow field="follow_up_status" /></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedItems.map(member => (
                    <TableRow key={member.id} className="group h-11 border-[#f0f0f0] text-[12px] text-[#4e535a] last:border-b-0 hover:bg-[#f7f8fa]">
                      <TableCell className="h-11 overflow-hidden px-3 py-0 pl-4 text-[12px] tabular-nums">{member.referral_date || <EmptyValue />}</TableCell>
                      <TableCell className="h-11 overflow-hidden px-3 py-0 text-[12px]">
                        <button
                          className="block max-w-full truncate font-medium text-[#2b2f36] hover:text-[#3370ff]"
                          title={member.nickname}
                          onClick={() => setSelectedCustomerId(member.id)}
                        >
                          {member.nickname || <EmptyValue />}
                        </button>
                      </TableCell>
                      <TableCell className="h-11 overflow-hidden px-3 py-0 text-[12px]">
                        <span className="block truncate" title={member.member_type}>{member.member_type || <EmptyValue />}</span>
                      </TableCell>
                      <TableCell className="h-11 overflow-hidden px-3 py-0 text-[12px]">
                        <span className="block truncate" title={member.referrer}>{member.referrer || <EmptyValue />}</span>
                      </TableCell>
                      <TableCell className="h-11 overflow-hidden px-3 py-0 text-[12px] tabular-nums">{member.first_visit_date === "-" ? <EmptyValue /> : member.first_visit_date}</TableCell>
                      <TableCell className="h-11 overflow-hidden px-3 py-0 text-[12px] tabular-nums">
                        {member.invited_count === 0 ? <EmptyValue /> : (
                          <button
                            className="block max-w-full truncate text-left text-[#4e535a] hover:underline"
                            onClick={() => {
                              setDetailCustomerId(member.id)
                              setDetailType("invited")
                            }}
                          >
                            {member.invited_count}次
                          </button>
                        )}
                      </TableCell>
                      <TableCell className="h-11 overflow-hidden px-3 py-0 text-[12px] tabular-nums">
                        {member.visit_count === 0 ? <EmptyValue /> : (
                          <button
                            className="block max-w-full truncate text-left text-[#4e535a] hover:underline"
                            onClick={() => {
                              setDetailCustomerId(member.id)
                              setDetailType("arrived")
                            }}
                          >
                            {member.visit_count}次
                          </button>
                        )}
                      </TableCell>
                      <TableCell className="h-11 overflow-hidden px-3 py-0 text-[12px] tabular-nums">{member.visit_interval === "-" ? <EmptyValue /> : member.visit_interval}</TableCell>
                      <TableCell className="h-11 overflow-hidden px-3 py-0 text-[12px] tabular-nums">
                        <button
                          className="block max-w-full truncate text-left text-[#4e535a] hover:underline"
                          onClick={() => {
                            setDetailCustomerId(member.id)
                            setDetailType("activity")
                          }}
                        >
                          {member.activity_count}场
                        </button>
                      </TableCell>
                      <TableCell className="h-11 overflow-hidden px-3 py-0 text-[12px] tabular-nums">
                        <button
                          className="block max-w-full truncate text-left text-[#4e535a] hover:underline"
                          onClick={() => {
                            setDetailCustomerId(member.id)
                            setDetailType("payment")
                          }}
                        >
                          ¥{member.total_consumption.toLocaleString()}
                        </button>
                      </TableCell>
                      <TableCell className="h-11 overflow-hidden px-3 py-0 pr-4 text-[12px]">
                        <SelectDropdown
                          value={member.follow_up_status}
                          options={STATUS_META.map(status => ({ value: status.name, label: status.name }))}
                          onChange={value => updateFollowUpStatus(member, value as CustomerFollowUpStatus)}
                          disabled={savingStatusCustomerId !== null}
                          size="sm"
                          className="min-w-0 w-full"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            <PaginationBar
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalItems}
              startIndex={startIndex}
              endIndex={endIndex}
              onPageChange={goToPage}
            />
          </>
        )}
      </section>

      <Dialog open={!!selectedCustomerId} onOpenChange={open => { if (!open) setSelectedCustomerId(null) }}>
        <DialogContent className="flex max-h-[90vh] max-w-[1180px] flex-col overflow-hidden p-0">
          <DetailView
            selectedCustomerId={selectedCustomerId}
            onClearSelection={() => setSelectedCustomerId(null)}
            hideSearch
            defaultTab="healing"
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!detailCustomerId && !!detailType}
        onOpenChange={open => {
          if (!open) {
            setDetailCustomerId(null)
            setDetailType(null)
          }
        }}
      >
        <DialogContent
          className={`${detailType === "payment" ? "max-w-[680px]" : "max-w-[580px]"} max-h-[60vh] overflow-y-auto p-0 gap-0`}
          initialFocus={false}
        >
          <div className="border-b border-[#f0f0f0] px-4 py-3">
            <span className="text-[14px] font-medium text-[#1f2329]">
              {detailType === "invited" && "受邀记录"}
              {detailType === "arrived" && "到店记录"}
              {detailType === "activity" && "参与活动"}
              {detailType === "payment" && "消费记录"}
            </span>
          </div>
          {detailLoading ? (
            <div className="px-4 py-8 text-center text-[12px] text-[#8f959e]">加载中...</div>
          ) : detailRecords.length === 0 ? (
            <div className="px-4 py-8 text-center text-[12px] text-[#8f959e]">暂无数据</div>
          ) : (
            <div>
              {(detailType === "invited" || detailType === "arrived") && (
                <>
                  <div className="flex items-center border-b border-[#f0f0f0] px-4 py-1.5 text-[11px] text-[#8f959e]">
                    <span className="w-28 shrink-0">日期</span>
                    <span className="w-20 shrink-0">邀约人</span>
                    <span className="min-w-0 flex-1">需求</span>
                  </div>
                  {detailRecords.map((record, index) => (
                    <div key={index} className="flex items-center px-4 py-2 text-[12px] text-[#4e535a] hover:bg-[#f7f8fa]">
                      <span className="w-28 shrink-0">
                        {String(record.date)}
                        {detailType === "invited" && !record.arrived ? <span className="text-[#b0b5bd]">（未到店）</span> : ""}
                      </span>
                      <span className="w-20 shrink-0 text-[#8f959e]">{String(record.referrer)}</span>
                      <span className="min-w-0 flex-1 truncate">{String(record.needs)}</span>
                    </div>
                  ))}
                </>
              )}
              {detailType === "activity" && (
                <>
                  <div className="flex items-center border-b border-[#f0f0f0] px-4 py-1.5 text-[11px] text-[#8f959e]">
                    <span className="w-24 shrink-0">日期</span>
                    <span className="w-20 shrink-0">类型</span>
                    <span className="min-w-0 flex-1">活动名称</span>
                    <span className="w-16 shrink-0">老师</span>
                    <span className="w-16 shrink-0">身份</span>
                  </div>
                  {detailRecords.map((record, index) => (
                    <div key={index} className="flex items-center px-4 py-2 text-[12px] text-[#4e535a] hover:bg-[#f7f8fa]">
                      <span className="w-24 shrink-0">{String(record.date)}</span>
                      <span className="w-20 shrink-0 text-[#8f959e]">{String(record.type)}</span>
                      <span className="min-w-0 flex-1 truncate">{String(record.name)}</span>
                      <span className="w-16 shrink-0">{String(record.teacher)}</span>
                      <span className="w-16 shrink-0">{String(record.role)}</span>
                    </div>
                  ))}
                </>
              )}
              {detailType === "payment" && (
                <>
                  <div className="flex items-center border-b border-[#f0f0f0] px-4 py-1.5 text-[11px] text-[#8f959e]">
                    <span className="w-24 shrink-0">项目</span>
                    <span className="w-16 shrink-0 text-right">金额</span>
                    <span className="w-12 shrink-0 text-right">次数</span>
                    <span className="w-20 shrink-0">成交日期</span>
                    <span className="w-20 shrink-0">生效日期</span>
                    <span className="w-20 shrink-0">结束日期</span>
                    <span className="w-16 shrink-0">成交人</span>
                  </div>
                  {detailRecords.map((record, index) => (
                    <div key={index} className="flex items-center px-4 py-2 text-[12px] text-[#4e535a] hover:bg-[#f7f8fa]">
                      <span className="w-24 shrink-0 truncate">{String(record.project)}</span>
                      <span className="w-16 shrink-0 text-right">¥{Number(record.amount).toLocaleString()}</span>
                      <span className="w-12 shrink-0 text-right">{String(record.times)}</span>
                      <span className="w-20 shrink-0">{String(record.deal_date)}</span>
                      <span className="w-20 shrink-0">{String(record.effective_date)}</span>
                      <span className="w-20 shrink-0">{String(record.expiry_date)}</span>
                      <span className="w-16 shrink-0 text-[#8f959e]">{String(record.salesperson)}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
