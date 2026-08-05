import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts"
import { statisticsApi, customerDetailApi, type ActivityRecord, type PaymentRecord } from "@/lib/api"
import DetailView from "@/pages/healing-records/components/detail-view"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { usePagination } from "@/hooks/use-pagination"
import { PaginationBar } from "@/components/pagination-bar"
import { EmptyValue } from "@/components/empty-value"
import { formatPeriodLabel, getDatePeriodKey } from "@/lib/chart-period"

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate()
}

interface MemberStatistics {
  total_members: number
  type_totals: Record<string, number>
  total_members_all: number
  type_totals_all: Record<string, number>
  type_names: string[]
  referrer_names: string[]
  chart_new: Array<Record<string, string | number>>
  chart_total: Array<Record<string, string | number>>
  members: Array<{
    id: string
    nickname: string
    member_type: string
    created_date: string
    referral_date: string
    first_visit_date: string
    invited_count: number
    visit_count: number
    visit_interval: string
    activity_count: number
    total_consumption: number
  }>
}

export default function MemberStatisticsPage() {
  const [data, setData] = useState<MemberStatistics | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set())
  const [selectedReferrer, setSelectedReferrer] = useState("")
  const [selectedTrendPeriod, setSelectedTrendPeriod] = useState("")
  const [timeView, setTimeView] = useState<"year" | "month">("month")
  const [granularity, setGranularity] = useState<"day" | "week" | "month">("day")
  const [dataType, setDataType] = useState<"total" | "new">("total")
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [detailCustomerId, setDetailCustomerId] = useState<string | null>(null)
  const [detailType, setDetailType] = useState<"invited" | "arrived" | "activity" | "payment" | null>(null)
  const [detailRecords, setDetailRecords] = useState<Array<Record<string, unknown>>>([])
  const [detailLoading, setDetailLoading] = useState(false)
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

  const SortArrow = ({ field }: { field: string }) => (
    <span className="inline-flex flex-col ml-1 cursor-pointer align-middle">
      <span className={`text-[8px] leading-[8px] ${sortField === field && sortOrder === "asc" ? "text-[#1f2329]" : "text-[#d0d3d6]"}`}>▲</span>
      <span className={`text-[8px] leading-[8px] ${sortField === field && sortOrder === "desc" ? "text-[#1f2329]" : "text-[#d0d3d6]"}`}>▼</span>
    </span>
  )

  const now = new Date()
  const [startYear, setStartYear] = useState(now.getFullYear())
  const [startMonth, setStartMonth] = useState(now.getMonth() + 1)
  const [startDay, setStartDay] = useState(1)
  const [endYear, setEndYear] = useState(now.getFullYear())
  const [endMonth, setEndMonth] = useState(now.getMonth() + 1)
  const [endDay, setEndDay] = useState(getDaysInMonth(now.getFullYear(), now.getMonth() + 1))

  const dateRange = useMemo(() => {
    const from = `${startYear}-${String(startMonth).padStart(2, "0")}-${String(startDay).padStart(2, "0")}`
    const to = `${endYear}-${String(endMonth).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`
    return { from, to }
  }, [startYear, startMonth, startDay, endYear, endMonth, endDay])

  // 当数据加载后，初始化选中所有类型（仅首次）
  const typesInitializedRef = useRef(false)
  useEffect(() => {
    if (data?.type_names && !typesInitializedRef.current) {
      typesInitializedRef.current = true
      setSelectedTypes(new Set(data.type_names))
    }
  }, [data?.type_names])

  const isAllSelected = useMemo(() => {
    if (!data?.type_names) return false
    return data.type_names.every(t => selectedTypes.has(t))
  }, [data?.type_names, selectedTypes])

  const toggleType = (type: string) => {
    setSelectedTypes(prev => {
      const next = new Set(prev)
      if (next.has(type)) {
        next.delete(type)
      } else {
        next.add(type)
      }
      return next
    })
  }

  const toggleAll = () => {
    if (!data?.type_names) return
    if (isAllSelected) {
      setSelectedTypes(new Set())
    } else {
      setSelectedTypes(new Set(data.type_names))
    }
  }

  // 计算选中类型的总人数（根据数据类型切换全部/新增）
  const selectedTotal = useMemo(() => {
    const totals = dataType === "total" ? data?.type_totals_all : data?.type_totals
    if (!totals) return 0
    let total = 0
    for (const type of selectedTypes) {
      total += totals[type] || 0
    }
    return total
  }, [data?.type_totals, data?.type_totals_all, selectedTypes, dataType])

  // 筛选选中类型的人员列表
  const filteredMembers = useMemo(() => {
    if (!data?.members) return []
    let list = data.members.filter(m => selectedTypes.has(m.member_type))
    if (selectedTrendPeriod) {
      list = list.filter(member => getDatePeriodKey(member.created_date, granularity) === selectedTrendPeriod)
    }
    if (sortField) {
      list = [...list].sort((a, b) => {
        let va: number | string = 0
        let vb: number | string = 0
        if (sortField === "member_type") { va = a.member_type; vb = b.member_type }
        else if (sortField === "first_visit_date") { va = a.first_visit_date || ""; vb = b.first_visit_date || "" }
        else if (sortField === "visit_count") { va = a.visit_count; vb = b.visit_count }
        else if (sortField === "visit_interval") { va = a.visit_interval || ""; vb = b.visit_interval || "" }
        else if (sortField === "activity_count") { va = a.activity_count; vb = b.activity_count }
        else if (sortField === "total_consumption") { va = a.total_consumption; vb = b.total_consumption }
        if (va < vb) return sortOrder === "asc" ? -1 : 1
        if (va > vb) return sortOrder === "asc" ? 1 : -1
        return 0
      })
    }
    return list
  }, [data?.members, selectedTypes, selectedTrendPeriod, granularity, sortField, sortOrder])

  const { paginatedItems: paginatedMembers, currentPage, totalPages, totalItems, goToPage, startIndex, endIndex } = usePagination(filteredMembers, { pageSize: 10 })

  useEffect(() => {
    setSelectedTrendPeriod("")
    goToPage(1)
  }, [dateRange, granularity, selectedReferrer, selectedTypes])

  // 图表数据：根据所选类型和数据类型计算
  const chartData = useMemo(() => {
    const chartSource = dataType === "new" ? data?.chart_new : data?.chart_total
    if (!chartSource) return []

    return chartSource.map((item) => {
      const dateStr = item.date as string
      let total = 0
      for (const type of selectedTypes) {
        total += Number(item[type]) || 0
      }

      let label = ""
      if (granularity === "day") {
        const parts = dateStr.split("-")
        label = `${parts[1]}/${parts[2]}`
      } else if (granularity === "week") {
        label = dateStr
      } else {
        label = `${parseInt(dateStr.split("-")[1])}月`
      }

      return { date: dateStr, total, label }
    })
  }, [data?.chart_new, data?.chart_total, granularity, selectedTypes, dataType])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await statisticsApi.members({
        date_from: dateRange.from,
        date_to: dateRange.to,
        granularity,
        referrer: selectedReferrer || undefined,
        time_by: "referral",
      })
      setData(res)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [dateRange, granularity, selectedReferrer])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // 获取详情记录
  useEffect(() => {
    if (!detailCustomerId || !detailType) {
      setDetailRecords([])
      return
    }
    setDetailLoading(true)
    customerDetailApi.get(detailCustomerId)
      .then(res => {
        if (detailType === "invited") {
          setDetailRecords(res.visit_records.map(v => ({
            date: v.visit_date,
            referrer: v.referrer_handler || "-",
            needs: v.needs || "-",
            arrived: v.arrived,
          })))
        } else if (detailType === "arrived") {
          setDetailRecords(res.visit_records.filter(v => v.arrived).map(v => ({
            date: v.visit_date,
            referrer: v.referrer_handler || "-",
            needs: v.needs || "-",
          })))
        } else if (detailType === "activity") {
          setDetailRecords(res.activities.map(a => ({
            date: a.date,
            type: a.type,
            name: a.name,
            teacher: a.host || "-",
            role: a.role || "-",
          })))
        } else if (detailType === "payment") {
          setDetailRecords(res.payment_records.filter(p => !p.voided).map(p => ({
            project: p.name || "-",
            amount: p.amount,
            times: p.quantity || 1,
            deal_date: p.created_at ? p.created_at.split("T")[0] : "-",
            effective_date: p.effective_date || "-",
            expiry_date: p.expiry_date || "-",
            salesperson: p.closer_name || "-",
          })))
        }
      })
      .catch(() => setDetailRecords([]))
      .finally(() => setDetailLoading(false))
  }, [detailCustomerId, detailType])

  return (
    <div className="min-h-full bg-[#f7f8fa] px-2.5 pt-2.5 pb-6">
      <div>
        <div className="bg-white rounded-[4px] px-[22px] py-4 mb-1.5">
          <h1 className="text-[16px] font-medium text-[#1f2329] mb-4">会员情况</h1>

          {/* 筛选栏 */}
          <div className="flex flex-col gap-3">
            {/* 第一行：统计范围 + 时间范围 */}
            <div className="flex items-center gap-3">
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
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-[10px] text-[12px] text-[#8f959e] w-[62px] shrink-0"><span className="w-[2.5px] h-3 bg-[#d0d3d6] rounded-[1px]"></span>数据类型</span>
              <div className="flex items-center bg-[#f0f1f3] rounded-[4px] p-[2px]">
                <button
                  onClick={() => setDataType("total")}
                  className={`px-3 h-[26px] text-[11px] rounded-[2px] transition-all ${dataType === "total" ? "bg-white text-[#1f2329] " : "text-[#646a73] hover:text-[#4e535a]"}`}
                >
                  总数
                </button>
                <button
                  onClick={() => setDataType("new")}
                  className={`px-3 h-[26px] text-[11px] rounded-[2px] transition-all ${dataType === "new" ? "bg-white text-[#1f2329] " : "text-[#646a73] hover:text-[#4e535a]"}`}
                >
                  新增
                </button>
              </div>
            </div>

            {/* 第四行：会员类型（多选 Chip） */}
            <div className="flex items-start gap-3">
              <span className="inline-flex items-center gap-[10px] text-[12px] text-[#8f959e] w-[62px] shrink-0 mt-1"><span className="w-[2.5px] h-3 bg-[#d0d3d6] rounded-[1px]"></span>会员类型</span>
              <div className="flex items-center flex-wrap gap-2">
                <button
                  onClick={toggleAll}
                  className={`inline-flex items-center px-3 h-[26px] text-[11px] rounded-[2px] transition-all ${isAllSelected ? "bg-[#fafcff] border border-[#b3d4ff] text-[#3370ff]" : "bg-white border border-[#e8eaed] text-[#646a73] hover:border-[#c0c4cc]"}`}
                >
                  全部
                </button>
                {data?.type_names?.map((t) => (
                  <button
                    key={t}
                    onClick={() => toggleType(t)}
                    className={`inline-flex items-center px-3 h-[26px] text-[11px] rounded-[2px] transition-all ${isAllSelected || selectedTypes.has(t) ? "bg-[#fafcff] border border-[#b3d4ff] text-[#3370ff]" : "bg-white border border-[#e8eaed] text-[#646a73] hover:border-[#c0c4cc]"}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* 第五行：引流人 */}
            <div className="flex items-start gap-3">
              <span className="inline-flex items-center gap-[10px] text-[12px] text-[#8f959e] w-[62px] shrink-0 mt-1"><span className="w-[2.5px] h-3 bg-[#d0d3d6] rounded-[1px]"></span>引流人</span>
              <div className="flex items-center flex-wrap gap-2">
                <button
                  onClick={() => setSelectedReferrer("")}
                  className={`inline-flex items-center px-3 h-[26px] text-[11px] rounded-[2px] transition-all ${selectedReferrer === "" ? "bg-[#fafcff] border border-[#b3d4ff] text-[#3370ff]" : "bg-white border border-[#e8eaed] text-[#646a73] hover:border-[#c0c4cc]"}`}
                >
                  全部
                </button>
                {data?.referrer_names?.map((name) => (
                  <button
                    key={name}
                    onClick={() => setSelectedReferrer(name)}
                    className={`inline-flex items-center px-3 h-[26px] text-[11px] rounded-[2px] transition-all ${selectedReferrer === name ? "bg-[#fafcff] border border-[#b3d4ff] text-[#3370ff]" : "bg-white border border-[#e8eaed] text-[#646a73] hover:border-[#c0c4cc]"}`}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 卡片区域 + 折线图左右布局 */}
        <div className="flex gap-1.5">
          {/* 左侧：卡片区域 */}
          <div className="w-[650px] bg-white rounded-[4px] px-[22px] py-4">
            <div className="mb-3">
              <div className="text-[12px] font-medium text-[#4e535a]">会员人数<span className="font-normal text-[#8f959e]">（当前统计）</span></div>
            </div>
            <div className="grid grid-cols-6 gap-2">
              {/* 总人数卡片 */}
              <div className="bg-white border border-[#e8eaed] rounded-[2px] px-3 py-1.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="w-[6px] h-[6px] rounded-[2px] bg-[#f5222d]"></span>
                  <span className="text-[12px] text-[#4e535a]">总人数</span>
                </div>
                <span className="text-[19px] font-medium text-[#1f2329]">{loading ? "..." : selectedTotal}<span className="text-[10px] text-[#8f959e] ml-1">人</span></span>
              </div>

              {/* 各类型会员卡片 */}
              {data?.type_names?.filter(t => selectedTypes.has(t)).map((typeName) => (
                <div key={typeName} className="bg-white border border-[#e8eaed] rounded-[2px] px-3 py-1.5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="w-[6px] h-[6px] rounded-[2px] bg-[#3370ff]"></span>
                    <span className="text-[12px] text-[#4e535a] truncate">{typeName}</span>
                  </div>
                  <span className="text-[18px] font-medium text-[#1f2329]">{loading ? "..." : (dataType === "total" ? data?.type_totals_all[typeName] : data?.type_totals[typeName]) ?? 0}<span className="text-[10px] text-[#8f959e] ml-1">人</span></span>
                </div>
              ))}
            </div>
          </div>

          {/* 右侧：折线图 */}
          <div className="flex-1 min-w-0 bg-white rounded-[4px] py-4">
            <div className="mb-[18px] px-[22px]">
              <div className="text-[12px] text-[#4e535a] mb-2"><span className="font-medium">每{granularity === "day" ? "日" : granularity === "week" ? "周" : "月"}{dataType === "new" ? "新增会员" : "会员总数"}变化</span><span className="text-[#8f959e]">（{dateRange.from.replace(/(\d+)-(\d+)-(\d+)/, "$1年$2月$3日")}~{dateRange.to.replace(/(\d+)-(\d+)-(\d+)/, "$1年$2月$3日")}）</span></div>
              <div className="text-[11px] text-[#8f959e]">已选中 {selectedTypes.size} 个类型</div>
            </div>
            {loading ? (
              <div className="flex items-center justify-center h-[200px] text-[#8f959e] text-[12px]">加载中...</div>
            ) : chartData.length === 0 || selectedTypes.size === 0 ? (
              <div className="flex items-center justify-center h-[200px] text-[#8f959e] text-[12px]">暂无数据</div>
            ) : (
              <ResponsiveContainer width="100%" height={180} tabIndex={-1}>
                <LineChart
                  data={chartData}
                  margin={{ top: 10, right: 14, left: 2, bottom: 2 }}
                  className="cursor-pointer"
                  onClick={(state) => {
                    if (state.activeLabel !== undefined) {
                      const period = String(state.activeLabel)
                      setSelectedTrendPeriod(period)
                      goToPage(1)
                    }
                  }}
                >
                  <CartesianGrid strokeDasharray="4 4" stroke="#e8eaed" vertical={false} />
                  <XAxis
                    dataKey="date"
                  tick={{ fontSize: 11, fill: "#b0b5bd", fontWeight: "normal" }}
                  tickLine={false}
                  axisLine={{ stroke: "#d0d3d6" }}
                  height={20}
                    interval={granularity === "month" ? 0 : Math.max(0, Math.floor(chartData.length / 8))}
                    tickFormatter={value => chartData.find(item => item.date === value)?.label || String(value)}
                  />
                  {selectedTrendPeriod && <ReferenceLine x={selectedTrendPeriod} stroke="#3370ff" strokeDasharray="3 3" />}
                <YAxis
                  tick={{ fontSize: 11, fill: "#b0b5bd", fontWeight: "normal" }}
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                  tickFormatter={(v) => Number(v) >= 10000 ? `${(Number(v) / 10000).toFixed(0)}万` : String(v)}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null
                    return (
                      <div style={{ fontSize: 12, background: "#fff", border: "1px solid #e8eaed", borderRadius: 4, padding: "6px 10px" }}>
                        <div style={{ color: "#8f959e", marginBottom: 4 }}>{label}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#3370ff" }} />
                          <span style={{ color: "#3370ff" }}>会员人数</span>
                          <span style={{ color: "#3370ff", fontWeight: 500, marginLeft: "auto" }}>{payload[0].value}人</span>
                        </div>
                      </div>
                    )
                  }}
                />
                <Line type="monotone" dataKey="total" stroke="#3370ff" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
          </div>
        </div>

        {/* 人员列表 */}
        <div className="mt-1.5 bg-white rounded-[4px] px-[22px] py-4">
          <div className="mb-3">
            <div className="flex items-center gap-2 text-[12px] font-medium text-[#4e535a]">
              <span>人员列表<span className="font-normal text-[#8f959e]">（{filteredMembers.length}人）</span></span>
              {selectedTrendPeriod && <span className="font-normal text-[#8f959e]">{formatPeriodLabel(selectedTrendPeriod, granularity)}</span>}
              {selectedTrendPeriod && <button className="font-normal text-[#3370ff] hover:text-[#245bdb]" onClick={() => { setSelectedTrendPeriod(""); goToPage(1) }}>查看全部</button>}
            </div>
          </div>
          {loading ? (
            <div className="py-16 text-center text-[12px] text-[#8f959e]">加载中...</div>
          ) : filteredMembers.length === 0 ? (
            <div className="py-16 text-center text-[12px] text-[#8f959e]">暂无数据</div>
          ) : (
            <div>
              <div className="overflow-x-auto">
                <table className="w-full table-fixed border-collapse text-left">
                  <thead>
                    <tr className="h-9 border-b border-[#f0f0f0] bg-[#fafafa] text-[11px] font-normal text-[#8f959e]">
                      <th className="w-[100px] px-3 font-normal">昵称</th>
                      <th className="w-[100px] cursor-pointer select-none px-3 font-normal" onClick={() => handleSort("member_type")}>
                        会员身份<SortArrow field="member_type" />
                      </th>
                      <th className="w-[100px] cursor-pointer select-none px-3 font-normal" onClick={() => handleSort("first_visit_date")}>
                        首次到店<SortArrow field="first_visit_date" />
                      </th>
                      <th className="w-[80px] px-3 font-normal">受邀次数</th>
                      <th className="w-[80px] cursor-pointer select-none px-3 font-normal" onClick={() => handleSort("visit_count")}>
                        到店次数<SortArrow field="visit_count" />
                      </th>
                      <th className="w-[110px] cursor-pointer select-none px-3 font-normal" onClick={() => handleSort("visit_interval")}>
                        平均到店间隔<SortArrow field="visit_interval" />
                      </th>
                      <th className="w-[90px] cursor-pointer select-none px-3 font-normal" onClick={() => handleSort("activity_count")}>
                        参与活动<SortArrow field="activity_count" />
                      </th>
                      <th className="w-[100px] cursor-pointer select-none px-3 font-normal" onClick={() => handleSort("total_consumption")}>
                        消费总额<SortArrow field="total_consumption" />
                      </th>
                      <th className="w-[100px] px-3 font-normal">引流日期</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedMembers.map((member) => (
                      <tr key={member.id} className="h-11 border-b border-[#f0f0f0] text-[12px] text-[#4e535a] last:border-b-0 hover:bg-[#f7f8fa]">
                        <td className="truncate px-3">
                          <button
                            onClick={() => setSelectedCustomerId(member.id)}
                            className="text-[#4e535a] hover:underline text-left"
                          >
                            {member.nickname || <EmptyValue />}
                          </button>
                        </td>
                        <td className="truncate px-3">{member.member_type || <EmptyValue />}</td>
                        <td className="truncate px-3 tabular-nums">{member.first_visit_date || <EmptyValue />}</td>
                        <td className="truncate px-3 tabular-nums">
                          {member.invited_count === 0 ? <EmptyValue /> : (
                            <button
                              onClick={() => { setDetailCustomerId(member.id); setDetailType("invited") }}
                              className="text-left text-[#4e535a] hover:underline"
                            >
                              {member.invited_count}次
                            </button>
                          )}
                        </td>
                        <td className="truncate px-3 tabular-nums">
                          {member.visit_count === 0 ? <EmptyValue /> : (
                            <button
                              onClick={() => { setDetailCustomerId(member.id); setDetailType("arrived") }}
                              className="text-left text-[#4e535a] hover:underline"
                            >
                              {member.visit_count}次
                            </button>
                          )}
                        </td>
                        <td className="truncate px-3 tabular-nums">{member.visit_interval || <EmptyValue />}</td>
                        <td className="truncate px-3 tabular-nums">
                          <button
                            onClick={() => { setDetailCustomerId(member.id); setDetailType("activity") }}
                            className="text-[#4e535a] hover:underline text-left"
                          >
                            {member.activity_count}场
                          </button>
                        </td>
                        <td className="truncate px-3 tabular-nums">
                          <button
                            onClick={() => { setDetailCustomerId(member.id); setDetailType("payment") }}
                            className="text-[#4e535a] hover:underline text-left"
                          >
                            {member.total_consumption.toLocaleString()}
                          </button>
                        </td>
                        <td className="truncate px-3 tabular-nums">{member.referral_date || <EmptyValue />}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <PaginationBar
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={totalItems}
                startIndex={startIndex}
                endIndex={endIndex}
                onPageChange={goToPage}
              />
            </div>
          )}
        </div>
      </div>

      {/* 客户详情弹窗 */}
      <Dialog open={!!selectedCustomerId} onOpenChange={(open) => { if (!open) setSelectedCustomerId(null) }}>
        <DialogContent className="max-w-[1180px] max-h-[90vh] overflow-hidden flex flex-col p-0">
          <DetailView
            selectedCustomerId={selectedCustomerId}
            onClearSelection={() => setSelectedCustomerId(null)}
            hideSearch
            defaultTab="healing"
          />
        </DialogContent>
      </Dialog>

      {/* 受邀次数/到店次数/参与活动/消费记录详情弹窗 */}
      <Dialog open={!!detailCustomerId && !!detailType} onOpenChange={(open) => { if (!open) { setDetailCustomerId(null); setDetailType(null) } }}>
        <DialogContent className={`${detailType === "payment" ? "max-w-[680px]" : "max-w-[580px]"} max-h-[60vh] overflow-y-auto p-0 gap-0`} initialFocus={false}>
          <div className="px-4 py-3 border-b border-[#f0f0f0]">
            <span className="text-[14px] font-medium text-[#1f2329]">
              {detailType === "invited" && "受邀记录"}
              {detailType === "arrived" && "到店记录"}
              {detailType === "activity" && "参与活动"}
              {detailType === "payment" && "消费记录"}
            </span>
          </div>
          {detailLoading ? (
            <div className="px-4 py-8 text-center text-[#8f959e] text-[12px]">加载中...</div>
          ) : detailRecords.length === 0 ? (
            <div className="px-4 py-8 text-center text-[#8f959e] text-[12px]">暂无数据</div>
          ) : (
            <div>
              {(detailType === "invited" || detailType === "arrived") && (
                <>
                  <div className="flex items-center px-4 py-1.5 text-[11px] text-[#8f959e] border-b border-[#f0f0f0]">
                    <span className="w-28 shrink-0">日期</span>
                    <span className="w-20 shrink-0">邀约人</span>
                    <span className="flex-1 min-w-0">需求</span>
                  </div>
                  {detailRecords.map((r, i) => (
                    <div key={i} className="flex items-center px-4 py-2 hover:bg-[#f7f8fa] text-[12px] text-[#4e535a]">
                      <span className="w-28 shrink-0">
                        {String(r.date)}{detailType === "invited" && !r.arrived ? <span className="text-[#b0b5bd]">（未到店）</span> : ""}
                      </span>
                      <span className="w-20 shrink-0 text-[#8f959e]">{String(r.referrer)}</span>
                      <span className="flex-1 min-w-0 truncate">{String(r.needs)}</span>
                    </div>
                  ))}
                </>
              )}
              {detailType === "activity" && (
                <>
                  <div className="flex items-center px-4 py-1.5 text-[11px] text-[#8f959e] border-b border-[#f0f0f0]">
                    <span className="w-24 shrink-0">日期</span>
                    <span className="w-20 shrink-0">类型</span>
                    <span className="flex-1 min-w-0">活动名称</span>
                    <span className="w-16 shrink-0">老师</span>
                    <span className="w-16 shrink-0">身份</span>
                  </div>
                  {detailRecords.map((r, i) => (
                    <div key={i} className="flex items-center px-4 py-2 hover:bg-[#f7f8fa] text-[12px] text-[#4e535a]">
                      <span className="w-24 shrink-0">{String(r.date)}</span>
                      <span className="w-20 shrink-0 text-[#8f959e]">{String(r.type)}</span>
                      <span className="flex-1 min-w-0 truncate">{String(r.name)}</span>
                      <span className="w-16 shrink-0">{String(r.teacher)}</span>
                      <span className="w-16 shrink-0">{String(r.role)}</span>
                    </div>
                  ))}
                </>
              )}
              {detailType === "payment" && (
                <>
                  <div className="flex items-center px-4 py-1.5 text-[11px] text-[#8f959e] border-b border-[#f0f0f0]">
                    <span className="w-24 shrink-0">项目</span>
                    <span className="w-16 shrink-0 text-right">金额</span>
                    <span className="w-12 shrink-0 text-right">次数</span>
                    <span className="w-20 shrink-0">成交日期</span>
                    <span className="w-20 shrink-0">生效日期</span>
                    <span className="w-20 shrink-0">结束日期</span>
                    <span className="w-16 shrink-0">成交人</span>
                  </div>
                  {detailRecords.map((r, i) => (
                    <div key={i} className="flex items-center px-4 py-2 hover:bg-[#f7f8fa] text-[12px] text-[#4e535a]">
                      <span className="w-24 shrink-0 truncate">{String(r.project)}</span>
                      <span className="w-16 shrink-0 text-right">¥{Number(r.amount).toLocaleString()}</span>
                      <span className="w-12 shrink-0 text-right">{String(r.times)}</span>
                      <span className="w-20 shrink-0">{String(r.deal_date)}</span>
                      <span className="w-20 shrink-0">{String(r.effective_date)}</span>
                      <span className="w-20 shrink-0">{String(r.expiry_date)}</span>
                      <span className="w-16 shrink-0 text-[#8f959e]">{String(r.salesperson)}</span>
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
