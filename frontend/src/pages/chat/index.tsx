import { useEffect, useState, useRef } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { ArrowLeft, Send, Bot, User } from "lucide-react"
import { agentApi, type Agent, type AgentMessage } from "@/lib/api"

interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

export default function ChatPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [agent, setAgent] = useState<Agent | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (id) {
      agentApi.get(id).then(setAgent).catch(() => navigate("/agents"))
    }
  }, [id, navigate])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const handleSend = async () => {
    if (!input.trim() || !id || sending) return

    const userMsg: ChatMessage = { role: "user", content: input.trim() }
    setMessages((prev) => [...prev, userMsg])
    setInput("")
    setSending(true)

    try {
      const history: AgentMessage[] = messages.map((m) => ({
        role: m.role,
        content: m.content,
        timestamp: new Date().toISOString(),
      }))

      const result = await agentApi.chat(id, {
        message: userMsg.content,
        history,
      })

      setMessages((prev) => [...prev, { role: "assistant", content: result.content }])
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "抱歉，请求出错了，请重试。" }])
    } finally {
      setSending(false)
    }
  }

  const handleBack = async () => {
    if (id) {
      await agentApi.update(id, { status: "stopped" }).catch(() => {})
    }
    navigate("/agents")
  }

  if (!agent) return null

  return (
    <div className="flex h-[calc(100vh-5.5rem)] flex-col">
      {/* 顶部栏 */}
      <div className="flex items-center gap-3 border-b pb-4">
        <Button variant="ghost" size="sm" onClick={handleBack}>
          <ArrowLeft className="mr-1 h-4 w-4" /> 返回
        </Button>
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5" />
          <div>
            <h2 className="text-base font-semibold">{agent.name}</h2>
            <p className="text-xs text-muted-foreground">{agent.model}</p>
          </div>
        </div>
      </div>

      {/* 消息区 */}
      <div className="flex-1 overflow-y-auto space-y-4 py-4">
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <div className="text-center text-muted-foreground">
              <Bot className="mx-auto h-10 w-10 mb-3" />
              <p className="text-sm">和 {agent.name} 开始对话</p>
              <p className="text-xs mt-1">输入消息，按回车发送</p>
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {msg.role === "assistant" && (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Bot className="h-4 w-4" />
              </div>
            )}
            <Card className={`max-w-[70%] px-4 py-3 ${msg.role === "user" ? "bg-primary text-primary-foreground" : ""}`}>
              <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
            </Card>
            {msg.role === "user" && (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                <User className="h-4 w-4" />
              </div>
            )}
          </div>
        ))}
        {sending && (
          <div className="flex gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Bot className="h-4 w-4" />
            </div>
            <Card className="px-4 py-3">
              <p className="text-sm text-muted-foreground">思考中...</p>
            </Card>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* 输入区 */}
      <div className="flex gap-2 border-t pt-4">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
          placeholder={`给 ${agent.name} 发消息...`}
          disabled={sending}
          className="flex-1"
        />
        <Button onClick={handleSend} disabled={sending || !input.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
