const API_BASE = "http://127.0.0.1:8000"

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }
  try {
    const user = JSON.parse(localStorage.getItem("currentUser") || "{}")
    if (user?.id) headers["X-User-Id"] = user.id
  } catch {}
  const res = await fetch(`${API_BASE}${path}`, {
    headers,
    ...options,
  })
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

// Business
export interface FeishuTable {
  id: string
  name: string
  app_token: string
  table_id: string
  record_count: number
  sync_status: "synced" | "pending" | "failed"
  last_synced_at: string | null
}

export interface FeishuTableCreate {
  name: string
  app_token: string
  table_id: string
}

export const businessApi = {
  listTables: () => request<FeishuTable[]>("/api/business/tables"),
  linkTable: (data: FeishuTableCreate) => request<FeishuTable>("/api/business/tables", { method: "POST", body: JSON.stringify(data) }),
  getRecords: (tableId: string, appToken: string) => request<{ records: Record<string, unknown>[]; total: number }>(`/api/business/tables/${tableId}/records?app_token=${appToken}`),
  syncTable: (tableId: string, appToken: string) => request<{ message: string }>(`/api/business/tables/${tableId}/sync?app_token=${appToken}`, { method: "POST" }),
  unlinkTable: (tableId: string, appToken: string) => request<{ message: string }>(`/api/business/tables/${tableId}?app_token=${appToken}`, { method: "DELETE" }),
}

// Knowledge
export interface KnowledgeDocument {
  id: string
  name: string
  type: string
  size: string
  status: "indexed" | "indexing" | "failed"
  chunk_count: number
  created_at: string
}

export interface SearchResult {
  content: string
  metadata: { doc_id: string; filename: string; chunk: number }
  score: number
}

export const knowledgeApi = {
  listDocuments: () => request<KnowledgeDocument[]>("/api/knowledge/documents"),
  uploadDocument: (file: File) => {
    const formData = new FormData()
    formData.append("file", file)
    return fetch(`${API_BASE}/api/knowledge/documents/upload`, {
      method: "POST",
      body: formData,
    }).then(async (res) => {
      if (!res.ok) throw new Error("上传失败")
      return res.json() as Promise<KnowledgeDocument>
    })
  },
  deleteDocument: (id: string) => request<{ message: string }>(`/api/knowledge/documents/${id}`, { method: "DELETE" }),
  search: (query: string, topK?: number) => request<SearchResult[]>(`/api/knowledge/search?query=${encodeURIComponent(query)}&top_k=${topK || 5}`),
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
  member_type: string
  paid_content: PaidContentItem[]
  visit_count: number
  core_situation: string
  need_tags: string
  follow_up_node: string
  follow_up_action: string
  positions: string[]
  self_tags: ("自我成长" | "共创" | "变现")[]
  basic_info: string
  assessment: string
  tags: string
  traffic_source: string
  tracking_plan: string
  created_at: string
  updated_at: string
}

export type CustomerCreate = Omit<Customer, "id" | "created_at" | "updated_at">

export const customerApi = {
  list: () => request<Customer[]>("/api/customers"),
  get: (id: string) => request<Customer>(`/api/customers/${id}`),
  create: (data: Partial<CustomerCreate>) => request<Customer>("/api/customers", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<CustomerCreate>) => request<Customer>(`/api/customers/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string) => request<{ message: string }>(`/api/customers/${id}`, { method: "DELETE" }),
  parseChat: (chatLog: string) => request<CustomerCreate>("/api/customers/parse-chat", { method: "POST", body: JSON.stringify({ chat_log: chatLog }) }),
  parseExcel: (file: File) => {
    const formData = new FormData()
    formData.append("file", file)
    return fetch(`${API_BASE}/api/customers/parse-excel`, {
      method: "POST",
      body: formData,
    }).then(async (res) => {
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.detail || `请求失败: ${res.status}`)
      }
      return res.json() as Promise<CustomerCreate[]>
    })
  },
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

// Customer AI Config (全局唯一，1:1 强关联)
export interface CustomerAIConfig {
  id: string
  name: string
  provider: "qwen" | "kimi" | "glm" | "deepseek" | "xiaomi"
  model: string
  api_key: string
  base_url: string
  system_prompt: string
  temperature: number
  max_tokens: number
  created_at: string
  updated_at: string
}

export interface CustomerAIConfigUpdate {
  name?: string
  provider?: string
  model?: string
  api_key?: string
  base_url?: string
  system_prompt?: string
  temperature?: number
  max_tokens?: number
}

export const customerAiConfigApi = {
  get: () => request<CustomerAIConfig>("/api/customer-ai-config"),
  providers: () => request<Record<string, { base_url: string; model: string }>>("/api/customer-ai-config/providers"),
  update: (data: CustomerAIConfigUpdate) => request<CustomerAIConfig>("/api/customer-ai-config", { method: "PATCH", body: JSON.stringify(data) }),
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
  activity_id: string
  activity_type: string
  arrived: boolean
  arrival_time?: string
  visit_count: number
  activity_count: number
  welfare_count: number
  remaining_count: number  // 0=无卡, -1=不限次, >0=剩余次数
  activities: ActivityInfo[]
  activity_participation: { name: string; role: string; participated: boolean }[]
  experience: string
  created_at: string
  updated_at: string
}

export interface VisitRecordCreate {
  visit_date: string
  visit_time?: string
  customer_id: string
  nickname: string
  member_type?: string
  daily_card_usage?: number
  needs?: string
  activity_id?: string
  activity_type?: string
  arrived?: boolean
  arrival_time?: string
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
  list: (date?: string, customerId?: string) => {
    const params = new URLSearchParams()
    if (date) params.set("date", date)
    if (customerId) params.set("customer_id", customerId)
    const qs = params.toString()
    return request<VisitRecord[]>(`/api/visits${qs ? `?${qs}` : ""}`)
  },
  get: (id: string) => request<VisitRecord>(`/api/visits/${id}`),
  create: (data: VisitRecordCreate) => request<VisitRecord>("/api/visits", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<VisitRecordCreate> & { activity_participation?: { name: string; role: string; participated: boolean }[]; experience?: string }) => request<VisitRecord>(`/api/visits/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string) => request<{ message: string }>(`/api/visits/${id}`, { method: "DELETE" }),
  searchCustomers: (keyword: string) => request<CustomerSearchResult[]>(`/api/visits/search-customers?q=${encodeURIComponent(keyword)}`),
}

// Course
export interface Course {
  id: string
  type: string  // 课程类型
  name: string
  teachers: string[]  // List of teacher IDs
  class_count: number
  created_at: string
  updated_at: string
}

export interface CourseCreate {
  type: string
  name: string
  teachers?: string[]
  class_count?: number
}

export const courseApi = {
  list: () => request<Course[]>("/api/courses"),
  create: (data: CourseCreate) => request<Course>("/api/courses", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<CourseCreate>) => request<Course>(`/api/courses/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string) => request<{ message: string }>(`/api/courses/${id}`, { method: "DELETE" }),
}

// Course Types
export const courseTypeApi = {
  list: () => request<string[]>("/api/course-types"),
  create: (name: string) => request<{ name: string }>("/api/course-types", { method: "POST", body: JSON.stringify({ name }) }),
  delete: (name: string) => request<{ message: string }>(`/api/course-types/${encodeURIComponent(name)}`, { method: "DELETE" }),
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
    const res = await fetch(`${API_BASE}/api/uploads/materials`, { method: "POST", body: formData })
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
  course_description: string
  teacher_ids: string[]
  participant_ids: string[]
  materials: Material[]
  groups: { name: string; member_ids: string[]; leader_id: string; deputy_id: string }[]
  is_public_welfare: boolean
  created_at: string
  updated_at: string
}

export interface ClassRecordCreate {
  date: string
  start_time?: string | null
  end_time?: string | null
  course_id: string
  course_name: string
  course_description?: string
  teacher_ids?: string[]
  is_public_welfare?: boolean
}

export const classRecordApi = {
  list: (date?: string) => request<ClassRecord[]>(`/api/class-records${date ? `?date=${date}` : ""}`),
  create: (data: ClassRecordCreate) => request<ClassRecord>("/api/class-records", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<ClassRecordCreate>) => request<ClassRecord>(`/api/class-records/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string) => request<{ message: string }>(`/api/class-records/${id}`, { method: "DELETE" }),
  updateParticipants: (id: string, participantIds: string[]) => request<ClassRecord & { warnings?: string[] }>(`/api/class-records/${id}/participants`, { method: "PATCH", body: JSON.stringify({ participant_ids: participantIds }) }),
  updateGroups: (id: string, groups: { name: string; member_ids: string[]; leader_id: string; deputy_id: string }[]) => request<ClassRecord & { warnings?: string[] }>(`/api/class-records/${id}/groups`, { method: "PATCH", body: JSON.stringify({ groups }) }),
  searchCustomers: (keyword: string) => request<CustomerSearchResult[]>(`/api/class-records/search-customers?q=${encodeURIComponent(keyword)}`),
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
}

export const groupCaseApi = {
  list: () => request<GroupCase[]>("/api/group-cases"),
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
  owner_id: string
  owner_name: string
  description: string
  participant_ids: string[]
  achiever_id: string
  achiever_name: string
  host_id: string
  host_name: string
  materials: Material[]
  created_at: string
  updated_at: string
}

export interface GroupCaseSessionCreate {
  date: string
  start_time?: string | null
  end_time?: string | null
  owner_id: string
  owner_name: string
  description?: string
  participant_ids?: string[]
  achiever_id?: string
  achiever_name?: string
  host_id?: string
  host_name?: string
}

export interface GroupCaseCustomerSearchResult {
  id: string
  nickname: string
  name: string
  member_type: string
  remaining: number
}

export const groupCaseSessionApi = {
  list: (date?: string) => request<GroupCaseSession[]>(`/api/group-case-sessions${date ? `?date=${date}` : ""}`),
  create: (data: GroupCaseSessionCreate) => request<GroupCaseSession>("/api/group-case-sessions", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<GroupCaseSessionCreate>) => request<GroupCaseSession & { warnings?: string[] }>(`/api/group-case-sessions/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string) => request<{ message: string }>(`/api/group-case-sessions/${id}`, { method: "DELETE" }),
  searchCustomers: (keyword: string) => request<GroupCaseCustomerSearchResult[]>(`/api/group-case-sessions/search-customers?q=${encodeURIComponent(keyword)}`),
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
}

export const energyKnotApi = {
  list: () => request<EnergyKnot[]>("/api/energy-knots"),
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
}

export const emotionalReleaseApi = {
  list: () => request<EmotionalRelease[]>("/api/emotional-releases"),
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
  owner_id: string
  owner_name: string
  description: string
  participant_ids: string[]
  achiever_id: string
  achiever_name: string
  host_id: string
  host_name: string
  materials: Material[]
  created_at: string
  updated_at: string
}

export interface EmotionalReleaseSessionCreate {
  date: string
  start_time?: string | null
  end_time?: string | null
  owner_id: string
  owner_name: string
  description?: string
  participant_ids?: string[]
  achiever_id?: string
  achiever_name?: string
  host_id?: string
  host_name?: string
}

export interface EmotionalReleaseCustomerSearchResult {
  id: string
  nickname: string
  name: string
  member_type: string
  remaining: number
}

export const emotionalReleaseSessionApi = {
  list: (date?: string) => request<EmotionalReleaseSession[]>(`/api/emotional-release-sessions${date ? `?date=${date}` : ""}`),
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
  description: string
  participant_ids: string[]
  host_ids: string[]
  host_names: string[]
  created_at: string
  updated_at: string
}

export interface EnergyKnotSessionCreate {
  date: string
  start_time?: string | null
  end_time?: string | null
  owner_id: string
  owner_name: string
  description?: string
  participant_ids?: string[]
  host_ids?: string[]
  host_names?: string[]
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
  create: (data: EnergyKnotSessionCreate) => request<EnergyKnotSession>("/api/energy-knot-sessions", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<EnergyKnotSessionCreate>) => request<EnergyKnotSession>(`/api/energy-knot-sessions/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
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
  host_ids: string[]
  host_names: string[]
  participant_ids: string[]
  materials: Material[]
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
  host_ids?: string[]
  host_names?: string[]
  participant_ids?: string[]
}

export interface InternalCourseSessionCustomerSearchResult {
  id: string
  nickname: string
  name: string
  member_type: string
}

export const internalCourseSessionApi = {
  list: (date?: string) => request<InternalCourseSession[]>(`/api/internal-course-sessions${date ? `?date=${date}` : ""}`),
  create: (data: InternalCourseSessionCreate) => request<InternalCourseSession>("/api/internal-course-sessions", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<InternalCourseSessionCreate>) => request<InternalCourseSession>(`/api/internal-course-sessions/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
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
}

export const internalCourseApi = {
  list: () => request<InternalCourse[]>("/api/internal-courses"),
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
  created_at: string
  updated_at: string
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
}

export const membershipCardApi = {
  list: () => request<MembershipCard[]>("/api/membership-cards"),
  create: (data: MembershipCardCreate) => request<MembershipCard>("/api/membership-cards", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<MembershipCardCreate>) => request<MembershipCard>(`/api/membership-cards/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string) => request<{ message: string }>(`/api/membership-cards/${id}`, { method: "DELETE" }),
  searchCustomers: (keyword: string) => request<CustomerSearchResult[]>(`/api/membership-cards/search-customers?q=${encodeURIComponent(keyword)}`),
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
  created_at: string
  updated_at: string
}

export interface SpaceCreate {
  name: string
}

export interface RoomCreate {
  name: string
  space_id: string
}

export const spaceApi = {
  list: () => request<Space[]>("/api/spaces"),
  create: (data: SpaceCreate) => request<Space>("/api/spaces", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<SpaceCreate>) => request<Space>(`/api/spaces/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string) => request<{ message: string }>(`/api/spaces/${id}`, { method: "DELETE" }),
  addRoom: (spaceId: string, data: { name: string }) => request<Room>(`/api/spaces/${spaceId}/rooms`, { method: "POST", body: JSON.stringify(data) }),
  deleteRoom: (spaceId: string, roomId: string) => request<{ message: string }>(`/api/spaces/${spaceId}/rooms/${roomId}`, { method: "DELETE" }),
}

// Member Identity
export interface IdentityCondition {
  type: "arrival" | "activity" | "card" | "course"
  items: string[]
  count_op: ">" | "=" | "<"
  count_value: number
  validity: "active" | "all"
}

export interface MemberIdentity {
  id: string
  name: string
  conditions: IdentityCondition[]
  operator: "all" | "any"
  sort_order: number
  created_at: string
  updated_at: string
}

export interface MemberIdentityCreate {
  name: string
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
  total_purchased: number
  total_amount: number
  used: number | string
  remaining: number | string
}

export interface ActivityRecord {
  type: string
  date: string
  name: string
  role: string
  host: string
  session_id: string
}

export interface PaymentRecordGroup {
  type: string
  items: { name: string; amount: number; date: string }[]
  total: number
}

export interface CustomerDetail {
  customer: Customer
  purchase_summary: PurchaseSummaryItem[]
  activities: ActivityRecord[]
  healing_records: HealingRecord[]
  payment_records: PaymentRecordGroup[]
}

export const customerDetailApi = {
  get: (customerId: string) => request<CustomerDetail>(`/api/customer-detail/${customerId}`),
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
    if (params?.date_from) qs.set("date_from", params.date_from)
    if (params?.date_to) qs.set("date_to", params.date_to)
    if (params?.entity_id) qs.set("entity_id", params.entity_id)
    if (params?.keyword) qs.set("keyword", params.keyword)
    const query = qs.toString()
    return request<OperationLog[]>(`/api/operation-logs${query ? `?${query}` : ""}`)
  },
}

// Accounts
export interface Account {
  id: string
  owner: string
  role: string
  username: string
  password: string
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
  login: (username: string, password: string) => request<{ success: boolean; message?: string; account?: Account; permissions?: string[] }>("/api/accounts/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  changePassword: (id: string, oldPassword: string, newPassword: string) => request<{ message: string }>(`/api/accounts/${id}/change-password`, { method: "POST", body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }) }),
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
}

// Positions (角色管理)
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
