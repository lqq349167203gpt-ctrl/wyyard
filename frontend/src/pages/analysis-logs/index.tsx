import { useCallback, useRef, useState } from "react"
import { X } from "lucide-react"

import { PaginationBar } from "@/components/pagination-bar"
import { SelectDropdown } from "@/components/select-dropdown"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useServerPagination } from "@/hooks/use-server-pagination"
import { analysisLogApi, type AnalysisLog } from "@/lib/api"

const PAGE_SIZE = 20
const SOURCE_LABELS: Record<string, string> = {
  pc: "PC端",
  miniprogram: "管理端小程序",
}
const LOG_TYPE_LABELS: Record<AnalysisLog["log_type"], string> = {
  analysis_executed: "执行筛选",
  template_created: "保存模板",
  template_updated: "更新模板",
  template_deleted: "删除模板",
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function conditionSummary(log: AnalysisLog) {
  const conditions = log.config.筛选条件 ?? []
  if (!conditions.length) return "全部客户"
  return conditions.map(item => `${item.字段}${item.规则}${String(item.值 ?? "")}`).join("；")
}

function isTemplateLog(log: AnalysisLog) {
  return log.log_type !== "analysis_executed"
}

function recordSummary(log: AnalysisLog) {
  if (isTemplateLog(log)) {
    const description = log.config.模板简介
    return description && description !== "—" ? description : "未填写模板简介"
  }
  return `${log.config.时间范围 || "全部时间"} · ${conditionSummary(log)}`
}

function recordResult(log: AnalysisLog) {
  return isTemplateLog(log) ? (log.config.模板名称 || "-") : `${log.config.结果人数 ?? 0} 人`
}

export default function AnalysisLogsPage() {
  const [operator, setOperator] = useState("")
  const [source, setSource] = useState<"" | "pc" | "miniprogram">("")
  const [recordType, setRecordType] = useState<"" | "analysis" | "template">("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [operators, setOperators] = useState<string[]>([])
  const [selectedLog, setSelectedLog] = useState<AnalysisLog | null>(null)
  const filtersRef = useRef({ operator: "", source: "", recordType: "", dateFrom: "", dateTo: "" })

  const fetchLogs = useCallback(async (page: number, pageSize: number) => {
    const filters = filtersRef.current
    const response = await analysisLogApi.list({
      operator: filters.operator || undefined,
      source: (filters.source || undefined) as "pc" | "miniprogram" | undefined,
      record_type: (filters.recordType || undefined) as "analysis" | "template" | undefined,
      date_from: filters.dateFrom || undefined,
      date_to: filters.dateTo || undefined,
      page,
      page_size: pageSize,
    })
    setOperators(response.operators)
    return response
  }, [])

  const {
    paginatedItems,
    currentPage,
    totalPages,
    totalItems,
    startIndex,
    endIndex,
    loading,
    goToPage,
  } = useServerPagination<AnalysisLog>(fetchLogs, { pageSize: PAGE_SIZE })

  const updateFilter = (key: "operator" | "source" | "recordType" | "dateFrom" | "dateTo", value: string) => {
    filtersRef.current = { ...filtersRef.current, [key]: value }
    if (key === "operator") setOperator(value)
    if (key === "source") setSource(value as "" | "pc" | "miniprogram")
    if (key === "recordType") setRecordType(value as "" | "analysis" | "template")
    if (key === "dateFrom") setDateFrom(value)
    if (key === "dateTo") setDateTo(value)
    goToPage(1)
  }

  const clearFilters = () => {
    setOperator("")
    setSource("")
    setRecordType("")
    setDateFrom("")
    setDateTo("")
    filtersRef.current = { operator: "", source: "", recordType: "", dateFrom: "", dateTo: "" }
    goToPage(1)
  }

  return (
    <div className="space-y-4 px-6 pb-6 pt-12">
      <div>
        <h1 className="text-lg font-medium text-[#1f2329]">分析日志</h1>
        <p className="mt-1.5 text-[12px] text-[#8f959e]">查看每位使用者执行过的筛选，以及保存、更新或删除过的模板</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <div className="text-[12px] text-[#8f959e]">使用者</div>
          <SelectDropdown value={operator} options={[{ value: "", label: "全部" }, ...operators.map(item => ({ value: item, label: item }))]} onChange={value => updateFilter("operator", value)} className="w-32" />
        </div>
        <div className="space-y-1">
          <div className="text-[12px] text-[#8f959e]">使用端</div>
          <SelectDropdown value={source} options={[{ value: "", label: "全部" }, { value: "pc", label: "PC端" }, { value: "miniprogram", label: "管理端小程序" }]} onChange={value => updateFilter("source", value)} className="w-36" />
        </div>
        <div className="space-y-1">
          <div className="text-[12px] text-[#8f959e]">记录类型</div>
          <SelectDropdown value={recordType} options={[{ value: "", label: "全部" }, { value: "analysis", label: "执行筛选" }, { value: "template", label: "模板记录" }]} onChange={value => updateFilter("recordType", value)} className="w-36" />
        </div>
        <div className="space-y-1">
          <div className="text-[12px] text-[#8f959e]">查询日期</div>
          <div className="flex h-8 items-center overflow-hidden rounded-[4px] border border-input bg-white">
            <input type="date" value={dateFrom} onChange={event => updateFilter("dateFrom", event.target.value)} className={`h-full w-[126px] border-0 bg-transparent px-2 text-[12px] outline-none ${dateFrom ? "text-[#2b2f36]" : "date-empty text-[#8f959e]"}`} />
            <span className="text-[12px] text-[#8f959e]">~</span>
            <input type="date" value={dateTo} onChange={event => updateFilter("dateTo", event.target.value)} className={`h-full w-[126px] border-0 bg-transparent px-2 text-[12px] outline-none ${dateTo ? "text-[#2b2f36]" : "date-empty text-[#8f959e]"}`} />
          </div>
        </div>
        <button type="button" onClick={clearFilters} className="flex h-8 items-center gap-1 rounded-[4px] border border-input px-4 text-[12px] text-[#4e535a] hover:bg-[#f5f6f7]"><X className="h-3.5 w-3.5" />清空</button>
      </div>

      <div className="overflow-hidden rounded-[4px] border border-[#f0f0f0] bg-white">
        {loading ? <div className="py-16 text-center text-sm text-muted-foreground">加载中...</div> : paginatedItems.length === 0 ? <div className="py-16 text-center text-sm text-muted-foreground">暂无分析日志</div> : (
          <Table>
            <TableHeader><TableRow className="hover:bg-transparent"><TableHead className="pl-4">记录时间</TableHead><TableHead>使用者</TableHead><TableHead>使用端</TableHead><TableHead>记录类型</TableHead><TableHead className="w-[38%]">记录内容</TableHead><TableHead className="text-right pr-4">结果 / 模板</TableHead></TableRow></TableHeader>
            <TableBody>{paginatedItems.map(log => <TableRow key={log.id} className="group cursor-pointer" onClick={() => setSelectedLog(log)}><TableCell className="pl-4 text-[12px] text-[#8f959e] tabular-nums">{formatDate(log.created_at)}</TableCell><TableCell className="text-[13px] font-medium text-[#2b2f36]">{log.operator || <span className="text-[#d0d3d6]">-</span>}</TableCell><TableCell className="text-[12px] text-[#4e535a]">{SOURCE_LABELS[log.source] || log.source}</TableCell><TableCell className="text-[12px] text-[#4e535a]">{LOG_TYPE_LABELS[log.log_type]}</TableCell><TableCell><span className="block truncate text-[12px] text-[#4e535a]" title={recordSummary(log)}>{recordSummary(log)}</span></TableCell><TableCell className="max-w-[180px] truncate pr-4 text-right text-[13px] text-[#2b2f36] tabular-nums" title={recordResult(log)}>{recordResult(log)}</TableCell></TableRow>)}</TableBody>
          </Table>
        )}
        <PaginationBar currentPage={currentPage} totalPages={totalPages} totalItems={totalItems} startIndex={startIndex} endIndex={endIndex} onPageChange={goToPage} />
      </div>

      <Dialog open={!!selectedLog} onOpenChange={open => { if (!open) setSelectedLog(null) }}>
        <DialogContent className="max-h-[82vh] w-[620px] max-w-[92vw] gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b border-[#f0f0f0] px-6 pb-2 pt-3"><DialogTitle className="text-[14px] font-normal">分析记录详情</DialogTitle></DialogHeader>
          {selectedLog && <div className="space-y-4 overflow-y-auto px-6 py-4 text-[12px]">
            <div className="grid grid-cols-[72px_1fr_72px_1fr] gap-x-3 gap-y-2"><span className="text-[#8f959e]">使用者</span><span className="text-[#2b2f36]">{selectedLog.operator || "-"}</span><span className="text-[#8f959e]">使用端</span><span className="text-[#2b2f36]">{SOURCE_LABELS[selectedLog.source] || selectedLog.source}</span><span className="text-[#8f959e]">记录时间</span><span className="text-[#2b2f36]">{formatDate(selectedLog.created_at)}</span><span className="text-[#8f959e]">记录类型</span><span className="text-[#2b2f36]">{LOG_TYPE_LABELS[selectedLog.log_type]}</span></div>
            {isTemplateLog(selectedLog) ? <div className="grid grid-cols-[72px_1fr] gap-x-3 gap-y-2 border-t border-[#f0f0f0] pt-3"><span className="text-[#8f959e]">模板名称</span><span className="text-[#2b2f36]">{selectedLog.config.模板名称 || "-"}</span><span className="text-[#8f959e]">模板简介</span><span className="break-words text-[#4e535a]">{selectedLog.config.模板简介 && selectedLog.config.模板简介 !== "—" ? selectedLog.config.模板简介 : "未填写"}</span><span className="text-[#8f959e]">可见范围</span><span className="text-[#2b2f36]">{selectedLog.config.可见范围 || "-"}</span><span className="text-[#8f959e]">筛选条件</span><span className="text-[#2b2f36] tabular-nums">{selectedLog.config.筛选条件数 ?? 0} 个</span><span className="text-[#8f959e]">统计指标</span><span className="text-[#4e535a]">{(selectedLog.config.统计指标 ?? []).join("、") || "-"}</span><span className="text-[#8f959e]">列表字段</span><span className="text-[#4e535a]">{(selectedLog.config.列表字段 ?? []).join("、") || "-"}</span></div> : <>
              <div className="border-t border-[#f0f0f0] pt-3"><div className="mb-2 font-medium text-[#2b2f36]">筛选范围</div><div className="grid grid-cols-[72px_1fr] gap-x-3 gap-y-2"><span className="text-[#8f959e]">时间范围</span><span>{selectedLog.config.时间范围 || "全部时间"}</span><span className="text-[#8f959e]">条件关系</span><span>{selectedLog.config.条件关系 || "全部符合"}</span><span className="text-[#8f959e]">结果人数</span><span className="tabular-nums">{selectedLog.config.结果人数 ?? 0} 人</span></div></div>
              <div><div className="mb-2 font-medium text-[#2b2f36]">筛选条件</div>{(selectedLog.config.筛选条件 ?? []).length ? <div className="overflow-hidden rounded-[4px] border border-[#f0f0f0]">{(selectedLog.config.筛选条件 ?? []).map((item, index) => <div key={`${item.字段}-${index}`} className="grid grid-cols-[110px_90px_1fr] border-b border-[#f0f0f0] px-3 py-2 last:border-b-0"><span className="text-[#2b2f36]">{item.字段}</span><span className="text-[#8f959e]">{item.规则}</span><span className="break-all text-[#4e535a]">{String(item.值 ?? "-")}</span></div>)}</div> : <div className="text-[#8f959e]">未设置条件，查询全部客户</div>}</div>
              <div className="grid grid-cols-[72px_1fr] gap-x-3 gap-y-2 border-t border-[#f0f0f0] pt-3"><span className="text-[#8f959e]">统计指标</span><span>{(selectedLog.config.统计指标 ?? []).join("、") || "-"}</span><span className="text-[#8f959e]">拆分方式</span><span>{selectedLog.config.拆分方式 || "-"}</span><span className="text-[#8f959e]">显示字段</span><span>{(selectedLog.config.显示字段 ?? []).join("、") || "-"}</span><span className="text-[#8f959e]">排序方式</span><span>{selectedLog.config.排序方式 || "-"}</span></div>
            </>}
          </div>}
        </DialogContent>
      </Dialog>
    </div>
  )
}
