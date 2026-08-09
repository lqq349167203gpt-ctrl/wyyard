import { useState, useEffect } from "react"
import { debtRecordApi, type DebtRecord } from "@/lib/api"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import DetailView from "@/pages/healing-records/components/detail-view"

const TABS = [
  { key: "membership_card", label: "会员卡" },
  { key: "group_case", label: "觉醒游戏" },
  { key: "emotional_release", label: "情绪释放" },
  { key: "energy_knot", label: "能量结" },
]

export default function DebtRecordsPage() {
  const [activeTab, setActiveTab] = useState("membership_card")
  const [records, setRecords] = useState<DebtRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [detailCustomerId, setDetailCustomerId] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    debtRecordApi.list(activeTab)
      .then(setRecords)
      .catch(() => setRecords([]))
      .finally(() => setLoading(false))
  }, [activeTab])

  return (
    <div className="dv-root bg-[#f4f5f6] h-full p-4 flex flex-col gap-3">
      <style>{`.dv-root { font-family: -apple-system, "PingFang SC", "Helvetica Neue", sans-serif; } .dv-root th, .dv-root td { padding-left: 4px; padding-right: 4px; font-size: 12px; } .dv-root th.pl-4, .dv-root td.pl-4 { padding-left: 16px; } .dv-root th.pr-4, .dv-root td.pr-4 { padding-right: 16px; }`}</style>

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

      <div className="rounded-xl bg-white shadow-[0_1px_3px_rgba(33,38,49,.06)] p-4">
        {loading ? (
          <div className="text-center py-12 text-sm text-[#8f959e]">加载中...</div>
        ) : records.length === 0 ? (
          <div className="text-center py-12 text-sm text-[#8f959e]">暂无欠卡记录</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">昵称</TableHead>
                <TableHead>会员身份</TableHead>
                <TableHead>总卡次</TableHead>
                <TableHead>已扣卡次</TableHead>
                <TableHead>欠卡次数</TableHead>
                <TableHead className="pr-4">欠卡活动</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((r) => (
                <TableRow
                  key={r.customer_id}
                  className="cursor-pointer hover:bg-[#f7f8fa]"
                  onClick={() => setDetailCustomerId(r.customer_id)}
                >
                  <TableCell className="pl-4">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-full bg-[#f0f1f2] flex items-center justify-center text-[11px] text-[#646a73] shrink-0">
                        {(r.nickname || "?")[0]}
                      </div>
                      <span>{r.nickname || "-"}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-[#646a73]">{r.member_type || "-"}</TableCell>
                  <TableCell>{r.total_count}</TableCell>
                  <TableCell>{r.deducted_count}</TableCell>
                  <TableCell className="text-[#e33e38] font-medium">{r.debt_count}</TableCell>
                  <TableCell className="pr-4">
                    <div className="flex flex-wrap gap-1">
                      {(r.activity_labels || []).map((label, i) => (
                        <span key={i} className="inline-block text-[11px] text-[#646a73] bg-[#f0f1f2] px-1.5 py-0.5 rounded">{label}</span>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={!!detailCustomerId} onOpenChange={(open) => { if (!open) setDetailCustomerId(null) }}>
        <DialogContent className="max-w-[1180px] max-h-[90vh] overflow-y-auto p-0 gap-0">
          <DetailView
            selectedCustomerId={detailCustomerId}
            onClearSelection={() => setDetailCustomerId(null)}
            hideSearch
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
