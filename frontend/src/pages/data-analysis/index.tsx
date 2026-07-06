import { useState, useEffect, useCallback, useMemo } from "react"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts"
import { statisticsApi, type AnalysisOverview, type FrequentVisitor, type ChurnedVisitor } from "@/lib/api"

const METRIC_LABELS: Record<string, string> = {
  invited: "邀约到访",
  arrived: "实际到访",
  converted: "成交人数",
}

const TREND_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  上升: { label: "↑ 上升", color: "text-[#34c724]", bg: "bg-[#e8f5e9]" },
  下降: { label: "↓ 下降", color: "text-[#ff3b30]", bg: "bg-[#ffeaea]" },
  平稳: { label: "→ 平稳", color: "text-[#8f959e]", bg: "bg-[#f7f8fa]" },
}

export default function DataAnalysisPage() {
  const now = new Date()
  const [granularity, setGranularity] = useState<"month" | "year">("month")
  const [metric, setMetric] = useState<"invited" | "arrived" | "converted">("arrived")
  const [selectedMonth, setSelectedMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`)
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())
  const [profileTab, setProfileTab] = useState<"frequent" | "churned">("frequent")

  const [analysis, setAnalysis] = useState<AnalysisOverview | null>(null)
  const [frequentVisitors, setFrequentVisitors] = useState<FrequentVisitor[]>([])
  const [churnedVisitors, setChurnedVisitors] = useState<ChurnedVisitor[]>([])
  const [loading, setLoading] = useState(false)

  const dateRange = useMemo(() => {
    if (granularity === "year") {
      return { from: `${selectedYear}-01-01`, to: `${selectedYear}-12-31` }
    }
    const [y, m] = selectedMonth.split("-").map(Number)
    const lastDay = new Date(y, m, 0).getDate()
    return { from: `${y}-${String(m).padStart(2, "0")}-01`, to: `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}` }
  }, [granularity, selectedYear, selectedMonth])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [analysisRes, frequentRes, churnedRes] = await Promise.all([
        statisticsApi.analysis({
          date_from: dateRange.from,
          date_to: dateRange.to,
          granularity,
          metric,
        }),
        statisticsApi.frequentVisitors({
          date_from: dateRange.from,
          date_to: dateRange.to,
          limit: 20,
        }),
        statisticsApi.churnedVisitors({
          date_from: dateRange.from,
          date_to: dateRange.to,
          inactive_days: 30,
        }),
      ])
      setAnalysis(analysisRes)
      setFrequentVisitors(frequentRes.visitors)
      setChurnedVisitors(churnedRes.visitors)
    } catch {
      setAnalysis(null)
      setFrequentVisitors([])
      setChurnedVisitors([])
    } finally {
      setLoading(false)
    }
  }, [dateRange, granularity, metric])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // 生成年份选项
  const yearOptions = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i)

  // 最后一天的值作为当前值
  const currentValue = analysis?.data.length ? analysis.data[analysis.data.length - 1].value : 0

  return (
    <div className="min-h-full bg-white p-6">
      <div className="p-5">
        <h1 className="text-[16px] font-medium text-[#1f2329] mb-4">数据分析</h1>

        {/* 筛选栏 */}
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <span className="text-[12px] text-[#8f959e]">统计范围</span>
          <div className="flex items-center border border-[#e8eaed] rounded overflow-hidden">
            <button
              onClick={() => {
                setGranularity("month")
                setSelectedMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`)
              }}
              className={`px-3 h-7 text-[12px] transition-colors ${granularity === "month" ? "bg-[#3370ff] text-white" : "bg-white text-[#4e535a] hover:bg-[#f7f8fa]"}`}
            >
              按月
            </button>
            <button
              onClick={() => {
                setGranularity("year")
                setSelectedYear(now.getFullYear())
              }}
              className={`px-3 h-7 text-[12px] transition-colors ${granularity === "year" ? "bg-[#3370ff] text-white" : "bg-white text-[#4e535a] hover:bg-[#f7f8fa]"}`}
            >
              按年
            </button>
          </div>

          {granularity === "month" ? (
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="h-7 px-2 text-[12px] bg-white border border-[#e8eaed] rounded outline-none"
            />
          ) : (
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="h-7 px-2 text-[12px] bg-white border border-[#e8eaed] rounded outline-none"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>{y}年</option>
              ))}
            </select>
          )}

          <span className="text-[12px] text-[#8f959e]">分析指标</span>
          <div className="flex items-center border border-[#e8eaed] rounded overflow-hidden">
            {(["invited", "arrived", "converted"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMetric(m)}
                className={`px-3 h-7 text-[12px] transition-colors ${metric === m ? "bg-[#3370ff] text-white" : "bg-white text-[#4e535a] hover:bg-[#f7f8fa]"}`}
              >
                {METRIC_LABELS[m]}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-[400px] text-[#8f959e]">加载中...</div>
        ) : !analysis ? (
          <div className="flex items-center justify-center h-[400px] text-[#8f959e]">暂无数据</div>
        ) : (
          <>
            {/* 区块1: 概览卡片 */}
            <div className="flex gap-3 mb-5">
              <div className="w-[140px] bg-[#f7f8fa] rounded-lg p-3">
                <div className="text-[11px] text-[#8f959e] mb-0.5">当前值</div>
                <div className="text-[20px] font-medium text-[#1f2329]">{currentValue}</div>
              </div>
              <div className="w-[140px] bg-[#f7f8fa] rounded-lg p-3">
                <div className="text-[11px] text-[#8f959e] mb-0.5">{granularity === "year" ? "年均值" : "月均值"}</div>
                <div className="text-[20px] font-medium text-[#1f2329]">{analysis.benchmark}</div>
              </div>
              <div className="w-[140px] bg-[#f7f8fa] rounded-lg p-3">
                <div className="text-[11px] text-[#8f959e] mb-0.5">异常天数</div>
                <div className="text-[20px] font-medium text-[#1f2329]">{analysis.anomaly_count}</div>
              </div>
              <div className="w-[140px] bg-[#f7f8fa] rounded-lg p-3">
                <div className="text-[11px] text-[#8f959e] mb-0.5">趋势</div>
                <div className={`inline-flex items-center px-2 py-0.5 rounded text-[12px] ${TREND_CONFIG[analysis.trend]?.color} ${TREND_CONFIG[analysis.trend]?.bg}`}>
                  {TREND_CONFIG[analysis.trend]?.label || analysis.trend}
                </div>
              </div>
            </div>

            {/* 区块2: 趋势图 */}
            <div className="border border-[#e8eaed] rounded-lg p-4 bg-white mb-5">
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={analysis.data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="0" stroke="transparent" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 12, fill: "#8f959e" }}
                    tickLine={false}
                    axisLine={{ stroke: "#d0d3d6" }}
                    tickFormatter={(v) => {
                      const parts = v.split("-")
                      const day = parseInt(parts[2])
                      return day % 2 === 0 ? `${parts[1]}/${parts[2]}` : ""
                    }}
                  />
                  <YAxis
                    tick={{ fontSize: 12, fill: "#8f959e" }}
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={{ stroke: "#d0d3d6" }}
                  />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 4 }}
                    formatter={(value, name) => {
                      if (name === "value") return [value, METRIC_LABELS[metric]]
                      if (name === "benchmark") return [value, "基准值"]
                      return [value, name]
                    }}
                    labelFormatter={(label) => `日期: ${label}`}
                  />
                  <ReferenceLine
                    y={analysis.benchmark}
                    stroke="#ff9500"
                    strokeDasharray="4 4"
                    strokeWidth={1}
                    label={{ value: `基准 ${analysis.benchmark}`, position: "right", fontSize: 11, fill: "#ff9500" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#3370ff"
                    strokeWidth={1}
                    dot={(props) => {
                      const { cx, cy, payload } = props
                      if (payload.is_anomaly) {
                        return <circle key={`dot-${cx}-${cy}`} cx={cx} cy={cy} r={4} fill="#ff3b30" stroke="#ff3b30" />
                      }
                      return null
                    }}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* 区块3: 异常数据列表 */}
            {analysis.data.filter((d) => d.is_anomaly).length > 0 && (
              <div className="mb-5">
                <h2 className="text-[14px] font-medium text-[#1f2329] mb-3">异常数据（±1.5σ）</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="border-b border-[#f0f0f0]">
                        <th className="text-left py-2 px-3 text-[#8f959e] font-normal">日期</th>
                        <th className="text-left py-2 px-3 text-[#8f959e] font-normal">实际值</th>
                        <th className="text-left py-2 px-3 text-[#8f959e] font-normal">基准值</th>
                        <th className="text-left py-2 px-3 text-[#8f959e] font-normal">偏差</th>
                        <th className="text-left py-2 px-3 text-[#8f959e] font-normal">偏差率</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.data
                        .filter((d) => d.is_anomaly)
                        .map((item) => (
                          <tr key={item.date} className="border-b border-[#f0f0f0] hover:bg-[#f7f8fa]">
                            <td className="py-2 px-3 text-[#4e535a]">{item.date}</td>
                            <td className="py-2 px-3 text-[#4e535a]">{item.value}</td>
                            <td className="py-2 px-3 text-[#4e535a]">{item.benchmark}</td>
                            <td className="py-2 px-3">
                              <span className={item.deviation >= 0 ? "text-[#34c724]" : "text-[#ff3b30]"}>
                                {item.deviation >= 0 ? "+" : ""}{item.deviation}
                              </span>
                            </td>
                            <td className="py-2 px-3">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] ${
                                item.deviation >= 0
                                  ? "bg-[#e8f5e9] text-[#2e7d32]"
                                  : "bg-[#ffeaea] text-[#ff3b30]"
                              }`}>
                                {item.deviation_rate >= 0 ? "+" : ""}{item.deviation_rate}%
                              </span>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 区块4: 星期分析 */}
            <div className="mb-5">
              <h2 className="text-[14px] font-medium text-[#1f2329] mb-3">星期分析</h2>
              <div className="flex gap-2">
                {analysis.weekday_stats.map((ws) => (
                  <div key={ws.weekday} className="flex-1 bg-[#f7f8fa] rounded-lg p-3 text-center">
                    <div className="text-[11px] text-[#8f959e] mb-1">{ws.label}</div>
                    <div className="text-[18px] font-medium text-[#1f2329]">{ws.avg}</div>
                    <div className="text-[10px] text-[#8f959e] mt-0.5">{ws.count}天</div>
                  </div>
                ))}
              </div>
            </div>

            {/* 区块5: 用户画像 */}
            <div>
              <div className="flex items-center gap-0 border-b border-[#f0f0f0] mb-4">
                <button
                  onClick={() => setProfileTab("frequent")}
                  className={`px-4 py-2 text-[13px] transition-colors border-b-2 ${
                    profileTab === "frequent"
                      ? "border-[#3370ff] text-[#3370ff] font-medium"
                      : "border-transparent text-[#4e535a] hover:text-[#1f2329]"
                  }`}
                >
                  常来用户（{frequentVisitors.length}）
                </button>
                <button
                  onClick={() => setProfileTab("churned")}
                  className={`px-4 py-2 text-[13px] transition-colors border-b-2 ${
                    profileTab === "churned"
                      ? "border-[#3370ff] text-[#3370ff] font-medium"
                      : "border-transparent text-[#4e535a] hover:text-[#1f2329]"
                  }`}
                >
                  流失用户（{churnedVisitors.length}）
                </button>
              </div>

              {profileTab === "frequent" ? (
                frequentVisitors.length === 0 ? (
                  <div className="text-center text-[#8f959e] py-8">暂无数据</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-[12px]">
                      <thead>
                        <tr className="border-b border-[#f0f0f0]">
                          <th className="text-left py-2 px-3 text-[#8f959e] font-normal">序号</th>
                          <th className="text-left py-2 px-3 text-[#8f959e] font-normal">昵称</th>
                          <th className="text-left py-2 px-3 text-[#8f959e] font-normal">类型</th>
                          <th className="text-left py-2 px-3 text-[#8f959e] font-normal">到场次数</th>
                          <th className="text-left py-2 px-3 text-[#8f959e] font-normal">购买产品</th>
                          <th className="text-left py-2 px-3 text-[#8f959e] font-normal">标签</th>
                          <th className="text-left py-2 px-3 text-[#8f959e] font-normal">最后到场</th>
                        </tr>
                      </thead>
                      <tbody>
                        {frequentVisitors.map((v, index) => (
                          <tr key={v.customer_id} className="border-b border-[#f0f0f0] hover:bg-[#f7f8fa]">
                            <td className="py-2 px-3 text-[#4e535a]">{index + 1}</td>
                            <td className="py-2 px-3 text-[#4e535a]">{v.nickname}</td>
                            <td className="py-2 px-3">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] ${
                                v.is_new
                                  ? "bg-[#fff3e0] text-[#e65100]"
                                  : "bg-[#e8f5e9] text-[#2e7d32]"
                              }`}>
                                {v.is_new ? "新人" : v.member_type || "老人"}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-[#4e535a] font-medium">{v.visit_count}</td>
                            <td className="py-2 px-3 text-[#4e535a]">{v.products.join("、") || "-"}</td>
                            <td className="py-2 px-3 text-[#4e535a]">{v.tags || "-"}</td>
                            <td className="py-2 px-3 text-[#4e535a]">{v.last_visit}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              ) : churnedVisitors.length === 0 ? (
                <div className="text-center text-[#8f959e] py-8">暂无流失用户</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="border-b border-[#f0f0f0]">
                        <th className="text-left py-2 px-3 text-[#8f959e] font-normal">序号</th>
                        <th className="text-left py-2 px-3 text-[#8f959e] font-normal">昵称</th>
                        <th className="text-left py-2 px-3 text-[#8f959e] font-normal">历史到场</th>
                        <th className="text-left py-2 px-3 text-[#8f959e] font-normal">最后到场</th>
                        <th className="text-left py-2 px-3 text-[#8f959e] font-normal">未到场天数</th>
                        <th className="text-left py-2 px-3 text-[#8f959e] font-normal">购买产品</th>
                        <th className="text-left py-2 px-3 text-[#8f959e] font-normal">标签</th>
                      </tr>
                    </thead>
                    <tbody>
                      {churnedVisitors.map((v, index) => (
                        <tr key={v.customer_id} className="border-b border-[#f0f0f0] hover:bg-[#f7f8fa]">
                          <td className="py-2 px-3 text-[#4e535a]">{index + 1}</td>
                          <td className="py-2 px-3 text-[#4e535a]">{v.nickname}</td>
                          <td className="py-2 px-3 text-[#4e535a] font-medium">{v.total_visits}</td>
                          <td className="py-2 px-3 text-[#4e535a]">{v.last_visit}</td>
                          <td className="py-2 px-3">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] bg-[#ffeaea] text-[#ff3b30]">
                              {v.days_inactive}天
                            </span>
                          </td>
                          <td className="py-2 px-3 text-[#4e535a]">{v.products.join("、") || "-"}</td>
                          <td className="py-2 px-3 text-[#4e535a]">{v.tags || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
