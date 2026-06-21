import { Link, useLocation } from "react-router-dom"
import { useMemo, useState, useEffect } from "react"
import {
  IconBellRingingFilled,
  IconChartAreaFilled,
  IconCalendarEventFilled,
  IconCalendarFilled,
  IconCreditCardFilled,
  IconShieldCheckFilled,
  IconSparklesFilled,
  IconUserFilled,
  IconSettingsFilled,
  IconBellFilled,
  IconLockFilled,
  IconStarsFilled,
  IconMessageCircleFilled,
  IconFileTextFilled,
  IconClipboardTextFilled,
  IconChevronDown,
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

const businessItems = [
  { title: "提醒", icon: IconBellRingingFilled, path: "/business-reminders", permission: "business-reminders" },
  { title: "数据记录", icon: IconChartAreaFilled, path: "/data-records", permission: "data-records" },
]

const courseItems = [
  { title: "客户信息", icon: IconUserFilled, path: "/healing-records", permission: "healing-records" },
  { title: "邀约", icon: IconCalendarEventFilled, path: "/courses/class-records", permission: "class-records" },
  { title: "课表", icon: IconCalendarFilled, path: "/courses/daily-activities", permission: "daily-activities" },
]

const configItems = [
  { title: "会员身份", icon: IconShieldCheckFilled, path: "/config/member-identities", permission: "member-identities" },
  { title: "疗愈老师", icon: IconSparklesFilled, path: "/healing-identities", permission: "healing-identities" },
  { title: "组织管理", icon: IconUserFilled, path: "/organizations", permission: "organizations" },
  { title: "空间配置", icon: IconSettingsFilled, path: "/courses/spaces", permission: "spaces" },
  { title: "提醒配置", icon: IconBellFilled, path: "/config/reminders", permission: "reminders" },
]

const PAYMENT_PERMISSIONS = ["membership-cards", "group-cases", "emotional-releases", "oh-card-readings", "energy-knots", "internal-courses"]

const accountItems = [
  { title: "账号管理", icon: IconUserFilled, path: "/positions/management", permission: "position-management" },
  { title: "密码修改", icon: IconLockFilled, path: "/change-password", permission: "change-password" },
]

const systemItems = [
  { title: "AI 配置", icon: IconStarsFilled, path: "/agents", permission: "agents" },
  { title: "沟通记录", icon: IconMessageCircleFilled, path: "/chat-history", permission: "chat-history" },
  { title: "系统日志", icon: IconFileTextFilled, path: "/system-logs", permission: "system-logs" },
  { title: "操作日志", icon: IconClipboardTextFilled, path: "/operation-logs", permission: "operation-logs" },
]

function getPermissions(): string[] {
  try {
    return JSON.parse(localStorage.getItem("userPermissions") || "[]")
  } catch {
    return []
  }
}

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
}: {
  label: string
  items: typeof businessItems
  isOpen: boolean
  onToggle: () => void
}) {
  const location = useLocation()
  const permissions = useMemo(getPermissions, [])
  const isSuperAdmin = useMemo(getIsSuperAdmin, [])

  const filteredItems = items.filter(item => {
    if (!item.permission || isSuperAdmin) return true
    return permissions.includes(item.permission)
  })

  if (filteredItems.length === 0) return null

  return (
    <SidebarGroup className="p-0">
      <SidebarGroupLabel
        className="h-[34px] text-[11px] font-normal text-[#8f959e] pl-[24px] pr-5 mt-2.5 mb-0 uppercase cursor-pointer select-none flex items-center justify-between hover:text-[#5a6070] transition-colors"
        onClick={onToggle}
      >
        <span>{label}</span>
        <IconChevronDown style={{ width: 14, height: 14 }} className={`text-[#c8ccd0] transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
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
                      render={<Link to={item.path} />}
                      isActive={isActive}
                      className={`h-[34px] text-[13px] pl-[22px] pr-5 rounded-none transition-none font-normal border-l-2 gap-2.5 ${isActive ? "border-[#3370ff] text-black" : "border-transparent text-[#4e535a]"}`}
                    >
                      <item.icon className={`h-2.5 w-2.5 shrink-0 ${isActive ? "text-[#3370ff]" : "text-[#7d838c]"}`} />
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
}: {
  label: string
  items: typeof businessItems
  accessCheck?: (permissions: string[], isSuperAdmin: boolean) => boolean
}) {
  const location = useLocation()
  const permissions = useMemo(getPermissions, [])
  const isSuperAdmin = useMemo(getIsSuperAdmin, [])

  if (accessCheck && !accessCheck(permissions, isSuperAdmin)) return null

  const filteredItems = items.filter(item => {
    if (!item.permission || isSuperAdmin) return true
    return permissions.includes(item.permission)
  })

  if (filteredItems.length === 0) return null

  return (
    <SidebarGroup className="p-0">
      <SidebarGroupLabel className="h-[26px] text-[11px] font-normal text-[#8f959e] pl-[24px] pr-5 mt-2.5 mb-0 uppercase select-none flex items-center">
        <span>{label}</span>
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu className="gap-[2px]">
          {filteredItems.map((item) => {
            const isActive = location.pathname === item.path
            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  render={<Link to={item.path} />}
                  isActive={isActive}
                  className={`h-[34px] text-[13px] pl-[22px] pr-5 rounded-none transition-none font-normal border-l-2 gap-2.5 ${isActive ? "border-[#3370ff] text-black" : "border-transparent text-[#4e535a]"}`}
                >
                  <item.icon className={`h-2.5 w-2.5 shrink-0 ${isActive ? "text-[#3370ff]" : "text-[#7d838c]"}`} />
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
    <Sidebar style={{ "--sidebar-accent": "#ecedf0", "--sidebar-accent-foreground": "#3370ff" } as React.CSSProperties}>
      <SidebarHeader className="px-5 pt-4 pb-2">
        <div className="flex items-center gap-2.5.5">
          <div className="flex h-7 w-7 items-center justify-center rounded bg-primary text-[11px] font-semibold text-primary-foreground">
            W
          </div>
          <span className="text-[13px] font-medium tracking-tight">WYYard</span>
        </div>
      </SidebarHeader>
      <SidebarContent className="mt-5">
        <FixedGroup label="数据" items={businessItems} />
        <FixedGroup label="业务" items={courseItems} />
        <FixedGroup label="付费" items={[{ title: "付费项目", path: "/payment", permission: "", icon: IconCreditCardFilled }]} accessCheck={(p, isSuper) => isSuper || PAYMENT_PERMISSIONS.some(perm => p.includes(perm))} />
        <MenuGroup label="信息配置" items={configItems} isOpen={openGroups["信息配置"]} onToggle={() => toggle("信息配置")} />
        <MenuGroup label="账号管理" items={accountItems} isOpen={openGroups["账号管理"]} onToggle={() => toggle("账号管理")} />
        <MenuGroup label="系统" items={systemItems} isOpen={openGroups["系统配置"]} onToggle={() => toggle("系统配置")} />
      </SidebarContent>
    </Sidebar>
  )
}
