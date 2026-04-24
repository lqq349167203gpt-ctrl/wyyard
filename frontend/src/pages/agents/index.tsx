import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Bot, Plus, Play, Square, Settings, Trash2 } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { agentApi, type Agent, type AgentCreate } from "@/lib/api"

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<AgentCreate>({
    name: "",
    description: "",
    model: "claude-sonnet-4-6",
    system_prompt: "",
    temperature: 0.7,
    max_tokens: 4096,
  })

  const loadAgents = () => {
    agentApi.list().then(setAgents).catch(() => {})
  }

  useEffect(() => { loadAgents() }, [])

  const handleCreate = async () => {
    await agentApi.create(form)
    setOpen(false)
    setForm({ name: "", description: "", model: "claude-sonnet-4-6", system_prompt: "", temperature: 0.7, max_tokens: 4096 })
    loadAgents()
  }

  const handleToggle = async (agent: Agent) => {
    const newStatus = agent.status === "running" ? "stopped" : "running"
    await agentApi.update(agent.id, { status: newStatus })
    loadAgents()
  }

  const handleDelete = async (id: string) => {
    await agentApi.delete(id)
    loadAgents()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Agent 管理</h1>
          <p className="text-sm text-muted-foreground mt-1">创建、配置和监控 AI Agent</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button />}>
              <Plus className="mr-2 h-4 w-4" />
              新建 Agent
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>新建 Agent</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>名称</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="给 Agent 起个名字" />
              </div>
              <div className="space-y-2">
                <Label>描述</Label>
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="简要说明用途" />
              </div>
              <div className="space-y-2">
                <Label>模型</Label>
                <Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>系统提示词</Label>
                <Textarea value={form.system_prompt} onChange={(e) => setForm({ ...form, system_prompt: e.target.value })} placeholder="定义 Agent 的角色和行为" rows={4} />
              </div>
              <Button onClick={handleCreate} disabled={!form.name} className="w-full">创建</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {agents.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Bot className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">暂无 Agent，点击上方按钮创建</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <Card key={agent.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Bot className="h-4 w-4" />
                    <CardTitle className="text-base">{agent.name}</CardTitle>
                  </div>
                  <Badge variant={agent.status === "running" ? "default" : "secondary"}>
                    {agent.status === "running" ? "运行中" : "已停止"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">{agent.description || "暂无描述"}</p>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{agent.model}</span>
                  <span>{agent.message_count} 条消息</span>
                </div>
                <div className="flex items-center gap-2 pt-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => handleToggle(agent)}>
                    {agent.status === "running" ? (
                      <><Square className="mr-1 h-3 w-3" /> 停止</>
                    ) : (
                      <><Play className="mr-1 h-3 w-3" /> 启动</>
                    )}
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1">
                    <Settings className="mr-1 h-3 w-3" /> 配置
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleDelete(agent.id)}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
