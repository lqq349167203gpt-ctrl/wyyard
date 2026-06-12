import { useState, useMemo } from "react"
import { CreditCard, Wallet, Heart, Zap, GraduationCap, Layers, ClipboardList } from "lucide-react"
import { MembershipCardContent } from "@/pages/membership-cards"
import { GroupCasesContent } from "@/pages/group-cases"
import { EmotionalReleasesContent } from "@/pages/emotional-releases"
import { EnergyKnotsContent } from "@/pages/energy-knots"
import { InternalCoursesContent } from "@/pages/internal-courses"
import { OhCardReadingsContent } from "@/pages/oh-card-readings"
import { ProjectDeductionTab } from "./project-deduction-tab"

const PAYMENT_TABS = [
  { key: "membership-cards", label: "会员活动", icon: CreditCard, component: MembershipCardContent, permission: "membership-cards" },
  { key: "group-cases", label: "觉醒游戏", icon: Wallet, component: GroupCasesContent, permission: "group-cases" },
  { key: "emotional-releases", label: "情绪释放", icon: Heart, component: EmotionalReleasesContent, permission: "emotional-releases" },
  { key: "oh-card-readings", label: "OH卡梳理", icon: Layers, component: OhCardReadingsContent, permission: "oh-card-readings" },
  { key: "energy-knots", label: "能量结", icon: Zap, component: EnergyKnotsContent, permission: "energy-knots" },
  { key: "internal-courses", label: "内部课程", icon: GraduationCap, component: InternalCoursesContent, permission: "internal-courses" },
  { key: "project-deductions", label: "项目销卡", icon: ClipboardList, component: ProjectDeductionTab, permission: "project-deductions" },
]

export default function PaymentPage() {
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

  const visibleTabs = PAYMENT_TABS.filter(
    tab => isSuperAdmin || permissions.includes(tab.permission)
  )

  const [activeTab, setActiveTab] = useState(visibleTabs[0]?.key || "")

  const ActiveComponent = visibleTabs.find(t => t.key === activeTab)?.component

  return (
    <div className="px-6 pt-4 pb-6 space-y-3">

      {/* Tab 切换 */}
      <div className="flex items-center justify-between border-b-[0.5px] border-[#e8e8e8] -mx-6 px-6 mb-6 min-h-[39px]">
        <div className="flex items-center gap-6">
          {visibleTabs.filter(t => t.key !== "project-deductions").map((tab) => (
            <button
              key={tab.key}
              className={`relative px-1 pb-2 text-[14px] transition-colors ${
                activeTab === tab.key
                  ? "text-[#3370ff]"
                  : "text-[#2b2f36] hover:text-[#4e535a]"
              }`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
              {activeTab === tab.key && (
                <span className="absolute bottom-[-5px] left-0 right-0 h-[3px] bg-[#3370ff] rounded-t-sm" />
              )}
            </button>
          ))}
        </div>
        {visibleTabs.find(t => t.key === "project-deductions") && (
          <button
            className={`relative px-1 pb-2 text-[14px] transition-colors ${
              activeTab === "project-deductions"
                ? "text-[#3370ff]"
                : "text-[#2b2f36] hover:text-[#4e535a]"
            }`}
            onClick={() => setActiveTab("project-deductions")}
          >
            项目销卡
            {activeTab === "project-deductions" && (
              <span className="absolute bottom-[-5px] left-0 right-0 h-[3px] bg-[#3370ff] rounded-t-sm" />
            )}
          </button>
        )}
      </div>

      {/* 内容区 */}
      {ActiveComponent && <ActiveComponent embedded />}
    </div>
  )
}
