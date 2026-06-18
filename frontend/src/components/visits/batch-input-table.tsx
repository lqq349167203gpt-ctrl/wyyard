import { useState, useCallback, useRef, useEffect } from "react"
import { Plus, Trash2, FileText, GripVertical, Pencil } from "lucide-react"
import { Input } from "@/components/ui/input"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { visitApi, membershipCardApi, consumptionRecordsApi, type CustomerLight, type MembershipCard } from "@/lib/api"
import { CustomerSearchInput } from "@/components/customer-search-input"
import { SelectDropdown } from "@/components/select-dropdown"

interface Row {
  key: number
  visit_time: string
  customer_id: string
  nickname: string
  member_type: string
  remaining_count: number | null
  is_leader: boolean
  needs: string
  referrer_handler: string
  arrived: boolean
  feedback: string
  healing_notes: string
  group_leader_feedback: string
  activities: string
}

let nextKey = 1

function emptyRow(): Row {
  return { key: nextKey++, visit_time: "", customer_id: "", nickname: "", member_type: "", remaining_count: null, is_leader: false, needs: "", referrer_handler: "", arrived: false, feedback: "", healing_notes: "", group_leader_feedback: "", activities: "" }
}

function initRows(): Row[] {
  return Array.from({ length: 1 }, () => emptyRow())
}

type RowStatus = "idle" | "saving" | "saved" | "error"

interface BatchInputTableProps {
  date: string
  customers: CustomerLight[]
  spaceId?: string
  refreshKey?: number
  onSaved: () => void
  onSavedCountChange?: (count: number) => void
  onSavingCountChange?: (count: number) => void
  onCustomerClick?: (customerId: string) => void
  onCustomerEdit?: (customerId: string) => void
  onActivityClick?: (customerId: string) => void
  onCreateCustomer?: (nickname: string) => void
}

function getRemainingCount(cards: MembershipCard[], customerId: string): number | null {
  const customerCards = cards.filter(c => c.customer_id === customerId)
  if (!customerCards.length) return null
  customerCards.sort((a, b) => b.created_at.localeCompare(a.created_at))
  const card = customerCards[0]
  if (card.expiry_date && card.expiry_date < new Date().toLocaleDateString("sv-SE")) return 0
  return card.remaining_count ?? -1
}

function formatRemaining(count: number | null): string {
  if (count === null) return "-"
  if (count === -999) return "不限"
  if (count < 0) return `${count} 次`  // -1 表示欠费1次，-2 表示欠费2次
  return `${count} 次`
}

export function BatchInputTable({ date, customers, spaceId, refreshKey, onSaved, onSavedCountChange, onSavingCountChange, onCustomerClick, onCustomerEdit, onActivityClick, onCreateCustomer }: BatchInputTableProps) {
  const [rows, setRows] = useState<Row[]>(initRows)
  const [rowStatus, setRowStatus] = useState<Record<number, RowStatus>>({})
  const [savedCount, setSavedCount] = useState(0)
  const [deleteKey, setDeleteKey] = useState<number | null>(null)
  const [dailyTotals, setDailyTotals] = useState<Record<string, number>>({})
  const [dragOverKey, setDragOverKey] = useState<number | null>(null)
  const dragKeyRef = useRef<number | null>(null)
  const cardsRef = useRef<MembershipCard[]>([])

  useEffect(() => { onSavedCountChange?.(savedCount) }, [savedCount])

  useEffect(() => {
    const savingCount = Object.values(rowStatus).filter(s => s === "saving").length
    onSavingCountChange?.(savingCount)
  }, [rowStatus, onSavingCountChange])

  const rowsRef = useRef(rows)
  rowsRef.current = rows
  const timersRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({})
  const savedVisitIds = useRef<Record<number, string>>({})

  // 加载会员卡数据
  useEffect(() => {
    membershipCardApi.list().then(cards => { cardsRef.current = cards }).catch(() => {})
  }, [])

  // 加载当日成交总额
  useEffect(() => {
    consumptionRecordsApi.getDailyTotals(date).then(setDailyTotals).catch(() => {})
  }, [date])

  // 加载当日已有记录（仅首次，日期或空间变化时重新加载）
  const initialLoaded = useRef(false)
  useEffect(() => { initialLoaded.current = false }, [date, spaceId, refreshKey])
  useEffect(() => {
    if (initialLoaded.current) return
    let cancelled = false
    console.log(`[BATCH] 开始加载 date=${date} spaceId=${spaceId}`)
    visitApi.list(date, undefined, spaceId).then(visits => {
      if (cancelled) return
      console.log(`[BATCH] 加载 ${date} 的记录: ${visits.length} 条`, visits.map(v => v.id))
      initialLoaded.current = true
      if (!visits.length) {
        setRows(initRows())
        savedVisitIds.current = {}
        setRowStatus({})
        setSavedCount(0)
        return
      }
      // 按保存的行顺序排序
      const orderKey = `visit_order_${date}_${spaceId || ""}`
      let savedOrder: string[] = []
      try { savedOrder = JSON.parse(localStorage.getItem(orderKey) || "[]") } catch {}
      if (savedOrder.length) {
        const orderMap = new Map(savedOrder.map((id, i) => [id, i]))
        visits.sort((a, b) => (orderMap.get(a.id) ?? 999) - (orderMap.get(b.id) ?? 999))
      }
      const loaded: Row[] = []
      const ids: Record<number, string> = {}
      const statuses: Record<number, RowStatus> = {}
      for (const v of visits) {
        const key = nextKey++
        loaded.push({
          key,
          visit_time: v.visit_time || "",
          customer_id: v.customer_id,
          nickname: v.nickname,
          member_type: v.member_type || "",
          remaining_count: v.remaining_count ?? null,
          is_leader: v.is_leader || false,
          needs: v.needs || "",
          referrer_handler: v.referrer_handler || "",
          arrived: v.arrived,
          feedback: v.feedback || "",
          healing_notes: v.healing_notes || "",
          group_leader_feedback: v.group_leader_feedback || "",
          activities: (v.activities || []).map(a => `${a.name}${a.role ? `(${a.role})` : ""}`).join("、"),
        })
        ids[key] = v.id
        statuses[key] = "saved"
      }
      // 保存当前顺序
      localStorage.setItem(orderKey, JSON.stringify(visits.map(v => v.id)))
      // 不自动补空行，由用户点击"添加一行"来新增
      setRows(loaded)
      savedVisitIds.current = ids
      setRowStatus(statuses)
      setSavedCount(visits.length)
    }).catch((err) => { console.error("[BATCH] 加载失败:", err) })
    return () => { cancelled = true; console.log(`[BATCH] effect cleanup date=${date} spaceId=${spaceId}`) }
  }, [date, spaceId])

  const saveRow = useCallback(async (row: Row) => {
    const existingId = savedVisitIds.current[row.key]

    setRowStatus(prev => ({ ...prev, [row.key]: "saving" }))

    try {
      if (existingId) {
        const result = await visitApi.update(existingId, {
          visit_time: row.visit_time || "",
          customer_id: row.customer_id,
          nickname: row.nickname,
          is_leader: row.is_leader,
          needs: row.needs,
          referrer_handler: row.referrer_handler,
          arrived: row.arrived,
          arrival_time: row.arrived ? row.visit_time : "",
          feedback: row.feedback,
          healing_notes: row.healing_notes,
          group_leader_feedback: row.group_leader_feedback,
        })
        // 更新剩余次数
        if (result?.remaining_count !== undefined) {
          setRows(prev => prev.map(r => r.key === row.key ? { ...r, remaining_count: result.remaining_count ?? null } : r))
        }
      } else {
        // 检查是否已存在该客户的到场记录
        const existingVisit = rowsRef.current.find(r => r.key !== row.key && r.customer_id === row.customer_id && r.customer_id)
        if (existingVisit) {
          setRowStatus(prev => ({ ...prev, [row.key]: "error" }))
          return
        }

        const payload = {
          visit_date: date,
          visit_time: row.visit_time || "",
          customer_id: row.customer_id,
          nickname: row.nickname,
          is_leader: row.is_leader,
          needs: row.needs,
          referrer_handler: row.referrer_handler,
          arrived: row.arrived,
          arrival_time: row.arrived ? row.visit_time : "",
          feedback: row.feedback,
          healing_notes: row.healing_notes,
          group_leader_feedback: row.group_leader_feedback,
          space_id: spaceId || undefined,
        }
        console.log("[BATCH] 创建行:", payload)
        const result = await visitApi.create(payload)
        console.log("[BATCH] 创建结果:", result?.id, "space_id:", result?.space_id)
        if (result?.id) {
          savedVisitIds.current[row.key] = result.id
          // 追加到行顺序
          const orderKey = `visit_order_${date}_${spaceId || ""}`
          try {
            const order: string[] = JSON.parse(localStorage.getItem(orderKey) || "[]")
            order.push(result.id)
            localStorage.setItem(orderKey, JSON.stringify(order))
          } catch {}
        }
        setSavedCount(c => c + 1)
      }
      setRowStatus(prev => ({ ...prev, [row.key]: "saved" }))
      onSaved()
    } catch (e: any) {
      console.error("[BATCH] 保存行失败:", e)
      const msg = e?.message || "保存失败"
      if (msg.includes("已存在") || msg.includes("already")) {
        setRowStatus(prev => ({ ...prev, [row.key]: "error" }))
      } else {
        setRowStatus(prev => ({ ...prev, [row.key]: "error" }))
      }
    }
  }, [date, spaceId, onSaved])

  const scheduleSave = useCallback((key: number) => {
    if (timersRef.current[key]) clearTimeout(timersRef.current[key])
    timersRef.current[key] = setTimeout(() => {
      const row = rowsRef.current.find(r => r.key === key)
      if (row) saveRow(row)
      delete timersRef.current[key]
    }, 500)
  }, [saveRow])

  const updateRow = useCallback((key: number, field: keyof Row, value: any) => {
    setRows(prev => prev.map(r => r.key === key ? { ...r, [field]: value } : r))
    if (rowStatus[key] === "saved" || rowStatus[key] === "error") {
      setRowStatus(prev => ({ ...prev, [key]: "idle" }))
    }
    scheduleSave(key)
  }, [rowStatus, scheduleSave])

  const removeRow = useCallback(async (key: number) => {
    if (timersRef.current[key]) { clearTimeout(timersRef.current[key]); delete timersRef.current[key] }
    const visitId = savedVisitIds.current[key]
    if (visitId) {
      // 从 localStorage 顺序中移除
      const orderKey = `visit_order_${date}_${spaceId || ""}`
      try {
        const order: string[] = JSON.parse(localStorage.getItem(orderKey) || "[]")
        localStorage.setItem(orderKey, JSON.stringify(order.filter(id => id !== visitId)))
      } catch {}
      // 调用后端删除
      try { await visitApi.delete(visitId) } catch (e) { console.error("删除行失败:", e) }
      onSaved()
    }
    delete savedVisitIds.current[key]
    setRows(prev => prev.filter(r => r.key !== key))
    setRowStatus(prev => { const n = { ...prev }; delete n[key]; return n })
  }, [date, spaceId, onSaved])

  const addRow = useCallback(async () => {
    const row = emptyRow()
    console.log("[BATCH] addRow, key:", row.key)
    setRows(prev => [...prev, row])
    try { await saveRow(row) } catch { /* saveRow handles its own errors */ }
  }, [saveRow])

  const handleDragStart = useCallback((key: number) => {
    dragKeyRef.current = key
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, key: number) => {
    e.preventDefault()
    if (dragKeyRef.current !== key) setDragOverKey(key)
  }, [])

  const handleDragEnd = useCallback(() => {
    dragKeyRef.current = null
    setDragOverKey(null)
  }, [])

  const handleDrop = useCallback((targetKey: number) => {
    const sourceKey = dragKeyRef.current
    if (sourceKey === null || sourceKey === targetKey) { setDragOverKey(null); return }
    setRows(prev => {
      const srcIdx = prev.findIndex(r => r.key === sourceKey)
      const tgtIdx = prev.findIndex(r => r.key === targetKey)
      if (srcIdx === -1 || tgtIdx === -1) return prev
      const next = [...prev]
      const [moved] = next.splice(srcIdx, 1)
      next.splice(tgtIdx, 0, moved)
      // 保存新顺序到 localStorage
      const orderKey = `visit_order_${date}_${spaceId || ""}`
      try {
        const order = next.map(r => savedVisitIds.current[r.key]).filter(Boolean)
        localStorage.setItem(orderKey, JSON.stringify(order))
      } catch {}
      return next
    })
    dragKeyRef.current = null
    setDragOverKey(null)
  }, [date, spaceId])

  const handleCustomerSelect = useCallback((key: number, customer: any) => {
    // 检查是否已存在该客户
    const existingRow = rowsRef.current.find(r => r.key !== key && r.customer_id === customer.id)
    if (existingRow) return

    const memberType = customer.member_type || ""
    const remaining = getRemainingCount(cardsRef.current, customer.id)
    setRows(prev => prev.map(r => r.key === key ? { ...r, nickname: customer.nickname, customer_id: customer.id, member_type: memberType, remaining_count: remaining } : r))
    scheduleSave(key)
  }, [scheduleSave])

  return (
    <div className="bg-white rounded-lg">
      <div className="overflow-x-auto scrollbar-hide">
        <div className="min-w-[1688px]">
          <table className="text-[12px] w-full" style={{ tableLayout: "fixed" }}>
          <thead>
            <tr className="bg-[#fafbfc] text-[#8f959e]">
              <th className="w-[24px]"></th>
              <th className="px-1.5 py-2 text-center font-normal w-[36px]">到店</th>
              <th className="pl-2 pr-[10px] py-2 text-left font-normal w-[64px]">组长</th>
              <th className="pl-0 pr-2.5 py-2 text-left font-normal w-[64px]">时间</th>
              <th className="pl-0 pr-1.5 py-2 text-left font-normal w-[78px]">昵称</th>
              <th className="px-1.5 py-2 text-left font-normal w-[80px]">会员身份</th>
              <th className="px-1.5 py-2 text-left font-normal w-[64px]">剩余次数</th>
              <th className="px-1.5 py-2 text-left font-normal w-[240px]">本次需求</th>
              <th className="px-1.5 py-2 text-left font-normal w-[74px]">邀约人</th>
              <th className="px-1.5 py-2 text-left font-normal w-[60px]">参与活动</th>
              <th className="px-1.5 py-2 text-left font-normal w-[60px]">今日成交</th>
              <th className="px-1.5 py-2 text-left font-normal w-[220px]">客户反馈</th>
              <th className="px-1.5 py-2 text-left font-normal w-[220px]">跟进记录</th>
              <th className="px-1.5 py-2 text-left font-normal w-[220px]">组长反馈</th>
              <th className="px-1.5 py-2 text-left font-normal w-[74px]">所属组长</th>
              <th className="px-1.5 py-2 text-center font-normal w-[68px] sticky right-0 bg-[#fafbfc] z-10 relative before:content-[''] before:absolute before:top-0 before:bottom-0 before:-left-2 before:w-2 before:[background:linear-gradient(to_left,rgba(0,0,0,0.02),transparent)]">操作</th>
            </tr>
          </thead>
          <tbody className="[&_tr:first-child>td]:pt-[12px]">
            {rows.map((row, idx) => {
              const status = rowStatus[row.key] || "idle"
              // 找到上方最近的组长行
              const leaderRow = row.is_leader ? null : rows.slice(0, idx).reverse().find(r => r.is_leader)
              return (
                <tr
                  key={row.key}
                  className={`hover:bg-[#fafbfc] ${dragOverKey === row.key ? "border-t-2 border-t-[#3370ff]" : ""}`}
                  onDragOver={(e) => handleDragOver(e, row.key)}
                  onDrop={() => handleDrop(row.key)}
                >
                  <td
                    className="px-0.5 py-1.5 cursor-grab active:cursor-grabbing text-center"
                    draggable
                    onDragStart={() => handleDragStart(row.key)}
                    onDragEnd={handleDragEnd}
                  >
                    <GripVertical className="h-3.5 w-3.5 text-[#c9cdd4] mx-auto" />
                  </td>
                  <td className="px-1.5 py-1.5 text-center">
                    <input
                      type="checkbox"
                      checked={row.arrived}
                      onChange={(e) => updateRow(row.key, "arrived", e.target.checked)}
                      className="h-3.5 w-3.5 appearance-none border border-[#d0d3d6] rounded-[3px] bg-white checked:bg-[#3370ff] checked:border-[#3370ff] checked:bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2012%2012%22%3E%3Cpath%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-width%3D%222%22%20d%3D%22M3%206l2%202%204-4%22%2F%3E%3C%2Fsvg%3E')] bg-center bg-no-repeat cursor-pointer"
                    />
                  </td>
                  <td className="pl-2 pr-[10px] py-1.5 w-[64px]">
                    <SelectDropdown
                      size="sm"
                      value={row.is_leader ? "1" : "0"}
                      options={[{ value: "0", label: "-" }, { value: "1", label: "组长" }]}
                      onChange={(v) => updateRow(row.key, "is_leader", v === "1")}
                      placeholder="-"
                      hideChevron
                      className="[&_button]:border-[0.5px] [&_button]:text-[12px]"
                      textColor={row.is_leader ? undefined : "text-[#c9cdd4]"}
                    />
                  </td>
                  <td className="pl-0 pr-2.5 py-1.5">
                    <input
                      type="time"
                      value={row.visit_time}
                      onChange={(e) => updateRow(row.key, "visit_time", e.target.value)}
                      className={`h-7 text-[12px] w-[56px] time-no-icon rounded-md border-[0.5px] border-[#dee0e3] bg-transparent px-2 outline-none focus:border-[#3370ff] ${!row.visit_time ? "text-[#c9cdd4]" : "text-[#2b2f36]"}`}
                    />
                  </td>
                  <td className="pl-0 pr-1.5 py-1.5">
                    <CustomerSearchInput
                      customers={customers as any[]}
                      value={row.nickname}
                      showClear={false}
                      excludeIds={rows.filter(r => r.key !== row.key && r.customer_id).map(r => r.customer_id)}
                      onChange={(v) => {
                        const name = typeof v === "string" ? v : v[0] || ""
                        if (!name) { updateRow(row.key, "nickname", ""); updateRow(row.key, "customer_id", ""); setRows(prev => prev.map(r => r.key === row.key ? { ...r, member_type: "", remaining_count: null } : r)) }
                      }}
                      onSelectItem={(c) => handleCustomerSelect(row.key, c)}
                      onNoResultsClick={(text) => onCreateCustomer?.(text.trim())}
                      onBlur={(v) => {
                        if (v && !customers.some(c => c.nickname === v)) {
                          setRows(prev => prev.map(r => r.key === row.key ? { ...r, nickname: "", customer_id: "", member_type: "", remaining_count: null } : r))
                          scheduleSave(row.key)
                        }
                      }}
                      placeholder=""
                      className="h-7 [&]:border-[0.5px]"
                    />
                  </td>
                  <td className="px-1.5 py-1.5">
                    <span className="text-[12px] text-[#2b2f36]">{row.member_type}</span>
                  </td>
                  <td className="px-1.5 py-1.5">
                    <span className={`text-[12px] ${row.remaining_count !== null && row.remaining_count < 0 && row.remaining_count !== -999 ? "text-[#e02020]" : "text-[#2b2f36]"}`}>{row.nickname ? formatRemaining(row.remaining_count) : ""}</span>
                  </td>
                  <td className="px-1.5 py-1.5">
                    <Input
                      value={row.needs}
                      onChange={(e) => updateRow(row.key, "needs", e.target.value)}
                      className="h-7 text-[12px] [&]:border-[0.5px]"
                    />
                  </td>
                  <td className="px-1.5 py-1.5">
                    <CustomerSearchInput
                      customers={customers as any[]}
                      value={row.referrer_handler}
                      showClear={false}
                      onChange={(v) => updateRow(row.key, "referrer_handler", typeof v === "string" ? v : v[0] || "")}
                      onSelectItem={(c) => updateRow(row.key, "referrer_handler", c.nickname)}
                      onBlur={(v) => {
                        if (v && !customers.some(c => c.nickname === v)) {
                          updateRow(row.key, "referrer_handler", "")
                        }
                      }}
                      placeholder=""
                      className="h-7 [&]:border-[0.5px]"
                    />
                  </td>
                  <td className="px-1.5 py-1.5 text-left">
                    {row.activities && row.customer_id ? (
                      <button
                        onClick={() => onActivityClick?.(row.customer_id)}
                        className="text-[12px] text-[#3370ff] hover:underline"
                      >
                        {row.activities.split("、").length}场
                      </button>
                    ) : null}
                  </td>
                  <td className="px-1.5 py-1.5 text-left">
                    <span className="text-[12px] text-[#8f959e]">
                      {row.customer_id && dailyTotals[row.customer_id] ? `¥${dailyTotals[row.customer_id].toLocaleString()}` : ""}
                    </span>
                  </td>
                  <td className="px-1.5 py-1.5">
                    <Input
                      value={row.feedback}
                      onChange={(e) => updateRow(row.key, "feedback", e.target.value)}
                      className="h-7 text-[12px] [&]:border-[0.5px]"
                    />
                  </td>
                  <td className="px-1.5 py-1.5">
                    <Input
                      value={row.healing_notes}
                      onChange={(e) => updateRow(row.key, "healing_notes", e.target.value)}
                      className="h-7 text-[12px] [&]:border-[0.5px]"
                    />
                  </td>
                  <td className="px-1.5 py-1.5">
                    <Input
                      value={row.group_leader_feedback}
                      onChange={(e) => updateRow(row.key, "group_leader_feedback", e.target.value)}
                      className="h-7 text-[12px] [&]:border-[0.5px]"
                    />
                  </td>
                  <td className="px-1.5 py-1.5">
                    <span className="text-[12px] text-[#8f959e]">{leaderRow?.nickname || ""}</span>
                  </td>
                  <td className={`px-1.5 py-1.5 text-center sticky right-0 z-10 relative before:content-[''] before:absolute before:top-0 before:bottom-0 before:-left-2 before:w-2 before:[background:linear-gradient(to_left,rgba(0,0,0,0.02),transparent)] bg-white`}>
                    {row.customer_id && (
                      <>
                        <button
                          onClick={() => onCustomerClick?.(row.customer_id)}
                          className="text-[#8f959e] hover:text-[#3370ff] mr-1"
                        >
                          <FileText className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => onCustomerEdit?.(row.customer_id)}
                          className="text-[#8f959e] hover:text-[#3370ff] mr-1"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => setDeleteKey(row.key)}
                      className="text-[#8f959e] hover:text-[#e02020]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        </div>
      </div>

      <div className="px-3 py-2.5 mt-1.5 border-t border-[#f0f1f2] flex items-center">
        <button
          onClick={addRow}
          className="flex items-center gap-1 text-[12px] text-[#3370ff] hover:text-[#2860e1]"
        >
          <Plus className="h-3.5 w-3.5" />
          添加一行
        </button>
      </div>

      <AlertDialog open={deleteKey !== null} onOpenChange={(open) => !open && setDeleteKey(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>该操作会删除一行数据，是否继续？</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteKey !== null) removeRow(deleteKey); setDeleteKey(null) }}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
