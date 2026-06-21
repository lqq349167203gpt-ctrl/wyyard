import { Outlet, useNavigate, useLocation } from "react-router-dom"
import { useEffect, useState } from "react"
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "./app-sidebar"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { SystemHelperChat, type ChatMessage } from "@/components/system-helper-chat"
import { LogOut } from "lucide-react"

const PAGE_TITLES: Record<string, string> = {



  "/visits": "无忧 - 到场人员",
  "/healing-records": "无忧 - 客户信息",
  "/courses/class-records": "无忧 - 人员安排",
  "/courses/daily-activities": "无忧 - 活动安排",
  "/payment/membership-cards": "无忧 - 会员卡",
  "/payment/group-cases": "无忧 - 觉醒游戏",
  "/payment/emotional-releases": "无忧 - 情绪释放",
  "/payment/energy-knots": "无忧 - 能量结",
  "/payment/internal-courses": "无忧 - 内部课程",
  "/agents": "无忧 - AI配置",



  "/system-logs": "无忧 - 系统日志",
  "/positions/management": "无忧 - 账号管理",
  "/config/member-identities": "无忧 - 会员身份",
  "/courses/spaces": "无忧 - 疗愈空间",
  "/healing-identities": "无忧 - 疗愈老师",
  "/operation-logs": "无忧 - 操作日志",
  "/data-records": "无忧 - 数据记录",
  "/chat-history": "无忧 - 沟通记录",
}

export function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const currentUser = JSON.parse(localStorage.getItem("currentUser") || "{}")
  const userId = currentUser.id || "anonymous"
  const ownerName = currentUser.owner || ""

  const [helperOpen, setHelperOpen] = useState(false)
  const [helperMessages, setHelperMessages] = useState<ChatMessage[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(`systemHelperMessages_${userId}`) || "[]")
    } catch { return [] }
  })
  const [helperSending, setHelperSending] = useState(false)

  useEffect(() => {
    localStorage.setItem(`systemHelperMessages_${userId}`, JSON.stringify(helperMessages))
  }, [helperMessages, userId])

  useEffect(() => {
    const title = PAGE_TITLES[location.pathname] || "无忧茶苑"
    document.title = title
  }, [location.pathname])

  const handleLogout = () => {
    localStorage.removeItem("isLoggedIn")
    localStorage.removeItem("currentUser")
    localStorage.removeItem("userPermissions")
    navigate("/login")
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <header className="flex h-11 items-center justify-between bg-white px-5 border-b-2 border-[#f0f1f2]">
          <SidebarTrigger />
          <div className="flex items-center gap-2">
            {ownerName && (
              <span className="text-xs text-[#8f959e]">{ownerName}</span>
            )}
            <Button variant="ghost" size="sm" className="h-8 text-xs text-[#8f959e] font-normal" onClick={() => setHelperOpen(true)}>
              助手
            </Button>
            <Button variant="ghost" size="sm" className="h-8 text-xs text-[#8f959e] font-normal" onClick={handleLogout}>
              <LogOut className="h-3.5 w-3.5 mr-1.5" /> 退出登录
            </Button>
          </div>
        </header>
        <main className="flex-1 min-w-0 overflow-y-auto bg-white">
          <Outlet />
        </main>
      </SidebarInset>

      <Sheet open={helperOpen} onOpenChange={setHelperOpen}>
        <SheetContent side="right" className="p-0 sm:max-w-sm" showCloseButton={false}>
          <SheetHeader className="px-4 py-3 border-b flex flex-row items-center justify-between space-y-0">
            <SheetTitle className="text-sm">
              助手
            </SheetTitle>
            <Button variant="ghost" size="icon-sm" onClick={() => setHelperOpen(false)} className="h-6 w-6">
              <span className="text-xs text-[#8f959e]">✕</span>
            </Button>
          </SheetHeader>
          <div className="h-[calc(100vh-57px)]">
            <SystemHelperChat messages={helperMessages} setMessages={setHelperMessages} sending={helperSending} setSending={setHelperSending} onNavigate={(route) => { setHelperOpen(false); navigate(route) }} currentUser={currentUser} />
          </div>
        </SheetContent>
      </Sheet>
    </SidebarProvider>
  )
}
