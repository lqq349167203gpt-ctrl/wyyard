import { useEffect, useState } from "react"
import { Inbox } from "lucide-react"
import { financialApi } from "@/lib/api"
import type { FinancialBreakdown, FinancialCompositionDetail, FinancialCompositionKind, FinancialOrderDetail, FinancialOverview } from "@/lib/api"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { PaginationBar } from "@/components/pagination-bar"
import { EmptyValue } from "@/components/empty-value"
import { usePagination } from "@/hooks/use-pagination"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate()
}

function formatDate(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

function formatRangeLabel(dateFrom: string, dateTo: string) {
  return `${dateFrom.replace(/(\d+)-(\d+)-(\d+)/, "$1年$2月$3日")} - ${dateTo.replace(/(\d+)-(\d+)-(\d+)/, "$1年$2月$3日")}`
}

function currentDateRange() {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  return {
    from: formatDate(year, month, 1),
    to: formatDate(year, month, getDaysInMonth(year, month)),
  }
}

function money(value: number) {
  return `¥${value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function MetricCard({
  label,
  value,
}: {
  label: string
  value: number | null
}) {
  return (
    <div className="min-w-0 px-5 py-5">
      <div className="text-[12px] text-[#8f959e]">{label}</div>
      <div className="mt-2 text-lg font-medium tabular-nums text-[#1f2329]">
        {value === null ? <EmptyValue /> : money(value)}
      </div>
    </div>
  )
}

function TableRemainder({ displayedRows }: { displayedRows: number }) {
  const remainingRows = Math.max(0, 10 - displayedRows)
  if (remainingRows === 0 || displayedRows === 0) return null
  return <div className="flex items-center justify-center border-t border-[#f0f0f0] bg-[#fafafa]" style={{ height: `${remainingRows * 52}px` }}>
    <div className="flex w-full items-center justify-center gap-3 px-8">
      <span className="h-px max-w-20 flex-1 bg-[#f0f0f0]" />
      <span className="shrink-0 text-[12px] text-[#c9cdd4]">本页已显示全部</span>
      <span className="h-px max-w-20 flex-1 bg-[#f0f0f0]" />
    </div>
  </div>
}

function RevenueTable({ rows, onSelect }: { rows: FinancialBreakdown[]; onSelect: (row: FinancialBreakdown) => void }) {
  const pager = usePagination(rows, { pageSize: 10 })
  return (
    <div className="min-w-0 overflow-hidden">
      <div className="h-[562px] overflow-hidden">
      {rows.length === 0 ? <div className="flex h-full flex-col items-center justify-center gap-2"><Inbox className="h-8 w-8 text-[#d0d3d6]" /><span className="text-[12px] text-[#8f959e]">暂无营收记录</span></div> : (
        <Table style={{ tableLayout: "fixed" }}>
          <TableHeader><TableRow className="hover:bg-transparent">
            <TableHead className="pl-4">类型</TableHead><TableHead className="text-right" style={{ width: "150px" }}>成交额</TableHead>
            <TableHead className="text-right" style={{ width: "120px" }}>营收占比</TableHead><TableHead className="text-right" style={{ width: "120px" }}>成交单数</TableHead>
            <TableHead className="text-right" style={{ width: "120px" }}>成交人数</TableHead>
            <TableHead className="pr-4 text-right" style={{ width: "220px" }}>成交人</TableHead>
          </TableRow></TableHeader>
          <TableBody>{pager.paginatedItems.map((row) => <TableRow key={row.name} className="cursor-pointer hover:bg-[#f7f8fa]" onClick={() => onSelect(row)}>
            <TableCell className="pl-4"><span className="block truncate text-[13px] font-medium text-[#212631]" title={row.name}>{row.name}</span></TableCell>
            <TableCell className="text-right text-[12px] tabular-nums text-[#2b2f36]">{money(row.revenue)}</TableCell>
            <TableCell className="text-right text-[12px] tabular-nums text-[#646a73]">{row.revenue_share.toFixed(2)}%</TableCell>
            <TableCell className="text-right text-[12px] tabular-nums text-[#646a73]">{row.deal_count}</TableCell>
            <TableCell className="text-right text-[12px] tabular-nums text-[#646a73]">{row.customer_count}</TableCell>
            <TableCell className="pr-4 text-right"><span className="block truncate text-[12px] text-[#a8b1bd]" title={row.closers.join("、")}>{row.closers.join("、") || <EmptyValue />}</span></TableCell>
          </TableRow>)}</TableBody>
        </Table>
      )}
      <TableRemainder displayedRows={pager.paginatedItems.length} />
      </div>
      <div className="h-[45px] overflow-hidden">
        <PaginationBar currentPage={pager.currentPage} totalPages={pager.totalPages} totalItems={pager.totalItems} startIndex={pager.startIndex} endIndex={pager.endIndex} onPageChange={pager.goToPage} />
      </div>
    </div>
  )
}

const COMPOSITION_META: Record<FinancialCompositionKind, { label: string; empty: string }> = {
  expense: { label: "支出构成", empty: "暂无支出记录" },
  refund: { label: "退款构成", empty: "暂无退款记录" },
}

function CompositionTable({ kind, rows, loading, onSelect }: { kind: FinancialCompositionKind; rows: FinancialCompositionDetail[]; loading: boolean; onSelect: (row: FinancialCompositionDetail) => void }) {
  const pager = usePagination(rows, { pageSize: 10 })
  return <div className="min-w-0 overflow-hidden">
    <div className="h-[562px] overflow-hidden">
    {loading ? <div className="flex h-full items-center justify-center text-[12px] text-[#8f959e]">加载中...</div> : rows.length === 0 ? <div className="flex h-full flex-col items-center justify-center gap-2"><Inbox className="h-8 w-8 text-[#d0d3d6]" /><span className="text-[12px] text-[#8f959e]">{COMPOSITION_META[kind].empty}</span></div> : <Table style={{ tableLayout: "fixed" }}>
    <TableHeader><TableRow className="hover:bg-transparent">
      <TableHead className="pl-4" style={{ width: "120px" }}>日期</TableHead>
      <TableHead style={{ width: "160px" }}>{kind === "expense" ? "成本类别" : "客户"}</TableHead>
      <TableHead style={{ width: "180px" }}>{kind === "expense" ? "支出类型" : kind === "refund" ? "退款项目" : "类型"}</TableHead>
      {kind === "expense" && <TableHead>购买内容</TableHead>}
      {kind === "expense" && <TableHead style={{ width: "100px" }}>平台</TableHead>}
      {kind === "refund" && <TableHead className="text-right" style={{ width: "120px" }}>原成交额</TableHead>}
      <TableHead className="text-right" style={{ width: "130px" }}>{kind === "refund" ? "退款金额" : "金额"}</TableHead>
      <TableHead>备注</TableHead>
      <TableHead className="pr-4" style={{ width: "100px" }}>创建人</TableHead>
    </TableRow></TableHeader>
    <TableBody>{pager.paginatedItems.map((row) => <TableRow key={`${kind}-${row.id}`} className="cursor-pointer hover:bg-[#f7f8fa]" onClick={() => onSelect(row)}>
      <TableCell className="pl-4 text-[12px] tabular-nums text-[#8f959e]">{row.date}</TableCell>
      <TableCell><span className="block truncate text-[13px] font-medium text-[#212631]" title={row.primary}>{row.primary}</span></TableCell>
      <TableCell><span className="block truncate text-[12px] text-[#4e535a]" title={row.secondary}>{row.secondary || <EmptyValue />}</span></TableCell>
      {kind === "expense" && <TableCell><span className="block truncate text-[12px] text-[#4e535a]" title={row.content}>{row.content || <EmptyValue />}</span></TableCell>}
      {kind === "expense" && <TableCell className="text-[12px] text-[#8f959e]">{row.platform || <EmptyValue />}</TableCell>}
      {kind === "refund" && <TableCell className="text-right text-[12px] tabular-nums text-[#646a73]">{money(row.paid_amount ?? 0)}</TableCell>}
      <TableCell className="text-right text-[12px] tabular-nums text-[#2b2f36]">{money(row.amount)}</TableCell>
      <TableCell><span className="block truncate text-[12px] text-[#8f959e]" title={row.notes}>{row.notes || <EmptyValue />}</span></TableCell>
      <TableCell className="pr-4 text-[12px] text-[#8f959e]">{row.operator || <EmptyValue />}</TableCell>
    </TableRow>)}</TableBody>
  </Table>}
    {!loading && <TableRemainder displayedRows={pager.paginatedItems.length} />}
    </div>
    <div className="h-[45px] overflow-hidden">
      {!loading && <PaginationBar currentPage={pager.currentPage} totalPages={pager.totalPages} totalItems={pager.totalItems} startIndex={pager.startIndex} endIndex={pager.endIndex} onPageChange={pager.goToPage} />}
    </div>
  </div>
}

export default function FinancialOverviewPage() {
  const now = new Date()
  const initialRange = currentDateRange()
  const [timeView, setTimeView] = useState<"month" | "year">("month")
  const [dateFrom, setDateFrom] = useState(initialRange.from)
  const [dateTo, setDateTo] = useState(initialRange.to)
  const [activeRevenue, setActiveRevenue] = useState<"group" | "custom">("group")
  const [activeComposition, setActiveComposition] = useState<"revenue" | FinancialCompositionKind>("revenue")
  const [data, setData] = useState<FinancialOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedRevenue, setSelectedRevenue] = useState<FinancialBreakdown | null>(null)
  const [orderDetails, setOrderDetails] = useState<FinancialOrderDetail[]>([])
  const [orderLoading, setOrderLoading] = useState(false)
  const [orderError, setOrderError] = useState("")
  const [compositionDetails, setCompositionDetails] = useState<FinancialCompositionDetail[]>([])
  const [compositionLoading, setCompositionLoading] = useState(false)
  const [selectedComposition, setSelectedComposition] = useState<FinancialCompositionDetail | null>(null)
  useEffect(() => {
    let active = true
    setLoading(true)
    financialApi.overview(dateFrom, dateTo).then((result) => { if (active) setData(result) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [dateFrom, dateTo])

  useEffect(() => {
    if (activeComposition === "revenue") return
    let active = true
    setCompositionLoading(true)
    financialApi.compositionDetails(dateFrom, dateTo, activeComposition)
      .then((result) => { if (active) setCompositionDetails(result.data) })
      .catch(() => { if (active) setCompositionDetails([]) })
      .finally(() => { if (active) setCompositionLoading(false) })
    return () => { active = false }
  }, [activeComposition, dateFrom, dateTo])

  const openRevenueDetails = async (row: FinancialBreakdown) => {
    setSelectedRevenue(row)
    setOrderDetails([])
    setOrderError("")
    setOrderLoading(true)
    try {
      const result = await financialApi.revenueDetails(dateFrom, dateTo, activeRevenue, row.name)
      setOrderDetails(result.data)
    } catch {
      setOrderDetails([])
      setOrderError("订单明细加载失败，请刷新页面后重试")
    } finally {
      setOrderLoading(false)
    }
  }

  const switchComposition = (key: "revenue" | FinancialCompositionKind) => {
    if (key !== "revenue" && key !== activeComposition) {
      setCompositionDetails([])
      setCompositionLoading(true)
    }
    setActiveComposition(key)
  }

  const setMonthRange = () => {
    const year = now.getFullYear()
    const month = now.getMonth() + 1
    setTimeView("month")
    setDateFrom(formatDate(year, month, 1))
    setDateTo(formatDate(year, month, getDaysInMonth(year, month)))
  }

  const setYearRange = () => {
    const year = now.getFullYear()
    setTimeView("year")
    setDateFrom(formatDate(year, 1, 1))
    setDateTo(formatDate(year, 12, 31))
  }

  return <div className="dv-root min-h-full space-y-3 bg-[#f4f5f6] p-4">
    <style>{`.dv-root { font-family: -apple-system, "PingFang SC", "Helvetica Neue", sans-serif; }`}</style>
    <div className="rounded-xl bg-white px-[22px] py-4 shadow-[0_1px_3px_rgba(33,38,49,.06)]">
      <h1 className="mb-4 text-lg font-medium text-[#1f2329]">财务数据</h1>
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex w-[62px] shrink-0 items-center gap-[10px] text-[12px] text-[#8f959e]">
          <span className="h-3 w-[2.5px] rounded-[1px] bg-[#d0d3d6]" />
          统计范围
        </span>
        <div className="flex items-center rounded-[4px] bg-[#f0f1f3] p-0.5">
          <button type="button" onClick={setMonthRange} className={`h-[26px] rounded-[2px] px-3 text-[11px] transition-colors ${timeView === "month" ? "bg-white text-[#1f2329]" : "text-[#646a73] hover:text-[#4e535a]"}`}>按月</button>
          <button type="button" onClick={setYearRange} className={`h-[26px] rounded-[2px] px-3 text-[11px] transition-colors ${timeView === "year" ? "bg-white text-[#1f2329]" : "text-[#646a73] hover:text-[#4e535a]"}`}>按年</button>
        </div>
        <div className="-ml-[5px] flex items-center rounded-[4px] bg-[#f0f1f3] p-0.5">
          <input type="date" value={dateFrom} max={dateTo} onChange={(event) => setDateFrom(event.target.value)} className="h-[26px] rounded-[2px] border-none bg-white px-2 text-[11px] text-[#2b2f36] outline-none" />
          <span className="flex h-[26px] items-center bg-white px-1 text-[11px] text-[#8f959e]">-</span>
          <input type="date" value={dateTo} min={dateFrom} onChange={(event) => setDateTo(event.target.value)} className="h-[26px] rounded-[2px] border-none bg-white px-2 text-[11px] text-[#2b2f36] outline-none" />
        </div>
      </div>
    </div>
    {loading || !data ? <div className="flex flex-col items-center justify-center gap-2 rounded-xl bg-white py-16 shadow-[0_2px_4px_rgba(33,38,49,.05)]"><Inbox className="h-8 w-8 text-[#d0d3d6]" /><span className="text-[12px] text-[#8f959e]">加载中...</span></div> : <div className="space-y-3">
      <section className="overflow-hidden rounded-xl bg-white shadow-[0_2px_4px_rgba(33,38,49,.05)]">
        <div className="flex min-h-[52px] flex-wrap items-center justify-between gap-2 border-b border-[#f0f0f0] px-5 py-3">
          <h2 className="text-[14px] font-medium text-[#1f2329]">经营概览</h2>
          <span className="text-[12px] text-[#8f959e]">{formatRangeLabel(dateFrom, dateTo)}</span>
        </div>
        <div className="grid divide-x divide-[#f0f0f0] sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="总营收" value={data.total_revenue} />
          <MetricCard label="总支出 · 管理成本" value={data.management_cost} />
          <MetricCard label="总支出 · 运营成本" value={data.operation_cost} />
          <MetricCard label="退费总额" value={data.refund_total} />
        </div>
      </section>

      <section className="overflow-hidden rounded-xl bg-white shadow-[0_2px_4px_rgba(33,38,49,.05)]">
        <div className="flex min-h-[52px] flex-wrap items-center justify-between gap-3 border-b border-[#f0f0f0] px-5 py-3">
          <div><h2 className="text-[14px] font-medium text-[#1f2329]">财务构成</h2><p className="mt-1 text-[12px] text-[#8f959e]">按当前统计范围查看各项财务明细</p></div>
          <div className="text-right"><div className="text-[12px] text-[#8f959e]">{activeComposition === "revenue" ? "营收合计" : activeComposition === "expense" ? "支出合计" : "退款合计"}</div><div className="mt-1 text-[13px] font-medium tabular-nums text-[#2b2f36]">{money(activeComposition === "revenue" ? data.total_revenue : activeComposition === "expense" ? data.total_expense : data.refund_total)}</div></div>
        </div>
        <div className="flex min-h-[46px] items-end border-b border-[#e8e8e8] px-5">
          <div className="flex items-center gap-7">
            {[
              { key: "revenue" as const, label: "营收构成" },
              { key: "expense" as const, label: "支出构成" },
              { key: "refund" as const, label: "退款构成" },
            ].map((item) => <button key={item.key} type="button" onClick={() => switchComposition(item.key)} className={`relative px-1 pb-3 text-[14px] transition-colors ${activeComposition === item.key ? "text-[#3370ff]" : "text-[#2b2f36] hover:text-[#4e535a]"}`}>{item.label}{activeComposition === item.key && <span className="absolute bottom-0 left-0 right-0 h-[3px] rounded-t-sm bg-[#3370ff]" />}</button>)}
          </div>
        </div>
        <div className="flex h-[50px] items-center gap-2 border-b border-[#f0f0f0] px-5">
          {activeComposition === "revenue" ? <>
            {[
              { key: "group" as const, label: "团课营收", value: data.group_class_revenue },
              { key: "custom" as const, label: "专项定制营收", value: data.custom_course_revenue },
            ].map((item) => <button key={item.key} type="button" onClick={() => setActiveRevenue(item.key)} className={`h-7 rounded-[4px] px-3 text-[12px] transition-colors ${activeRevenue === item.key ? "bg-[#f0f5ff] text-[#3370ff]" : "text-[#646a73] hover:bg-[#f5f6f7]"}`}>{item.label}<span className="ml-2 tabular-nums">{money(item.value)}</span></button>)}
          </> : <span className="text-[12px] text-[#8f959e]">{compositionLoading ? "正在加载明细" : `当前共 ${compositionDetails.length} 条明细`}</span>}
        </div>
        {activeComposition === "revenue" ? <>
          <RevenueTable rows={activeRevenue === "group" ? data.group_class_breakdown : data.custom_course_breakdown} onSelect={openRevenueDetails} />
        </> : <CompositionTable kind={activeComposition} rows={compositionDetails} loading={compositionLoading} onSelect={setSelectedComposition} />}
      </section>
    </div>}
    <Dialog open={selectedRevenue !== null} onOpenChange={(open) => { if (!open) { setSelectedRevenue(null); setOrderDetails([]); setOrderError("") } }}>
      <DialogContent className="max-h-[70vh] max-w-[900px] gap-0 overflow-y-auto p-0" initialFocus={false}>
        <div className="border-b border-[#f0f0f0] px-4 py-3">
          <span className="text-[14px] font-medium text-[#1f2329]">成交订单明细</span>
          {selectedRevenue && <span className="ml-2 text-[12px] text-[#8f959e]">{selectedRevenue.name} · {selectedRevenue.deal_count}笔</span>}
        </div>
        {orderLoading ? (
          <div className="px-4 py-10 text-center text-[12px] text-[#8f959e]">加载中...</div>
        ) : orderError ? (
          <div className="px-4 py-10 text-center text-[12px] text-[#c4506a]">{orderError}</div>
        ) : orderDetails.length === 0 ? (
          <div className="px-4 py-10 text-center text-[12px] text-[#8f959e]">暂无数据</div>
        ) : (
          <div className="min-w-[820px]">
            <div className="flex items-center border-b border-[#f0f0f0] px-4 py-1.5 text-[11px] text-[#8f959e]">
              <span className="w-24 shrink-0">成交日期</span>
              <span className="w-24 shrink-0">昵称</span>
              <span className="w-20 shrink-0">项目类型</span>
              <span className="min-w-0 flex-1">项目名称</span>
              <span className="w-20 shrink-0">数量/期限</span>
              <span className="w-20 shrink-0">金额</span>
              <span className="w-32 shrink-0">成交人</span>
              <span className="w-[100px] shrink-0">备注</span>
            </div>
            {orderDetails.map((order, index) => (
              <div key={`${order.id}-${index}`} className="flex items-center px-4 py-2 text-[12px] text-[#4e535a] hover:bg-[#f7f8fa]">
                <span className="w-24 shrink-0 tabular-nums">{order.deal_date || <EmptyValue />}</span>
                <span className="w-24 shrink-0 truncate" title={order.nickname}>{order.nickname || <EmptyValue />}</span>
                <span className="w-20 shrink-0 text-[#8f959e]">{order.type || <EmptyValue />}</span>
                <span className="min-w-0 flex-1 truncate" title={order.name}>{order.name || <EmptyValue />}</span>
                <span className="w-20 shrink-0">{order.quantity || <EmptyValue />}</span>
                <span className="w-20 shrink-0 tabular-nums">{money(order.amount)}</span>
                <span className="w-32 shrink-0 truncate text-[#8f959e]" title={order.closers.map((closer) => `${closer.name} ¥${closer.amount}`).join("、")}>
                  {order.closers.length > 0 ? order.closers.map((closer) => `${closer.name} ¥${closer.amount}`).join("、") : <EmptyValue />}
                </span>
                <span className="w-[100px] shrink-0 truncate" title={order.notes}>{order.notes || <EmptyValue />}</span>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
    <Dialog open={selectedComposition !== null} onOpenChange={(open) => { if (!open) setSelectedComposition(null) }}>
      <DialogContent className="w-[520px] max-w-[90vw] gap-0 p-0" initialFocus={false}>
        <div className="border-b border-[#f0f0f0] px-5 py-3">
          <span className="text-[14px] font-medium text-[#1f2329]">{selectedComposition ? COMPOSITION_META[selectedComposition.kind].label.replace("构成", "详情") : "明细详情"}</span>
        </div>
        {selectedComposition && <div className="grid grid-cols-[88px_1fr] gap-x-4 gap-y-4 px-5 py-5 text-[12px]">
          <span className="text-right text-[#8f959e]">日期</span><span className="text-[#2b2f36] tabular-nums">{selectedComposition.date}</span>
          <span className="text-right text-[#8f959e]">{selectedComposition.kind === "expense" ? "成本类别" : "客户"}</span><span className="text-[#2b2f36]">{selectedComposition.primary}</span>
          <span className="text-right text-[#8f959e]">{selectedComposition.kind === "expense" ? "支出类型" : selectedComposition.kind === "refund" ? "退款项目" : "类型"}</span><span className="text-[#2b2f36]">{selectedComposition.secondary || <EmptyValue />}</span>
          {selectedComposition.kind === "expense" && <><span className="text-right text-[#8f959e]">购买内容</span><span className="text-[#2b2f36]">{selectedComposition.content || <EmptyValue />}</span><span className="text-right text-[#8f959e]">平台</span><span className="text-[#2b2f36]">{selectedComposition.platform || <EmptyValue />}</span></>}
          {selectedComposition.kind === "refund" && <><span className="text-right text-[#8f959e]">原成交额</span><span className="text-[#2b2f36] tabular-nums">{money(selectedComposition.paid_amount ?? 0)}</span></>}
          <span className="text-right text-[#8f959e]">{selectedComposition.kind === "refund" ? "退款金额" : "金额"}</span><span className="font-medium tabular-nums text-[#2b2f36]">{money(selectedComposition.amount)}</span>
          <span className="text-right text-[#8f959e]">备注</span><span className="whitespace-pre-wrap text-[#2b2f36]">{selectedComposition.notes || <EmptyValue />}</span>
          <span className="text-right text-[#8f959e]">创建人</span><span className="text-[#2b2f36]">{selectedComposition.operator || <EmptyValue />}</span>
        </div>}
      </DialogContent>
    </Dialog>
  </div>
}
