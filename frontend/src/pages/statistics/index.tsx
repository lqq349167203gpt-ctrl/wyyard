import { useState, useEffect, useCallback, useMemo } from "react"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts"
import { statisticsApi, type StatisticsData, type StatisticsDetail } from "@/lib/api"

const COLORS = {
  invited: "#3370ff",
  arrived: "#34c724",
  converted: "#ff7d00",
}

const LABELS: Record<string, string> = {
  invited: "邀约到访",
  arrived: "实际到访",
  converted: "成交人数",
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
  const [data, setData] = useState<StatisticsData[]>([])
  const [details, setDetails] = useState<{ invited: StatisticsDetail[]; arrived: StatisticsDetail[]; converted: StatisticsDetail[] }>({ invited: [], arrived: [], converted: [] })
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<"invited" | "arrived" | "converted">("invited")

  // 时间维度：year 或 month
  const [timeView, setTimeView] = useState<"year" | "month">("month")
  // 时间单位：day、week、month
  const [granularity, setGranularity] = useState<"day" | "week" | "month">("day")
  // 数据展现形式：value（实际数值）或 growth（增长情况）
  const [displayMode, setDisplayMode] = useState<"value" | "growth">("value")

  // 当前选择的时间范围
  const now = new Date()
  const [startYear, setStartYear] = useState(now.getFullYear())
  const [startMonth, setStartMonth] = useState(now.getMonth() + 1)
  const [endYear, setEndYear] = useState(now.getFullYear())
  const [endMonth, setEndMonth] = useState(now.getMonth() + 1)

  // 计算日期范围
  const dateRange = useMemo(() => {
    const from = `${startYear}-${String(startMonth).padStart(2, "0")}-01`
    const to = `${endYear}-${String(endMonth).padStart(2, "0")}-${String(getDaysInMonth(endYear, endMonth)).padStart(2, "0")}`
    return { from, to }
  }, [startYear, startMonth, endYear, endMonth])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      // 按周时请求按天粒度，前端再聚合
      const requestGranularity = granularity === "week" ? "day" : granularity
      const [overviewRes, detailsRes] = await Promise.all([
        statisticsApi.overview({
          date_from: dateRange.from,
          date_to: dateRange.to,
          granularity: requestGranularity,
        }),
        statisticsApi.details({
          date_from: dateRange.from,
          date_to: dateRange.to,
        }),
      ])
      setData(overviewRes.data)
      setDetails(detailsRes)
    } catch {
      setData([])
      setDetails({ invited: [], arrived: [], converted: [] })
    } finally {
      setLoading(false)
    }
  }, [dateRange, granularity])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // 按周聚合数据
  const rawChartData = useMemo(() => {
    if (granularity === "month") {
      // 按月：显示月份
      return data.map((item) => ({
        ...item,
        label: `${parseInt(item.date.split("-")[1])}月`,
      }))
    }

    if (granularity === "day") {
      // 按天：显示日期，只显示双数日期
      return data.map((item) => {
        const day = parseInt(item.date.split("-")[2])
        return {
          ...item,
          label: day % 2 === 0 ? `${item.date.split("-")[1]}/${item.date.split("-")[2]}` : "",
        }
      })
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
        }),
        { date: week.label, invited: 0, arrived: 0, converted: 0 }
      )
      return { ...aggregated, label: week.label }
    })
  }, [data, granularity, startYear, startMonth, endYear, endMonth])

  // 根据 displayMode 处理数据
  const chartData = useMemo(() => {
    if (displayMode === "value") {
      return rawChartData
    }

    // 增长情况：计算与前一个数据点的差值
    return rawChartData.map((item, index) => {
      if (index === 0) {
        return { ...item, invited: 0, arrived: 0, converted: 0 }
      }
      const prev = rawChartData[index - 1]
      return {
        ...item,
        invited: item.invited - prev.invited,
        arrived: item.arrived - prev.arrived,
        converted: item.converted - prev.converted,
      }
    })
  }, [rawChartData, displayMode])

  const totals = data.reduce(
    (acc, item) => ({
      invited: acc.invited + item.invited,
      arrived: acc.arrived + item.arrived,
      converted: acc.converted + item.converted,
    }),
    { invited: 0, arrived: 0, converted: 0 }
  )

  // 生成年份选项（近5年）
  const yearOptions = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i)

  // 计算Y轴刻度
  const yTicks = useMemo(() => {
    const maxVal = Math.max(...chartData.map(d => Math.max(d.invited, d.arrived, d.converted)), 0)
    const step = Math.ceil(maxVal / 4 / 5) * 5 || 5
    const ticks = []
    for (let i = 0; i <= Math.ceil(maxVal / step) * step + step; i += step) {
      ticks.push(i)
    }
    return ticks
  }, [chartData])

  return (
    <div className="min-h-full bg-white p-6">
      <div className="p-5">
        <h1 className="text-[16px] font-medium text-[#1f2329] mb-4">数据统计</h1>

        {/* 筛选栏 */}
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          {/* 统计范围 */}
          <span className="text-[12px] text-[#8f959e]">统计范围</span>
          <div className="flex items-center border border-[#e8eaed] rounded overflow-hidden">
            <button
              onClick={() => {
                setTimeView("month")
                setGranularity("day")
                setStartYear(now.getFullYear())
                setStartMonth(now.getMonth() + 1)
                setEndYear(now.getFullYear())
                setEndMonth(now.getMonth() + 1)
              }}
              className={`px-3 h-7 text-[12px] transition-colors ${timeView === "month" ? "bg-[#3370ff] text-white" : "bg-white text-[#4e535a] hover:bg-[#f7f8fa]"}`}
            >
              按月
            </button>
            <button
              onClick={() => {
                setTimeView("year")
                setGranularity("month")
                setStartYear(now.getFullYear())
                setStartMonth(1)
                setEndYear(now.getFullYear())
                setEndMonth(12)
              }}
              className={`px-3 h-7 text-[12px] transition-colors ${timeView === "year" ? "bg-[#3370ff] text-white" : "bg-white text-[#4e535a] hover:bg-[#f7f8fa]"}`}
            >
              按年
            </button>
          </div>

          {/* 时间范围选择 */}
          <div className="flex items-center border border-[#e8eaed] rounded overflow-hidden">
            <input
              type="month"
              value={`${startYear}-${String(startMonth).padStart(2, "0")}`}
              onChange={(e) => {
                const [y, m] = e.target.value.split("-")
                setStartYear(Number(y))
                setStartMonth(Number(m))
              }}
              className="h-7 px-2 text-[12px] bg-white border-none outline-none"
            />
            <span className="text-[12px] text-[#8f959e] px-1 bg-[#f7f8fa]">至</span>
            <input
              type="month"
              value={`${endYear}-${String(endMonth).padStart(2, "0")}`}
              onChange={(e) => {
                const [y, m] = e.target.value.split("-")
                setEndYear(Number(y))
                setEndMonth(Number(m))
              }}
              className="h-7 px-2 text-[12px] bg-white border-none outline-none"
            />
          </div>

          {/* 时间单位 */}
          <span className="text-[12px] text-[#8f959e]">时间单位</span>
          <div className="flex items-center border border-[#e8eaed] rounded overflow-hidden">
            {timeView === "month" && (
              <>
                <button
                  onClick={() => setGranularity("day")}
                  className={`px-3 h-7 text-[12px] transition-colors ${granularity === "day" ? "bg-[#3370ff] text-white" : "bg-white text-[#4e535a] hover:bg-[#f7f8fa]"}`}
                >
                  按天
                </button>
                <button
                  onClick={() => setGranularity("week")}
                  className={`px-3 h-7 text-[12px] transition-colors ${granularity === "week" ? "bg-[#3370ff] text-white" : "bg-white text-[#4e535a] hover:bg-[#f7f8fa]"}`}
                >
                  按周
                </button>
              </>
            )}
            <button
              onClick={() => setGranularity("month")}
              className={`px-3 h-7 text-[12px] transition-colors ${granularity === "month" ? "bg-[#3370ff] text-white" : "bg-white text-[#4e535a] hover:bg-[#f7f8fa]"}`}
            >
              按月
            </button>
          </div>

          {/* 数据展现形式 */}
          <div className="flex items-center border border-[#e8eaed] rounded overflow-hidden">
            <button
              onClick={() => setDisplayMode("value")}
              className={`px-3 h-7 text-[12px] transition-colors ${displayMode === "value" ? "bg-[#3370ff] text-white" : "bg-white text-[#4e535a] hover:bg-[#f7f8fa]"}`}
            >
              实际数值
            </button>
            <button
              onClick={() => setDisplayMode("growth")}
              className={`px-3 h-7 text-[12px] transition-colors ${displayMode === "growth" ? "bg-[#3370ff] text-white" : "bg-white text-[#4e535a] hover:bg-[#f7f8fa]"}`}
            >
              增长情况
            </button>
          </div>
        </div>

        {/* 汇总卡片 */}
        <div className="flex gap-3 mb-5">
          <div className="w-[140px] bg-[#f7f8fa] rounded-lg p-3">
            <div className="text-[11px] text-[#8f959e] mb-0.5">邀约到访</div>
            <div className="text-[20px] font-medium text-[#1f2329]">{totals.invited}</div>
          </div>
          <div className="w-[180px] bg-[#f7f8fa] rounded-lg p-3">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[11px] text-[#8f959e]">实际到访</span>
              <span className="text-[10px] text-[#8f959e]">到访比例 {totals.invited > 0 ? `${Math.round((totals.arrived / totals.invited) * 100)}%` : "-"}</span>
            </div>
            <div className="text-[20px] font-medium text-[#1f2329]">{totals.arrived}</div>
          </div>
          <div className="w-[180px] bg-[#f7f8fa] rounded-lg p-3">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[11px] text-[#8f959e]">成交人数</span>
              <span className="text-[10px] text-[#8f959e]">成交比例 {totals.arrived > 0 ? `${Math.round((totals.converted / totals.arrived) * 100)}%` : "-"}</span>
            </div>
            <div className="text-[20px] font-medium text-[#1f2329]">{totals.converted}</div>
          </div>
        </div>

        {/* 折线图 */}
        <div className="border border-[#e8eaed] rounded-lg p-4 bg-white">
          {loading ? (
            <div className="flex items-center justify-center h-[400px] text-[#8f959e]">加载中...</div>
          ) : chartData.length === 0 ? (
            <div className="flex items-center justify-center h-[400px] text-[#8f959e]">暂无数据</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="0" stroke="transparent" />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#8f959e" }} tickLine={false} axisLine={{ stroke: "#d0d3d6" }} />
                <YAxis tick={{ fontSize: 12, fill: "#8f959e" }} allowDecimals={false} ticks={yTicks} domain={[0, yTicks[yTicks.length - 1]]} tickLine={false} axisLine={{ stroke: "#d0d3d6" }} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 4 }}
                  formatter={(value, name) => [value, LABELS[name as string] || name]}
                />
                <Legend formatter={(value) => LABELS[value] || value} verticalAlign="top" align="right" />
                <Line type="monotone" dataKey="invited" stroke={COLORS.invited} strokeWidth={1} dot={false} activeDot={{ r: 4 }} />
                <Line type="monotone" dataKey="arrived" stroke={COLORS.arrived} strokeWidth={1} dot={false} activeDot={{ r: 4 }} />
                <Line type="monotone" dataKey="converted" stroke={COLORS.converted} strokeWidth={1} dot={false} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* 人员列表 */}
        <div className="mt-5">
          <div className="flex items-center gap-0 border-b border-[#f0f0f0] mb-4">
            {(["invited", "arrived", "converted"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-[13px] transition-colors border-b-2 ${
                  activeTab === tab
                    ? "border-[#3370ff] text-[#3370ff] font-medium"
                    : "border-transparent text-[#4e535a] hover:text-[#1f2329]"
                }`}
              >
                {LABELS[tab]}（{details[tab].length}）
              </button>
            ))}
          </div>

          {details[activeTab].length === 0 ? (
            <div className="text-center text-[#8f959e] py-8">暂无数据</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-[#f0f0f0]">
                    <th className="text-left py-2 px-3 text-[#8f959e] font-normal">序号</th>
                    <th className="text-left py-2 px-3 text-[#8f959e] font-normal">昵称</th>
                    <th className="text-left py-2 px-3 text-[#8f959e] font-normal">日期</th>
                    {activeTab === "invited" && (
                      <th className="text-left py-2 px-3 text-[#8f959e] font-normal">是否到店</th>
                    )}
                    {activeTab === "converted" && (
                      <th className="text-left py-2 px-3 text-[#8f959e] font-normal">类型</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {details[activeTab].map((item, index) => (
                    <tr key={index} className="border-b border-[#f0f0f0] hover:bg-[#f7f8fa]">
                      <td className="py-2 px-3 text-[#4e535a]">{index + 1}</td>
                      <td className="py-2 px-3 text-[#4e535a]">{item.nickname || item.customer_id || "-"}</td>
                      <td className="py-2 px-3 text-[#4e535a]">{item.date}</td>
                      {activeTab === "invited" && (
                        <td className="py-2 px-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] ${
                            item.arrived
                              ? "bg-[#e8f5e9] text-[#2e7d32]"
                              : "bg-[#fff3e0] text-[#e65100]"
                          }`}>
                            {item.arrived ? "已到店" : "未到店"}
                          </span>
                        </td>
                      )}
                      {activeTab === "converted" && (
                        <td className="py-2 px-3 text-[#4e535a]">{item.type || "-"}</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
