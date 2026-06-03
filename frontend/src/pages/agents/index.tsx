import { useEffect, useState } from "react"
import { useEnterToNext } from "@/hooks/use-enter-to-next"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Bot, Plus, Play, Square, Trash2, MessageSquare, User, Settings } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { agentApi, customerAiConfigApi, type Agent, type AgentCreate, type CustomerAIConfig, type CustomerAIConfigUpdate } from "@/lib/api"

const PROVIDER_LABELS: Record<string, string> = {
  qwen: "通义千问 (Qwen)",
  kimi: "Kimi (月之暗面)",
  glm: "GLM (智谱)",
  deepseek: "DeepSeek",
  xiaomi: "小米 (MiMo)",
}

export default function AgentsPage() {
  const enterToNext = useEnterToNext()
  const navigate = useNavigate()
  const [agents, setAgents] = useState<Agent[]>([])
  const [customerConfig, setCustomerConfig] = useState<CustomerAIConfig | null>(null)
  const [providers, setProviders] = useState<Record<string, { base_url: string; model: string }>>({})
  const [agentDialogOpen, setAgentDialogOpen] = useState(false)
  const [customerConfigExpanded, setCustomerConfigExpanded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<AgentCreate>({
    name: "",
    description: "",
    model: "glm-5",
    system_prompt: "",
    temperature: 0.7,
    max_tokens: 4096,
    ai_config_id: null,
  })

  const loadAgents = () => agentApi.list().then(setAgents).catch(() => {})
  const loadCustomerConfig = () => {
    customerAiConfigApi.get().then(setCustomerConfig).catch(() => {})
    customerAiConfigApi.providers().then(setProviders).catch(() => {})
  }

  useEffect(() => { loadAgents(); loadCustomerConfig() }, [])

  const handleCreateAgent = async () => {
    await agentApi.create(form)
    setAgentDialogOpen(false)
    setForm({ name: "", description: "", model: "glm-5", system_prompt: "", temperature: 0.7, max_tokens: 4096, ai_config_id: null })
    loadAgents()
  }

  const handleToggle = async (agent: Agent) => {
    await agentApi.update(agent.id, { status: agent.status === "running" ? "stopped" : "running" })
    loadAgents()
  }

  const handleDeleteAgent = async (id: string) => {
    await agentApi.delete(id)
    loadAgents()
  }

  const handleProviderChange = (provider: "qwen" | "kimi" | "glm" | "deepseek" | "xiaomi" | null) => {
    if (!provider) return
    const defaults = providers[provider] || {}
    setCustomerConfig((prev) => prev ? { ...prev, provider, model: defaults.model || prev.model, base_url: defaults.base_url || prev.base_url } : null)
  }

  const handleSaveCustomerConfig = async () => {
    if (!customerConfig) return
    setSaving(true)
    try {
      const update: CustomerAIConfigUpdate = {
        name: customerConfig.name, provider: customerConfig.provider, model: customerConfig.model,
        api_key: customerConfig.api_key, base_url: customerConfig.base_url,
        system_prompt: customerConfig.system_prompt, temperature: customerConfig.temperature, max_tokens: customerConfig.max_tokens,
      }
      const result = await customerAiConfigApi.update(update)
      setCustomerConfig(result)
      setCustomerConfigExpanded(false)
    } catch (error) { alert(error instanceof Error ? error.message : "保存失败") }
    finally { setSaving(false) }
  }

  return (
    <div className="px-6 pt-12 pb-6 space-y-3">
      <div className="flex items-center justify-between pb-2">
        <div>
          <h1 className="text-lg font-semibold">AI 配置</h1>
          <p className="text-xs text-muted-foreground mt-1.5">创建和管理 AI Agent，配置模型参数</p>
        </div>
        <Button size="sm" className="h-8 text-xs" onClick={() => setAgentDialogOpen(true)}>
          <Plus className="mr-1 h-3.5 w-3.5" /> 新建 Agent
        </Button>
        <Dialog open={agentDialogOpen} onOpenChange={setAgentDialogOpen}>
          <DialogContent className="p-0 gap-0">
            <DialogHeader className="px-6 pt-5 pb-4 border-b">
              <DialogTitle className="text-base">新建 Agent</DialogTitle>
            </DialogHeader>
            <div className="px-6 py-5 space-y-5" {...enterToNext}>
              <div className="grid grid-cols-[70px_1fr] items-center gap-2">
                <Label className="text-[12px] text-[#4e535a] font-light text-right">名称</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="给 Agent 起个名字" />
              </div>
              <div className="grid grid-cols-[70px_1fr] items-center gap-2">
                <Label className="text-[12px] text-[#4e535a] font-light text-right">描述</Label>
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="简要说明用途" />
              </div>
              <div className="grid grid-cols-[70px_1fr] items-center gap-2">
                <Label className="text-[12px] text-[#4e535a] font-light text-right">模型</Label>
                <Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
              </div>
              <div className="grid grid-cols-[70px_1fr] items-start gap-2">
                <Label className="text-[12px] text-[#4e535a] font-light text-right pt-2.5">提示词</Label>
                <Textarea value={form.system_prompt} onChange={(e) => setForm({ ...form, system_prompt: e.target.value })} placeholder="定义 Agent 的角色和行为" rows={4} className="resize-none" />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button variant="outline" size="sm" onClick={() => setAgentDialogOpen(false)}>取消</Button>
                <Button size="sm" onClick={handleCreateAgent} disabled={!form.name}>创建</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* 客户管理 AI 配置 */}
      <Card className="shadow-none">
        <CardHeader className="px-5 pt-4 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm font-semibold">客户管理 AI 配置</CardTitle>
            </div>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setCustomerConfigExpanded(true)}>
              <Settings className="mr-1 h-3 w-3" /> 配置
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">配置客户管理中 AI 录入功能使用的模型和参数</p>
        </CardHeader>
        <CardContent className="px-5 pb-4 pt-0">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">当前模型：</span>
            <Badge variant="secondary" className="text-xs">{customerConfig?.model || "glm-5"}</Badge>
            <span className="text-muted-foreground text-xs">({PROVIDER_LABELS[customerConfig?.provider || "glm"]})</span>
          </div>
        </CardContent>
      </Card>

      {/* 客户管理 AI 配置弹窗 */}
      <Dialog open={customerConfigExpanded} onOpenChange={setCustomerConfigExpanded}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-base">客户管理 AI 配置</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-5" {...enterToNext}>
            {customerConfig && (
              <>
                <div className="grid grid-cols-[70px_1fr] items-center gap-2">
                  <Label className="text-[12px] text-[#4e535a] font-light text-right">名称</Label>
                  <Input value={customerConfig.name} onChange={(e) => setCustomerConfig({ ...customerConfig, name: e.target.value })} placeholder="如：客户信息提取" />
                </div>
                <div className="grid grid-cols-[70px_1fr] items-center gap-2">
                  <Label className="text-[12px] text-[#4e535a] font-light text-right">厂商</Label>
                  <Select value={customerConfig.provider} onValueChange={handleProviderChange}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(PROVIDER_LABELS).map(([key, label]) => (
                        <SelectItem key={key} value={key}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid grid-cols-[60px_1fr] items-center gap-2">
                    <Label className="text-[12px] text-[#4e535a] font-light text-right">模型</Label>
                    <Input value={customerConfig.model} onChange={(e) => setCustomerConfig({ ...customerConfig, model: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-[60px_1fr] items-center gap-2">
                    <Label className="text-[12px] text-[#4e535a] font-light text-right">Key</Label>
                    <Input type="password" value={customerConfig.api_key} onChange={(e) => setCustomerConfig({ ...customerConfig, api_key: e.target.value })} placeholder="sk-..." />
                  </div>
                </div>
                <div className="grid grid-cols-[70px_1fr] items-center gap-2">
                  <Label className="text-[12px] text-[#4e535a] font-light text-right">Base URL</Label>
                  <Input value={customerConfig.base_url} onChange={(e) => setCustomerConfig({ ...customerConfig, base_url: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid grid-cols-[70px_1fr] items-center gap-2">
                    <Label className="text-[12px] text-[#4e535a] font-light text-right">Temp</Label>
                    <Input type="number" min="0" max="2" step="0.1" value={customerConfig.temperature} onChange={(e) => setCustomerConfig({ ...customerConfig, temperature: parseFloat(e.target.value) || 0 })} />
                  </div>
                  <div className="grid grid-cols-[70px_1fr] items-center gap-2">
                    <Label className="text-[12px] text-[#4e535a] font-light text-right">Max Tokens</Label>
                    <Input type="number" min="1" max="8192" value={customerConfig.max_tokens} onChange={(e) => setCustomerConfig({ ...customerConfig, max_tokens: parseInt(e.target.value) || 2048 })} />
                  </div>
                </div>
                <div className="grid grid-cols-[70px_1fr] items-start gap-2">
                  <Label className="text-[12px] text-[#4e535a] font-light text-right pt-2.5">提示词</Label>
                  <Textarea value={customerConfig.system_prompt} onChange={(e) => setCustomerConfig({ ...customerConfig, system_prompt: e.target.value })} placeholder="留空使用默认提示词" rows={5} className="resize-none" />
                </div>
                <div className="flex justify-end gap-2 pt-2 border-t">
                  <Button variant="outline" size="sm" onClick={() => setCustomerConfigExpanded(false)}>取消</Button>
                  <Button size="sm" onClick={handleSaveCustomerConfig} disabled={saving}>{saving ? "保存中..." : "保存"}</Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Agent 列表 */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-sm font-semibold">Agent 列表</h2>
          <Badge variant="secondary" className="text-xs">{agents.length}</Badge>
        </div>

        {agents.length === 0 ? (
          <div className="bg-white rounded-lg py-16 text-center">
            <Bot className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">暂无 Agent，点击上方按钮创建</p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {agents.map((agent) => (
              <Card key={agent.id} className="shadow-none">
                <CardHeader className="px-5 pt-4 pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Bot className="h-4 w-4 text-muted-foreground" />
                      <CardTitle className="text-sm font-semibold">{agent.name}</CardTitle>
                    </div>
                    <Badge variant={agent.status === "running" ? "default" : "secondary"} className="text-xs">
                      {agent.status === "running" ? "运行中" : "已停止"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="px-5 pb-4 space-y-3">
                  <p className="text-xs text-muted-foreground">{agent.description || "暂无描述"}</p>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{agent.model}</span>
                    <span>{agent.message_count} 条消息</span>
                  </div>
                  <div className="flex items-center gap-2 pt-1 border-t">
                    <Button variant="outline" size="sm" className="flex-1 h-7 text-xs" onClick={() => navigate(`/agents/${agent.id}/chat`)}>
                      <MessageSquare className="mr-1 h-3 w-3" /> 对话
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1 h-7 text-xs" onClick={() => handleToggle(agent)}>
                      {agent.status === "running" ? <><Square className="mr-1 h-3 w-3" /> 停止</> : <><Play className="mr-1 h-3 w-3" /> 启动</>}
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => handleDeleteAgent(agent.id)}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
