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
    <div className="dv-root bg-[#f4f5f6] h-full p-4 flex flex-col gap-3">
      <style>{`.dv-root { font-family: -apple-system, "PingFang SC", "Helvetica Neue", sans-serif; }`}</style>

      {/* Tab 切换 — 占据标题栏位置 */}
      <div className="flex items-center rounded-xl bg-white shadow-[0_1px_3px_rgba(33,38,49,.06)] px-5 h-[52px]">
        <div className="flex items-center gap-6">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              className={`relative px-1 pb-0 text-[14px] transition-colors ${
                activeTab === tab.key
                  ? "text-[#3370ff]"
                  : "text-[#2b2f36] hover:text-[#4e535a]"
              }`}
              onClick={() => handleTabChange(tab.key)}
            >
              {tab.label}
              {activeTab === tab.key && (
                <span className="absolute bottom-[-16px] left-0 right-0 h-[3px] bg-[#3370ff] rounded-t-sm" />
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
