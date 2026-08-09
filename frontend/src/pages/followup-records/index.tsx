import { useState, useEffect, useCallback, useMemo } from "react"
import { X, Inbox } from "lucide-react"
import { followupRecordApi, customerApi, type ActivityFollowup, type Customer } from "@/lib/api"
import { usePagination } from "@/hooks/use-pagination"
import { PaginationBar } from "@/components/pagination-bar"
import { CustomerSearchInput } from "@/components/customer-search-input"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"

export default function FollowupRecordsPage() {
  const [records, setRecords] = useState<ActivityFollowup[]>([])
  const [loading, setLoading] = useState(false)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [searchCustomerId, setSearchCustomerId] = useState("")

  const customerIdToName = useMemo(() => {
    const map: Record<string, string> = {}
    customers.forEach(c => {
      if (c.id) map[c.id] = c.nickname || ""
    })
    return map
  }, [customers])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await followupRecordApi.list()
      setRecords(res.items || [])
    } catch {
      setRecords([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    customerApi.list().then(setCustomers).catch(() => setCustomers([]))
  }, [fetchData])

  const filteredRecords = useMemo(() => {
    if (!searchCustomerId) return records
    return records.filter(r => r.customer_id === searchCustomerId)
  }, [records, searchCustomerId])

  const { paginatedItems, currentPage, totalPages, totalItems, goToPage, startIndex, endIndex } = usePagination(filteredRecords, { pageSize: 10 })

  const handleClear = () => {
    setSearchCustomerId("")
  }

  const formatTime = (value: string) => {
    if (!value) return "-"
    const d = new Date(value)
    if (isNaN(d.getTime())) return value
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
  }

  return (
    <div className="dv-root bg-[#f4f5f6] h-full p-4 flex flex-col gap-3">
      <style>{`.dv-root { font-family: -apple-system, "PingFang SC", "Helvetica Neue", sans-serif; }`}</style>
      {/* 标题栏 */}
      <div className="flex items-center flex-wrap gap-2 rounded-xl bg-white shadow-[0_1px_3px_rgba(33,38,49,.06)] px-5 h-[52px]">
        <span className="text-[15px] font-bold text-[#212631] whitespace-nowrap">回访记录</span>
        <span className="text-[11.5px] text-[#a8b1bd] ml-2.5 whitespace-nowrap">查看所有客户的活动回访记录</span>
      </div>
      {/* 表格卡：筛选条 + 数据表 */}
      <div className="rounded-xl bg-white shadow-[0_2px_4px_rgba(33,38,49,.05)] overflow-hidden flex flex-col flex-1 min-h-0">
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-[#f0f0f0]">
          <div className="w-[172px]">
            <CustomerSearchInput
              customers={customers}
              value={searchCustomerId ? (customerIdToName[searchCustomerId] || "") : ""}
              onChange={(v) => {
                if (typeof v === "string") {
                  const matched = customers.find(c => c.nickname === v)
                  setSearchCustomerId(matched?.id || "")
                } else {
                  setSearchCustomerId("")
                }
              }}
              placeholder="搜索昵称"
              filterSelected={false}
              className="border-[#e1e4e7] bg-white px-2.5 placeholder:text-[#a8b1bd]"
              rounded="7px"
            />
          </div>
          <button
            onClick={handleClear}
            className="flex h-8 items-center gap-1 rounded-[4px] border border-[#dee0e3] bg-white px-4 text-[12px] text-[#4e535a] hover:bg-[#f5f6f7]"
          >
            <X className="h-3.5 w-3.5" />
            清空
          </button>
        </div>
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2"><Inbox className="h-8 w-8 text-[#d0d3d6]" /><span className="text-[12px] text-[#8f959e]">加载中...</span></div>
        ) : filteredRecords.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2"><Inbox className="h-8 w-8 text-[#d0d3d6]" /><span className="text-[12px] text-[#8f959e]">暂无数据</span></div>
        ) : (
          <Table style={{ tableLayout: "fixed" }}>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4" style={{ width: "130px" }}>客户</TableHead>
                <TableHead style={{ width: "150px" }}>活动名称</TableHead>
                <TableHead style={{ width: "100px" }}>活动日期</TableHead>
                <TableHead style={{ width: "80px" }}>老师</TableHead>
                <TableHead style={{ width: "80px" }}>角色</TableHead>
                <TableHead>回访内容</TableHead>
                <TableHead className="pr-4" style={{ width: "140px" }}>回访时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedItems.map((record) => (
                <TableRow key={record.id} className="group hover:bg-[#f7f8fa]">
                  <TableCell className="pl-4">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#eef0f2] text-[12px] font-medium text-[#646a73]">
                        {(customerIdToName[record.customer_id] || "客").charAt(0)}
                      </span>
                      <span className="block truncate text-[13px] font-medium text-[#212631]">{customerIdToName[record.customer_id] || "-"}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-[12px] text-[#2b2f36]">{record.activity_name || "-"}</TableCell>
                  <TableCell className="text-[12px] text-[#8f959e] tabular-nums">{record.activity_date || "-"}</TableCell>
                  <TableCell className="text-[12px] text-[#8f959e]">{record.teacher || "-"}</TableCell>
                  <TableCell className="text-[12px] text-[#8f959e]">{record.customer_role || "-"}</TableCell>
                  <TableCell className="text-[12px] text-[#4e535a] whitespace-normal break-words">{record.content}</TableCell>
                  <TableCell className="pr-4 text-[12px] text-[#a8b1bd] tabular-nums">{formatTime(record.updated_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
  )
}
