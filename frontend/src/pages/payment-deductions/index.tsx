import { useState } from "react"
import { ProjectDeductionTab } from "../payment/project-deduction-tab"
import { WithdrawalTab } from "../payment/withdrawal-tab"

const TABS = [
  { key: "deduction", label: "销卡" },
  { key: "withdrawal", label: "退课" },
]

export default function PaymentDeductionsPage() {
  const [activeTab, setActiveTab] = useState("deduction")

  return (
    <div className="dv-root bg-[#f4f5f6] h-full p-4 flex flex-col gap-3">
      <style>{`.dv-root { font-family: -apple-system, "PingFang SC", "Helvetica Neue", sans-serif; }`}</style>

      <div className="flex items-center rounded-xl bg-white shadow-[0_1px_3px_rgba(33,38,49,.06)] px-5 h-[52px]">
        <div className="flex flex-1 items-center gap-6">
          {TABS.map(tab => (
            <button
              key={tab.key}
              className={`relative whitespace-nowrap px-1 pb-0 text-[14px] transition-colors ${
                activeTab === tab.key ? "text-[#3370ff]" : "text-[#2b2f36] hover:text-[#4e535a]"
              }`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
              {activeTab === tab.key && (
                <span className="absolute bottom-[-16px] left-0 right-0 h-[3px] bg-[#3370ff] rounded-t-sm" />
              )}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "deduction" ? <ProjectDeductionTab /> : <WithdrawalTab />}
    </div>
  )
}
