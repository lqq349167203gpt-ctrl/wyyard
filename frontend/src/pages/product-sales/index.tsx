import { useState, useEffect, useCallback, useMemo } from "react"
import { ComposedChart, Line, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer, ReferenceLine } from "recharts"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { statisticsApi, type StatisticsProducts } from "@/lib/api"
import { usePagination } from "@/hooks/use-pagination"
import { PaginationBar } from "@/components/pagination-bar"
import { EmptyValue } from "@/components/empty-value"
import { calcYAxisWidth } from "@/lib/utils"
import { formatPeriodLabel, getDatePeriodKey } from "@/lib/chart-period"

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate()
}

const PRODUCT_TYPES = ["全部", "会员卡", "觉醒游戏", "情绪释放", "OH卡诊断", "能量结", "内部课程", "其他项目"]

const TYPE_KEYS = [
  { label: "总金额", key: "total" },
  { label: "会员卡", key: "会员卡" },
  { label: "觉醒游戏", key: "觉醒游戏" },
  { label: "情绪释放", key: "情绪释放" },
  { label: "OH卡诊断", key: "OH卡诊断" },
  { label: "能量结", key: "能量结" },
  { label: "内部课程", key: "内部课程" },
  { label: "其他项目", key: "其他项目" },
]

// HSL 渐变色，与销售数据会员身份柱状图风格一致，色相偏移避免撞色
function generateColors(n: number, hueStart = 0): string[] {
  if (n === 0) return []
  return Array.from({ length: n }, (_, i) => {
    const hue = hueStart + i * (215 / Math.max(n - 1, 1))
    const lightness = 76 - (i * 20 / Math.max(n - 1, 1))
    return `hsl(${hue}, 58%, ${lightness}%)`
  })
}

export default function ProductSalesPage() {
  const [productData, setProductData] = useState<StatisticsProducts | null>(null)
  const [loading, setLoading] = useState(false)
  const [productType, setProductType] = useState<string>("全部")
  const [nameFilter, setNameFilter] = useState<string>("")
  const [dataType, setDataType] = useState<"amount" | "count" | "persons">("amount")
  const [selectedReferrer, setSelectedReferrer] = useState("")
  const [selectedTeacherId, setSelectedTeacherId] = useState("")
  const [selectedTrendPeriod, setSelectedTrendPeriod] = useState("")
  const [timeView, setTimeView] = useState<"year" | "month">("month")
  const [granularity, setGranularity] = useState<"day" | "week" | "month">("day")

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

  const lineTypes = useMemo(() => {
    if (productType === "会员卡" && productData?.card_type_names?.length) {
      return productData.card_type_names.map((name) => ({ label: name, key: name }))
    }
    if (productType === "内部课程" && productData?.course_type_names?.length) {
      return productData.course_type_names.map((name) => ({ label: name, key: name }))
    }
    if (productType === "其他项目" && productData?.other_project_names?.length) {
      return productData.other_project_names.map((name) => ({ label: name, key: name }))
    }
    if (productType !== "全部") {
      const match = TYPE_KEYS.find((c) => c.label === productType)
      if (match) return [match]
    }
    return TYPE_KEYS.filter((c) => c.key !== "total")
  }, [productType, productData?.card_type_names, productData?.course_type_names, productData?.other_project_names])
  const lineColors = useMemo(() => generateColors(lineTypes.length, 0), [lineTypes.length])

  const [visibleLines, setVisibleLines] = useState<Record<string, boolean>>({})
  useEffect(() => {
    setVisibleLines(Object.fromEntries(lineTypes.map(t => [t.key, true])))
  }, [lineTypes])

  const chartData = useMemo(() => {
    if (!productData) return []
    let src: Record<string, number>
    if (productType === "会员卡") {
      src = dataType === "amount" ? productData.card_type_amounts : dataType === "count" ? productData.card_type_counts : productData.card_type_persons
    } else if (productType === "内部课程") {
      src = dataType === "amount" ? productData.course_type_amounts : dataType === "count" ? productData.course_type_counts : productData.course_type_persons
    } else if (productType === "其他项目") {
      src = dataType === "amount" ? productData.other_project_amounts : dataType === "count" ? productData.other_project_counts : productData.other_project_persons
    } else {
      src = dataType === "amount" ? productData.type_amounts : dataType === "count" ? productData.type_counts : productData.type_persons
    }
    return lineTypes.map((c, i) => ({
      name: c.label,
      value: dataType === "amount" ? Math.round(src[c.key] ?? 0) : (src[c.key] ?? 0),
      color: lineColors[i],
    }))
  }, [productData, dataType, lineTypes, lineColors, productType])

  const lineChartData = useMemo(() => {
    let src: Record<string, string | number>[] | undefined
    if (productType === "会员卡") {
      src = dataType === "amount" ? productData?.card_type_chart_amount : dataType === "count" ? productData?.card_type_chart_count : productData?.card_type_chart_persons
    } else if (productType === "内部课程") {
      src = dataType === "amount" ? productData?.course_type_chart_amount : dataType === "count" ? productData?.course_type_chart_count : productData?.course_type_chart_persons
    } else if (productType === "其他项目") {
      src = dataType === "amount" ? productData?.other_project_chart_amount : dataType === "count" ? productData?.other_project_chart_count : productData?.other_project_chart_persons
    } else {
      src = dataType === "amount" ? productData?.chart_amount : dataType === "count" ? productData?.chart_count : productData?.chart_persons
    }
    if (!src) return []
    return src.map((item) => {
      const row: Record<string, string | number> = { date: item.date as string }
      for (const t of lineTypes) {
        row[t.key] = Number(item[t.key]) || 0
      }
      const dateStr = item.date as string
      if (granularity === "day") {
        const parts = dateStr.split("-")
        row.label = `${parts[1]}/${parts[2]}`
      } else if (granularity === "week") {
        row.label = dateStr
      } else {
        row.label = `${parseInt(dateStr.split("-")[1])}月`
      }
      return row
    })
  }, [productData, dataType, granularity, lineTypes, productType])

  const lineYAxisWidth = useMemo(() => calcYAxisWidth(lineChartData, lineTypes.map(t => t.key)), [lineChartData, lineTypes])
  const barYAxisWidth = useMemo(() => calcYAxisWidth(chartData, ["value"]), [chartData])

  const dailyTable = useMemo(() => (productData?.daily_table ?? []).filter((row: any) => row.converted_persons > 0 || row.converted_count > 0 || row.converted_amount > 0 || row.purchase_count > 0), [productData])
  const periodDailyTable = useMemo(
    () => selectedTrendPeriod
      ? dailyTable.filter(row => getDatePeriodKey(row.date, granularity) === selectedTrendPeriod)
      : dailyTable,
    [dailyTable, granularity, selectedTrendPeriod],
  )

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

  const sortedDailyTable = useMemo(() => {
    if (!sortField) return periodDailyTable
    return [...periodDailyTable].sort((a, b) => {
      const va = (a as any)[sortField] ?? 0
      const vb = (b as any)[sortField] ?? 0
      if (va < vb) return sortOrder === "asc" ? -1 : 1
      if (va > vb) return sortOrder === "asc" ? 1 : -1
      return 0
    })
  }, [periodDailyTable, sortField, sortOrder])

  const { paginatedItems: paginatedDaily, currentPage, totalPages, totalItems, goToPage, startIndex, endIndex } = usePagination(sortedDailyTable, { pageSize: 10 })

  // 弹窗
  const [popupType, setPopupType] = useState<"invited" | "cancelled" | "arrived" | "persons" | "amount" | "count" | "purchase" | null>(null)
  const [popupDate, setPopupDate] = useState<string | null>(null)
  const [popupData, setPopupData] = useState<Record<string, unknown>[]>([])
  const [popupLoading, setPopupLoading] = useState(false)

  const handleCellClick = async (type: "invited" | "cancelled" | "arrived" | "persons" | "amount" | "count" | "purchase", date: string) => {
    setPopupType(type)
    setPopupDate(date)
    setPopupLoading(true)
    try {
      const res = await statisticsApi.productDetails({
        date,
        type,
        product_type: productType,
        referrer: selectedReferrer || undefined,
        teacher_id: selectedTeacherId || undefined,
      })
      setPopupData(res.data)
    } catch {
      setPopupData([])
    } finally {
      setPopupLoading(false)
    }
  }

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await statisticsApi.products({
        date_from: dateRange.from,
        date_to: dateRange.to,
        product_type: productType,
        name_filter: nameFilter || undefined,
        granularity,
        referrer: selectedReferrer || undefined,
        teacher_id: selectedTeacherId || undefined,
      })
      setProductData(res)
    } catch {
      setProductData(null)
    } finally {
      setLoading(false)
    }
  }, [dateRange, productType, nameFilter, granularity, selectedReferrer, selectedTeacherId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    setSelectedTrendPeriod("")
    goToPage(1)
  }, [dateRange, productType, nameFilter, granularity, selectedReferrer, selectedTeacherId])

  return (
    <div className="min-h-full space-y-3 bg-[#f4f5f6] p-4">
      <div className="bg-white rounded-xl px-[22px] py-4">
          <h1 className="text-[16px] font-medium text-[#1f2329] mb-4">产品销售</h1>

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

            {/* 第三行：产品类型 */}
            <div className="flex items-center gap-3 flex-wrap">
              <span className="inline-flex items-center gap-[10px] text-[12px] text-[#8f959e] w-[62px] shrink-0"><span className="w-[2.5px] h-3 bg-[#d0d3d6] rounded-[1px]"></span>产品类型</span>
              <div className="flex items-center bg-[#f0f1f3] rounded-[4px] p-[2px]">
                {PRODUCT_TYPES.map((t) => (
                  <button
                    key={t}
                    onClick={() => { setProductType(t); setNameFilter("") }}
                    className={`px-3 h-[26px] text-[11px] rounded-[2px] transition-all ${productType === t ? "bg-white text-[#1f2329]" : "text-[#646a73] hover:text-[#4e535a]"}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* 第四行：数据类型 */}
            <div className="flex items-center gap-3 flex-wrap">
              <span className="inline-flex items-center gap-[10px] text-[12px] text-[#8f959e] w-[62px] shrink-0"><span className="w-[2.5px] h-3 bg-[#d0d3d6] rounded-[1px]"></span>数据类型</span>
              <div className="flex items-center bg-[#f0f1f3] rounded-[4px] p-[2px]">
                <button
                  onClick={() => setDataType("amount")}
                  className={`px-3 h-[26px] text-[11px] rounded-[2px] transition-all ${dataType === "amount" ? "bg-white text-[#1f2329]" : "text-[#646a73] hover:text-[#4e535a]"}`}
                >
                  金额
                </button>
                <button
                  onClick={() => setDataType("count")}
                  className={`px-3 h-[26px] text-[11px] rounded-[2px] transition-all ${dataType === "count" ? "bg-white text-[#1f2329]" : "text-[#646a73] hover:text-[#4e535a]"}`}
                >
                  成交单数
                </button>
                <button
                  onClick={() => setDataType("persons")}
                  className={`px-3 h-[26px] text-[11px] rounded-[2px] transition-all ${dataType === "persons" ? "bg-white text-[#1f2329]" : "text-[#646a73] hover:text-[#4e535a]"}`}
                >
                  成交人数
                </button>
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
                {productData?.referrer_names?.map((name) => (
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

            {/* 第六行：老师（按成交人筛选） */}
            <div className="flex items-start gap-3">
              <span className="inline-flex items-center gap-[10px] text-[12px] text-[#8f959e] w-[62px] shrink-0 mt-1"><span className="w-[2.5px] h-3 bg-[#d0d3d6] rounded-[1px]"></span>老师</span>
              <div className="flex items-center flex-wrap gap-2">
                <button
                  onClick={() => setSelectedTeacherId("")}
                  className={`inline-flex items-center px-3 h-[26px] text-[11px] rounded-[2px] transition-all ${selectedTeacherId === "" ? "bg-[#fafcff] border border-[#b3d4ff] text-[#3370ff]" : "bg-white border border-[#e8eaed] text-[#646a73] hover:border-[#c0c4cc]"}`}
                >
                  全部
                </button>
                {productData?.teachers?.map((teacher) => (
                  <button
                    key={teacher.id}
                    onClick={() => setSelectedTeacherId(teacher.id)}
                    className={`inline-flex items-center px-3 h-[26px] text-[11px] rounded-[2px] transition-all ${selectedTeacherId === teacher.id ? "bg-[#fafcff] border border-[#b3d4ff] text-[#3370ff]" : "bg-white border border-[#e8eaed] text-[#646a73] hover:border-[#c0c4cc]"}`}
                  >
                    {teacher.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 汇总卡片 */}
        <div className="bg-white rounded-xl px-[22px] py-4">
          <div className="flex gap-3">
            <div className="w-[230px] bg-[#f7f8fa] rounded-lg py-[15px] px-3 pl-[24px]">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="w-[6px] h-[6px] rounded-full" style={{ backgroundColor: "#f5222d" }}></span>
                <span className="text-[12px] text-[#4e535a]">总金额</span>
              </div>
              <div className="flex items-baseline gap-1">
                {loading ? (
                  <span className="text-[14px] text-[#b0b5bd]">...</span>
                ) : (
                  <span className="text-[20px] font-medium text-[#1f2329]">¥{Math.round(productData?.total_amount ?? 0)}</span>
                )}
              </div>
            </div>
            <div className="w-[230px] bg-[#f7f8fa] rounded-lg py-[15px] px-3 pl-[24px]">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="w-[6px] h-[6px] rounded-full" style={{ backgroundColor: "#5b8ff9" }}></span>
                <span className="text-[12px] text-[#4e535a]">总成交单数</span>
              </div>
              <div className="flex items-baseline gap-1">
                {loading ? (
                  <span className="text-[14px] text-[#b0b5bd]">...</span>
                ) : (
                  <span className="text-[20px] font-medium text-[#1f2329]">{productData?.total_count ?? 0}<span className="text-[10px] text-[#8f959e] ml-1">单</span></span>
                )}
              </div>
            </div>
            {["觉醒游戏", "情绪释放", "OH卡诊断", "能量结", "其他项目"].includes(productType) && (
              <div className="w-[230px] bg-[#f7f8fa] rounded-lg py-[15px] px-3 pl-[24px]">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="w-[6px] h-[6px] rounded-full" style={{ backgroundColor: "#9254de" }}></span>
                  <span className="text-[12px] text-[#4e535a]">{productType === "OH卡诊断" ? "总时长" : productType === "能量结" ? "总部位数" : productType === "觉醒游戏" || productType === "情绪释放" ? "总场次数" : "售出产品数"}</span>
                </div>
                <div className="flex items-baseline gap-1">
                  {loading ? (
                    <span className="text-[14px] text-[#b0b5bd]">...</span>
                  ) : (
                    <span className="text-[20px] font-medium text-[#1f2329]">{productData?.total_purchase_count ?? 0}<span className="text-[10px] text-[#8f959e] ml-1">{productType === "能量结" ? "个" : productType === "觉醒游戏" || productType === "情绪释放" ? "场" : "次"}</span></span>
                  )}
                </div>
              </div>
            )}
            <div className="w-[230px] bg-[#f7f8fa] rounded-lg py-[15px] px-3 pl-[24px]">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="w-[6px] h-[6px] rounded-full" style={{ backgroundColor: "#36cfc9" }}></span>
                <span className="text-[12px] text-[#4e535a]">总成交人数</span>
              </div>
              <div className="flex items-baseline gap-1">
                {loading ? (
                  <span className="text-[14px] text-[#b0b5bd]">...</span>
                ) : (
                  <span className="text-[20px] font-medium text-[#1f2329]">{productData?.total_persons ?? 0}<span className="text-[10px] text-[#8f959e] ml-1">人</span></span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 折线图 + 柱状图 */}
        {true && (
          <div className="flex gap-1.5">
            {/* 折线图 */}
            <div className={`min-w-0 bg-white rounded-xl px-[22px] py-4 select-none *:outline-none *:focus:outline-none ${productType === "全部" || productType === "会员卡" ? "flex-1" : "flex-1"}`} onMouseDown={(e) => e.preventDefault()}>
              <div className="mb-[18px]">
                <div className="text-[12px] text-[#4e535a] mb-2"><span className="font-medium">每{granularity === "day" ? "日" : granularity === "week" ? "周" : "月"}{dataType === "amount" ? "金额" : dataType === "count" ? "成交单数" : "成交人数"}变化</span><span className="text-[#8f959e]">（{dateRange.from.replace(/(\d+)-(\d+)-(\d+)/, "$1年$2月$3日")}~{dateRange.to.replace(/(\d+)-(\d+)-(\d+)/, "$1年$2月$3日")}）</span></div>
                <div className="flex items-center gap-4 flex-wrap">
                  {lineTypes.map((t, i) => (
                    <label key={t.key} className="flex items-center gap-1 cursor-pointer select-none" onClick={() => setVisibleLines((prev) => ({ ...prev, [t.key]: !prev[t.key] }))}>
                      <span
                        className="w-3.5 h-3.5 rounded border flex items-center justify-center text-[9px] leading-none"
                        style={{
                          borderColor: visibleLines[t.key] ? lineColors[i] : "#c8ccd0",
                          backgroundColor: visibleLines[t.key] ? lineColors[i] : "transparent",
                          color: "#fff",
                        }}
                      >
                        {visibleLines[t.key] && "✓"}
                      </span>
                      <span className="text-[11px]" style={{ color: visibleLines[t.key] ? lineColors[i] : "#c8ccd0" }}>{t.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              {loading ? (
                <div className="flex items-center justify-center h-[160px] text-[#8f959e] text-[12px]">加载中...</div>
              ) : lineChartData.length === 0 ? (
                <div className="flex items-center justify-center h-[160px] text-[#8f959e] text-[12px]">暂无数据</div>
              ) : (
                <ResponsiveContainer width="100%" height={160} tabIndex={-1}>
                  <ComposedChart
                    data={lineChartData}
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
                      {lineTypes.map((t, i) => (
                        <linearGradient key={`grad-${t.key}`} id={`grad-${t.key}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={lineColors[i]} stopOpacity={0.4} />
                          <stop offset="100%" stopColor={lineColors[i]} stopOpacity={0.02} />
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
                      interval={granularity === "month" ? 0 : Math.max(0, Math.floor(lineChartData.length / 8))}
                      tickFormatter={(value) => String(lineChartData.find(row => row.date === value)?.label || value)}
                    />
                    {selectedTrendPeriod && <ReferenceLine x={selectedTrendPeriod} stroke="#3370ff" strokeDasharray="3 3" />}
                    <YAxis
                      tick={{ fontSize: 11, fill: "#b0b5bd", fontWeight: "normal" }}
                      allowDecimals={false}
                      tickLine={false}
                      axisLine={false}
                      width={lineYAxisWidth}
                      tickFormatter={(v) => Number(v) >= 10000 ? `${(Number(v) / 10000).toFixed(0)}万` : String(v)}
                    />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null
                        const seen = new Set<string>()
                        return (
                          <div style={{ fontSize: 12, background: "#fff", border: "1px solid #e8eaed", borderRadius: 4, padding: "6px 10px" }}>
                            <div style={{ color: "#8f959e", marginBottom: 4 }}>{label}</div>
                            {payload.map((item) => {
                              const key = String(item.dataKey)
                              if (seen.has(key)) return null
                              seen.add(key)
                              const idx = lineTypes.findIndex((x) => x.key === key)
                              const t = lineTypes[idx]
                              const color = lineColors[idx]
                              if (!t || !visibleLines[key]) return null
                              return (
                                <div key={key} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
                                  <span style={{ color }}>{t.label}</span>
                                  <span style={{ color, fontWeight: 500, marginLeft: "auto" }}>{dataType === "amount" ? `¥${Math.round(Number(item.value))}` : dataType === "count" ? `${item.value}笔` : `${item.value}人`}</span>
                                </div>
                              )
                            })}
                          </div>
                        )
                      }}
                    />
                    {lineTypes.map((t, i) => (
                      visibleLines[t.key] && <Area key={`area-${t.key}`} type="monotone" dataKey={t.key} fill={`url(#grad-${t.key})`} stroke="none" tooltipType="none" />
                    ))}
                    {lineTypes.map((t, i) => (
                      visibleLines[t.key] && <Line key={t.key} type="monotone" dataKey={t.key} stroke={lineColors[i]} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                    ))}
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* 右侧：柱状图 — 全部、会员卡、内部课程、其他项目时显示 */}
            {(productType === "全部" || productType === "会员卡" || productType === "内部课程" || productType === "其他项目") && (
              <div className="flex-1 min-w-0 bg-white rounded-xl px-[22px] py-4 select-none *:outline-none *:focus:outline-none" onMouseDown={(e) => e.preventDefault()}>
                <div className="mb-[18px]">
                  <div className="text-[12px] text-[#4e535a] mb-2"><span className="font-medium">产品类型{dataType === "amount" ? "金额" : dataType === "count" ? "成交单数" : "成交人数"}</span><span className="text-[#8f959e]">（{dateRange.from.replace(/(\d+)-(\d+)-(\d+)/, "$1年$2月$3日")}~{dateRange.to.replace(/(\d+)-(\d+)-(\d+)/, "$1年$2月$3日")}）</span></div>
                </div>
                {loading ? (
                  <div className="flex items-center justify-center h-[160px] text-[#8f959e] text-[12px]">加载中...</div>
                ) : chartData.length === 0 || chartData.every((d) => d.value === 0) ? (
                  <div className="flex items-center justify-center h-[160px] text-[#8f959e] text-[12px]">暂无数据</div>
                ) : (
                  <ResponsiveContainer width="100%" height={160} tabIndex={-1}>
                    <BarChart data={chartData} margin={{ top: 10, right: 5, left: 0, bottom: 2 }}>
                      <CartesianGrid strokeDasharray="4 4" stroke="#e8eaed" vertical={false} />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 10, fill: "#b0b5bd" }}
                        axisLine={false}
                        tickLine={false}
                        height={20}
                        tickFormatter={(v) => String(v).length > 4 ? String(v).slice(0, 4) + "..." : String(v)}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: "#b0b5bd" }}
                        axisLine={false}
                        tickLine={false}
                        width={barYAxisWidth}
                        tickFormatter={(v) => Number(v) >= 10000 ? `${(Number(v) / 10000).toFixed(0)}万` : String(v)}
                      />
                      <Tooltip
                        formatter={(value) => [dataType === "amount" ? `¥${value}` : dataType === "count" ? `${value}单` : `${value}人`, dataType === "amount" ? "金额" : dataType === "count" ? "成交单数" : "成交人数"]}
                        contentStyle={{ fontSize: 12, borderRadius: 4 }}
                        cursor={{ fill: "transparent" }}
                      />
                      <Bar dataKey="value" radius={[2, 2, 0, 0]} barSize={20} activeBar={false}>
                        {chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            )}
          </div>
        )}

        {/* 每日列表 */}
        <div className="bg-white rounded-xl px-[22px] py-4 min-h-[400px]">
          <div className="mb-3">
            <div className="flex items-center gap-2 text-[12px] font-medium text-[#4e535a]">
              <span>每日成交数据</span>
              <span className="font-normal text-[#8f959e]">（{selectedTrendPeriod ? formatPeriodLabel(selectedTrendPeriod, granularity) : `${dateRange.from.replace(/(\d+)-(\d+)-(\d+)/, "$1年$2月$3日")}~${dateRange.to.replace(/(\d+)-(\d+)-(\d+)/, "$1年$2月$3日")}`}）</span>
              {selectedTrendPeriod && <button className="font-normal text-[#3370ff] hover:text-[#245bdb]" onClick={() => { setSelectedTrendPeriod(""); goToPage(1) }}>查看全部</button>}
            </div>
            {/* 项目名称筛选（仅其他项目时显示） */}
            {productType === "其他项目" && productData?.other_project_names?.length ? (
              <div className="flex items-center gap-2 mt-2">
                <span className="text-[11px] text-[#8f959e]">项目名称</span>
                <div className="flex items-center bg-[#f0f1f3] rounded-[4px] p-[2px]">
                  <button
                    onClick={() => setNameFilter("")}
                    className={`px-2 h-[22px] text-[11px] rounded-[2px] transition-all ${nameFilter === "" ? "bg-white text-[#1f2329]" : "text-[#646a73] hover:text-[#4e535a]"}`}
                  >
                    全部
                  </button>
                  {productData.other_project_names.map((name) => (
                    <button
                      key={name}
                      onClick={() => setNameFilter(name)}
                      className={`px-2 h-[22px] text-[11px] rounded-[2px] transition-all ${nameFilter === name ? "bg-white text-[#1f2329]" : "text-[#646a73] hover:text-[#4e535a]"}`}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          {periodDailyTable.length === 0 ? (
            <div className="py-16 text-center text-[12px] text-[#8f959e]">暂无数据</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full table-fixed border-collapse text-left">
                <thead>
                  <tr className="h-9 border-b border-[#f0f0f0] bg-[#fafafa] text-[11px] font-normal text-[#8f959e]">
                    <th className="w-12 px-3 font-normal">序号</th>
                    {[
                      { key: "date", label: "日期", w: "w-28" },
                      { key: "invited", label: "邀约人数", w: "w-24" },
                      { key: "cancelled", label: "取消人数", w: "w-24" },
                      { key: "arrived", label: "实际到访", w: "w-24" },
                      { key: "converted_persons", label: "成交人数", w: "w-24" },
                      { key: "converted_count", label: "成交单数", w: "w-24" },
                      ...(["觉醒游戏", "情绪释放", "OH卡诊断", "能量结", "其他项目"].includes(productType) ? [{ key: "purchase_count", label: productType === "OH卡诊断" ? "总时长" : productType === "能量结" ? "总部位数" : productType === "觉醒游戏" || productType === "情绪释放" ? "总场次数" : "售出产品数", w: "w-24" }] : []),
                      { key: "converted_amount", label: "成交金额", w: "w-28" },
                    ].map(({ key, label, w }) => (
                      <th key={key} className={`px-3 font-normal ${w}`}>
                        <span className="inline-flex items-center gap-1 cursor-pointer select-none" onClick={() => handleSort(key)}>
                          <span>{label}</span>
                          <span className="inline-flex flex-col leading-none">
                            <span className={`text-[8px] ${sortField === key && sortOrder === "asc" ? "text-[#1f2329]" : "text-[#d0d3d6]"}`}>▲</span>
                            <span className={`text-[8px] -mt-[1px] ${sortField === key && sortOrder === "desc" ? "text-[#1f2329]" : "text-[#d0d3d6]"}`}>▼</span>
                          </span>
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginatedDaily.map((row, index) => (
                    <tr key={row.date} className="h-11 border-b border-[#f0f0f0] text-[12px] text-[#4e535a] last:border-b-0 hover:bg-[#f7f8fa]">
                      <td className="truncate px-3 tabular-nums">{startIndex + index}</td>
                      <td className="truncate px-3 tabular-nums">{row.date}</td>
                      <td className={`truncate px-3 tabular-nums ${row.invited ? "cursor-pointer hover:text-[#2e7d32]" : ""}`} onClick={() => row.invited && handleCellClick("invited", row.date)}>{row.invited || <EmptyValue />}</td>
                      <td className={`truncate px-3 tabular-nums ${row.cancelled ? "cursor-pointer hover:text-[#2e7d32]" : ""}`} onClick={() => row.cancelled && handleCellClick("cancelled", row.date)}>{row.cancelled || <EmptyValue />}</td>
                      <td className={`truncate px-3 tabular-nums ${row.arrived ? "cursor-pointer hover:text-[#2e7d32]" : ""}`} onClick={() => row.arrived && handleCellClick("arrived", row.date)}>{row.arrived || <EmptyValue />}</td>
                      <td className={`truncate px-3 tabular-nums ${row.converted_persons ? "cursor-pointer hover:text-[#2e7d32]" : ""}`} onClick={() => row.converted_persons && handleCellClick("persons", row.date)}>{row.converted_persons || <EmptyValue />}</td>
                      <td className={`truncate px-3 tabular-nums ${row.converted_count ? "cursor-pointer hover:text-[#2e7d32]" : ""}`} onClick={() => row.converted_count && handleCellClick("count", row.date)}>{row.converted_count || <EmptyValue />}</td>
                      {["觉醒游戏", "情绪释放", "OH卡诊断", "能量结", "其他项目"].includes(productType) && (
                        <td className={`truncate px-3 tabular-nums ${row.purchase_count ? "cursor-pointer hover:text-[#2e7d32]" : ""}`} onClick={() => row.purchase_count && handleCellClick("purchase", row.date)}>{productType === "OH卡诊断" ? (row.purchase_count ? `${row.purchase_count * 0.5}小时` : <EmptyValue />) : (row.purchase_count || <EmptyValue />)}</td>
                      )}
                      <td className={`truncate px-3 tabular-nums ${row.converted_amount ? "cursor-pointer hover:text-[#2e7d32]" : ""}`} onClick={() => row.converted_amount && handleCellClick("amount", row.date)}>{row.converted_amount ? `¥${row.converted_amount}` : <EmptyValue />}</td>
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
      {/* 详情弹窗 */}
      <Dialog open={popupType !== null} onOpenChange={(open) => { if (!open) { setPopupType(null); setPopupData([]); setPopupDate(null) } }}>
        <DialogContent className={`${popupType === "persons" ? "max-w-[780px]" : popupType === "amount" || popupType === "count" || popupType === "purchase" ? "max-w-[780px]" : "max-w-[580px]"} max-h-[60vh] overflow-y-auto p-0 gap-0`} initialFocus={false}>
          <div className="px-4 py-3 border-b border-[#f0f0f0]">
            <span className="text-[14px] font-medium text-[#1f2329]">
              {popupType ? { invited: "邀约到访", cancelled: "取消到访", arrived: "实际到访", persons: "成交人数", amount: "成交金额", count: "成交单数", purchase: productType === "OH卡诊断" ? "总时长" : productType === "能量结" ? "总部位数" : productType === "觉醒游戏" || productType === "情绪释放" ? "总场次数" : "售出产品数" }[popupType] : ""}
            </span>
            {popupDate && <span className="text-[12px] text-[#8f959e] ml-2">{popupDate}</span>}
          </div>
          {popupLoading ? (
            <div className="px-4 py-8 text-center text-[#8f959e] text-[12px]">加载中...</div>
          ) : popupData.length === 0 ? (
            <div className="px-4 py-8 text-center text-[#8f959e] text-[12px]">暂无数据</div>
          ) : (
            <div>
              {popupType === "invited" && (
                <>
                  <div className="flex items-center px-4 py-1.5 text-[11px] text-[#8f959e] border-b border-[#f0f0f0]">
                    <span className="w-32 shrink-0">昵称</span>
                    <span className="w-20 shrink-0">邀约人</span>
                    <span className="flex-1 min-w-0">需求</span>
                    <span className="w-16 shrink-0">参与活动</span>
                    <span className="w-16 shrink-0">状态</span>
                  </div>
                  {popupData.map((r, i) => (
                    <div key={i} className="flex items-center px-4 py-2 hover:bg-[#f7f8fa] text-[12px] text-[#4e535a]">
                      <span className="w-32 shrink-0 truncate">{r.nickname as string}</span>
                      <span className="w-20 shrink-0 text-[#8f959e]">{r.referrer_handler as string}</span>
                      <span className="flex-1 min-w-0 truncate">{r.needs as string}</span>
                      <span className="w-16 shrink-0">{(r.activity_count as number) > 0 ? `${r.activity_count}场` : "-"}</span>
                      <span className="w-16 shrink-0">
                        {r.cancelled ? <span className="text-[#c4506a]">已取消</span> : r.arrived ? <span className="text-[#2e7d32]">已到店</span> : <span className="text-[#8f959e]">未参与</span>}
                      </span>
                    </div>
                  ))}
                </>
              )}
              {popupType === "cancelled" && (
                <>
                  <div className="flex items-center px-4 py-1.5 text-[11px] text-[#8f959e] border-b border-[#f0f0f0]">
                    <span className="w-32 shrink-0">昵称</span>
                    <span className="w-20 shrink-0">邀约人</span>
                    <span className="flex-1 min-w-0">需求</span>
                    <span className="w-16 shrink-0">状态</span>
                  </div>
                  {popupData.map((r, i) => (
                    <div key={i} className="flex items-center px-4 py-2 hover:bg-[#f7f8fa] text-[12px] text-[#4e535a]">
                      <span className="w-32 shrink-0 truncate">{r.nickname as string}</span>
                      <span className="w-20 shrink-0 text-[#8f959e]">{r.referrer_handler as string}</span>
                      <span className="flex-1 min-w-0 truncate">{r.needs as string}</span>
                      <span className="w-16 shrink-0"><span className="text-[#c4506a]">已取消</span></span>
                    </div>
                  ))}
                </>
              )}
              {popupType === "arrived" && (
                <>
                  <div className="flex items-center px-4 py-1.5 text-[11px] text-[#8f959e] border-b border-[#f0f0f0]">
                    <span className="w-24 shrink-0">昵称</span>
                    <span className="w-20 shrink-0">邀约人</span>
                    <span className="flex-1 min-w-0">需求</span>
                    <span className="w-16 shrink-0">参与活动</span>
                  </div>
                  {popupData.map((r, i) => (
                    <div key={i} className="flex items-center px-4 py-2 hover:bg-[#f7f8fa] text-[12px] text-[#4e535a]">
                      <span className="w-24 shrink-0 truncate">{r.nickname as string}</span>
                      <span className="w-20 shrink-0 text-[#8f959e]">{r.referrer_handler as string}</span>
                      <span className="flex-1 min-w-0 truncate">{r.needs as string}</span>
                      <span className="w-16 shrink-0">{(r.activity_count as number) > 0 ? `${r.activity_count}场` : "-"}</span>
                    </div>
                  ))}
                </>
              )}
              {popupType === "persons" && (
                <>
                  <div className="flex items-center px-4 py-1.5 text-[11px] text-[#8f959e] border-b border-[#f0f0f0]">
                    <span className="w-24 shrink-0">昵称</span>
                    <span className="w-20 shrink-0">身份</span>
                    <span className="flex-1 min-w-0">参与活动</span>
                    <span className="w-40 shrink-0">成交产品</span>
                  </div>
                  {popupData.map((r, i) => {
                    const acts = (r.activities as string[]) || []
                    const prods = (r.products as string[]) || []
                    return (
                      <div key={i} className="flex items-start px-4 py-2 hover:bg-[#f7f8fa] text-[12px] text-[#4e535a]">
                        <span className="w-24 shrink-0 truncate">{r.nickname as string}</span>
                        <span className="w-20 shrink-0">{r.member_type as string}</span>
                        <span className="flex-1 min-w-0">
                          {acts.length > 0 ? acts.map((a, ai) => {
                            const m = a.match(/^(.+?)（(.+)）$/)
                            return <span key={ai}>{ai > 0 && "、"}{m ? <>{m[1]}<span className="text-[#b0b5bd]">（{m[2]}）</span></> : a}</span>
                          }) : "-"}
                        </span>
                        <span className="w-40 shrink-0">{prods.length > 0 ? prods.join("、") : "-"}</span>
                      </div>
                    )
                  })}
                </>
              )}
              {(popupType === "amount" || popupType === "count" || popupType === "purchase") && (() => {
                const isOHCard = productType === "OH卡诊断"
                const isEnergyKnot = productType === "能量结"
                const isSession = productType === "觉醒游戏" || productType === "情绪释放"
                const formatOHDuration = (dd: unknown) => {
                  if (dd == null) return "-"
                  const n = Number(dd)
                  if (isNaN(n)) return "-"
                  return `${n * 0.5}小时`
                }
                return (
                <>
                  <div className="flex items-center px-4 py-1.5 text-[11px] text-[#8f959e] border-b border-[#f0f0f0]">
                    <span className="w-24 shrink-0">昵称</span>
                    <span className="w-20 shrink-0">项目类型</span>
                    <span className="flex-1 min-w-0">项目名称</span>
                    <span className="w-20 shrink-0">{isOHCard ? "时长" : isEnergyKnot ? "部位数" : isSession ? "场次数" : "购买场次"}</span>
                    <span className="w-20 shrink-0">金额</span>
                    <span className="w-28 shrink-0">成交人</span>
                    <span className="w-[100px] shrink-0">备注</span>
                  </div>
                  {popupData.map((r, i) => {
                    const closers = (r.closers as { name: string; amount: number }[]) || []
                    return (
                      <div key={i} className="flex items-center px-4 py-2 hover:bg-[#f7f8fa] text-[12px] text-[#4e535a]">
                        <span className="w-24 shrink-0 truncate">{r.nickname as string}</span>
                        <span className="w-20 shrink-0 text-[#8f959e]">{r.type as string}</span>
                        <span className="flex-1 min-w-0 truncate">{r.name as string || "-"}</span>
                        <span className="w-20 shrink-0">{isOHCard ? formatOHDuration(r.diagnosis_duration) : (r.purchase_count != null ? String(r.purchase_count) : "-")}</span>
                        <span className="w-20 shrink-0">¥{r.amount as number}</span>
                        <span className="w-28 shrink-0 text-[#8f959e] truncate">{closers.length > 0 ? closers.map(cl => `${cl.name} ¥${cl.amount}`).join("、") : "-"}</span>
                        <span className="w-[100px] shrink-0 truncate">{(r.notes as string) || <span className="text-[#c9cdd4]">-</span>}</span>
                      </div>
                    )
                  })}
                </>
                )
              })()}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
