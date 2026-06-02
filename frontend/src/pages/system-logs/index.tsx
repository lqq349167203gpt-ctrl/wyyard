import { useState, useCallback, useRef } from "react"
import { Search, X } from "lucide-react"
import { systemLogApi } from "@/lib/api"
import { SelectDropdown } from "@/components/select-dropdown"
import type { SystemLog } from "@/lib/api"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useServerPagination } from "@/hooks/use-server-pagination"
import { PaginationBar } from "@/components/pagination-bar"

const PAGE_SIZE = 20

const METHOD_LABELS: Record<string, string> = {
  POST: "新增",
  PUT: "更新",
  PATCH: "更新",
  DELETE: "删除",
  GET: "查询",
}

const METHOD_COLORS: Record<string, string> = {
  POST: "bg-green-50 text-green-600",
  PUT: "bg-blue-50 text-blue-600",
  PATCH: "bg-blue-50 text-blue-600",
  DELETE: "bg-red-50 text-red-600",
  GET: "bg-gray-50 text-gray-600",
}

export default function SystemLogsPage() {
  const [operatorFilter, setOperatorFilter] = useState("")
  const [methodFilter, setMethodFilter] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [selectedLog, setSelectedLog] = useState<SystemLog | null>(null)
  const filtersRef = useRef({ operatorFilter, methodFilter, dateFrom, dateTo })

  const fetchLogs = useCallback(async (page: number, pageSize: number) => {
    const f = filtersRef.current
    return systemLogApi.listPaginated({
      operator: f.operatorFilter || undefined,
      method: f.methodFilter || undefined,
      date_from: f.dateFrom || undefined,
      date_to: f.dateTo || undefined,
    }, page, pageSize)
  }, [])

  const {
    paginatedItems: pagedLogs, currentPage, totalPages, totalItems,
    goToPage, startIndex, endIndex, loading,
  } = useServerPagination<SystemLog>(fetchLogs, { pageSize: PAGE_SIZE })

  const handleSearch = () => {
    filtersRef.current = { operatorFilter, methodFilter, dateFrom, dateTo }
    goToPage(1)
  }

  const handleClear = () => {
    setOperatorFilter("")
    setMethodFilter("")
    setDateFrom("")
    setDateTo("")
    filtersRef.current = { operatorFilter: "", methodFilter: "", dateFrom: "", dateTo: "" }
    goToPage(1)
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
  }

  const formatDay = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
    })
  }

  // 按天分组
  const groupByDay = (items: SystemLog[]) => {
    const groups: { day: string; items: SystemLog[] }[] = []
    let currentDay = ""
    for (const log of items) {
      const day = new Date(log.created_at).toLocaleDateString("zh-CN")
      if (day !== currentDay) {
        currentDay = day
        groups.push({ day: log.created_at, items: [] })
      }
      groups[groups.length - 1].items.push(log)
    }
    return groups
  }

  const dayGroups = groupByDay(pagedLogs)

  const renderSnapshot = (data: Record<string, unknown> | null, label: string) => {
    if (!data) return null
    return (
      <div>
        <div className="text-xs font-medium text-[#8f959e] mb-1">{label}</div>
        <pre className="text-xs bg-[#f7f8fa] p-3 rounded-md overflow-auto max-h-60 whitespace-pre-wrap break-all">
          {JSON.stringify(data, null, 2)}
        </pre>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-lg font-semibold">系统日志</h1>
        <p className="text-xs text-muted-foreground mt-0.5">记录系统运行事件</p>
      </div>

      {/* 筛选栏 */}
      <div className="flex items-end gap-3 flex-wrap">
        <div className="flex flex-col gap-1">
          <label className="text-[12px] text-[#8f959e]">操作人</label>
          <input
            type="text"
            value={operatorFilter}
            onChange={(e) => setOperatorFilter(e.target.value)}
            placeholder="输入用户名"
            className="h-8 w-36 rounded-md border border-[#e0e0e0] px-2.5 text-[12px] outline-none focus:border-[#3370ff] placeholder:text-[#c0c4cc]"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[12px] text-[#8f959e]">操作类型</label>
          <SelectDropdown
            value={methodFilter}
            options={[{value: "", label: "全部"}, {value: "POST", label: "新增"}, {value: "PUT", label: "更新"}, {value: "DELETE", label: "删除"}]}
            placeholder="全部"
            onChange={(v) => setMethodFilter(v)}
            className="w-28"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[12px] text-[#8f959e]">开始日期</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className={`h-8 w-36 rounded-md border border-[#e0e0e0] px-2.5 text-[12px] outline-none focus:border-[#3370ff] ${!dateFrom ? "text-[#8f959e] date-empty" : "text-[#2b2f36]"}`}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[12px] text-[#8f959e]">结束日期</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className={`h-8 w-36 rounded-md border border-[#e0e0e0] px-2.5 text-[12px] outline-none focus:border-[#3370ff] ${!dateTo ? "text-[#8f959e] date-empty" : "text-[#2b2f36]"}`}
          />
        </div>
        <button
          onClick={handleSearch}
          className="h-8 px-4 rounded-md bg-[#3370ff] text-white text-[12px] hover:bg-[#2860e1] flex items-center gap-1"
        >
          <Search className="h-3.5 w-3.5" />
          查询
        </button>
        <button
          onClick={handleClear}
          className="h-8 px-4 rounded-md border border-[#e0e0e0] text-[12px] text-[#4e535a] hover:bg-[#f5f6f7] flex items-center gap-1"
        >
          <X className="h-3.5 w-3.5" />
          清空
        </button>
      </div>

      {/* 日志列表 */}
      {!loading && totalItems === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">暂无系统日志</div>
      ) : (
        <>
          <div className="space-y-4">
            {dayGroups.map((group) => (
              <div key={group.day} className="bg-white rounded-lg border border-[#e8e8e8] overflow-hidden">
                <div className="px-4 py-2 bg-[#f7f8fa] border-b border-[#e8e8e8] text-[12px] text-[#8f959e] font-medium">
                  {formatDay(group.day)}
                </div>
                <div>
                  {group.items.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-center gap-3 px-4 py-2.5 border-b border-[#f0f0f0] last:border-b-0 hover:bg-[#fafafa] cursor-pointer"
                      onClick={() => setSelectedLog(log)}
                    >
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 ${
                          METHOD_COLORS[log.method] || "bg-gray-50 text-gray-600"
                        }`}
                      >
                        {METHOD_LABELS[log.method] || log.method}
                      </span>
                      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-600 shrink-0">
                        {log.section}
                      </span>
                      <span className="flex-1 text-[13px] text-[#2b2b2b] truncate">{log.content}</span>
                      {log.operator && (
                        <span className="text-[11px] text-[#8f959e] shrink-0">{log.operator}</span>
                      )}
                      <span className="text-[11px] text-[#b0b5bb] shrink-0">{formatDate(log.created_at)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <PaginationBar
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            startIndex={startIndex}
            endIndex={endIndex}
            onPageChange={goToPage}
          />
        </>
      )}

      {/* 详情弹窗 */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>日志详情</DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4 text-[13px]">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-[#8f959e]">操作人：</span>
                  <span className="text-[#2b2b2b]">{selectedLog.operator || "-"}</span>
                </div>
                <div>
                  <span className="text-[#8f959e]">角色：</span>
                  <span className="text-[#2b2b2b]">{selectedLog.operator_role || "-"}</span>
                </div>
                <div>
                  <span className="text-[#8f959e]">操作类型：</span>
                  <span className="text-[#2b2b2b]">{METHOD_LABELS[selectedLog.method] || selectedLog.method}</span>
                </div>
                <div>
                  <span className="text-[#8f959e]">板块：</span>
                  <span className="text-[#2b2b2b]">{selectedLog.section}</span>
                </div>
                <div>
                  <span className="text-[#8f959e]">请求路径：</span>
                  <span className="text-[#2b2b2b] break-all">{selectedLog.path}</span>
                </div>
                <div>
                  <span className="text-[#8f959e]">实体 ID：</span>
                  <span className="text-[#2b2b2b]">{selectedLog.entity_id || "-"}</span>
                </div>
                <div>
                  <span className="text-[#8f959e]">IP：</span>
                  <span className="text-[#2b2b2b]">{selectedLog.ip || "-"}</span>
                </div>
                <div>
                  <span className="text-[#8f959e]">时间：</span>
                  <span className="text-[#2b2b2b]">{formatDate(selectedLog.created_at)}</span>
                </div>
              </div>
              <div>
                <span className="text-[#8f959e]">操作内容：</span>
                <span className="text-[#2b2b2b]">{selectedLog.content}</span>
              </div>
              {renderSnapshot(selectedLog.before_data, "修改前数据")}
              {renderSnapshot(selectedLog.after_data, "修改后数据")}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
