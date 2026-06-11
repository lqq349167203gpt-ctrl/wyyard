import { useEffect, useState } from "react"
import type { VisitRecord, HealingRecord, OperationLog } from "@/lib/api"
import { healingRecordApi, operationLogApi, visitApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

interface ArrivalConfirmationViewProps {
  visits: VisitRecord[]
  loading: boolean
  onMarkArrived: (visit: VisitRecord) => void
  onCancelArrived: (visit: VisitRecord) => void
  onRefresh?: () => void
}

const SECTION_COLORS: Record<string, string> = {
  "新增": "bg-green-50 text-green-600",
  "更新": "bg-blue-50 text-blue-600",
  "删除": "bg-red-50 text-red-600",
}

function getMethodLabel(method: string) {
  if (method === "POST") return "新增"
  if (method === "PUT" || method === "PATCH") return "更新"
  if (method === "DELETE") return "删除"
  return method
}

export default function ArrivalConfirmationView({
  visits,
  loading,
  onMarkArrived,
  onCancelArrived,
  onRefresh,
}: ArrivalConfirmationViewProps) {
  const [hrMap, setHrMap] = useState<Record<string, HealingRecord | null>>({})
  const [editVisit, setEditVisit] = useState<VisitRecord | null>(null)
  const [editText, setEditText] = useState("")
  const [savingHR, setSavingHR] = useState(false)
  const [detailVisit, setDetailVisit] = useState<VisitRecord | null>(null)
  const [detailLogs, setDetailLogs] = useState<OperationLog[]>([])
  const [loadingLogs, setLoadingLogs] = useState(false)
  const [editExpVisit, setEditExpVisit] = useState<VisitRecord | null>(null)
  const [editExpText, setEditExpText] = useState("")
  const [editFeedbackText, setEditFeedbackText] = useState("")
  const [savingExp, setSavingExp] = useState(false)
  // 加载每个到访人员当日对应的疗愈记录
  useEffect(() => {
    if (visits.length === 0) return
    const map: Record<string, HealingRecord | null> = {}
    Promise.all(
      visits.map(async (v) => {
        try {
          const hr = await healingRecordApi.getByCustomerDate(v.customer_id, v.visit_date)
          map[v.id] = hr
        } catch {
          map[v.id] = null
        }
      })
    ).then(() => setHrMap({ ...map }))
  }, [visits])

  const openDetail = async (v: VisitRecord) => {
    setDetailVisit(v)
    setDetailLogs([])
    setLoadingLogs(true)
    try {
      const logs = await operationLogApi.list({ entity_id: v.id })
      setDetailLogs(logs)
    } catch (e) {
      console.error("加载操作记录失败", e)
      setDetailLogs([])
    } finally {
      setLoadingLogs(false)
    }
  }

  const openEdit = (v: VisitRecord) => {
    setEditVisit(v)
    const hr = hrMap[v.id]
    setEditText(hr?.growth_record || "")
  }

  const handleSaveHR = async () => {
    if (!editVisit) return
    setSavingHR(true)
    try {
      const hr = hrMap[editVisit.id]
      if (hr) {
        // 更新已有记录
        const updated = await healingRecordApi.update(hr.id, { growth_record: editText })
        setHrMap((prev) => ({ ...prev, [editVisit.id]: updated }))
      } else {
        // 新建记录
        const created = await healingRecordApi.create({
          customer_id: editVisit.customer_id,
          customer_name: editVisit.nickname,
          date: editVisit.visit_date,
          title: "到场记录",
          growth_record: editText,
          teacher: "",
        })
        setHrMap((prev) => ({ ...prev, [editVisit.id]: created }))
      }
      setEditVisit(null)
    } catch {} finally {
      setSavingHR(false)
    }
  }

  const handleSaveExp = async () => {
    if (!editExpVisit) return
    setSavingExp(true)
    try {
      await visitApi.update(editExpVisit.id, { experience: editExpText, feedback: editFeedbackText })
      setEditExpVisit(null)
      onRefresh?.()
    } catch {} finally {
      setSavingExp(false)
    }
  }

  if (loading) {
    return <div className="py-16 text-center text-sm text-muted-foreground">加载中...</div>
  }

  if (visits.length === 0) {
    return <p className="py-16 text-center text-xs text-[#8f959e]">当日暂无到场人员</p>
  }

  const arrivedCount = visits.filter(v => v.arrived).length

  return (
    <>
      {/* 顶部人员概览 — 固定不滚动 */}
      <div className="px-2 py-2 shrink-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          {visits.map((v) => (
            <button
              key={v.id}
              className={`inline-flex items-center gap-1 text-[12px] px-2 py-0.5 rounded cursor-pointer transition-colors ${
                v.arrived
                  ? "bg-[#f0f5ff] text-[#3370ff] font-medium hover:bg-[#e0ebff]"
                  : "bg-[#f7f8fa] text-[#8f959e] hover:bg-[#eef0f2]"
              }`}
              onClick={() => {
                const el = document.getElementById(`visit-card-${v.id}`)
                if (!el) return
                const container = el.closest(".overflow-y-auto")
                if (container) {
                  const elRect = el.getBoundingClientRect()
                  const containerRect = container.getBoundingClientRect()
                  const offset = elRect.top - containerRect.top + container.scrollTop
                  container.scrollTo({ top: Math.max(0, offset), behavior: "smooth" })
                }
              }}
            >
              {v.nickname}
              {v.arrived && <span className="text-[10px]">✓</span>}
            </button>
          ))}
          <span className="text-[11px] text-[#b0b5bb] ml-1">{arrivedCount}/{visits.length} 到场</span>
        </div>
      </div>
      {/* 人员卡片列表 — 可滚动 */}
      <div className="flex-1 overflow-y-auto">
      <div className="space-y-0.5">
      {visits.map((v) => (
        <div
          id={`visit-card-${v.id}`}
          key={v.id}
          className="rounded bg-white border border-[#f0f1f2] hover:border-[#e0e1e3] p-3 transition-colors flex gap-2"
        >
          <div className="flex-1 min-w-0 space-y-2 -ml-1">
            {/* 昵称 + 到场时间 + 需求 */}
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-[#8f959e] shrink-0 w-14">昵称</span>
              <span className="text-[12px] font-medium text-[#2b2f36]">{v.nickname}</span>
              {v.member_type && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#f0f1f2] text-[#8f959e]">{v.member_type}</span>
              )}
              <span className="text-[12px] text-[#8f959e]">
                {v.arrived ? `${v.arrival_time || v.visit_time || "09:00"}到场` : "--:--到场"}
              </span>
              <span className="text-[12px] text-[#8f959e] ml-3">
                {v.needs || "-"}
              </span>
            </div>

            {/* 活动 */}
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-[#8f959e] shrink-0 w-14">活动</span>
              <div className="flex flex-wrap gap-1">
                {v.activities.length > 0 ? (
                  v.activities.map((a, i) => {
                    const part = v.activity_participation?.find(
                      (p: { name: string; role: string }) => p.name === a.name && p.role === a.role
                    )
                    const confirmed = part?.participated
                    return (
                    <span key={i} className={`inline-flex items-center gap-1 pl-0.5 pr-2 py-0.5 rounded border ${confirmed ? "border-[#b8d4ff]" : "border-[#e8e8e8]"}`}>
                      {a.is_welfare && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#f0f1f2] text-[#8f959e]">公益</span>
                      )}
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] ${confirmed ? "bg-[#f0f5ff] text-[#2b5fd9]" : "bg-[#f5f6f7] text-[#4e535a]"}`}>
                        {a.name}
                        {a.owner_name ? ` ${a.owner_name}` : ""}
                      </span>
                      {a.role && (
                        <span className={`text-[11px] ${confirmed ? "text-[#2b5fd9]" : "text-[#4e535a]"}`}>{a.role}</span>
                      )}
                    </span>
                  )})
                ) : (
                  <span className="text-[12px] text-[#b0b5bb]">-</span>
                )}
              </div>
            </div>

            {/* 客户反馈 */}
            <div className="flex items-start gap-2">
              <span className="text-[12px] text-[#8f959e] shrink-0 w-14 mt-0.5">客户反馈</span>
              <div className="text-[12px] text-[#2b2f36] leading-relaxed min-w-0 flex-1">
                {v.experience ? (
                  <>
                    {v.experience}
                    {v.feedback && (
                      <span className="text-[#8f959e] ml-2">回复：{v.feedback}</span>
                    )}
                    <button
                      className="text-[11px] text-[#3370ff] hover:text-[#2860e0] cursor-pointer ml-2 align-baseline"
                      onClick={() => { setEditExpVisit(v); setEditExpText(v.experience || ""); setEditFeedbackText(v.feedback || "") }}
                    >
                      编辑
                    </button>
                  </>
                ) : (
                  <button
                    className="text-[11px] text-[#3370ff] hover:text-[#2860e0] cursor-pointer"
                    onClick={() => { setEditExpVisit(v); setEditExpText(v.experience || ""); setEditFeedbackText(v.feedback || "") }}
                  >
                    编辑
                  </button>
                )}
              </div>
            </div>

            {/* 疗愈记录 + 详情 */}
            <div className="flex items-start gap-2">
              <span className="text-[12px] text-[#8f959e] shrink-0 w-14 mt-0.5">疗愈记录</span>
              <div className="text-[12px] text-[#2b2f36] leading-relaxed min-w-0 flex-1">
                {hrMap[v.id]?.growth_record ? (
                  <>
                    {hrMap[v.id]!.growth_record}
                    <button
                      className="text-[11px] text-[#3370ff] hover:text-[#2860e0] cursor-pointer ml-2 align-baseline"
                      onClick={() => openEdit(v)}
                    >
                      编辑
                    </button>
                  </>
                ) : (
                  <button
                    className="text-[11px] text-[#3370ff] hover:text-[#2860e0] cursor-pointer"
                    onClick={() => openEdit(v)}
                  >
                    编辑
                  </button>
                )}
              </div>
            </div>

            {/* 到店确认 */}
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-[#8f959e] shrink-0 w-14">到店确认</span>
              <div className="flex items-center gap-3">
                {v.arrived ? (
                  <button
                    className="inline-flex items-center gap-1 text-[11px] px-3 py-1 rounded-lg bg-[#3370ff] text-white hover:bg-[#2860e0] transition-colors cursor-pointer"
                    onClick={() => onCancelArrived(v)}
                  >
                    已到店 ✓
                  </button>
                ) : (
                  <button
                    className="text-[11px] px-3 py-1 rounded-lg border border-[#d0d5dd] text-[#8f959e] hover:bg-[#f5f6f7] transition-colors cursor-pointer"
                    onClick={() => onMarkArrived(v)}
                  >
                    未到店
                  </button>
                )}
              </div>
            </div>
          </div>
          <button
            className="text-[11px] text-[#8f959e] hover:text-[#3370ff] cursor-pointer shrink-0 self-end"
            onClick={() => openDetail(v)}
          >
            操作记录
          </button>
        </div>
      ))}
      </div>
      </div>

      {/* 疗愈记录编辑弹窗 */}
      <Dialog open={!!editVisit} onOpenChange={(open) => !open && setEditVisit(null)}>
        <DialogContent className="max-w-md p-0 gap-0">
          <DialogHeader className="px-5 pt-5 pb-4 border-b border-[#f0f0f0]">
            <DialogTitle className="text-base">疗愈记录 - {editVisit?.nickname}</DialogTitle>
          </DialogHeader>
          <div className="px-5 py-4">
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              placeholder="输入疗愈记录..."
              rows={8}
              className="w-full rounded-xl border border-[#e8eaed] p-4 text-[15px] text-[#2b2f36] placeholder:text-[#b0b5bb] resize-none focus:outline-none focus:ring-1 focus:ring-[#3370ff] focus:border-[#3370ff]"
            />
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" size="sm" onClick={() => setEditVisit(null)}>取消</Button>
              <Button size="sm" onClick={handleSaveHR} disabled={savingHR}>
                {savingHR ? "保存中..." : "保存"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 客户反馈编辑弹窗 */}
      <Dialog open={!!editExpVisit} onOpenChange={(open) => !open && setEditExpVisit(null)}>
        <DialogContent className="max-w-md p-0 gap-0">
          <DialogHeader className="px-5 pt-5 pb-4 border-b border-[#f0f0f0]">
            <DialogTitle className="text-base">客户反馈 - {editExpVisit?.nickname}</DialogTitle>
          </DialogHeader>
          <div className="px-5 py-4 space-y-4">
            <div>
              <label className="text-[12px] text-[#8f959e] mb-1.5 block">客户反馈</label>
              <textarea
                value={editExpText}
                onChange={(e) => setEditExpText(e.target.value)}
                placeholder="输入客户反馈..."
                rows={3}
                className="w-full rounded-[4px] border border-[#e8eaed] px-3 py-2.5 text-[12px] text-[#2b2f36] placeholder:text-[#b0b5bb] resize-none focus:outline-none focus:ring-1 focus:ring-[#3370ff] focus:border-[#3370ff]"
              />
            </div>
            <div>
              <label className="text-[12px] text-[#8f959e] mb-1.5 block">疗愈师回复</label>
              <textarea
                value={editFeedbackText}
                onChange={(e) => setEditFeedbackText(e.target.value)}
                placeholder="输入疗愈师回复..."
                rows={4}
                className="w-full rounded-[4px] border border-[#e8eaed] px-3 py-2.5 text-[12px] text-[#2b2f36] placeholder:text-[#b0b5bb] resize-none focus:outline-none focus:ring-1 focus:ring-[#3370ff] focus:border-[#3370ff]"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditExpVisit(null)}>取消</Button>
              <Button size="sm" onClick={handleSaveExp} disabled={savingExp}>
                {savingExp ? "保存中..." : "保存"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 操作记录弹窗 */}
      <Dialog open={!!detailVisit} onOpenChange={(open) => !open && setDetailVisit(null)}>
        <DialogContent className="max-w-lg p-0 gap-0 max-h-[80vh] flex flex-col">
          <DialogHeader className="px-5 pt-5 pb-4 border-b border-[#f0f0f0] shrink-0">
            <DialogTitle className="text-base">操作记录 - {detailVisit?.nickname}</DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto flex-1">
            {loadingLogs ? (
              <div className="py-12 text-center text-sm text-muted-foreground">加载中...</div>
            ) : detailLogs.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">暂无操作记录</div>
            ) : (
              <div className="divide-y divide-[#f0f0f0]">
                {detailLogs.map((log) => {
                  const operatorDisplay = log.operator || (log.ip ? `H5 (${log.ip})` : "-")
                  const roleDisplay = log.ip && !log.operator ? log.ip : (log.operator_role || "")
                  return (
                    <div key={log.id} className="px-5 py-3 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${SECTION_COLORS[getMethodLabel(log.method)] || "bg-gray-50 text-gray-600"}`}>
                          {getMethodLabel(log.method)}
                        </span>
                        <span className="text-[12px] text-[#2b2f36] font-medium">{log.content}</span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-[#8f959e]">
                        <span>操作人：{operatorDisplay}</span>
                        {roleDisplay && <span>{roleDisplay}</span>}
                        <span>{new Date(log.created_at).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
