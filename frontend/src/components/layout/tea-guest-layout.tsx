import { useCallback, useEffect, type CSSProperties } from "react"
import { LogOut } from "lucide-react"
import { IconCreditCard, IconReceipt } from "@tabler/icons-react"
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom"

import { useUsageTracking } from "@/hooks/use-usage-tracking"
import { storePagePermissions, usePagePermissions } from "@/hooks/use-page-permissions"
import { clearAuthState, positionPermissionApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
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

  const menuItems = [
    { title: "消费记录", path: "/tea-guest/consumption-records", icon: IconCreditCard, visible: canViewConsumption },
    { title: "支出", path: "/tea-guest/expenses", icon: IconReceipt, visible: canViewExpenses },
  ].filter(item => item.visible)

  return (
    <SidebarProvider style={{ "--sidebar-width": "11rem" } as CSSProperties}>
      <Sidebar
        style={{
          "--sidebar": "#ffffff",
          "--sidebar-foreground": "#212631",
          "--sidebar-accent": "#eaf1ff",
          "--sidebar-accent-foreground": "#212631",
          "--sidebar-border": "#eef0f1",
          "--sidebar-ring": "#3370ff",
        } as CSSProperties}
      >
        <SidebarHeader className="px-5 pt-5 pb-2">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-[#3370ff] text-[12px] font-medium text-white">
              茶
            </div>
            <span className="text-[13px] font-medium tracking-tight text-[#212631]">茶客业务</span>
          </div>
        </SidebarHeader>
        <SidebarContent className="mt-4 pb-5">
          <SidebarGroup className="p-0">
            <SidebarGroupLabel className="mt-2.5 mb-0 flex h-[26px] select-none items-center px-5 text-[12px] font-normal uppercase text-[#a8b1bd]">
              业务
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-[2px]">
                {menuItems.map(item => {
                  const isActive = location.pathname === item.path
                  return (
                    <SidebarMenuItem key={item.path}>
                      <SidebarMenuButton
                        render={<Link to={item.path} />}
                        isActive={isActive}
                        className={`relative mx-2 h-[34px] w-[calc(100%_-_16px)] gap-2.5 rounded-[8px] px-3 text-[13px] font-normal transition-colors ${isActive ? "bg-[#eaf1ff] text-[#212631] before:absolute before:bottom-2 before:left-0 before:top-2 before:w-[3px] before:rounded-r-[3px] before:bg-[#3370ff] hover:bg-[#eaf1ff] hover:text-[#212631] data-active:bg-[#eaf1ff] data-active:text-[#212631] data-active:hover:bg-[#eaf1ff] data-active:hover:text-[#212631]" : "text-[#212631] hover:bg-[#f0f5ff]"}`}
                      >
                        <item.icon className={`h-3.5 w-3.5 shrink-0 ${isActive ? "text-[#245bdb]" : "text-[#79838f]"}`} />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>

      <SidebarInset className="min-w-0">
        <header className="flex h-[38px] items-center justify-between border-b-2 border-[#f0f1f2] bg-white px-5">
          <div className="flex items-center gap-2">
            <SidebarTrigger />
            <SystemSwitcher currentSystem="tea-guest" />
          </div>
          <div className="flex items-center gap-2">
            {ownerName && <span className="text-xs text-[#8f959e]">{ownerName}</span>}
            <Button variant="ghost" size="sm" className="h-8 text-xs font-normal text-[#8f959e]" onClick={handleLogout}>
              <LogOut className="mr-1.5 h-3.5 w-3.5" />退出登录
            </Button>
          </div>
        </header>
        <main className="min-w-0 flex-1 overflow-y-auto bg-white">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
