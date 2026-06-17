import { useState, useCallback, useRef } from "react"
import { X } from "lucide-react"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { consumptionRecordsApi, type ConsumptionPaymentRecord, type DeductionRecord } from "@/lib/api"
import { useServerPagination } from "@/hooks/use-server-pagination"
import { PaginationBar } from "@/components/pagination-bar"

const PAGE_SIZE = 20

export default function ConsumptionRecordsPage() {
  const [activeTab, setActiveTab] = useState<"payment" | "deduction">("payment")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const dateFromRef = useRef("")
  const dateToRef = useRef("")
  const tabRef = useRef(activeTab)

  const fetchPayments = useCallback(async (page: number, pageSize: number) => {
    return consumptionRecordsApi.listPayments(
      { date_from: dateFromRef.current || undefined, date_to: dateToRef.current || undefined },
      page, pageSize,
    )
  }, [])

  const payments = useServerPagination<ConsumptionPaymentRecord>(fetchPayments, { pageSize: PAGE_SIZE })

  const fetchDeductions = useCallback(async (page: number, pageSize: number) => {
    return consumptionRecordsApi.listDeductions(
      { date_from: dateFromRef.current || undefined, date_to: dateToRef.current || undefined },
      page, pageSize,
    )
  }, [])

  const deductions = useServerPagination<DeductionRecord>(fetchDeductions, { pageSize: PAGE_SIZE })

  const switchTab = (newTab: "payment" | "deduction") => {
    setActiveTab(newTab)
    tabRef.current = newTab
    if (newTab === "payment") payments.goToPage(1)
    else deductions.goToPage(1)
  }

  const handleDateChange = (field: "from" | "to", value: string) => {
    if (field === "from") { dateFromRef.current = value; setDateFrom(value) }
    else { dateToRef.current = value; setDateTo(value) }
    if (tabRef.current === "payment") payments.goToPage(1)
    else deductions.goToPage(1)
  }

  const handleClear = () => {
    dateFromRef.current = ""
    dateToRef.current = ""
    setDateFrom("")
    setDateTo("")
    if (tabRef.current === "payment") payments.goToPage(1)
    else deductions.goToPage(1)
  }

  const current = activeTab === "payment" ? payments : deductions

  return (
    <div className="px-6 pt-4 pb-6 space-y-3">
      {/* Tab 切换 */}
      <div className="flex items-center border-b border-[#e8e8e8] -mx-6 px-6 min-h-[39px]">
        <div className="flex items-center gap-6">
          <button
            className={`relative px-1 pb-2 text-[14px] transition-colors ${
              activeTab === "payment" ? "text-[#3370ff]" : "text-[#2b2f36] hover:text-[#4e535a]"
            }`}
            onClick={() => switchTab("payment")}
          >
            付费记录
            {activeTab === "payment" && <span className="absolute bottom-[-5px] left-0 right-0 h-[3px] bg-[#3370ff] rounded-t-sm" />}
          </button>
          <button
            className={`relative px-1 pb-2 text-[14px] transition-colors ${
              activeTab === "deduction" ? "text-[#3370ff]" : "text-[#2b2f36] hover:text-[#4e535a]"
            }`}
            onClick={() => switchTab("deduction")}
          >
            销卡记录
            {activeTab === "deduction" && <span className="absolute bottom-[-5px] left-0 right-0 h-[3px] bg-[#3370ff] rounded-t-sm" />}
          </button>
        </div>
      </div>

      {/* 搜索栏 */}
      <div className="flex items-end gap-3 flex-wrap">
        <div className="flex items-center h-8 rounded-md border border-input overflow-hidden">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => handleDateChange("from", e.target.value)}
            className={`h-full px-2 text-[12px] border-none outline-none bg-transparent ${!dateFrom ? "text-[#8f959e] date-empty" : "text-[#2b2f36]"}`}
          />
          <span className="text-[12px] text-[#8f959e] px-1">~</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => handleDateChange("to", e.target.value)}
            className={`h-full px-2 text-[12px] border-none outline-none bg-transparent ${!dateTo ? "text-[#8f959e] date-empty" : "text-[#2b2f36]"}`}
          />
        </div>
        <button
          onClick={handleClear}
          className="h-8 px-4 rounded-md border border-[#e0e0e0] text-[12px] text-[#4e535a] hover:bg-[#f5f6f7] flex items-center gap-1"
        >
          <X className="h-3.5 w-3.5" />
          清空
        </button>
      </div>

      {/* 表格 */}
      {activeTab === "payment" ? (
        <PaymentTable records={payments.paginatedItems} loading={payments.loading} />
      ) : (
        <DeductionTable records={deductions.paginatedItems} loading={deductions.loading} />
      )}

      {/* 分页 */}
      <PaginationBar
        currentPage={current.currentPage}
        totalPages={current.totalPages}
        totalItems={current.totalItems}
        startIndex={current.startIndex}
        endIndex={current.endIndex}
        onPageChange={current.goToPage}
      />
    </div>
  )
}

function PaymentTable({ records, loading }: { records: ConsumptionPaymentRecord[]; loading: boolean }) {
  if (loading) {
    return <div className="py-16 text-center text-sm text-muted-foreground">加载中...</div>
  }
  if (records.length === 0) {
    return <div className="py-16 text-center text-sm text-muted-foreground">暂无付费记录</div>
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="pl-4">成交日期</TableHead>
          <TableHead>用户</TableHead>
          <TableHead>类型</TableHead>
          <TableHead>名称</TableHead>
          <TableHead className="text-right">数量</TableHead>
          <TableHead className="text-right">金额</TableHead>
          <TableHead>生效日期</TableHead>
          <TableHead>到期日期</TableHead>
          <TableHead className="pr-4">成交人</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {records.map((r, i) => (
          <TableRow key={i}>
            <TableCell className="pl-4 text-[#8f959e]">{r.date || "-"}</TableCell>
            <TableCell className="text-[#2b2f36]">{r.nickname}</TableCell>
            <TableCell className="text-[#2b2f36]">{r.type}</TableCell>
            <TableCell className="text-[#2b2f36]">{r.name}</TableCell>
            <TableCell className="text-right text-[#2b2f36]">{r.quantity}</TableCell>
            <TableCell className="text-right text-[#2b2f36]">{r.amount}</TableCell>
            <TableCell className="text-[#8f959e]">{r.effective_date || "-"}</TableCell>
            <TableCell className="text-[#8f959e]">{r.expiry_date || "-"}</TableCell>
            <TableCell className="pr-4 text-[#2b2f36]">{r.closer_name || "-"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function DeductionTable({ records, loading }: { records: DeductionRecord[]; loading: boolean }) {
  if (loading) {
    return <div className="py-16 text-center text-sm text-muted-foreground">加载中...</div>
  }
  if (records.length === 0) {
    return <div className="py-16 text-center text-sm text-muted-foreground">暂无销卡记录</div>
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="pl-4">销卡日期</TableHead>
          <TableHead>用户</TableHead>
          <TableHead>类型</TableHead>
          <TableHead>名称</TableHead>
          <TableHead className="text-right pr-4">销卡次数</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {records.map((r, i) => (
          <TableRow key={i}>
            <TableCell className="pl-4 text-[#8f959e]">{r.date || "-"}</TableCell>
            <TableCell className="text-[#2b2f36]">{r.nickname}</TableCell>
            <TableCell className="text-[#2b2f36]">{r.type}</TableCell>
            <TableCell className="text-[#2b2f36]">{r.name}</TableCell>
            <TableCell className="text-right pr-4 text-[#2b2f36]">{r.count}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
