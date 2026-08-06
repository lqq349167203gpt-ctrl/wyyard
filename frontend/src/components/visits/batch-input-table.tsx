import { useState, useCallback, useRef, useEffect, useMemo } from "react"
import { Plus, Trash2, FileText, GripVertical, Edit } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { visitApi, membershipCardApi, consumptionRecordsApi, type CustomerLight, type MembershipCard } from "@/lib/api"
import { CustomerSearchInput } from "@/components/customer-search-input"
import { SelectDropdown } from "@/components/select-dropdown"

interface Row {
  key: number
  visit_id: string
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
  return { key: nextKey++, visit_id: "", visit_time: "", customer_id: "", nickname: "", member_type: "", remaining_count: null, is_leader: false, needs: "", referrer_handler: "", arrived: false, feedback: "", healing_notes: "", group_leader_feedback: "", activities: "" }
}

export interface VisitChangedCell {
  rowKey: number
  fields: string[]
}

export interface VisitHistoryEntry {
  id?: string
  timestamp: number
  action: string
  userName: string
  ip?: string
  rows: Row[]
  changedKeys?: number[]
  changedCells?: VisitChangedCell[]
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
  onUndoRedoChange?: (canUndo: boolean, canRedo: boolean, undo: () => void, redo: () => void, history: VisitHistoryEntry[]) => void
  onRestoreRef?: (restore: (entry: VisitHistoryEntry) => Promise<void>) => void
  onCaptureRef?: (capture: () => VisitHistoryEntry) => void
  onHistoryPushed?: (entry: VisitHistoryEntry) => void
  previewRows?: Row[]
  previewChangedKeys?: number[]
  previewChangedCells?: VisitChangedCell[]
  locked?: boolean
  onClosePreview?: () => void
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

export function BatchInputTable({ date, customers, spaceId, refreshKey, onSaved, onSavedCountChange, onSavingCountChange, onCustomerClick, onCustomerEdit, onActivityClick, onCreateCustomer, onUndoRedoChange, onRestoreRef, onCaptureRef, onHistoryPushed, previewRows, previewChangedKeys, previewChangedCells, locked, onClosePreview }: BatchInputTableProps) {
  const [rows, setRows] = useState<Row[]>(initRows)
  const [rowStatus, setRowStatus] = useState<Record<number, RowStatus>>({})
  const [savedCount, setSavedCount] = useState(0)
  const [deleteKey, setDeleteKey] = useState<number | null>(null)
  const [dailyTotals, setDailyTotals] = useState<Record<string, number>>({})
  const [dragOverKey, setDragOverKey] = useState<number | null>(null)
  const dragKeyRef = useRef<number | null>(null)
  const cardsRef = useRef<MembershipCard[]>([])

  // 撤回/重做历史栈
  const [undoStack, setUndoStack] = useState<VisitHistoryEntry[]>([])
  const [redoStack, setRedoStack] = useState<VisitHistoryEntry[]>([])

  const getUserName = useCallback(() => {
    try {
      const user = JSON.parse(localStorage.getItem("currentUser") || "{}")
      return user.owner || user.nickname || user.username || "未知"
    } catch { return "未知" }
  }, [])

  // 编辑防抖：同一行同一字段连续输入只记录一次
  const editTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingEditRef = useRef<{ action: string; changedKeys: number[]; description?: string; changedCells: VisitChangedCell[] } | null>(null)

  const flushEdit = useCallback(() => {
    const pending = pendingEditRef.current
    if (!pending) return
    pendingEditRef.current = null
    const entry: VisitHistoryEntry = {
      timestamp: Date.now(),
      action: pending.description || pending.action,
      userName: getUserName(),
      rows: rowsRef.current.map(r => ({ ...r })),
      changedKeys: pending.changedKeys,
      changedCells: pending.changedCells,
    }
    setUndoStack(prev => [...prev, entry])
    setRedoStack([])
    onHistoryPushed?.(entry)
  }, [getUserName, onHistoryPushed])

  const pushHistory = useCallback((action: string, changedKeys?: number[], description?: string, overrideRows?: Row[], changedCells?: VisitChangedCell[]) => {
    const entry: VisitHistoryEntry = {
      timestamp: Date.now(),
      action: description || action,
      userName: getUserName(),
      rows: overrideRows || rowsRef.current.map(r => ({ ...r })),
      changedKeys,
      changedCells,
    }
    setUndoStack(prev => [...prev, entry])
    setRedoStack([])
    onHistoryPushed?.(entry)
  }, [getUserName, onHistoryPushed])

  // 编辑专用：500ms 防抖，连续输入合并为一条
  const pushEditHistory = useCallback((action: string, changedKeys?: number[], description?: string, changedCells?: VisitChangedCell[]) => {
    pendingEditRef.current = { action, changedKeys: changedKeys || [], description, changedCells: changedCells || [] }
    if (editTimerRef.current) clearTimeout(editTimerRef.current)
    editTimerRef.current = setTimeout(flushEdit, 500)
  }, [flushEdit])

  const undo = useCallback(() => {
    if (editTimerRef.current) { clearTimeout(editTimerRef.current); flushEdit() }
    setUndoStack(prev => {
      if (prev.length === 0) return prev
      const entry = prev[prev.length - 1]
      const currentEntry: VisitHistoryEntry = {
        timestamp: Date.now(), action: "撤回", userName: getUserName(),
        rows: rowsRef.current.map(r => ({ ...r }))
      }
      setRedoStack(r => [...r, currentEntry])
      setRows(entry.rows.map(r => ({ ...r })))
      return prev.slice(0, -1)
    })
  }, [getUserName])

  const redo = useCallback(() => {
    if (editTimerRef.current) { clearTimeout(editTimerRef.current); flushEdit() }
    setRedoStack(prev => {
      if (prev.length === 0) return prev
      const entry = prev[prev.length - 1]
      const currentEntry: VisitHistoryEntry = {
        timestamp: Date.now(), action: "重做", userName: getUserName(),
        rows: rowsRef.current.map(r => ({ ...r }))
      }
      setUndoStack(u => [...u, currentEntry])
      setRows(entry.rows.map(r => ({ ...r })))
      return prev.slice(0, -1)
    })
  }, [getUserName])

  // 通知父组件撤回/重做状态变化
  useEffect(() => {
    onUndoRedoChange?.(undoStack.length > 0, redoStack.length > 0, undo, redo, undoStack)
  }, [undoStack, redoStack, undo, redo, onUndoRedoChange])

  // 恢复历史版本：同步到后端，确保刷新后仍然保持该版本
  // 用 customer_id 匹配数据库记录，而不是 visit_id（visit_id 可能已失效）
  const restoreFromHistory = useCallback(async (entry: VisitHistoryEntry) => {
    pushHistory("恢复了历史版本")
    const restoredRows = entry.rows.map(r => ({ ...r }))
    setRows(restoredRows)
    const statuses: Record<number, RowStatus> = {}
    restoredRows.forEach(r => { statuses[r.key] = "saving" })
    setRowStatus(statuses)
    // 获取数据库当前记录，按 customer_id 建立映射
    const currentVisits = await visitApi.list(date, undefined, spaceId).catch(() => [])
    const existingByCustomerId = new Map<string, string>()
    for (const v of currentVisits) {
      if (v.customer_id) existingByCustomerId.set(v.customer_id, v.id)
    }
    // 当前数据库中的所有 visit id
    const currentVisitIds = new Set(currentVisits.map(v => v.id))
    // 快照中行对应的 visit id 集合（用于判断哪些行需要删除）
    const snapshotVisitIds = new Set<string>()
    // 为每行设置 savedVisitIds（用 customer_id 匹配数据库中的真实 id）
    for (const row of restoredRows) {
      if (row.customer_id) {
        const dbVisitId = existingByCustomerId.get(row.customer_id)
        if (dbVisitId) {
          savedVisitIds.current[row.key] = dbVisitId
          snapshotVisitIds.add(dbVisitId)
          row.visit_id = dbVisitId
        } else {
          delete savedVisitIds.current[row.key]
          row.visit_id = ""
        }
      } else {
        // 没有 customer_id 的空行，用 visit_id 匹配
        if (row.visit_id && currentVisitIds.has(row.visit_id)) {
          savedVisitIds.current[row.key] = row.visit_id
          snapshotVisitIds.add(row.visit_id)
        } else {
          delete savedVisitIds.current[row.key]
          row.visit_id = ""
        }
      }
    }
    // 更新 rows state（visit_id 已更新为数据库中的真实 id）
    setRows(restoredRows.map(r => ({ ...r })))
    // 需要删除的行：数据库中有但快照中没有的
    const visitIdsToDelete = currentVisits
      .filter(v => !snapshotVisitIds.has(v.id))
      .map(v => v.id)
    // 并行执行：保存快照中的行 + 删除多余的行
    const savePromises = restoredRows.map(async (row) => {
      try {
        await saveRowRef.current(row)
      } catch (e) {
        // saveRow 内部已处理 error 状态
      }
    })
    const deletePromises = visitIdsToDelete.map(async (visitId) => {
      try {
        await visitApi.delete(visitId)
      } catch (e) {
        console.error("[BATCH] 恢复时删除行失败:", e)
      }
    })
    await Promise.allSettled([...savePromises, ...deletePromises])
    onSaved()
  }, [pushHistory, onSaved, date, spaceId])

  useEffect(() => {
    onRestoreRef?.(restoreFromHistory)
  }, [restoreFromHistory, onRestoreRef])

  // 快照当前状态
  const captureCurrentState = useCallback(() => {
    const entry: VisitHistoryEntry = {
      timestamp: Date.now(), action: "打开历史面板", userName: getUserName(),
      rows: rowsRef.current.map(r => ({ ...r }))
    }
    return entry
  }, [getUserName])

  useEffect(() => {
    onCaptureRef?.(captureCurrentState)
  }, [captureCurrentState, onCaptureRef])

  // 预览模式：使用预览数据
  const isPreview = !!previewRows
  const isLocked = locked || isPreview
  const displayRows = previewRows || rows
  const displayChangedKeys = previewChangedKeys || []
  const changedCellMap = useMemo(() => {
    const map = new Map<number, Set<string>>()
    if (previewChangedCells) {
      for (const cc of previewChangedCells) {
        map.set(cc.rowKey, new Set(cc.fields))
      }
    }
    return map
  }, [previewChangedCells])
  const isCellChanged = useCallback((rowKey: number, field: string) => {
    return changedCellMap.get(rowKey)?.has(field) ?? false
  }, [changedCellMap])

  // 组件卸载时刷入待记录的编辑历史
  useEffect(() => {
    return () => {
      if (editTimerRef.current) {
        clearTimeout(editTimerRef.current)
        flushEdit()
      }
    }
  }, [flushEdit])

  useEffect(() => { onSavedCountChange?.(savedCount) }, [savedCount])

  useEffect(() => {
    const savingCount = Object.values(rowStatus).filter(s => s === "saving").length
    onSavingCountChange?.(savingCount)
  }, [rowStatus, onSavingCountChange])

  const rowsRef = useRef(rows)
  rowsRef.current = rows
  const timersRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({})
  const savedVisitIds = useRef<Record<number, string>>({})
  const saveRowRef = useRef<(row: Row) => Promise<void>>(() => Promise.resolve())

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
    visitApi.list(date, undefined, spaceId).then(visits => {
      if (cancelled) return
      initialLoaded.current = true
      if (!visits.length) {
        setRows(initRows())
        savedVisitIds.current = {}
        setRowStatus({})
        setSavedCount(0)
        return
      }
      // visits 已按后端 sort_order 排序，直接使用
      const loaded: Row[] = []
      const ids: Record<number, string> = {}
      const statuses: Record<number, RowStatus> = {}
      for (const v of visits) {
        const key = nextKey++
        loaded.push({
          key,
          visit_id: v.id,
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
      // 不自动补空行，由用户点击"添加一行"来新增
      setRows(loaded)
      savedVisitIds.current = ids
      setRowStatus(statuses)
      setSavedCount(visits.length)
    }).catch((err) => { console.error("[BATCH] 加载失败:", err) })
    return () => { cancelled = true }
  }, [date, spaceId])

  const saveRow = useCallback(async (row: Row) => {
    const existingId = savedVisitIds.current[row.key]

    setRowStatus(prev => ({ ...prev, [row.key]: "saving" }))

    try {
      if (existingId) {
        const result = await visitApi.update(existingId, {
          visit_time: row.visit_time || "",
          customer_id: row.customer_id,
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
        const result = await visitApi.create(payload)
        if (result?.id) {
          savedVisitIds.current[row.key] = result.id
          setRows(prev => prev.map(r => r.key === row.key ? { ...r, visit_id: result.id } : r))
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

  // 同步 saveRow 到 ref，供 restoreFromHistory 使用
  useEffect(() => { saveRowRef.current = saveRow }, [saveRow])

  const scheduleSave = useCallback((key: number) => {
    if (timersRef.current[key]) clearTimeout(timersRef.current[key])
    timersRef.current[key] = setTimeout(() => {
      const row = rowsRef.current.find(r => r.key === key)
      if (row) saveRow(row)
      delete timersRef.current[key]
    }, 500)
  }, [saveRow])

  const FIELD_LABELS: Record<string, string> = {
    visit_time: "到店时间", nickname: "昵称", member_type: "会员类型",
    is_leader: "组长", needs: "需求", referrer_handler: "引流处理",
    arrived: "到店状态", feedback: "反馈", healing_notes: "疗愈记录",
    group_leader_feedback: "组长反馈",
  }

  const updateRow = useCallback((key: number, field: keyof Row, value: any) => {
    const row = rowsRef.current.find(r => r.key === key)
    const name = row?.nickname || "未命名"
    const label = FIELD_LABELS[field as string] || field
    let desc = `编辑了「${name}」的${label}`
    if (field === "arrived") {
      desc = value ? `标记「${name}」已到店` : `标记「${name}」未到店`
    }
    pushEditHistory(`编辑了${field}`, [key], desc, [{ rowKey: key, fields: [field as string] }])
    setRows(prev => prev.map(r => r.key === key ? { ...r, [field]: value } : r))
    if (rowStatus[key] === "saved" || rowStatus[key] === "error") {
      setRowStatus(prev => ({ ...prev, [key]: "idle" }))
    }
    scheduleSave(key)
  }, [rowStatus, scheduleSave, pushEditHistory])

  const removeRow = useCallback(async (key: number) => {
    const row = rowsRef.current.find(r => r.key === key)
    pushHistory("删除了人员", [key], `删除了「${row?.nickname || "未命名"}」`, undefined, [{ rowKey: key, fields: ["__deleted"] }])
    if (timersRef.current[key]) { clearTimeout(timersRef.current[key]); delete timersRef.current[key] }
    const visitId = savedVisitIds.current[key]
    if (visitId) {
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
    const allFields = Object.keys(row).filter(k => k !== "key") as string[]
    pushHistory("新增了人员", undefined, undefined, undefined, [{ rowKey: row.key, fields: allFields }])
    setRows(prev => [...prev, row])
    try { await saveRow(row) } catch { /* saveRow handles its own errors */ }
  }, [saveRow, pushHistory])

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
    pushHistory("调整了人员顺序")
    setRows(prev => {
      const srcIdx = prev.findIndex(r => r.key === sourceKey)
      const tgtIdx = prev.findIndex(r => r.key === targetKey)
      if (srcIdx === -1 || tgtIdx === -1) return prev
      const next = [...prev]
      const [moved] = next.splice(srcIdx, 1)
      next.splice(tgtIdx, 0, moved)
      // 保存新顺序到 localStorage
      // 同步排序到后端
      const ids = next.map(r => savedVisitIds.current[r.key]).filter(Boolean)
      if (ids.length) {
        visitApi.reorder(ids).catch(e => console.error("保存排序失败:", e))
      }
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
    <div className={`bg-white rounded-lg relative ${isLocked ? "visit-table-locked" : ""}`}>
      {isLocked && (
        <style>{`
          .visit-table-locked input,
          .visit-table-locked select,
          .visit-table-locked textarea,
          .visit-table-locked button,
          .visit-table-locked [role="combobox"],
          .visit-table-locked [data-dropdown] {
            pointer-events: none !important;
            opacity: 0.6;
          }
          .visit-table-locked [draggable="true"] {
            pointer-events: none !important;
          }
        `}</style>
      )}
      {isPreview && (
        <div className="px-4 py-2 bg-[#f0f4ff] border-b border-[#d0e0ff] flex items-center justify-between">
          <span className="text-[12px] text-[#3370ff]">正在预览历史版本 — 当前表格已锁定</span>
          <Button size="sm" variant="outline" className="h-6 text-[11px]" onClick={onClosePreview}>返回编辑</Button>
        </div>
      )}
      <div className="overflow-x-auto scrollbar-visible">
        <div className="min-w-[1688px]">
          <table className="text-[12px] w-full" style={{ tableLayout: "fixed" }}>
          <thead>
            <tr className="bg-[#f7f8fa] text-[#8f959e]">
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
              <th className="px-1.5 py-2 text-left font-normal w-[220px]">客户信息</th>
              <th className="px-1.5 py-2 text-left font-normal w-[220px]">跟进点</th>
              <th className="px-1.5 py-2 text-left font-normal w-[220px]">组长反馈</th>
              <th className="px-1.5 py-2 text-left font-normal w-[74px]">所属组长</th>
              <th className="px-1.5 py-2 text-center font-normal w-[68px] sticky right-0 bg-[#f7f8fa] z-10 relative before:content-[''] before:absolute before:top-0 before:bottom-0 before:-left-2 before:w-2 before:[background:linear-gradient(to_left,rgba(0,0,0,0.02),transparent)]">操作</th>
            </tr>
          </thead>
          <tbody className="[&_tr:first-child>td]:pt-[12px] [&_tr:last-child>td]:pb-[6px]">
            {displayRows.map((row, idx) => {
              const status = rowStatus[row.key] || "idle"
              // 找到上方最近的组长行
              const leaderRow = row.is_leader ? null : displayRows.slice(0, idx).reverse().find(r => r.is_leader)
              const isChanged = displayChangedKeys.includes(row.key)
              return (
                <tr
                  key={row.key}
                  className={`hover:bg-[#fafbfc] ${dragOverKey === row.key ? "border-t-2 border-t-[#3370ff]" : ""} ${isChanged ? "bg-[#fff8e6]" : ""}`}
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
                  <td className={`px-1.5 py-1.5 text-center ${isCellChanged(row.key, "arrived") ? "bg-[#f5eeff] rounded" : ""}`}>
                    <input
                      type="checkbox"
                      checked={row.arrived}
                      onChange={(e) => updateRow(row.key, "arrived", e.target.checked)}
                      className="h-3.5 w-3.5 appearance-none border border-[#e8eaed] rounded-[2px] bg-white checked:bg-white checked:border-[#6b9dff] checked:bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2012%2012%22%3E%3Cpath%20fill%3D%22none%22%20stroke%3D%22%236b9dff%22%20stroke-width%3D%221.5%22%20d%3D%22M3%206l2%202%204-4%22%2F%3E%3C%2Fsvg%3E')] bg-center bg-no-repeat cursor-pointer"
                    />
                  </td>
                  <td className={`pl-2 pr-[10px] py-1.5 w-[64px] ${isCellChanged(row.key, "is_leader") ? "bg-[#f5eeff] rounded" : ""}`}>
                    <SelectDropdown rounded="[2px]"
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
                  <td className={`pl-0 pr-2.5 py-1.5 ${isCellChanged(row.key, "visit_time") ? "bg-[#f5eeff] rounded" : ""}`}>
                    <input
                      type="time"
                      value={row.visit_time}
                      onChange={(e) => updateRow(row.key, "visit_time", e.target.value)}
                      className={`h-7 text-[12px] w-[56px] time-no-icon rounded-[2px] border-[0.5px] border-[#e8eaed] bg-transparent px-2 outline-none focus:border-[#3370ff] ${!row.visit_time ? "text-[#c9cdd4]" : "text-[#2b2f36]"}`}
                    />
                  </td>
                  <td className={`pl-0 pr-1.5 py-1.5 ${isCellChanged(row.key, "nickname") || isCellChanged(row.key, "customer_id") ? "bg-[#f5eeff] rounded" : ""}`}>
                    <CustomerSearchInput rounded="2px"
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
                  <td className={`px-1.5 py-1.5 ${isCellChanged(row.key, "needs") ? "bg-[#f5eeff] rounded" : ""}`}>
                    <textarea
                      value={row.needs}
                      onChange={(e) => updateRow(row.key, "needs", e.target.value)}
                      className="w-full h-7 text-[12px] border-[0.5px] border-[#e8eaed] rounded-[2px] px-2 py-1 resize-none leading-5"
                      rows={1}
                    />
                  </td>
                  <td className={`px-1.5 py-1.5 ${isCellChanged(row.key, "referrer_handler") ? "bg-[#f5eeff] rounded" : ""}`}>
                    <CustomerSearchInput rounded="2px"
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
                  <td className={`px-1.5 py-1.5 ${isCellChanged(row.key, "feedback") ? "bg-[#f5eeff] rounded" : ""}`}>
                    <textarea
                      value={row.feedback}
                      onChange={(e) => updateRow(row.key, "feedback", e.target.value)}
                      className="w-full h-7 text-[12px] border-[0.5px] border-[#e8eaed] rounded-[2px] px-2 py-1 resize-none leading-5"
                      rows={1}
                    />
                  </td>
                  <td className={`px-1.5 py-1.5 ${isCellChanged(row.key, "healing_notes") ? "bg-[#f5eeff] rounded" : ""}`}>
                    <textarea
                      value={row.healing_notes}
                      onChange={(e) => updateRow(row.key, "healing_notes", e.target.value)}
                      className="w-full h-7 text-[12px] border-[0.5px] border-[#e8eaed] rounded-[2px] px-2 py-1 resize-none leading-5"
                      rows={1}
                    />
                  </td>
                  <td className={`px-1.5 py-1.5 ${isCellChanged(row.key, "group_leader_feedback") ? "bg-[#f5eeff] rounded" : ""}`}>
                    <textarea
                      value={row.group_leader_feedback}
                      onChange={(e) => updateRow(row.key, "group_leader_feedback", e.target.value)}
                      className="w-full h-7 text-[12px] border-[0.5px] border-[#e8eaed] rounded-[2px] px-2 py-1 resize-none leading-5"
                      rows={1}
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
                          <Edit className="h-3.5 w-3.5" />
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

      <div className="px-3 py-2.5 border-t border-[#f0f1f2] flex items-center">
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
