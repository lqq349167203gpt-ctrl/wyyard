const API_BASE = ""

export function clearAuthState() {
  localStorage.removeItem("authToken")
  localStorage.removeItem("isLoggedIn")
  localStorage.removeItem("currentUser")
  localStorage.removeItem("userPermissions")
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
  if (res.status === 401) { handle401(); throw new Error("登录已过期") }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.detail || `请求失败: ${res.status}`)
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

    if (res.status === 401) { handle401(); throw new Error("登录已过期") }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.detail || `请求失败: ${res.status}`)
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

export interface Customer {
  id: string
  nickname: string
  name: string
  gender: string
  phone: string
  wechat: string
  age: string
  referrer: string
  referrer_handler: string
  member_type: string
  service_teacher: string
  paid_content: PaidContentItem[]
  visit_count: number
  total_payment: number
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
}

export type CustomerCreate = Omit<Customer, "id" | "created_at" | "updated_at">

export interface CustomerLight {
  id: string
  nickname: string
  name: string
  member_type: string
  positions: string[]
  position_sort_orders: Record<string, number>
  created_at: string
  traffic_source: string
  traffic_source_detail: string
  referrer: string
  space_id: string
}

let _customerLightCache: CustomerLight[] | null = null

export const customerApi = {
  list: () => request<Customer[]>("/api/customers"),
  light: () => {
    if (_customerLightCache) return Promise.resolve(_customerLightCache)
    return request<CustomerLight[]>("/api/customers/light").then(data => {
      _customerLightCache = data
      return data
    })
  },
  batch: (ids: string[]) => request<CustomerLight[]>("/api/customers/batch", { method: "POST", body: JSON.stringify({ ids }) }),
  listPaginated: (page: number, pageSize: number, filters?: { nickname?: string; member_type?: string; referrer?: string; referrer_handler?: string; member_types?: string }) => {
    const params = new URLSearchParams()
    params.set("page", String(page))
    params.set("page_size", String(pageSize))
    if (filters?.nickname) params.set("nickname", filters.nickname)
    if (filters?.member_type) params.set("member_type", filters.member_type)
    if (filters?.referrer) params.set("referrer", filters.referrer)
    if (filters?.referrer_handler) params.set("referrer_handler", filters.referrer_handler)
    if (filters?.member_types) params.set("member_types", filters.member_types)
    return request<PaginatedResponse<Customer>>(`/api/customers?${params.toString()}`)
  },
  clearLightCache: () => { _customerLightCache = null },
	  get: (id: string) => request<Customer>(`/api/customers/${id}`),
  create: (data: Partial<CustomerCreate>) => request<Customer>("/api/customers", { method: "POST", body: JSON.stringify(data) }).then(r => { _customerLightCache = null; return r }),
  update: (id: string, data: Partial<CustomerCreate>) => request<Customer>(`/api/customers/${id}`, { method: "PATCH", body: JSON.stringify(data) }).then(r => { _customerLightCache = null; return r }),
  delete: (id: string) => request<{ message: string }>(`/api/customers/${id}`, { method: "DELETE" }).then(r => { _customerLightCache = null; return r }),
  generateTags: (tags: string) => request<{ tags: string }>("/api/customers/generate-tags", { method: "POST", body: JSON.stringify({ tags }) }),
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

export interface VisitRecord {
  id: string
  visit_date: string
  visit_time: string
  customer_id: string
  nickname: string
  member_type: string
  daily_card_usage: number
  needs: string
  referrer_handler: string
  activity_id: string
  activity_type: string
  space_id: string
  is_leader: boolean
  arrived: boolean
  arrival_time?: string
  visit_count: number
  activity_count: number
  welfare_count: number
  remaining_count: number | null  // 0=无卡, -1=不限次, >0=剩余次数, null=无卡/未计算
  activities: ActivityInfo[]
  activity_participation: { name: string; role: string; participated: boolean }[]
  experience: string
  feedback: string
  group_leader_feedback: string
  healing_notes: string
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
  activity_id?: string
  activity_type?: string
  space_id?: string
  is_leader?: boolean
  arrived?: boolean
  arrival_time?: string
  feedback?: string
  group_leader_feedback?: string
  healing_notes?: string
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
  update: (id: string, data: Partial<VisitRecordCreate> & { activity_participation?: { name: string; role: string; participated: boolean }[]; experience?: string; feedback?: string; group_leader_feedback?: string }) => request<VisitRecord>(`/api/visits/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
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
  reorder: (ids: string[]) => request<{ message: string }>("/api/visits/reorder", { method: "POST", body: JSON.stringify({ ids }) }),
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
}

export const courseTypeApi = {
  list: () => request<CourseType[]>("/api/course-types"),
  create: (name: string, organization_id?: string) => request<CourseType>("/api/course-types", { method: "POST", body: JSON.stringify({ name, organization_id: organization_id || "" }) }),
  update: (name: string, data: { organization_id?: string }) => request<{ message: string }>(`/api/course-types/${encodeURIComponent(name)}`, { method: "PATCH", body: JSON.stringify(data) }),
  rename: (oldName: string, newName: string) => request<{ message: string }>(`/api/course-types/${encodeURIComponent(oldName)}/rename`, { method: "PUT", body: JSON.stringify({ new_name: newName }) }),
  delete: (name: string) => request<{ message: string }>(`/api/course-types/${encodeURIComponent(name)}`, { method: "DELETE" }),
  reorder: (names: string[]) => request<CourseType[]>("/api/course-types", { method: "PATCH", body: JSON.stringify({ names }) }),
}

// Organization (共创组织)
export interface Organization {
  id: string
  name: string
  member_ids: string[]
  sort_order: number
  created_at: string
  updated_at: string
}

export interface OrganizationCreate {
  name: string
  member_ids?: string[]
  sort_order?: number
}

export const organizationApi = {
  list: () => request<Organization[]>("/api/organizations"),
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
  uploadMaterial: async (file: File): Promise<Material> => {
    const formData = new FormData()
    formData.append("file", file)
    const token = localStorage.getItem("authToken")
    const uploadHeaders: Record<string, string> = {}
    if (token) uploadHeaders["Authorization"] = `Bearer ${token}`
    const res = await fetch(`${API_BASE}/api/uploads/materials`, { method: "POST", headers: uploadHeaders, body: formData })
    if (res.status === 401) { handle401(); throw new Error("登录已过期") }
    if (!res.ok) throw new Error("上传失败")
    return res.json()
  },
  deleteMaterial: (filename: string) => request<{ message: string }>(`/api/uploads/materials/${filename}`, { method: "DELETE" }),
}

export interface ClassRecord {
  id: string
  date: string
  start_time: string | null
  end_time: string | null
  course_id: string
  course_name: string
  course_type: string  // 活动类型（如：读书会、颂钵等）
  course_description: string
  teacher_ids: string[]
  participant_ids: string[]
  materials: Material[]
  groups: { name: string; member_ids: string[]; leader_id: string; deputy_id: string }[]
  is_public_welfare: boolean
  activity_mode?: string
  space_id: string
  room_id: string
  room_name: string
  space_name: string
  created_at: string
  updated_at: string
}

export interface ClassRecordCreate {
  date: string
  start_time?: string | null
  end_time?: string | null
  course_id: string
  course_name: string
  course_type?: string  // 活动类型（如：读书会、颂钵等）
  course_description?: string
  teacher_ids?: string[]
  participant_ids?: string[]
  is_public_welfare?: boolean
  activity_mode?: string
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
  create: (data: ClassRecordCreate) => request<ClassRecord>("/api/class-records", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<ClassRecordCreate>) => request<ClassRecord>(`/api/class-records/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string) => request<{ message: string }>(`/api/class-records/${id}`, { method: "DELETE" }),
  updateParticipants: (id: string, participantIds: string[]) => request<ClassRecord & { warnings?: string[] }>(`/api/class-records/${id}/participants`, { method: "PATCH", body: JSON.stringify({ participant_ids: participantIds }) }),
  updateGroups: (id: string, groups: { name: string; member_ids: string[]; leader_id: string; deputy_id: string }[]) => request<ClassRecord & { warnings?: string[] }>(`/api/class-records/${id}/groups`, { method: "PATCH", body: JSON.stringify({ groups }) }),
  searchCustomers: (keyword: string) => request<CustomerSearchResult[]>(`/api/class-records/search-customers?q=${encodeURIComponent(keyword)}`),
  calendarCounts: () => request<Record<string, number>>("/api/class-records/calendar-counts"),
  dashboard: (date: string, spaceId?: string) => request<DashboardData>(`/api/class-records/dashboard?date=${date}${spaceId ? `&space_id=${spaceId}` : ""}`),
}

export interface DashboardData {
  class_records: ClassRecord[]
  gcs_sessions: GroupCaseSession[]
  ers_sessions: EmotionalReleaseSession[]
  eks_sessions: EnergyKnotSession[]
  ics_sessions: InternalCourseSession[]
  ocr_sessions: OhCardReadingSession[]
  visits: VisitRecord[]
  visit_counts: Record<string, number>
  calendar_counts: Record<string, number>
  groupings: { date: string; groups: any[] }
}

export interface UnifiedRecord {
  type: "class" | "gcs" | "ers" | "eks" | "ics" | "ocr"
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
  closer_id: string | null
  closer_name: string | null
  closers: { id: string; name: string; amount: number }[]
  organization_id: string | null
  deal_date: string | null
  created_at: string
  updated_at: string
}

export interface GroupCaseCreate {
  customer_id: string
  nickname: string
  purchase_count?: number
  amount?: number
  closer_id?: string | null
  closer_name?: string | null
  closers?: { id: string; name: string; amount: number }[]
  organization_id?: string | null
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
  id: string
  date: string
  start_time: string | null
  end_time: string | null
  name: string
  owner_id: string
  owner_name: string
  description: string
  participant_ids: string[]
  teacher_ids: string[]
  host_id: string
  host_name: string
  materials: Material[]
  activity_mode?: string
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
  participant_ids?: string[]
  teacher_ids?: string[]
  host_id?: string
  host_name?: string
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
  create: (data: GroupCaseSessionCreate) => request<GroupCaseSession>("/api/group-case-sessions", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<GroupCaseSessionCreate>) => request<GroupCaseSession & { warnings?: string[] }>(`/api/group-case-sessions/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string) => request<{ message: string }>(`/api/group-case-sessions/${id}`, { method: "DELETE" }),
  searchCustomers: (keyword: string) => request<GroupCaseCustomerSearchResult[]>(`/api/group-case-sessions/search-customers?q=${encodeURIComponent(keyword)}`),
}

// OH Card Readings
export interface OhCardReading {
  id: string
  customer_id: string
  nickname: string
  purchase_count: number
  amount: number
  closer_id: string | null
  closer_name: string | null
  closers: { id: string; name: string; amount: number }[]
  organization_id: string | null
  deal_date: string | null
  created_at: string
  updated_at: string
}

export interface OhCardReadingCreate {
  customer_id: string
  nickname: string
  purchase_count?: number
  amount?: number
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

// OH Card Reading Sessions
export interface OhCardReadingSession {
  id: string
  date: string
  start_time: string | null
  end_time: string | null
  name: string
  owner_id: string
  owner_name: string
  description: string
  participant_ids: string[]
  teacher_ids: string[]
  host_id: string
  host_name: string
  materials: Material[]
  activity_mode?: string
  space_id: string
  room_id: string
  room_name: string
  space_name: string
  created_at: string
  updated_at: string
}

export interface OhCardReadingSessionCreate {
  date: string
  start_time?: string | null
  end_time?: string | null
  name?: string
  owner_id: string
  owner_name: string
  description?: string
  participant_ids?: string[]
  teacher_ids?: string[]
  host_id?: string
  host_name?: string
  space_id?: string
  room_id?: string
  room_name?: string
  space_name?: string
}

export const ohCardReadingSessionApi = {
  list: (date?: string) => request<OhCardReadingSession[]>(`/api/oh-card-reading-sessions${date ? `?date=${date}` : ""}`),
  listPaginated: (date: string | undefined, page: number, pageSize: number) => request<PaginatedResponse<OhCardReadingSession>>(`/api/oh-card-reading-sessions?${date ? `date=${date}&` : ""}page=${page}&page_size=${pageSize}`),
  create: (data: OhCardReadingSessionCreate) => request<OhCardReadingSession>("/api/oh-card-reading-sessions", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<OhCardReadingSessionCreate>) => request<OhCardReadingSession & { warnings?: string[] }>(`/api/oh-card-reading-sessions/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string) => request<{ message: string }>(`/api/oh-card-reading-sessions/${id}`, { method: "DELETE" }),
  searchCustomers: (keyword: string) => request<GroupCaseCustomerSearchResult[]>(`/api/oh-card-reading-sessions/search-customers?q=${encodeURIComponent(keyword)}`),
}

// Energy Knots
export interface EnergyKnot {
  id: string
  customer_id: string
  nickname: string
  purchase_count: number
  amount: number
  closer_id: string | null
  closer_name: string | null
  closers: { id: string; name: string; amount: number }[]
  organization_id: string | null
  deal_date: string | null
  created_at: string
  updated_at: string
}

export interface EnergyKnotCreate {
  customer_id: string
  nickname: string
  purchase_count?: number
  amount?: number
  closer_id?: string | null
  closer_name?: string | null
  closers?: { id: string; name: string; amount: number }[]
  organization_id?: string | null
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
  closer_id: string | null
  closer_name: string | null
  closers: { id: string; name: string; amount: number }[]
  organization_id: string | null
  deal_date: string | null
  created_at: string
  updated_at: string
}

export interface EmotionalReleaseCreate {
  customer_id: string
  nickname: string
  purchase_count?: number
  amount?: number
  closer_id?: string | null
  closer_name?: string | null
  closers?: { id: string; name: string; amount: number }[]
  organization_id?: string | null
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
  id: string
  date: string
  start_time: string | null
  end_time: string | null
  name: string
  owner_id: string
  owner_name: string
  description: string
  participant_ids: string[]
  teacher_ids: string[]
  host_id: string
  host_name: string
  materials: Material[]
  activity_mode?: string
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
  participant_ids?: string[]
  teacher_ids?: string[]
  host_id?: string
  host_name?: string
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
  create: (data: EmotionalReleaseSessionCreate) => request<EmotionalReleaseSession>("/api/emotional-release-sessions", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<EmotionalReleaseSessionCreate>) => request<EmotionalReleaseSession & { warnings?: string[] }>(`/api/emotional-release-sessions/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string) => request<{ message: string }>(`/api/emotional-release-sessions/${id}`, { method: "DELETE" }),
  searchCustomers: (keyword: string) => request<EmotionalReleaseCustomerSearchResult[]>(`/api/emotional-release-sessions/search-customers?q=${encodeURIComponent(keyword)}`),
}

// Energy Knot Sessions
export interface EnergyKnotSession {
  id: string
  date: string
  start_time: string | null
  end_time: string | null
  owner_id: string
  owner_name: string
  name: string
  description: string | null
  participant_ids: string[]
  teacher_ids: string[]
  host_id: string
  host_name: string
  activity_mode?: string
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
  participant_ids?: string[]
  teacher_ids?: string[]
  host_id?: string
  host_name?: string
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
  create: (data: EnergyKnotSessionCreate) => request<EnergyKnotSession>("/api/energy-knot-sessions", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<EnergyKnotSessionCreate>) => request<EnergyKnotSession & { warnings?: string[] }>(`/api/energy-knot-sessions/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string) => request<{ message: string }>(`/api/energy-knot-sessions/${id}`, { method: "DELETE" }),
  searchCustomers: (keyword: string) => request<EnergyKnotCustomerSearchResult[]>(`/api/energy-knot-sessions/search-customers?q=${encodeURIComponent(keyword)}`),
}

// Internal Course Sessions
export interface InternalCourseSession {
  id: string
  date: string
  start_time: string | null
  end_time: string | null
  course_type: string
  course_name: string
  course_description: string
  teacher_ids: string[]
  host_id: string
  host_name: string
  participant_ids: string[]
  materials: Material[]
  activity_mode?: string
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
  teacher_ids?: string[]
  host_id?: string
  host_name?: string
  participant_ids?: string[]
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
  create: (data: InternalCourseSessionCreate) => request<InternalCourseSession>("/api/internal-course-sessions", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<InternalCourseSessionCreate>) => request<InternalCourseSession & { warnings?: string[] }>(`/api/internal-course-sessions/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string) => request<{ message: string }>(`/api/internal-course-sessions/${id}`, { method: "DELETE" }),
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
  closer_id: string | null
  closer_name: string | null
  closers: { id: string; name: string; amount: number }[]
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
  organization_id: string | null
  deal_date: string | null
  created_at: string
  updated_at: string
  voided?: boolean
  voided_at?: string | null
}

export interface MembershipCardCreate {
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
  closer_id: string | null
  closer_name: string | null
  closers: { id: string; name: string; amount: number }[]
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
  id: string
  customer_id: string
  nickname: string
  project_type: string
  project_id: string
  project_name: string
  count: number
  deduction_date: string
  remaining_after: number | null
  created_by: string
  updated_by: string
  created_at: string
}

export const projectDeductionApi = {
  list: (customerId?: string) =>
    request<ProjectDeduction[]>(`/api/project-deductions${customerId ? `?customer_id=${customerId}` : ""}`),
  listPaginated: (page: number, pageSize: number, params?: Record<string, string>) => {
    const qs = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
    if (params) Object.entries(params).forEach(([k, v]) => { if (v) qs.set(k, v) })
    return request<PaginatedResponse<ProjectDeduction>>(`/api/project-deductions?${qs}`)
  },
  create: (data: { customer_id: string; project_type: string; project_id: string; count: number; created_by?: string }) =>
    request<ProjectDeduction>("/api/project-deductions", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: { count: number; updated_by?: string }) =>
    request<ProjectDeduction>(`/api/project-deductions/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string) =>
    request<void>(`/api/project-deductions/${id}`, { method: "DELETE" }),
  getAvailableItems: (customerId: string, projectType: string) =>
    request<{ id: string; name: string; remaining_count: number; detail?: string; card_type?: string; expiry_date?: string }[]>(
      `/api/project-deductions/available-items?customer_id=${customerId}&project_type=${projectType}`
    ),
  autoDeduct: (data: { nickname: string; project_type: string; count: number; created_by?: string; name_filter?: string }) =>
    request<ProjectDeduction>("/api/project-deductions/auto", { method: "POST", body: JSON.stringify(data) }),
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
  type: "arrival" | "activity" | "card" | "course" | "payment" | "teacher" | "fixed" | "amount"
  payment_categories: string[]
  items: string[]
  count_op: ">" | "=" | "<" | ">=" | "<="
  count_value: number
  validity: "active" | "all"
  activity_scope: "all" | "welfare"
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
  manual_deductions?: number
  activity_deductions?: number
  internal_course_deductions?: number
  unlimited_deductions?: number
  name?: string
  effective_date?: string
  expiry_date?: string
  activity_mode?: string
  voided?: boolean
  voided_at?: string
}

export interface ActivityRecord {
  type: string
  date: string
  name: string
  role: string
  host: string
  session_id: string
  is_public_welfare?: boolean
}

export interface PaymentRecord {
  type: string
  name: string
  quantity: number
  amount: number
  effective_date: string
  expiry_date: string
  closer_name: string
  created_at: string
  voided?: boolean
}

export interface CustomerDetail {
  customer: Customer
  purchase_summary: PurchaseSummaryItem[]
  activities: ActivityRecord[]
  healing_records: HealingRecord[]
  payment_records: PaymentRecord[]
  visit_records: VisitRecord[]
}

export const customerDetailApi = {
  get: (customerId: string, date?: string) => request<CustomerDetail>(`/api/customer-detail/${customerId}${date ? `?date=${date}` : ''}`),
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

export const operationLogApi = {
  list: (params?: OperationLogQuery) => {
    const qs = new URLSearchParams()
    if (params?.operator) qs.set("operator", params.operator)
    if (params?.method) qs.set("method", params.method)
    if (params?.section) qs.set("section", params.section)
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
  username: string
  enabled: boolean
  created_at: string
  is_system?: boolean
}

export interface AccountCreate {
  owner: string
  role: string
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
  create: (data: AccountCreate) => request<Account>("/api/accounts", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<AccountCreate>) => request<Account>(`/api/accounts/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string) => request<{ message: string }>(`/api/accounts/${id}`, { method: "DELETE" }),
  login: (username: string, password: string) => request<{ success: boolean; message?: string; token?: string; account?: Account; permissions?: string[]; customer_permissions?: string[]; customer_permissions_class_records?: string[]; customer_permissions_payment?: string[] }>("/api/accounts/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  changePassword: (id: string, oldPassword: string, newPassword: string) => request<{ message: string }>(`/api/accounts/${id}/change-password`, { method: "POST", body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }) }),
  resetPassword: (id: string, newPassword: string) => request<{ message: string }>(`/api/accounts/${id}/reset-password`, { method: "POST", body: JSON.stringify({ new_password: newPassword }) }),
  listSessions: () => request<{ id: string; account_id: string; device_info: string; ip: string; login_time: string; last_active: string }[]>("/api/accounts/sessions"),
  deleteSession: (sessionId: string) => request<{ message: string }>(`/api/accounts/sessions/${sessionId}`, { method: "DELETE" }),
  listRoles: () => request<Role[]>("/api/accounts/roles"),
  createRole: (data: RoleCreate) => request<Role>("/api/accounts/roles", { method: "POST", body: JSON.stringify(data) }),
  updateRole: (id: string, data: Partial<RoleCreate>) => request<Role>(`/api/accounts/roles/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteRole: (id: string) => request<{ message: string }>(`/api/accounts/roles/${id}`, { method: "DELETE" }),
}

// Position Permissions
export const positionPermissionApi = {
  getAll: () => request<Record<string, string[]>>("/api/position-permissions"),
  get: (position: string) => request<{ position: string; pages: string[] }>(`/api/position-permissions/${position}`),
  set: (position: string, pages: string[]) => request<{ message: string }>("/api/position-permissions", { method: "PUT", body: JSON.stringify({ position, pages }) }),
  setFull: (position: string, pages: string[], customers: string[], classRecords: string[], payment: string[], pagePermissions?: Record<string, string[]>) => request<{ message: string }>("/api/position-permissions/full", { method: "PUT", body: JSON.stringify({ position, pages, customers, class_records: classRecords, payment, page_permissions: pagePermissions || {} }) }),
  getPagePermissions: () => request<Record<string, Record<string, string[]>>>("/api/position-permissions/page-permissions"),
}

// Position Customer Permissions (section: customers | class_records | payment)
export const positionCustomerPermissionApi = {
  getAll: (section: string) => request<Record<string, string[]>>(`/api/position-customer-permissions/${section}`),
  get: (section: string, position: string) => request<{ position: string; member_types: string[] }>(`/api/position-customer-permissions/${section}/${position}`),
  set: (section: string, position: string, memberTypes: string[]) => request<{ message: string }>(`/api/position-customer-permissions/${section}`, { method: "PUT", body: JSON.stringify({ position, member_types: memberTypes }) }),
  setBatch: (position: string, data: { customers: string[]; class_records: string[]; payment: string[] }) => request<{ message: string }>(`/api/position-customer-permissions/batch`, { method: "PUT", body: JSON.stringify({ position, ...data }) }),
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
  day_theme: string
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
  save: (date: string, week_theme: string, day_theme: string, space_id: string = "") =>
    request<ActivityTheme>(`/api/activity-themes`, {
      method: "POST",
      body: JSON.stringify({ date, space_id, week_theme, day_theme }),
    }),
  batchSave: (themes: { date: string; space_id: string; week_theme: string; day_theme: string }[]) =>
    request<ActivityTheme[]>(`/api/activity-themes/batch`, {
      method: "POST",
      body: JSON.stringify({ themes }),
    }),
}

export const activityOrderApi = {
  get: (date: string, spaceId?: string) => {
    const params = new URLSearchParams({ date })
    if (spaceId) params.set("space_id", spaceId)
    return request<string[]>(`/api/activity-orders?${params.toString()}`)
  },
  save: (date: string, spaceId: string, order: string[]) =>
    request<{ ok: boolean }>(`/api/activity-orders`, {
      method: "POST",
      body: JSON.stringify({ date, space_id: spaceId, order }),
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

export interface StatisticsData {
  date: string
  invited: number
  arrived: number
  converted: number
  converted_amount?: number
}

export interface StatisticsDetail {
  nickname?: string
  customer_id?: string
  date: string
  status: string
  arrived?: boolean
  type?: string
  name?: string
  quantity?: number | string
  remaining?: number | string
  member_type?: string
  invited_count?: number
  visit_count?: number
  activity_count?: number
  total_consumption?: number
  visit_interval?: string
  amount?: number
}

export const statisticsApi = {
  overview: (params: { date_from?: string; date_to?: string; granularity?: string }) => {
    const searchParams = new URLSearchParams()
    if (params.date_from) searchParams.set("date_from", params.date_from)
    if (params.date_to) searchParams.set("date_to", params.date_to)
    if (params.granularity) searchParams.set("granularity", params.granularity)
    return request<{ data: StatisticsData[] }>(`/api/statistics/overview?${searchParams.toString()}`)
  },
  details: (params: { date_from?: string; date_to?: string; status?: string; total?: boolean }) => {
    const searchParams = new URLSearchParams()
    if (params.date_from) searchParams.set("date_from", params.date_from)
    if (params.date_to) searchParams.set("date_to", params.date_to)
    if (params.status) searchParams.set("status", params.status)
    if (params.total) searchParams.set("total", "true")
    return request<{ invited: StatisticsDetail[]; arrived: StatisticsDetail[]; converted: StatisticsDetail[] }>(`/api/statistics/details?${searchParams.toString()}`)
  },
}
