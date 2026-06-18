import { useEffect, useState, useCallback, useRef } from "react"
import { X } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { operationLogApi, accountApi, customerApi, organizationApi, positionPermissionApi, positionCustomerPermissionApi, memberIdentityApi } from "@/lib/api"
import { SelectDropdown } from "@/components/select-dropdown"
import type { OperationLog, Account, Customer, Organization } from "@/lib/api"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useServerPagination } from "@/hooks/use-server-pagination"
import { PaginationBar } from "@/components/pagination-bar"

const PAGE_SIZE = 20

const PAGE_LABELS: Record<string, string> = {
  "healing-records": "客户信息",
  "activity-records": "活动记录",
  "traffic-records": "引流记录",
  "class-records-visitors": "到场人员",
  "class-records-activities": "当日活动",
  "class-records-arrival": "到场确认",
  "daily-activities": "活动安排",
  "payment": "付费项目",
  "membership-cards": "会员卡",
  "group-cases": "觉醒游戏",
  "emotional-releases": "情绪释放",
  "energy-knots": "能量结",
  "internal-courses": "内部课程",
  "other-projects": "其他项目",
  "agents": "AI 配置",
  "business-reminders": "业务提醒",
  "system-logs": "系统日志",
  "operation-logs": "操作日志",
  "member-identities": "会员身份",
  "healing-identities": "疗愈老师",
  "position-management": "账号管理",
  "courses": "活动配置",
  "organizations": "组织管理",
  "spaces": "疗愈空间",
  "reminders": "提醒配置",
}

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
  nickname: "昵称", name: "名称", title: "标题", username: "用户名", owner: "归属人",
  phone: "电话", email: "邮箱", wechat: "微信", gender: "性别", age: "年龄", birthday: "生日",
  member_type: "会员类型", member_identity: "会员身份", healing_identity: "疗愈老师", activity_types: "活动类型",
  note: "备注", description: "描述", content: "内容", section: "板块",
  status: "状态", type: "类型", date: "日期", start_time: "开始时间", end_time: "结束时间",
  enabled: "启用状态",
  teacher_ids: "老师", teachers: "老师", course_name: "沙龙名称", course_type: "课程类型", course_description: "沙龙描述",
  owner_name: "案主", owner_id: "案主", host_name: "主持人", host_names: "主持人", host_id: "主持人", host_ids: "主持人",
  participant_ids: "参与者", achiever_name: "成就君", achiever_id: "成就君",
  leader_id: "组长", deputy_id: "副组长", member_ids: "成员",
  closer_name: "成交人", closer_id: "成交人",
  price: "价格", amount: "金额", count: "次数", total: "总计", class_count: "课时数",
  sort_order: "排序", is_public_welfare: "公益", category: "分类",
  arrived: "到店", arrival_time: "到店时间", experience: "客户反馈", feedback: "疗愈师回复",
  needs: "需求", activity_participation: "活动参与",
  visit_date: "到访日期", visit_time: "预计时间", visit_count: "到店次数",
  referrer: "引流人", traffic_source: "流量来源", paid_content: "付费内容",
  basic_info: "基础信息", assessment: "客户评估", tags: "标签", self_tags: "个人标签",
  work_status: "工作状态", work_description: "工作描述",
  positions: "疗愈老师", position: "职位", role: "角色", permissions: "权限",
  groups: "分组", materials: "资料", images: "图片", rooms: "房间",
  location: "地点", address: "地址",
  start_date: "开始日期", end_date: "结束日期",
  remaining_count: "剩余次数", card_type: "卡类型", purchase_count: "购买次数",
  customer_id: "客户", customer_name: "用户",
  space_id: "空间", room_id: "房间", space_name: "空间名", room_name: "房间名",
  organization_id: "组织",
  password: "密码", old_password: "旧密码", new_password: "新密码",
  core_situation: "核心情况", need_tags: "需求标签",
  follow_up_node: "跟进节点", follow_up_action: "跟进动作",
  tracking_plan: "跟进计划",
  pages: "页面权限", member_types: "用户信息权限",
  operator: "匹配方式", conditions: "匹配条件",
  customers: "客户信息可见身份", class_records: "人员安排可见身份", payment: "付费项目可见身份",
  referrer_handler: "引流处理人", traffic_source_detail: "流量来源详情",
  total_payment: "累计付费",
  activity_mode: "活动模式", course_id: "课程",
  effective_date: "生效日期", themes: "主题",
  duration_type: "时长类型", duration_value: "时长", expiry_date: "到期日期",
  fee: "费用金额", project_name: "项目名称",
  daily_card_usage: "每日扣费", activity_id: "活动", activity_type: "活动类型",
}

const SECTION_OPTIONS = [
  "用户管理", "客户信息", "人员安排", "活动安排", "活动配置", "付费项目",
  "会员身份", "疗愈老师", "组织管理", "空间配置", "提醒配置",
  "账号管理", "角色管理", "密码修改", "AI 配置", "系统日志", "知识库", "业务数据", "操作日志",
]

const ALL_PAGES = [
  { key: "healing-records", label: "客户信息" },
  { key: "activity-records", label: "活动记录" },
  { key: "traffic-records", label: "引流记录" },
  { key: "class-records-visitors", label: "到场人员" },
  { key: "class-records-activities", label: "当日活动" },
  { key: "class-records-arrival", label: "到场确认" },
  { key: "daily-activities", label: "活动安排" },
  { key: "payment", label: "付费项目" },
  { key: "membership-cards", label: "会员卡" },
  { key: "group-cases", label: "觉醒游戏" },
  { key: "emotional-releases", label: "情绪释放" },
  { key: "energy-knots", label: "能量结" },
  { key: "internal-courses", label: "内部课程" },
  { key: "other-projects", label: "其他项目" },
  { key: "agents", label: "AI 配置" },
  { key: "business-reminders", label: "业务提醒" },
  { key: "system-logs", label: "系统日志" },
  { key: "operation-logs", label: "操作日志" },
  { key: "member-identities", label: "会员身份" },
  { key: "healing-identities", label: "疗愈老师" },
  { key: "position-management", label: "账号管理" },
  { key: "courses", label: "活动配置" },
  { key: "organizations", label: "组织管理" },
  { key: "spaces", label: "疗愈空间" },
  { key: "reminders", label: "提醒配置" },
]

const PERMISSION_GROUPS = [
  { label: "业务数据", keys: ["healing-records", "activity-records", "traffic-records"] },
  { label: "人员安排", keys: ["class-records-visitors", "class-records-activities", "class-records-arrival", "daily-activities"] },
  { label: "付费项目", keys: ["payment", "membership-cards", "group-cases", "emotional-releases", "energy-knots", "internal-courses", "other-projects"] },
  { label: "信息配置", keys: ["courses", "organizations", "member-identities", "healing-identities", "spaces", "reminders"] },
  { label: "账号管理", keys: ["position-management"] },
  { label: "系统配置", keys: ["agents", "business-reminders", "system-logs", "operation-logs"] },
]

const CUSTOMER_FILTER_PAGES = [
  "healing-records",
  "class-records-visitors", "class-records-activities", "class-records-arrival",
  "membership-cards", "group-cases", "emotional-releases", "energy-knots", "internal-courses",
]

export default function OperationLogsPage() {
  const navigate = useNavigate()
  const [operatorFilter, setOperatorFilter] = useState("")
  const [methodFilter, setMethodFilter] = useState("")
  const [sectionFilter, setSectionFilter] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [selectedLog, setSelectedLog] = useState<OperationLog | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const filtersRef = useRef({ operatorFilter, methodFilter, sectionFilter, dateFrom, dateTo })

  // 权限编辑弹窗状态
  const [permDialogOpen, setPermDialogOpen] = useState(false)
  const [permPositionName, setPermPositionName] = useState("")
  const [formPermissions, setFormPermissions] = useState<string[]>([])
  const [formCustomerPermissions, setFormCustomerPermissions] = useState<string[]>([])
  const [formCustomerPermissionsCR, setFormCustomerPermissionsCR] = useState<string[]>([])
  const [formCustomerPermissionsPay, setFormCustomerPermissionsPay] = useState<string[]>([])
  const [memberIdentityNames, setMemberIdentityNames] = useState<string[]>([])
  const [permLoading, setPermLoading] = useState(false)

  const fetchLogs = useCallback(async (page: number, pageSize: number) => {
    const f = filtersRef.current
    return operationLogApi.listPaginated({
      operator: f.operatorFilter || undefined,
      method: f.methodFilter || undefined,
      section: f.sectionFilter || undefined,
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
    organizationApi.list().then(setOrganizations).catch(() => {})
  }, [])

  const getNameById = (id: string) => {
    const c = customers.find(c => c.id === id)
    if (c) return c.nickname || c.name
    const o = organizations.find(o => o.id === id)
    if (o) return o.name
    return id
  }

  const handleFilterChange = (field: string, value: string) => {
    switch (field) {
      case "operator": setOperatorFilter(value); filtersRef.current.operatorFilter = value; break
      case "method": setMethodFilter(value); filtersRef.current.methodFilter = value; break
      case "section": setSectionFilter(value); filtersRef.current.sectionFilter = value; break
      case "from": setDateFrom(value); filtersRef.current.dateFrom = value; break
      case "to": setDateTo(value); filtersRef.current.dateTo = value; break
    }
    goToPage(1)
  }

  const handleClear = () => {
    setOperatorFilter("")
    setMethodFilter("")
    setSectionFilter("")
    setDateFrom("")
    setDateTo("")
    filtersRef.current = { operatorFilter: "", methodFilter: "", sectionFilter: "", dateFrom: "", dateTo: "" }
    goToPage(1)
  }

  // 权限编辑弹窗
  const openPermissionDialog = async (positionName: string) => {
    setPermLoading(true)
    setPermDialogOpen(true)
    setPermPositionName(positionName)
    try {
      const [allPerms, cPerm, cPermCR, cPermPay, identities] = await Promise.all([
        positionPermissionApi.getAll(),
        positionCustomerPermissionApi.getAll("customers"),
        positionCustomerPermissionApi.getAll("class_records"),
        positionCustomerPermissionApi.getAll("payment"),
        memberIdentityApi.list(),
      ])
      setFormPermissions(allPerms[positionName] || [])
      setFormCustomerPermissions(cPerm[positionName] || [])
      setFormCustomerPermissionsCR(cPermCR[positionName] || [])
      setFormCustomerPermissionsPay(cPermPay[positionName] || [])
      setMemberIdentityNames(identities.map(i => i.name))
    } catch {} finally {
      setPermLoading(false)
    }
  }

  const getSectionForPage = (pageKey: string): string | null => {
    if (pageKey === "healing-records") return "customers"
    if (["class-records-visitors", "class-records-activities", "class-records-arrival"].includes(pageKey)) return "class_records"
    if (["membership-cards", "group-cases", "emotional-releases", "energy-knots", "internal-courses"].includes(pageKey)) return "payment"
    return null
  }

  const autoFillCustomerPerms = (section: string) => {
    if (section === "customers" && formCustomerPermissions.length === 0) setFormCustomerPermissions([...memberIdentityNames])
    else if (section === "class_records" && formCustomerPermissionsCR.length === 0) setFormCustomerPermissionsCR([...memberIdentityNames])
    else if (section === "payment" && formCustomerPermissionsPay.length === 0) setFormCustomerPermissionsPay([...memberIdentityNames])
  }

  const handleTogglePermission = (pageKey: string) => {
    setFormPermissions(prev => {
      const next = prev.includes(pageKey) ? prev.filter(k => k !== pageKey) : [...prev, pageKey]
      const section = getSectionForPage(pageKey)
      if (section && next.includes(pageKey)) autoFillCustomerPerms(section)
      return next
    })
  }

  const handleSavePermissions = async () => {
    try {
      await Promise.all([
        positionPermissionApi.set(permPositionName, formPermissions),
        positionCustomerPermissionApi.setBatch(permPositionName, {
          customers: formCustomerPermissions,
          class_records: formCustomerPermissionsCR,
          payment: formCustomerPermissionsPay,
        }),
      ])
      setPermDialogOpen(false)
    } catch {}
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

  const SECTION_ENTITY: Record<string, string> = {
    "空间配置": "空间", "活动配置": "活动", "用户管理": "客户", "客户信息": "客户",
    "人员安排": "记录", "活动安排": "活动", "付费项目": "项目", "会员身份": "身份",
    "疗愈老师": "老师", "组织管理": "组织", "提醒配置": "提醒", "账号管理": "账号",
    "角色管理": "角色", "AI 配置": "配置", "系统日志": "日志",
  }

  const getEntityLabel = (section?: string, path?: string): string | null => {
    if (!section) return null
    if (path && /\/api\/spaces\/[^/]+\/rooms/.test(path)) return "房间"
    if (path && /\/api\/courses\/[^/]+/.test(path) && section === "活动配置") return "活动"
    return SECTION_ENTITY[section] || null
  }

  const renderChanges = (before: Record<string, unknown> | null, after: Record<string, unknown> | null, section?: string, path?: string) => {
    if (!after || !before) return null

    const skipKeys = ["id", "created_at", "updated_at", "is_deleted", "deleted_at", "icon", "is_system", "password", "old_password", "new_password"]
    // 跳过 _id 字段（当对应的 _name 也存在时），避免案主/主持人/成交人 等重复显示
    const idNamePairs: Record<string, string> = {
      owner_id: "owner_name", host_id: "host_name", closer_id: "closer_name",
      space_id: "space_name", room_id: "room_name",
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
                    <td className="px-3 py-2 text-[#8f959e] whitespace-nowrap">{(key === "name" ? getEntityLabel(section, path) : null) || FIELD_CN[key] || key}</td>
                    <td className="px-3 py-2 align-top">
                      <pre className="whitespace-pre-wrap break-all font-sans text-[#2b2b2b]">{formatCellValue(before[key], key) || "-"}</pre>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <pre className="whitespace-pre-wrap break-all font-sans text-[#2b2b2b]">{formatCellValue(after[key], key) || "-"}</pre>
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

  const formatCellValue = (val: unknown, key?: string): string => {
    if (val === null || val === undefined) return ""
    if (typeof val === "boolean") return val ? "是" : "否"
    if (Array.isArray(val)) {
      if (val.length === 0) return "（空）"
      if (key === "rooms") {
        return val.map((r: any) => r.name || r.id || "").filter(Boolean).join("、") || "（空）"
      }
      return val.map(v => {
        if (typeof v === "object" && v !== null) return resolveIdsInString(JSON.stringify(v))
        const s = String(v)
        if (s.length >= 8 && /^[0-9a-f-]+$/i.test(s)) return getNameById(s)
        // 页面权限字段：翻译为中文
        if (key === "pages" && PAGE_LABELS[s]) return PAGE_LABELS[s]
        return s
      }).join("、")
    }
    if (typeof val === "object") return resolveIdsInString(JSON.stringify(val, null, 2))
    const s = String(val)
    if (key === "operator") {
      if (s === "all") return "全部满足"
      if (s === "any") return "满足任意一项"
    }
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
            onChange={(v) => handleFilterChange("operator", v)}
            className="w-36"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[12px] text-[#8f959e]">操作类型</label>
          <SelectDropdown
            value={methodFilter}
            options={[{value: "", label: "全部"}, {value: "POST", label: "新增"}, {value: "UPDATE", label: "更新"}, {value: "DELETE", label: "删除"}]}
            placeholder="全部"
            onChange={(v) => handleFilterChange("method", v)}
            className="w-28"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[12px] text-[#8f959e]">板块</label>
          <SelectDropdown
            value={sectionFilter}
            options={[{value: "", label: "全部"}, ...SECTION_OPTIONS.map(s => ({value: s, label: s}))]}
            placeholder="全部"
            onChange={(v) => handleFilterChange("section", v)}
            className="w-28"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[12px] text-[#8f959e]">开始日期</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => handleFilterChange("from", e.target.value)}
            className={`h-8 w-36 rounded-md border border-[#e0e0e0] px-2.5 text-[12px] outline-none focus:border-[#3370ff] ${!dateFrom ? "text-[#8f959e] date-empty" : "text-[#2b2f36]"}`}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[12px] text-[#8f959e]">结束日期</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => handleFilterChange("to", e.target.value)}
            className={`h-8 w-36 rounded-md border border-[#e0e0e0] px-2.5 text-[12px] outline-none focus:border-[#3370ff] ${!dateTo ? "text-[#8f959e] date-empty" : "text-[#2b2f36]"}`}
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
              {selectedLog.method !== "POST" && selectedLog.method !== "DELETE" && (selectedLog.before_data || selectedLog.after_data)
                ? renderChanges(selectedLog.before_data || {}, selectedLog.after_data || {}, selectedLog.section, selectedLog.path)
                : null}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 权限编辑弹窗 */}
      <Dialog open={permDialogOpen} onOpenChange={setPermDialogOpen}>
        <DialogContent className="max-w-xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>编辑角色权限：{permPositionName}</DialogTitle>
          </DialogHeader>
          {permLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">加载中...</div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-3">
                <label className="text-xs text-muted-foreground font-medium">页面权限</label>
                {PERMISSION_GROUPS.map((group) => (
                  <div key={group.label} className="border border-[#e8e8e8] rounded-lg overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2.5 bg-[#f7f8fa] border-b border-[#e8e8e8]">
                      <span className="text-[12px] font-medium text-[#2b2f36]">{group.label}</span>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={group.keys.every(k => formPermissions.includes(k))}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setFormPermissions(prev => [...new Set([...prev, ...group.keys])])
                              if (group.keys.some(k => CUSTOMER_FILTER_PAGES.includes(k))) {
                                const sec = getSectionForPage(group.keys.find(k => CUSTOMER_FILTER_PAGES.includes(k))!)
                                if (sec) autoFillCustomerPerms(sec)
                              }
                            } else {
                              setFormPermissions(prev => prev.filter(k => !group.keys.includes(k)))
                            }
                          }}
                          className="rounded"
                        />
                        <span className="text-[11px] text-[#8f959e]">全选</span>
                      </label>
                    </div>
                    <div className="px-4 py-2.5 grid grid-cols-2 gap-1">
                      {group.keys.map((key) => {
                        const page = ALL_PAGES.find(p => p.key === key)
                        return (
                          <label key={key} className="flex items-center gap-3 px-2 py-1.5 rounded hover:bg-[#f7f8fa] cursor-pointer">
                            <input
                              type="checkbox"
                              checked={formPermissions.includes(key)}
                              onChange={() => handleTogglePermission(key)}
                              className="rounded"
                            />
                            <span className="text-[13px] text-[#2b2b2b]">{page?.label || key}</span>
                          </label>
                        )
                      })}
                    </div>
                    {(() => {
                      const section = getSectionForPage(group.keys.find(k => CUSTOMER_FILTER_PAGES.includes(k)) || "")
                      if (!section) return null
                      const anyChecked = group.keys.some(k => CUSTOMER_FILTER_PAGES.includes(k) && formPermissions.includes(k))
                      if (!anyChecked) return null
                      const perms = section === "customers" ? formCustomerPermissions
                        : section === "class_records" ? formCustomerPermissionsCR
                        : formCustomerPermissionsPay
                      const setPerms = section === "customers" ? setFormCustomerPermissions
                        : section === "class_records" ? setFormCustomerPermissionsCR
                        : setFormCustomerPermissionsPay
                      return (
                        <div className="px-4 py-2.5 border-t border-[#e8e8e8] bg-[#fafbfc]">
                          <span className="text-[11px] text-[#8f959e] block mb-2">选择该角色可见的会员身份类型</span>
                          {memberIdentityNames.length === 0 ? (
                            <span className="text-[12px] text-[#b0b5bb] block py-1">暂无会员身份类型</span>
                          ) : (
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                              {memberIdentityNames.map((name) => (
                                <label key={name} className="flex items-center gap-2 py-0.5 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={perms.includes(name)}
                                    onChange={() => {
                                      setPerms(prev =>
                                        prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
                                      )
                                    }}
                                    className="rounded"
                                  />
                                  <span className="text-[12px] text-[#2b2b2b]">{name}</span>
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-[#e8e8e8]">
                <button
                  className="h-8 px-4 rounded-md border border-[#e0e0e0] text-[12px] text-[#4e535a] hover:bg-[#f5f6f7]"
                  onClick={() => setPermDialogOpen(false)}
                >
                  取消
                </button>
                <button
                  className="h-8 px-4 rounded-md bg-[#3370ff] text-white text-[12px] hover:bg-[#2860e1]"
                  onClick={handleSavePermissions}
                >
                  保存
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
