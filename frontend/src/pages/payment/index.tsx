import { useRef, useState } from "react"
import { Download } from "lucide-react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { UnifiedPaymentContent, type UnifiedPaymentHandle } from "./unified-payment"

const TABS = [
  { key: "membership_card", label: "会员卡" },
  { key: "group_case", label: "觉醒游戏" },
  { key: "emotional_release", label: "情绪释放" },
  { key: "oh_card_reading", label: "OH卡诊断" },
  { key: "energy_knot", label: "能量结" },
  { key: "internal_course", label: "内部课程" },
  { key: "tea_seat_fee", label: "茶位费" },
  { key: "offline_course", label: "线下落地课程" },
  { key: "other", label: "其他项目" },
]

const VALID_TAB_KEYS = new Set(TABS.map(t => t.key))

export default function PaymentPage() {
  const paymentContentRef = useRef<UnifiedPaymentHandle>(null)
  const [activeTab, setActiveTab] = useState(() => {
    try {
      const saved = localStorage.getItem("tab_payment")
      if (saved && VALID_TAB_KEYS.has(saved)) return saved
    } catch {}
    return "membership_card"
  })
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState("")

  const handleTabChange = (key: string) => {
    setActiveTab(key)
    try { localStorage.setItem("tab_payment", key) } catch {}
  }

  const handleExport = async () => {
    if (!paymentContentRef.current || exporting) return
    setExporting(true)
    setExportError("")
    try {
      await paymentContentRef.current.exportAllPayments()
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "导出失败，请稍后重试")
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="dv-root bg-[#f4f5f6] h-full p-4 flex flex-col gap-3">
      <style>{`.dv-root { font-family: -apple-system, "PingFang SC", "Helvetica Neue", sans-serif; } .dv-root th, .dv-root td { padding-left: 4px; padding-right: 4px; font-size: 12px; } .dv-root th.pl-4, .dv-root td.pl-4 { padding-left: 16px; } .dv-root th.pr-4, .dv-root td.pr-4 { padding-right: 16px; }`}</style>

      {/* Tab 切换 — 占据标题栏位置 */}
      <div className="flex items-center rounded-xl bg-white shadow-[0_1px_3px_rgba(33,38,49,.06)] px-5 h-[52px]">
        <div className="flex flex-1 items-center gap-6">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              className={`relative whitespace-nowrap px-1 pb-0 text-[14px] transition-colors ${
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
        <Button
          variant="outline"
          size="sm"
          className="ml-4 h-8 shrink-0 rounded-[4px] px-3 text-[12px] font-normal"
          disabled={exporting}
          onClick={handleExport}
        >
          <Download className="mr-1 h-3.5 w-3.5" />
          {exporting ? "导出中..." : "导出"}
        </Button>
      </div>

      {/* 内容区 */}
      <UnifiedPaymentContent ref={paymentContentRef} key={activeTab} embedded filterTypes={[activeTab as any]} />

      <AlertDialog open={!!exportError} onOpenChange={(open) => !open && setExportError("")}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>导出失败</AlertDialogTitle>
            <AlertDialogDescription>{exportError}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setExportError("")}>知道了</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
