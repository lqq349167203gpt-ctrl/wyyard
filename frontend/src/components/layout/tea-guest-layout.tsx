import { useCallback, useEffect } from "react"
import { LogOut } from "lucide-react"
import { Outlet, useLocation, useNavigate } from "react-router-dom"

import { useUsageTracking } from "@/hooks/use-usage-tracking"
import { storePagePermissions, usePagePermissions } from "@/hooks/use-page-permissions"
import { clearAuthState, positionPermissionApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { SystemSwitcher } from "./system-switcher"
import { hasPagePermission } from "@/lib/page-permissions"

export function TeaGuestLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const currentUser = (() => {
    try { return JSON.parse(localStorage.getItem("currentUser") || "{}") } catch { return {} }
  })()
  const ownerName = currentUser.owner || ""
  const userRole = currentUser.role || ""
  const permissions = usePagePermissions()
  const { stopUsageTracking } = useUsageTracking(location.pathname)
  const canViewConsumption = userRole === "超级管理员" || hasPagePermission(permissions, "tea-guest-consumption-records")
  const canViewExpenses = userRole === "超级管理员" || hasPagePermission(permissions, "tea-guest-expenses")

  const syncPagePermissions = useCallback(() => {
    if (!userRole || userRole === "超级管理员") return
    positionPermissionApi.get(userRole)
      .then(result => storePagePermissions(result.pages || []))
      .catch(() => {})
  }, [userRole])

  useEffect(() => {
    document.title = location.pathname === "/tea-guest/expenses" ? "茶客业务 - 支出" : "茶客业务 - 消费记录"
    syncPagePermissions()
  }, [location.pathname, syncPagePermissions])

  useEffect(() => {
    window.addEventListener("focus", syncPagePermissions)
    return () => window.removeEventListener("focus", syncPagePermissions)
  }, [syncPagePermissions])

  const handleLogout = async () => {
    await stopUsageTracking()
    clearAuthState()
    navigate("/login")
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#f4f5f6]">
      <header className="flex h-[46px] shrink-0 items-center justify-between border-b border-[#e8e9eb] bg-white px-5">
        <SystemSwitcher currentSystem="tea-guest" />
        <div className="flex items-center gap-2">
          {ownerName && <span className="text-[12px] text-[#8f959e]">{ownerName}</span>}
          <Button variant="ghost" size="sm" className="h-8 text-[12px] font-normal text-[#8f959e]" onClick={handleLogout}>
            <LogOut className="mr-1.5 h-3.5 w-3.5" />退出登录
          </Button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className="w-[140px] shrink-0 border-r border-[#e8e9eb] bg-white px-3 py-4">
          <div className="mb-2 px-2 text-[12px] text-[#8f959e]">茶客业务</div>
          <nav className="space-y-1">
            {canViewConsumption && (
              <button type="button" onClick={() => navigate("/tea-guest/consumption-records")} className={`flex h-9 w-full items-center rounded-[4px] px-3 text-[13px] transition-colors ${location.pathname === "/tea-guest/consumption-records" ? "bg-[#f5f6f7] text-[#3370ff]" : "text-[#4e535a] hover:bg-[#f7f8fa]"}`}>
                消费记录
              </button>
            )}
            {canViewExpenses && (
              <button type="button" onClick={() => navigate("/tea-guest/expenses")} className={`flex h-9 w-full items-center rounded-[4px] px-3 text-[13px] transition-colors ${location.pathname === "/tea-guest/expenses" ? "bg-[#f5f6f7] text-[#3370ff]" : "text-[#4e535a] hover:bg-[#f7f8fa]"}`}>
                支出
              </button>
            )}
          </nav>
        </aside>
        <main className="min-w-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
