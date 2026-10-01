import { Link, useLocation } from "react-router-dom"
import { prefetchRoute } from "@/lib/route-prefetch"
import { PAGES } from "@/lib/page-registry"
import { useMemo, useState, useEffect } from "react"
import {
  IconBasket,
  IconCalendarEvent,
  IconCalendar,
  IconCreditCard,
  IconShieldCheck,
  IconSparkles,
  IconUser,
  IconSettings,
  IconLock,
  IconUserOff,
  IconStars,
  IconMessageCircle,
  IconFileText,
  IconClipboardText,
  IconChevronRight,
  IconAffiliate,
  IconSchool,
  IconBook,
  IconAlertTriangle,
  IconTags,
  IconTrendingUp,
  IconLogin,
  IconChartDots,
} from "@tabler/icons-react"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { hasPagePermission } from "@/lib/page-permissions"
import { usePagePermissions } from "@/hooks/use-page-permissions"

type SidebarItem = {
  title: string
  icon: typeof IconBasket
  path: string
  permission: string
  clearTab?: string
}

const PAGE_ICONS: Record<string, typeof IconBasket> = {
  "/custom-analysis": IconChartDots,
  "/service-teachers": IconSparkles,
  "/course-statistics": IconSchool,
  "/principal": IconSchool,
  "/daily-report": IconClipboardText,
  "/healing-records": IconUser,
  "/courses/class-records": IconCalendarEvent,
  "/courses/daily-activities": IconCalendar,
  "/offline-course-records": IconBook,
  "/supervision": IconAlertTriangle,
  "/communication-records": IconMessageCircle,
  "/followup-records": IconClipboardText,
  "/config/member-identities": IconShieldCheck,
  "/config/customer-tags": IconTags,
  "/config/upsell": IconTrendingUp,
  "/healing-identities": IconSparkles,
  "/organizations": IconUser,
  "/courses/spaces": IconSettings,
  "/positions/management": IconUser,
  "/change-password": IconLock,
  "/disabled-customers": IconUserOff,
  "/agents": IconStars,
  "/chat-history": IconMessageCircle,
  "/system-logs": IconFileText,
  "/operation-logs": IconClipboardText,
  "/login-records": IconLogin,
  "/analysis-logs": IconChartDots,
  "/payment": IconCreditCard, "/payment-deductions": IconClipboardText, "/payment-refunds": IconFileText,
}
const itemsFor = (group: string): SidebarItem[] => PAGES.filter(page => page.group === group).map(page => ({ ...page, icon: PAGE_ICONS[page.path] }))
const businessItems = itemsFor("data")
const courseItems = itemsFor("business")
const communicationItems = itemsFor("communication")
const configItems = itemsFor("config")
const accountItems = itemsFor("account")
const systemItems = itemsFor("system")

function getIsSuperAdmin(): boolean {
  try {
    return JSON.parse(localStorage.getItem("currentUser") || "{}")?.role === "超级管理员"
  } catch {
    return false
  }
}

function MenuGroup({
  label,
  items,
  isOpen,
  onToggle,
  permissions,
  isSuperAdmin,
}: {
  label: string
  items: SidebarItem[]
  isOpen: boolean
  onToggle: () => void
  permissions: string[]
  isSuperAdmin: boolean
}) {
  const location = useLocation()

  const filteredItems = items.filter(item => {
    if (!item.permission || isSuperAdmin) return true
    return hasPagePermission(permissions, item.permission)
  })

  if (filteredItems.length === 0) return null

  return (
    <SidebarGroup className="p-0">
      <SidebarGroupLabel
        className="mt-2.5 mb-0 flex h-[34px] cursor-pointer select-none items-center justify-between px-5 text-[12px] font-normal text-[#a8b1bd] uppercase transition-colors hover:text-[#79838f]"
        onClick={onToggle}
      >
        <span>{label}</span>
        <IconChevronRight style={{ width: 14, height: 14 }} className={`text-[#a8b1bd] transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`} />
      </SidebarGroupLabel>
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden min-h-0">
          <SidebarGroupContent className="mt-0.5">
            <SidebarMenu className="gap-[2px]">
              {filteredItems.map((item) => {
                const isActive = location.pathname === item.path
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      render={<Link to={item.path} onPointerEnter={() => prefetchRoute(item.path)} onFocus={() => prefetchRoute(item.path)} onClick={() => { if (item.clearTab) { localStorage.removeItem(item.clearTab); if (item.clearTab === "tab_position-management") localStorage.removeItem("selectedPositionId") } }} />}
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
        </div>
      </div>
    </SidebarGroup>
  )
}

function FixedGroup({
  label,
  items,
  accessCheck,
  permissions,
  isSuperAdmin,
}: {
  label: string
  items: SidebarItem[]
  accessCheck?: (permissions: string[], isSuperAdmin: boolean) => boolean
  permissions: string[]
  isSuperAdmin: boolean
}) {
  const location = useLocation()

  if (accessCheck && !accessCheck(permissions, isSuperAdmin)) return null

  const filteredItems = items.filter(item => {
    if (!item.permission || isSuperAdmin) return true
    return hasPagePermission(permissions, item.permission)
  })

  if (filteredItems.length === 0) return null

  return (
    <SidebarGroup className="p-0">
      <SidebarGroupLabel className="mt-2.5 mb-0 flex h-[26px] select-none items-center px-5 text-[12px] font-normal text-[#a8b1bd] uppercase">
        <span>{label}</span>
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu className="gap-[2px]">
          {filteredItems.map((item) => {
            const isActive = location.pathname === item.path
            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  render={<Link to={item.path} onPointerEnter={() => prefetchRoute(item.path)} onFocus={() => prefetchRoute(item.path)} onClick={() => { if (item.clearTab) { localStorage.removeItem(item.clearTab); if (item.clearTab === "tab_position-management") localStorage.removeItem("selectedPositionId") } }} />}
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
  )
}

function getActiveGroup(pathname: string): string {
  if (configItems.some(i => i.path === pathname)) return "信息配置"
  if (accountItems.some(i => i.path === pathname)) return "账号管理"
  if (systemItems.some(i => i.path === pathname)) return "系统配置"
  return ""
}

const GROUPS = ["信息配置", "账号管理", "系统配置"]

export function AppSidebar() {
  const location = useLocation()
  const permissions = usePagePermissions()
  const isSuperAdmin = useMemo(getIsSuperAdmin, [])
  const activeGroup = getActiveGroup(location.pathname)

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(GROUPS.map(g => [g, g === activeGroup]))
  )

  useEffect(() => {
    if (activeGroup) {
      setOpenGroups(Object.fromEntries(GROUPS.map(g => [g, g === activeGroup])))
    }
  }, [activeGroup])

  const toggle = (group: string) => {
    setOpenGroups(prev => {
      const isCurrentlyOpen = prev[group]
      return Object.fromEntries(GROUPS.map(g => [g, g === group ? !isCurrentlyOpen : false]))
    })
  }

  return (
    <Sidebar
      style={{
        "--sidebar": "#ffffff",
        "--sidebar-foreground": "#212631",
        "--sidebar-accent": "#eaf1ff",
        "--sidebar-accent-foreground": "#212631",
        "--sidebar-border": "#eef0f1",
        "--sidebar-ring": "#3370ff",
      } as React.CSSProperties}
    >
      <SidebarHeader className="px-5 pt-5 pb-2">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-[#3370ff] text-[12px] font-medium text-white">
            W
          </div>
          <span className="text-[13px] font-medium tracking-tight text-[#212631]">无忧茶院</span>
        </div>
      </SidebarHeader>
      <SidebarContent className="mt-4 pb-5">
        <FixedGroup label="数据" items={businessItems} permissions={permissions} isSuperAdmin={isSuperAdmin} />
        <FixedGroup label="业务" items={courseItems} permissions={permissions} isSuperAdmin={isSuperAdmin} />
        <FixedGroup label="沟通" items={communicationItems} permissions={permissions} isSuperAdmin={isSuperAdmin} />
        <FixedGroup label="付费" permissions={permissions} isSuperAdmin={isSuperAdmin} items={itemsFor("payment")} />
        <MenuGroup label="信息配置" items={configItems} isOpen={openGroups["信息配置"]} onToggle={() => toggle("信息配置")} permissions={permissions} isSuperAdmin={isSuperAdmin} />
        <MenuGroup label="账号管理" items={accountItems} isOpen={openGroups["账号管理"]} onToggle={() => toggle("账号管理")} permissions={permissions} isSuperAdmin={isSuperAdmin} />
        <MenuGroup label="系统" items={systemItems} isOpen={openGroups["系统配置"]} onToggle={() => toggle("系统配置")} permissions={permissions} isSuperAdmin={isSuperAdmin} />
      </SidebarContent>
    </Sidebar>
  )
}
