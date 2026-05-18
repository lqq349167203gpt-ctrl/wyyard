import { Link, useLocation } from "react-router-dom"
import { useMemo } from "react"
import {
  Bot,
  BookOpen,
  LayoutDashboard,
  Database,
  Users,
  ClipboardList,
  GraduationCap,
  BookText,
  Building2,
  CalendarCheck,
  CreditCard,
  Heart,
  ShieldCheck,
  FileText,
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
  { title: "用户管理", icon: Users, path: "/customers", permission: "customers" },
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
  { title: "疗愈空间", icon: Building2, path: "/courses/spaces", permission: "spaces" },
]

const PAYMENT_PERMISSIONS = ["membership-cards", "group-cases", "emotional-releases", "energy-knots", "internal-courses"]

const accountItems = [
  { title: "账号管理", icon: Users, path: "/accounts", permission: "accounts" },
  { title: "角色管理", icon: GraduationCap, path: "/positions/management", permission: "position-management" },
  { title: "修改密码", icon: ShieldCheck, path: "/change-password", permission: "" },
]

const systemItems = [
  { title: "工作台", icon: LayoutDashboard, path: "/", permission: "dashboard" },
  { title: "AI 配置", icon: Bot, path: "/agents", permission: "agents" },
  { title: "知识库", icon: BookOpen, path: "/knowledge", permission: "knowledge" },
  { title: "业务数据", icon: Database, path: "/business", permission: "business" },

  { title: "系统日志", icon: FileText, path: "/system-logs", permission: "system-logs" },
  { title: "操作日志", icon: ClipboardList, path: "/operation-logs", permission: "operation-logs" },
]

const CLASS_RECORDS_PERMISSIONS = ["class-records-visitors", "class-records-activities", "class-records-arrival"]

function MenuGroup({ label, items }: { label: string; items: typeof businessItems }) {
  const location = useLocation()
  const permissions = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("userPermissions") || "[]")
    } catch {
      return []
    }
  }, [])

  const currentUser = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("currentUser") || "{}")
    } catch {
      return {}
    }
  }, [])

  // 超级管理员显示所有菜单
  const isSuperAdmin = currentUser?.role === "超级管理员"

  const filteredItems = items.filter(item => {
    if (!item.permission || isSuperAdmin) return true
    if (permissions.includes(item.permission)) return true
    // 活动日历：检查子权限
    if (item.permission === "class-records" && CLASS_RECORDS_PERMISSIONS.some(p => permissions.includes(p))) return true
    // 当日活动：有 class-records-activities 权限即可见
    if (item.permission === "daily-activities" && permissions.includes("class-records-activities")) return true
    return false
  })

  if (filteredItems.length === 0) return null

  return (
    <SidebarGroup className="px-3 py-1">
      <SidebarGroupLabel className="text-[11px] font-normal tracking-widest text-[#8f959e] px-2 mb-0 uppercase">{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu className="gap-1">
          {filteredItems.map((item) => {
            const isActive = location.pathname === item.path
            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  render={<Link to={item.path} />}
                  isActive={isActive}
                  className={`h-9 text-[13px] px-2.5 rounded-md transition-colors ${
                    isActive
                      ? "bg-[#f5f6f7] font-normal text-[#1f2329]"
                      : "font-normal text-[#4e535a] hover:bg-[#f5f6f7] hover:text-[#1f2329]"
                  }`}
                >
                  <item.icon className={`h-[15px] w-[15px] ${isActive ? "text-[#646a73]" : "text-[#8f959e]"}`} />
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

function PaymentMenuGroup() {
  const location = useLocation()
  const permissions = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("userPermissions") || "[]")
    } catch {
      return []
    }
  }, [])

  const currentUser = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("currentUser") || "{}")
    } catch {
      return {}
    }
  }, [])

  const isSuperAdmin = currentUser?.role === "超级管理员"
  const hasAccess = isSuperAdmin || PAYMENT_PERMISSIONS.some(p => permissions.includes(p))

  if (!hasAccess) return null

  const isActive = location.pathname === "/payment"

  return (
    <SidebarGroup className="px-3 py-1">
      <SidebarGroupLabel className="text-[11px] font-normal tracking-widest text-[#8f959e] px-2 mb-0 uppercase">付费项目</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu className="gap-1">
          <SidebarMenuItem>
            <SidebarMenuButton
              render={<Link to="/payment" />}
              isActive={isActive}
              className={`h-9 text-[13px] px-2.5 rounded-md transition-colors ${
                isActive
                  ? "bg-[#f5f6f7] font-normal text-[#1f2329]"
                  : "font-normal text-[#4e535a] hover:bg-[#f5f6f7] hover:text-[#1f2329]"
              }`}
            >
              <CreditCard className={`h-[15px] w-[15px] ${isActive ? "text-[#646a73]" : "text-[#8f959e]"}`} />
              <span>付费项目</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

export function AppSidebar() {
  return (
    <Sidebar>
      <SidebarHeader className="px-5 pt-4 pb-2">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded bg-primary text-[11px] font-semibold text-primary-foreground">
            W
          </div>
          <span className="text-[13px] font-medium tracking-tight">WYYard</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <MenuGroup label="业务" items={businessItems} />
        <MenuGroup label="疗愈活动" items={courseItems} />
        <PaymentMenuGroup />
        <MenuGroup label="信息配置" items={configItems} />
        <MenuGroup label="账号管理" items={accountItems} />
        <MenuGroup label="系统配置" items={systemItems} />
      </SidebarContent>
    </Sidebar>
  )
}
