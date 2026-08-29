import { useState, useCallback, useRef, useEffect, useLayoutEffect, useMemo } from "react"
import { Plus, Trash2, FileText, GripVertical, Edit, CalendarX2, CalendarSync, ChevronDown, ChevronUp, Info } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { visitApi, visitNoteApi, membershipCardApi, consumptionRecordsApi, type CustomerLight, type MembershipCard, type VisitNote } from "@/lib/api"
import { CustomerSearchInput } from "@/components/customer-search-input"
import { SelectDropdown } from "@/components/select-dropdown"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { HorizontalScrollbar } from "@/components/horizontal-scrollbar"
import { VisitNoteCell } from "@/components/visits/visit-note-cell"
import { useEditPermissions } from "@/hooks/use-edit-permissions"
import { createTableDragPreview } from "@/lib/table-drag-preview"

interface Row {
  key: number
  visit_id: string
  created_by_id: string
  created_by: string
  visit_time: string
  customer_id: string
  nickname: string
  member_type: string
  remaining_count: number | null
  is_leader: boolean
  needs: string
  referrer_handler: string
  arrived: boolean
  cancelled: boolean
  feedback: string
  healing_notes: string
  activities: string
}

let nextKey = 1

function emptyRow(): Row {
  return { key: nextKey++, visit_id: "", created_by_id: "", created_by: "", visit_time: "", customer_id: "", nickname: "", member_type: "", remaining_count: null, is_leader: false, needs: "", referrer_handler: "", arrived: false, cancelled: false, feedback: "", healing_notes: "", activities: "" }
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
type ViewSegment = "all" | "mine"

interface BatchInputTableProps {
  date: string
  customers: CustomerLight[]
  spaceId?: string
  refreshKey?: number
  onSaved: () => void
  onSavedCountChange?: (count: number) => void
  onSavingCountChange?: (count: number) => void
  onCustomerClick?: (customerId: string) => void
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
  toolbarLeading?: React.ReactNode
  toolbarTrailing?: React.ReactNode
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

type LongTextField = "needs" | "feedback" | "healing_notes"

const LONG_TEXT_LABELS: Record<LongTextField, string> = {
  needs: "来访需求",
  feedback: "客户信息",
  healing_notes: "跟进点",
}

const VISIT_CREATOR_ONLY_FIELDS = new Set<keyof Row>([
  "customer_id",
  "nickname",
  "visit_time",
  "needs",
  "referrer_handler",
])

const VISIT_COLUMN_WIDTHS = [24, 36, 64, 64, 78, 80, 64, 207, 203, 203, 60, 60, 74, 74, 76, 76] as const

export function BatchInputTable({ date, customers, spaceId, refreshKey, onSaved, onSavedCountChange, onSavingCountChange, onCustomerClick, onActivityClick, onCreateCustomer, onUndoRedoChange, onRestoreRef, onCaptureRef, onHistoryPushed, previewRows, previewChangedKeys, previewChangedCells, locked, onClosePreview, toolbarLeading, toolbarTrailing }: BatchInputTableProps) {
  const [rows, setRows] = useState<Row[]>(initRows)
  const [rowStatus, setRowStatus] = useState<Record<number, RowStatus>>({})
  const [savedCount, setSavedCount] = useState(0)
  const [deleteKey, setDeleteKey] = useState<number | null>(null)
  const [dailyTotals, setDailyTotals] = useState<Record<string, number>>({})
  const [notesByVisitId, setNotesByVisitId] = useState<Record<string, VisitNote[]>>({})
  const [dragOverKey, setDragOverKey] = useState<number | null>(null)
  const [draggingKey, setDraggingKey] = useState<number | null>(null)
  const dragKeyRef = useRef<number | null>(null)
  const dragPreviewRef = useRef<HTMLDivElement | null>(null)
  const headerScrollRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const pendingScrollToBottomRef = useRef(false)
  const [editor, setEditor] = useState<{ key: number; field: LongTextField; label: string; nickname: string } | null>(null)
  const [editorValue, setEditorValue] = useState("")
  const cardsRef = useRef<MembershipCard[]>([])
  useEffect(() => () => {
    dragPreviewRef.current?.remove()
    dragPreviewRef.current = null
  }, [])
  const currentUser = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("currentUser") || "{}") }
    catch { return {} }
  }, [])
  const currentActorId = String(currentUser.id || "")
  const currentActorName = String(currentUser.owner || currentUser.username || "")
  const editPermissions = useEditPermissions()
  const canEditAllVisits = currentUser.role === "超级管理员" || editPermissions.visits === "all"
  const [viewSegment, setViewSegment] = useState<ViewSegment>(() => {
    try { return localStorage.getItem("visit_view_segment") === "mine" ? "mine" : "all" }
    catch { return "all" }
  })
  const [needsExpanded, setNeedsExpanded] = useState(false)
  const isOwnRow = useCallback((row: Row) => {
    if (!row.visit_id) return true
    if (row.created_by_id) return Boolean(currentActorId && row.created_by_id === currentActorId)
    return Boolean(row.created_by && currentActorName && row.created_by === currentActorName)
  }, [currentActorId, currentActorName])
  const canEditRow = useCallback((row: Row) => (
    canEditAllVisits || isOwnRow(row)
  ), [canEditAllVisits, isOwnRow])
  const canEditField = useCallback((row: Row, field: keyof Row) => (
    canEditRow(row) || !VISIT_CREATOR_ONLY_FIELDS.has(field)
  ), [canEditRow])

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
  const allDisplayRows = previewRows || rows
  const mineDisplayRows = useMemo(
    () => allDisplayRows.filter(isOwnRow),
    [allDisplayRows, isOwnRow],
  )
  const displayRows = viewSegment === "mine" ? mineDisplayRows : allDisplayRows
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

  useEffect(() => {
    try { localStorage.setItem("visit_view_segment", viewSegment) } catch {}
  }, [viewSegment])

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
        setNotesByVisitId({})
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
          created_by_id: v.created_by_id || "",
          created_by: v.created_by || "",
          visit_time: v.visit_time || "",
          customer_id: v.customer_id,
          nickname: v.nickname,
          member_type: v.member_type || "",
          remaining_count: v.remaining_count ?? null,
          is_leader: v.is_leader || false,
          needs: v.needs || "",
          referrer_handler: v.referrer_handler || "",
          arrived: v.arrived,
          cancelled: v.cancelled,
          feedback: v.feedback || "",
          healing_notes: v.healing_notes || "",
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
      visitNoteApi.listByVisits(visits.map((visit) => visit.id)).then((notes) => {
        if (cancelled) return
        const grouped: Record<string, VisitNote[]> = {}
        for (const note of notes) {
          if (!grouped[note.visit_id]) grouped[note.visit_id] = []
          grouped[note.visit_id].push(note)
        }
        setNotesByVisitId(grouped)
      }).catch(() => {})
    }).catch((err) => { console.error("[BATCH] 加载失败:", err) })
    return () => { cancelled = true }
  }, [date, spaceId])

  const saveRow = useCallback(async (row: Row) => {
    const existingId = savedVisitIds.current[row.key]

    if (row.cancelled) return

    setRowStatus(prev => ({ ...prev, [row.key]: "saving" }))

    try {
      if (existingId) {
        const result = await visitApi.update(existingId, {
          is_leader: row.is_leader,
          arrived: row.arrived,
          arrival_time: row.arrived ? row.visit_time : "",
          ...(canEditRow(row) ? {
            customer_id: row.customer_id,
            visit_time: row.visit_time || "",
            needs: row.needs,
            referrer_handler: row.referrer_handler,
          } : {}),
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
          space_id: spaceId || undefined,
        }
        const result = await visitApi.create(payload)
        if (result?.id) {
          savedVisitIds.current[row.key] = result.id
          setRows(prev => prev.map(r => r.key === row.key ? {
            ...r,
            visit_id: result.id,
            created_by_id: result.created_by_id || currentActorId,
            created_by: result.created_by || currentActorName,
          } : r))
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
  }, [date, spaceId, onSaved, canEditRow, currentActorId, currentActorName])

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
    visit_time: "到店时间", nickname: "昵称", member_type: "会员身份",
    is_leader: "组长", needs: "来访需求", referrer_handler: "引流处理",
    arrived: "到店状态", feedback: "客户信息", healing_notes: "跟进点",
  }

  const updateRow = useCallback((key: number, field: keyof Row, value: any) => {
    const row = rowsRef.current.find(r => r.key === key)
    if (!row || row.cancelled || !canEditField(row, field)) return
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
  }, [rowStatus, scheduleSave, pushEditHistory, canEditField])

  const openEditor = (row: Row, field: LongTextField) => {
    if (!canEditField(row, field)) return
    setEditor({ key: row.key, field, label: LONG_TEXT_LABELS[field], nickname: row.nickname || "未命名" })
    setEditorValue(row[field])
  }

  const saveEditor = () => {
    if (!editor) return
    updateRow(editor.key, editor.field, editorValue)
    setEditor(null)
  }

  const cancelVisit = useCallback(async (row: Row) => {
    const visitId = savedVisitIds.current[row.key]
    if (!visitId || row.arrived || row.cancelled || !canEditRow(row)) return
    if (timersRef.current[row.key]) {
      clearTimeout(timersRef.current[row.key])
      delete timersRef.current[row.key]
    }
    setRowStatus(prev => ({ ...prev, [row.key]: "saving" }))
    try {
      await visitApi.update(visitId, { cancelled: true })
      setRows(prev => {
        const updated = prev.map(item => item.key === row.key
          ? { ...item, arrived: false, cancelled: true }
          : item)
        // 已取消的行移到末尾，未取消保持相对顺序
        return [...updated.filter(r => !r.cancelled), ...updated.filter(r => r.cancelled)]
      })
      setRowStatus(prev => ({ ...prev, [row.key]: "saved" }))
      pushHistory("取消了邀约", [row.key], `取消了「${row.nickname || "未命名"}」的邀约`, undefined, [{ rowKey: row.key, fields: ["cancelled"] }])
      onSaved()
    } catch (error) {
      setRowStatus(prev => ({ ...prev, [row.key]: "error" }))
      window.alert(error instanceof Error ? error.message : "取消邀约失败")
    }
  }, [onSaved, pushHistory, canEditRow])

  const restoreVisit = useCallback(async (row: Row) => {
    const visitId = savedVisitIds.current[row.key]
    if (!visitId || !row.cancelled || !canEditRow(row)) return
    setRowStatus(prev => ({ ...prev, [row.key]: "saving" }))
    try {
      await visitApi.update(visitId, { cancelled: false })
      setRows(prev => {
        const updated = prev.map(item => item.key === row.key
          ? { ...item, cancelled: false }
          : item)
        // 恢复后回到未取消区域，已取消的仍排在末尾
        return [...updated.filter(r => !r.cancelled), ...updated.filter(r => r.cancelled)]
      })
      setRowStatus(prev => ({ ...prev, [row.key]: "saved" }))
      pushHistory("恢复了邀约", [row.key], `恢复了「${row.nickname || "未命名"}」的邀约`, undefined, [{ rowKey: row.key, fields: ["cancelled"] }])
      onSaved()
    } catch (error) {
      setRowStatus(prev => ({ ...prev, [row.key]: "error" }))
      window.alert(error instanceof Error ? error.message : "恢复邀约失败")
    }
  }, [onSaved, pushHistory, canEditRow])

  const removeRow = useCallback(async (key: number) => {
    const row = rowsRef.current.find(r => r.key === key)
    if (!row || !canEditRow(row)) return
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
  }, [date, spaceId, onSaved, canEditRow])

  const addRow = useCallback(async () => {
    const row = emptyRow()
    const allFields = Object.keys(row).filter(k => k !== "key") as string[]
    pushHistory("新增了人员", undefined, undefined, undefined, [{ rowKey: row.key, fields: allFields }])
    pendingScrollToBottomRef.current = true
    setRows(prev => [...prev, row])
    try { await saveRow(row) } catch { /* saveRow handles its own errors */ }
  }, [saveRow, pushHistory])

  useLayoutEffect(() => {
    if (!pendingScrollToBottomRef.current) return
    pendingScrollToBottomRef.current = false
    const scrollContainer = scrollRef.current
    if (!scrollContainer) return
    scrollContainer.scrollTo({ top: scrollContainer.scrollHeight, behavior: "smooth" })
  }, [rows.length])

  const handleTableScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const header = headerScrollRef.current
    if (header && header.scrollLeft !== event.currentTarget.scrollLeft) {
      header.scrollLeft = event.currentTarget.scrollLeft
    }
  }, [])

  const resetDragState = useCallback(() => {
    dragKeyRef.current = null
    setDraggingKey(null)
    setDragOverKey(null)
    dragPreviewRef.current?.remove()
    dragPreviewRef.current = null
  }, [])

  const handleDragStart = useCallback((e: React.DragEvent<HTMLTableCellElement>, key: number) => {
    const row = rowsRef.current.find(r => r.key === key)
    if (!row || row.cancelled) return
    dragKeyRef.current = key
    setDraggingKey(key)
    e.dataTransfer.effectAllowed = "move"
    e.dataTransfer.setData("text/plain", `visit:${key}`)
    dragPreviewRef.current?.remove()
    const preview = createTableDragPreview({
      leading: row.member_type || "邀约",
      title: row.nickname || "未命名邀约",
      trailing: row.visit_time || "时间未设置",
    })
    dragPreviewRef.current = preview
    e.dataTransfer.setDragImage(preview, 20, 19)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, key: number) => {
    e.preventDefault()
    if (dragKeyRef.current !== key) setDragOverKey(key)
  }, [])

  const handleDragEnd = useCallback(() => { resetDragState() }, [resetDragState])

  const handleDrop = useCallback((targetKey: number) => {
    const sourceKey = dragKeyRef.current
    if (sourceKey === null || sourceKey === targetKey) { resetDragState(); return }
    const sourceRow = rowsRef.current.find(r => r.key === sourceKey)
    if (!sourceRow || sourceRow.cancelled) {
      resetDragState()
      return
    }
    const visibleRows = viewSegment === "mine"
      ? rowsRef.current.filter(isOwnRow)
      : rowsRef.current
    const sourceIndex = visibleRows.findIndex(row => row.key === sourceKey)
    const targetIndex = visibleRows.findIndex(row => row.key === targetKey)
    if (sourceIndex === -1 || targetIndex === -1) { resetDragState(); return }
    const subject = sourceRow.nickname || "未命名邀约"
    pushHistory(
      "调整了人员顺序",
      undefined,
      `将「${subject}」从第 ${sourceIndex + 1} 位移动到第 ${targetIndex + 1} 位`,
    )
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
        visitApi.reorder(ids, {
          movedName: subject,
          fromPosition: sourceIndex + 1,
          toPosition: targetIndex + 1,
          date,
          spaceId: spaceId || "",
        }).catch(e => console.error("保存排序失败:", e))
      }
      return next
    })
    resetDragState()
  }, [date, spaceId, pushHistory, viewSegment, isOwnRow, resetDragState])

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
    <div className={`relative flex min-h-0 flex-1 flex-col rounded-lg bg-white ${isLocked ? "visit-table-locked" : ""}`}>
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
      <div className="flex h-10 shrink-0 items-center gap-3 border-b border-[#f0f0f0] px-3.5">
        {toolbarLeading && (
          <>
            <div className="flex shrink-0 items-center gap-2">{toolbarLeading}</div>
            <span className="h-3.5 w-px shrink-0 bg-[#e8eaed]" aria-hidden="true" />
          </>
        )}
        <div className="flex items-center gap-1.5" aria-label="邀约记录范围">
          <button
            type="button"
            onClick={() => setViewSegment("all")}
            className={`h-7 rounded-full px-3 text-[12px] transition-colors ${viewSegment === "all" ? "bg-[#1f2329] text-white" : "border-[0.5px] border-[#e1e4e7] bg-white text-[#646a73] hover:bg-[#f7f8fa]"}`}
          >
            全部 {allDisplayRows.length}
          </button>
          <button
            type="button"
            onClick={() => setViewSegment("mine")}
            className={`h-7 rounded-full px-3 text-[12px] transition-colors ${viewSegment === "mine" ? "bg-[#1f2329] text-white" : "border-[0.5px] border-[#e1e4e7] bg-white text-[#646a73] hover:bg-[#f7f8fa]"}`}
          >
            我录入的 {mineDisplayRows.length}
          </button>
        </div>
        <Tooltip>
          <TooltipTrigger
            render={
              <button type="button" className="hidden shrink-0 items-center gap-1 text-[12px] text-[#8f959e] min-[1100px]:inline-flex">
                仅创建人可编辑
                <Info className="h-3.5 w-3.5" />
              </button>
            }
          />
          <TooltipContent>昵称、邀约人、时间、来访需求及取消/删除仅创建人可操作</TooltipContent>
        </Tooltip>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <button
            type="button"
            className="flex h-[22px] shrink-0 items-center gap-0.5 rounded border-[0.5px] border-[#d0d3d6] px-2 text-[11px] text-[#8f959e] hover:bg-[#f5f6f7] hover:text-[#4e535a]"
            onClick={() => setNeedsExpanded((expanded) => !expanded)}
            aria-expanded={needsExpanded}
            aria-label={needsExpanded ? "缩略来访需求、客户信息和跟进点" : "展开来访需求、客户信息和跟进点"}
          >
            {needsExpanded ? "缩略" : "展开"}
            {needsExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {toolbarTrailing}
        </div>
      </div>
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <div ref={headerScrollRef} className="shrink-0 overflow-hidden">
          <div className="min-w-[1444px]">
            <table className="w-full text-[12px]" style={{ tableLayout: "fixed" }}>
              <colgroup>
                {VISIT_COLUMN_WIDTHS.map((width, index) => <col key={index} style={{ width }} />)}
              </colgroup>
          <thead className="bg-[#f7f8fa]">
            <tr className="bg-[#f7f8fa] text-[#8f959e]">
              <th className="bg-[#f7f8fa]"></th>
              <th className="bg-[#f7f8fa] px-1.5 py-2 text-center font-normal">到店</th>
              <th className="bg-[#f7f8fa] py-2 pl-2 pr-[10px] text-left font-normal">组长</th>
              <th className="bg-[#f7f8fa] py-2 pl-0 pr-2.5 text-left font-normal">时间</th>
              <th className="bg-[#f7f8fa] py-2 pl-0 pr-1.5 text-left font-normal">昵称</th>
              <th className="bg-[#f7f8fa] px-1.5 py-2 text-left font-normal">会员身份</th>
              <th className="bg-[#f7f8fa] px-1.5 py-2 text-left font-normal">剩余次数</th>
              <th className="bg-[#f7f8fa] px-1.5 py-2 text-left font-normal">来访需求</th>
              <th className="bg-[#f7f8fa] px-1.5 py-2 text-left font-normal">客户信息</th>
              <th className="bg-[#f7f8fa] px-1.5 py-2 text-left font-normal">跟进点</th>
              <th className="bg-[#f7f8fa] px-1.5 py-2 text-left font-normal">参与活动</th>
              <th className="bg-[#f7f8fa] px-1.5 py-2 text-left font-normal">今日成交</th>
              <th className="bg-[#f7f8fa] px-1.5 py-2 text-left font-normal">邀约人</th>
              <th className="bg-[#f7f8fa] px-1.5 py-2 text-left font-normal">所属组长</th>
              <th className="bg-[#f7f8fa] px-1.5 py-2 text-left font-normal">创建人</th>
              <th className="sticky right-0 z-20 bg-[#f7f8fa] px-1.5 py-2 text-center font-normal">操作</th>
            </tr>
          </thead>
            </table>
          </div>
        </div>
        <div ref={scrollRef} onScroll={handleTableScroll} className="min-h-0 flex-1 overflow-auto overscroll-contain scrollbar-hide">
          <div className="min-w-[1444px]">
            <table className="w-full text-[12px]" style={{ tableLayout: "fixed" }}>
              <colgroup>
                {VISIT_COLUMN_WIDTHS.map((width, index) => <col key={index} style={{ width }} />)}
              </colgroup>
          <tbody className="[&_tr:first-child>td]:pt-[12px] [&_tr:last-child>td]:pb-[6px]">
            {displayRows.map((row, idx) => {
              const status = rowStatus[row.key] || "idle"
              // 找到上方最近的组长行
              const leaderRow = row.is_leader ? null : displayRows.slice(0, idx).reverse().find(r => r.is_leader)
              const isChanged = displayChangedKeys.includes(row.key)
              const rowReadOnly = !canEditRow(row)
              const creatorName = row.visit_id ? row.created_by || "未记录" : "待保存"
              return (
                <tr
                  key={row.key}
                  className={`hover:bg-[#fafbfc] ${dragOverKey === row.key ? "[&>td]:shadow-[inset_0_2px_0_#3370ff]" : ""} ${draggingKey === row.key ? "bg-[#f7f8fa] opacity-60" : ""} ${isChanged ? "bg-[#fff8e6]" : ""} ${row.cancelled ? "[&>td:not(:last-child)]:opacity-55 bg-[#fafbfc]" : ""} transition-opacity`}
                  onDragOver={(e) => handleDragOver(e, row.key)}
                  onDrop={() => handleDrop(row.key)}
                >
                  <td
                    className={`px-0.5 py-1.5 text-center ${row.cancelled ? "cursor-not-allowed" : "cursor-grab active:cursor-grabbing"}`}
                    draggable={!row.cancelled}
                    onDragStart={(e) => handleDragStart(e, row.key)}
                    onDragEnd={handleDragEnd}
                  >
                    <GripVertical className="h-3.5 w-3.5 text-[#c9cdd4] mx-auto" />
                  </td>
                  <td className={`px-1.5 py-1.5 text-center ${isCellChanged(row.key, "arrived") ? "bg-[#f5eeff] rounded" : ""}`}>
                    <input
                      type="checkbox"
                      checked={row.arrived}
                      disabled={row.cancelled}
                      onChange={(e) => updateRow(row.key, "arrived", e.target.checked)}
                      aria-label={`${row.nickname || "客户"}是否到店`}
                      className="h-3.5 w-3.5 appearance-none border border-[#e8eaed] rounded-[2px] bg-white checked:bg-white checked:border-[#6b9dff] checked:bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2012%2012%22%3E%3Cpath%20fill%3D%22none%22%20stroke%3D%22%236b9dff%22%20stroke-width%3D%221.5%22%20d%3D%22M3%206l2%202%204-4%22%2F%3E%3C%2Fsvg%3E')] bg-center bg-no-repeat cursor-pointer disabled:cursor-not-allowed"
                    />
                  </td>
                  <td className={`pl-2 pr-[10px] py-1.5 w-[64px] ${isCellChanged(row.key, "is_leader") ? "bg-[#f5eeff] rounded" : ""}`}>
                    <SelectDropdown rounded="[2px]"
                      size="sm"
                      value={row.is_leader ? "1" : "0"}
                      options={[{ value: "0", label: "-" }, { value: "1", label: "组长" }]}
                      onChange={(v) => updateRow(row.key, "is_leader", v === "1")}
                      disabled={row.cancelled}
                      placeholder="-"
                      hideChevron
                      className="[&_button]:border-[0.5px] [&_button]:text-[12px]"
                      textColor={row.is_leader ? undefined : "text-[#c9cdd4]"}
                    />
                  </td>
                  <td className={`pl-0 pr-2.5 py-1.5 ${isCellChanged(row.key, "visit_time") ? "bg-[#f5eeff] rounded" : ""}`}>
                    {rowReadOnly ? (
                      <span className={`inline-flex h-7 items-center text-[12px] tabular-nums ${row.visit_time ? "text-[#2b2f36]" : "text-[#c9cdd4]"}`}>
                        {row.visit_time || "-"}
                      </span>
                    ) : (
                      <input
                        type="time"
                        value={row.visit_time}
                        disabled={row.cancelled}
                        onChange={(e) => updateRow(row.key, "visit_time", e.target.value)}
                        className={`h-7 text-[12px] w-[56px] time-no-icon rounded-[2px] border-[0.5px] border-[#e8eaed] bg-transparent px-2 outline-none focus:border-[#3370ff] ${!row.visit_time ? "text-[#c9cdd4]" : "text-[#2b2f36]"}`}
                      />
                    )}
                  </td>
                  <td className={`pl-0 pr-1.5 py-1.5 ${isCellChanged(row.key, "nickname") || isCellChanged(row.key, "customer_id") ? "bg-[#f5eeff] rounded" : ""}`}>
                    {rowReadOnly ? (
                      <span className={`inline-flex h-7 w-full items-center truncate text-[12px] ${row.nickname ? "text-[#2b2f36]" : "text-[#c9cdd4]"}`} title={row.nickname}>
                        {row.nickname || "-"}
                      </span>
                    ) : (
                      <CustomerSearchInput rounded="2px"
                        customers={customers as any[]}
                        value={row.nickname}
                        disabled={row.cancelled}
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
                    )}
                  </td>
                  <td className="px-1.5 py-1.5">
                    <span className="inline-block max-w-[80px] overflow-hidden text-ellipsis whitespace-nowrap text-[12px] text-[#2b2f36]">{row.member_type}</span>
                  </td>
                  <td className="px-1.5 py-1.5">
                    <span className={`text-[12px] ${row.remaining_count !== null && row.remaining_count < 0 && row.remaining_count !== -999 ? "text-[#e02020]" : "text-[#2b2f36]"}`}>{row.nickname ? formatRemaining(row.remaining_count) : ""}</span>
                  </td>
                  <td className={`px-1.5 py-1.5 ${isCellChanged(row.key, "needs") ? "bg-[#f5eeff] rounded" : ""}`}>
                    {rowReadOnly ? (
                      <span
                        className={`flex min-h-7 w-full min-w-0 text-[12px] ${needsExpanded ? "items-start whitespace-pre-wrap break-words py-1" : "h-7 items-center"} ${row.needs ? "text-[#2b2f36]" : "text-[#c9cdd4]"}`}
                        title={needsExpanded ? undefined : row.needs}
                      >
                        {needsExpanded ? (
                          row.needs || "-"
                        ) : (
                          <span className="block w-full min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                            {row.needs.replace(/\s+/g, " ").trim() || "-"}
                          </span>
                        )}
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={row.cancelled}
                        onClick={() => openEditor(row, "needs")}
                        className={`flex min-h-7 w-full gap-1 px-2 text-left text-[12px] border-[0.5px] border-[#e8eaed] rounded-[2px] ${needsExpanded ? "items-start py-1" : "h-7 items-center"} ${row.cancelled ? "cursor-not-allowed" : "cursor-pointer hover:border-[#3370ff]"} ${row.needs ? "text-[#2b2f36]" : "text-[#c9cdd4]"}`}
                        title={needsExpanded ? undefined : row.needs}
                      >
                        <span className={`block min-w-0 flex-1 ${needsExpanded ? "whitespace-pre-wrap break-words" : "overflow-hidden text-ellipsis whitespace-nowrap"}`}>
                          {needsExpanded ? row.needs : row.needs.replace(/\s+/g, " ").trim()}
                        </span>
                        <Edit className={`h-3 w-3 shrink-0 text-[#c9cdd4] ${needsExpanded ? "mt-0.5" : ""}`} />
                      </button>
                    )}
                  </td>
                  <td className={`px-1.5 py-1.5 ${isCellChanged(row.key, "feedback") ? "bg-[#f5eeff] rounded" : ""}`}>
                    <VisitNoteCell
                      visitId={row.visit_id}
                      nickname={row.nickname}
                      title="客户信息"
                      category="customer_info"
                      notes={notesByVisitId[row.visit_id] || []}
                      disabled={row.cancelled}
                      expanded={needsExpanded}
                      onNotesChange={(notes) => setNotesByVisitId((previous) => ({ ...previous, [row.visit_id]: notes }))}
                    />
                  </td>
                  <td className={`px-1.5 py-1.5 ${isCellChanged(row.key, "healing_notes") ? "bg-[#f5eeff] rounded" : ""}`}>
                    <VisitNoteCell
                      visitId={row.visit_id}
                      nickname={row.nickname}
                      title="跟进点"
                      category="follow_up"
                      notes={notesByVisitId[row.visit_id] || []}
                      disabled={row.cancelled}
                      expanded={needsExpanded}
                      onNotesChange={(notes) => setNotesByVisitId((previous) => ({ ...previous, [row.visit_id]: notes }))}
                    />
                  </td>
                  <td className="px-1.5 py-1.5 text-left">
                    {row.activities && row.customer_id ? (
                      <button
                        onClick={() => onActivityClick?.(row.customer_id)}
                        className="text-[12px] text-[#2b2f36] hover:underline"
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
                  <td className={`px-1.5 py-1.5 ${isCellChanged(row.key, "referrer_handler") ? "bg-[#f5eeff] rounded" : ""}`}>
                    {rowReadOnly ? (
                      <span className={`inline-flex h-7 w-full items-center truncate text-[12px] ${row.referrer_handler ? "text-[#2b2f36]" : "text-[#c9cdd4]"}`} title={row.referrer_handler}>
                        {row.referrer_handler || "-"}
                      </span>
                    ) : (
                      <CustomerSearchInput rounded="2px"
                        customers={customers as any[]}
                        value={row.referrer_handler}
                        disabled={row.cancelled}
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
                    )}
                  </td>
                  <td className="px-1.5 py-1.5">
                    <span className="text-[12px] text-[#8f959e]">{leaderRow?.nickname || ""}</span>
                  </td>
                  <td className="px-1.5 py-1.5">
                    <span
                      className={`block truncate text-[12px] ${row.created_by ? "text-[#8f959e]" : "text-[#c9cdd4]"}`}
                      title={creatorName}
                    >
                      {creatorName}
                    </span>
                  </td>
                  <td className="sticky right-0 z-20 bg-white px-1.5 py-1.5 text-center">
                    <div className="flex items-center justify-center gap-1">
                      {!rowReadOnly && (row.cancelled || (!row.arrived && Boolean(row.visit_id))) && (
                        <>
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <button
                                  onClick={() => row.cancelled ? restoreVisit(row) : cancelVisit(row)}
                                  className="inline-flex h-5 w-5 items-center justify-center text-[#8f959e] hover:text-[#3370ff]"
                                  aria-label={row.cancelled ? "恢复" : "取消"}
                                >
                                  {row.cancelled
                                    ? <CalendarSync className="h-3.5 w-3.5" />
                                    : <CalendarX2 className="h-3.5 w-3.5" />}
                                </button>
                              }
                            />
                            <TooltipContent>{row.cancelled ? "恢复" : "取消"}</TooltipContent>
                          </Tooltip>
                          <span className="h-3 w-px shrink-0 bg-[#d0d3d6]" aria-hidden="true" />
                        </>
                      )}
                      {row.customer_id && (
                        <>
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <button
                                  onClick={() => onCustomerClick?.(row.customer_id)}
                                  className="inline-flex h-5 w-5 items-center justify-center text-[#8f959e] hover:text-[#3370ff]"
                                  aria-label="详情"
                                >
                                  <FileText className="h-3.5 w-3.5" />
                                </button>
                              }
                            />
                            <TooltipContent>详情</TooltipContent>
                          </Tooltip>
                        </>
                      )}
                      {!rowReadOnly && (
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <button
                                onClick={() => setDeleteKey(row.key)}
                                className="inline-flex h-5 w-5 items-center justify-center text-[#8f959e] hover:text-[#e02020]"
                                aria-label="删除"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            }
                          />
                          <TooltipContent>删除</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        </div>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-px right-[76px] top-px z-30 w-3 bg-[linear-gradient(to_right,transparent,rgba(31,35,41,0.08))]"
        >
          <span className="absolute inset-y-0 right-0 w-px bg-[#dfe2e6]" />
        </div>
      </div>
      </div>

      <HorizontalScrollbar scrollRef={scrollRef} />

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

      <Dialog open={editor !== null} onOpenChange={(open) => { if (!open) setEditor(null) }}>
        <DialogContent className="max-w-md p-0 gap-0" initialFocus={false}>
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-[15px]">{editor ? `${editor.nickname} — ${editor.label}` : ""}</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5">
            <textarea
              value={editorValue}
              onChange={(e) => setEditorValue(e.target.value)}
              className="w-full min-h-[200px] px-3 py-2 rounded-md border border-input text-[12px] resize-none"
              placeholder={editor ? `输入${editor.label}...` : ""}
            />
          </div>
          <div className="flex justify-end gap-2 px-6 pb-5 pt-2">
            <Button variant="outline" size="sm" onClick={() => setEditor(null)}>取消</Button>
            <Button size="sm" onClick={saveEditor}>保存</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
