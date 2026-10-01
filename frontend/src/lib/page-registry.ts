/** 页面地址、菜单名称和页面权限只维护一份；监管的页签继续分别授权。 */
export const PAGE_GROUPS = [
  { key: "data", label: "数据" }, { key: "business", label: "业务" },
  { key: "communication", label: "沟通" }, { key: "payment", label: "付费" },
  { key: "config", label: "信息配置" }, { key: "account", label: "账号管理" },
  { key: "system", label: "系统" },
] as const
type PageGroup = typeof PAGE_GROUPS[number]["key"]
interface PageDefinition {
  title: string; path: string; permission: string; group: PageGroup; clearTab?: string
  permissions?: { key: string; label: string }[]
}
export const PAGES: PageDefinition[] = [
  { title: "自定义筛选", path: "/custom-analysis", permission: "custom-analysis", group: "data" },
  { title: "服务老师", path: "/service-teachers", permission: "service-teacher", group: "data" },
  { title: "课程记录", path: "/course-statistics", permission: "course-statistics", group: "data" },
  { title: "组织/俱乐部", path: "/principal", permission: "principal", group: "data" },
  { title: "每日报表", path: "/daily-report", permission: "daily-report", group: "data" },
  { title: "客户资料", path: "/healing-records", permission: "healing-records", group: "business" },
  { title: "邀约", path: "/courses/class-records", permission: "class-records", group: "business" },
  { title: "课表", path: "/courses/daily-activities", permission: "daily-activities", group: "business" },
  { title: "落地课程", path: "/offline-course-records", permission: "offline-course-records", group: "business" },
  { title: "监管", path: "/supervision", permission: "supervision", group: "business", permissions: [
    { key: "audit-check", label: "信息核对" }, { key: "debt-records", label: "欠卡记录" }, { key: "agreement-signings", label: "协议签订" },
  ] },
  { title: "沟通记录", path: "/communication-records", permission: "communication-records", group: "communication" },
  { title: "回访记录", path: "/followup-records", permission: "followup-records", group: "communication" },
  { title: "付费项目", path: "/payment", permission: "payment", group: "payment", clearTab: "tab_payment" },
  { title: "销卡/退课", path: "/payment-deductions", permission: "payment-deductions", group: "payment" },
  { title: "退费", path: "/payment-refunds", permission: "payment-refunds", group: "payment" },
  { title: "会员身份", path: "/config/member-identities", permission: "member-identities", group: "config", clearTab: "tab_member-identities" },
  { title: "客户标签", path: "/config/customer-tags", permission: "customer-tags", group: "config" },
  { title: "升单配置", path: "/config/upsell", permission: "upsell-config", group: "config" },
  { title: "疗愈老师", path: "/healing-identities", permission: "healing-identities", group: "config" },
  { title: "组织信息", path: "/organizations", permission: "organizations", group: "config" },
  { title: "空间配置", path: "/courses/spaces", permission: "spaces", group: "config" },
  { title: "账号管理", path: "/positions/management", permission: "position-management", group: "account", clearTab: "tab_position-management" },
  { title: "密码修改", path: "/change-password", permission: "change-password", group: "account" },
  { title: "停用客户", path: "/disabled-customers", permission: "disabled-customers", group: "account" },
  { title: "AI 配置", path: "/agents", permission: "agents", group: "system" },
  { title: "沟通记录", path: "/chat-history", permission: "chat-history", group: "system" },
  { title: "系统日志", path: "/system-logs", permission: "system-logs", group: "system" },
  { title: "操作日志", path: "/operation-logs", permission: "operation-logs", group: "system" },
  { title: "使用统计", path: "/login-records", permission: "login-records", group: "system" },
  { title: "分析日志", path: "/analysis-logs", permission: "analysis-logs", group: "system" },
]
export const PAGE_PERMISSIONS = PAGES.flatMap(page => page.permissions || [{ key: page.permission, label: page.title }])
export const PERMISSION_GROUPS = PAGE_GROUPS.map(group => ({
  label: group.label, keys: PAGES.filter(page => page.group === group.key).flatMap(page => page.permissions?.map(p => p.key) || [page.permission]),
}))
export const PATH_PERMISSIONS: Record<string, string> = {
  ...Object.fromEntries(PAGES.map(page => [page.path, page.permission])),
  "/healing-records/new": "healing-records", "/healing-records/:id/edit": "healing-records",
  "/positions/teacher": "position-management", "/positions/courses": "organizations", "/agents/:id/chat": "agents",
}
export const PAGE_LOADERS = {
  "/custom-analysis": () => import("@/pages/custom-analysis"),
  "/service-teachers": () => import("@/pages/service-teachers"),
  "/course-statistics": () => import("@/pages/course-statistics"),
  "/principal": () => import("@/pages/principal"),
  "/daily-report": () => import("@/pages/daily-report"),
  "/healing-records": () => import("@/pages/healing-records"),
  "/courses/class-records": () => import("@/pages/class-records"),
  "/courses/daily-activities": () => import("@/pages/daily-activities"),
  "/offline-course-records": () => import("@/pages/offline-course-records"),
  "/supervision": () => import("@/pages/supervision"),
  "/communication-records": () => import("@/pages/communication-records"),
  "/followup-records": () => import("@/pages/followup-records"),
  "/payment": () => import("@/pages/payment"),
  "/payment-deductions": () => import("@/pages/payment-deductions"),
  "/payment-refunds": () => import("@/pages/payment-refunds"),
  "/config/member-identities": () => import("@/pages/member-identities"),
  "/config/customer-tags": () => import("@/pages/customer-tags"),
  "/config/upsell": () => import("@/pages/upsell-config"),
  "/healing-identities": () => import("@/pages/healing-identities"),
  "/organizations": () => import("@/pages/organizations"),
  "/courses/spaces": () => import("@/pages/spaces"),
  "/positions/management": () => import("@/pages/position-management"),
  "/change-password": () => import("@/pages/change-password"),
  "/disabled-customers": () => import("@/pages/disabled-customers"),
  "/agents": () => import("@/pages/agents"),
  "/chat-history": () => import("@/pages/chat-history"),
  "/system-logs": () => import("@/pages/system-logs"),
  "/operation-logs": () => import("@/pages/operation-logs"),
  "/login-records": () => import("@/pages/login-records"),
  "/analysis-logs": () => import("@/pages/analysis-logs"),
}
