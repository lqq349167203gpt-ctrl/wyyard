import { useCallback, useEffect, useRef, useState } from "react"
import { X } from "lucide-react"

import { CustomerSearchInput } from "@/components/customer-search-input"
import { PaginationBar } from "@/components/pagination-bar"
import { SelectDropdown } from "@/components/select-dropdown"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { useServerPagination } from "@/hooks/use-server-pagination"
import { classRecordApi, customerApi, type CustomerLight, type WithdrawalRecord } from "@/lib/api"

const STATUS_OPTIONS = [
  { value: "all", label: "全部状态" },
  { value: "active", label: "已退课" },
  { value: "cancelled", label: "已取消" },
]

function EmptyValue() {
  return <span className="inline-block h-[2px] w-[4px] rounded-full bg-[#e5e8eb] align-middle" />
}

function formatDateTime(value?: string | null): string {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString("zh-CN", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  })
}

export function WithdrawalTab() {
  const [customers, setCustomers] = useState<CustomerLight[]>([])
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [searchNickname, setSearchNickname] = useState("")
  const [status, setStatus] = useState("all")
  const [cancelTarget, setCancelTarget] = useState<WithdrawalRecord | null>(null)
  const [cancelling, setCancelling] = useState(false)

  const nicknameRef = useRef("")
  const dateFromRef = useRef("")
  const dateToRef = useRef("")
  const statusRef = useRef("all")

  const fetchWithdrawals = useCallback((page: number, pageSize: number) => (
    classRecordApi.listWithdrawalsPaginated(page, pageSize, {
      nickname: nicknameRef.current,
      status: statusRef.current,
      start_date: dateFromRef.current,
      end_date: dateToRef.current,
    })
  ), [])

  const {
    paginatedItems: records, currentPage, totalPages, totalItems,
    startIndex, endIndex, loading, error, goToPage, resetPage, refresh,
  } = useServerPagination<WithdrawalRecord>(fetchWithdrawals, { pageSize: 20 })

  useEffect(() => {
    customerApi.light().then(setCustomers).catch(() => {})
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      nicknameRef.current = searchNickname.trim()
      resetPage()
    }, 250)
    return () => window.clearTimeout(timer)
  }, [searchNickname, resetPage])

  const handleDateFromChange = (value: string) => {
    setDateFrom(value)
    dateFromRef.current = value
    resetPage()
  }

  const handleDateToChange = (value: string) => {
    setDateTo(value)
    dateToRef.current = value
    resetPage()
  }

  const handleStatusChange = (value: string) => {
    setStatus(value)
    statusRef.current = value
    resetPage()
  }

  const handleCancel = async () => {
    if (!cancelTarget || cancelling) return
    setCancelling(true)
    try {
      await classRecordApi.cancelWithdrawal(cancelTarget.record_id, cancelTarget.customer_id)
      setCancelTarget(null)
      refresh()
    } catch (reason) {
      alert(reason instanceof Error ? reason.message : "取消退课失败")
    } finally {
      setCancelling(false)
    }
  }

  const handleClear = () => {
    setSearchNickname("")
    setDateFrom("")
    setDateTo("")
    setStatus("all")
    nicknameRef.current = ""
    dateFromRef.current = ""
    dateToRef.current = ""
    statusRef.current = "all"
    resetPage()
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[4px] bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-[#f0f0f0] px-4 py-2.5">
          <div className="w-[172px]">
            <CustomerSearchInput
              customers={customers}
              value={searchNickname}
              onChange={(value) => setSearchNickname(typeof value === "string" ? value : value[0] || "")}
              placeholder="搜索客户"
              filterSelected={false}
              className="border-[#dee0e3] bg-white px-2.5 placeholder:text-[#c0c4cc]"
              rounded="4px"
            />
          </div>
          <div className="flex h-8 items-center overflow-hidden rounded-[4px] border border-[#dee0e3]">
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => handleDateFromChange(event.target.value)}
              className={`h-full border-none bg-transparent px-2 text-[12px] outline-none ${dateFrom ? "text-[#2b2f36]" : "date-empty text-[#8f959e]"}`}
            />
            <span className="px-1 text-[12px] text-[#8f959e]">~</span>
            <input
              type="date"
              value={dateTo}
              onChange={(event) => handleDateToChange(event.target.value)}
              className={`h-full border-none bg-transparent px-2 text-[12px] outline-none ${dateTo ? "text-[#2b2f36]" : "date-empty text-[#8f959e]"}`}
            />
          </div>
          <SelectDropdown
            className="w-[116px]"
            buttonClassName="border-[#dee0e3] bg-white px-2.5"
            rounded="4px"
            value={status}
            options={STATUS_OPTIONS}
            textColor={status === "all" ? "text-[#8f959e]" : "text-[#2b2f36]"}
            onChange={handleStatusChange}
          />
          <button type="button" onClick={handleClear} className="flex h-8 items-center gap-1 rounded-[4px] border border-[#dee0e3] bg-white px-4 text-[12px] text-[#4e535a] hover:bg-[#f5f6f7]">
            <X className="h-3.5 w-3.5" />清空
          </button>
          <span className="ml-auto text-[12px] tabular-nums text-[#8f959e]">共 {totalItems} 条退课记录</span>
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-[#8f959e]">加载中...</div>
        ) : error ? (
          <div className="py-16 text-center text-sm text-[#c4506a]">{error}</div>
        ) : records.length === 0 ? (
          <div className="py-16 text-center text-sm text-[#8f959e]">暂无退课记录</div>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto">
            <Table style={{ tableLayout: "fixed" }}>
              <TableHeader className="sticky top-0 z-10">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-4" style={{ width: "120px" }}>客户</TableHead>
                  <TableHead style={{ width: "210px" }}>课程</TableHead>
                  <TableHead style={{ width: "140px" }}>上课时间</TableHead>
                  <TableHead style={{ width: "150px" }}>所属空间</TableHead>
                  <TableHead className="text-right" style={{ width: "90px" }}>退回卡次</TableHead>
                  <TableHead style={{ width: "180px" }}>办理信息</TableHead>
                  <TableHead style={{ width: "120px" }}>状态</TableHead>
                  <TableHead className="pr-4 text-right" style={{ width: "100px" }}>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((record) => {
                  const time = [record.start_time, record.end_time].filter(Boolean).join(" - ")
                  const space = [record.space_name, record.room_name].filter(Boolean).join(" · ")
                  const courseMeta = [record.course_type, record.course_deleted ? "课程已删除" : ""].filter(Boolean).join(" · ")
                  return (
                    <TableRow key={record.id} className="group">
                      <TableCell className="pl-4"><span className="block truncate text-[13px] font-medium text-[#1f2329]" title={record.nickname}>{record.nickname || <EmptyValue />}</span></TableCell>
                      <TableCell>
                        <span className="block truncate text-[13px] text-[#2b2f36]" title={record.activity_name}>{record.activity_name || <EmptyValue />}</span>
                        <span className="mt-0.5 block truncate text-[12px] text-[#8f959e]">{courseMeta || <EmptyValue />}</span>
                      </TableCell>
                      <TableCell>
                        <span className="block text-[13px] tabular-nums text-[#2b2f36]">{record.course_date}</span>
                        <span className="mt-0.5 block text-[12px] tabular-nums text-[#8f959e]">{time || <EmptyValue />}</span>
                      </TableCell>
                      <TableCell><span className="block truncate text-[13px] text-[#2b2f36]" title={space}>{space || <EmptyValue />}</span></TableCell>
                      <TableCell className="text-right text-[13px] tabular-nums text-[#2b2f36]">{record.restored_count > 0 ? `${record.restored_count} 次` : <EmptyValue />}</TableCell>
                      <TableCell>
                        <span className="block truncate text-[13px] text-[#2b2f36]">{record.withdrawn_by || "历史记录"}</span>
                        <span className="mt-0.5 block text-[12px] tabular-nums text-[#8f959e]">{formatDateTime(record.withdrawn_at)}</span>
                      </TableCell>
                      <TableCell>
                        {record.status === "active" ? <span className="text-[13px] text-[#3370ff]">已退课</span> : (
                          <div title={`${record.cancelled_by || "未知人员"} · ${formatDateTime(record.cancelled_at)}`}>
                            <span className="block text-[13px] text-[#8f959e]">已取消</span>
                            <span className="mt-0.5 block truncate text-[12px] text-[#8f959e]">{record.cancelled_by || <EmptyValue />}</span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="pr-4 text-right">
                        {record.status === "active" ? (
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-[12px] text-[#3370ff] opacity-0 transition-opacity group-hover:opacity-100" onClick={() => setCancelTarget(record)}>取消退课</Button>
                        ) : <EmptyValue />}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}

        <PaginationBar currentPage={currentPage} totalPages={totalPages} totalItems={totalItems} startIndex={startIndex} endIndex={endIndex} onPageChange={goToPage} />
      </div>

      <AlertDialog open={!!cancelTarget} onOpenChange={(open) => { if (!open && !cancelling) setCancelTarget(null) }}>
        <AlertDialogContent className="w-[400px] max-w-[90vw] gap-0 p-0">
          <AlertDialogHeader className="border-b border-[#f0f0f0] px-5 py-3">
            <AlertDialogTitle className="text-[14px] font-normal text-[#1f2329]">取消退课</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogDescription className="px-5 py-4 text-[13px] leading-6 text-[#4e535a]">
            确定恢复 {cancelTarget?.nickname} 在「{cancelTarget?.activity_name}」中的参与状态吗？
            {cancelTarget && cancelTarget.restored_count > 0 ? ` 已退回的 ${cancelTarget.restored_count} 次卡次将按原课程规则重新扣除。` : " 系统会按原课程规则重新计算卡次。"}
          </AlertDialogDescription>
          <AlertDialogFooter className="border-t border-[#f0f0f0] px-5 py-3">
            <AlertDialogCancel disabled={cancelling} className="h-8 rounded-[4px] text-[12px]">取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancel} disabled={cancelling} className="h-8 rounded-[4px] text-[12px]">{cancelling ? "处理中..." : "确认恢复"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
