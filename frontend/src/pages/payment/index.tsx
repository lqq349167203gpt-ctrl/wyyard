import { useState } from "react"
import { UnifiedPaymentContent } from "./unified-payment"
import { ProjectDeductionTab } from "./project-deduction-tab"

const TABS = [
  { key: "membership", label: "会员卡" },
  { key: "other", label: "其他项目" },
  { key: "deductions", label: "项目销卡" },
]

const MEMBERSHIP_TYPES = ["membership_card"] as const
const NON_MEMBERSHIP_TYPES = ["group_case", "emotional_release", "oh_card_reading", "energy_knot", "internal_course", "other"] as const

export default function PaymentPage() {
  const [activeTab, setActiveTab] = useState(() => {
    try { return localStorage.getItem("tab_payment") || "membership" } catch { return "membership" }
  })

  const handleTabChange = (key: string) => {
    setActiveTab(key)
    try { localStorage.setItem("tab_payment", key) } catch {}
  }

  return (
    <div className="px-6 pt-4 pb-6 space-y-3">

      {/* Tab 切换 */}
      <div className="flex items-center justify-between border-b-[0.5px] border-[#e8e8e8] -mx-6 px-6 mb-6 min-h-[39px]">
        <div className="flex items-center gap-6">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              className={`relative px-1 pb-2 text-[14px] transition-colors ${
                activeTab === tab.key
                  ? "text-[#3370ff]"
                  : "text-[#2b2f36] hover:text-[#4e535a]"
              }`}
              onClick={() => handleTabChange(tab.key)}
            >
              {tab.label}
              {activeTab === tab.key && (
                <span className="absolute bottom-[-5px] left-0 right-0 h-[3px] bg-[#3370ff] rounded-t-sm" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* 内容区 */}
      {activeTab === "membership" && <UnifiedPaymentContent embedded filterTypes={[...MEMBERSHIP_TYPES]} />}
      {activeTab === "other" && <UnifiedPaymentContent embedded filterTypes={[...NON_MEMBERSHIP_TYPES]} />}
      {activeTab === "deductions" && <ProjectDeductionTab />}
    </div>
  )
}
