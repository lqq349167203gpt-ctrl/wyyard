import { useState } from "react"
import { UnifiedPaymentContent } from "./unified-payment"

const TABS = [
  { key: "membership_card", label: "会员卡" },
  { key: "group_case", label: "觉醒游戏" },
  { key: "emotional_release", label: "情绪释放" },
  { key: "oh_card_reading", label: "OH卡梳理" },
  { key: "energy_knot", label: "能量结" },
  { key: "internal_course", label: "内部课程" },
  { key: "other", label: "其他项目" },
]

const VALID_TAB_KEYS = new Set(TABS.map(t => t.key))

export default function PaymentPage() {
  const [activeTab, setActiveTab] = useState(() => {
    try {
      const saved = localStorage.getItem("tab_payment")
      if (saved && VALID_TAB_KEYS.has(saved)) return saved
    } catch {}
    return "membership_card"
  })

  const handleTabChange = (key: string) => {
    setActiveTab(key)
    try { localStorage.setItem("tab_payment", key) } catch {}
  }

  return (
    <div className="px-6 pt-4 pb-6 space-y-3">

      {/* Tab 切换 */}
      <div className="flex items-center border-b-[0.5px] border-[#e8e8e8] -mx-6 px-6 mb-6 min-h-[39px]">
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
      <UnifiedPaymentContent key={activeTab} embedded filterTypes={[activeTab as any]} />
    </div>
  )
}
