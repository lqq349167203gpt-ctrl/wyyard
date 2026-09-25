import { confirmDialog } from "@/components/confirm-dialog"

const API_BASE = ""

/** 用户在确认弹窗里点了「取消」：本次请求没有提交，服务端数据未变 */
export class OperationCancelledError extends Error {
  readonly cancelled = true
  constructor(message = "已取消操作") {
    super(message)
    this.name = "OperationCancelledError"
  }
}

export function isOperationCancelled(error: unknown): boolean {
  return error instanceof OperationCancelledError || Boolean((error as { cancelled?: boolean } | null)?.cancelled)
}

// 后端（Pydantic）校验失败会带 "Value error, " 英文前缀，展示给用户前去掉
function cleanValidationMessage(value: unknown, fallback: string): string {
  const text = typeof value === "string" ? value.replace(/^Value error,\s*/i, "") : ""
  return text || fallback
}

export interface ConversionAction {
  kind: "attendance" | "purchase" | "coarse_usage"
  product: string
  subtype: string
  occurrence: "first" | "any" | "repeat"
  // 附加筛选条件：字段/规则/取值与自定义筛选一致（「从」筛人，「到」筛事件）
  conditions: AnalysisCondition[]
}
export interface ConversionRule {
  name: string
  // 保存规则时使用：说明与可见范围不影响计算口径
  description: string
  scope: "private" | "shared"
  source: ConversionAction
  targets: ConversionAction[]
  target_mode: "any" | "all"
  window_days: number
  same_organization: boolean
  // 规则一起记住的筛选范围（组织/俱乐部 + 统计周期）
  organization_id: string
  date_from: string
  date_to: string
}
export interface PrincipalQuery {
  export_view?: "" | "traffic" | "invite_initiated" | "invite_arrivals"
  export_customer_ids?: string[]
  export_columns?: string[]
  arrival_view?: "customer" | "date"
  organization_id: string
  date_from: string | null
  date_to: string | null
  tab: "overview" | "courses" | "orders" | "conversion"
  product: string
  activity_type: string
  course_subtype: string
  order_filter: "" | "first" | "repeat" | "cross"
  /** 课程列表：只看当日有成交 / 有关联成交的课程 */
  course_deal?: "" | "same_day" | "related"
  status: "" | "converted" | "unconverted" | "observing"
  breakdown?: string[]
  customer_id?: string
  /** 交易列表口径：order＝每笔交易一行；customer＝同一人只显示一行 */
  list_view?: "order" | "customer"
  course_view?: "course" | "participant" | "teacher_follow_up"
  participant_scope?: "" | "internal" | "external"
  /** 邀约二级列表：到店口径 / 发起口径（列内容后续再定） */
  invite_view?: "arrive" | "initiated"
  /** 排序整批数据（不是只排当前页），字段名用列的 key */
  sort_by?: string
  sort_order?: "asc" | "desc"
  rule: ConversionRule
  /** 只在主动点「查询」时带上：让后端把这次转化分析写进分析日志 */
  log_analysis?: boolean
}
export interface PrincipalOption { key: string; label: string; subtypes: string[] }
export interface PrincipalMetadata {
  organizations: { id: string; name: string }[]
  products: PrincipalOption[]
  activity_types: PrincipalOption[]
  scope: "own" | "all"
  transaction_access: "none" | "summary" | "detail"
  can_view_follow_up: boolean
}
export interface PrincipalRow { id: string; details: string[]; [key: string]: string | number | string[] }
export interface PrincipalBreakdownCustomer {
  id?: string
  name: string
  /** 引流日期 */
  referral_date?: string
  deals: number
  /** 当前统计范围内是否产生过按升单配置判定的升单 */
  is_upsell?: boolean
  products?: PrincipalBreakdownItem[]
  /** 会员卡卡种成交（其他付费项目没有子类） */
  subtypes?: PrincipalBreakdownItem[]
  /** 按升单配置大类归组后的成交人数标记；单个客户在每类中最多一项 */
  upsell_levels?: PrincipalBreakdownItem[]
  /** 会员身份（未到店 / 398卡 / 30次卡 …） */
  identity?: string
  /** 承接人 */
  referrer_handler?: string
  follow_up_status?: string
  traffic_source?: string
  tags?: string[]
  // 以下五项是隐私字段：没有权限的角色后端不下发（前端也不出现在列表设置里）
  /** 到访目的 */
  visit_purpose?: string
  /** 创伤经历 */
  trauma_history?: string
  /** 当下卡点 */
  current_block?: string
  /** 工作情况 */
  work_info?: string
  /** 其他信息 */
  other_info?: string
  /** 统计区间内发起的邀约总人次（含取消） */
  initiated_count?: number
  /** 统计区间内的有效邀约人次（不含已取消） */
  invite_count?: number
  /** 统计区间内的取消邀约人次 */
  cancel_count?: number
  /** 统计区间内的未到场人次 */
  no_show_count?: number
  /** 统计区间内的到店人次 */
  arrive_count?: number
  /** 平均到店间隔，如 "12天"，无到店时为 "-" */
  visit_interval?: string
  /** 统计区间内到场参与的活动场次 */
  activity_count?: number
  /** 该客户在区间内出现过的邀约人（visit.referrer_handler） */
  inviters?: string[]
  /** 首次到店日期 YYYY-MM-DD（邀约到店列表排序用） */
  arrive_date?: string
  /** 首次到店时间 HH:MM */
  arrive_time?: string
  /** 来访需求（visit.needs） */
  needs?: string
  /** 首次到店记录上的邀约人 */
  arrive_inviter?: string
  /** 到店当天成交笔数 */
  same_day_deals?: number
  /** 统计区间内每次实际到店的记录，用于逐次展示和导出 */
  arrival_records?: Array<{ id: string; arrive_date: string; arrive_time: string; needs: string; arrive_inviter: string; same_day_deals: number }>
}
export interface PrincipalBreakdownItem {
  key: string
  label: string
  count: number
  hours?: number
  deal_count?: number
  initiated_count?: number
  invite_count?: number
  buyers?: number
  people?: number
  visits?: number
  same_day?: number
  related?: number
  subtypes?: PrincipalBreakdownItem[]
  products?: PrincipalBreakdownItem[]
  customers?: PrincipalBreakdownCustomer[]
}
export interface PrincipalBreakdown {
  deals?: PrincipalBreakdownItem[]
  buys?: PrincipalBreakdownItem[]
  courses?: { by_type: PrincipalBreakdownItem[]; by_teacher: PrincipalBreakdownItem[] }
  traffic?: PrincipalBreakdownItem[]
  /** 升单配置大类，顺序与配置页一致 */
  traffic_upsell_levels?: PrincipalBreakdownItem[]
  /** 邀约人维度：每人发起 / 邀约到店人次 */
  invite_inviters?: Array<{
    key: string
    label: string
    count: number
    initiated_count: number
    invite_count: number
    cancel_count?: number
    no_show_count?: number
    arrive_count?: number
    records?: Array<{
      id: string
      date: string
      visit_date: string
      customer_id: string
      customer: string
      name: string
      identity: string
      referrer?: string
      referrer_handler?: string
      follow_up_status?: string
      traffic_source?: string
      tags?: string[]
      deals?: number
      invite_count?: number
      cancel_count?: number
      no_show_count?: number
      arrive_count?: number
      activity_count?: number
      visit_interval?: string
      same_day_deals?: number
      arrive_inviter?: string
      visit_purpose?: string
      trauma_history?: string
      current_block?: string
      work_info?: string
      other_info?: string
      status: "cancelled" | "no_show" | "arrived"
      status_label: string
    }>
  }>
  // 引流客户还能按这三个维度继续筛
  traffic_filters?: {
    stage?: PrincipalBreakdownItem[]
    source?: PrincipalBreakdownItem[]
    tag?: PrincipalBreakdownItem[]
    upsell?: PrincipalBreakdownItem[]
    /** 会员身份人数（跟着当前所有筛选走，本身不是筛选项） */
    identity?: PrincipalBreakdownItem[]
  }
  /** 当前角色能看到哪些客户档案隐私字段（到访目的 / 创伤经历 / 当下卡点 / 工作情况 / 其他信息） */
  traffic_profile_fields?: string[]
}
export interface PrincipalResult extends PaginatedResponse<PrincipalRow> {
  summary: Record<string, string | number>
  /** 明细列表这一批的口径（已应用二级勾选）：成交量 / 成交人数 / 付费项目 */
  list_summary?: Record<string, number>
  breakdown?: PrincipalBreakdown
  columns: { key: string; label: string }[]
  notice: string
}
export interface SavedConversionRule { id: string; rule: ConversionRule; updated_at: string; owner_name?: string; can_manage?: boolean }
export interface PrincipalRuleFields {
  fields: AnalysisMetadata["fields"]
  operators: AnalysisMetadata["operators"]
}
export const principalApi = {
  metadata: () => request<PrincipalMetadata>("/api/principal/metadata"),
  ruleFields: () => request<PrincipalRuleFields>("/api/principal/rule-fields"),
  query: (query: PrincipalQuery, page: number, page_size: number) => request<PrincipalResult>("/api/principal/query", { method: "POST", body: JSON.stringify({ ...query, page, page_size }) }),
  rules: () => request<SavedConversionRule[]>("/api/principal/rules"),
  saveRule: (rule: ConversionRule, id?: string) => request<SavedConversionRule>(`/api/principal/rules${id ? "/" + id : ""}`, { method: id ? "PATCH" : "POST", body: JSON.stringify(rule) }),
  deleteRule: (id: string) => request<{ success: boolean }>(`/api/principal/rules/${id}`, { method: "DELETE" }),
  download: async (query: PrincipalQuery) => {
    const res = await fetch(`${API_BASE}/api/principal/export`, { method: "POST", headers: getAuthHeaders(), body: JSON.stringify(query) })
    applyNewToken(res)
    if (res.status === 401) handle401()
    if (!res.ok) { const data = await res.json().catch(() => ({})); throw new Error(data.detail || "导出失败") }
    return res.blob()
  },
}
let lastTrackedPagePath = ""
const DEVICE_ID_KEY = "wyyardDeviceId"

function getDeviceId(): string {
  const stored = localStorage.getItem(DEVICE_ID_KEY)
  if (stored) return stored
  const randomPart = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const deviceId = `pc-${randomPart}`
  localStorage.setItem(DEVICE_ID_KEY, deviceId)
  return deviceId
}

export function clearAuthState() {
  localStorage.removeItem("authToken")
  localStorage.removeItem("isLoggedIn")
  localStorage.removeItem("currentUser")
  localStorage.removeItem("userPermissions")
  localStorage.removeItem("userEditPermissions")
  localStorage.removeItem("userCustomerPermissions")
  localStorage.removeItem("userCustomerPermissionsClassRecords")
  localStorage.removeItem("userCustomerPermissionsPayment")
  localStorage.removeItem("customerPermissions")
  localStorage.removeItem("customerPermissionsClassRecords")
  localStorage.removeItem("customerPermissionsPayment")
}

function handle401() {
  clearAuthState()
  window.location.href = "/login"
}

// 滑动续期：后端在 token 剩余有效期不足一半时，通过响应头 X-New-Token 下发新 token
// （新 token 与原 token 仅 exp 不同，jti 不变）。每个响应拿到后都检查一次，
// 有则更新本地 authToken；401 响应仍走 handle401 清空逻辑，不受影响。
function applyNewToken(res: Response) {
  const newToken = res.headers.get("X-New-Token")
  if (newToken) localStorage.setItem("authToken", newToken)
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Client-Type": "pc",
    "X-Device-ID": getDeviceId(),
  }
  const pagePath = window.location.pathname
  if (pagePath && pagePath !== "/login") {
    headers["X-Page-Path"] = pagePath
    if (pagePath !== lastTrackedPagePath) {
      headers["X-Page-View"] = "1"
      lastTrackedPagePath = pagePath
    }
  }
  const token = localStorage.getItem("authToken")
  if (token) headers["Authorization"] = `Bearer ${token}`
  return headers
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const authHeaders = getAuthHeaders()
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...authHeaders, ...options?.headers },
  })
  applyNewToken(res)
  if (res.status === 401) { handle401(); throw new Error("登录已过期") }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    if (res.status === 409 && data.coarse_cancellation_required && !path.includes("confirm_coarse_cancellation=1")) {
      // 用应用内弹窗（不是浏览器自带那种）：逐条列出是谁的抵扣，避免看不清楚
      const rows: { nickname?: string; activity?: string; count?: number }[] =
        Array.isArray(data.coarse_cancellation_items) ? data.coarse_cancellation_items : []
      const confirmed = await confirmDialog(rows.length ? {
        title: "取消关联抵扣",
        description: "取消参与后，会同时撤销下面这些粗门次卡支付记录。",
        items: rows.map(row => `${row.nickname || "未命名客户"} · ${row.activity || "课程"} · ${row.count ?? 0} 次`),
        hint: "是否继续？",
        confirmText: "确认继续",
      } : {
        title: "取消关联抵扣",
        description: String(data.detail || ""),
        confirmText: "确认继续",
      })
      if (confirmed) return request<T>(`${path}${path.includes("?") ? "&" : "?"}confirm_coarse_cancellation=1`, options)
      throw new OperationCancelledError("已取消操作，名单和抵扣记录未改变")
    }
    const detail = data.detail
    const msg = Array.isArray(detail) ? detail.map((d: any) => cleanValidationMessage(d.msg, JSON.stringify(d))).join("; ") : (detail || `请求失败: ${res.status}`)
    throw new Error(msg)
  }
  return res.json()
}

// Agent
export interface Agent {
  id: string
  name: string
  description: string
  model: string
  system_prompt: string
  temperature: number
  max_tokens: number
  ai_config_id: string | null
  status: "running" | "stopped" | "error"
  created_at: string
  updated_at: string
  message_count: number
}

export interface AgentCreate {
  name: string
  description?: string
  model?: string
  system_prompt?: string
  temperature?: number
  max_tokens?: number
  ai_config_id?: string | null
}

export interface AgentUpdate {
  name?: string
  description?: string
  model?: string
  system_prompt?: string
  temperature?: number
  max_tokens?: number
  ai_config_id?: string | null
  status?: "running" | "stopped" | "error"
}

export interface AgentMessage {
  role: string
  content: string
  timestamp: string
}

export interface ChatRequest {
  message: string
  history: AgentMessage[]
}

export const agentApi = {
  list: () => request<Agent[]>("/api/agents"),
  get: (id: string) => request<Agent>(`/api/agents/${id}`),
  create: (data: AgentCreate) => request<Agent>("/api/agents", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: AgentUpdate) => request<Agent>(`/api/agents/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string) => request<{ message: string }>(`/api/agents/${id}`, { method: "DELETE" }),
  chat: (id: string, data: ChatRequest) => request<AgentMessage>(`/api/agents/${id}/chat`, { method: "POST", body: JSON.stringify(data) }),
}


// System Helper
export const systemHelperApi = {
  chat: async function* (
    message: string,
    history: { role: string; content: string }[] = [],
    userRole?: string,
    permissions?: string[],
    signal?: AbortSignal
  ): AsyncGenerator<string> {
    const headers = getAuthHeaders()
    let userId = ""
    let userName = ""
    try {
      const user = JSON.parse(localStorage.getItem("currentUser") || "{}")
      if (user?.id) {
        userId = user.id
        userName = user.owner || user.username || ""
      }
    } catch {}

    const res = await fetch("/api/system-helper/chat", {
      method: "POST",
      headers,
      body: JSON.stringify({ message, history, user_id: userId, user_name: userName, user_role: userRole, permissions }),
      signal,
    })

    applyNewToken(res)
    if (res.status === 401) { handle401(); throw new Error("登录已过期") }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      const detail = data.detail
      const msg = Array.isArray(detail) ? detail.map((d: any) => cleanValidationMessage(d.msg, JSON.stringify(d))).join("; ") : (detail || `请求失败: ${res.status}`)
      throw new Error(msg)
    }

    const reader = res.body?.getReader()
    if (!reader) throw new Error("无法读取响应流")

    const decoder = new TextDecoder()
    let buffer = ""

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() || ""

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6).trim()
          if (data === "[DONE]") return
          try {
            const parsed = JSON.parse(data)
            if (parsed.content) yield parsed.content
          } catch {}
        }
      }
    }
  },

  parseEntry: async (message: string, history: { role: string; content: string }[] = []) => {
    const res = await fetch("/api/system-helper/parse-entry", {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ message, history }),
    })
    applyNewToken(res)
    if (res.status === 401) { handle401(); throw new Error("登录已过期") }
    if (!res.ok) throw new Error(`请求失败: ${res.status}`)
    return res.json()
  },

  executeEntry: async (action: string, data: Record<string, any> = {}) => {
    const res = await fetch("/api/system-helper/execute-entry", {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ action, data }),
    })
    applyNewToken(res)
    if (res.status === 401) { handle401(); throw new Error("登录已过期") }
    if (!res.ok) throw new Error(`请求失败: ${res.status}`)
    return res.json()
  },

  analyzeImage: async (image: string, text: string = "", history: { role: string; content: string }[] = []) => {
    const res = await fetch("/api/system-helper/analyze-image", {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ image, text, history }),
    })
    applyNewToken(res)
    if (res.status === 401) { handle401(); throw new Error("登录已过期") }
    if (!res.ok) throw new Error(`请求失败: ${res.status}`)
    return res.json()
  },
}


// Chat History
export interface ChatRecord {
  id: string
  user_id: string
  user_name: string
  user_role: string
  role: "user" | "assistant"
  content: string
  session_id: string
  mode: string  // "visit" | "customer" | "system" | ""
  created_at: string
}

export const chatHistoryApi = {
  listPaginated: (params: { user_id?: string; date_from?: string; date_to?: string; keyword?: string; mode?: string }, page: number, pageSize: number = 20) => {
    const query = new URLSearchParams()
    if (params.user_id) query.set("user_id", params.user_id)
    if (params.date_from) query.set("date_from", params.date_from)
    if (params.date_to) query.set("date_to", params.date_to)
    if (params.keyword) query.set("keyword", params.keyword)
    if (params.mode) query.set("mode", params.mode)
    query.set("page", String(page))
    query.set("page_size", String(pageSize))
    return request<PaginatedResponse<ChatRecord>>(`/api/chat-history?${query.toString()}`)
  },
}


// Customer
export interface PaidContentItem {
  type: "399次卡" | "3999会员" | "半年卡" | "2w疗愈师"
  usage_count: number
  salesperson: string
}

export type CustomerFollowUpStatus = string

export interface FollowUpStatusConfig {
  id: string
  name: string
  description: string
  sort_order: number
  enabled: boolean
  usage_count: number
  created_at: string
  updated_at: string
}

export type CustomerTagScope = "public" | "private"

export interface CustomerTag {
  id: string
  name: string
  scope: CustomerTagScope
  description: string
  created_by_id: string
  created_by_name: string
  enabled: boolean
  usage_count: number
  created_at: string
  updated_at: string
}

export interface CustomerTagCreate {
  name: string
  scope: CustomerTagScope
  description: string
}

export interface Customer {
  id: string
  nickname: string
  name: string
  gender: string
  phone: string
  wechat: string
  age: string
  referrer: string
  referral_date: string
  referrer_handler: string
  follow_up_status: CustomerFollowUpStatus
  member_type: string
  service_teacher: string
  paid_content: PaidContentItem[]
  visit_count: number
  activity_count: number
  total_payment: number | null
  transaction_count?: number | null
  last_visit_date?: string | null
  core_situation: string
  need_tags: string
  follow_up_node: string
  follow_up_action: string
  positions: string[]
  self_tags: ("自我成长" | "共创" | "变现")[]
  work_status: string
  work_description: string
  basic_info: string
  assessment: string
  tags: string
  other_info: string
  traffic_source: string
  traffic_source_detail: string
  tracking_plan: string
  position_sort_orders: Record<string, number>
  space_id: string
  created_by: string
  created_at: string
  updated_at: string
  customer_tags?: CustomerTag[]
  contact_permissions?: ContactPermissions
  customer_access_permissions?: CustomerAccessPermissions
}

export type CustomerCreate = Omit<Customer, "id" | "created_at" | "updated_at">

export interface CustomerLight {
  id: string
  gender?: string
  nickname: string
  name: string
  member_type: string
  positions: string[]
  position_sort_orders: Record<string, number>
  created_at: string
  traffic_source: string
  traffic_source_detail: string
  referrer: string
  service_teacher?: string
  referral_date: string
  space_id: string
}

export interface DisabledCustomer {
  id: string
  nickname: string
  name: string
  member_type: string
  phone: string
  deleted_at: string
  deleted_by: string
}

let _customerLightCache: CustomerLight[] | null = null
let _customerLightCachedAt = 0
let _customerLightPromise: Promise<CustomerLight[]> | null = null
const CUSTOMER_LIGHT_CACHE_TTL = 30_000

export const customerApi = {
  list: () => request<Customer[]>("/api/customers"),
  light: (forceRefresh = false) => {
    if (!forceRefresh && _customerLightCache && Date.now() - _customerLightCachedAt < CUSTOMER_LIGHT_CACHE_TTL) {
      return Promise.resolve(_customerLightCache)
    }
    if (!forceRefresh && _customerLightPromise) return _customerLightPromise
    const pending = request<CustomerLight[]>("/api/customers/light")
      .then(data => {
        _customerLightCache = data
        _customerLightCachedAt = Date.now()
        return data
      })
      .finally(() => {
        if (_customerLightPromise === pending) _customerLightPromise = null
      })
    _customerLightPromise = pending
    return pending
  },
  batch: (ids: string[]) => request<CustomerLight[]>("/api/customers/batch", { method: "POST", body: JSON.stringify({ ids }) }),
  listPaginated: (page: number, pageSize: number, filters?: { nickname?: string; member_type?: string; referrer?: string; referrer_handler?: string; service_teacher?: string; member_types?: string; tag_ids?: string; tag_match?: "any" | "all"; sort_by?: string; sort_order?: string }) => {
    const params = new URLSearchParams()
    params.set("page", String(page))
    params.set("page_size", String(pageSize))
    if (filters?.nickname) params.set("nickname", filters.nickname)
    if (filters?.member_type) params.set("member_type", filters.member_type)
    if (filters?.referrer) params.set("referrer", filters.referrer)
    if (filters?.referrer_handler) params.set("referrer_handler", filters.referrer_handler)
    if (filters?.service_teacher) params.set("service_teacher", filters.service_teacher)
    if (filters?.member_types) params.set("member_types", filters.member_types)
    if (filters?.tag_ids) params.set("tag_ids", filters.tag_ids)
    if (filters?.tag_match) params.set("tag_match", filters.tag_match)
    if (filters?.sort_by) params.set("sort_by", filters.sort_by)
    if (filters?.sort_order) params.set("sort_order", filters.sort_order)
    return request<PaginatedResponse<Customer>>(`/api/customers?${params.toString()}`)
  },
  clearLightCache: () => { _customerLightCache = null; _customerLightCachedAt = 0; _customerLightPromise = null },
	  get: (id: string) => request<Customer>(`/api/customers/${id}`),
  accessContact: (id: string, field: ContactField, action: "view" | "copy") =>
    request<{ field: ContactField; value: string }>(`/api/customers/${id}/contact-access`, {
      method: "POST",
      body: JSON.stringify({ field, action }),
    }),
  create: (data: Partial<CustomerCreate>) => request<Customer>("/api/customers", { method: "POST", body: JSON.stringify(data) }).then(r => { _customerLightCache = null; return r }),
  update: (id: string, data: Partial<CustomerCreate>) => request<Customer>(`/api/customers/${id}`, { method: "PATCH", body: JSON.stringify(data) }).then(r => { _customerLightCache = null; return r }),
  delete: (id: string) => request<{ message: string }>(`/api/customers/${id}`, { method: "DELETE" }).then(r => { _customerLightCache = null; return r }),
  listDisabled: () => request<DisabledCustomer[]>(`/api/customers/disabled`),
  restore: (id: string) => request<Customer>(`/api/customers/${id}/restore`, { method: "POST" }).then(r => { _customerLightCache = null; return r }),
  permanentDelete: (id: string) => request<{ message: string }>(`/api/customers/${id}/permanent`, { method: "DELETE" }).then(r => { _customerLightCache = null; _customerLightCachedAt = 0; return r }),
  generateTags: (tags: string) => request<{ tags: string }>("/api/customers/generate-tags", { method: "POST", body: JSON.stringify({ tags }) }),
}

export type ServiceTeacherFollowUpFilter = "inactive" | "active" | "all"
export type ServiceTeacherFollowUpDefinition = "none" | "customer_info" | "follow_up" | "both"

export interface ServiceTeacherCustomerItem {
  id: string
  nickname: string
  name: string
  member_type: string
  follow_up_status: string
  service_teacher: string
  last_follow_up_at: string
  last_follow_up_category: string
  last_follow_up_by: string
  latest_customer_info_content: string
  latest_customer_info_by: string
  latest_customer_info_created_by: string
  latest_customer_info_at: string
  latest_follow_up_content: string
  latest_follow_up_by: string
  latest_follow_up_created_by: string
  latest_follow_up_at: string
  is_active: boolean
  is_active_30: boolean
}

export interface ServiceTeacherCustomerSummary {
  total: number
  active: number
  inactive: number
  active_30: number
  inactive_30: number
}

export interface ServiceTeacherCustomerResponse extends PaginatedResponse<ServiceTeacherCustomerItem> {
  teacher: string
  follow_up_days: number
  summary: ServiceTeacherCustomerSummary
}

// 课程记录的「参与者」页签：一行 = 某场课的一个参与者 + 当天的邀约备注
/** 备注条目：同一条备注可能是不同人分别填写的，按填写人拆开 */
export interface CourseParticipantNoteEntry {
  author: string
  created_by?: string
  content: string
  at: string
}

export interface CourseParticipantRow {
  id: string
  course_id: string
  course_date: string
  course_name: string
  activity_type_label: string
  customer_id: string
  nickname: string
  member_type: string
  identity_group: string
  visit_need: string
  customer_info: string
  follow_up: string
  visit_need_entries?: CourseParticipantNoteEntry[]
  customer_info_entries?: CourseParticipantNoteEntry[]
  follow_up_entries?: CourseParticipantNoteEntry[]
  visit_id: string
  participant_role?: string
  /** 同一门课（同名课程）在当前筛选范围内的参与次数 */
  same_course_count: number
}

/** 参与者按课程分组：一组 = 一堂课 */
export interface CourseParticipantGroup {
  course_id: string
  course_date: string
  course_name: string
  activity_type_label: string
  participants: CourseParticipantRow[]
}

export const serviceTeacherCustomerApi = {
  courseParticipants: (params: {
    teacher_id?: string
    date_from?: string
    date_to?: string
    all_dates?: boolean
    activity_type?: string
    keyword?: string
    member_type?: string
    identity_group?: string
    page: number
    page_size: number
  }) => {
    const query = new URLSearchParams()
    query.set("page", String(params.page))
    query.set("page_size", String(params.page_size))
    if (params.teacher_id) query.set("teacher_id", params.teacher_id)
    if (params.date_from) query.set("date_from", params.date_from)
    if (params.date_to) query.set("date_to", params.date_to)
    if (params.all_dates) query.set("all_dates", "true")
    if (params.activity_type) query.set("activity_type", params.activity_type)
    if (params.keyword) query.set("keyword", params.keyword)
    if (params.member_type) query.set("member_type", params.member_type)
    if (params.identity_group) query.set("identity_group", params.identity_group)
    return request<{
      items: CourseParticipantGroup[]
      total: number
      total_participants: number
      page: number
      page_size: number
      total_pages: number
      member_types: string[]
      identity_groups: string[]
    }>(`/api/service-teacher-customers/course-participants?${query.toString()}`)
  },
  recordExport: (content: string, courses = false) => request(`/api/service-teacher-customers/${courses ? 'course-export-audit' : 'export-audit'}`, {
    method: 'POST', body: JSON.stringify({ content }),
  }),
  metadata: (courses = false) => request<{
    current_teacher: string
    teachers: string[]
    teacher_options: Array<{ name: string; customer_id: string }>
  }>(`/api/service-teacher-customers/${courses ? 'course-metadata' : 'metadata'}`),
  list: (params: {
    service_teacher?: string
    follow_up_filter?: ServiceTeacherFollowUpFilter
    follow_up_definition?: ServiceTeacherFollowUpDefinition
    follow_up_days?: number
    nickname?: string
    page: number
    page_size: number
  }) => {
    const query = new URLSearchParams()
    if (params.service_teacher) query.set("service_teacher", params.service_teacher)
    if (params.follow_up_filter) query.set("follow_up_filter", params.follow_up_filter)
    if (params.follow_up_definition) query.set("follow_up_definition", params.follow_up_definition)
    if (params.nickname) query.set("nickname", params.nickname)
    query.set("page", String(params.page))
    query.set("page_size", String(params.page_size))
    return request<ServiceTeacherCustomerResponse>(`/api/service-teacher-customers?${query.toString()}`)
  },
}

export const customerTagApi = {
  list: (includeDisabled = false) => request<CustomerTag[]>(`/api/customer-tags${includeDisabled ? "?include_disabled=true" : ""}`),
  create: (data: CustomerTagCreate) => request<CustomerTag>("/api/customer-tags", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Omit<CustomerTagCreate, "scope">> & { enabled?: boolean }) => request<CustomerTag>(`/api/customer-tags/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (id: string) => request<{ message: string }>(`/api/customer-tags/${id}`, { method: "DELETE" }),
  listForCustomer: (customerId: string) => request<CustomerTag[]>(`/api/customer-tags/customers/${customerId}`),
  setForCustomer: (customerId: string, tagIds: string[]) => request<CustomerTag[]>(`/api/customer-tags/customers/${customerId}`, { method: "PUT", body: JSON.stringify({ tag_ids: tagIds }) }),
}

export const followUpStatusApi = {
  list: (includeDisabled = false) => request<FollowUpStatusConfig[]>(`/api/follow-up-statuses${includeDisabled ? "?include_disabled=true" : ""}`),
  create: (data: { name: string; description: string }) => request<FollowUpStatusConfig>("/api/follow-up-statuses", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<{ name: string; description: string; enabled: boolean }>) => request<FollowUpStatusConfig>(`/api/follow-up-statuses/${id}`, { method: "PUT", body: JSON.stringify(data) }),
}

// 升单配置：若干「大类」（名字 + 一组付费项目），数组顺序＝升单先后
export interface UpsellLevel { id: string; name: string; products: string[] }
export interface UpsellConfig { levels: UpsellLevel[]; products: { key: string; label: string }[] }
export const upsellConfigApi = {
  get: () => request<UpsellConfig>("/api/upsell-config"),
  save: (levels: UpsellLevel[]) =>
    request<UpsellConfig>("/api/upsell-config", { method: "PUT", body: JSON.stringify({ levels }) }),
}

// AI Config
export interface AIConfig {
  id: string
  name: string
  provider: "qwen" | "kimi" | "glm" | "deepseek" | "xiaomi"
  model: string
  api_key: string
  base_url: string
  system_prompt: string
  created_at: string
  updated_at: string
}

export type AIConfigCreate = Omit<AIConfig, "id" | "created_at" | "updated_at">

export const aiConfigApi = {
  list: () => request<AIConfig[]>("/api/ai-configs"),
  providers: () => request<Record<string, { base_url: string; model: string }>>("/api/ai-configs/providers"),
  create: (data: AIConfigCreate) => request<AIConfig>("/api/ai-configs", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<AIConfigCreate>) => request<AIConfig>(`/api/ai-configs/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string) => request<{ message: string }>(`/api/ai-configs/${id}`, { method: "DELETE" }),
}

// Miniapp AI Config (小程序共享模型配置，客户/邀约/课表共用)
export interface MiniappAIConfig {
  id: string
  provider: "qwen" | "kimi" | "glm" | "deepseek" | "xiaomi"
  model: string
  api_key: string
  has_api_key: boolean
  base_url: string
  temperature: number
  max_tokens: number
  created_at: string
  updated_at: string
}

export interface MiniappAIConfigUpdate {
  provider?: string
  model?: string
  api_key?: string
  base_url?: string
  temperature?: number
  max_tokens?: number
}

export const miniappAiConfigApi = {
  get: () => request<MiniappAIConfig>("/api/miniapp-ai-config"),
  providers: () => request<Record<string, { base_url: string; model: string }>>("/api/miniapp-ai-config/providers"),
  update: (data: MiniappAIConfigUpdate) => request<MiniappAIConfig>("/api/miniapp-ai-config", { method: "PATCH", body: JSON.stringify(data) }),
}

// Customer/Visit/Activity AI Config (提示词配置)
export interface PromptAIConfig {
  id: string
  name: string
  system_prompt: string
  created_at: string
  updated_at: string
}

export interface PromptAIConfigUpdate {
  name?: string
  system_prompt?: string
}

export type CustomerAIConfig = PromptAIConfig
export type CustomerAIConfigUpdate = PromptAIConfigUpdate
export type VisitAIConfig = PromptAIConfig
export type VisitAIConfigUpdate = PromptAIConfigUpdate
export type ActivityAIConfig = PromptAIConfig
export type ActivityAIConfigUpdate = PromptAIConfigUpdate

export const customerAiConfigApi = {
  get: () => request<CustomerAIConfig>("/api/customer-ai-config"),
  update: (data: CustomerAIConfigUpdate) => request<CustomerAIConfig>("/api/customer-ai-config", { method: "PATCH", body: JSON.stringify(data) }),
}

export const visitAiConfigApi = {
  get: () => request<VisitAIConfig>("/api/visit-ai-config"),
  update: (data: VisitAIConfigUpdate) => request<VisitAIConfig>("/api/visit-ai-config", { method: "PATCH", body: JSON.stringify(data) }),
}

export const activityAiConfigApi = {
  get: () => request<ActivityAIConfig>("/api/activity-ai-config"),
  update: (data: ActivityAIConfigUpdate) => request<ActivityAIConfig>("/api/activity-ai-config", { method: "PATCH", body: JSON.stringify(data) }),
}

// System Helper Config
export interface SystemHelperConfig {
  id: string
  provider: string
  model: string
  api_key: string
  has_api_key: boolean
  base_url: string
  system_prompt: string
  temperature: number
  max_tokens: number
  created_at: string
  updated_at: string
}

export interface SystemHelperConfigUpdate {
  provider?: string
  model?: string
  api_key?: string
  base_url?: string
  system_prompt?: string
  temperature?: number
  max_tokens?: number
}

export const systemHelperConfigApi = {
  get: () => request<SystemHelperConfig>("/api/system-helper-config"),
  providers: () => request<Record<string, { base_url: string; model: string }>>("/api/system-helper-config/providers"),
  update: (data: SystemHelperConfigUpdate) => request<SystemHelperConfig>("/api/system-helper-config", { method: "PATCH", body: JSON.stringify(data) }),
}

// Health
export const healthApi = {
  check: () => request<{ status: string; app: string }>("/api/health"),
}

// Visit Records
export interface ActivityInfo {
  name: string
  role: string
  type: string
  owner_name: string
  extra_badge: string
  is_welfare: boolean
}

export type VisitNoteCategory = "visit_need" | "customer_info" | "follow_up"

export interface VisitNoteSummary {
  id: string
  category: VisitNoteCategory
  content: string
  created_by_id: string
  created_by: string
  feedback_person_id: string
  feedback_person: string
  created_at: string
  updated_at: string
}

export interface FeedbackPeopleResponse {
  current_person: { customer_id: string; name: string }
  options: Array<{ customer_id: string; name: string }>
}

export interface VisitRecord {
  id: string
  created_by_id: string
  created_by: string
  visit_date: string
  visit_time: string
  customer_id: string
  nickname: string
  member_type: string
  referrer: string
  daily_card_usage: number
  needs: string
  referrer_handler: string
  receptionist: string
  goal: string
  space_id: string
  is_leader: boolean
  arrived: boolean
  arrival_time?: string
  cancelled: boolean
  visit_count: number
  arrived_count: number
  invitation_count: number
  cancelled_count: number
  activity_count: number
  welfare_count: number
  remaining_count: number | null  // -999=不限次, null=不限次, 0=无卡/已用完, >0=剩余次数
  activities: ActivityInfo[]
  experience: string
  feedback: string
  healing_notes: string
  visit_notes?: VisitNote[]
  daily_amount: number
  created_at: string
  updated_at: string
}

export interface VisitRecordCreate {
  visit_date: string
  visit_time?: string
  customer_id: string
  member_type?: string
  daily_card_usage?: number
  needs?: string
  referrer_handler?: string
  receptionist?: string
  goal?: string
  space_id?: string
  is_leader?: boolean
  arrived?: boolean
  arrival_time?: string
  cancelled?: boolean
  feedback?: string
  healing_notes?: string
}

export interface VisitNote extends VisitNoteSummary {
  visit_id: string
  category_label: string
  can_edit: boolean
  can_delete: boolean
}

export interface PreviousVisitNeed {
  visit_id: string
  visit_date: string
  content: string
}

export interface CustomerSearchResult {
  id: string
  nickname: string
  name: string
  member_type: string
  visit_count: number
  remaining?: number
}

export const visitApi = {
  list: (date?: string, customerId?: string, spaceId?: string) => {
    const params = new URLSearchParams()
    if (date) params.set("date", date)
    if (customerId) params.set("customer_id", customerId)
    if (spaceId) params.set("space_id", spaceId)
    const qs = params.toString()
    return request<VisitRecord[]>(`/api/visits${qs ? `?${qs}` : ""}`)
  },
  listPaginated: (date?: string, customerId?: string, page = 1, pageSize = 10, spaceId?: string) => {
    const params = new URLSearchParams()
    if (date) params.set("date", date)
    if (customerId) params.set("customer_id", customerId)
    if (spaceId) params.set("space_id", spaceId)
    params.set("page", String(page))
    params.set("page_size", String(pageSize))
    return request<PaginatedResponse<VisitRecord>>(`/api/visits?${params.toString()}`)
  },
  get: (id: string) => request<VisitRecord>(`/api/visits/${id}`),
  create: (data: VisitRecordCreate) => request<VisitRecord>("/api/visits", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<VisitRecordCreate> & { experience?: string; feedback?: string }) => request<VisitRecord>(`/api/visits/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string) => request<{ message: string }>(`/api/visits/${id}`, { method: "DELETE" }),
  searchCustomers: (keyword: string) => request<CustomerSearchResult[]>(`/api/visits/search-customers?q=${encodeURIComponent(keyword)}`),
  counts: (params?: { customerIds?: string; startDate?: string; endDate?: string; memberTypes?: string; spaceId?: string }) => {
    const qs = new URLSearchParams()
    if (params?.customerIds !== undefined) qs.set("customer_ids", params.customerIds)
    if (params?.startDate) qs.set("start_date", params.startDate)
    if (params?.endDate) qs.set("end_date", params.endDate)
    if (params?.memberTypes !== undefined) qs.set("member_types", params.memberTypes)
    if (params?.spaceId) qs.set("space_id", params.spaceId)
    const str = qs.toString()
    return request<Record<string, number>>(`/api/visits/counts${str ? `?${str}` : ""}`)
  },
  reorder: (ids: string[], movement?: { movedName: string; fromPosition: number; toPosition: number; date?: string; spaceId?: string }) =>
    request<{ message: string }>("/api/visits/reorder", {
      method: "POST",
      body: JSON.stringify({
        ids,
        moved_name: movement?.movedName,
        from_position: movement?.fromPosition,
        to_position: movement?.toPosition,
        date: movement?.date,
        space_id: movement?.spaceId,
      }),
    }),
}

export const visitNoteApi = {
  list: (visitId: string) => request<VisitNote[]>(`/api/visit-notes?visit_id=${encodeURIComponent(visitId)}`),
  listByVisits: (visitIds: string[]) => request<VisitNote[]>(`/api/visit-notes?visit_ids=${encodeURIComponent(visitIds.join(","))}`),
  previousVisitNeed: (customerId: string, beforeDate?: string, excludeVisitId?: string) => {
    const params = new URLSearchParams({ customer_id: customerId })
    if (beforeDate) params.set("before_date", beforeDate)
    if (excludeVisitId) params.set("exclude_visit_id", excludeVisitId)
    return request<PreviousVisitNeed | null>(`/api/visit-notes/previous-visit-need?${params.toString()}`)
  },
  feedbackPeople: () => request<FeedbackPeopleResponse>("/api/visit-notes/feedback-people"),
  create: (data: { visit_id: string; category: VisitNoteCategory; content: string; feedback_person_id?: string; feedback_person?: string }) =>
    request<VisitNote>("/api/visit-notes", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, content: string, feedbackPerson?: { id: string; name: string }) =>
    request<VisitNote>(`/api/visit-notes/${id}`, { method: "PATCH", body: JSON.stringify({
      content,
      ...(feedbackPerson ? { feedback_person_id: feedbackPerson.id, feedback_person: feedbackPerson.name } : {}),
    }) }),
  delete: (id: string) => request<{ ok: boolean }>(`/api/visit-notes/${id}`, { method: "DELETE" }),
}

// Course
export interface Course {
  id: string
  type: string  // 课程类型
  name: string
  teachers: string[]  // List of teacher IDs
  class_count: number
  organization_id: string  // 所属共创组织 ID
  sort_order: number
  created_at: string
  updated_at: string
}

export interface CourseCreate {
  type: string
  name: string
  teachers?: string[]
  class_count?: number
  organization_id?: string
  sort_order?: number
}

export const courseApi = {
  list: () => request<Course[]>("/api/courses"),
  listPaginated: (page: number, pageSize: number) => request<PaginatedResponse<Course>>(`/api/courses?page=${page}&page_size=${pageSize}`),
  create: (data: CourseCreate) => request<Course>("/api/courses", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<CourseCreate>) => request<Course>(`/api/courses/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string) => request<{ message: string }>(`/api/courses/${id}`, { method: "DELETE" }),
}

// Course Types
export interface CourseType {
  name: string
  organization_id: string
  list_image?: string
  detail_images?: string[]
  category?: string
}

export const courseTypeApi = {
  list: () => request<CourseType[]>("/api/course-types"),
  create: (name: string, organization_id?: string, list_image?: string, detail_images?: string[]) => request<CourseType>("/api/course-types", { method: "POST", body: JSON.stringify({ name, organization_id: organization_id || "", list_image: list_image || "", detail_images: detail_images || [] }) }),
  update: (name: string, data: { organization_id?: string; list_image?: string; detail_images?: string[] }) => request<{ message: string }>(`/api/course-types/${encodeURIComponent(name)}`, { method: "PATCH", body: JSON.stringify(data) }),
  rename: (oldName: string, newName: string) => request<{ message: string }>(`/api/course-types/${encodeURIComponent(oldName)}/rename`, { method: "PUT", body: JSON.stringify({ new_name: newName }) }),
  delete: (name: string) => request<{ message: string }>(`/api/course-types/${encodeURIComponent(name)}`, { method: "DELETE" }),
  reorder: (names: string[]) => request<CourseType[]>("/api/course-types", { method: "PATCH", body: JSON.stringify({ names }) }),
}

// Organization (共创组织)
export interface Organization {
  id: string
  name: string
  member_ids: string[]
  /** 服务端解析好的成员信息（不受客户可见范围影响） */
  members?: Array<{ id: string; nickname: string; name: string; member_type: string; visit_count: number; missing?: boolean }>
  /** 服务端解析好的引流人信息 */
  referrers?: Array<{ id: string; nickname: string; name: string; member_type: string; visit_count: number; missing?: boolean }>
  /** 服务端解析好的整体数据查阅人信息 */
  data_viewers?: Array<{ id: string; nickname: string; name: string; member_type: string; visit_count: number; missing?: boolean }>
  /** 引流归属：member＝按组织成员（默认）、all＝所有人、selected＝指定人员 */
  referrer_mode?: "member" | "all" | "selected"
  /** referrer_mode = selected 时的引流人客户 ID */
  referrer_ids?: string[]
  /** 没填引流人的客户是否算这个组织带来的（默认算） */
  include_unassigned_referrers?: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface OrganizationCreate {
  name: string
  member_ids?: string[]
  referrer_mode?: "member" | "all" | "selected"
  referrer_ids?: string[]
  include_unassigned_referrers?: boolean
  sort_order?: number
}

export const organizationApi = {
  list: () => request<Organization[]>("/api/organizations"),
  /** 全局整体数据查阅人：配置后默认属于每个组织 */
  listDataViewers: () => request<{ data_viewer_ids: string[] }>("/api/organizations/data-viewers"),
  setDataViewers: (data_viewer_ids: string[]) => request<{ data_viewer_ids: string[] }>("/api/organizations/data-viewers", {
    method: "PUT", body: JSON.stringify({ data_viewer_ids }),
  }),
  create: (data: OrganizationCreate) => request<Organization>("/api/organizations", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<OrganizationCreate>) => request<Organization>(`/api/organizations/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string) => request<{ message: string }>(`/api/organizations/${id}`, { method: "DELETE" }),
}

// Class Records
export interface Material {
  id: string
  name: string
  url: string
  size: number
}

export const uploadApi = {
  uploadPublicImage: async (file: File): Promise<Material> => {
    const formData = new FormData()
    formData.append("file", file)
    const token = localStorage.getItem("authToken")
    const uploadHeaders: Record<string, string> = {}
    if (token) uploadHeaders["Authorization"] = `Bearer ${token}`
    let res: Response
    try {
      res = await fetch(`${API_BASE}/api/uploads/public-images`, { method: "POST", headers: uploadHeaders, body: formData })
    } catch {
      throw new Error("网络连接异常，请检查网络后重试")
    }
    applyNewToken(res)
    if (res.status === 401) { handle401(); throw new Error("登录已过期") }
    if (res.status === 413) {
      throw new Error("图片超过服务器上传限制，请压缩至 2MB 内后重试")
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      const detail = data.detail
      const msg = Array.isArray(detail) ? detail.map((d: any) => cleanValidationMessage(d.msg, JSON.stringify(d))).join("; ") : (detail || `服务器返回错误（${res.status}）`)
      throw new Error(msg)
    }
    return res.json()
  },
  uploadMaterial: async (file: File): Promise<Material> => {
    const formData = new FormData()
    formData.append("file", file)
    const token = localStorage.getItem("authToken")
    const uploadHeaders: Record<string, string> = {}
    if (token) uploadHeaders["Authorization"] = `Bearer ${token}`
    const res = await fetch(`${API_BASE}/api/uploads/materials`, { method: "POST", headers: uploadHeaders, body: formData })
    applyNewToken(res)
    if (res.status === 401) { handle401(); throw new Error("登录已过期") }
    if (!res.ok) throw new Error("上传失败")
    return res.json()
  },
  deleteMaterial: (filename: string) => request<{ message: string }>(`/api/uploads/materials/${filename}`, { method: "DELETE" }),
}

export interface ClassRecord {
  created_by_id: string
  created_by: string
  id: string
  date: string
  start_time: string | null
  end_time: string | null
  course_id: string
  course_name: string
  course_type: string  // 活动类型（如：读书会、颂钵等）
  activity_name: string
  course_description: string
  course_review: string
  teacher_ids: string[]
  participant_ids: string[]
  participants?: ActivityDashboardParticipant[]
  withdrawn_participant_ids: string[]
  withdrawal_records: CourseWithdrawalEntry[]
  materials: Material[]
  groups: { name: string; member_ids: string[]; leader_id: string; deputy_id: string }[]
  is_public_welfare: boolean
  is_published: boolean
  activity_mode?: string
  membership_deduction_count: number
  space_id: string
  room_id: string
  room_name: string
  space_name: string
  created_at: string
  updated_at: string
}

export interface ActivityDashboardParticipant {
  id: string
  nickname: string
  withdrawn: boolean
}

export interface ClassRecordCreate {
  date: string
  start_time?: string | null
  end_time?: string | null
  course_id: string
  course_name: string
  course_type?: string  // 活动类型（如：读书会、颂钵等）
  activity_name?: string
  course_description?: string
  course_review?: string
  teacher_ids?: string[]
  participant_ids?: string[]
  is_public_welfare?: boolean
  is_published?: boolean
  activity_mode?: string
  membership_deduction_count?: number
  space_id?: string
  room_id?: string
  room_name?: string
  space_name?: string
}

export const classRecordApi = {
  list: (date?: string) => request<ClassRecord[]>(`/api/class-records${date ? `?date=${date}` : ""}`),
  listPaginated: (date: string | undefined, page: number, pageSize: number) => request<PaginatedResponse<ClassRecord>>(`/api/class-records?${date ? `date=${date}&` : ""}page=${page}&page_size=${pageSize}`),
  listUnified: (page: number, pageSize: number, params?: { type?: string; name?: string; start_date?: string; end_date?: string; space_id?: string; teacher_id?: string }) => {
    const qs = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
    if (params?.type) qs.set("type", params.type)
    if (params?.name) qs.set("name", params.name)
    if (params?.start_date) qs.set("start_date", params.start_date)
    if (params?.end_date) qs.set("end_date", params.end_date)
    if (params?.space_id) qs.set("space_id", params.space_id)
    if (params?.teacher_id) qs.set("teacher_id", params.teacher_id)
    return request<PaginatedResponse<UnifiedRecord>>(`/api/class-records/unified?${qs.toString()}`)
  },
  create: (data: ClassRecordCreate, conversion = false) => request<ClassRecord>(`/api/class-records${conversion ? "?conversion=true" : ""}`, { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<ClassRecordCreate>, conversion = false) => request<ClassRecord>(`/api/class-records/${id}${conversion ? "?conversion=true" : ""}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string, conversion = false) => request<{ message: string }>(`/api/class-records/${id}${conversion ? "?conversion=true" : ""}`, { method: "DELETE" }),
  updateParticipants: (id: string, participantIds: string[]) => request<ClassRecord & { warnings?: string[] }>(`/api/class-records/${id}/participants`, { method: "PATCH", body: JSON.stringify({ participant_ids: participantIds }) }),
  withdrawParticipant: (id: string, customerId: string) => request<ClassRecord>(`/api/class-records/${id}/withdrawals`, { method: "POST", body: JSON.stringify({ customer_id: customerId }) }),
  cancelWithdrawal: (id: string, customerId: string) => request<ClassRecord>(`/api/class-records/${id}/withdrawals/${customerId}`, { method: "DELETE" }),
  listWithdrawalsPaginated: (page: number, pageSize: number, params?: { nickname?: string; status?: string; start_date?: string; end_date?: string }) => {
    const query = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
    if (params?.nickname) query.set("nickname", params.nickname)
    if (params?.status && params.status !== "all") query.set("status", params.status)
    if (params?.start_date) query.set("start_date", params.start_date)
    if (params?.end_date) query.set("end_date", params.end_date)
    return request<PaginatedResponse<WithdrawalRecord>>(`/api/class-records/withdrawals?${query.toString()}`)
  },
  updateGroups: (id: string, groups: { name: string; member_ids: string[]; leader_id: string; deputy_id: string }[]) => request<ClassRecord & { warnings?: string[] }>(`/api/class-records/${id}/groups`, { method: "PATCH", body: JSON.stringify({ groups }) }),
  searchCustomers: (keyword: string) => request<CustomerSearchResult[]>(`/api/class-records/search-customers?q=${encodeURIComponent(keyword)}`),
  calendarCounts: () => request<Record<string, number>>("/api/class-records/calendar-counts"),
  dashboard: (date: string, spaceId?: string) => request<DashboardData>(`/api/class-records/dashboard?date=${date}${spaceId ? `&space_id=${spaceId}` : ""}`),
}

export type ActivityRecordType = "class" | "gcs" | "ers" | "eks" | "ics"

export const activityWithdrawalApi = {
  withdraw: (recordType: ActivityRecordType, recordId: string, customerId: string) =>
    recordType === "class"
      ? classRecordApi.withdrawParticipant(recordId, customerId)
      : request<Record<string, unknown>>(`/api/activity-withdrawals/${recordType}/${recordId}`, {
        method: "POST",
        body: JSON.stringify({ customer_id: customerId }),
      }),
  restore: (recordType: ActivityRecordType, recordId: string, customerId: string) =>
    recordType === "class"
      ? classRecordApi.cancelWithdrawal(recordId, customerId)
      : request<Record<string, unknown>>(`/api/activity-withdrawals/${recordType}/${recordId}/${customerId}`, {
        method: "DELETE",
      }),
}

export interface CourseWithdrawalEntry {
  id: string
  record_type: ActivityRecordType
  customer_id: string
  restored_count: number
  status: "active" | "cancelled"
  withdrawn_at: string
  withdrawn_by_id: string
  withdrawn_by: string
  cancelled_at?: string | null
  cancelled_by_id: string
  cancelled_by: string
}

export interface WithdrawalRecord {
  id: string
  record_type: ActivityRecordType
  record_id: string
  customer_id: string
  nickname: string
  activity_name: string
  course_type: string
  course_date: string
  start_time: string
  end_time: string
  space_name: string
  room_name: string
  restored_count: number
  status: "active" | "cancelled"
  withdrawn_at: string
  withdrawn_by: string
  cancelled_at?: string | null
  cancelled_by: string
  course_deleted: boolean
}

export interface DashboardData {
  class_records: ClassRecord[]
  gcs_sessions: GroupCaseSession[]
  ers_sessions: EmotionalReleaseSession[]
  eks_sessions: EnergyKnotSession[]
  ics_sessions: InternalCourseSession[]

  visits: VisitRecord[]
  visit_counts: Record<string, number>
  calendar_counts: Record<string, number>
  groupings: { date: string; groups: any[] }
}

export interface UnifiedRecord {
  type: "class" | "gcs" | "ers" | "eks" | "ics"
  data: any
  date: string
}

// Group Cases
export interface GroupCase {
  id: string
  customer_id: string
  nickname: string
  purchase_count: number
  amount: number
  notes: string
  closer_id: string | null
  closer_name: string | null
  closers: { id: string; name: string; amount: number }[]
  payment_method?: string
  organization_id: string | null
  deal_date: string | null
  effective_date: string | null
  expiry_date: string | null
  created_at: string
  updated_at: string
}

export interface GroupCaseCreate {
  customer_id: string
  nickname: string
  purchase_count?: number
  amount?: number
  notes?: string
  closer_id?: string | null
  closer_name?: string | null
  closers?: { id: string; name: string; amount: number }[]
  organization_id?: string | null
  effective_date?: string | null
  expiry_date?: string | null
}

export const groupCaseApi = {
  list: () => request<GroupCase[]>("/api/group-cases"),
  listPaginated: (page: number, pageSize: number, params?: { customer_ids?: string; nickname?: string; closer_name?: string }) => request<PaginatedResponse<GroupCase>>(`/api/group-cases?page=${page}&page_size=${pageSize}${params?.customer_ids ? `&customer_ids=${params.customer_ids}` : ""}${params?.nickname ? `&nickname=${encodeURIComponent(params.nickname)}` : ""}${params?.closer_name ? `&closer_name=${encodeURIComponent(params.closer_name)}` : ""}`),
  create: (data: GroupCaseCreate) => request<GroupCase>("/api/group-cases", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<GroupCaseCreate>) => request<GroupCase>(`/api/group-cases/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string) => request<{ message: string }>(`/api/group-cases/${id}`, { method: "DELETE" }),
  searchCustomers: (keyword: string) => request<CustomerSearchResult[]>(`/api/group-cases/search-customers?q=${encodeURIComponent(keyword)}`),
}

// Group Case Sessions
export interface GroupCaseSession {
  created_by_id: string
  created_by: string
  id: string
  date: string
  start_time: string | null
  end_time: string | null
  name: string
  owner_id: string
  owner_name: string
  description: string
  course_review: string
  participant_ids: string[]
  participants?: ActivityDashboardParticipant[]
  withdrawn_participant_ids: string[]
  withdrawal_records: CourseWithdrawalEntry[]
  teacher_ids: string[]
  host_id: string
  host_name: string
  materials: Material[]
  is_published: boolean
  activity_mode?: string
  membership_deduction_count: number
  space_id: string
  room_id: string
  room_name: string
  space_name: string
  created_at: string
  updated_at: string
}

export interface GroupCaseSessionCreate {
  date: string
  start_time?: string | null
  end_time?: string | null
  name?: string
  owner_id: string
  owner_name: string
  description?: string
  course_review?: string
  participant_ids?: string[]
  teacher_ids?: string[]
  host_id?: string
  host_name?: string
  is_published?: boolean
  activity_mode?: string
  membership_deduction_count?: number
  space_id?: string
  room_id?: string
  room_name?: string
  space_name?: string
}

export interface GroupCaseCustomerSearchResult {
  id: string
  nickname: string
  name: string
  member_type: string
  remaining: number
  positions?: string[]
}

export const groupCaseSessionApi = {
  list: (date?: string) => request<GroupCaseSession[]>(`/api/group-case-sessions${date ? `?date=${date}` : ""}`),
  listPaginated: (date: string | undefined, page: number, pageSize: number) => request<PaginatedResponse<GroupCaseSession>>(`/api/group-case-sessions?${date ? `date=${date}&` : ""}page=${page}&page_size=${pageSize}`),
  create: (data: GroupCaseSessionCreate, conversion = false) => request<GroupCaseSession>(`/api/group-case-sessions${conversion ? "?conversion=true" : ""}`, { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<GroupCaseSessionCreate>) => request<GroupCaseSession & { warnings?: string[] }>(`/api/group-case-sessions/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string, conversion = false) => request<{ message: string }>(`/api/group-case-sessions/${id}${conversion ? "?conversion=true" : ""}`, { method: "DELETE" }),
  searchCustomers: (keyword: string, date?: string) => request<GroupCaseCustomerSearchResult[]>(`/api/group-case-sessions/search-customers?q=${encodeURIComponent(keyword)}${date ? `&date=${encodeURIComponent(date)}` : ""}`),
}

// OH Card Readings
export interface OhCardReading {
  id: string
  customer_id: string
  nickname: string
  purchase_count: number
  diagnosis_duration: number
  amount: number
  notes: string
  diagnosis_teacher: string
  closer_id: string | null
  closer_name: string | null
  closers: { id: string; name: string; amount: number }[]
  payment_method?: string
  organization_id: string | null
  deal_date: string | null
  created_at: string
  updated_at: string
}

export interface OhCardReadingCreate {
  customer_id: string
  nickname: string
  purchase_count?: number
  diagnosis_duration?: number
  diagnosis_teacher?: string
  amount?: number
  notes?: string
  closer_id?: string | null
  closer_name?: string | null
  closers?: { id: string; name: string; amount: number }[]
  organization_id?: string | null
}

export const ohCardReadingApi = {
  list: () => request<OhCardReading[]>("/api/oh-card-readings"),
  listPaginated: (page: number, pageSize: number, params?: { customer_ids?: string; nickname?: string; closer_name?: string }) => request<PaginatedResponse<OhCardReading>>(`/api/oh-card-readings?page=${page}&page_size=${pageSize}${params?.customer_ids ? `&customer_ids=${params.customer_ids}` : ""}${params?.nickname ? `&nickname=${encodeURIComponent(params.nickname)}` : ""}${params?.closer_name ? `&closer_name=${encodeURIComponent(params.closer_name)}` : ""}`),
  create: (data: OhCardReadingCreate) => request<OhCardReading>("/api/oh-card-readings", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<OhCardReadingCreate>) => request<OhCardReading>(`/api/oh-card-readings/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string) => request<{ message: string }>(`/api/oh-card-readings/${id}`, { method: "DELETE" }),
  searchCustomers: (keyword: string) => request<CustomerSearchResult[]>(`/api/oh-card-readings/search-customers?q=${encodeURIComponent(keyword)}`),
}

// Tea Seat Fee
export interface TeaSeatFee {
  id: string
  customer_id: string
  nickname: string
  quantity: number
  amount: number
  notes: string
  closer_id: string | null
  closer_name: string | null
  closers: { id: string; name: string; amount: number }[]
  payment_method?: string
  organization_id: string | null
  deal_date: string | null
  created_at: string
  updated_at: string
}

export interface TeaSeatFeeCreate {
  customer_id: string
  nickname: string
  quantity?: number
  amount?: number
  notes?: string
  closer_id?: string | null
  closer_name?: string | null
  closers?: { id: string; name: string; amount: number }[]
  payment_method?: string
  organization_id?: string | null
  deal_date?: string | null
}

export const teaSeatFeeApi = {
  list: () => request<TeaSeatFee[]>("/api/tea-seat-fees"),
  listPaginated: (page: number, pageSize: number, params?: { customer_ids?: string; nickname?: string; closer_name?: string }) => request<PaginatedResponse<TeaSeatFee>>(`/api/tea-seat-fees?page=${page}&page_size=${pageSize}${params?.customer_ids ? `&customer_ids=${params.customer_ids}` : ""}${params?.nickname ? `&nickname=${encodeURIComponent(params.nickname)}` : ""}${params?.closer_name ? `&closer_name=${encodeURIComponent(params.closer_name)}` : ""}`),
  create: (data: TeaSeatFeeCreate) => request<TeaSeatFee>("/api/tea-seat-fees", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<TeaSeatFeeCreate>) => request<TeaSeatFee>(`/api/tea-seat-fees/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string) => request<{ message: string }>(`/api/tea-seat-fees/${id}`, { method: "DELETE" }),
  searchCustomers: (keyword: string) => request<CustomerSearchResult[]>(`/api/tea-seat-fees/search-customers?q=${encodeURIComponent(keyword)}`),
}

// Offline Courses
export interface OfflineCourse {
  id: string
  customer_id: string
  nickname: string
  effective_date: string
  validity_value: number
  validity_unit: string
  amount: number
  notes: string
  closer_id: string | null
  closer_name: string | null
  closers: { id: string; name: string; amount: number }[]
  payment_method?: string
  organization_id: string | null
  deal_date: string | null
  created_at: string
  updated_at: string
}

export interface OfflineCourseCreate {
  customer_id: string
  nickname: string
  effective_date?: string
  validity_value?: number
  validity_unit?: string
  amount?: number
  notes?: string
  closer_id?: string | null
  closer_name?: string | null
  closers?: { id: string; name: string; amount: number }[]
  payment_method?: string
  organization_id?: string | null
  deal_date?: string | null
}

export const offlineCourseApi = {
  list: () => request<OfflineCourse[]>("/api/offline-courses"),
  listPaginated: (page: number, pageSize: number, params?: { customer_ids?: string; nickname?: string; closer_name?: string }) => {
    const qs = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
    if (params) Object.entries(params).forEach(([k, v]) => { if (v) qs.set(k, v) })
    return request<PaginatedResponse<OfflineCourse>>(`/api/offline-courses?${qs}`)
  },
  create: (data: OfflineCourseCreate) =>
    request<OfflineCourse>("/api/offline-courses", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<OfflineCourseCreate>) =>
    request<OfflineCourse>(`/api/offline-courses/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string) => request<{ message: string }>(`/api/offline-courses/${id}`, { method: "DELETE" }),
  searchCustomers: (keyword: string) => request<CustomerSearchResult[]>(`/api/offline-courses/search-customers?q=${encodeURIComponent(keyword)}`),
}

// Energy Knots
export interface EnergyKnot {
  id: string
  customer_id: string
  nickname: string
  purchase_count: number
  amount: number
  notes: string
  closer_id: string | null
  closer_name: string | null
  closers: { id: string; name: string; amount: number }[]
  payment_method?: string
  organization_id: string | null
  deal_date: string | null
  effective_date: string | null
  expiry_date: string | null
  created_at: string
  updated_at: string
}

export interface EnergyKnotCreate {
  customer_id: string
  nickname: string
  purchase_count?: number
  amount?: number
  notes?: string
  closer_id?: string | null
  closer_name?: string | null
  closers?: { id: string; name: string; amount: number }[]
  organization_id?: string | null
  effective_date?: string | null
  expiry_date?: string | null
}

export const energyKnotApi = {
  list: () => request<EnergyKnot[]>("/api/energy-knots"),
  listPaginated: (page: number, pageSize: number, params?: { customer_ids?: string; nickname?: string; closer_name?: string }) => request<PaginatedResponse<EnergyKnot>>(`/api/energy-knots?page=${page}&page_size=${pageSize}${params?.customer_ids ? `&customer_ids=${params.customer_ids}` : ""}${params?.nickname ? `&nickname=${encodeURIComponent(params.nickname)}` : ""}${params?.closer_name ? `&closer_name=${encodeURIComponent(params.closer_name)}` : ""}`),
  create: (data: EnergyKnotCreate) => request<EnergyKnot>("/api/energy-knots", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<EnergyKnotCreate>) => request<EnergyKnot>(`/api/energy-knots/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string) => request<{ message: string }>(`/api/energy-knots/${id}`, { method: "DELETE" }),
  searchCustomers: (keyword: string) => request<CustomerSearchResult[]>(`/api/energy-knots/search-customers?q=${encodeURIComponent(keyword)}`),
}

// Emotional Releases
export interface EmotionalRelease {
  id: string
  customer_id: string
  nickname: string
  purchase_count: number
  amount: number
  notes: string
  closer_id: string | null
  closer_name: string | null
  closers: { id: string; name: string; amount: number }[]
  payment_method?: string
  organization_id: string | null
  deal_date: string | null
  effective_date: string | null
  expiry_date: string | null
  created_at: string
  updated_at: string
}

export interface EmotionalReleaseCreate {
  customer_id: string
  nickname: string
  purchase_count?: number
  amount?: number
  notes?: string
  closer_id?: string | null
  closer_name?: string | null
  closers?: { id: string; name: string; amount: number }[]
  organization_id?: string | null
  effective_date?: string | null
  expiry_date?: string | null
}

export const emotionalReleaseApi = {
  list: () => request<EmotionalRelease[]>("/api/emotional-releases"),
  listPaginated: (page: number, pageSize: number, params?: { customer_ids?: string; nickname?: string; closer_name?: string }) => request<PaginatedResponse<EmotionalRelease>>(`/api/emotional-releases?page=${page}&page_size=${pageSize}${params?.customer_ids ? `&customer_ids=${params.customer_ids}` : ""}${params?.nickname ? `&nickname=${encodeURIComponent(params.nickname)}` : ""}${params?.closer_name ? `&closer_name=${encodeURIComponent(params.closer_name)}` : ""}`),
  create: (data: EmotionalReleaseCreate) => request<EmotionalRelease>("/api/emotional-releases", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<EmotionalReleaseCreate>) => request<EmotionalRelease>(`/api/emotional-releases/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string) => request<{ message: string }>(`/api/emotional-releases/${id}`, { method: "DELETE" }),
  searchCustomers: (keyword: string) => request<CustomerSearchResult[]>(`/api/emotional-releases/search-customers?q=${encodeURIComponent(keyword)}`),
}

// Emotional Release Sessions
export interface EmotionalReleaseSession {
  created_by_id: string
  created_by: string
  id: string
  date: string
  start_time: string | null
  end_time: string | null
  name: string
  owner_id: string
  owner_name: string
  description: string
  course_review: string
  participant_ids: string[]
  participants?: ActivityDashboardParticipant[]
  withdrawn_participant_ids: string[]
  withdrawal_records: CourseWithdrawalEntry[]
  teacher_ids: string[]
  host_id: string
  host_name: string
  materials: Material[]
  is_published: boolean
  activity_mode?: string
  membership_deduction_count: number
  space_id: string
  room_id: string
  room_name: string
  space_name: string
  created_at: string
  updated_at: string
}

export interface EmotionalReleaseSessionCreate {
  date: string
  start_time?: string | null
  end_time?: string | null
  name?: string
  owner_id: string
  owner_name: string
  description?: string
  course_review?: string
  participant_ids?: string[]
  teacher_ids?: string[]
  host_id?: string
  host_name?: string
  is_published?: boolean
  activity_mode?: string
  membership_deduction_count?: number
  space_id?: string
  room_id?: string
  room_name?: string
  space_name?: string
}

export interface EmotionalReleaseCustomerSearchResult {
  id: string
  nickname: string
  name: string
  member_type: string
  remaining: number
  positions?: string[]
}

export const emotionalReleaseSessionApi = {
  list: (date?: string) => request<EmotionalReleaseSession[]>(`/api/emotional-release-sessions${date ? `?date=${date}` : ""}`),
  listPaginated: (date: string | undefined, page: number, pageSize: number) => request<PaginatedResponse<EmotionalReleaseSession>>(`/api/emotional-release-sessions?${date ? `date=${date}&` : ""}page=${page}&page_size=${pageSize}`),
  create: (data: EmotionalReleaseSessionCreate, conversion = false) => request<EmotionalReleaseSession>(`/api/emotional-release-sessions${conversion ? "?conversion=true" : ""}`, { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<EmotionalReleaseSessionCreate>) => request<EmotionalReleaseSession & { warnings?: string[] }>(`/api/emotional-release-sessions/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string, conversion = false) => request<{ message: string }>(`/api/emotional-release-sessions/${id}${conversion ? "?conversion=true" : ""}`, { method: "DELETE" }),
  searchCustomers: (keyword: string, date?: string) => request<EmotionalReleaseCustomerSearchResult[]>(`/api/emotional-release-sessions/search-customers?q=${encodeURIComponent(keyword)}${date ? `&date=${encodeURIComponent(date)}` : ""}`),
}

// Energy Knot Sessions
export interface EnergyKnotSession {
  created_by_id: string
  created_by: string
  id: string
  date: string
  start_time: string | null
  end_time: string | null
  owner_id: string
  owner_name: string
  name: string
  description: string | null
  course_description: string
  course_review: string
  participant_ids: string[]
  participants?: ActivityDashboardParticipant[]
  withdrawn_participant_ids: string[]
  withdrawal_records: CourseWithdrawalEntry[]
  teacher_ids: string[]
  host_id: string
  host_name: string
  is_published: boolean
  activity_mode?: string
  membership_deduction_count: number
  space_id: string
  room_id: string
  room_name: string
  space_name: string
  created_at: string
  updated_at: string
}

export interface EnergyKnotSessionCreate {
  date: string
  start_time?: string | null
  end_time?: string | null
  owner_id: string
  owner_name: string
  name?: string
  description?: string
  course_description?: string
  course_review?: string
  participant_ids?: string[]
  teacher_ids?: string[]
  host_id?: string
  host_name?: string
  is_published?: boolean
  activity_mode?: string
  membership_deduction_count?: number
  space_id?: string
  room_id?: string
  room_name?: string
  space_name?: string
}

export interface EnergyKnotCustomerSearchResult {
  id: string
  nickname: string
  name: string
  member_type: string
  remaining: number
}

export const energyKnotSessionApi = {
  list: (date?: string) => request<EnergyKnotSession[]>(`/api/energy-knot-sessions${date ? `?date=${date}` : ""}`),
  listPaginated: (date: string | undefined, page: number, pageSize: number) => request<PaginatedResponse<EnergyKnotSession>>(`/api/energy-knot-sessions?${date ? `date=${date}&` : ""}page=${page}&page_size=${pageSize}`),
  create: (data: EnergyKnotSessionCreate, conversion = false) => request<EnergyKnotSession>(`/api/energy-knot-sessions${conversion ? "?conversion=true" : ""}`, { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<EnergyKnotSessionCreate>) => request<EnergyKnotSession & { warnings?: string[] }>(`/api/energy-knot-sessions/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string, conversion = false) => request<{ message: string }>(`/api/energy-knot-sessions/${id}${conversion ? "?conversion=true" : ""}`, { method: "DELETE" }),
  searchCustomers: (keyword: string, date?: string) => request<EnergyKnotCustomerSearchResult[]>(`/api/energy-knot-sessions/search-customers?q=${encodeURIComponent(keyword)}${date ? `&date=${encodeURIComponent(date)}` : ""}`),
}

// Internal Course Sessions
export interface InternalCourseSession {
  created_by_id: string
  created_by: string
  id: string
  date: string
  start_time: string | null
  end_time: string | null
  course_type: string
  course_name: string
  course_description: string
  course_review: string
  teacher_ids: string[]
  host_id: string
  host_name: string
  participant_ids: string[]
  participants?: ActivityDashboardParticipant[]
  withdrawn_participant_ids: string[]
  withdrawal_records: CourseWithdrawalEntry[]
  materials: Material[]
  is_published: boolean
  activity_mode?: string
  membership_deduction_count: number
  space_id: string
  room_id: string
  room_name: string
  space_name: string
  created_at: string
  updated_at: string
}

export interface InternalCourseSessionCreate {
  date: string
  start_time?: string | null
  end_time?: string | null
  course_type?: string
  course_name: string
  course_description?: string
  course_review?: string
  teacher_ids?: string[]
  host_id?: string
  host_name?: string
  participant_ids?: string[]
  is_published?: boolean
  activity_mode?: string
  membership_deduction_count?: number
  space_id?: string
  room_id?: string
  room_name?: string
  space_name?: string
}

export interface InternalCourseSessionCustomerSearchResult {
  id: string
  nickname: string
  name: string
  member_type: string
}

export const internalCourseSessionApi = {
  list: (date?: string) => request<InternalCourseSession[]>(`/api/internal-course-sessions${date ? `?date=${date}` : ""}`),
  listPaginated: (date: string | undefined, page: number, pageSize: number) => request<PaginatedResponse<InternalCourseSession>>(`/api/internal-course-sessions?${date ? `date=${date}&` : ""}page=${page}&page_size=${pageSize}`),
  create: (data: InternalCourseSessionCreate, conversion = false) => request<InternalCourseSession>(`/api/internal-course-sessions${conversion ? "?conversion=true" : ""}`, { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<InternalCourseSessionCreate>, conversion = false) => request<InternalCourseSession & { warnings?: string[] }>(`/api/internal-course-sessions/${id}${conversion ? "?conversion=true" : ""}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string, conversion = false) => request<{ message: string }>(`/api/internal-course-sessions/${id}${conversion ? "?conversion=true" : ""}`, { method: "DELETE" }),
  searchCustomers: (keyword: string) => request<InternalCourseSessionCustomerSearchResult[]>(`/api/internal-course-sessions/search-customers?q=${encodeURIComponent(keyword)}`),
}

// Internal Courses
export interface InternalCourse {
  id: string
  customer_id: string
  nickname: string
  course_type: string
  price: number
  effective_date: string
  expiry_date: string | null
  notes: string
  closer_id: string | null
  closer_name: string | null
  closers: { id: string; name: string; amount: number }[]
  payment_method?: string
  organization_id: string | null
  deal_date: string | null
  created_at: string
  updated_at: string
}

export interface InternalCourseCreate {
  customer_id: string
  nickname: string
  course_type: string
  price: number
  effective_date: string
  expiry_date?: string | null
  closer_id?: string | null
  closer_name?: string | null
  closers?: { id: string; name: string; amount: number }[]
  notes?: string
  organization_id?: string | null
}

export const internalCourseApi = {
  list: () => request<InternalCourse[]>("/api/internal-courses"),
  listPaginated: (page: number, pageSize: number, params?: { customer_ids?: string; nickname?: string; closer_name?: string }) => request<PaginatedResponse<InternalCourse>>(`/api/internal-courses?page=${page}&page_size=${pageSize}${params?.customer_ids ? `&customer_ids=${params.customer_ids}` : ""}${params?.nickname ? `&nickname=${encodeURIComponent(params.nickname)}` : ""}${params?.closer_name ? `&closer_name=${encodeURIComponent(params.closer_name)}` : ""}`),
  create: (data: InternalCourseCreate) => request<InternalCourse>("/api/internal-courses", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<InternalCourseCreate>) => request<InternalCourse>(`/api/internal-courses/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string) => request<{ message: string }>(`/api/internal-courses/${id}`, { method: "DELETE" }),
  searchCustomers: (keyword: string) => request<CustomerSearchResult[]>(`/api/internal-courses/search-customers?q=${encodeURIComponent(keyword)}`),
}

// Membership Cards
export interface MembershipCard {
  agreement_status?: "unsigned" | "signed" | null
  id: string
  customer_id: string
  nickname: string
  card_type: string
  price: number
  effective_date: string
  duration_type: string | null
  duration_value: number | null
  remaining_count: number | null
  expiry_date: string | null
  closer_id: string | null
  closer_name: string | null
  closers: { id: string; name: string; amount: number }[]
  payment_method?: string
  organization_id: string | null
  deal_date: string | null
  notes: string
  created_at: string
  updated_at: string
  voided?: boolean
  voided_at?: string | null
}

export interface MembershipCardCreate {
  agreement_status?: "unsigned" | "signed" | null
  customer_id: string
  nickname: string
  card_type: string
  price: number
  effective_date: string
  duration_type?: string | null
  duration_value?: number | null
  remaining_count?: number | null
  expiry_date?: string | null
  closer_id?: string | null
  closer_name?: string | null
  closers?: { id: string; name: string; amount: number }[]
  notes?: string
  organization_id?: string | null
}

export const membershipCardApi = {
  list: () => request<MembershipCard[]>("/api/membership-cards"),
  listPaginated: (page: number, pageSize: number, params?: { customer_ids?: string; nickname?: string; closer_name?: string; card_type?: string }) => request<PaginatedResponse<MembershipCard>>(`/api/membership-cards?page=${page}&page_size=${pageSize}${params?.customer_ids ? `&customer_ids=${params.customer_ids}` : ""}${params?.nickname ? `&nickname=${encodeURIComponent(params.nickname)}` : ""}${params?.closer_name ? `&closer_name=${encodeURIComponent(params.closer_name)}` : ""}${params?.card_type ? `&card_type=${encodeURIComponent(params.card_type)}` : ""}`),
  create: (data: MembershipCardCreate) => request<MembershipCard>("/api/membership-cards", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<MembershipCardCreate>) => request<MembershipCard>(`/api/membership-cards/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string) => request<{ message: string }>(`/api/membership-cards/${id}`, { method: "DELETE" }),
  searchCustomers: (keyword: string) => request<CustomerSearchResult[]>(`/api/membership-cards/search-customers?q=${encodeURIComponent(keyword)}`),
}

export interface AgreementSigning {
  id: string
  customer_id: string
  nickname: string
  card_type: string
  deal_date: string | null
  effective_date: string
  expiry_date: string | null
  organization_name: string
  closer_names: string
  agreement_status: "unsigned" | "signed"
  period: string
  can_sign: boolean
  can_change_status: boolean
}
export type AgreementSigningResult = PaginatedResponse<AgreementSigning> & { counts: { unsigned: number; signed: number } }
export const agreementSigningApi = {
  list: (tab: string, nickname: string, page: number) => request<AgreementSigningResult>(`/api/agreement-signings?tab=${tab}&nickname=${encodeURIComponent(nickname)}&page=${page}&page_size=20`),
  sign: (id: string, status: "unsigned" | "signed" = "signed") => request(`/api/agreement-signings/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ agreement_status: status }) }),
}

// Other Projects
export interface OtherProject {
  id: string
  customer_id: string
  nickname: string
  category: string | null
  project_name: string
  fee: number
  activity_mode: string
  effective_date: string
  duration_type: string | null
  duration_value: number | null
  remaining_count: number | null
  expiry_date: string | null
  notes: string
  closer_id: string | null
  closer_name: string | null
  closers: { id: string; name: string; amount: number }[]
  payment_method?: string
  organization_id: string | null
  deal_date: string | null
  created_at: string
  updated_at: string
}

export interface OtherProjectCreate {
  customer_id: string
  nickname: string
  category?: string | null
  project_name: string
  fee: number
  activity_mode?: string
  effective_date: string
  duration_type?: string | null
  duration_value?: number | null
  remaining_count?: number | null
  expiry_date?: string | null
  closer_id?: string | null
  closer_name?: string | null
  closers?: { id: string; name: string; amount: number }[]
  notes?: string
  organization_id?: string | null
}

export const otherProjectApi = {
  list: () => request<OtherProject[]>("/api/other-projects"),
  listPaginated: (page: number, pageSize: number, params?: { customer_ids?: string; nickname?: string; closer_name?: string }) => request<PaginatedResponse<OtherProject>>(`/api/other-projects?page=${page}&page_size=${pageSize}${params?.customer_ids ? `&customer_ids=${params.customer_ids}` : ""}${params?.nickname ? `&nickname=${encodeURIComponent(params.nickname)}` : ""}${params?.closer_name ? `&closer_name=${encodeURIComponent(params.closer_name)}` : ""}`),
  create: (data: OtherProjectCreate) => request<OtherProject>("/api/other-projects", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<OtherProjectCreate>) => request<OtherProject>(`/api/other-projects/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string) => request<{ message: string }>(`/api/other-projects/${id}`, { method: "DELETE" }),
  searchCustomers: (keyword: string) => request<CustomerSearchResult[]>(`/api/other-projects/search-customers?q=${encodeURIComponent(keyword)}`),
  getAvailableProjects: (customerId: string) => request<{ id: string; project_name: string; activity_mode: string; remaining_count: number | null; effective_date: string; expiry_date: string; created_at: string }[]>(`/api/other-projects/${customerId}/available-projects`),
  deduct: (data: { customer_id: string; other_project_id: string; count: number }) => request<any>("/api/other-projects/deductions", { method: "POST", body: JSON.stringify(data) }),
  listDeductions: (customerId?: string) => request<OtherProjectDeduction[]>(`/api/other-projects/deductions${customerId ? `?customer_id=${customerId}` : ""}`),
}

export interface OtherProjectDeduction {
  id: string
  customer_id: string
  nickname: string
  other_project_id: string
  project_name: string
  activity_mode: string
  project_created_at: string
  count: number
  deduction_date: string
  remaining_after: number | null
  created_at: string
}

export interface ProjectDeduction {
  cancelled?: boolean
  cancellation_reason?: string
  id: string
  customer_id: string
  nickname: string
  project_type: string
  project_id: string
  project_name: string
  count: number
  deduction_date: string
  remaining_after: number | null
  reason: string
  notes?: string
  created_by: string
  updated_by: string
  closer_id?: string
  closer_name?: string
  closers?: Array<{ id: string; name: string; amount: number }>
  organization_id?: string
  organization_name?: string
  created_at: string
  source_activity_type?: string
  source_activity_id?: string
  source_activity_key?: string
  source_activity_name?: string
  source_activity_date?: string
  source_organization_id?: string
  source_organization_name?: string
  source_space_id?: string
  source_space_name?: string
}

export interface CoarseDoorCourseOption {
  record_type: string
  record_id: string
  name: string
  course_type: string
  date: string
  start_time: string
  deduction_count: number
  organization_ids: string[]
  space_id: string
  space_name: string
}

export interface CoarseDoorOptions {
  organizations: { id: string; name: string }[]
  course_organizations: { id: string; name: string }[]
  settlement_organizations: { id: string; name: string }[]
  courses: CoarseDoorCourseOption[]
}

export const projectDeductionApi = {
  list: (customerId?: string) =>
    request<ProjectDeduction[]>(`/api/project-deductions${customerId ? `?customer_id=${customerId}` : ""}`),
  listPaginated: (page: number, pageSize: number, params?: Record<string, string>) => {
    const qs = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
    if (params) Object.entries(params).forEach(([k, v]) => { if (v) qs.set(k, v) })
    return request<PaginatedResponse<ProjectDeduction>>(`/api/project-deductions?${qs}`)
  },
  create: (data: { customer_id: string; project_type: string; project_id: string; count: number; reason: string; created_by?: string }) =>
    request<ProjectDeduction>("/api/project-deductions", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: { count: number; reason?: string; updated_by?: string }) =>
    request<ProjectDeduction>(`/api/project-deductions/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string) =>
    request<void>(`/api/project-deductions/${id}`, { method: "DELETE" }),
  getAvailableItems: (customerId: string, projectType: string) =>
    request<{ id: string; name: string; remaining_count: number | null; detail?: string; card_type?: string; expiry_date?: string }[]>(
      `/api/project-deductions/available-items?customer_id=${customerId}&project_type=${projectType}`
    ),
  autoDeduct: (data: { nickname: string; project_type: string; count: number; created_by?: string; name_filter?: string }) =>
    request<ProjectDeduction>("/api/project-deductions/auto", { method: "POST", body: JSON.stringify(data) }),
  getCoarseDoorOptions: (customerId: string, editingId = "") =>
    request<CoarseDoorOptions>(`/api/project-deductions/coarse-door-options?customer_id=${encodeURIComponent(customerId)}&editing_id=${encodeURIComponent(editingId)}`),
  createCoarseDoorCourse: (data: {
    customer_id: string
    record_type: string
    record_id: string
    course_organization_id: string
    settlement_organization_id: string
    deal_date: string
    closers: Array<{ id: string; name: string; amount: number }>
    notes: string
  }, editingId = "") =>
    request<ProjectDeduction>(`/api/project-deductions/coarse-door-course${editingId ? '/' + encodeURIComponent(editingId) : ''}`, { method: editingId ? "PATCH" : "POST", body: JSON.stringify(data) }),
}

export interface ProjectRefund {
  id: string
  customer_id: string
  nickname: string
  project_type: string
  project_id: string
  project_name: string
  paid_amount: number
  refund_amount: number
  refund_date: string
  created_by: string
  updated_by: string
  created_at: string
}

export const projectRefundApi = {
  listPaginated: (page: number, pageSize: number, params?: Record<string, string>) => {
    const qs = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
    if (params) Object.entries(params).forEach(([k, v]) => { if (v) qs.set(k, v) })
    return request<PaginatedResponse<ProjectRefund>>(`/api/project-refunds?${qs}`)
  },
  create: (data: { customer_id: string; project_type: string; project_id: string; refund_amount: number; created_by?: string }) =>
    request<ProjectRefund>("/api/project-refunds", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: { refund_amount: number; updated_by?: string }) =>
    request<ProjectRefund>(`/api/project-refunds/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string) =>
    request<void>(`/api/project-refunds/${id}`, { method: "DELETE" }),
  getAvailableItems: (customerId: string, projectType: string) =>
    request<{ id: string; name: string; paid_amount: number; detail?: string; card_type?: string }[]>(
      `/api/project-refunds/available-items?customer_id=${customerId}&project_type=${projectType}`
    ),
}

export type PaymentExportRangeType = "day" | "month" | "year" | "custom"

export interface PaymentExportParams {
  range_type: PaymentExportRangeType
  period?: string
  date_from?: string
  date_to?: string
}

export const paymentExportApi = {
  download: async (params: PaymentExportParams) => {
    const query = new URLSearchParams()
    Object.entries(params).forEach(([key, value]) => {
      if (value) query.set(key, value)
    })
    const res = await fetch(`${API_BASE}/api/payment-exports/export?${query.toString()}`, {
      headers: getAuthHeaders(),
    })
    applyNewToken(res)
    if (res.status === 401) {
      handle401()
      throw new Error("登录已过期")
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      const detail = data.detail
      const message = Array.isArray(detail)
        ? detail.map((item: { msg?: string }) => cleanValidationMessage(item.msg, "参数错误")).join("；")
        : (detail || "导出失败，请稍后再试")
      throw new Error(message)
    }
    const disposition = res.headers.get("Content-Disposition") || ""
    const encodedFilename = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
    let filename = `付费项目_${new Date().toLocaleDateString("sv-SE")}.xlsx`
    if (encodedFilename) {
      try { filename = decodeURIComponent(encodedFilename) } catch {}
    }
    return { blob: await res.blob(), filename }
  },
}

// Space
export interface Room {
  id: string
  space_id: string
  name: string
}

export interface Space {
  id: string
  name: string
  rooms: Room[]
  sort_order: number
  created_at: string
  updated_at: string
}

export interface SpaceCreate {
  name: string
  sort_order?: number
}

export interface RoomCreate {
  name: string
  space_id: string
}

export const spaceApi = {
  list: () => request<Space[]>("/api/spaces"),
  listPaginated: (page: number, pageSize: number) => request<PaginatedResponse<Space>>(`/api/spaces?page=${page}&page_size=${pageSize}`),
  create: (data: SpaceCreate) => request<Space>("/api/spaces", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<SpaceCreate>) => request<Space>(`/api/spaces/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string) => request<{ message: string }>(`/api/spaces/${id}`, { method: "DELETE" }),
  addRoom: (spaceId: string, data: { name: string }) => request<Room>(`/api/spaces/${spaceId}/rooms`, { method: "POST", body: JSON.stringify(data) }),
  updateRoom: (spaceId: string, roomId: string, data: { name: string }) => request<Room>(`/api/spaces/${spaceId}/rooms/${roomId}`, { method: "PATCH", body: JSON.stringify(data) }),
  checkRoomReferenced: (spaceId: string, roomId: string) => request<{ referenced: boolean }>(`/api/spaces/${spaceId}/rooms/${roomId}/referenced`),
  deleteRoom: (spaceId: string, roomId: string, force?: boolean) => request<{ message: string; soft_deleted?: boolean }>(`/api/spaces/${spaceId}/rooms/${roomId}${force ? "?force=true" : ""}`, { method: "DELETE" }),
  reorderRooms: (spaceId: string, roomIds: string[]) => request<Space>(`/api/spaces/${spaceId}/rooms-order`, { method: "PATCH", body: JSON.stringify({ room_ids: roomIds }) }),
}

// Reminder
export interface ReminderCondition {
  type: "acquaintance_date" | "visit_count" | "activity"
  mode: "fixed_cycle" | "relative" | "participation_count" | "remaining_count"
  operator: "gt" | "eq" | "lt" | ""
  value: number
  activity_type: "" | "membership" | "emotional_release" | "group_case" | "energy_knot" | "internal_course"
}

export interface Reminder {
  id: string
  name: string
  account_role: string
  account_id: string
  condition_logic: "all" | "any"
  conditions: ReminderCondition[]
  trigger_mode: string
  created_at: string
  updated_at: string
}

export type ReminderCreate = Omit<Reminder, "id" | "created_at" | "updated_at">

export const reminderApi = {
  list: () => request<Reminder[]>("/api/reminders"),
  create: (data: ReminderCreate) => request<Reminder>("/api/reminders", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<ReminderCreate>) => request<Reminder>(`/api/reminders/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string) => request<{ message: string }>(`/api/reminders/${id}`, { method: "DELETE" }),
}

// Member Identity
export interface IdentityCondition {
  type: "invitation" | "arrival" | "activity" | "card" | "course" | "payment" | "teacher" | "fixed" | "amount"
  payment_categories: string[]
  items: string[]
  count_op: ">" | "=" | "<" | ">=" | "<="
  count_value: number
  validity: "active" | "all"
  activity_scope: "all" | "welfare"
  /** 邀约情况：active＝正常邀约；cancelled＝已取消的邀约 */
  invitation_scope?: "active" | "cancelled"
}

export interface MemberIdentity {
  id: string
  name: string
  type: string
  conditions: IdentityCondition[]
  operator: "all" | "any"
  sort_order: number
  created_at: string
  updated_at: string
}

export interface MemberIdentityCreate {
  name: string
  type?: string
  conditions: IdentityCondition[]
  operator?: "all" | "any"
  sort_order?: number
}

export const memberIdentityApi = {
  list: () => request<MemberIdentity[]>("/api/member-identities"),
  create: (data: MemberIdentityCreate) => request<MemberIdentity>("/api/member-identities", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<MemberIdentityCreate>) => request<MemberIdentity>(`/api/member-identities/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (id: string) => request<{ message: string }>(`/api/member-identities/${id}`, { method: "DELETE" }),
  refreshAll: () => request<{ message: string }>("/api/member-identities/refresh-all", { method: "POST" }),
  reorder: (ids: string[]) => request<{ message: string }>("/api/member-identities/batch/reorder", { method: "PUT", body: JSON.stringify({ ids }) }),
}

// Healing Records
export interface HealingRecord {
  id: string
  customer_id: string
  customer_name: string
  date: string
  title: string
  growth_record: string
  teacher: string
  materials: Material[]
  created_at: string
  updated_at: string
}

export interface HealingRecordCreate {
  customer_id: string
  customer_name?: string
  date: string
  title: string
  growth_record?: string
  teacher?: string
  materials?: Material[]
}

export interface HealingRecordUpdate {
  customer_id?: string
  customer_name?: string
  date?: string
  title?: string
  growth_record?: string
  teacher?: string
  materials?: Material[]
}

export const healingRecordApi = {
  list: (customerId?: string) => request<HealingRecord[]>(`/api/healing-records${customerId ? `?customer_id=${customerId}` : ""}`),
  listPaginated: (customerId?: string, page = 1, pageSize = 10) => request<PaginatedResponse<HealingRecord>>(`/api/healing-records?${customerId ? `customer_id=${customerId}&` : ""}page=${page}&page_size=${pageSize}`),
  get: (id: string) => request<HealingRecord>(`/api/healing-records/${id}`),
  create: (data: HealingRecordCreate) => request<HealingRecord>("/api/healing-records", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: HealingRecordUpdate) => request<HealingRecord>(`/api/healing-records/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  getByCustomerDate: (customerId: string, date: string) => request<HealingRecord | null>(`/api/healing-records/by-customer-date?customer_id=${customerId}&date=${date}`),
  delete: (id: string) => request<{ message: string }>(`/api/healing-records/${id}`, { method: "DELETE" }),
  searchCustomers: (keyword: string) => request<{ id: string; nickname: string; name: string; member_type: string }[]>(`/api/healing-records/search-customers?q=${encodeURIComponent(keyword)}`),
}

// Customer Detail (聚合)
export interface PurchaseSummaryItem {
  type: string
  total_purchased: number | string
  grand_total?: number
  total_amount: number
  used: number | string
  remaining: number | string
  effective_remaining?: number | string
  current_remaining?: number | string
  current_total?: number | string
  attended_count?: number
  debt_count?: number
  debt_activities?: {
    label: string
    date?: string
    count: number
  }[]
  manual_deductions?: number
  activity_deductions?: number
  advance_deductions?: number
  internal_course_deductions?: number
  unlimited_deductions?: number
  name?: string
  effective_date?: string
  expiry_date?: string
  activity_mode?: string
  validity_value?: number
  voided?: boolean
  voided_at?: string
  earliest_expiry?: string
  earliest_expiry_count?: number
  purchases?: {
    purchase_count: number
    amount: number
    deal_date: string
    effective_date: string
    expiry_date: string
    remaining: number
  }[]
}

export interface ActivityRecord {
  type: string
  activity_type: string
  activity_key: string
  date: string
  name: string
  role: string
  host: string
  session_id: string
  is_public_welfare?: boolean
  participated?: boolean
  withdrawn?: boolean
  membership_deduction_count?: number
  deduction_summary?: string
}

export interface ActivitySummaryItem {
  key: "class" | "gcs" | "ers" | "eks" | "ics" | "withdrawn"
  label: string
  count: number
}

export interface ActivityFollowup {
  id: string
  customer_id: string
  activity_key: string
  activity_type: string
  session_id: string
  activity_name: string
  activity_category: string
  activity_date: string
  start_time: string
  end_time: string
  teacher: string
  customer_role: string
  content: string
  created_at: string
  updated_at: string
}

export interface PaymentRecord {
  cancelled?: boolean
  cancellation_reason?: string
  type: string
  name: string
  activity_name?: string
  course_organization_name?: string
  settlement_organization_name?: string
  created_by?: string
  quantity: number | string
  amount: number
  deal_date: string
  effective_date: string
  expiry_date: string
  closer_name: string
  created_at: string
  voided?: boolean
  notes?: string
}

export interface CustomerDetail {
  communication_records?: CommunicationRecord[]
  customer: Customer
  purchase_summary: PurchaseSummaryItem[]
  activities: ActivityRecord[]
  activity_summary: ActivitySummaryItem[]
  activity_followups: ActivityFollowup[]
  healing_records: HealingRecord[]
  payment_records: PaymentRecord[]
  offline_course_records: OfflineCourseRecord[]
  visit_records: VisitRecord[]
}

export const customerDetailApi = {
  get: (customerId: string, date?: string, principalParticipant = false, principalCourse = "") => request<CustomerDetail>(`/api/customer-detail/${customerId}?${new URLSearchParams({ ...(date ? { date } : {}), ...(principalParticipant ? { principal_participant: "true", principal_course: principalCourse } : {}) })}`),
}

// System Logs
export interface SystemLog {
  id: string
  section: string
  content: string
  operator: string
  operator_role: string
  method: string
  path: string
  entity_id: string
  ip: string
  before_data: Record<string, unknown> | null
  after_data: Record<string, unknown> | null
  created_at: string
}

export interface SystemLogCreate {
  section: string
  content: string
}

export interface OperationLogQuery {
  operator?: string
  method?: string
  section?: string
  source?: string
  date_from?: string
  date_to?: string
  entity_id?: string
  keyword?: string
}

export const systemLogApi = {
  list: (params?: OperationLogQuery) => {
    const qs = new URLSearchParams()
    if (params?.operator) qs.set("operator", params.operator)
    if (params?.method) qs.set("method", params.method)
    if (params?.date_from) qs.set("date_from", params.date_from)
    if (params?.date_to) qs.set("date_to", params.date_to)
    if (params?.entity_id) qs.set("entity_id", params.entity_id)
    if (params?.keyword) qs.set("keyword", params.keyword)
    const query = qs.toString()
    return request<SystemLog[]>(`/api/system-logs${query ? `?${query}` : ""}`)
  },
  listPaginated: (params?: OperationLogQuery, page = 1, pageSize = 10) => {
    const qs = new URLSearchParams()
    if (params?.operator) qs.set("operator", params.operator)
    if (params?.method) qs.set("method", params.method)
    if (params?.date_from) qs.set("date_from", params.date_from)
    if (params?.date_to) qs.set("date_to", params.date_to)
    if (params?.entity_id) qs.set("entity_id", params.entity_id)
    if (params?.keyword) qs.set("keyword", params.keyword)
    qs.set("page", String(page))
    qs.set("page_size", String(pageSize))
    return request<PaginatedResponse<SystemLog>>(`/api/system-logs?${qs.toString()}`)
  },
  create: (data: SystemLogCreate) => request<SystemLog>("/api/system-logs", { method: "POST", body: JSON.stringify(data) }),
}

export interface OperationLog {
  id: string
  operator: string
  operator_role: string
  source: string
  section: string
  content: string
  method: string
  path: string
  entity_id: string
  ip: string
  before_data: Record<string, unknown> | null
  after_data: Record<string, unknown> | null
  created_at: string
}

export interface LoginAccountSummary {
  account_id: string
  username: string
  owner: string
  role: string
  today_count: number
  month_count: number
  latest_login_at: string | null
  latest_ip: string
  latest_source: string
  today_usage_seconds: number
  month_usage_seconds: number
  pc_today_count: number
  pc_month_count: number
  pc_today_usage_seconds: number
  pc_month_usage_seconds: number
  pc_latest_active_at: string | null
  pc_latest_active_ip: string
  miniprogram_today_count: number
  miniprogram_month_count: number
  miniprogram_today_usage_seconds: number
  miniprogram_month_usage_seconds: number
  miniprogram_latest_active_at: string | null
  miniprogram_latest_active_ip: string
  last_active_at: string | null
}

export type AccountActivityType = "login" | "page_view" | "operation" | "usage"

export interface AccountActivityRecord {
  id: string
  event_type: AccountActivityType
  account_id: string
  username: string
  owner: string
  role: string
  source: string
  ip: string
  device_info: string
  page_path: string
  page_name: string
  content: string
  method: string
  created_at: string
  ended_at: string | null
  duration_seconds: number
}

export interface LoginRecordQuery {
  page_name?: string
  account_id?: string
  event_type?: AccountActivityType
  source?: "pc" | "miniprogram"
  date_from?: string
  date_to?: string
  keyword?: string
}

export interface UsageOverview {
  people: { account_id: string; owner: string; days: number; latest: string | null; seconds: number; estimated_seconds: number; status: string; pages: string[] }[]
  functions: { name: string; people: number; days: number; visits: number; operations: number; actions: { name: string; count: number }[]; account_ids: string[]; eligible: number | null }[]
  cards: { used: number; unused: number; frequent: number; average_days: number; frequent_threshold: number }
}

export const loginRecordApi = {
  overview: (params: { date_from: string; date_to: string; source: string; account_id: string }) => request<UsageOverview>(`/api/login-records/overview?${new URLSearchParams(params)}`),
  summary: () => request<LoginAccountSummary[]>("/api/login-records/summary"),
  heartbeat: (data: { client_session_id: string; page_path: string; active: boolean }, keepalive = false) =>
    request<{ success: boolean; last_heartbeat_at: string }>("/api/login-records/heartbeat", {
      method: "POST",
      body: JSON.stringify(data),
      keepalive,
    }),
  listPaginated: (params: LoginRecordQuery = {}, page = 1, pageSize = 20) => {
    const qs = new URLSearchParams()
    if (params.account_id) qs.set("account_id", params.account_id)
    if (params.event_type) qs.set("event_type", params.event_type)
    if (params.source) qs.set("source", params.source)
    if (params.date_from) qs.set("date_from", params.date_from)
    if (params.date_to) qs.set("date_to", params.date_to)
    if (params.keyword) qs.set("keyword", params.keyword)
    if (params.page_name) qs.set("page_name", params.page_name)
    qs.set("page", String(page))
    qs.set("page_size", String(pageSize))
    return request<PaginatedResponse<AccountActivityRecord>>(`/api/login-records?${qs.toString()}`)
  },
}

export const operationLogApi = {
  list: (params?: OperationLogQuery) => {
    const qs = new URLSearchParams()
    if (params?.operator) qs.set("operator", params.operator)
    if (params?.method) qs.set("method", params.method)
    if (params?.section) qs.set("section", params.section)
    if (params?.source) qs.set("source", params.source)
    if (params?.date_from) qs.set("date_from", params.date_from)
    if (params?.date_to) qs.set("date_to", params.date_to)
    if (params?.entity_id) qs.set("entity_id", params.entity_id)
    if (params?.keyword) qs.set("keyword", params.keyword)
    const query = qs.toString()
    return request<OperationLog[]>(`/api/operation-logs${query ? `?${query}` : ""}`)
  },
  listPaginated: (params?: OperationLogQuery, page = 1, pageSize = 10) => {
    const qs = new URLSearchParams()
    if (params?.operator) qs.set("operator", params.operator)
    if (params?.method) qs.set("method", params.method)
    if (params?.section) qs.set("section", params.section)
    if (params?.source) qs.set("source", params.source)
    if (params?.date_from) qs.set("date_from", params.date_from)
    if (params?.date_to) qs.set("date_to", params.date_to)
    if (params?.entity_id) qs.set("entity_id", params.entity_id)
    if (params?.keyword) qs.set("keyword", params.keyword)
    qs.set("page", String(page))
    qs.set("page_size", String(pageSize))
    return request<PaginatedResponse<OperationLog>>(`/api/operation-logs?${qs.toString()}`)
  },
}

// Accounts
export interface Account {
  id: string
  owner: string
  role: string
  roles: string[]
  username: string
  enabled: boolean
  created_at: string
  is_system?: boolean
}

// 轻量账号名单：供非管理员页面的选择器使用（对应 GET /api/accounts/light）
export interface AccountLight {
  id: string
  username: string
  owner: string
}

export interface AccountCreate {
  owner: string
  role: string
  roles: string[]
  username: string
  password: string
  enabled?: boolean
}

export interface Role {
  id: string
  name: string
  permissions: string[]
  created_at: string
}

export interface RoleCreate {
  name: string
  permissions?: string[]
}

export const accountApi = {
  list: () => request<Account[]>("/api/accounts"),
  listLight: () => request<AccountLight[]>("/api/accounts/light"),
  create: (data: AccountCreate) => request<Account>("/api/accounts", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<AccountCreate>) => request<Account>(`/api/accounts/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string) => request<{ message: string }>(`/api/accounts/${id}`, { method: "DELETE" }),
  login: (username: string, password: string) => request<{ success: boolean; message?: string; token?: string; account?: Account; permissions?: string[]; edit_permissions?: PositionEditPermissions }>("/api/accounts/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  changePassword: (id: string, oldPassword: string, newPassword: string) => request<{ message: string }>(`/api/accounts/${id}/change-password`, { method: "POST", body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }) }),
  resetPassword: (id: string, newPassword: string) => request<{ message: string }>(`/api/accounts/${id}/reset-password`, { method: "POST", body: JSON.stringify({ new_password: newPassword }) }),
  listSessions: () => request<{ id: string; account_id: string; device_info: string; device_id?: string; ip: string; login_time: string; last_active: string }[]>("/api/accounts/sessions"),
  deleteSession: (sessionId: string) => request<{ message: string }>(`/api/accounts/sessions/${sessionId}`, { method: "DELETE" }),
  listRoles: () => request<Role[]>("/api/accounts/roles"),
  createRole: (data: RoleCreate) => request<Role>("/api/accounts/roles", { method: "POST", body: JSON.stringify(data) }),
  updateRole: (id: string, data: Partial<RoleCreate>) => request<Role>(`/api/accounts/roles/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteRole: (id: string) => request<{ message: string }>(`/api/accounts/roles/${id}`, { method: "DELETE" }),
}

// Position Permissions
export type PositionEditScope = "view" | "own" | "all"
export type ContactField = "phone" | "wechat"
export type ContactAction = "view" | "copy" | "edit"
export interface ContactActionPermissions {
  view: boolean
  copy: boolean
  edit: boolean
}
export interface ContactPermissions {
  phone: ContactActionPermissions
  wechat: ContactActionPermissions
}
export type CustomerDataScope = "none" | "related" | "all"
export type TransactionAccess = "none" | "summary" | "detail"
export interface CustomerAccessPermissions {
  scope: CustomerDataScope
  relations: {
    referrer: boolean
    referrer_handler: boolean
  }
  sensitive_fields: {
    visit_purpose: boolean
    trauma_history: boolean
    current_block: boolean
    work_info: boolean
    other_info: boolean
  }
  detail_tabs: {
    follow_up: boolean
    communication: boolean
    activities: boolean
    customer_followups: boolean
    card_statistics: boolean
    offline_courses: boolean
  }
  transaction_access: TransactionAccess
}
export interface PositionEditPermissions {
  principal_external_access?: CustomerAccessPermissions
  principal_scope?: "own" | "all"
  customers: "view" | "all"
  visits: PositionEditScope
  activities: PositionEditScope
  activity_teachers: PositionEditScope
  activity_participants: PositionEditScope
  activity_lock: boolean
  visit_lock: boolean
  payments: "own" | "all"
  /** 课程记录查看范围：own = 与本人相关，all = 全部记录 */
  course_records?: "own" | "all"
  contacts: ContactPermissions
  customer_access: CustomerAccessPermissions
}

export const positionPermissionApi = {
  getAll: () => request<Record<string, string[]>>("/api/position-permissions"),
  /** 当前登录账号的有效权限（多角色并集），避免按单个角色刷新时丢掉其它角色的页面 */
  getMine: () => request<{ pages: string[]; edit_permissions: PositionEditPermissions }>("/api/accounts/me/permissions"),
  get: (position: string) => request<{ position: string; pages: string[]; edit_permissions: PositionEditPermissions }>(`/api/position-permissions/${position}`),
  set: (position: string, pages: string[]) => request<{ message: string }>("/api/position-permissions", { method: "PUT", body: JSON.stringify({ position, pages }) }),
  setFull: (position: string, pages: string[], editPermissions: PositionEditPermissions) => request<{ message: string }>("/api/position-permissions/full", { method: "PUT", body: JSON.stringify({ position, pages, edit_permissions: editPermissions }) }),
  getPagePermissions: () => request<Record<string, Record<string, string[]>>>("/api/position-permissions/page-permissions"),
  getEditPermissions: () => request<Record<string, PositionEditPermissions>>("/api/position-permissions/edit-permissions"),
}

// Activity Permissions (活动配置)
export type ActivityPermissions = Record<string, Record<string, { view: boolean; participate: boolean }>>

export const activityPermissionApi = {
  getAll: () => request<ActivityPermissions>("/api/activity-permissions"),
  saveAll: (permissions: ActivityPermissions) =>
    request<{ message: string }>("/api/activity-permissions", {
      method: "PUT",
      body: JSON.stringify({ permissions }),
    }),
}

// Positions (角色权限)
export interface Position {
  id: string
  name: string
  description: string
  icon: string
  sort_order: number
  created_at: string
  is_system?: boolean
}

export interface PositionCreate {
  name: string
  description?: string
  icon?: string
}

export const positionApi = {
  list: () => request<Position[]>("/api/positions"),
  create: (data: PositionCreate) => request<Position>("/api/positions", { method: "POST", body: JSON.stringify(data) }),
  reorder: (ids: string[], movement: { movedId: string; fromPosition: number; toPosition: number }) => request<Position[]>("/api/positions/reorder", {
    method: "PUT",
    body: JSON.stringify({
      ids,
      moved_id: movement.movedId,
      from_position: movement.fromPosition,
      to_position: movement.toPosition,
    }),
  }),
  update: (id: string, data: Partial<PositionCreate>) => request<Position>(`/api/positions/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string) => request<{ message: string }>(`/api/positions/${id}`, { method: "DELETE" }),
}

// Daily Grouping（人员分组）
export interface GroupInfo {
  name: string
  leader_id: string
  deputy_id: string
  member_ids: string[]
}

export interface DailyGrouping {
  id?: string
  date: string
  groups: GroupInfo[]
}

export const dailyGroupingApi = {
  get: (date: string) => request<DailyGrouping>(`/api/daily-groupings?date=${date}`),
  upsert: (data: DailyGrouping) => request<DailyGrouping>("/api/daily-groupings", { method: "PUT", body: JSON.stringify(data) }),
}

export interface BusinessReminderItem {
  id: string
  customer_id: string
  nickname: string
  reminder_id: string
  reminder_name: string
  message: string
  handled: boolean
  description: string
}

export const businessReminderApi = {
  list: (user_id: string, user_role: string) =>
    request<BusinessReminderItem[]>(`/api/business-reminders?user_id=${encodeURIComponent(user_id)}&user_role=${encodeURIComponent(user_role)}`),
  listPaginated: (user_id: string, user_role: string, handled?: boolean, page = 1, pageSize = 10) => {
    const params = new URLSearchParams()
    params.set("user_id", user_id)
    params.set("user_role", user_role)
    if (handled !== undefined) params.set("handled", String(handled))
    params.set("page", String(page))
    params.set("page_size", String(pageSize))
    return request<PaginatedResponse<BusinessReminderItem>>(`/api/business-reminders?${params.toString()}`)
  },
  toggle: (id: string, description: string = "") =>
    request<{ handled: boolean }>(`/api/business-reminders/${encodeURIComponent(id)}/toggle`, {
      method: "PATCH",
      body: JSON.stringify({ description }),
    }),
}

// Activity Theme
export interface ActivityTheme {
  id: string
  date: string
  space_id: string
  week_theme: string
  week_theme_detail: string
  day_theme: string
  day_theme_detail: string
  is_locked: boolean
  locked_by_id: string
  locked_by: string
  locked_at: string | null
  created_at: string
  updated_at: string
}

export const activityThemeApi = {
  list: (start_date?: string, end_date?: string, space_ids?: string[]) => {
    const params = new URLSearchParams()
    if (start_date) params.set("start_date", start_date)
    if (end_date) params.set("end_date", end_date)
    if (space_ids) space_ids.forEach(id => params.append("space_ids", id))
    return request<ActivityTheme[]>(`/api/activity-themes?${params.toString()}`)
  },
  save: (
    date: string,
    week_theme: string,
    day_theme: string,
    space_id: string = "",
    week_theme_detail: string = "",
    day_theme_detail: string = "",
  ) =>
    request<ActivityTheme>(`/api/activity-themes`, {
      method: "POST",
      body: JSON.stringify({ date, space_id, week_theme, week_theme_detail, day_theme, day_theme_detail }),
    }),
  batchSave: (themes: {
    date: string
    space_id: string
    week_theme: string
    week_theme_detail: string
    day_theme: string
    day_theme_detail: string
  }[]) =>
    request<ActivityTheme[]>(`/api/activity-themes/batch`, {
      method: "POST",
      body: JSON.stringify({ themes }),
    }),
  getLockStatus: (date: string, space_id: string = "") => {
    const params = new URLSearchParams({ date, space_id })
    return request<ActivityTheme & { can_manage: boolean }>(`/api/activity-themes/lock-status?${params.toString()}`)
  },
  lock: (date: string, space_id: string = "") =>
    request<ActivityTheme & { can_manage: boolean }>(`/api/activity-themes/lock`, {
      method: "POST",
      body: JSON.stringify({ date, space_id }),
    }),
  unlock: (date: string, space_id: string = "") =>
    request<ActivityTheme & { can_manage: boolean }>(`/api/activity-themes/unlock`, {
      method: "POST",
      body: JSON.stringify({ date, space_id }),
    }),
}

export interface VisitVerification {
  id?: string
  date: string
  space_id: string
  is_verified: boolean
  verified_by_id: string
  verified_by: string
  verified_at: string | null
  created_at?: string
  updated_at?: string
}

export const visitVerificationApi = {
  list: (startDate?: string, endDate?: string, spaceId?: string) => {
    const params = new URLSearchParams()
    if (startDate) params.set("start_date", startDate)
    if (endDate) params.set("end_date", endDate)
    if (spaceId !== undefined) params.set("space_id", spaceId)
    return request<VisitVerification[]>(`/api/visit-verifications?${params.toString()}`)
  },
  getStatus: (date: string, spaceId: string = "") =>
    request<VisitVerification & { can_manage: boolean }>(`/api/visit-verifications/status?${new URLSearchParams({ date, space_id: spaceId }).toString()}`),
  verify: (date: string, spaceId: string = "") =>
    request<VisitVerification & { can_manage: boolean }>("/api/visit-verifications/verify", {
      method: "POST",
      body: JSON.stringify({ date, space_id: spaceId }),
    }),
  unverify: (date: string, spaceId: string = "") =>
    request<VisitVerification & { can_manage: boolean }>("/api/visit-verifications/unverify", {
      method: "POST",
      body: JSON.stringify({ date, space_id: spaceId }),
    }),
}

// 信息核对：课表 / 邀约里漏填的信息，按天汇总
export interface AuditCheckItem {
  key: string
  label: string
  scope: "course" | "visit"
  default: boolean
}

export interface AuditCheckCourseRow {
  id: string
  activity_type: string
  activity_type_label: string
  time: string
  end_time: string
  title: string
  type_label: string
  teacher_ids: string[]
  teacher_names: string[]
  owner_id: string
  owner_name: string
  body_parts: number
  activity_mode: string
  intro: string
  published: boolean
  public_welfare: boolean
  deduction_count: number
  participant_ids: string[]
  participant_names: string[]
  space_id: string
  creator: string
  created_by_id: string
  kinds: string[]
}

export interface AuditCheckVisitRow {
  id: string
  customer_id: string
  time: string
  nickname: string
  member_type: string
  is_leader: boolean
  has_leader: boolean
  leader_name: string
  arrived: boolean
  arrival_time: string
  has_needs: boolean
  needs: string
  needs_hidden: boolean
  has_customer_info: boolean
  customer_info: string
  has_follow_up: boolean
  follow_up: string
  inviter: string
  receptionist: string
  goal: string
  creator: string
  created_by_id: string
  cancelled: boolean
  kinds: string[]
}

export interface AuditCheckDayCourse {
  locked: boolean
  locked_by: string
  locked_at: string
  total: number
  rows: AuditCheckCourseRow[]
  missing_count: number
  day_kinds: string[]
}

export interface AuditCheckDayVisit {
  verified: boolean
  verified_by: string
  verified_at: string
  total: number
  rows: AuditCheckVisitRow[]
  missing_count: number
  day_kinds: string[]
}

export interface AuditCheckDay {
  date: string
  missing_count: number
  unchecked: boolean
  course?: AuditCheckDayCourse
  visit?: AuditCheckDayVisit
}

export interface AuditCheckResult {
  start_date: string
  end_date: string
  /** 核对（锁定）的起算日期：更早的历史数据不参与核对 */
  lock_start_date: string
  space_id: string
  scopes: string[]
  kinds: string[]
  days: AuditCheckDay[]
  summary: {
    missing_count: number
    missing_day_count: number
    unchecked_day_count: number
    day_count: number
  }
}

export const auditCheckApi = {
  catalog: (scope: string = "") =>
    request<{ items: AuditCheckItem[]; defaults: string[] }>(
      `/api/audit-check/catalog${scope ? `?scope=${scope}` : ""}`,
    ),
  list: (params: {
    start_date: string
    end_date: string
    space_id?: string
    scope?: string
    kinds?: string[]
  }) => {
    const query = new URLSearchParams({ start_date: params.start_date, end_date: params.end_date })
    if (params.space_id) query.set("space_id", params.space_id)
    if (params.scope) query.set("scope", params.scope)
    // 始终带上：空数组表示「一项都不检查」，只核对锁定状态
    query.set("kinds", (params.kinds ?? []).join(","))
    return request<AuditCheckResult>(`/api/audit-check?${query.toString()}`)
  },
}

export const activityOrderApi = {
  get: (date: string, spaceId?: string) => {
    const params = new URLSearchParams({ date })
    if (spaceId) params.set("space_id", spaceId)
    return request<string[]>(`/api/activity-orders?${params.toString()}`)
  },
  save: (
    date: string,
    spaceId: string,
    order: string[],
    movement?: { movedName: string; fromPosition: number; toPosition: number },
  ) =>
    request<{ ok: boolean }>(`/api/activity-orders`, {
      method: "POST",
      body: JSON.stringify({
        date,
        space_id: spaceId,
        order,
        moved_name: movement?.movedName,
        from_position: movement?.fromPosition,
        to_position: movement?.toPosition,
      }),
    }),
}

// Consumption Records
export interface ConsumptionPaymentRecord {
  date: string
  nickname: string
  type: string
  name: string
  quantity: number | string
  amount: number
  effective_date: string
  expiry_date: string
  closer_name: string
}

export interface DeductionRecord {
  date: string
  nickname: string
  type: string
  name: string
  count: number
}

export const consumptionRecordsApi = {
  listPayments: (params: { date_from?: string; date_to?: string }, page: number, pageSize: number) => {
    const searchParams = new URLSearchParams()
    if (params.date_from) searchParams.set("date_from", params.date_from)
    if (params.date_to) searchParams.set("date_to", params.date_to)
    searchParams.set("page", String(page))
    searchParams.set("page_size", String(pageSize))
    return request<PaginatedResponse<ConsumptionPaymentRecord>>(`/api/consumption-records/payments?${searchParams.toString()}`)
  },
  listDeductions: (params: { date_from?: string; date_to?: string }, page: number, pageSize: number) => {
    const searchParams = new URLSearchParams()
    if (params.date_from) searchParams.set("date_from", params.date_from)
    if (params.date_to) searchParams.set("date_to", params.date_to)
    searchParams.set("page", String(page))
    searchParams.set("page_size", String(pageSize))
    return request<PaginatedResponse<DeductionRecord>>(`/api/consumption-records/deductions?${searchParams.toString()}`)
  },
  getDailyTotals: (date: string) => request<Record<string, number>>(`/api/consumption-records/daily-totals?date=${date}`),
  getDailyCounts: (date: string) => request<Record<string, number>>(`/api/consumption-records/daily-counts?date=${date}`),
}

export interface ChangedCell {
  rowKey: number
  fields: string[]
}

export interface ActivityHistoryRecord {
  id: string
  date: string
  space_id: string
  action: string
  user_name: string
  ip: string
  rows_snapshot: any[]
  changed_keys: number[]
  changed_cells: ChangedCell[]
  created_at: string
}

export interface VisitChangedCell {
  rowKey: number
  fields: string[]
}

export interface VisitHistoryRecord {
  id: string
  date: string
  space_id: string
  action: string
  user_name: string
  ip: string
  rows_snapshot: any[]
  changed_keys: number[]
  changed_cells: VisitChangedCell[]
  created_at: string
}

export const visitHistoryApi = {
  list: (date: string, spaceId?: string) => {
    const params = new URLSearchParams({ date })
    if (spaceId) params.set("space_id", spaceId)
    return request<VisitHistoryRecord[]>(`/api/visit-history?${params.toString()}`)
  },
  create: (data: { date: string; space_id?: string; action: string; user_name: string; ip?: string; rows_snapshot: any[]; changed_keys: number[]; changed_cells: VisitChangedCell[] }) =>
    request<VisitHistoryRecord>("/api/visit-history", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    request<{ message: string }>(`/api/visit-history/${id}`, { method: "DELETE" }),
}

export const activityHistoryApi = {
  list: (date: string, spaceId: string) => {
    const params = new URLSearchParams({ date, space_id: spaceId })
    return request<ActivityHistoryRecord[]>(`/api/activity-history?${params.toString()}`)
  },
  create: (data: { date: string; space_id: string; action: string; user_name: string; ip?: string; rows_snapshot: any[]; changed_keys: number[]; changed_cells: ChangedCell[] }) =>
    request<ActivityHistoryRecord>("/api/activity-history", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    request<{ message: string }>(`/api/activity-history/${id}`, { method: "DELETE" }),
}

export interface CourseStatistics {
  date_from: string
  date_to: string
  granularity: "day" | "week" | "month"
  selected_activity_type: string
  activity_types: Array<{ value: string; label: string }>
  organizations: Array<{ id: string; name: string }>
  teachers: Array<{ id: string; name: string }>
  statistics: Array<{
    type: string
    label: string
    course_count: number
    class_hours: number
    participant_count: number
    /** 案主人次（与参与人次相加 = 服务总人次） */
    owner_count?: number
  }>
  salon_subtype_statistics: Array<{
    type: string
    label: string
    course_count: number
    class_hours: number
    participant_count: number
  }>
  subtype_statistics: Array<{
    type: string
    label: string
    course_count: number
    class_hours: number
    participant_count: number
  }>
  trend: Array<{
    date: string
    course_count: number
    class_hours: number
    participant_count: number
    transaction_amount: number
  }>
  teacher_statistics: Array<{
    id: string
    name: string
    course_count: number
    class_hours: number
    participant_count: number
    transaction_amount: number
  }>
  courses: Array<{
    id: string
    activity_type: string
    activity_type_label: string
    name: string
    date: string
    start_time: string
    end_time: string
    class_hours: number
    course_review: string
    teachers: string[]
    owner_name: string
    body_part_count: number | null
    participant_count: number
    new_count: number
    old_count: number
    daily_transaction_amount: number | null
    participants: Array<{
      id: string
      nickname: string
      member_type: string
      identity_group: "新人" | "老人" | string
      participation_role: string
      daily_need: string
      daily_transaction_amount: number | null
      closers: string
    }>
  }>
}

export interface ReferralStatistics {
  total_people: number
  status_names: CustomerFollowUpStatus[]
  status_totals: Record<CustomerFollowUpStatus, number>
  summary_total_people: number
  summary_status_totals: Record<CustomerFollowUpStatus, number>
  summary_traffic_source_totals: Record<string, number>
  tag_totals: Record<string, number>
  referrer_names: string[]
  traffic_source_names: string[]
  member_type_names: string[]
  chart_total: Record<string, string | number>[]
  members: Array<{
    id: string
    nickname: string
    referral_date: string
    member_type: string
    referrer: string
    traffic_source: string
    referrer_handler: string
    follow_up_status: CustomerFollowUpStatus
    first_visit_date: string
    invited_count: number
    cancelled_count: number
    visit_count: number
    visit_interval: string
    activity_count: number
    total_consumption: number
  }>
}

export interface DashboardSummary {
  month: string
  total_customers: number
  new_customers_this_month: number
  arrived_customers_this_month: number
  arrived_customers_last_month: number
  arrival_change_rate: number | null
  revenue_this_month: number
  transactions_this_month: number
  not_arrived_customers: number
  not_arrived_days: number
}

export type AnalysisField =
  | "nickname"
  | "name"
  | "gender"
  | "age"
  | "member_type"
  | "follow_up_status"
  | "customer_tags"
  | "traffic_source"
  | "referrer"
  | "referrer_handler"
  | "service_teacher"
  | "referral_date"
  | "created_at"
  | "invitation_dates"
  | "invitation_created_dates"
  | "first_visit_date"
  | "last_visit_date"
  | "invitation_count"
  | "visit_count"
  | "activity_count"
  | "activity_types"
  | "activity_names"
  | "course_teachers"
  | "communication_count"
  | "last_communication_date"
  | "total_consumption"
  | "purchased_projects"
  | "created_by"
  | "inviter_names"
  | "invitation_creators"
  | "schedule_creators"
  | "invitation_count_period"
  | "visit_count_period"
  | "cancelled_count_period"
  | "activity_count_period"
  | "payment_categories"
  | "payment_projects"
  | "payment_closers"
  | "payment_methods"
  | "payment_count_period"
  | "payment_amount_period"
  | "payment_dates"
  | "latest_payment_date"
  | "visit_purpose"
  | "trauma_history"
  | "current_block"
  | "work_info"
  | "other_info"

export type AnalysisOperator = "eq" | "ne" | "contains" | "in" | "gt" | "gte" | "lt" | "lte" | "between" | "is_empty" | "is_not_empty"
export type AnalysisCardDimension = "none" | "gender" | "follow_up_status" | "member_type" | "customer_tags" | "traffic_source" | "referrer" | "referrer_handler" | "service_teacher" | "inviter_names" | "activity_types" | "purchased_projects"
export type AnalysisMetric = "total_customers" | "created_customers" | "referred_customers" | "invited_customers" | "arrived_customers" | "arrival_visits" | "activity_customers" | "activity_participations" | "converted_customers" | "payment_orders" | "payment_amount"
export type AnalysisRowDisplayMode = "unique_customers" | "arrival_visits" | "activity_participations"

export interface AnalysisCondition {
  field: AnalysisField
  operator: AnalysisOperator
  value: unknown
  inherit_period?: boolean
}

export interface AnalysisComparisonGroup {
  id: string
  name: string
  conditions: AnalysisCondition[]
  condition_logic: "all" | "any"
  date_from: string
  date_to: string
}

export interface AnalysisPlan {
  title: string
  total_card_title: string
  conditions: AnalysisCondition[]
  condition_logic: "all" | "any"
  date_from: string
  date_to: string
  metrics: AnalysisMetric[]
  card_metric: AnalysisMetric
  card_dimension: AnalysisCardDimension
  columns: AnalysisField[]
  sort_by: AnalysisField
  sort_order: "asc" | "desc"
  row_display_mode: AnalysisRowDisplayMode
  analysis_mode: "single" | "comparison"
  comparison_groups: AnalysisComparisonGroup[]
}

export interface AnalysisMetadata {
  fields: Array<{
    value: AnalysisField
    label: string
    group: string
    value_type: "text" | "number" | "date" | "select" | "multi_select"
    operators: AnalysisOperator[]
    options: string[]
    /** 仅用于历史模板回显，不再作为候选项 */
    legacy_only?: boolean
  }>
  column_fields?: Array<{
    value: AnalysisField
    label: string
    group: string
    /** 仅用于历史模板回显，不再作为候选项 */
    legacy_only?: boolean
  }>
  operators: Array<{ value: AnalysisOperator; label: string }>
  card_dimensions: Array<{ value: AnalysisCardDimension; label: string }>
  metrics: Array<{ value: AnalysisMetric; label: string; unit: string; format: "number" | "currency"; /** 仅用于历史模板回显，不再作为候选项 */ legacy_only?: boolean }>
  /** 拆分指标候选（不包含成交金额）；老模板若已选中成交金额，前端仍保留当前项显示 */
  dimension_metrics?: Array<{ value: AnalysisMetric; label: string; unit: string; format: "number" | "currency" }>
}

export interface AnalysisResult {
  plan: AnalysisPlan
  cards: Array<{ key: string; title: string; count: number; unit: string; format: "number" | "currency"; is_total: boolean }>
  items: Array<Record<string, unknown> & { id: string; nickname: string }>
  total: number
  total_unit?: "人" | "人次"
  page: number
  page_size: number
  total_pages: number
  comparison_groups?: Array<{
    id: string
    name: string
    date_from: string
    date_to: string
    total: number
    cards: Array<{ key: string; title: string; count: number; unit: string; format: "number" | "currency"; is_total: boolean }>
  }>
  comparison_rows?: Array<{
    metric: AnalysisMetric
    title: string
    unit: string
    format: "number" | "currency"
    values: number[]
    difference: number | null
    difference_rate: number | null
  }>
}

export interface AnalysisTemplate {
  id: string
  name: string
  description: string
  scope: "private" | "shared"
  plan: AnalysisPlan
  created_by_id: string
  created_by_name: string
  use_count: number
  last_used_at?: string | null
  created_at: string
  updated_at: string
}

export interface AnalysisLog {
  id: string
  operator: string
  /** 登录账号（显示名可能重名，账号名唯一） */
  account?: string
  source: "pc" | "miniprogram"
  ip: string
  content: string
  log_type: "analysis_executed" | "analysis_exported" | "template_created" | "template_updated" | "template_deleted"
  config: {
    模板名称?: string
    模板简介?: string
    可见范围?: string
    筛选条件数?: number
    列表字段?: string[]
    标题?: string
    分析模式?: string
    时间范围?: string
    条件关系?: string
    筛选条件?: Array<{ 字段: string; 规则: string; 值: unknown }>
    附加条件数?: number
    统计指标?: string[]
    拆分指标?: string
    拆分维度?: string
    拆分方式?: string
    显示字段?: string[]
    排序方式?: string
    列表排列?: string
    结果人数?: number
    结果数量?: number
    结果单位?: string
    /** 转化分析（组织/俱乐部）：筛选范围、规则与结果 */
    "组织/俱乐部"?: string
    起点?: string
    目标?: string
    状态筛选?: string
    转化结果?: Record<string, string | number>
    规则?: Record<string, unknown>
    对比组?: Array<string | {
      名称: string
      时间范围?: string
      条件关系?: string
      条件数?: number
      筛选条件?: Array<{ 字段: string; 规则: string; 值: unknown }>
      结果人数?: number
    }>
    各组人数合计?: number
  }
  created_at: string
}

export const customAnalysisApi = {
  metadata: () => request<AnalysisMetadata>("/api/custom-analysis/metadata"),
  parse: (query: string) => request<{ plan: AnalysisPlan; parsed_by: "ai" | "local"; warning: string }>("/api/custom-analysis/parse", {
    method: "POST",
    body: JSON.stringify({ query }),
  }),
  execute: (plan: AnalysisPlan, page = 1, pageSize = 20) => request<AnalysisResult>("/api/custom-analysis/execute", {
    method: "POST",
    body: JSON.stringify({ plan, page, page_size: pageSize }),
  }),
  download: async (plan: AnalysisPlan) => {
    const res = await fetch(`${API_BASE}/api/custom-analysis/export`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ plan }),
    })
    applyNewToken(res)
    if (res.status === 401) {
      handle401()
      throw new Error("登录已过期")
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      const detail = data.detail
      const message = Array.isArray(detail)
        ? detail.map((item: { msg?: string }) => cleanValidationMessage(item.msg, "参数错误")).join("；")
        : (detail || "导出失败，请稍后再试")
      throw new Error(message)
    }
    const disposition = res.headers.get("Content-Disposition") || ""
    const encodedFilename = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
    let filename = `自定义筛选_${new Date().toLocaleDateString("sv-SE")}.xlsx`
    if (encodedFilename) {
      try { filename = decodeURIComponent(encodedFilename) } catch {}
    }
    return { blob: await res.blob(), filename }
  },
  listTemplates: () => request<AnalysisTemplate[]>("/api/custom-analysis/templates"),
  createTemplate: (data: { name: string; description: string; scope: "private" | "shared"; plan: AnalysisPlan }) => request<AnalysisTemplate>("/api/custom-analysis/templates", {
    method: "POST",
    body: JSON.stringify(data),
  }),
  updateTemplate: (id: string, data: Partial<{ name: string; description: string; scope: "private" | "shared"; plan: AnalysisPlan }>) => request<AnalysisTemplate>(`/api/custom-analysis/templates/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  }),
  deleteTemplate: (id: string) => request<{ message: string }>(`/api/custom-analysis/templates/${id}`, { method: "DELETE" }),
  markTemplateUsed: (id: string) => request<AnalysisTemplate>(`/api/custom-analysis/templates/${id}/use`, { method: "POST" }),
}

export const analysisLogApi = {
  list: (params: {
    operator?: string
    source?: "pc" | "miniprogram"
    record_type?: "analysis" | "export" | "template"
    /** custom＝自定义筛选；conversion＝转化分析 */
    kind?: "custom" | "conversion"
    date_from?: string
    date_to?: string
    page?: number
    page_size?: number
  } = {}) => {
    const searchParams = new URLSearchParams()
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== "") searchParams.set(key, String(value))
    })
    return request<PaginatedResponse<AnalysisLog> & { operators: string[] }>(`/api/analysis-logs?${searchParams.toString()}`)
  },
}

export const statisticsApi = {
  dashboard: () => request<DashboardSummary>("/api/statistics/dashboard"),
  courses: (params: { date_from?: string; date_to?: string; all_dates?: boolean; granularity?: string; organization_id?: string; activity_type?: string; course_subtype?: string; teacher_id?: string }) => {
    const searchParams = new URLSearchParams()
    if (params.date_from) searchParams.set("date_from", params.date_from)
    if (params.date_to) searchParams.set("date_to", params.date_to)
    if (params.all_dates) searchParams.set("all_dates", "true")
    if (params.granularity) searchParams.set("granularity", params.granularity)
    if (params.organization_id) searchParams.set("organization_id", params.organization_id)
    if (params.activity_type && params.activity_type !== "all") searchParams.set("activity_type", params.activity_type)
    if (params.course_subtype) searchParams.set("course_subtype", params.course_subtype)
    if (params.teacher_id) searchParams.set("teacher_id", params.teacher_id)
    return request<CourseStatistics>(`/api/statistics/courses?${searchParams.toString()}`)
  },
  referrals: (params: { date_from?: string; date_to?: string; granularity?: string; referrer?: string; member_types?: string; follow_up_status?: CustomerFollowUpStatus; traffic_source?: string; tag_ids?: string; tag_match?: "any" | "all" }) => {
    const searchParams = new URLSearchParams()
    if (params.date_from) searchParams.set("date_from", params.date_from)
    if (params.date_to) searchParams.set("date_to", params.date_to)
    if (params.granularity) searchParams.set("granularity", params.granularity)
    if (params.referrer) searchParams.set("referrer", params.referrer)
    if (params.member_types) searchParams.set("member_types", params.member_types)
    if (params.follow_up_status) searchParams.set("follow_up_status", params.follow_up_status)
    if (params.traffic_source) searchParams.set("traffic_source", params.traffic_source)
    if (params.tag_ids) searchParams.set("tag_ids", params.tag_ids)
    if (params.tag_match) searchParams.set("tag_match", params.tag_match)
    return request<ReferralStatistics>(`/api/statistics/referrals?${searchParams.toString()}`)
  },
}

// Communication Records
export interface CommunicationRecord {
  id: string
  customer_nickname: string
  customer_name?: string
  content: string
  creator: string
  creator_id: string
  can_edit: boolean
  can_delete: boolean
  created_at: string
}

export interface CommunicationRecordCreate {
  customer_nickname: string
  content: string
}

export const communicationRecordApi = {
  list: (customer_nickname?: string) => request<CommunicationRecord[]>(`/api/communication-records${customer_nickname ? `?customer_nickname=${encodeURIComponent(customer_nickname)}` : ""}`),
  create: (data: CommunicationRecordCreate) => request<CommunicationRecord>("/api/communication-records", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: CommunicationRecordCreate) => request<CommunicationRecord>(`/api/communication-records/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (id: string) => request<void>(`/api/communication-records/${id}`, { method: "DELETE" }),
}

export const followupRecordApi = {
  list: (customerId?: string) => request<{ items: ActivityFollowup[]; total: number }>(`/api/followup-records${customerId ? `?customer_id=${customerId}` : ""}`),
}

// 客户跟进：自己填过的「客户信息 / 跟进点」（数据来自课表的参与人记录）
export interface CustomerFollowUpNote {
  id: string
  content: string
  feedback_person_id: string
  feedback_person: string
  created_by: string
  can_edit: boolean
  updated_at: string
}

export const customerFollowUpApi = {
  feedbackPeople: () => request<FeedbackPeopleResponse>("/api/customer-follow-ups/feedback-people"),
  update: (noteId: string, content: string, feedbackPerson?: { id: string; name: string }) =>
    request<CustomerFollowUpNote>(`/api/customer-follow-ups/${noteId}`, { method: "PATCH", body: JSON.stringify({
      content,
      ...(feedbackPerson ? { feedback_person_id: feedbackPerson.id, feedback_person: feedbackPerson.name } : {}),
    }) }),
  create: (visitId: string, category: "visit_need" | "customer_info" | "follow_up", content: string, feedbackPerson?: { id: string; name: string }) =>
    request<CustomerFollowUpNote>("/api/customer-follow-ups", { method: "POST", body: JSON.stringify({
      visit_id: visitId, category, content,
      ...(feedbackPerson ? { feedback_person_id: feedbackPerson.id, feedback_person: feedbackPerson.name } : {}),
    }) }),
  myNote: (visitId: string, category: "visit_need" | "customer_info" | "follow_up") =>
    request<CustomerFollowUpNote | null>(
      `/api/customer-follow-ups/my-note?visit_id=${encodeURIComponent(visitId)}&category=${category}`,
    ),
}

// Offline Course Records
export interface OfflineCourseRecord {
  course_name?: string
  course_type?: string
  participant_ids?: string[]
  participant_names?: string[]
  id: string
  customer_id: string
  customer_nickname: string
  record_date: string
  teacher: string
  content: string
  result: string
  creator: string
  created_at: string
}

export interface OfflineCourseRecordCreate {
  course_name?: string
  course_type?: string
  participant_ids?: string[]
  participant_names?: string[]
  customer_id: string
  customer_nickname: string
  record_date: string
  teacher: string
  content: string
  result: string
}

export const offlineCourseRecordApi = {
  updateType: (id: string, name: string) => request<{ id: string; name: string }>(`/api/offline-course-records/types/${id}`, { method: "PUT", body: JSON.stringify({ name }) }),
  deleteType: (id: string) => request(`/api/offline-course-records/types/${id}`, { method: "DELETE" }),
  types: () => request<{ id: string; name: string }[]>("/api/offline-course-records/types"),
  createType: (name: string) => request<{ id: string; name: string }>("/api/offline-course-records/types", { method: "POST", body: JSON.stringify({ name }) }),
  list: (customerId?: string) => request<OfflineCourseRecord[]>(`/api/offline-course-records${customerId ? `?customer_id=${encodeURIComponent(customerId)}` : ""}`),
  create: (data: OfflineCourseRecordCreate) => request<OfflineCourseRecord>("/api/offline-course-records", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: OfflineCourseRecordCreate) => request<OfflineCourseRecord>(`/api/offline-course-records/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (id: string) => request<void>(`/api/offline-course-records/${id}`, { method: "DELETE" }),
}

export type DebtCourseStatus = "new" | "changed" | "ok" | "resolved"
export type DebtCourseFilter = "attention" | "ok" | "resolved" | "all"

export interface DebtCourseRecord {
  id: string
  debt_type: string
  customer_id: string
  nickname: string
  member_type: string
  source_key: string
  course_name: string
  course_date: string
  start_time: string
  end_time: string
  teacher_names: string[]
  status: DebtCourseStatus
  debt_count: number
  approved_count: number
  new_count: number
  note: string
  first_seen_at: string
  reviewed_at: string
  reviewed_by: string
  resolved_at: string
}

export interface DebtCourseResult {
  items: DebtCourseRecord[]
  counts: Record<DebtCourseFilter, number>
  customer_debt_totals: Record<string, number>
  customer_pending_totals: Record<string, number>
  total: number
}

export const debtRecordApi = {
  list: (type: string, status: DebtCourseFilter = "attention") => request<DebtCourseResult>(`/api/debt-records?type=${encodeURIComponent(type)}&status=${encodeURIComponent(status)}`),
  summary: () => request<Record<string, number>>("/api/debt-records/summary"),
  update: (id: string, data: { action: "confirm" | "reset"; note: string }) => request<DebtCourseRecord>(`/api/debt-records/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(data) }),
  establishBaseline: (type: string) => request<{ updated: number }>(`/api/debt-records/baseline/${encodeURIComponent(type)}`, { method: "POST" }),
}
