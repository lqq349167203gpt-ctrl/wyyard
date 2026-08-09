import { Link, useLocation } from "react-router-dom"
import { useMemo, useState, useEffect } from "react"
import {
  IconBellRinging,
  IconBasket,
  IconStar,
  IconCalendarEvent,
  IconCalendar,
  IconCreditCard,
  IconShieldCheck,
  IconSparkles,
  IconUser,
  IconUsersGroup,
  IconSettings,
  IconBell,
  IconLock,
  IconUserOff,
  IconStars,
  IconMessageCircle,
  IconFileText,
  IconClipboardText,
  IconChevronDown,
  IconAffiliate,
  IconSchool,
  IconBook,
  IconAlertTriangle,
  IconReceipt,
  IconTags,
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
  icon: typeof IconBellRinging
  path: string
  permission: string
  clearTab?: string
}

const businessItems = [
  { title: "提醒", icon: IconBellRinging, path: "/business-reminders", permission: "business-reminders" },
  { title: "引流统计", icon: IconAffiliate, path: "/referral-statistics", permission: "referral-statistics" },
  { title: "会员情况", icon: IconUsersGroup, path: "/member-statistics", permission: "member-statistics" },
  { title: "课程", icon: IconSchool, path: "/course-statistics", permission: "course-statistics" },
  { title: "产品销售", icon: IconBasket, path: "/product-sales", permission: "product-sales" },
  { title: "服务数据", icon: IconStar, path: "/statistics", permission: "statistics" },
]

const reportItems = [
  { title: "每日报表", icon: IconClipboardText, path: "/daily-report", permission: "daily-report" },
]

const courseItems = [
  { title: "客户资料", icon: IconUser, path: "/healing-records", permission: "healing-records" },
  { title: "邀约", icon: IconCalendarEvent, path: "/courses/class-records", permission: "class-records" },
  { title: "课表", icon: IconCalendar, path: "/courses/daily-activities", permission: "daily-activities" },
  { title: "落地课程", icon: IconBook, path: "/offline-course-records", permission: "offline-course-records" },
]

const communicationItems = [
  { title: "沟通记录", icon: IconMessageCircle, path: "/communication-records", permission: "communication-records" },
  { title: "回访记录", icon: IconClipboardText, path: "/followup-records", permission: "followup-records" },
]

const configItems = [
  { title: "会员身份", icon: IconShieldCheck, path: "/config/member-identities", permission: "member-identities", clearTab: "tab_member-identities" },
  { title: "客户标签", icon: IconTags, path: "/config/customer-tags", permission: "customer-tags" },
  { title: "疗愈老师", icon: IconSparkles, path: "/healing-identities", permission: "healing-identities" },
  { title: "组织信息", icon: IconUser, path: "/organizations", permission: "organizations" },
  { title: "空间配置", icon: IconSettings, path: "/courses/spaces", permission: "spaces" },
  { title: "提醒配置", icon: IconBell, path: "/config/reminders", permission: "reminders" },
]

const accountItems = [
  { title: "账号管理", icon: IconUser, path: "/positions/management", permission: "position-management", clearTab: "tab_position-management" },
  { title: "密码修改", icon: IconLock, path: "/change-password", permission: "change-password" },
  { title: "停用客户", icon: IconUserOff, path: "/disabled-customers", permission: "disabled-customers" },
]

const systemItems = [
  { title: "AI 配置", icon: IconStars, path: "/agents", permission: "agents" },
  { title: "沟通记录", icon: IconMessageCircle, path: "/chat-history", permission: "chat-history" },
  { title: "系统日志", icon: IconFileText, path: "/system-logs", permission: "system-logs" },
  { title: "操作日志", icon: IconClipboardText, path: "/operation-logs", permission: "operation-logs" },
]

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
        <IconChevronDown style={{ width: 14, height: 14 }} className={`text-[#a8b1bd] transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
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
                      render={<Link to={item.path} onClick={() => { if (item.clearTab) { localStorage.removeItem(item.clearTab); if (item.clearTab === "tab_position-management") localStorage.removeItem("selectedPositionId") } }} />}
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
                  render={<Link to={item.path} onClick={() => { if (item.clearTab) { localStorage.removeItem(item.clearTab); if (item.clearTab === "tab_position-management") localStorage.removeItem("selectedPositionId") } }} />}
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
          <span className="text-[13px] font-medium tracking-tight text-[#212631]">无忧茶苑</span>
        </div>
      </SidebarHeader>
      <SidebarContent className="mt-4 pb-5">
        <FixedGroup label="数据" items={businessItems} permissions={permissions} isSuperAdmin={isSuperAdmin} />
        <FixedGroup label="报表" items={reportItems} permissions={permissions} isSuperAdmin={isSuperAdmin} />
        <FixedGroup label="业务" items={courseItems} permissions={permissions} isSuperAdmin={isSuperAdmin} />
        <FixedGroup label="沟通" items={communicationItems} permissions={permissions} isSuperAdmin={isSuperAdmin} />
        <FixedGroup label="付费" permissions={permissions} isSuperAdmin={isSuperAdmin} items={[{ title: "付费项目", path: "/payment", permission: "payment", icon: IconCreditCard, clearTab: "tab_payment" }, { title: "销卡", path: "/payment-deductions", permission: "payment-deductions", icon: IconClipboardText }, { title: "退费", path: "/payment-refunds", permission: "payment-refunds", icon: IconFileText }, { title: "支出", path: "/expenses", permission: "expenses", icon: IconReceipt }, { title: "欠卡记录", path: "/debt-records", permission: "debt-records", icon: IconAlertTriangle }]} />
        <MenuGroup label="信息配置" items={configItems} isOpen={openGroups["信息配置"]} onToggle={() => toggle("信息配置")} permissions={permissions} isSuperAdmin={isSuperAdmin} />
        <MenuGroup label="账号管理" items={accountItems} isOpen={openGroups["账号管理"]} onToggle={() => toggle("账号管理")} permissions={permissions} isSuperAdmin={isSuperAdmin} />
        <MenuGroup label="系统" items={systemItems} isOpen={openGroups["系统配置"]} onToggle={() => toggle("系统配置")} permissions={permissions} isSuperAdmin={isSuperAdmin} />
      </SidebarContent>
    </Sidebar>
  )
}
