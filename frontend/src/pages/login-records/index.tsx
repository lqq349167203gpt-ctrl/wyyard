import { useCallback, useEffect, useRef, useState } from "react"
import { X } from "lucide-react"

import { PaginationBar } from "@/components/pagination-bar"
import { SelectDropdown } from "@/components/select-dropdown"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useServerPagination } from "@/hooks/use-server-pagination"
import {
  loginRecordApi,
  type AccountActivityRecord,
  type AccountActivityType,
  type LoginAccountSummary,
} from "@/lib/api"

const PAGE_SIZE = 20

const SOURCE_LABELS: Record<string, string> = {
  pc: "PC端",
  miniprogram: "管理员小程序",
}

const EVENT_LABELS: Record<AccountActivityType, string> = {
  login: "登录",
  page_view: "访问页面",
  operation: "业务操作",
  usage: "使用时长",
}

const EVENT_COLORS: Record<AccountActivityType, string> = {
  login: "text-[#3370ff]",
  page_view: "text-[#4e535a]",
  operation: "text-[#c4506a]",
  usage: "text-[#3370ff]",
}

const formatDateTime = (value: string | null) => {
  if (!value) return ""
  return new Date(value).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
}

const EmptyValue = () => <span className="text-[#d0d3d6]">-</span>

const formatDuration = (seconds: number) => {
  const value = Math.max(0, Math.round(seconds || 0))
  if (value < 60) return value > 0 ? `${value}秒` : "-"
  const hours = Math.floor(value / 3600)
  const minutes = Math.floor((value % 3600) / 60)
  if (hours > 0) return minutes > 0 ? `${hours}小时${minutes}分钟` : `${hours}小时`
  return `${minutes}分钟`
}

export default function LoginRecordsPage() {
  const [summary, setSummary] = useState<LoginAccountSummary[]>([])
  const [summaryLoading, setSummaryLoading] = useState(true)
  const [accountId, setAccountId] = useState("")
  const [eventType, setEventType] = useState("")
  const [source, setSource] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [keyword, setKeyword] = useState("")
  const filtersRef = useRef({ accountId, eventType, source, dateFrom, dateTo, keyword })

  useEffect(() => {
    loginRecordApi.summary()
      .then(setSummary)
      .finally(() => setSummaryLoading(false))
  }, [])

  const fetchRecords = useCallback(async (page: number, pageSize: number) => {
    const filters = filtersRef.current
    return loginRecordApi.listPaginated({
      account_id: filters.accountId || undefined,
      event_type: (filters.eventType || undefined) as AccountActivityType | undefined,
      source: (filters.source || undefined) as "pc" | "miniprogram" | undefined,
      date_from: filters.dateFrom || undefined,
      date_to: filters.dateTo || undefined,
      keyword: filters.keyword || undefined,
    }, page, pageSize)
  }, [])

  const {
    paginatedItems: records,
    currentPage,
    totalPages,
    totalItems,
    goToPage,
    startIndex,
    endIndex,
    loading,
  } = useServerPagination<AccountActivityRecord>(fetchRecords, { pageSize: PAGE_SIZE })

  const updateFilter = (field: keyof typeof filtersRef.current, value: string) => {
    filtersRef.current = { ...filtersRef.current, [field]: value }
    if (field === "accountId") setAccountId(value)
    if (field === "eventType") setEventType(value)
    if (field === "source") setSource(value)
    if (field === "dateFrom") setDateFrom(value)
    if (field === "dateTo") setDateTo(value)
    if (field === "keyword") setKeyword(value)
    goToPage(1)
  }

  const clearFilters = () => {
    const empty = { accountId: "", eventType: "", source: "", dateFrom: "", dateTo: "", keyword: "" }
    filtersRef.current = empty
    setAccountId("")
    setEventType("")
    setSource("")
    setDateFrom("")
    setDateTo("")
    setKeyword("")
    goToPage(1)
  }

  return (
    <div className="px-6 pt-4 pb-6 space-y-5">
      <div>
        <h1 className="text-lg font-medium text-[#1f2329]">使用统计</h1>
        <p className="mt-1 text-[12px] text-[#8f959e]">查看账号登录、页面访问及业务操作轨迹</p>
      </div>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-[14px] font-medium text-[#2b2f36]">使用统计</h2>
          <span className="text-[12px] text-[#8f959e]">按北京时间统计，5 分钟无操作后暂停计时</span>
        </div>
        <div className="overflow-hidden border border-[#e8e8e8] rounded-[4px]">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">使用人</TableHead>
                <TableHead className="text-right">今日时长</TableHead>
                <TableHead className="text-right">本月时长</TableHead>
                <TableHead className="text-right">今日登录</TableHead>
                <TableHead className="text-right">本月登录</TableHead>
                <TableHead>最近登录时间</TableHead>
                <TableHead>最近登录 IP</TableHead>
                <TableHead className="pr-4">最近登录端</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!summaryLoading && summary.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-16 text-center text-[13px] text-[#8f959e]">暂无账号</TableCell>
                </TableRow>
              ) : summary.map((item) => (
                <TableRow
                  key={item.account_id}
                  className={`cursor-pointer ${accountId === item.account_id ? "bg-[#f7f8fa]" : ""}`}
                  onClick={() => updateFilter("accountId", accountId === item.account_id ? "" : item.account_id)}
                >
                  <TableCell className="pl-4 font-medium text-[#1f2329]">{item.owner || <EmptyValue />}</TableCell>
                  <TableCell className="text-right font-medium text-[#1f2329] tabular-nums">{item.today_usage_seconds > 0 ? formatDuration(item.today_usage_seconds) : <EmptyValue />}</TableCell>
                  <TableCell className="text-right font-medium text-[#1f2329] tabular-nums">{item.month_usage_seconds > 0 ? formatDuration(item.month_usage_seconds) : <EmptyValue />}</TableCell>
                  <TableCell className="text-right text-[#646a73] tabular-nums">{item.today_count}</TableCell>
                  <TableCell className="text-right text-[#646a73] tabular-nums">{item.month_count}</TableCell>
                  <TableCell className="text-[12px] text-[#8f959e]">{item.latest_login_at ? formatDateTime(item.latest_login_at) : <EmptyValue />}</TableCell>
                  <TableCell className="font-mono text-[12px]">{item.latest_ip || <EmptyValue />}</TableCell>
                  <TableCell className="pr-4">{item.latest_source ? (SOURCE_LABELS[item.latest_source] || item.latest_source) : <EmptyValue />}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-[14px] font-medium text-[#2b2f36]">访问、使用与操作明细</h2>
        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-[12px] text-[#8f959e]">使用人</label>
            <SelectDropdown
              value={accountId}
              options={[{ value: "", label: "全部" }, ...summary.map(item => ({
                value: item.account_id,
                label: item.owner || "未设置姓名",
              }))]}
              onChange={(value) => updateFilter("accountId", value)}
              className="w-40"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[12px] text-[#8f959e]">记录类型</label>
            <SelectDropdown
              value={eventType}
              options={[
                { value: "", label: "全部" },
                { value: "login", label: "登录" },
                { value: "page_view", label: "访问页面" },
                { value: "operation", label: "业务操作" },
                { value: "usage", label: "使用时长" },
              ]}
              onChange={(value) => updateFilter("eventType", value)}
              className="w-28"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[12px] text-[#8f959e]">登录端</label>
            <SelectDropdown
              value={source}
              options={[
                { value: "", label: "全部" },
                { value: "pc", label: "PC端" },
                { value: "miniprogram", label: "管理员小程序" },
              ]}
              onChange={(value) => updateFilter("source", value)}
              className="w-36"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[12px] text-[#8f959e]">日期范围</label>
            <div className="flex items-center h-8 rounded-[4px] border border-input overflow-hidden">
              <input
                type="date"
                value={dateFrom}
                onChange={(event) => updateFilter("dateFrom", event.target.value)}
                className={`h-full px-2 text-[12px] border-none outline-none bg-transparent ${dateFrom ? "text-[#2b2f36]" : "text-[#8f959e] date-empty"}`}
              />
              <span className="px-1 text-[12px] text-[#8f959e]">~</span>
              <input
                type="date"
                value={dateTo}
                onChange={(event) => updateFilter("dateTo", event.target.value)}
                className={`h-full px-2 text-[12px] border-none outline-none bg-transparent ${dateTo ? "text-[#2b2f36]" : "text-[#8f959e] date-empty"}`}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[12px] text-[#8f959e]">内容搜索</label>
            <input
              value={keyword}
              onChange={(event) => updateFilter("keyword", event.target.value)}
              placeholder="页面或操作内容"
              className="h-8 w-40 rounded-[4px] border border-input px-2.5 text-[12px] text-[#2b2f36] outline-none placeholder:text-[#c0c4cc] focus:border-[#3370ff]"
            />
          </div>
          <button
            onClick={clearFilters}
            className="h-8 px-4 rounded-[4px] border border-input text-[12px] text-[#4e535a] hover:bg-[#f5f6f7] flex items-center gap-1"
          >
            <X className="h-3.5 w-3.5" /> 清空
          </button>
        </div>

        <div className="overflow-hidden border border-[#e8e8e8] rounded-[4px]">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4 w-[150px]">时间</TableHead>
                <TableHead className="w-[110px]">使用人</TableHead>
                <TableHead className="w-[90px]">类型</TableHead>
                <TableHead className="w-[118px]">页面</TableHead>
                <TableHead>具体内容</TableHead>
                <TableHead className="w-[110px]">登录端</TableHead>
                <TableHead className="pr-4 w-[120px]">IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!loading && records.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-16 text-center text-[13px] text-[#8f959e]">暂无访问、使用或操作记录</TableCell>
                </TableRow>
              ) : records.map((record) => (
                <TableRow key={record.id}>
                  <TableCell className="pl-4 text-[12px] text-[#8f959e] tabular-nums">{formatDateTime(record.created_at)}</TableCell>
                  <TableCell className="font-medium text-[#1f2329]">{record.owner || <EmptyValue />}</TableCell>
                  <TableCell className={EVENT_COLORS[record.event_type]}>{EVENT_LABELS[record.event_type]}</TableCell>
                  <TableCell>{record.page_name || <EmptyValue />}</TableCell>
                  <TableCell className="max-w-[440px]">
                    <div className="flex min-w-0 items-center gap-2" title={record.content}>
                      <span className="truncate">{record.content || <EmptyValue />}</span>
                      {record.duration_seconds > 0 && (
                        <span className="shrink-0 text-[12px] text-[#8f959e] tabular-nums">
                          · 活跃 {formatDuration(record.duration_seconds)}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{SOURCE_LABELS[record.source] || record.source || <EmptyValue />}</TableCell>
                  <TableCell className="pr-4 font-mono text-[12px]">{record.ip || <EmptyValue />}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <PaginationBar
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={totalItems}
          startIndex={startIndex}
          endIndex={endIndex}
          onPageChange={goToPage}
        />
      </section>
    </div>
  )
}
