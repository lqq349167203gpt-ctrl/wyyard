const API_BASE = "http://127.0.0.1:8000"

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
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
}

export interface AgentUpdate {
  name?: string
  description?: string
  model?: string
  system_prompt?: string
  temperature?: number
  max_tokens?: number
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

export const businessApi = {
  listTables: () => request<FeishuTable[]>("/api/business/tables"),
  syncTable: (id: string) => request<{ message: string }>(`/api/business/tables/${id}/sync`, { method: "POST" }),
}

// Health
export const healthApi = {
  check: () => request<{ status: string; app: string }>("/api/health"),
}
