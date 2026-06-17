import { useState, useCallback, useRef } from "react"
import { X, User, Bot } from "lucide-react"
import { chatHistoryApi, accountApi, type ChatRecord, type Account } from "@/lib/api"
import { SelectDropdown } from "@/components/select-dropdown"
import { useServerPagination } from "@/hooks/use-server-pagination"
import { PaginationBar } from "@/components/pagination-bar"

const PAGE_SIZE = 20

export default function ChatHistoryPage() {
  const [userFilter, setUserFilter] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [keyword, setKeyword] = useState("")
  const [accounts, setAccounts] = useState<Account[]>([])
  const filtersRef = useRef({ userFilter, dateFrom, dateTo, keyword })

  const fetchRecords = useCallback(async (page: number, pageSize: number) => {
    const f = filtersRef.current
    return chatHistoryApi.listPaginated({
      user_id: f.userFilter || undefined,
      date_from: f.dateFrom || undefined,
      date_to: f.dateTo || undefined,
      keyword: f.keyword || undefined,
    }, page, pageSize)
  }, [])

  const {
    paginatedItems: records, currentPage, totalPages, totalItems,
    goToPage, startIndex, endIndex, loading,
  } = useServerPagination<ChatRecord>(fetchRecords, { pageSize: PAGE_SIZE })

  const handleFilterChange = (field: string, value: string) => {
    switch (field) {
      case "user": setUserFilter(value); filtersRef.current.userFilter = value; break
      case "from": setDateFrom(value); filtersRef.current.dateFrom = value; break
      case "to": setDateTo(value); filtersRef.current.dateTo = value; break
      case "keyword": setKeyword(value); filtersRef.current.keyword = value; break
    }
    goToPage(1)
  }

  const handleClear = () => {
    setUserFilter("")
    setDateFrom("")
    setDateTo("")
    setKeyword("")
    filtersRef.current = { userFilter: "", dateFrom: "", dateTo: "", keyword: "" }
    goToPage(1)
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
  }

  // 按 session_id 分组
  const groupedSessions = (() => {
    const sessions: { session_id: string; user_name: string; user_role: string; messages: ChatRecord[] }[] = []
    const sessionMap = new Map<string, ChatRecord[]>()

    for (const record of records) {
      const key = record.session_id || record.id
      if (!sessionMap.has(key)) sessionMap.set(key, [])
      sessionMap.get(key)!.push(record)
    }

    for (const [sessionId, msgs] of sessionMap) {
      msgs.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      const firstMsg = msgs[0]
      sessions.push({
        session_id: sessionId,
        user_name: firstMsg.user_name,
        user_role: firstMsg.user_role,
        messages: msgs,
      })
    }

    return sessions
  })()

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-lg font-semibold">沟通记录</h1>
        <p className="text-xs text-muted-foreground mt-0.5">查看每个账号与茶苑助手的对话记录</p>
      </div>

      {/* 筛选栏 */}
      <div className="flex items-end gap-3 flex-wrap">
        <div className="flex flex-col gap-1">
          <label className="text-[12px] text-[#8f959e]">用户</label>
          <SelectDropdown
            value={userFilter}
            options={[
              { value: "", label: "全部" },
              ...accounts.map(a => ({ value: a.id, label: a.owner || a.username })),
            ]}
            placeholder="全部"
            onChange={(v) => handleFilterChange("user", v)}
            className="w-36"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[12px] text-[#8f959e]">开始日期</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => handleFilterChange("from", e.target.value)}
            className={`h-8 w-36 rounded-md border border-[#e0e0e0] px-2.5 text-[12px] outline-none focus:border-[#3370ff] ${!dateFrom ? "text-[#8f959e] date-empty" : "text-[#2b2f36]"}`}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[12px] text-[#8f959e]">结束日期</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => handleFilterChange("to", e.target.value)}
            className={`h-8 w-36 rounded-md border border-[#e0e0e0] px-2.5 text-[12px] outline-none focus:border-[#3370ff] ${!dateTo ? "text-[#8f959e] date-empty" : "text-[#2b2f36]"}`}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[12px] text-[#8f959e]">关键词</label>
          <input
            value={keyword}
            onChange={(e) => handleFilterChange("keyword", e.target.value)}
            placeholder="搜索内容..."
            className="h-8 w-40 rounded-md border border-[#e0e0e0] px-2.5 text-[12px] outline-none focus:border-[#3370ff]"
          />
        </div>
        <button
          onClick={handleClear}
          className="h-8 px-4 rounded-md border border-[#e0e0e0] text-[12px] text-[#4e535a] hover:bg-[#f5f6f7] flex items-center gap-1"
        >
          <X className="h-3.5 w-3.5" />
          清空
        </button>
      </div>

      {/* 对话列表 */}
      {!loading && totalItems === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">暂无沟通记录</div>
      ) : (
        <>
          <div className="space-y-4">
            {groupedSessions.map((session) => (
              <div key={session.session_id} className="bg-white rounded-lg border border-[#e8e8e8] overflow-hidden">
                <div className="px-4 py-2 bg-[#f7f8fa] border-b border-[#e8e8e8] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <User className="h-3.5 w-3.5 text-[#8f959e]" />
                    <span className="text-[12px] font-medium text-[#2b2f36]">
                      {session.user_name || "未知用户"}
                    </span>
                    {session.user_role && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">
                        {session.user_role}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-[#b0b5bb]">
                    {session.messages[0] && formatDate(session.messages[0].created_at)}
                  </span>
                </div>
                <div className="divide-y divide-[#f0f0f0]">
                  {session.messages.map((msg) => (
                    <div key={msg.id} className="px-4 py-3">
                      <div className="flex items-start gap-2">
                        {msg.role === "user" ? (
                          <User className="h-4 w-4 text-[#8f959e] mt-0.5 shrink-0" />
                        ) : (
                          <Bot className="h-4 w-4 text-[#3370ff] mt-0.5 shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] text-[#8f959e] mb-1">
                            {msg.role === "user" ? "用户" : "茶苑助手"}
                          </div>
                          <div className="text-[13px] text-[#2b2f36] whitespace-pre-wrap break-words">
                            {msg.content}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <PaginationBar
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            startIndex={startIndex}
            endIndex={endIndex}
            onPageChange={goToPage}
          />
        </>
      )}
    </div>
  )
}
