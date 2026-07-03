import { useState, useCallback, useEffect, useRef } from "react"
import { X, MessageSquare } from "lucide-react"
import { chatHistoryApi, accountApi, type ChatRecord, type Account } from "@/lib/api"

const PAGE_SIZE = 100

const MODE_TABS = [
  { value: "", label: "全部" },
  { value: "customer", label: "客户" },
  { value: "activity", label: "课表" },
  { value: "visit", label: "邀约" },
  { value: "system", label: "系统助手" },
]

const MODE_LABELS: Record<string, string> = {
  visit: "邀约",
  activity: "课表",
  customer: "客户",
  system: "系统助手",
}

const MODE_COLORS: Record<string, { bg: string; text: string }> = {
  visit: { bg: "bg-green-50", text: "text-green-600" },
  activity: { bg: "bg-orange-50", text: "text-orange-600" },
  customer: { bg: "bg-blue-50", text: "text-blue-600" },
  system: { bg: "bg-gray-50", text: "text-gray-500" },
}

interface UserEntry {
  userId: string
  userName: string
  userRole: string
  sessions: { mode: string; sessionId: string; messages: ChatRecord[]; latestTime: number }[]
  latestTime: number
}

export default function ChatHistoryPage() {
  const [modeFilter, setModeFilter] = useState("")
  const [accounts, setAccounts] = useState<Account[]>([])
  const [allRecords, setAllRecords] = useState<ChatRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState("")
  const [chatKeyword, setChatKeyword] = useState("")
  const chatEndRef = useRef<HTMLDivElement>(null)
  const [modeCounts, setModeCounts] = useState<Record<string, number>>({})

  // 加载账号列表
  useEffect(() => {
    accountApi.list().then(setAccounts).catch(() => {})
  }, [])

  // 加载各模块记录数
  useEffect(() => {
    chatHistoryApi.listPaginated({}, 1, 1000).then((res) => {
      const counts: Record<string, number> = { all: 0 }
      for (const r of (res.items || [])) {
        const m = r.mode || "other"
        counts[m] = (counts[m] || 0) + 1
        counts.all++
      }
      setModeCounts(counts)
    }).catch(() => {})
  }, [])

  // 加载所有记录
  const fetchAllRecords = useCallback(async (mode: string) => {
    setLoading(true)
    try {
      const res = await chatHistoryApi.listPaginated({
        mode: mode || undefined,
      }, 1, PAGE_SIZE)
      setAllRecords(res.items || [])
    } catch {
      setAllRecords([])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchAllRecords(modeFilter)
  }, [modeFilter, fetchAllRecords])

  // 构建用户列表：按 user_id 分组
  const userEntries: UserEntry[] = (() => {
    const userMap = new Map<string, UserEntry>()

    for (const record of allRecords) {
      const uid = record.user_id
      const t = new Date(record.created_at).getTime()
      if (!userMap.has(uid)) {
        userMap.set(uid, {
          userId: uid,
          userName: record.user_name,
          userRole: record.user_role,
          sessions: [],
          latestTime: 0,
        })
      }
      const user = userMap.get(uid)!
      if (t > user.latestTime) user.latestTime = t

      // 按 session_id 分组
      const sid = record.session_id || record.id
      let session = user.sessions.find(s => s.sessionId === sid)
      if (!session) {
        session = { mode: record.mode || "", sessionId: sid, messages: [], latestTime: 0 }
        user.sessions.push(session)
      }
      session.messages.push(record)
      if (t > session.latestTime) session.latestTime = t
    }

    // 每个 session 内按时间排序
    for (const user of userMap.values()) {
      for (const session of user.sessions) {
        session.messages.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      }
      // session 按最新时间降序
      user.sessions.sort((a, b) => b.latestTime - a.latestTime)
    }

    const entries = Array.from(userMap.values())
    entries.sort((a, b) => b.latestTime - a.latestTime)
    return entries
  })()

  // 选中的用户
  const selectedUser = userEntries.find(u => u.userId === selectedUserId)

  // 选中用户的全部消息（合并所有 session）
  const selectedMessages: ChatRecord[] = (() => {
    if (!selectedUser) return []
    const msgs: ChatRecord[] = []
    for (const session of selectedUser.sessions) {
      for (const m of session.messages) {
        msgs.push({ ...m, mode: session.mode || m.mode || "" })
      }
    }
    msgs.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    if (!chatKeyword.trim()) return msgs
    const kw = chatKeyword.trim().toLowerCase()
    return msgs.filter(m => m.content.toLowerCase().includes(kw))
  })()

  // 自动滚动到底部
  useEffect(() => {
    if (selectedMessages.length) {
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50)
    }
  }, [selectedUserId, selectedMessages.length])

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const formatShortTime = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })
  }

  const getUserModes = (user: UserEntry) => {
    const modes = new Set(user.sessions.map(s => s.mode).filter(Boolean))
    return Array.from(modes)
  }

  const getLatestMessage = (user: UserEntry) => {
    if (!user.sessions.length) return ""
    const latest = user.sessions[0]
    if (!latest.messages.length) return ""
    const lastMsg = latest.messages[latest.messages.length - 1]
    return lastMsg.content.length > 30 ? lastMsg.content.slice(0, 30) + "..." : lastMsg.content
  }

  return (
    <div className="flex flex-col h-[calc(100vh-48px)]">
      {/* Tab 栏 */}
      <div className="px-4 py-2 bg-white border-b border-[#e8e8e8] flex items-center gap-1">
        {MODE_TABS.map((tab) => {
          const isActive = modeFilter === tab.value
          const count = tab.value ? (modeCounts[tab.value] || 0) : (modeCounts.all || 0)
          return (
            <button
              key={tab.value}
              onClick={() => {
                setModeFilter(tab.value)
                setSelectedUserId("")
              }}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors flex items-center gap-1.5 ${
                isActive
                  ? "bg-[#333] text-white"
                  : "text-[#666] hover:bg-[#f5f5f5]"
              }`}
            >
              {tab.label}
              <span className={`text-[10px] ${isActive ? "text-white/70" : "text-[#b0b5bb]"}`}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      <div className="flex flex-1 min-h-0">
      {/* 左侧：用户列表 */}
      <div className="w-[280px] border-r border-[#e8e8e8] bg-white flex flex-col shrink-0">

        {/* 用户列表 */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="py-12 text-center text-xs text-[#b0b5bb]">加载中...</div>
          ) : userEntries.length === 0 ? (
            <div className="py-12 text-center text-xs text-[#b0b5bb]">暂无记录</div>
          ) : (
            userEntries.map((user) => {
              const modes = getUserModes(user)
              const isActive = user.userId === selectedUserId
              return (
                <div
                  key={user.userId}
                  onClick={() => setSelectedUserId(user.userId)}
                  className={`px-4 py-3 cursor-pointer border-b border-[#f5f6f7] transition-colors ${
                    isActive ? "bg-[#e8f0fe]" : "hover:bg-[#f7f8fa]"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[13px] font-medium text-[#1f2329] truncate">
                          {user.userName || "未知用户"}
                        </span>
                        {user.userRole && (
                          <span className="text-[10px] px-1 py-0.5 rounded bg-[#f2f3f5] text-[#8f959e] shrink-0">
                            {user.userRole}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        {modes.map(m => (
                          <span key={m} className={`text-[10px] px-1 py-0.5 rounded ${MODE_COLORS[m]?.bg || "bg-gray-50"} ${MODE_COLORS[m]?.text || "text-gray-500"}`}>
                            {MODE_LABELS[m] || m}
                          </span>
                        ))}
                      </div>
                    </div>
                    <span className="text-[10px] text-[#b0b5bb] shrink-0">
                      {formatShortTime(new Date(user.latestTime).toISOString())}
                    </span>
                  </div>
                  <div className="text-[12px] text-[#8f959e] truncate">
                    {getLatestMessage(user)}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* 右侧：聊天内容 */}
      <div className="flex-1 flex flex-col bg-[#f7f8fa] min-w-0">
        {!selectedUser ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageSquare className="w-12 h-12 text-[#d0d3d6] mx-auto mb-3" />
              <p className="text-[14px] text-[#8f959e]">选择左侧用户查看对话记录</p>
            </div>
          </div>
        ) : (
          <>
            {/* 头部 */}
            <div className="px-6 py-3 bg-white border-b border-[#e8e8e8] flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="text-[14px] font-medium text-[#1f2329] shrink-0">
                  {selectedUser.userName || "未知用户"}
                </div>
                <div className="text-[11px] text-[#b0b5bb] shrink-0">
                  {selectedUser.sessions.length} 次对话
                </div>
              </div>
              <div className="relative">
                <input
                  value={chatKeyword}
                  onChange={(e) => setChatKeyword(e.target.value)}
                  placeholder="搜索对话内容..."
                  className="h-8 w-52 rounded-md border border-[#e0e0e0] pl-3 pr-8 text-[12px] outline-none focus:border-[#3370ff]"
                />
                {chatKeyword && (
                  <button
                    onClick={() => setChatKeyword("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[#b0b5bb] hover:text-[#8f959e]"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* 消息列表 */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="max-w-[680px] mx-auto space-y-3">
                {selectedMessages.map((msg) => {
                  const isUser = msg.role === "user"
                  return (
                    <div key={msg.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                      <div className={`flex flex-col ${isUser ? "items-end" : "items-start"} min-w-0 max-w-[75%]`}>
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-[11px] text-[#b0b5bb]">
                            {isUser ? "用户" : (msg.mode === "visit" ? "邀约助手" : msg.mode === "activity" ? "课表助手" : msg.mode === "customer" ? "客户助手" : "茶苑助手")}
                          </span>
                          {msg.mode && (
                            <span className={`text-[9px] px-1 py-0.5 rounded ${MODE_COLORS[msg.mode]?.bg || ""} ${MODE_COLORS[msg.mode]?.text || ""}`}>
                              {MODE_LABELS[msg.mode] || ""}
                            </span>
                          )}
                          <span className="text-[10px] text-[#d0d3d6]">
                            {formatDate(msg.created_at)}
                          </span>
                        </div>
                        <div className={`px-3 py-2 rounded-xl text-[13px] leading-relaxed whitespace-pre-wrap break-words ${
                          isUser
                            ? "bg-[#3370ff] text-white rounded-tr-sm"
                            : "bg-white text-[#1f2329] border border-[#e8e8e8] rounded-tl-sm"
                        }`}>
                          {msg.content}
                        </div>
                      </div>
                    </div>
                  )
                })}
                <div ref={chatEndRef} />
              </div>
            </div>
          </>
        )}
      </div>
      </div>
    </div>
  )
}
