import { useState, useEffect, useCallback, useMemo } from "react"
import { X } from "lucide-react"
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
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-lg font-semibold">回访记录</h1>
        <p className="text-xs text-muted-foreground mt-0.5">查看所有客户的活动回访记录</p>
      </div>

      {/* 搜索栏 */}
      <div className="flex items-end gap-3 flex-wrap">
        <div className="w-44">
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
            placeholder="搜索客户昵称"
            filterSelected={false}
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
      <div className="bg-white rounded-lg">
        {loading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">加载中...</div>
        ) : filteredRecords.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">暂无数据</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4 w-[100px]">客户</TableHead>
                <TableHead className="w-[140px]">活动名称</TableHead>
                <TableHead className="w-[100px]">活动日期</TableHead>
                <TableHead className="w-[80px]">老师</TableHead>
                <TableHead className="w-[80px]">角色</TableHead>
                <TableHead>回访内容</TableHead>
                <TableHead className="w-[140px]">回访时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedItems.map((record) => (
                <TableRow key={record.id} className="group">
                  <TableCell className="pl-4 text-[#2b2f36]">{customerIdToName[record.customer_id] || "-"}</TableCell>
                  <TableCell className="text-[#2b2f36]">{record.activity_name || "-"}</TableCell>
                  <TableCell className="text-[#8f959e] tabular-nums">{record.activity_date || "-"}</TableCell>
                  <TableCell className="text-[#8f959e]">{record.teacher || "-"}</TableCell>
                  <TableCell className="text-[#8f959e]">{record.customer_role || "-"}</TableCell>
                  <TableCell className="text-[#2b2f36] max-w-[300px] truncate">{record.content}</TableCell>
                  <TableCell className="text-[#8f959e] tabular-nums">{formatTime(record.updated_at)}</TableCell>
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
