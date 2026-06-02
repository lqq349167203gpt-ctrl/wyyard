import { useEffect, useState, useCallback, useRef } from "react"
import { Search, X } from "lucide-react"
import { operationLogApi, accountApi, customerApi } from "@/lib/api"
import { SelectDropdown } from "@/components/select-dropdown"
import type { OperationLog, Account, Customer } from "@/lib/api"
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

const FIELD_CN: Record<string, string> = {
  nickname: "昵称", name: "名称", title: "标题", username: "用户名",
  phone: "电话", wechat: "微信", gender: "性别", age: "年龄",
  member_type: "会员类型", member_identity: "会员身份",
  note: "备注", description: "描述", content: "内容",
  status: "状态", date: "日期", start_time: "开始时间", end_time: "结束时间",
  teacher_ids: "老师", course_name: "沙龙名称", course_type: "课程类型",
  owner_name: "案主", host_name: "主持人", host_names: "主持人",
  participant_ids: "参与者", achiever_name: "成就君",
  leader_id: "组长", deputy_id: "副组长", member_ids: "成员",
  price: "价格", amount: "金额", count: "次数",
  sort_order: "排序", is_public_welfare: "公益",
  arrived: "到店", arrival_time: "到店时间", experience: "客户反馈", feedback: "疗愈师回复",
  referrer: "引流人", traffic_source: "流量来源",
  basic_info: "基础信息", assessment: "客户评估", tags: "标签",
  visit_count: "到店次数", paid_content: "付费内容",
  positions: "疗愈身份", role: "角色", permissions: "权限",
  groups: "分组", materials: "资料", images: "图片",
  location: "地点", address: "地址",
  start_date: "开始日期", end_date: "结束日期",
  remaining_count: "剩余次数", card_type: "卡类型",
  customer_id: "客户", space_id: "空间", room_id: "房间",
  owner_id: "案主", space_name: "空间名称",
  core_situation: "核心情况", need_tags: "需求标签",
  follow_up_node: "跟进节点", follow_up_action: "跟进动作",
  tracking_plan: "跟进计划", self_tags: "个人标签",
}

export default function OperationLogsPage() {
  const [operatorFilter, setOperatorFilter] = useState("")
  const [methodFilter, setMethodFilter] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [selectedLog, setSelectedLog] = useState<OperationLog | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const filtersRef = useRef({ operatorFilter, methodFilter, dateFrom, dateTo })

  const fetchLogs = useCallback(async (page: number, pageSize: number) => {
    const f = filtersRef.current
    return operationLogApi.listPaginated({
      operator: f.operatorFilter || undefined,
      method: f.methodFilter || undefined,
      date_from: f.dateFrom || undefined,
      date_to: f.dateTo || undefined,
    }, page, pageSize)
  }, [])

  const {
    paginatedItems: pagedLogs, currentPage, totalPages, totalItems,
    goToPage, startIndex, endIndex, loading,
  } = useServerPagination<OperationLog>(fetchLogs, { pageSize: PAGE_SIZE })

  useEffect(() => {
    accountApi.list().then(setAccounts).catch(() => {})
    customerApi.list().then(setCustomers).catch(() => {})
  }, [])

  const getNameById = (id: string) => {
    const c = customers.find(c => c.id === id)
    return c?.nickname || c?.name || id
  }

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
  const groupByDay = (items: OperationLog[]) => {
    const groups: { day: string; items: OperationLog[] }[] = []
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

  const renderChanges = (before: Record<string, unknown> | null, after: Record<string, unknown> | null) => {
    if (!after || !before) return null

    const skipKeys = ["id", "created_at", "updated_at", "is_deleted", "deleted_at"]
    // 跳过 _id 字段（当对应的 _name 也存在时），避免案主/主持人/成交人 等重复显示
    const idNamePairs: Record<string, string> = {
      owner_id: "owner_name", host_id: "host_name", closer_id: "closer_name",
    }
    const allKeys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]))
    const changedKeys = allKeys.filter(k => {
      if (skipKeys.includes(k)) return false
      // Skip _id when _name also present in either before or after
      const nameKey = idNamePairs[k]
      if (nameKey && ((before[nameKey] !== undefined) || (after[nameKey] !== undefined))) return false
      return JSON.stringify(before[k]) !== JSON.stringify(after[k])
    })

    if (changedKeys.length === 0) return null

    return (
      <div>
        <div className="text-xs font-medium text-[#8f959e] mb-1.5">变更详情</div>
        <div className="text-xs bg-[#f7f8fa] rounded-md overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#e8e8e8]">
                <th className="text-left px-3 py-2 text-[11px] text-[#8f959e] font-medium w-20">字段</th>
                <th className="text-left px-3 py-2 text-[11px] text-[#8f959e] font-medium">修改前</th>
                <th className="text-left px-3 py-2 text-[11px] text-[#6385ec] font-medium">修改后</th>
              </tr>
            </thead>
            <tbody>
              {changedKeys.map((key, i) => {
                return (
                  <tr key={key} className={i < changedKeys.length - 1 ? "border-b border-[#f0f0f0]" : ""}>
                    <td className="px-3 py-2 text-[#8f959e] whitespace-nowrap">{FIELD_CN[key] || key}</td>
                    <td className="px-3 py-2 align-top">
                      <pre className="whitespace-pre-wrap break-all font-sans text-[#2b2b2b]">{formatCellValue(before[key]) || "-"}</pre>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <pre className="whitespace-pre-wrap break-all font-sans text-[#2b2b2b]">{formatCellValue(after[key]) || "-"}</pre>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  const resolveIdsInString = (s: string): string => {
    // Replace all 8+ char hex IDs with customer names
    return s.replace(/[0-9a-f]{8,}(?:-[0-9a-f]{4,})*/gi, (match) => getNameById(match))
  }

  const formatCellValue = (val: unknown): string => {
    if (val === null || val === undefined) return ""
    if (typeof val === "boolean") return val ? "是" : "否"
    if (Array.isArray(val)) {
      if (val.length === 0) return "（空）"
      return val.map(v => {
        if (typeof v === "object" && v !== null) return resolveIdsInString(JSON.stringify(v))
        const s = String(v)
        if (s.length >= 8 && /^[0-9a-f-]+$/i.test(s)) return getNameById(s)
        return s
      }).join("、")
    }
    if (typeof val === "object") return resolveIdsInString(JSON.stringify(val, null, 2))
    const s = String(val)
    if (s.length >= 8 && /^[0-9a-f-]+$/i.test(s)) return getNameById(s)
    return s
  }

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-lg font-semibold">操作日志</h1>
        <p className="text-xs text-muted-foreground mt-0.5">记录每个账号对系统的操作</p>
      </div>

      {/* 筛选栏 */}
      <div className="flex items-end gap-3 flex-wrap">
        <div className="flex flex-col gap-1">
          <label className="text-[12px] text-[#8f959e]">归属人</label>
          <SelectDropdown
            value={operatorFilter}
            options={[{value: "", label: "全部"}, ...[...new Set(accounts.map(a => a.owner))].sort().map(o => ({value: o, label: o}))]}
            placeholder="全部"
            onChange={(v) => setOperatorFilter(v)}
            className="w-36"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[12px] text-[#8f959e]">操作类型</label>
          <SelectDropdown
            value={methodFilter}
            options={[{value: "", label: "全部"}, {value: "POST", label: "新增"}, {value: "UPDATE", label: "更新"}, {value: "DELETE", label: "删除"}]}
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
        <div className="py-12 text-center text-sm text-muted-foreground">暂无操作记录</div>
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
                      <span className="flex-1 text-[13px] text-[#2b2b2b]">{log.content}</span>
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
            <DialogTitle>操作详情</DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4 text-[13px]">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-[#8f959e]">归属人：</span>
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
              {selectedLog.before_data || selectedLog.after_data
                ? renderChanges(selectedLog.before_data || {}, selectedLog.after_data || {})
                : null}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
