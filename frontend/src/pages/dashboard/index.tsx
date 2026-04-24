import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Bot, Database, MessageSquare, Play } from "lucide-react"
import { agentApi, type Agent } from "@/lib/api"

export default function DashboardPage() {
  const [agents, setAgents] = useState<Agent[]>([])

  useEffect(() => {
    agentApi.list().then(setAgents).catch(() => {})
  }, [])

  const running = agents.filter((a) => a.status === "running").length
  const totalMessages = agents.reduce((sum, a) => sum + a.message_count, 0)

  const stats = [
    { title: "Agent 数量", value: agents.length, icon: Bot, color: "text-blue-600" },
    { title: "运行中", value: running, icon: Play, color: "text-green-600" },
    { title: "业务数据表", value: 5, icon: Database, color: "text-purple-600" },
    { title: "消息总量", value: totalMessages, icon: MessageSquare, color: "text-orange-600" },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">工作台</h1>
        <p className="text-sm text-muted-foreground mt-1">系统运行概览</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Agent 运行状态</CardTitle>
        </CardHeader>
        <CardContent>
          {agents.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">暂无 Agent，点击左侧「Agent 管理」创建</p>
          ) : (
            <div className="space-y-3">
              {agents.map((agent) => (
                <div
                  key={agent.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex items-center gap-3">
                    <Bot className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{agent.name}</p>
                      <p className="text-xs text-muted-foreground">{agent.model}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">
                      {agent.message_count} 条消息
                    </span>
                    <Badge variant={agent.status === "running" ? "default" : "secondary"}>
                      {agent.status === "running" ? "运行中" : "已停止"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
