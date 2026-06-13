import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Send, HelpCircle, ExternalLink, Square, Image as ImageIcon, X } from "lucide-react"
import { systemHelperApi } from "@/lib/api"
import { ActionCard, type ActionData } from "@/components/action-card"

export interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

const EXAMPLE_QUESTIONS = [
  "怎么添加客户？",
  "会员活动在哪里？",
  "怎么安排活动？",
  "如何查看操作日志？",
  "今天张三来参加了瑜伽课",
  "李四买了399次卡",
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
  const [pendingAction, setPendingAction] = useState<ActionData | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, pendingAction])

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const base64 = event.target?.result as string
      const base64Data = base64.split(",")[1]
      setSelectedImage(base64Data)
      setImagePreview(base64)
    }
    reader.readAsDataURL(file)
  }

  const clearImage = () => {
    setSelectedImage(null)
    setImagePreview(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const handleSend = async (text?: string) => {
    const content = text || input.trim()
    if ((!content && !selectedImage) || sending) return

    const userMsg: ChatMessage = { role: "user", content: content || "[图片]" }
    setMessages((prev) => [...prev, userMsg])
    setInput("")
    setSending(true)
    setPendingAction(null)

    const imageData = selectedImage
    clearImage()

    try {
      const history: ChatMessage[] = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }))

      let result
      if (imageData) {
        result = await systemHelperApi.analyzeImage(imageData, content, history)
      } else {
        result = await systemHelperApi.parseEntry(content, history)
      }

      if (result.action === "chat") {
        setMessages((prev) => [...prev, { role: "assistant", content: result.message || "" }])
      } else {
        const actionData: ActionData = {
          action: result.action,
          confidence: result.confidence,
          data: result.data || {},
          missing_required: result.missing_required || [],
          missing_optional: result.missing_optional || [],
          customer_candidates: result.customer_candidates || [],
          message: result.message,
        }
        setMessages((prev) => [...prev, { role: "assistant", content: result.message || "" }])
        setPendingAction(actionData)
      }
    } catch (err: any) {
      setMessages((prev) => [...prev, { role: "assistant", content: "抱歉，请求出错了，请重试。" }])
    } finally {
      setSending(false)
    }
  }

  const handleConfirm = async () => {
    if (!pendingAction) return
    setActionLoading(true)
    try {
      const result = await systemHelperApi.executeEntry(pendingAction.action, pendingAction.data)
      if (result.success) {
        setMessages((prev) => [...prev, { role: "assistant", content: `✅ ${result.message}` }])
      } else {
        setMessages((prev) => [...prev, { role: "assistant", content: `❌ ${result.message}` }])
      }
      setPendingAction(null)
    } catch (err) {
      setMessages((prev) => [...prev, { role: "assistant", content: "❌ 录入失败，请重试。" }])
    } finally {
      setActionLoading(false)
    }
  }

  const handleCancel = () => {
    setPendingAction(null)
    setMessages((prev) => [...prev, { role: "assistant", content: "已取消录入。" }])
  }

  const handleSelectCustomer = (customerId: string, nickname: string) => {
    if (!pendingAction) return
    setPendingAction({
      ...pendingAction,
      data: { ...pendingAction.data, customer_id: customerId, nickname },
      customer_candidates: undefined,
      missing_required: (pendingAction.missing_required || []).filter(f => f !== "customer_id"),
    })
  }

  return (
    <div className="flex flex-col h-full">
      {/* 消息区 */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <HelpCircle className="h-10 w-10 text-[#8f959e] mb-3" />
            <p className="text-sm text-[#2b2f36] font-medium">茶苑助手</p>
            <p className="text-xs text-[#8f959e] mt-1">问我任何系统操作相关的问题，或输入要录入的信息</p>
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
                {parsed && parsed.text && (
                  <div className="px-3 py-2 rounded-lg text-[13px] whitespace-pre-wrap bg-[#f7f8fa] text-[#2b2f36]">
                    {parsed.text}
                  </div>
                )}
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
                {!isAssistant && (
                  <div className="px-3 py-2 rounded-lg text-[13px] whitespace-pre-wrap bg-[#3370ff] text-white">
                    {msg.content}
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {pendingAction && (
          <div className="flex justify-start">
            <ActionCard
              actionData={pendingAction}
              onConfirm={handleConfirm}
              onCancel={handleCancel}
              onSelectCustomer={handleSelectCustomer}
              loading={actionLoading}
            />
          </div>
        )}

        {sending && (
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
      <div className="border-t px-4 py-3">
        {imagePreview && (
          <div className="mb-2 relative inline-block">
            <img src={imagePreview} alt="预览" className="h-20 rounded border border-[#e0e0e0]" />
            <button
              onClick={clearImage}
              className="absolute -top-1.5 -right-1.5 h-5 w-5 bg-[#f54a45] text-white rounded-full flex items-center justify-center"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageSelect}
            className="hidden"
          />
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2"
            onClick={() => fileInputRef.current?.click()}
            disabled={sending}
          >
            <ImageIcon className="h-3.5 w-3.5" />
          </Button>
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && !sending && handleSend()}
            placeholder="输入问题、录入信息或上传图片..."
            disabled={sending}
            className="flex-1 min-h-[64px] text-xs resize-none"
            rows={2}
          />
          {sending ? (
            <Button onClick={() => {}} size="sm" variant="outline" className="h-8 px-3" disabled>
              <Square className="h-3.5 w-3.5 fill-current" />
            </Button>
          ) : (
            <Button onClick={() => handleSend()} disabled={!input.trim() && !selectedImage} size="sm" className="h-8 px-3">
              <Send className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
