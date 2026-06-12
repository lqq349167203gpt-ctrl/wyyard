import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Send, HelpCircle, ExternalLink, Square } from "lucide-react"
import { systemHelperApi } from "@/lib/api"

export interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

const EXAMPLE_QUESTIONS = [
  "怎么添加客户？",
  "会员活动在哪里？",
  "怎么安排活动？",
  "如何查看操作日志？",
]

interface NavLink {
  label: string
  route: string
}

function parseNavLinks(content: string): { text: string; links: NavLink[] } {
  const links: NavLink[] = []
  const text = content.replace(/\{\{导航:([^:}]+):([^}]+)\}\}/g, (_, label, route) => {
    links.push({ label: label.trim(), route: route.trim() })
    return ""
  }).trim()
  return { text, links }
}

interface SystemHelperChatProps {
  messages: ChatMessage[]
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
  sending: boolean
  setSending: React.Dispatch<React.SetStateAction<boolean>>
  onNavigate: (route: string) => void
  currentUser?: { role?: string }
}

export function SystemHelperChat({ messages, setMessages, sending, setSending, onNavigate, currentUser }: SystemHelperChatProps) {
  const [input, setInput] = useState("")
  const bottomRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const handleSend = async (text?: string) => {
    const content = text || input.trim()
    if (!content || sending) return

    const userMsg: ChatMessage = { role: "user", content }
    setMessages((prev) => [...prev, userMsg])
    setInput("")
    setSending(true)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const history: ChatMessage[] = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }))

      const userRole = currentUser?.role
      let permissions: string[] = []
      try {
        permissions = JSON.parse(localStorage.getItem("userPermissions") || "[]")
      } catch {}

      // 添加一个空的 assistant 消息用于流式更新
      setMessages((prev) => [...prev, { role: "assistant", content: "" }])

      const stream = systemHelperApi.chat(content, history, userRole, permissions, controller.signal)
      let fullContent = ""

      for await (const chunk of stream) {
        fullContent += chunk
        setMessages((prev) => {
          const newMessages = [...prev]
          newMessages[newMessages.length - 1] = { role: "assistant", content: fullContent }
          return newMessages
        })
      }
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        setMessages((prev) => {
          const newMessages = [...prev]
          // 如果最后一条是空的 assistant 消息，替换它；否则新增
          if (newMessages.length > 0 && newMessages[newMessages.length - 1].role === "assistant" && newMessages[newMessages.length - 1].content === "") {
            newMessages[newMessages.length - 1] = { role: "assistant", content: "抱歉，请求出错了，请重试。" }
          } else {
            newMessages.push({ role: "assistant", content: "抱歉，请求出错了，请重试。" })
          }
          return newMessages
        })
      }
    } finally {
      setSending(false)
      abortRef.current = null
    }
  }

  const handleStop = () => {
    abortRef.current?.abort()
    setSending(false)
  }

  return (
    <div className="flex flex-col h-full">
      {/* 消息区 */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <HelpCircle className="h-10 w-10 text-[#8f959e] mb-3" />
            <p className="text-sm text-[#2b2f36] font-medium">系统助手</p>
            <p className="text-xs text-[#8f959e] mt-1">问我任何系统操作相关的问题</p>
            <div className="mt-4 space-y-2 w-full">
              {EXAMPLE_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => handleSend(q)}
                  className="w-full text-left px-3 py-2 text-xs text-[#4e535a] bg-[#f7f8fa] rounded-md hover:bg-[#f0f1f2] transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg, i) => {
          const isAssistant = msg.role === "assistant"
          const parsed = isAssistant ? parseNavLinks(msg.content) : null

          return (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div className="max-w-[80%]">
                <div
                  className={`px-3 py-2 rounded-lg text-[13px] whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "bg-[#3370ff] text-white"
                      : "bg-[#f7f8fa] text-[#2b2f36]"
                  }`}
                >
                  {parsed ? parsed.text : msg.content}
                </div>
                {parsed && parsed.links.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {parsed.links.map((link, j) => (
                      <button
                        key={j}
                        onClick={() => onNavigate(link.route)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] text-[#3370ff] bg-[#f0f5ff] rounded-md hover:bg-[#dbe8ff] transition-colors"
                      >
                        <ExternalLink className="h-3 w-3" />
                        {link.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })}
        {sending && messages[messages.length - 1]?.content === "" && (
          <div className="flex justify-start">
            <div className="bg-[#f7f8fa] px-3 py-2 rounded-lg text-[13px] text-[#8f959e]">
              <span className="inline-flex gap-1">
                <span className="animate-bounce" style={{ animationDelay: "0ms" }}>·</span>
                <span className="animate-bounce" style={{ animationDelay: "150ms" }}>·</span>
                <span className="animate-bounce" style={{ animationDelay: "300ms" }}>·</span>
              </span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* 输入区 */}
      <div className="border-t px-4 py-3 flex gap-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && !sending && handleSend()}
          placeholder="输入问题..."
          disabled={sending}
          className="flex-1 min-h-[64px] text-xs resize-none"
          rows={2}
        />
        {sending ? (
          <Button onClick={handleStop} size="sm" variant="outline" className="h-8 px-3">
            <Square className="h-3.5 w-3.5 fill-current" />
          </Button>
        ) : (
          <Button onClick={() => handleSend()} disabled={!input.trim()} size="sm" className="h-8 px-3">
            <Send className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  )
}
