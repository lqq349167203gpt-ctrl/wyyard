import { Link, useLocation } from "react-router-dom"
import {
  Bot,
  BookOpen,
  LayoutDashboard,
  Settings,
  Database,
  MessageSquare,
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

const menuItems = [
  { title: "工作台", icon: LayoutDashboard, path: "/" },
  { title: "Agent 管理", icon: Bot, path: "/agents" },
  { title: "知识库", icon: BookOpen, path: "/knowledge" },
  { title: "业务数据", icon: Database, path: "/business" },
  { title: "消息记录", icon: MessageSquare, path: "/messages" },
  { title: "系统设置", icon: Settings, path: "/settings" },
]

export function AppSidebar() {
  const location = useLocation()

  return (
    <Sidebar>
      <SidebarHeader className="border-b px-6 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">
            W
          </div>
          <div>
            <h2 className="text-sm font-semibold">WYYard</h2>
            <p className="text-xs text-muted-foreground">AI 管理平台</p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>导航菜单</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    render={<Link to={item.path} />}
                    isActive={location.pathname === item.path}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
