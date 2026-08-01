import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { FileText } from "lucide-react"
import { ComposedChart, Line, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from "recharts"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import DetailView from "@/pages/healing-records/components/detail-view"
import { statisticsApi, memberIdentityApi, customerDetailApi, type StatisticsData, type StatisticsDetail, type MemberIdentity } from "@/lib/api"
import { usePagination } from "@/hooks/use-pagination"
import { PaginationBar } from "@/components/pagination-bar"
import { calcYAxisWidth } from "@/lib/utils"
import { formatPeriodLabel, getDatePeriodKey } from "@/lib/chart-period"

const COLORS = {
  invited: "#5b8ff9",
  arrived: "#36cfc9",
  converted: "#faad14",
  converted_amount: "#f5222d",
}

const LABELS: Record<string, string> = {
  invited: "邀约到访",
  arrived: "实际到访",
  converted: "成交人数",
  converted_amount: "成交金额",
}

// 获取某月的天数
function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate()
}

// 获取周一日期
function getMonday(date: Date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  return new Date(d.setDate(diff))
}

// 格式化日期
function formatDate(date: Date) {
  return `${date.getMonth() + 1}/${date.getDate()}`
}

export default function StatisticsPage() {
  const navigate = useNavigate()
  const [data, setData] = useState<StatisticsData[]>([])
  const [details, setDetails] = useState<{ invited: StatisticsDetail[]; arrived: StatisticsDetail[]; converted: StatisticsDetail[] }>({ invited: [], arrived: [], converted: [] })
  // 筛选项（后端返回全量列表，不随筛选塌缩）
  const [typeNames, setTypeNames] = useState<string[]>([])
  const [referrerNames, setReferrerNames] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<"invited" | "arrived" | "converted" | "converted_amount">("invited")
  const detailsKey = activeTab === "converted_amount" ? "converted" : activeTab
  const [visibleLines, setVisibleLines] = useState<Record<string, boolean>>({ invited: true, arrived: true, converted: true, converted_amount: false })
  const [identityOrder, setIdentityOrder] = useState<string[]>([])
  const [identityTypeMap, setIdentityTypeMap] = useState<Record<string, string>>({})
  const [detailOpen, setDetailOpen] = useState(false)
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)

  // 统计维度：total（总数据）或 range（时间内数据）
  const [statDimension, setStatDimension] = useState<"total" | "range">("range")
  // 成交金额类型筛选
  const [typeFilter, setTypeFilter] = useState<string>("全部")
  // 同一客户去重模式
  const [customerDedup, setCustomerDedup] = useState<"all" | "unique">("all")
  // 会员类型筛选
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set())
  // 引流人筛选
  const [selectedReferrer, setSelectedReferrer] = useState("")
  const [selectedTrendPeriod, setSelectedTrendPeriod] = useState("")
  // 时间维度：year 或 month
  const [timeView, setTimeView] = useState<"year" | "month">("month")
  // 时间单位：day、week、month
  const [granularity, setGranularity] = useState<"day" | "week" | "month">("day")

  // 排序
  const [sortField, setSortField] = useState<string | null>(null)
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc")

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortOrder("asc")
    }
  }

  // 会员类型筛选逻辑
  const typesInitializedRef = useRef(false)
  const userHasInteractedRef = useRef(false)
  useEffect(() => {
    if (typeNames.length > 0 && !typesInitializedRef.current) {
      typesInitializedRef.current = true
      setSelectedTypes(new Set(typeNames))
    }
  }, [typeNames])

  const isAllTypeSelected = useMemo(() => {
    if (!userHasInteractedRef.current) return true
    return typeNames.length > 0 && typeNames.every(t => selectedTypes.has(t))
  }, [selectedTypes, typeNames])

  const hasNoSelection = useMemo(() => {
    return userHasInteractedRef.current && selectedTypes.size === 0
  }, [selectedTypes])

  // 前端过滤会员类型（后端 member_types=None 时返回全量，需前端再过滤）
  const filteredDetails = useMemo(() => {
    if (isAllTypeSelected) return details
    if (selectedTypes.size === 0) return { invited: [], arrived: [], converted: [] }
    const filterList = (list: StatisticsDetail[]) => list.filter(item => item.member_type && selectedTypes.has(item.member_type))
    return {
      invited: filterList(details.invited),
      arrived: filterList(details.arrived),
      converted: filterList(details.converted),
    }
  }, [details, isAllTypeSelected, selectedTypes])

  // 同一客户去重：按 customer_id 去重，保留最新日期（已排序）
  const dedupedDetails = useMemo(() => {
    if (customerDedup === "all") return filteredDetails
    const dedupList = (list: StatisticsDetail[]) => {
      const seen = new Set<string>()
      return list.filter(item => {
        if (!item.customer_id) return true
        if (seen.has(item.customer_id)) return false
        seen.add(item.customer_id)
        return true
      })
    }
    return {
      invited: dedupList(filteredDetails.invited),
      arrived: dedupList(filteredDetails.arrived),
      converted: dedupList(filteredDetails.converted),
    }
  }, [filteredDetails, customerDedup])

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

  // 排序后的列表（会员类型/引流人筛选已由后端完成）
  const sortedDetails = useMemo(() => {
    let list = [...(dedupedDetails[detailsKey] || [])]
    if (activeTab === "converted_amount" && typeFilter !== "全部") {
      list = list.filter(item => item.type === typeFilter)
    }
    if (selectedTrendPeriod) {
      list = list.filter(item => getDatePeriodKey(item.date, granularity) === selectedTrendPeriod)
    }
    if (!sortField) return list.sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    return list.sort((a, b) => {
      let va: any, vb: any
      if (sortField === "member_type") {
        const ia = identityOrder.indexOf(a.member_type || "")
        const ib = identityOrder.indexOf(b.member_type || "")
        va = ia === -1 ? 999 : ia
        vb = ib === -1 ? 999 : ib
      } else if (sortField === "arrived") {
        va = a.arrived ? 1 : 0
        vb = b.arrived ? 1 : 0
      } else if (sortField === "status") {
        va = a.status === "converted" ? 1 : 0
        vb = b.status === "converted" ? 1 : 0
      } else if (sortField === "visit_interval") {
        va = parseFloat(a.visit_interval || "") || 0
        vb = parseFloat(b.visit_interval || "") || 0
      } else {
        va = (a as any)[sortField] ?? 0
        vb = (b as any)[sortField] ?? 0
      }
      if (va < vb) return sortOrder === "asc" ? -1 : 1
      if (va > vb) return sortOrder === "asc" ? 1 : -1
      return 0
    })
    return list
  }, [dedupedDetails, activeTab, sortField, sortOrder, typeFilter, selectedTrendPeriod, granularity])

  const { paginatedItems, currentPage, totalPages, totalItems, goToPage, startIndex, endIndex } = usePagination(sortedDetails, { pageSize: 10 })

  // 数字列点击弹窗
  const [popupType, setPopupType] = useState<"invited" | "visits" | "activities" | "payments" | "day_activities" | null>(null)
  const [popupData, setPopupData] = useState<{ customer?: { nickname?: string }; visit_records?: any[]; activities?: any[]; payment_records?: any[] } | null>(null)
  const [popupLoading, setPopupLoading] = useState(false)
  const [popupCustomerId, setPopupCustomerId] = useState<string | null>(null)
  const [popupDate, setPopupDate] = useState<string | null>(null)

  // 当前选择的时间范围
  const now = new Date()
  const [startYear, setStartYear] = useState(now.getFullYear())
  const [startMonth, setStartMonth] = useState(now.getMonth() + 1)
  const [startDay, setStartDay] = useState(1)
  const [endYear, setEndYear] = useState(now.getFullYear())
  const [endMonth, setEndMonth] = useState(now.getMonth() + 1)
  const [endDay, setEndDay] = useState(getDaysInMonth(now.getFullYear(), now.getMonth() + 1))

  // 计算日期范围
  const dateRange = useMemo(() => {
    const from = `${startYear}-${String(startMonth).padStart(2, "0")}-${String(startDay).padStart(2, "0")}`
    const to = `${endYear}-${String(endMonth).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`
    return { from, to }
  }, [startYear, startMonth, startDay, endYear, endMonth, endDay])

  useEffect(() => {
    setSelectedTrendPeriod("")
    goToPage(1)
  }, [dateRange, granularity, selectedReferrer, selectedTypes, activeTab, statDimension])

  const fetchData = useCallback(async () => {
    // 全不选时直接清空数据，不请求后端
    if (selectedTypes.size === 0 && userHasInteractedRef.current) {
      setData([])
      setDetails({ invited: [], arrived: [], converted: [] })
      return
    }
    setLoading(true)
    try {
      // 按周时请求按天粒度，前端再聚合
      const requestGranularity = granularity === "week" ? "day" : granularity
      const memberTypesParam = selectedTypes.size > 0 ? Array.from(selectedTypes).join(",") : undefined
      const referrerParam = selectedReferrer || undefined
      const [overviewRes, detailsRes] = await Promise.all([
        statisticsApi.overview({
          date_from: dateRange.from,
          date_to: dateRange.to,
          granularity: requestGranularity,
          member_types: memberTypesParam,
          referrer: referrerParam,
        }),
        statisticsApi.details({
          date_from: dateRange.from,
          date_to: dateRange.to,
          total: statDimension === "total",
          member_types: memberTypesParam,
          referrer: referrerParam,
        }),
      ])
      setData(overviewRes.data)
      setDetails({ invited: detailsRes.invited, arrived: detailsRes.arrived, converted: detailsRes.converted })
      setTypeNames(detailsRes.member_type_names ?? [])
      setReferrerNames(detailsRes.referrer_names ?? [])
    } catch {
      setData([])
      setDetails({ invited: [], arrived: [], converted: [] })
    } finally {
      setLoading(false)
    }
  }, [dateRange, granularity, selectedTypes, selectedReferrer, hasNoSelection, isAllTypeSelected])

  // 仅刷新列表数据（切换统计维度时）
  const fetchDetails = useCallback(async () => {
    if (selectedTypes.size === 0 && userHasInteractedRef.current) {
      setDetails({ invited: [], arrived: [], converted: [] })
      return
    }
    try {
      const detailsRes = await statisticsApi.details({
        date_from: dateRange.from,
        date_to: dateRange.to,
        total: statDimension === "total",
        member_types: selectedTypes.size > 0 ? Array.from(selectedTypes).join(",") : undefined,
        referrer: selectedReferrer || undefined,
      })
      setDetails({ invited: detailsRes.invited, arrived: detailsRes.arrived, converted: detailsRes.converted })
      setTypeNames(detailsRes.member_type_names ?? [])
      setReferrerNames(detailsRes.referrer_names ?? [])
    } catch {
      setDetails({ invited: [], arrived: [], converted: [] })
    }
  }, [dateRange, statDimension, selectedTypes, selectedReferrer, hasNoSelection, isAllTypeSelected])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // 统计维度变化时仅刷新列表
  const prevStatDimension = useRef(statDimension)
  useEffect(() => {
    if (prevStatDimension.current !== statDimension) {
      prevStatDimension.current = statDimension
      fetchDetails()
    }
  }, [statDimension, fetchDetails])

  // 切换数据类型时重置会员类型和引流人筛选
  const prevActiveTab = useRef(activeTab)
  useEffect(() => {
    if (prevActiveTab.current !== activeTab) {
      prevActiveTab.current = activeTab
      setSelectedTypes(new Set())
      setSelectedReferrer("")
    }
  }, [activeTab])

  // 点击数字列加载客户详情
  const handleStatClick = async (type: "invited" | "visits" | "activities" | "payments" | "day_activities", customerId: string, date?: string) => {
    setPopupType(type)
    setPopupCustomerId(customerId)
    setPopupDate(date || null)
    setPopupLoading(true)
    try {
      const data = await customerDetailApi.get(customerId, type === "day_activities" ? date : undefined)
      setPopupData(data)
    } catch {
      setPopupData(null)
    } finally {
      setPopupLoading(false)
    }
  }

  useEffect(() => {
    memberIdentityApi.list().then((list) => {
      setIdentityOrder(list.map((item) => item.name))
      const typeMap: Record<string, string> = {}
      list.forEach((item) => {
        typeMap[item.name] = item.type
      })
      setIdentityTypeMap(typeMap)
    }).catch(() => {})
  }, [])

  // 按周聚合数据
  const rawChartData = useMemo(() => {
    if (granularity === "month") {
      // 按月：显示月份
      return data.map((item) => ({
        ...item,
        periodKey: item.date,
        label: `${parseInt(item.date.split("-")[1])}月`,
      }))
    }

    if (granularity === "day") {
      // 按天：显示日期
      return data.map((item) => ({
        ...item,
        periodKey: item.date,
        label: item.date,
      }))
    }

    // 按周：需要前端聚合
    // 构建每天的数据映射
    const dailyMap: Record<string, StatisticsData> = {}
    data.forEach((item) => {
      dailyMap[item.date] = item
    })

    // 生成每周的日期范围
    const weeks: { start: Date; end: Date; label: string; data: StatisticsData[] }[] = []

    // 找到开始日期所在周的周一
    const startDate = new Date(startYear, startMonth - 1, 1)
    const endDate = new Date(endYear, endMonth, 0) // 最后一天
    let currentMonday = getMonday(startDate)

    while (currentMonday <= endDate) {
      const weekStart = new Date(currentMonday)
      const weekEnd = new Date(currentMonday)
      weekEnd.setDate(weekEnd.getDate() + 6) // 周日

      // 收集这一周在时间范围内的数据
      const weekData: StatisticsData[] = []
      for (let d = new Date(weekStart); d <= weekEnd; d.setDate(d.getDate() + 1)) {
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
        if (d >= startDate && d <= endDate && dailyMap[dateStr]) {
          weekData.push(dailyMap[dateStr])
        }
      }

      // 只有这一周有数据才添加
      if (weekData.length > 0) {
        const label = `${formatDate(weekStart)}-${formatDate(weekEnd)}`
        weeks.push({ start: weekStart, end: weekEnd, label, data: weekData })
      }

      // 移到下周一
      currentMonday.setDate(currentMonday.getDate() + 7)
    }

    // 聚合每周数据
    return weeks.map((week) => {
      const aggregated = week.data.reduce(
        (acc, item) => ({
          date: week.label,
          invited: acc.invited + item.invited,
          arrived: acc.arrived + item.arrived,
          converted: acc.converted + item.converted,
          converted_amount: (acc.converted_amount ?? 0) + (item.converted_amount || 0),
        }),
        { date: week.label, invited: 0, arrived: 0, converted: 0, converted_amount: 0 }
      )
      return { ...aggregated, periodKey: getDatePeriodKey(week.data[0]?.date || "", "week"), label: week.label }
    })
  }, [data, granularity, startYear, startMonth, endYear, endMonth])

  const chartData = rawChartData

  const totals = {
    invited: dedupedDetails.invited.length,
    arrived: dedupedDetails.arrived.length,
    converted: dedupedDetails.converted.length,
  }

  // 身份分布数据（基于当前数据类型，按身份配置顺序排列）
  const identityData = useMemo(() => {
    const counts: Record<string, number> = {}
    dedupedDetails[detailsKey].forEach((item) => {
      const type = item.member_type || "未设置"
      counts[type] = (counts[type] || 0) + 1
    })
    const entries = Object.entries(counts).map(([name, value]) => ({ name, value }))
    if (identityOrder.length > 0) {
      entries.sort((a, b) => {
        const ia = identityOrder.indexOf(a.name)
        const ib = identityOrder.indexOf(b.name)
        const oa = ia === -1 ? 999 : ia
        const ob = ib === -1 ? 999 : ib
        return ob - oa
      })
    }
    return entries
  }, [dedupedDetails, activeTab, identityOrder])

  const IDENTITY_COLORS = useMemo(() => {
    const n = identityData.length
    if (n === 0) return []
    return Array.from({ length: n }, (_, i) => {
      const hue = 55 + i * (215 / Math.max(n - 1, 1))
      const lightness = 76 - (i * 20 / Math.max(n - 1, 1))
      return `hsl(${hue}, 58%, ${lightness}%)`
    })
  }, [identityData.length])

  // 生成年份选项（近5年）
  const yearOptions = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i)

  // 计算Y轴刻度
  const yTicks = useMemo(() => {
    const visibleMax = chartData.map(d => {
      let m = 0
      if (visibleLines.invited) m = Math.max(m, d.invited)
      if (visibleLines.arrived) m = Math.max(m, d.arrived)
      if (visibleLines.converted) m = Math.max(m, d.converted)
      if (visibleLines.converted_amount) m = Math.max(m, d.converted_amount || 0)
      return m
    })
    const maxVal = Math.max(...visibleMax, 0)
    const step = Math.ceil(maxVal / 4 / 5) * 5 || 5
    const ticks = []
    for (let i = 0; i <= Math.ceil(maxVal / step) * step + step; i += step) {
      ticks.push(i)
    }
    return ticks
  }, [chartData, visibleLines])

  // 动态 YAxis 宽度
  const lineYAxisWidth = useMemo(() => calcYAxisWidth(chartData, ["invited", "arrived", "converted", "converted_amount"]), [chartData])
  const barYAxisWidth = useMemo(() => calcYAxisWidth(identityData, ["value"]), [identityData])

  return (
    <div className="min-h-full bg-[#f7f8fa] px-2.5 pt-2.5 pb-6">
      <div>
        <div className="bg-white rounded-[4px] px-[22px] py-4 mb-1.5">
          <h1 className="text-[16px] font-medium text-[#1f2329] mb-4">服务数据</h1>

          {/* 筛选栏 */}
          <div className="flex flex-col gap-2">
            {/* 第一行：统计范围 + 时间范围 */}
            <div className="flex items-center gap-3 flex-wrap">
              <span className="inline-flex items-center gap-[10px] text-[12px] text-[#8f959e] w-[62px] shrink-0"><span className="w-[2.5px] h-3 bg-[#d0d3d6] rounded-[1px]"></span>统计范围</span>
              <div className="flex items-center bg-[#f0f1f3] rounded-[4px] p-[2px]">
                <button
                  onClick={() => {
                    setTimeView("month")
                    setGranularity("day")
                    setStartYear(now.getFullYear())
                    setStartMonth(now.getMonth() + 1)
                    setStartDay(1)
                    setEndYear(now.getFullYear())
                    setEndMonth(now.getMonth() + 1)
                    setEndDay(getDaysInMonth(now.getFullYear(), now.getMonth() + 1))
                  }}
                  className={`px-3 h-[26px] text-[11px] rounded-[2px] transition-all ${timeView === "month" ? "bg-white text-[#1f2329] " : "text-[#646a73] hover:text-[#4e535a]"}`}
                >
                  按月
                </button>
                <button
                  onClick={() => {
                    setTimeView("year")
                    setGranularity("month")
                    setStartYear(now.getFullYear())
                    setStartMonth(1)
                    setStartDay(1)
                    setEndYear(now.getFullYear())
                    setEndMonth(12)
                    setEndDay(31)
                  }}
                  className={`px-3 h-[26px] text-[11px] rounded-[2px] transition-all ${timeView === "year" ? "bg-white text-[#1f2329] " : "text-[#646a73] hover:text-[#4e535a]"}`}
                >
                  按年
                </button>
              </div>
              <div className="flex items-center bg-[#f0f1f3] rounded-[4px] px-[2px] py-[2px] -ml-[5px]">
                <input
                  type="date"
                  value={`${startYear}-${String(startMonth).padStart(2, "0")}-${String(startDay).padStart(2, "0")}`}
                  onChange={(e) => {
                    const [y, m, d] = e.target.value.split("-")
                    setStartYear(Number(y))
                    setStartMonth(Number(m))
                    setStartDay(Number(d))
                  }}
                  className="h-[26px] pl-2 pr-1 text-[11px] bg-white rounded-[2px] border-none outline-none"
                />
                <span className="text-[11px] text-[#8f959e] px-1 bg-white h-[26px] flex items-center">-</span>
                <input
                  type="date"
                  value={`${endYear}-${String(endMonth).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`}
                  onChange={(e) => {
                    const [y, m, d] = e.target.value.split("-")
                    setEndYear(Number(y))
                    setEndMonth(Number(m))
                    setEndDay(Number(d))
                  }}
                  className="h-[26px] pl-2 pr-1 text-[11px] bg-white rounded-[2px] border-none outline-none"
                />
              </div>
              <div className="ml-1 flex items-center gap-2">
                <span className="text-[12px] text-[#8f959e]">时间单位</span>
                <div className="flex items-center bg-[#f0f1f3] rounded-[4px] p-[2px]">
                  {timeView === "month" && (
                    <button
                      onClick={() => setGranularity("day")}
                      className={`px-3 h-[26px] text-[11px] rounded-[2px] transition-all ${granularity === "day" ? "bg-white text-[#1f2329] " : "text-[#646a73] hover:text-[#4e535a]"}`}
                    >
                      日
                    </button>
                  )}
                  <button
                    onClick={() => setGranularity("week")}
                    className={`px-3 h-[26px] text-[11px] rounded-[2px] transition-all ${granularity === "week" ? "bg-white text-[#1f2329] " : "text-[#646a73] hover:text-[#4e535a]"}`}
                  >
                    周
                  </button>
                  <button
                    onClick={() => setGranularity("month")}
                    className={`px-3 h-[26px] text-[11px] rounded-[2px] transition-all ${granularity === "month" ? "bg-white text-[#1f2329] " : "text-[#646a73] hover:text-[#4e535a]"}`}
                  >
                    月
                  </button>
                </div>
              </div>
            </div>

            {/* 第三行：数据类型 */}
            <div className="flex items-center gap-3 flex-wrap">
              <span className="inline-flex items-center gap-[10px] text-[12px] text-[#8f959e] w-[62px] shrink-0"><span className="w-[2.5px] h-3 bg-[#d0d3d6] rounded-[1px]"></span>数据类型</span>
              <div className="flex items-center bg-[#f0f1f3] rounded-[4px] p-[2px]">
                {(["invited", "arrived", "converted", "converted_amount"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-3 h-[26px] text-[11px] rounded-[2px] transition-all ${activeTab === tab ? "bg-white text-[#1f2329] " : "text-[#646a73] hover:text-[#4e535a]"}`}
                  >
                    {LABELS[tab]}
                  </button>
                )).reduce((acc, el, i) => i === 2 ? [...acc, <span key="sep" className="w-px h-3 bg-[#d0d3d6]" />, el] : [...acc, el], [] as React.ReactNode[])}
              </div>
            </div>

            {/* 第四行：同一客户 */}
            <div className="flex items-center gap-3 flex-wrap">
              <span className="inline-flex items-center gap-[10px] text-[12px] text-[#8f959e] w-[62px] shrink-0"><span className="w-[2.5px] h-3 bg-[#d0d3d6] rounded-[1px]"></span>同一客户</span>
              <div className="flex items-center bg-[#f0f1f3] rounded-[4px] p-[2px]">
                <button
                  onClick={() => setCustomerDedup("all")}
                  className={`px-3 h-[26px] text-[11px] rounded-[2px] transition-all ${customerDedup === "all" ? "bg-white text-[#1f2329]" : "text-[#646a73] hover:text-[#4e535a]"}`}
                >
                  全部记录
                </button>
                <button
                  onClick={() => setCustomerDedup("unique")}
                  className={`px-3 h-[26px] text-[11px] rounded-[2px] transition-all ${customerDedup === "unique" ? "bg-white text-[#1f2329]" : "text-[#646a73] hover:text-[#4e535a]"}`}
                >
                  显示一次
                </button>
              </div>
              {customerDedup === "all" && <span className="text-[11px] text-[#b0b5bd]">全部记录 - 在统计时间范围内，来几次记作几人，重复统计</span>}
              {customerDedup === "unique" && <span className="text-[11px] text-[#b0b5bd]">显示一次 - 在统计时间范围内，不管来几次，都只记作1人</span>}
            </div>

            {/* 第五行：会员类型 */}
            <div className="flex items-start gap-3">
              <span className="mt-1 inline-flex items-center gap-[10px] text-[12px] text-[#8f959e] w-[62px] shrink-0"><span className="w-[2.5px] h-3 bg-[#d0d3d6] rounded-[1px]"></span>会员类型</span>
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

            {/* 第六行：引流人 */}
            <div className="flex items-start gap-3">
              <span className="mt-1 inline-flex items-center gap-[10px] text-[12px] text-[#8f959e] w-[62px] shrink-0"><span className="w-[2.5px] h-3 bg-[#d0d3d6] rounded-[1px]"></span>引流人</span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setSelectedReferrer("")}
                  className={`inline-flex h-[26px] items-center rounded-[2px] border px-3 text-[11px] ${selectedReferrer === "" ? "border-[#b3d4ff] bg-[#fafcff] text-[#3370ff]" : "border-[#e8eaed] bg-white text-[#646a73] hover:border-[#c0c4cc]"}`}
                >
                  全部
                </button>
                {referrerNames.map(name => (
                  <button
                    key={name}
                    onClick={() => setSelectedReferrer(name)}
                    className={`inline-flex h-[26px] items-center rounded-[2px] border px-3 text-[11px] ${selectedReferrer === name ? "border-[#b3d4ff] bg-[#fafcff] text-[#3370ff]" : "border-[#e8eaed] bg-white text-[#646a73] hover:border-[#c0c4cc]"}`}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 汇总卡片 */}
        <div className="bg-white rounded-[4px] px-[22px] py-4 mb-1.5">
          <div className="flex gap-3">
            <div className="w-[230px] bg-[#f7f8fa] rounded-lg py-[15px] px-3 pl-[24px]">
              <div className="flex items-center gap-1.5 mb-0.5"><span className="w-[6px] h-[6px] rounded-full" style={{ backgroundColor: "#5b8ff9" }}></span><span className="text-[12px] text-[#4e535a]">邀约到访</span></div>
              <div className="flex items-baseline gap-1"><span className="text-[20px] font-medium text-[#1f2329]">{totals.invited}</span><span className="text-[10px] text-[#8f959e]">人</span></div>
            </div>
            <div className="w-[230px] bg-[#f7f8fa] rounded-lg py-[15px] px-3 pl-[24px]">
              <div className="flex items-center gap-1.5 mb-0.5"><span className="w-[6px] h-[6px] rounded-full" style={{ backgroundColor: "#36cfc9" }}></span><span className="text-[12px] text-[#4e535a]">实际到访</span></div>
              <div className="flex items-baseline gap-1">
                <span className="text-[20px] font-medium text-[#1f2329]">{totals.arrived}</span>
                <span className="text-[10px] text-[#8f959e]">人</span>
                <span className="text-[10px] text-[#8f959e] ml-1">转化 {totals.invited > 0 ? `${Math.round((totals.arrived / totals.invited) * 100)}%` : "-"}</span>
              </div>
            </div>
            <div className="w-[230px] bg-[#f7f8fa] rounded-lg py-[15px] px-3 pl-[24px]">
              <div className="flex items-center gap-1.5 mb-0.5"><span className="w-[6px] h-[6px] rounded-full" style={{ backgroundColor: "#faad14" }}></span><span className="text-[12px] text-[#4e535a]">成交人数</span></div>
              <div className="flex items-baseline gap-1">
                <span className="text-[20px] font-medium text-[#1f2329]">{totals.converted}</span>
                <span className="text-[10px] text-[#8f959e]">人</span>
                <span className="text-[10px] text-[#8f959e] ml-1">转化 {totals.arrived > 0 ? `${Math.round((totals.converted / totals.arrived) * 100)}%` : "-"}</span>
              </div>
            </div>
            <div className="w-[230px] bg-[#f7f8fa] rounded-lg py-[15px] px-3 pl-[24px]">
              <div className="flex items-center gap-1.5 mb-0.5"><span className="w-[6px] h-[6px] rounded-full" style={{ backgroundColor: "#f5222d" }}></span><span className="text-[12px] text-[#4e535a]">成交金额</span></div>
              <div className="text-[20px] font-medium text-[#1f2329]">¥{Math.round(chartData.reduce((s, d) => s + (d.converted_amount || 0), 0))}</div>
            </div>
          </div>
        </div>

        {/* 折线图 + 身份分布 */}
        <div className="flex gap-1.5 mt-1.5">
          {/* 左侧：折线图 */}
          <div className="flex-1 min-w-0 bg-white rounded-[4px] px-[22px] py-4 select-none *:outline-none *:focus:outline-none" onMouseDown={(e) => e.preventDefault()}>
            <div className="mb-[18px]">
              <div className="text-[12px] text-[#4e535a] mb-2"><span className="font-medium">每{granularity === "day" ? "日" : granularity === "week" ? "周" : "月"}变化</span><span className="text-[#8f959e]">（{dateRange.from.replace(/(\d+)-(\d+)-(\d+)/, "$1年$2月$3日")}~{dateRange.to.replace(/(\d+)-(\d+)-(\d+)/, "$1年$2月$3日")}）</span></div>
              <div className="flex items-center gap-4">
                {(["invited", "arrived", "converted", "converted_amount"] as const).map((key) => (
                  <label key={key} className="flex items-center gap-1 cursor-pointer select-none" onClick={() => setVisibleLines((prev) => ({ ...prev, [key]: !prev[key] }))}>
                    <span
                      className="w-3.5 h-3.5 rounded border flex items-center justify-center text-[9px] leading-none"
                      style={{
                        borderColor: visibleLines[key] ? COLORS[key] : "#c8ccd0",
                        backgroundColor: visibleLines[key] ? COLORS[key] : "transparent",
                        color: "#fff",
                      }}
                    >
                      {visibleLines[key] && "✓"}
                    </span>
                    <span className="text-[11px]" style={{ color: visibleLines[key] ? COLORS[key] : "#c8ccd0" }}>{LABELS[key]}</span>
                  </label>
                ))}
              </div>
            </div>
          {loading ? (
            <div className="flex items-center justify-center h-[400px] text-[#8f959e]">加载中...</div>
          ) : chartData.length === 0 ? (
            <div className="flex items-center justify-center h-[400px] text-[#8f959e]">暂无数据</div>
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
                  <linearGradient id="gradInvited" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLORS.invited} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={COLORS.invited} stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="gradArrived" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLORS.arrived} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={COLORS.arrived} stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="gradConverted" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLORS.converted} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={COLORS.converted} stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="gradConvertedAmount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLORS.converted_amount} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={COLORS.converted_amount} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" stroke="#e8eaed" vertical={false} />
                <XAxis
                  dataKey="periodKey"
                  tick={{ fontSize: 11, fill: "#b0b5bd", fontWeight: "normal" }}
                  tickLine={false}
                  axisLine={{ stroke: "#d0d3d6" }}
                  height={20}
                  interval={granularity === "month" ? 0 : Math.max(0, Math.floor(chartData.length / 8))}
                  tickFormatter={(v) => {
                    const label = chartData.find(item => item.periodKey === v)?.label || v
                    if (granularity === "day") {
                      const parts = String(label).split("-")
                      return `${parts[1]}/${parts[2]}`
                    }
                    if (granularity === "week") {
                      // "7/1-7/7" → "7/1"
                      return String(label).split("-")[0]
                    }
                    return label
                  }}
                />
                {selectedTrendPeriod && <ReferenceLine x={selectedTrendPeriod} stroke="#3370ff" strokeDasharray="3 3" />}
                <YAxis tick={{ fontSize: 11, fill: "#b0b5bd", fontWeight: "normal" }} allowDecimals={false} ticks={yTicks} domain={[0, yTicks[yTicks.length - 1]]} tickLine={false} axisLine={false} width={lineYAxisWidth} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null
                    const order = ["invited", "arrived", "converted", "converted_amount"] as const
                    const seen = new Set<string>()
                    const filtered = payload.filter((item) => {
                      const key = String(item.dataKey) as typeof order[number]
                      if (seen.has(key)) return false
                      seen.add(key)
                      return (order as readonly string[]).includes(key)
                    })
                    const sorted = filtered.sort((a, b) => order.indexOf(String(a.dataKey) as typeof order[number]) - order.indexOf(String(b.dataKey) as typeof order[number]))
                    return (
                      <div style={{ fontSize: 12, background: "#fff", border: "1px solid #e8eaed", borderRadius: 4, padding: "6px 10px" }}>
                        <div style={{ color: "#8f959e", marginBottom: 4 }}>{payload[0]?.payload?.label || label}</div>
                        {sorted.map((item) => {
                          const key = String(item.dataKey) as typeof order[number]
                          const color = COLORS[key]
                          const val = key === "converted_amount" ? `¥${Math.round(item.value as number)}` : item.value
                          return (
                            <div key={key} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                              <span style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
                              <span style={{ color }}>{LABELS[key]}</span>
                              <span style={{ color, fontWeight: 500, marginLeft: "auto" }}>{val}</span>
                            </div>
                          )
                        })}
                      </div>
                    )
                  }}
                />
                {visibleLines.invited && <Area type="monotone" dataKey="invited" fill="url(#gradInvited)" stroke="none" tooltipType="none" />}
                {visibleLines.arrived && <Area type="monotone" dataKey="arrived" fill="url(#gradArrived)" stroke="none" tooltipType="none" />}
                {visibleLines.converted_amount && <Area type="monotone" dataKey="converted_amount" fill="url(#gradConvertedAmount)" stroke="none" tooltipType="none" />}
                {visibleLines.converted && <Area type="monotone" dataKey="converted" fill="url(#gradConverted)" stroke="none" tooltipType="none" />}
                {visibleLines.converted_amount && <Line type="monotone" dataKey="converted_amount" stroke={COLORS.converted_amount} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />}
                {visibleLines.converted && <Line type="monotone" dataKey="converted" stroke={COLORS.converted} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />}
                {visibleLines.arrived && <Line type="monotone" dataKey="arrived" stroke={COLORS.arrived} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />}
                {visibleLines.invited && <Line type="monotone" dataKey="invited" stroke={COLORS.invited} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />}
              </ComposedChart>
            </ResponsiveContainer>
          )}
          </div>

          {/* 右侧：身份分布竖向柱状图 */}
          <div className="flex-1 min-w-0 bg-white rounded-[4px] px-[22px] py-4 select-none *:outline-none *:focus:outline-none" onMouseDown={(e) => e.preventDefault()}>
            <div className="mb-[18px]">
              <div className="text-[12px] text-[#4e535a] mb-2"><span className="font-medium">会员身份人数</span><span className="text-[#8f959e]">（{LABELS[activeTab]}<span className="text-[#c8ccd0]"> · </span>{dateRange.from.replace(/(\d+)-(\d+)-(\d+)/, "$1年$2月$3日")}~{dateRange.to.replace(/(\d+)-(\d+)-(\d+)/, "$1年$2月$3日")}）</span></div>
              <div className="flex items-center gap-3 text-[11px]">
                <span className="text-[#8f959e]">新人 <span className="text-[#1f2329] font-medium">{dedupedDetails[detailsKey].filter((item) => item.member_type && identityTypeMap[item.member_type] === "新人").length}</span></span>
                <span className="text-[#c8ccd0]">|</span>
                <span className="text-[#8f959e]">老人 <span className="text-[#1f2329] font-medium">{dedupedDetails[detailsKey].filter((item) => item.member_type && identityTypeMap[item.member_type] === "老人").length}</span></span>
              </div>
            </div>
            {identityData.length === 0 ? (
              <div className="flex items-center justify-center h-[160px] text-[#8f959e] text-[12px]">暂无数据</div>
            ) : (
              <ResponsiveContainer width="100%" height={160} tabIndex={-1}>
                <BarChart data={identityData} margin={{ top: 10, right: 5, left: 0, bottom: 2 }}>
                  <CartesianGrid strokeDasharray="4 4" stroke="#e8eaed" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#b0b5bd" }} axisLine={false} tickLine={false} height={20} tickFormatter={(v) => v.length > 4 ? v.slice(0, 4) + "..." : v} />
                  <YAxis tick={{ fontSize: 11, fill: "#b0b5bd" }} axisLine={false} tickLine={false} allowDecimals={false} width={barYAxisWidth} domain={[0, (dataMax: number) => Math.ceil(dataMax / 4) * 4 + 4]} />
                  <Tooltip formatter={(value) => [value, "人数"]} contentStyle={{ fontSize: 12, borderRadius: 4 }} cursor={{ fill: "transparent" }} />
                  <Bar dataKey="value" radius={[2, 2, 0, 0]} barSize={20} activeBar={false}>
                    {identityData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={IDENTITY_COLORS[index % IDENTITY_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* 人员列表 */}
        <div className="mt-1.5 bg-white rounded-[4px] px-[22px] py-4 min-h-[400px]">
          <div className="mb-3">
            <div className="mb-2 flex items-center gap-2 text-[12px] font-medium text-[#4e535a]">
              <span>{{ invited: "邀约到访列表", arrived: "实际到访列表", converted: "成交人员列表", converted_amount: "成交账单列表" }[activeTab]}</span>
              <span className="font-normal text-[#8f959e]">（{selectedTrendPeriod ? formatPeriodLabel(selectedTrendPeriod, granularity) : `${dateRange.from.replace(/(\d+)-(\d+)-(\d+)/, "$1年$2月$3日")}~${dateRange.to.replace(/(\d+)-(\d+)-(\d+)/, "$1年$2月$3日")}`}）</span>
              {selectedTrendPeriod && <button className="font-normal text-[#3370ff] hover:text-[#245bdb]" onClick={() => { setSelectedTrendPeriod(""); goToPage(1) }}>查看全部</button>}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-[#8f959e]">统计维度</span>
              {activeTab === "converted_amount" ? (
                <div className="flex items-center bg-[#f0f1f3] rounded-[4px] p-[2px]">
                  {["全部", "会员卡", "觉醒游戏", "情绪释放", "OH卡", "其他项目"].map(t => (
                    <button
                      key={t}
                      onClick={() => setTypeFilter(t)}
                      className={`px-2 h-[22px] text-[11px] rounded-[2px] transition-all ${typeFilter === t ? "bg-white text-[#1f2329]" : "text-[#646a73] hover:text-[#4e535a]"}`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              ) : (
                <>
                  <div className="flex items-center bg-[#f0f1f3] rounded-[4px] p-[2px]">
                    <button
                      onClick={() => setStatDimension("range")}
                      className={`px-2 h-[22px] text-[11px] rounded-[2px] transition-all ${statDimension === "range" ? "bg-white text-[#1f2329]" : "text-[#646a73] hover:text-[#4e535a]"}`}
                    >
                      统计期间
                    </button>
                    <button
                      onClick={() => setStatDimension("total")}
                      className={`px-2 h-[22px] text-[11px] rounded-[2px] transition-all ${statDimension === "total" ? "bg-white text-[#1f2329]" : "text-[#646a73] hover:text-[#4e535a]"}`}
                    >
                      总数据
                    </button>
                  </div>
                  {statDimension === "range" && <span className="text-[11px] text-[#b0b5bd]">统计期间 - 仅统计选择时间范围内的用户相关数据</span>}
                  {statDimension === "total" && <span className="text-[11px] text-[#b0b5bd]">总数据 - 统计用户在系统中的所有数据</span>}
                </>
              )}
            </div>
          </div>

          {dedupedDetails[detailsKey].length === 0 ? (
            <div className="text-center text-[#8f959e] py-8">暂无数据</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12px] table-fixed">
                <thead>
                  <tr className="border-b border-[#f0f0f0]">
                    <th className="text-left py-2 px-3 text-[#8f959e] font-normal w-12">序号</th>
                    <th className="text-left py-2 px-3 text-[#8f959e] font-normal w-20">昵称</th>
                    {(activeTab === "converted_amount" ? [
                      ["member_type", "身份", "w-20"],
                      ["day_activities", "当日活动", "w-20"],
                      ["type", "项目类型", "w-24"],
                      ["name", "项目名称", "w-24"],
                      ["quantity", "购买场次", "w-20"],
                      ["amount", "成交金额", "w-24"],
                      ["date", "成交日期", "w-24"],
                    ] : [
                      ["member_type", "身份", "w-20"],
                      ["invited_count", "受邀次数", "w-20"],
                      ["visit_count", "到店次数", "w-20"],
                      ["visit_interval", "平均到店间隔", "w-20"],
                      ["activity_count", "参与活动", "w-20"],
                      ["total_consumption", "消费总额", "w-24"],
                      ["arrived", "是否到店", "w-20"],
                      ["status", "是否成交", "w-20"],
                      ["date", "日期", "w-24"],
                    ] as const).map(([field, label, w]) => (
                      <th key={field} className={`text-left py-2 px-3 text-[#8f959e] font-normal ${w}`}>
                        <span className="inline-flex items-center gap-0.5">
                          {label}
                          <span className="inline-flex flex-col leading-none cursor-pointer select-none" onClick={() => handleSort(field)}>
                            <span className={`text-[8px] ${sortField === field && sortOrder === "asc" ? "text-[#1f2329]" : "text-[#d0d3d6]"}`}>▲</span>
                            <span className={`text-[8px] -mt-[1px] ${sortField === field && sortOrder === "desc" ? "text-[#1f2329]" : "text-[#d0d3d6]"}`}>▼</span>
                          </span>
                        </span>
                      </th>
                    ))}
                    <th className="text-left py-2 px-3 text-[#8f959e] font-normal w-16">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedItems.map((item, index) => (
                    <tr key={index} className="group border-b border-[#f0f0f0] hover:bg-[#f7f8fa]">
                      <td className="py-2 px-3 text-[#4e535a] w-12">{index + 1}</td>
                      <td className="py-2 px-3 text-[#4e535a] w-20 truncate">{item.nickname || item.customer_id || "-"}</td>
                      <td className="py-2 px-3 text-[#4e535a] w-20 truncate">{item.member_type || "-"}</td>
                      {activeTab === "converted_amount" ? (
                        <>
                          <td
                            className={`py-2 px-3 w-20 ${item.activity_count != null && item.activity_count > 0 ? "cursor-pointer hover:text-[#2e7d32]" : "text-[#4e535a]"}`}
                            onClick={() => item.customer_id && item.date && item.activity_count != null && item.activity_count > 0 && handleStatClick("day_activities", item.customer_id, item.date)}
                          >{item.activity_count != null && item.activity_count > 0 ? `${item.activity_count}场` : "-"}</td>
                          <td className="py-2 px-3 text-[#4e535a] w-24 truncate">{item.type || "-"}</td>
                          <td className="py-2 px-3 text-[#4e535a] w-24 truncate">{item.name || "-"}</td>
                          <td className="py-2 px-3 text-[#4e535a] w-20">{item.quantity !== "" && item.quantity != null ? item.quantity : "-"}</td>
                          <td className="py-2 px-3 text-[#4e535a] w-24">{item.amount != null ? `¥${item.amount}` : "-"}</td>
                          <td className="py-2 px-3 text-[#4e535a] w-24">{item.date || "-"}</td>
                        </>
                      ) : (
                        <>
                          <td
                            className={`py-2 px-3 w-20 ${item.invited_count != null ? "cursor-pointer hover:text-[#2e7d32]" : "text-[#4e535a]"}`}
                            onClick={() => item.customer_id && item.invited_count != null && handleStatClick("invited", item.customer_id)}
                          >{item.invited_count != null ? `${item.invited_count}次` : "-"}</td>
                          <td
                            className={`py-2 px-3 w-20 ${item.visit_count != null ? "cursor-pointer hover:text-[#2e7d32]" : "text-[#4e535a]"}`}
                            onClick={() => item.customer_id && item.visit_count != null && handleStatClick("visits", item.customer_id)}
                          >{item.visit_count != null ? `${item.visit_count}次` : "-"}</td>
                          <td className="py-2 px-3 text-[#4e535a] w-20">{item.visit_interval ?? "-"}</td>
                          <td
                            className={`py-2 px-3 w-20 ${item.activity_count != null ? "cursor-pointer hover:text-[#2e7d32]" : "text-[#4e535a]"}`}
                            onClick={() => item.customer_id && item.activity_count != null && handleStatClick("activities", item.customer_id)}
                          >{item.activity_count != null ? `${item.activity_count}场` : "-"}</td>
                          <td
                            className={`py-2 px-3 w-24 ${item.total_consumption != null ? "cursor-pointer hover:text-[#2e7d32]" : "text-[#4e535a]"}`}
                            onClick={() => item.customer_id && item.total_consumption != null && handleStatClick("payments", item.customer_id)}
                          >{item.total_consumption != null ? `¥${item.total_consumption}` : "-"}</td>
                          <td className="py-2 px-3 w-20">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] ${
                              item.arrived ? "bg-[#e8f5e9] text-[#2e7d32]" : "bg-[#f0f1f2] text-[#8f959e]"
                            }`}>
                              {item.arrived ? "已到店" : "未到店"}
                            </span>
                          </td>
                          <td className="py-2 px-3 w-20">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] ${
                              item.status === "converted" ? "bg-[#fff7e6] text-[#d48806]" : "bg-[#f0f1f2] text-[#8f959e]"
                            }`}>
                              {item.status === "converted" ? "已成交" : "未成交"}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-[#4e535a] w-24">{item.date || "-"}</td>
                        </>
                      )}
                      <td className="py-2 px-3 w-16">
                        {item.customer_id && (
                          <button
                            onClick={() => { setSelectedCustomerId(item.customer_id!); setDetailOpen(true) }}
                            className="text-[#8f959e] hover:text-[#4e535a]"
                          >
                            <FileText className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <PaginationBar
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            startIndex={startIndex}
            endIndex={endIndex}
            onPageChange={goToPage}
          />
        </div>
      </div>

      {/* 数字列详情弹窗 */}
      <Dialog open={popupType !== null} onOpenChange={(open) => { if (!open) { setPopupType(null); setPopupData(null); setPopupCustomerId(null); setPopupDate(null) } }}>
        <DialogContent className={`${popupType === "payments" ? "max-w-[680px]" : "max-w-[580px]"} max-h-[60vh] overflow-y-auto p-0 gap-0`} initialFocus={false}>
          {popupType === "invited" && (
            <>
              <div className="px-4 py-3 border-b border-[#f0f0f0]">
                <span className="text-[14px] font-medium text-[#1f2329]">受邀记录</span>
                {popupData?.customer?.nickname && <span className="text-[14px] text-[#8f959e]"> - {popupData.customer.nickname}</span>}
              </div>
              {popupLoading ? (
                <div className="px-4 py-8 text-center text-[#8f959e] text-[12px]">加载中...</div>
              ) : !popupData?.visit_records?.filter(v => statDimension === "total" || (v.visit_date && dateRange.from <= v.visit_date && v.visit_date <= dateRange.to)).length ? (
                <div className="px-4 py-8 text-center text-[#8f959e] text-[12px]">暂无受邀记录</div>
              ) : (
                <div>
                  <div className="flex items-center px-4 py-1.5 text-[11px] text-[#8f959e] border-b border-[#f0f0f0]">
                    <span className="w-32 shrink-0">日期</span>
                    <span className="w-20 shrink-0">邀约人</span>
                    <span className="flex-1 min-w-0">需求</span>
                  </div>
                  {popupData.visit_records.filter(v => statDimension === "total" || (v.visit_date && dateRange.from <= v.visit_date && v.visit_date <= dateRange.to)).sort((a, b) => b.visit_date.localeCompare(a.visit_date)).map((v, i) => (
                    <div key={i} className="flex items-start px-4 py-2 hover:bg-[#f7f8fa] text-[12px] text-[#4e535a]">
                      <span className="w-32 shrink-0 whitespace-nowrap">{v.visit_date}{!v.arrived && <span className="ml-0.5 text-[#8f959e]">（未到店）</span>}</span>
                      <span className="w-20 shrink-0 text-[#8f959e]">{v.referrer_handler || "-"}</span>
                      <span className="flex-1 min-w-0">{v.needs || "-"}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
          {popupType === "visits" && (
            <>
              <div className="px-4 py-3 border-b border-[#f0f0f0]">
                <span className="text-[14px] font-medium text-[#1f2329]">到店记录</span>
                {popupData?.customer?.nickname && <span className="text-[14px] text-[#8f959e]"> - {popupData.customer.nickname}</span>}
              </div>
              {popupLoading ? (
                <div className="px-4 py-8 text-center text-[#8f959e] text-[12px]">加载中...</div>
              ) : !popupData?.visit_records?.filter(v => v.arrived && (statDimension === "total" || (v.visit_date && dateRange.from <= v.visit_date && v.visit_date <= dateRange.to))).length ? (
                <div className="px-4 py-8 text-center text-[#8f959e] text-[12px]">暂无到店记录</div>
              ) : (
                <div>
                  <div className="flex items-center px-4 py-1.5 text-[11px] text-[#8f959e] border-b border-[#f0f0f0]">
                    <span className="w-32 shrink-0">日期</span>
                    <span className="w-20 shrink-0">邀约人</span>
                    <span className="flex-1 min-w-0">需求</span>
                  </div>
                  {popupData.visit_records.filter(v => v.arrived && (statDimension === "total" || (v.visit_date && dateRange.from <= v.visit_date && v.visit_date <= dateRange.to))).sort((a, b) => b.visit_date.localeCompare(a.visit_date)).map((v, i) => (
                    <div key={i} className="flex items-start px-4 py-2 hover:bg-[#f7f8fa] text-[12px] text-[#4e535a]">
                      <span className="w-32 shrink-0 whitespace-nowrap">{v.visit_date}</span>
                      <span className="w-20 shrink-0 text-[#8f959e]">{v.referrer_handler || "-"}</span>
                      <span className="flex-1 min-w-0">{v.needs || "-"}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
          {popupType === "activities" && (
            <>
              <div className="px-4 py-3 border-b border-[#f0f0f0]">
                <span className="text-[14px] font-medium text-[#1f2329]">参与活动</span>
                {popupData?.customer?.nickname && <span className="text-[14px] text-[#8f959e]"> - {popupData.customer.nickname}</span>}
              </div>
              {popupLoading ? (
                <div className="px-4 py-8 text-center text-[#8f959e] text-[12px]">加载中...</div>
              ) : !popupData?.activities?.filter(a => statDimension === "total" || (a.date && dateRange.from <= a.date && a.date <= dateRange.to)).length ? (
                <div className="px-4 py-8 text-center text-[#8f959e] text-[12px]">暂无参与活动</div>
              ) : (
                <div>
                  <div className="flex items-center px-4 py-1.5 text-[11px] text-[#8f959e] border-b border-[#f0f0f0]">
                    <span className="w-20 shrink-0">日期</span>
                    <span className="w-16 shrink-0">类型</span>
                    <span className="flex-1 min-w-0">活动名称</span>
                    <span className="w-20 shrink-0">老师</span>
                    <span className="w-12 shrink-0 text-right">身份</span>
                  </div>
                  {popupData.activities.filter(a => statDimension === "total" || (a.date && dateRange.from <= a.date && a.date <= dateRange.to)).map((a, i) => (
                    <div key={i} className="flex items-center px-4 py-2 hover:bg-[#f7f8fa] text-[12px] text-[#4e535a]">
                      <span className="w-20 shrink-0">{a.date}</span>
                      <span className="w-16 shrink-0 text-[#8f959e]">{(a.type === "沙龙类型" || a.type === "内部课程") && a.course_type ? a.course_type : a.type || ""}</span>
                      <span className="flex-1 min-w-0 truncate">{a.name}</span>
                      <span className="w-20 shrink-0 text-[#8f959e] truncate">{a.host || ""}</span>
                      <span className="w-12 shrink-0 text-right text-[#8f959e]">{a.role}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
          {popupType === "day_activities" && (
            <>
              <div className="px-4 py-3 border-b border-[#f0f0f0]">
                <span className="text-[14px] font-medium text-[#1f2329]">当日活动</span>
                {popupData?.customer?.nickname && <span className="text-[14px] text-[#8f959e]"> - {popupData.customer.nickname}</span>}
                {popupDate && <span className="text-[12px] text-[#8f959e] ml-2">{popupDate}</span>}
              </div>
              {popupLoading ? (
                <div className="px-4 py-8 text-center text-[#8f959e] text-[12px]">加载中...</div>
              ) : !popupData?.activities?.filter(a => a.date === popupDate).length ? (
                <div className="px-4 py-8 text-center text-[#8f959e] text-[12px]">当日暂无参与活动</div>
              ) : (
                <div>
                  <div className="flex items-center px-4 py-1.5 text-[11px] text-[#8f959e] border-b border-[#f0f0f0]">
                    <span className="w-20 shrink-0">日期</span>
                    <span className="w-16 shrink-0">类型</span>
                    <span className="flex-1 min-w-0">活动名称</span>
                    <span className="w-20 shrink-0">老师</span>
                    <span className="w-12 shrink-0 text-right">身份</span>
                  </div>
                  {popupData.activities.filter(a => a.date === popupDate).map((a, i) => (
                    <div key={i} className="flex items-center px-4 py-2 hover:bg-[#f7f8fa] text-[12px] text-[#4e535a]">
                      <span className="w-20 shrink-0">{a.date}</span>
                      <span className="w-16 shrink-0 text-[#8f959e]">{(a.type === "沙龙类型" || a.type === "内部课程") && a.course_type ? a.course_type : a.type || ""}</span>
                      <span className="flex-1 min-w-0 truncate">{a.name}</span>
                      <span className="w-20 shrink-0 text-[#8f959e] truncate">{a.host || ""}</span>
                      <span className="w-12 shrink-0 text-right text-[#8f959e]">{a.role}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
          {popupType === "payments" && (
            <>
              <div className="px-4 py-3 border-b border-[#f0f0f0]">
                <span className="text-[14px] font-medium text-[#1f2329]">消费记录</span>
                {popupData?.customer?.nickname && <span className="text-[14px] text-[#8f959e]"> - {popupData.customer.nickname}</span>}
              </div>
              {popupLoading ? (
                <div className="px-4 py-8 text-center text-[#8f959e] text-[12px]">加载中...</div>
              ) : !popupData?.payment_records?.filter(p => !p.voided && (statDimension === "total" || (p.effective_date && dateRange.from <= p.effective_date && p.effective_date <= dateRange.to))).length ? (
                <div className="px-4 py-8 text-center text-[#8f959e] text-[12px]">暂无消费记录</div>
              ) : (
                <div>
                  <div className="flex items-center px-4 py-1.5 text-[11px] text-[#8f959e] border-b border-[#f0f0f0]">
                    <span className="w-24 shrink-0">项目</span>
                    <span className="w-16 shrink-0">金额</span>
                    <span className="w-12 shrink-0">次数</span>
                    <span className="w-24 shrink-0">成交日期</span>
                    <span className="w-24 shrink-0">生效日期</span>
                    <span className="w-24 shrink-0">结束日期</span>
                    <span className="w-28 shrink-0">成交人</span>
                  </div>
                  {popupData.payment_records.filter(p => !p.voided && (statDimension === "total" || (p.effective_date && dateRange.from <= p.effective_date && p.effective_date <= dateRange.to))).map((p, i) => (
                    <div key={i} className="flex items-center px-4 py-2 hover:bg-[#f7f8fa] text-[12px] text-[#4e535a]">
                      <span className="w-24 shrink-0 truncate">{p.name}</span>
                      <span className="w-16 shrink-0">¥{p.amount}</span>
                      <span className="w-12 shrink-0">{p.quantity}</span>
                      <span className="w-24 shrink-0 text-[#8f959e]">{p.created_at || "-"}</span>
                      <span className="w-24 shrink-0 text-[#8f959e]">{p.effective_date || "-"}</span>
                      <span className="w-24 shrink-0 text-[#8f959e]">{p.expiry_date || "-"}</span>
                      <span className="w-28 shrink-0 text-[#8f959e]">{p.closer_name || "-"}{p.amount ? ` ¥${p.amount}` : ""}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* 客户详情弹窗 */}
      <Dialog open={detailOpen} onOpenChange={(open) => { setDetailOpen(open); if (!open) setSelectedCustomerId(null) }}>
        <DialogContent className="max-w-[1180px] max-h-[90vh] overflow-y-auto p-0 gap-0">
          <DetailView
            selectedCustomerId={selectedCustomerId}
            onClearSelection={() => setDetailOpen(false)}
            hideSearch
            defaultTab="healing"
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
