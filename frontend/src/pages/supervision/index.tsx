import { useEffect, useMemo } from "react"
import { useSearchParams } from "react-router-dom"

import { usePagePermissions } from "@/hooks/use-page-permissions"
import { hasPagePermission } from "@/lib/page-permissions"
import AgreementSigningsPage from "@/pages/agreement-signings"
import AuditCheckPage from "@/pages/audit-check"
import DebtRecordsPage from "@/pages/debt-records"

type SupervisionTab = "audit" | "debt" | "agreement"

const TABS: Array<{ key: SupervisionTab; label: string; permission: string }> = [
  { key: "audit", label: "信息核对", permission: "audit-check" },
  { key: "debt", label: "欠卡记录", permission: "debt-records" },
  { key: "agreement", label: "协议签订", permission: "agreement-signings" },
]

function isSuperAdmin() {
  try {
    return JSON.parse(localStorage.getItem("currentUser") || "{}")?.role === "超级管理员"
  } catch {
    return false
  }
}

export default function SupervisionPage() {
  const permissions = usePagePermissions()
  const [searchParams, setSearchParams] = useSearchParams()
  const visibleTabs = useMemo(
    () => TABS.filter(tab => isSuperAdmin() || hasPagePermission(permissions, tab.permission)),
    [permissions],
  )
  const requestedTab = searchParams.get("tab") as SupervisionTab | null
  const activeTab = visibleTabs.some(tab => tab.key === requestedTab) ? requestedTab! : visibleTabs[0]?.key

  useEffect(() => {
    if (activeTab && requestedTab !== activeTab) setSearchParams({ tab: activeTab }, { replace: true })
  }, [activeTab, requestedTab, setSearchParams])

  if (!activeTab) return null

  return (
    <div className="min-h-full bg-[#f4f5f6] p-4 pb-6 text-[#2b2f36]">
      <div className="mb-3 flex h-[52px] items-center rounded-xl bg-white px-5 shadow-[0_1px_3px_rgba(33,38,49,.06)]">
        <div className="flex h-full items-center gap-6">
          {visibleTabs.map(tab => {
            const active = tab.key === activeTab
            return (
              <button
                key={tab.key}
                type="button"
                aria-pressed={active}
                onClick={() => setSearchParams({ tab: tab.key })}
                className={`relative flex h-full items-center px-1 text-[14px] transition-colors ${active ? "text-[#3370ff]" : "text-[#646a73] hover:text-[#3370ff]"}`}
              >
                {tab.label}
                {active && <span className="absolute inset-x-0 bottom-0 h-[3px] rounded-t-sm bg-[#3370ff]" />}
              </button>
            )
          })}
        </div>
      </div>

      {activeTab === "audit" && <AuditCheckPage embedded />}
      {activeTab === "debt" && <DebtRecordsPage embedded />}
      {activeTab === "agreement" && <AgreementSigningsPage embedded />}
    </div>
  )
}
