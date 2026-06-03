import { Link, useLocation } from "react-router-dom"
import { useMemo, useState, useEffect } from "react"
import {
  Bot,
  Briefcase,
  Calendar,
  ClipboardList,
  GraduationCap,
  BookText,
  Building2,
  CalendarCheck,
  CreditCard,
  Heart,
  ShieldCheck,
  FileText,
  Bell,
  TrendingUp,
  ChevronDown,
  Settings,
  Users,
  Monitor,
} from "lucide-react"
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
  { title: "业务提醒", icon: Bell, path: "/business-reminders", permission: "business-reminders" },
  { title: "引流记录", icon: TrendingUp, path: "/traffic-records", permission: "traffic-records" },
  { title: "客户信息", icon: Heart, path: "/healing-records", permission: "healing-records" },
]

const courseItems = [
  { title: "人员到场", icon: CalendarCheck, path: "/courses/class-records", permission: "class-records" },
  { title: "活动安排", icon: CalendarCheck, path: "/courses/daily-activities", permission: "daily-activities" },
]

const configItems = [
  { title: "沙龙类型", icon: BookText, path: "/positions/courses", permission: "courses" },
  { title: "会员身份", icon: ShieldCheck, path: "/config/member-identities", permission: "member-identities" },
  { title: "疗愈身份", icon: Heart, path: "/healing-identities", permission: "healing-identities" },
  { title: "空间配置", icon: Building2, path: "/courses/spaces", permission: "spaces" },
  { title: "提醒配置", icon: Bell, path: "/config/reminders", permission: "reminders" },
]

const PAYMENT_PERMISSIONS = ["membership-cards", "group-cases", "emotional-releases", "energy-knots", "internal-courses"]

const accountItems = [
  { title: "账号管理", icon: GraduationCap, path: "/positions/management", permission: "position-management" },
  { title: "密码修改", icon: ShieldCheck, path: "/change-password", permission: "" },
]

const systemItems = [
  { title: "AI 配置", icon: Bot, path: "/agents", permission: "agents" },
  { title: "系统日志", icon: FileText, path: "/system-logs", permission: "system-logs" },
  { title: "操作日志", icon: ClipboardList, path: "/operation-logs", permission: "operation-logs" },
]

const CLASS_RECORDS_PERMISSIONS = ["class-records-visitors", "class-records-activities", "class-records-arrival"]

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
  icon: Icon,
  items,
  isOpen,
  onToggle,
}: {
  label: string
  icon: React.ElementType
  items: typeof businessItems
  isOpen: boolean
  onToggle: () => void
}) {
  const location = useLocation()
  const permissions = useMemo(getPermissions, [])
  const isSuperAdmin = useMemo(getIsSuperAdmin, [])

  const filteredItems = items.filter(item => {
    if (!item.permission || isSuperAdmin) return true
    if (permissions.includes(item.permission)) return true
    if (item.permission === "class-records" && CLASS_RECORDS_PERMISSIONS.some(p => permissions.includes(p))) return true
    if (item.permission === "daily-activities" && permissions.includes("class-records-activities")) return true
    return false
  })

  if (filteredItems.length === 0) return null

  return (
    <SidebarGroup className="px-3 py-0">
      <SidebarGroupLabel
        className="h-10 text-[13px] font-normal tracking-[0.1em] text-[#4e535a] px-2 mb-0 uppercase cursor-pointer select-none flex items-center justify-between hover:text-[#2b2f36] transition-colors"
        onClick={onToggle}
      >
        <span className="flex items-center gap-1.5"><Icon className="h-3.5 w-3.5" />{label}</span>
        <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${isOpen ? "" : "-rotate-90"}`} />
      </SidebarGroupLabel>
      {isOpen && (
        <SidebarGroupContent className="mt-0.5">
          <SidebarMenu className="gap-1">
            {filteredItems.map((item) => {
              const isActive = location.pathname === item.path
              return (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    render={<Link to={item.path} />}
                    isActive={isActive}
                    className="h-10 text-[13px] tracking-[0.1em] px-2.5 rounded-md transition-none !font-normal text-[#4e535a]"
                  >
                    <span className="pl-[18px]">{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
        </SidebarGroupContent>
      )}
    </SidebarGroup>
  )
}

function PaymentMenuGroup({
  icon: Icon,
  isOpen,
  onToggle,
}: {
  icon: React.ElementType
  isOpen: boolean
  onToggle: () => void
}) {
  const location = useLocation()
  const permissions = useMemo(getPermissions, [])
  const isSuperAdmin = useMemo(getIsSuperAdmin, [])

  const hasAccess = isSuperAdmin || PAYMENT_PERMISSIONS.some(p => permissions.includes(p))
  if (!hasAccess) return null

  const isActive = location.pathname === "/payment"

  return (
    <SidebarGroup className="px-3 py-0">
      <SidebarGroupLabel
        className="h-10 text-[13px] font-normal tracking-[0.1em] text-[#4e535a] px-2 mb-0 uppercase cursor-pointer select-none flex items-center justify-between hover:text-[#2b2f36] transition-colors"
        onClick={onToggle}
      >
        <span className="flex items-center gap-1.5"><Icon className="h-3.5 w-3.5" />付费项目</span>
        <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${isOpen ? "" : "-rotate-90"}`} />
      </SidebarGroupLabel>
      {isOpen && (
        <SidebarGroupContent className="mt-0.5">
          <SidebarMenu className="gap-1">
            <SidebarMenuItem>
              <SidebarMenuButton
                render={<Link to="/payment" />}
                isActive={isActive}
                className="h-10 text-[13px] tracking-[0.1em] px-2.5 rounded-md transition-none !font-normal text-[#4e535a]"
              >
                <span className="pl-[18px]">付费项目</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      )}
    </SidebarGroup>
  )
}

function getActiveGroup(pathname: string): string {
  if (businessItems.some(i => i.path === pathname)) return "业务"
  if (courseItems.some(i => i.path === pathname)) return "疗愈活动"
  if (pathname === "/payment") return "付费项目"
  if (configItems.some(i => i.path === pathname)) return "信息配置"
  if (accountItems.some(i => i.path === pathname)) return "账号管理"
  if (systemItems.some(i => i.path === pathname)) return "系统配置"
  return ""
}

const GROUPS = ["业务", "疗愈活动", "付费项目", "信息配置", "账号管理", "系统配置"]

export function AppSidebar() {
  const location = useLocation()
  const activeGroup = getActiveGroup(location.pathname)

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(GROUPS.map(g => [g, g === activeGroup]))
  )

  useEffect(() => {
    if (activeGroup) {
      setOpenGroups(prev => ({ ...prev, [activeGroup]: true }))
    }
  }, [activeGroup])

  const toggle = (group: string) => {
    setOpenGroups(prev => ({ ...prev, [group]: !prev[group] }))
  }

  return (
    <Sidebar style={{ "--sidebar-accent": "#f0f1f2", "--sidebar-accent-foreground": "#3370ff" } as React.CSSProperties}>
      <SidebarHeader className="px-5 pt-4 pb-2">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded bg-primary text-[11px] font-semibold text-primary-foreground">
            W
          </div>
          <span className="text-[13px] font-medium tracking-tight">WYYard</span>
        </div>
      </SidebarHeader>
      <SidebarContent className="mt-5">
        <MenuGroup label="业务" icon={Briefcase} items={businessItems} isOpen={openGroups["业务"]} onToggle={() => toggle("业务")} />
        <MenuGroup label="疗愈活动" icon={Calendar} items={courseItems} isOpen={openGroups["疗愈活动"]} onToggle={() => toggle("疗愈活动")} />
        <PaymentMenuGroup icon={CreditCard} isOpen={openGroups["付费项目"]} onToggle={() => toggle("付费项目")} />
        <MenuGroup label="信息配置" icon={Settings} items={configItems} isOpen={openGroups["信息配置"]} onToggle={() => toggle("信息配置")} />
        <MenuGroup label="账号管理" icon={Users} items={accountItems} isOpen={openGroups["账号管理"]} onToggle={() => toggle("账号管理")} />
        <MenuGroup label="系统配置" icon={Monitor} items={systemItems} isOpen={openGroups["系统配置"]} onToggle={() => toggle("系统配置")} />
      </SidebarContent>
    </Sidebar>
  )
}
