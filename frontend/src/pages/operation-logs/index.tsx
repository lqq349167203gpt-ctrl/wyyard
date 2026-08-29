import { useEffect, useState, useCallback, useRef } from "react"
import { X } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { operationLogApi, accountApi, customerApi, organizationApi } from "@/lib/api"
import { SelectDropdown } from "@/components/select-dropdown"
import type { OperationLog, AccountLight, Customer, Organization } from "@/lib/api"
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
  "custom-analysis": "自定义筛选",
  "healing-records": "客户信息",
  "activity-records": "活动记录",
  "traffic-records": "引流记录",
  "class-records-visitors": "到场人员",
  "class-records-activities": "当日活动",
  "class-records-arrival": "到场确认",
  "daily-activities": "活动安排",
  "offline-course-records": "落地课程",
  "communication-records": "沟通记录",
  "followup-records": "回访记录",
  "referral-statistics": "引流统计",
  "member-statistics": "会员情况",
  "course-statistics": "课程",
  "product-sales": "产品销售",
  "statistics": "服务数据",
  "daily-report": "每日报表",
  "payment": "付费项目",
  "payment-deductions": "销卡/退课",
  "payment-refunds": "退费",
  "expenses": "支出项",
  "debt-records": "欠卡记录",
  "membership-cards": "会员卡",
  "group-cases": "觉醒游戏",
  "emotional-releases": "情绪释放",
  "oh-card-readings": "OH卡诊断",
  "energy-knots": "能量结",
  "internal-courses": "内部课程",
  "tea-seat-fees": "茶位费",
  "offline-courses": "线下落地课程",
  "other-projects": "其他项目",
  "agents": "AI 配置",
  "chat-history": "沟通记录",
  "business-reminders": "业务提醒",
  "system-logs": "系统日志",
  "operation-logs": "操作日志",
  "login-records": "使用统计",
  "analysis-logs": "分析日志",
  "member-identities": "会员身份",
  "customer-tags": "客户标签",
  "healing-identities": "疗愈老师",
  "position-management": "账号管理",
  "change-password": "密码修改",
  "disabled-customers": "停用客户",
  "courses": "活动配置",
  "organizations": "组织信息",
  "spaces": "疗愈空间",
  "reminders": "提醒配置",
}

const METHOD_LABELS: Record<string, string> = {
  POST: "新增",
  PUT: "更新",
  PATCH: "更新",
  DELETE: "删除",
  GET: "查询",
  VIEW: "查看",
  COPY: "复制",
}

const METHOD_COLORS: Record<string, string> = {
  POST: "bg-green-50 text-green-600",
  PUT: "bg-blue-50 text-blue-600",
  PATCH: "bg-blue-50 text-blue-600",
  DELETE: "bg-red-50 text-red-600",
  GET: "bg-gray-50 text-gray-600",
  VIEW: "bg-gray-50 text-gray-600",
  COPY: "bg-gray-50 text-gray-600",
}

const SOURCE_LABELS: Record<string, string> = {
  pc: "PC端",
  miniprogram: "管理端小程序",
  "miniprogram-client": "客户端小程序",
  system: "系统",
}

const SOURCE_COLORS: Record<string, string> = {
  pc: "bg-gray-50 text-gray-600",
  miniprogram: "bg-blue-50 text-blue-600",
  "miniprogram-client": "bg-green-50 text-green-600",
  system: "bg-purple-50 text-purple-600",
}

const FIELD_CN: Record<string, string> = {
  id: "记录编号", project_id: "项目编号", project_type: "项目类型",
  nickname: "昵称", name: "名称", title: "标题", username: "用户名", owner: "归属人",
  phone: "电话", email: "邮箱", wechat: "微信", gender: "性别", age: "年龄", birthday: "生日",
  member_type: "会员身份", member_identity: "会员身份", healing_identity: "疗愈老师", activity_types: "活动类型",
  note: "备注", description: "描述", content: "内容", section: "板块",
  status: "状态", type: "类型", date: "日期", start_time: "开始时间", end_time: "结束时间",
  enabled: "启用状态",
  scope: "可见范围", customer_tags: "客户标签",
  teacher_ids: "老师", teachers: "老师", course_name: "沙龙名称", course_type: "课程类型", course_description: "沙龙描述",
  owner_name: "案主", owner_id: "案主", host_name: "主持人", host_names: "主持人", host_id: "主持人", host_ids: "主持人",
  participant_ids: "参与者", withdrawn_participant_ids: "退课人员", withdrawal_records: "退课记录",
  restored_count: "退回卡次", withdrawn_at: "退课办理时间", withdrawn_by: "退课办理人",
  cancelled_at: "取消退课时间", cancelled_by: "取消退课人",
  achiever_name: "成就君", achiever_id: "成就君",
  leader_id: "组长", deputy_id: "副组长", member_ids: "成员",
  closer_name: "成交人", closer_id: "成交人", closers: "成交人",
  price: "价格", amount: "金额", count: "次数", total: "总计", class_count: "课时数",
  sort_order: "排序", is_public_welfare: "公益", category: "分类",
  arrived: "到店", cancelled: "邀约状态", arrival_time: "到店时间", experience: "客户反馈", feedback: "客户信息",
  needs: "来访需求",
  visit_date: "到访日期", visit_time: "预计时间", visit_count: "到店次数",
  referrer: "引流人", referral_date: "引流日期", traffic_source: "流量来源", paid_content: "付费内容",
  basic_info: "基础信息", assessment: "客户评估", tags: "标签", self_tags: "个人标签",
  work_status: "工作状态", work_description: "工作描述",
  positions: "疗愈老师", position: "职位", role: "角色", permissions: "权限",
  groups: "分组", materials: "资料", images: "图片", rooms: "房间",
  location: "地点", address: "地址",
  start_date: "开始日期", end_date: "结束日期",
  remaining_count: "剩余次数", total_count: "总次数", card_type: "卡类型", purchase_count: "购买场次",
  customer_id: "客户", customer_name: "用户", contact_field: "联系方式",
  space_id: "空间", room_id: "房间", space_name: "空间名", room_name: "房间名",
  organization_id: "组织",
  password: "密码", old_password: "旧密码", new_password: "新密码",
  core_situation: "核心情况", need_tags: "需求标签",
  follow_up_node: "跟进节点", follow_up_action: "跟进动作", follow_up_status: "跟进阶段",
  tracking_plan: "跟进计划",
  pages: "页面权限", page_permissions: "页面权限", member_types: "历史用户信息权限",
  edit_permissions: "信息编辑范围", contacts: "客户联系方式权限", visits: "邀约",
  operator: "匹配方式", conditions: "匹配条件",
  customers: "客户资料可见范围", class_records: "人员安排可见身份", payment: "付费项目可见身份",
  referrer_handler: "引流处理人", traffic_source_detail: "流量来源详情",
  total_payment: "累计付费",
  activity_mode: "活动模式", course_id: "课程",
  effective_date: "生效日期", deal_date: "成交日期", themes: "主题",
  duration_type: "时长类型", duration_value: "时长", expiry_date: "到期日期",
  fee: "费用金额", refund_amount: "退费金额", project_name: "项目名称", payment_method: "支付方式",
  diagnosis_duration: "诊断时长", quantity: "数量",
  expense_time: "支出时间", purchase_content: "支出项", platform: "平台", notes: "备注",
  requires_customer: "需要用户昵称", requires_platform: "需要平台",
  cost_category: "成本分类", expense_type: "支出类型", month: "月份",
  person_name: "人员", benefit_date: "福利日期",
  daily_card_usage: "每日扣费",
  creator: "创建人", creator_id: "创建账号编号", created_by: "创建人", created_by_id: "创建账号编号", created_at: "创建时间",
  updated_at: "更新时间", is_deleted: "是否删除", deleted_at: "删除时间",
  voided: "是否退费", voided_at: "退费时间",
  customer_nickname: "客户昵称", tag_ids: "客户标签",
  last_visit_date: "最近到店", other_info: "其他信息", service_teacher: "服务老师",
  is_leader: "是否组长",
  room_ids: "房间顺序", position_sort_orders: "排序顺序", is_system: "是否系统角色",
  healing_notes: "跟进点", activity_count: "活动次数", welfare_count: "公益次数", activities: "活动记录",
  visit_id: "邀约记录", category_label: "记录类型",
  provider: "模型供应商", model: "模型", api_key: "接口密钥", base_url: "接口地址",
  system_prompt: "系统提示词", temperature: "温度", max_tokens: "最大输出长度",
  record_date: "上课日期", teacher: "课程老师", result: "课程结果",
  validity_value: "有效期", validity_unit: "有效期单位",
}

const VALUE_CN: Record<string, string> = {
  "membership-cards": "会员卡",
  "group-cases": "觉醒游戏",
  "emotional-releases": "情绪释放",
  "oh-card-readings": "OH卡梳理",
  "energy-knots": "能量结",
  "internal-courses": "内部课程",
  "other-projects": "其他项目",
  month: "按月",
  day: "按天",
  year: "按年",
  own: "仅本人录入",
  all: "全部记录",
  permanent: "永久",
  alipay: "支付宝",
  wechat: "微信支付",
  cash: "现金",
  bank: "银行转账",
  active: "生效中",
  inactive: "未生效",
  pending: "待处理",
  completed: "已完成",
  cancelled: "已取消",
  disabled: "已停用",
  male: "男",
  female: "女",
}

const MONEY_FIELDS = new Set(["price", "amount", "fee", "refund_amount", "total_payment"])
const COUNT_FIELDS = new Set(["count", "total_count", "remaining_count", "purchase_count", "class_count"])
const DATE_TIME_FIELDS = new Set(["created_at", "updated_at", "deleted_at", "voided_at", "arrival_time"])

const API_PATH_LABELS: Array<[string, string]> = [
  ["/api/activity-orders", "课表"],
  ["/api/project-refunds", "退费记录"],
  ["/api/membership-cards", "会员卡"],
  ["/api/group-cases", "觉醒游戏"],
  ["/api/emotional-releases", "情绪释放"],
  ["/api/oh-card-readings", "OH卡梳理"],
  ["/api/energy-knots", "能量结"],
  ["/api/internal-courses", "内部课程"],
  ["/api/other-projects", "其他项目"],
  ["/api/expenses", "支出项"],
  ["/api/communication-records", "沟通记录"],
  ["/api/customer-tags", "客户标签"],
  ["/api/customers", "客户资料"],
  ["/api/visits", "邀约"],
  ["/api/visit-notes", "邀约"],
  ["/api/class-records", "课表"],
]

const SECTION_OPTIONS = [
  "客户资料", "邀约", "课表", "付费项目", "支出项", "分成", "人员福利", "活动配置", "会员身份", "客户标签",
  "疗愈老师", "组织信息", "空间配置", "提醒配置", "提醒",
  "账号管理", "密码修改", "AI 配置", "系统日志", "操作日志", "系统",
]

const formatSectionLabel = (section: string) => section === "组织管理" ? "组织信息" : section

const getOperationLocation = (path: string, section: string) => {
  if (path.includes("/withdrawals")) return "退课"
  return API_PATH_LABELS.find(([prefix]) => path.startsWith(prefix))?.[1] || formatSectionLabel(section)
}

const isReorderLog = (log: Pick<OperationLog, "path">) => (
  ["/api/visits/reorder", "/api/activity-orders"].includes(log.path.replace(/\/+$/, ""))
)

const getMethodLabel = (log: Pick<OperationLog, "method" | "path">) => {
  if (isReorderLog(log)) return "排序"
  if (log.method === "DELETE" && log.path.startsWith("/api/customer-tags/")) return "停用"
  return METHOD_LABELS[log.method] || log.method
}

const getMethodColor = (log: Pick<OperationLog, "method" | "path">) => {
  if (isReorderLog(log)) return METHOD_COLORS.PATCH
  return METHOD_COLORS[log.method] || "bg-gray-50 text-gray-600"
}

const compactLogText = (value: unknown, limit = 80) => {
  const text = String(value || "").replace(/\s+/g, " ").trim()
  return text.length <= limit ? text : `${text.slice(0, limit)}…`
}

const translateLegacyLogContent = (content: string) => content
  .replace(/diagnosis_duration设为(-?\d+(?:\.\d+)?)/g, (_, value: string) => `诊断时长设为${Number(value) * 0.5}小时`)
  .replace(/diagnosis_duration\((-?\d+(?:\.\d+)?)→(-?\d+(?:\.\d+)?)\)/g, (_, oldValue: string, newValue: string) => `诊断时长(${Number(oldValue) * 0.5}小时→${Number(newValue) * 0.5}小时)`)
  .replaceAll("diagnosis_duration", "诊断时长")
  .replaceAll("quantity", "数量")
  .replaceAll("cancelled(否→是)", "邀约状态(正常邀约→已取消)")
  .replaceAll("cancelled(是→否)", "邀约状态(已取消→正常邀约)")
  .replaceAll("cancelled设为是", "邀约状态设为已取消")
  .replaceAll("cancelled设为否", "邀约状态设为正常邀约")
  .replaceAll("cancelled", "邀约状态")

const PAID_PROJECT_PATHS = [
  "/api/membership-cards",
  "/api/group-cases",
  "/api/emotional-releases",
  "/api/oh-card-readings",
  "/api/energy-knots",
  "/api/internal-courses",
  "/api/tea-seat-fees",
  "/api/offline-courses",
  "/api/other-projects",
]

const getPaidProjectLogDisplayContent = (log: OperationLog) => {
  if (log.method !== "POST" || !PAID_PROJECT_PATHS.some(path => log.path.startsWith(path))) return ""
  const content = translateLegacyLogContent(log.content)
  if (/成交日期|生效日期|记录日期/.test(content)) return content
  const snapshot = log.after_data || {}
  const date = snapshot.deal_date || snapshot.effective_date || snapshot.record_date
  if (!date) return content
  const label = snapshot.deal_date ? "成交日期" : snapshot.effective_date ? "生效日期" : "记录日期"
  return `${content}（${label}：${date}）`
}

const formatLogAmount = (value: unknown) => {
  const amount = Number(value)
  return Number.isFinite(amount) ? `¥${amount.toLocaleString()}` : ""
}

const getFinancialLogDisplayContent = (log: OperationLog) => {
  const isCommission = log.path.startsWith("/api/financial/commissions")
  const isBenefit = log.path.startsWith("/api/financial/staff-benefits")
  if (!isCommission && !isBenefit) return ""

  const snapshot = log.method === "DELETE" ? log.before_data : (log.after_data || log.before_data)
  if (!snapshot) {
    if (log.method === "DELETE") {
      return `删除${isCommission ? "分成" : "人员福利"}记录（历史日志未保存删除前信息）`
    }
    return log.content
      .replace("新增分成 commissions", "新增分成")
      .replace("修改分成 commissions", "修改分成")
      .replace("新增人员福利 staff-benefits", "新增人员福利")
      .replace("修改人员福利 staff-benefits", "修改人员福利")
  }

  const action = log.method === "POST" ? "新增" : log.method === "DELETE" ? "删除" : "修改"
  const parts = isCommission
    ? [
        snapshot.month ? `月份：${snapshot.month}` : "",
        snapshot.person_name ? `人员：${snapshot.person_name}` : "",
      ]
    : [
        snapshot.benefit_date ? `日期：${snapshot.benefit_date}` : "",
        snapshot.content ? `福利内容：${snapshot.content}` : "",
      ]
  const amount = formatLogAmount(snapshot.amount)
  if (amount) parts.push(`金额：${amount}`)
  if (snapshot.notes) parts.push(`备注：${compactLogText(snapshot.notes)}`)
  return `${action}${isCommission ? "分成" : "人员福利"}：${parts.filter(Boolean).join("｜")}`
}

const EDIT_SCOPE_LABELS: Record<string, string> = {
  view: "仅浏览",
  own: "仅本人录入",
  all: "全部记录",
}

const getEditScopeLabel = (scope: string, area: string) => (
  area === "customers" && scope === "all" ? "可编辑" : (EDIT_SCOPE_LABELS[scope] || scope)
)

const getPermissionLogDisplayContent = (log: OperationLog) => {
  if (!log.path.startsWith("/api/position-permissions/full")) return ""
  const before = log.before_data || {}
  const after = log.after_data || {}
  const position = String(after.position || before.position || "角色")
  const changes: string[] = []

  const oldPages = new Set(Array.isArray(before.pages) ? before.pages : [])
  const newPages = new Set(Array.isArray(after.pages) ? after.pages : [])
  const addedPages = [...newPages].filter(page => !oldPages.has(page))
  const removedPages = [...oldPages].filter(page => !newPages.has(page))
  if (addedPages.length > 0) {
    changes.push(`新增页面权限：${addedPages.map(page => PAGE_LABELS[page] || page).join("、")}`)
  }
  if (removedPages.length > 0) {
    changes.push(`移除页面权限：${removedPages.map(page => PAGE_LABELS[page] || page).join("、")}`)
  }

  const oldEdit = before.edit_permissions && typeof before.edit_permissions === "object"
    ? before.edit_permissions as Record<string, unknown>
    : {}
  const newEdit = after.edit_permissions && typeof after.edit_permissions === "object"
    ? after.edit_permissions as Record<string, unknown>
    : {}
  ;([
    { key: "customers", label: "客户资料操作范围", defaultScope: "all" },
    { key: "visits", label: "邀约编辑范围", defaultScope: "own" },
    { key: "activities", label: "课表编辑范围", defaultScope: "own" },
  ] as const).forEach(({ key, label, defaultScope }) => {
    const oldScope = String(oldEdit[key] || defaultScope)
    const newScope = String(newEdit[key] || defaultScope)
    if (oldScope !== newScope) {
      changes.push(`${label}：${getEditScopeLabel(oldScope, key)} → ${getEditScopeLabel(newScope, key)}`)
    }
  })

  const oldContacts = oldEdit.contacts && typeof oldEdit.contacts === "object"
    ? oldEdit.contacts as Record<string, unknown>
    : {}
  const newContacts = newEdit.contacts && typeof newEdit.contacts === "object"
    ? newEdit.contacts as Record<string, unknown>
    : {}
  ;([
    { field: "phone", label: "手机号" },
    { field: "wechat", label: "微信号" },
  ] as const).forEach(({ field, label }) => {
    const oldActions = oldContacts[field] && typeof oldContacts[field] === "object"
      ? oldContacts[field] as Record<string, unknown>
      : {}
    const newActions = newContacts[field] && typeof newContacts[field] === "object"
      ? newContacts[field] as Record<string, unknown>
      : {}
    ;([
      { action: "view", label: "查看" },
      { action: "copy", label: "复制" },
      { action: "edit", label: "修改" },
    ] as const).forEach(({ action, label: actionLabel }) => {
      const oldEnabled = oldActions[action] === true
      const newEnabled = newActions[action] === true
      if (oldEnabled !== newEnabled) {
        changes.push(`${label}${actionLabel}权限：${oldEnabled ? "开启" : "关闭"} → ${newEnabled ? "开启" : "关闭"}`)
      }
    })
  })

  return changes.length > 0 ? `${position}：${changes.join("；")}` : `${position}：权限无变更`
}

const getLogDisplayContent = (log: OperationLog) => {
  if (isReorderLog(log)) {
    if (log.content) return translateLegacyLogContent(log.content)
    return log.path.replace(/\/+$/, "") === "/api/activity-orders"
      ? "调整课表排序"
      : "调整邀约排序"
  }
  const financialContent = getFinancialLogDisplayContent(log)
  if (financialContent) return financialContent
  const permissionContent = getPermissionLogDisplayContent(log)
  if (permissionContent) return permissionContent
  const paidProjectContent = getPaidProjectLogDisplayContent(log)
  if (paidProjectContent) return paidProjectContent
  if (!log.path.startsWith("/api/communication-records")) return translateLegacyLogContent(log.content)

  const snapshot = log.method === "DELETE"
    ? log.before_data
    : (log.after_data || log.before_data)
  const nickname = compactLogText(snapshot?.customer_nickname)
  const recordContent = compactLogText(snapshot?.content)
  const previousContent = compactLogText(log.before_data?.content)
  const action = log.method === "POST"
    ? "新增"
    : log.method === "DELETE"
      ? "删除"
      : "修改"

  if (nickname && recordContent) {
    if (log.method !== "POST" && log.method !== "DELETE" && previousContent) {
      return `${action}沟通记录：客户：${nickname}｜内容：${previousContent} → ${recordContent}`
    }
    return `${action}沟通记录：客户：${nickname}｜内容：${recordContent}`
  }
  if (nickname) return `${action}沟通记录：客户：${nickname}｜内容：（内容为空）`
  if (log.method === "DELETE" && !log.before_data) {
    return "删除沟通记录（历史记录未保存删除前内容）"
  }
  return translateLegacyLogContent(log.content)
}

export default function OperationLogsPage() {
  const navigate = useNavigate()
  const [operatorFilter, setOperatorFilter] = useState("")
  const [methodFilter, setMethodFilter] = useState("")
  const [sectionFilter, setSectionFilter] = useState("")
  const [sourceFilter, setSourceFilter] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [keywordFilter, setKeywordFilter] = useState("")
  const [selectedLog, setSelectedLog] = useState<OperationLog | null>(null)
  const [accounts, setAccounts] = useState<AccountLight[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const filtersRef = useRef({ operatorFilter, methodFilter, sectionFilter, sourceFilter, dateFrom, dateTo, keywordFilter })

  const fetchLogs = useCallback(async (page: number, pageSize: number) => {
    const f = filtersRef.current
    return operationLogApi.listPaginated({
      operator: f.operatorFilter || undefined,
      method: f.methodFilter || undefined,
      section: f.sectionFilter || undefined,
      source: f.sourceFilter || undefined,
      date_from: f.dateFrom || undefined,
      date_to: f.dateTo || undefined,
      keyword: f.keywordFilter || undefined,
    }, page, pageSize)
  }, [])

  const {
    paginatedItems: pagedLogs, currentPage, totalPages, totalItems,
    goToPage, startIndex, endIndex, loading,
  } = useServerPagination<OperationLog>(fetchLogs, { pageSize: PAGE_SIZE })

  useEffect(() => {
    accountApi.listLight().then(setAccounts).catch(() => {})
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
      case "source": setSourceFilter(value); filtersRef.current.sourceFilter = value; break
      case "from": setDateFrom(value); filtersRef.current.dateFrom = value; break
      case "to": setDateTo(value); filtersRef.current.dateTo = value; break
      case "keyword": setKeywordFilter(value); filtersRef.current.keywordFilter = value; break
    }
    goToPage(1)
  }

  const handleClear = () => {
    setOperatorFilter("")
    setMethodFilter("")
    setSectionFilter("")
    setSourceFilter("")
    setDateFrom("")
    setDateTo("")
    setKeywordFilter("")
    filtersRef.current = { operatorFilter: "", methodFilter: "", sectionFilter: "", sourceFilter: "", dateFrom: "", dateTo: "", keywordFilter: "" }
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

  const SECTION_ENTITY: Record<string, string> = {
    "空间配置": "空间", "活动配置": "活动", "客户资料": "客户",
    "邀约": "记录", "课表": "活动", "付费项目": "项目", "会员身份": "身份",
    "疗愈老师": "老师", "组织信息": "组织", "组织管理": "组织", "提醒配置": "提醒", "提醒": "提醒", "账号管理": "账号",
    "AI 配置": "配置", "系统日志": "日志",
  }

  const getEntityLabel = (section?: string, path?: string): string | null => {
    if (!section) return null
    if (path && /\/api\/spaces\/[^/]+\/rooms/.test(path)) return "房间"
    if (path && /\/api\/courses\/[^/]+/.test(path) && section === "活动配置") return "活动"
    return SECTION_ENTITY[section] || null
  }

  const getFieldLabel = (key: string, section?: string, path?: string) => {
    if (key === "name") return getEntityLabel(section, path) || FIELD_CN.name
    return FIELD_CN[key] || "其他信息"
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
                    <td className="px-3 py-2 text-[#8f959e] whitespace-nowrap">{getFieldLabel(key, section, path)}</td>
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

  const renderSnapshot = (
    data: Record<string, unknown> | null,
    title: string,
  ) => {
    if (!data) return null
    const idNamePairs: Record<string, string> = {
      owner_id: "owner_name", host_id: "host_name", closer_id: "closer_name",
      space_id: "space_name", room_id: "room_name",
    }
    const hasCloserAllocation = Array.isArray(data.closers)
      ? data.closers.length > 0
      : Boolean(data.closers)
    const keys = Object.keys(data).filter(key => {
      if (key === "can_delete") return false
      if (hasCloserAllocation && (key === "closer_id" || key === "closer_name")) return false
      const nameKey = idNamePairs[key]
      return !(nameKey && data[nameKey] !== undefined)
    })
    if (keys.length === 0) return null
    return (
      <div>
        <div className="mb-1.5 text-xs font-medium text-[#8f959e]">{title}</div>
        <div className="overflow-hidden rounded-[4px] bg-[#f7f8fa] text-xs">
          <table className="w-full">
            <tbody>
              {keys.map((key, index) => (
                <tr key={key} className={index < keys.length - 1 ? "border-b border-[#f0f0f0]" : ""}>
                  <td className="w-28 whitespace-nowrap px-3 py-2 text-[#8f959e]">{getFieldLabel(key)}</td>
                  <td className="px-3 py-2 align-top">
                    <pre className="whitespace-pre-wrap break-all font-sans text-[#2b2b2b]">{formatCellValue(data[key], key) || "-"}</pre>
                  </td>
                </tr>
              ))}
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
    if (key === "diagnosis_duration") {
      const halfHours = Number(val)
      return Number.isFinite(halfHours) ? `${halfHours * 0.5}小时` : String(val)
    }
    if (key === "cancelled" && typeof val === "boolean") return val ? "已取消" : "正常邀约"
    if (typeof val === "boolean") return val ? "是" : "否"
    if (Array.isArray(val)) {
      if (val.length === 0) return "（空）"
      if (key === "rooms") {
        return val.map((r: any) => r.name || r.id || "").filter(Boolean).join("、") || "（空）"
      }
      if (key === "closers") {
        return val.map((item) => {
          if (!item || typeof item !== "object") return String(item)
          const closer = item as Record<string, unknown>
          const name = String(closer.name || getNameById(String(closer.id || "")) || "未填写")
          const amount = Number(closer.amount)
          return Number.isFinite(amount) ? `${name}（¥${amount.toLocaleString()}）` : name
        }).join("、")
      }
      return val.map(v => {
        if (typeof v === "object" && v !== null) {
          return Object.entries(v as Record<string, unknown>)
            .map(([childKey, childValue]) => `${getFieldLabel(childKey)}：${formatCellValue(childValue, childKey) || "-"}`)
            .join("；")
        }
        const s = String(v)
        if (s.length >= 8 && /^[0-9a-f-]+$/i.test(s)) return getNameById(s)
        // 页面权限字段：翻译为中文
        if (key === "pages" && PAGE_LABELS[s]) return PAGE_LABELS[s]
        return VALUE_CN[s] || s
      }).join("、")
    }
    if (typeof val === "object") {
      if (key === "closers") return formatCellValue([val], key)
      if (key === "edit_permissions") {
        const permissions = val as Record<string, unknown>
        const contacts = permissions.contacts && typeof permissions.contacts === "object"
          ? permissions.contacts as Record<string, Record<string, boolean>>
          : {}
        const formatActions = (field: "phone" | "wechat") => {
          const actions = contacts[field] || {}
          return [
            actions.view ? "查看" : "",
            actions.copy ? "复制" : "",
            actions.edit ? "修改" : "",
          ].filter(Boolean).join("、") || "无"
        }
        return [
          `客户资料：${getEditScopeLabel(String(permissions.customers || "all"), "customers")}`,
          `邀约：${EDIT_SCOPE_LABELS[String(permissions.visits || "own")] || String(permissions.visits || "own")}`,
          `课表：${EDIT_SCOPE_LABELS[String(permissions.activities || "own")] || String(permissions.activities || "own")}`,
          `手机号：${formatActions("phone")}`,
          `微信号：${formatActions("wechat")}`,
        ].join("；")
      }
      return Object.entries(val as Record<string, unknown>)
        .map(([childKey, childValue]) => `${getFieldLabel(childKey)}：${formatCellValue(childValue, childKey) || "-"}`)
        .join("；")
    }
    const s = String(val)
    if (key === "closers") {
      try {
        return formatCellValue(JSON.parse(s), key)
      } catch {
        return s
      }
    }
    if (key === "operator") {
      if (s === "all") return "全部满足"
      if (s === "any") return "满足任意一项"
    }
    if (key === "scope") {
      if (s === "public") return "团队共享"
      if (s === "private") return "仅自己可见"
    }
    if (key && MONEY_FIELDS.has(key)) {
      const amount = Number(s)
      if (Number.isFinite(amount)) return `¥${amount.toLocaleString()}`
    }
    if (key && COUNT_FIELDS.has(key)) {
      const count = Number(s)
      if (Number.isFinite(count)) return `${count.toLocaleString()}次`
    }
    if (key && DATE_TIME_FIELDS.has(key) && s.includes("T")) {
      const date = new Date(s)
      if (!Number.isNaN(date.getTime())) {
        return date.toLocaleString("zh-CN", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        })
      }
    }
    if (VALUE_CN[s]) return VALUE_CN[s]
    if (s.length >= 8 && /^[0-9a-f-]+$/i.test(s)) return getNameById(s)
    return resolveIdsInString(s)
  }

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-lg font-medium">操作日志</h1>
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
            options={[{value: "", label: "全部"}, {value: "POST", label: "新增"}, {value: "UPDATE", label: "更新"}, {value: "DELETE", label: "删除"}, {value: "VIEW", label: "查看"}, {value: "COPY", label: "复制"}]}
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
          <label className="text-[12px] text-[#8f959e]">来源</label>
          <SelectDropdown
            value={sourceFilter}
            options={[
              {value: "", label: "全部"},
              {value: "pc", label: "PC端"},
              {value: "miniprogram", label: "管理端小程序"},
              {value: "miniprogram-client", label: "客户端小程序"},
              {value: "system", label: "系统"},
            ]}
            placeholder="全部"
            onChange={(v) => handleFilterChange("source", v)}
            className="w-32"
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
        <div className="flex flex-col gap-1">
          <label className="text-[12px] text-[#8f959e]">内容搜索</label>
          <input
            type="text"
            value={keywordFilter}
            onChange={(e) => handleFilterChange("keyword", e.target.value)}
            placeholder="输入关键词"
            className="h-8 w-40 rounded-md border border-[#e0e0e0] px-2.5 text-[12px] outline-none focus:border-[#3370ff] text-[#2b2f36] placeholder:text-[#8f959e]"
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
                          getMethodColor(log)
                        }`}
                      >
                        {getMethodLabel(log)}
                      </span>
                      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-600 shrink-0">
                        {formatSectionLabel(log.section)}
                      </span>
                      {log.source && (
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 ${SOURCE_COLORS[log.source] || "bg-gray-50 text-gray-600"}`}>
                          {SOURCE_LABELS[log.source] || log.source}
                        </span>
                      )}
                      <span className="flex-1 text-[13px] text-[#2b2b2b]">{getLogDisplayContent(log)}</span>
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
                  <span className="text-[#2b2b2b]">{getMethodLabel(selectedLog)}</span>
                </div>
                <div>
                  <span className="text-[#8f959e]">板块：</span>
                  <span className="text-[#2b2b2b]">{formatSectionLabel(selectedLog.section)}</span>
                </div>
                <div>
                  <span className="text-[#8f959e]">来源：</span>
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${SOURCE_COLORS[selectedLog.source] || "bg-gray-50 text-gray-600"}`}>
                    {SOURCE_LABELS[selectedLog.source] || selectedLog.source || "PC端"}
                  </span>
                </div>
                <div>
                  <span className="text-[#8f959e]">操作位置：</span>
                  <span className="text-[#2b2b2b]">{getOperationLocation(selectedLog.path, selectedLog.section)}</span>
                </div>
                <div>
                  <span className="text-[#8f959e]">记录编号：</span>
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
                <span className="text-[#2b2b2b]">{getLogDisplayContent(selectedLog)}</span>
              </div>
              {selectedLog.method !== "POST" && selectedLog.method !== "DELETE" && (selectedLog.before_data || selectedLog.after_data)
                ? renderChanges(selectedLog.before_data || {}, selectedLog.after_data || {}, selectedLog.section, selectedLog.path)
                : null}
              {selectedLog.method === "DELETE" && selectedLog.before_data
                ? renderSnapshot(selectedLog.before_data, "删除前完整信息")
                : null}
              {selectedLog.method === "POST" && selectedLog.after_data && !isReorderLog(selectedLog)
                ? renderSnapshot(selectedLog.after_data, "新增信息")
                : null}
            </div>
          )}
        </DialogContent>
      </Dialog>

    </div>
  )
}
