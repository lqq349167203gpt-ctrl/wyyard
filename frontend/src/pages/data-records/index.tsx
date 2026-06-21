import { useState } from "react"
import { TrafficRecordsContent } from "@/pages/traffic-records"
import { ActivityRecordsContent } from "@/pages/activity-records"
import { ConsumptionRecordsContent } from "@/pages/consumption-records"
import { ClassAttendanceContent } from "@/pages/class-attendance"

const TABS = [
  { key: "traffic", label: "引流记录" },
  { key: "activity", label: "活动记录" },
  { key: "consumption", label: "消费记录" },
  { key: "attendance", label: "上课记录" },
]

export default function DataRecordsPage() {
  const [activeTab, setActiveTab] = useState("traffic")

  return (
    <div className="px-6 pt-4 pb-6 space-y-3">
      <div className="flex items-center border-b-[0.5px] border-[#e8e8e8] -mx-6 px-6 min-h-[39px]">
        <div className="flex items-center gap-6">
          {TABS.map((tab) => (
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
      </div>

      {activeTab === "traffic" && <TrafficRecordsContent embedded />}
      {activeTab === "activity" && <ActivityRecordsContent embedded />}
      {activeTab === "consumption" && <ConsumptionRecordsContent embedded />}
      {activeTab === "attendance" && <ClassAttendanceContent embedded />}
    </div>
  )
}
