import { useState, useCallback, useRef, useEffect, useLayoutEffect, useMemo } from "react"
import { GripVertical, Trash2, Plus, Info } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { HorizontalScrollbar } from "@/components/horizontal-scrollbar"
import {
  classRecordApi, groupCaseSessionApi, emotionalReleaseSessionApi,
  energyKnotSessionApi, internalCourseSessionApi,
  courseTypeApi, activityOrderApi,
  type CustomerLight, type Space, type MemberIdentity, type CourseType,
} from "@/lib/api"
import { CustomerSearchInput } from "@/components/customer-search-input"
import { SelectDropdown } from "@/components/select-dropdown"
import { ACTIVITY_POSITION_MAP } from "@/lib/positions"
import { SpaceRoomDropdown } from "@/components/space-room-dropdown"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { CardCallbacks } from "./index"
import { useEditPermissions } from "@/hooks/use-edit-permissions"

type ActivityType = "class" | "gcs" | "ers" | "eks" | "ics"

const TYPE_NAMES: Record<ActivityType, string> = {
  class: "沙龙", gcs: "觉醒游戏", ers: "情绪释放", eks: "能量结", ics: "内部课程",
}

function parseEksDescription(desc: string): { id: string; name: string; count: number } {
  try {
    const items = JSON.parse(desc || "[]")
    if (Array.isArray(items) && items.length > 0) {
      const c = items[0].count
      return { id: items[0].id || "", name: items[0].name || "", count: (c != null && !isNaN(c)) ? Math.max(1, c) : 2 }
    }
  } catch {}
  return { id: "", name: "", count: 2 }
}

function serializeEksDescription(id: string, name: string, count: number): string {
  return JSON.stringify([{ id: id || "", name: name || "", count }])
}

const ICS_COURSE_MAP: Record<string, string> = {
  "疗愈师课程": "ics:疗愈师课程", "疗愈师课程：自爱力构建": "ics:疗愈师课程",
  "商业框架陪跑": "ics:商业框架陪跑", "商业框架陪跑：自觉力提升": "ics:商业框架陪跑",
  "落地赋能班": "ics:落地赋能班", "落地赋能班：自洽力整合": "ics:落地赋能班",
}

function resolveIcsCourseKey(courseName: string): string {
  if (ICS_COURSE_MAP[courseName]) return ICS_COURSE_MAP[courseName]
  if (courseName.startsWith("疗愈师")) return "ics:疗愈师课程"
  if (courseName.startsWith("商业框架") || courseName.startsWith("陪跑")) return "ics:商业框架陪跑"
  if (courseName.startsWith("落地赋能") || courseName.startsWith("赋能")) return "ics:落地赋能班"
  return ""
}

function getTypeSelectValue(type: ActivityType, courseName: string, classCourseType?: string): string {
  if (type === "ics") return resolveIcsCourseKey(courseName)
  if (type === "class") {
    if (classCourseType) return `class:${classCourseType}`
    // 如果没有指定课程类型，返回 "class"（用于显示默认值）
    return "class"
  }
  return type
}

// 每种活动类型对应的老师身份
const TEACHER_POSITION_MAP = ACTIVITY_POSITION_MAP

const ACTIVITY_MODE_OPTIONS = [
  { value: "线下", label: "线下" },
  { value: "线上", label: "线上" },
]

interface ActivityRow {
  key: number
  record_id: string
  created_by_id: string
  created_by: string
  record_type: ActivityType
  ics_course_key: string  // ics 子类型，如 "ics:商业框架陪跑"
  class_course_type: string  // class 子类型，如 "读书会"
  start_time: string
  end_time: string
  name: string
  course_id: string
  owner_id: string
  owner_name: string
  host_ids: string[]
  host_names: string[]
  participant_ids: string[]
  activity_mode: string
  is_public_welfare: boolean
  is_published: boolean
  membership_deduction_count: number
  deduction_count: number
  space_id: string
  room_id: string
  description: string
  billing_description: string
  pendingCreate: boolean
  raw: any
}

const ACTIVITY_CREATOR_ONLY_FIELDS = new Set<keyof ActivityRow>([
  "record_type",
  "ics_course_key",
  "class_course_type",
  "name",
  "course_id",
  "owner_id",
  "owner_name",
  "host_ids",
  "host_names",
  "activity_mode",
  "start_time",
  "end_time",
  "is_public_welfare",
  "membership_deduction_count",
  "deduction_count",
  "description",
  "billing_description",
])

let nextKey = 1

function recordToRow(type: ActivityType, data: any, courses: {id: string, name: string}[], defaultSpaceId: string, spaces: Space[]): ActivityRow {
  const key = nextKey++
  let ownerId = ""
  let ownerName = ""
  let hostIds: string[] = []
  let hostNames: string[] = []
  let name = ""
  let classCourseType = ""

  if (type === "class") {
    hostIds = data.teacher_ids || []
    name = courses.find(c => c.id === data.course_id)?.name || data.course_name || ""
    classCourseType = data.course_type || ""
  } else if (type === "gcs" || type === "ers") {
    ownerId = data.owner_id || ""
    ownerName = data.owner_name || ""
    hostIds = data.teacher_ids || data.host_ids || []
    hostNames = data.teacher_names || data.host_names || []
    name = data.name || ""
  } else if (type === "eks") {
    ownerId = data.owner_id || ""
    ownerName = data.owner_name || ""
    hostIds = data.teacher_ids || data.host_ids || []
    hostNames = data.teacher_names || data.host_names || []
    name = data.name ?? TYPE_NAMES[type]
  } else if (type === "ics") {
    hostIds = data.teacher_ids || data.host_ids || []
    hostNames = data.teacher_names || data.host_names || []
    name = data.course_name || ""
  }

  let participantIds: string[] = []
  if (type === "class") {
    const groupIds = (data.groups || []).flatMap((g: any) => [g.leader_id, g.deputy_id, ...(g.member_ids || [])].filter(Boolean))
    participantIds = [...new Set([...groupIds, ...(data.participant_ids || [])])]
  } else if (type === "gcs") {
    participantIds = [...(data.participant_ids || [])].filter(Boolean)
  } else if (type === "ers") {
    participantIds = [...(data.participant_ids || [])].filter(Boolean)
  } else if (type === "eks") {
    participantIds = [...(data.participant_ids || [])].filter(Boolean)
  } else if (type === "ics") {
    participantIds = [...(data.participant_ids || [])].filter(Boolean)
  }

  const desc = (type === "class" || type === "ics" || type === "eks")
    ? (data.course_description || "")
    : (data.description || "")
  const sid = data.space_id || defaultSpaceId || ""
  const rid = data.room_id || (spaces.find(s => s.id === sid)?.rooms?.[0]?.id || "")

  return {
    key, record_id: data.id, record_type: type,
    created_by_id: data.created_by_id || "",
    created_by: data.created_by || "",
    ics_course_key: type === "ics" ? resolveIcsCourseKey(name) : "",
    class_course_type: type === "class" ? classCourseType : "",
    start_time: data.start_time || "", end_time: data.end_time || "",
    name, course_id: type === "class" ? (data.course_id || "") : "",
    owner_id: ownerId, owner_name: ownerName,
    host_ids: hostIds, host_names: hostNames,
    participant_ids: participantIds,
    activity_mode: data.activity_mode || "线下",
    is_public_welfare: data.is_public_welfare || false,
    is_published: data.is_published || false,
    membership_deduction_count: type === "eks" || type === "ics" || data.is_public_welfare
      ? 0
      : Math.max(1, Number(data.membership_deduction_count) || 1),
    deduction_count: type === "eks" ? parseEksDescription(data.description || "").count : (data.is_public_welfare ? 0 : 1),
    space_id: sid, room_id: rid,
    description: desc,
    billing_description: type === "eks" ? (data.description || "") : "",
    pendingCreate: false,
    raw: data,
  }
}

function createFreshRow(type: ActivityType, defaultSpaceId: string, spaces: Space[]): ActivityRow {
  const key = nextKey++
  const sid = defaultSpaceId || spaces[0]?.id || ""
  const rid = sid ? (spaces.find(s => s.id === sid)?.rooms?.[0]?.id || "") : ""
  return {
    key, record_id: "", record_type: type,
    created_by_id: "", created_by: "",
    ics_course_key: "", class_course_type: "",
    start_time: "", end_time: "",
    name: "", course_id: "",
    owner_id: "", owner_name: "",
    host_ids: [], host_names: [],
    participant_ids: [],
    activity_mode: "线下",
    is_public_welfare: false,
    is_published: false,
    membership_deduction_count: type === "eks" || type === "ics" ? 0 : 1,
    deduction_count: 1,
    space_id: sid, room_id: rid,
    description: "",
    billing_description: "",
    pendingCreate: true,
    raw: {},
  }
}

type RowStatus = "idle" | "saving" | "saved" | "error"
type ViewSegment = "all" | "mine"

export interface ChangedCell {
  rowKey: number
  fields: string[]
}

export interface HistoryEntry {
  id?: string
  timestamp: number
  action: string
  userName: string
  ip?: string
  rows: ActivityRow[]
  changedKeys?: number[]
  changedCells?: ChangedCell[]
  deletedRowKeys?: number[]
}

interface ActivityBatchTableProps {
  date: string
  courses: {id: string, name: string}[]
  customers: CustomerLight[]
  invitedCustomerIds?: string[]
  teachers: CustomerLight[]
  spaces: Space[]
  spaceId?: string
  records: { type: "class" | "gcs" | "ers" | "eks" | "ics"; data: any }[]
  onReload: () => void
  callbacks: CardCallbacks
  getMemberName: (id: string) => string
  memberIdentities?: MemberIdentity[]
  onSavingCountChange?: (count: number) => void
  onSavedCountChange?: (count: number) => void
  onUndoRedoChange?: (canUndo: boolean, canRedo: boolean, undo: () => void, redo: () => void, history: HistoryEntry[]) => void
  onRestoreRef?: (restore: (entry: HistoryEntry) => Promise<void>) => void
  onCaptureRef?: (capture: () => void) => void
  onHistoryPushed?: (entry: HistoryEntry) => void
  previewRows?: ActivityRow[]
  previewChangedKeys?: number[]
  previewChangedCells?: ChangedCell[]
  locked?: boolean
  onClosePreview?: () => void
  toolbarLeading?: React.ReactNode
  toolbarTrailing?: React.ReactNode
  toolbarSupplement?: React.ReactNode
}

export function ActivityBatchTable({
  date, courses, customers, invitedCustomerIds, teachers, spaces, spaceId,
  records, onReload, callbacks, getMemberName, memberIdentities,
  onSavingCountChange, onSavedCountChange, onUndoRedoChange, onRestoreRef, onCaptureRef, onHistoryPushed,
  previewRows, previewChangedKeys, previewChangedCells, locked, onClosePreview,
  toolbarLeading, toolbarTrailing, toolbarSupplement,
}: ActivityBatchTableProps) {
  const [rows, setRows] = useState<ActivityRow[]>([])
  const [rowStatus, setRowStatus] = useState<Record<number, RowStatus>>({})
  const rowStatusRef = useRef(rowStatus)
  rowStatusRef.current = rowStatus
  const [dragOverKey, setDragOverKey] = useState<number | null>(null)
  const dragKeyRef = useRef<number | null>(null)
  const headerScrollRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const pendingScrollToBottomRef = useRef(false)
  const eksCountEditRef = useRef<Record<string, string>>({})
  const [membershipDeductionDrafts, setMembershipDeductionDrafts] = useState<Record<number, string>>({})
  const lastEditedEksRef = useRef<ActivityRow | null>(null)
  const eksEditsRef = useRef<Map<string, { owner_id: string; owner_name: string; billing_description: string }>>(new Map())
  const [remainingMap, setRemainingMap] = useState<Record<string, Record<string, number>>>({})
  const fetchedRemainingRef = useRef<Set<string>>(new Set())
  const prevOwnerRef = useRef<Record<number, string>>({})
  const [courseTypes, setCourseTypes] = useState<CourseType[]>([])
  const [editingDescriptionKey, setEditingDescriptionKey] = useState<number | null>(null)
  const [descriptionDraft, setDescriptionDraft] = useState("")
  const currentUser = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("currentUser") || "{}") }
    catch { return {} }
  }, [])
  const currentActorId = String(currentUser.id || "")
  const currentActorName = String(currentUser.owner || currentUser.username || "")
  const editPermissions = useEditPermissions()
  const canEditAllActivities = currentUser.role === "超级管理员" || editPermissions.activities === "all"
  const [viewSegment, setViewSegment] = useState<ViewSegment>(() => {
    try { return localStorage.getItem("activity_view_segment") === "mine" ? "mine" : "all" }
    catch { return "all" }
  })
  const isOwnRow = useCallback((row: ActivityRow) => {
    if (row.pendingCreate || !row.record_id) return true
    if (row.created_by_id) return Boolean(currentActorId && row.created_by_id === currentActorId)
    return Boolean(row.created_by && currentActorName && row.created_by === currentActorName)
  }, [currentActorId, currentActorName])
  const canEditRow = useCallback((row: ActivityRow) => (
    canEditAllActivities || isOwnRow(row)
  ), [canEditAllActivities, isOwnRow])
  const canEditField = useCallback((row: ActivityRow, field: keyof ActivityRow) => (
    canEditRow(row) || !ACTIVITY_CREATOR_ONLY_FIELDS.has(field)
  ), [canEditRow])
  const canEditChanges = useCallback((row: ActivityRow, changes: Partial<ActivityRow>) => (
    canEditRow(row) || Object.keys(changes).every(field => (
      !ACTIVITY_CREATOR_ONLY_FIELDS.has(field as keyof ActivityRow)
    ))
  ), [canEditRow])
  const invitedOwnerCustomers = useMemo(() => {
    // 邀约名单加载完成前保持为空，避免短暂暴露全部客户作为案主候选。
    if (!invitedCustomerIds) return []
    const invitedIds = new Set(invitedCustomerIds)
    return customers.filter(customer => invitedIds.has(customer.id))
  }, [customers, invitedCustomerIds])

  const fitDescriptionPreview = useCallback((element: HTMLTextAreaElement | null) => {
    if (!element) return
    element.style.height = "0px"
    element.style.height = `${Math.min(Math.max(element.scrollHeight, 180), 440)}px`
  }, [])

  // 客户端 IP（挂载时获取一次）
  const ipRef = useRef<string>("")
  useEffect(() => {
    fetch("https://api.ipify.org?format=json")
      .then(r => r.json())
      .then(data => { ipRef.current = data.ip || "" })
      .catch(() => {})
  }, [])

  // 撤回/重做历史栈
  const [undoStack, setUndoStack] = useState<HistoryEntry[]>([])
  const [redoStack, setRedoStack] = useState<HistoryEntry[]>([])
  const historyPushedRef = useRef<Set<number>>(new Set())
  const saveRowRef = useRef<(row: ActivityRow) => Promise<void>>(() => Promise.resolve())
  const typeChangeKeysRef = useRef<Set<number>>(new Set())

  const getUserName = useCallback(() => {
    try {
      const user = JSON.parse(localStorage.getItem("currentUser") || "{}")
      return user.owner || user.nickname || user.username || "未知"
    } catch { return "未知" }
  }, [])

  const pushHistory = useCallback((action: string, changedKeys?: number[], description?: string, overrideRows?: ActivityRow[], changedCells?: ChangedCell[]) => {
    const entry: HistoryEntry = {
      timestamp: Date.now(),
      action: description || action,
      userName: getUserName(),
      ip: ipRef.current || undefined,
      rows: overrideRows || rowsRef.current.map(r => ({ ...r })),
      changedKeys,
      changedCells,
    }
    setUndoStack(prev => [...prev, entry])
    setRedoStack([])
    if (changedKeys) changedKeys.forEach(k => historyPushedRef.current.add(k))
    onHistoryPushed?.(entry)
  }, [getUserName, onHistoryPushed])

  const deleteRecordFromBackend = useCallback(async (row: ActivityRow, conversion = false) => {
    const id = row.record_id
    if (!id) return
    if (!canEditRow(row)) throw new Error("只能删除自己创建的课表内容")
    if (row.record_type === "class") await classRecordApi.delete(id, conversion)
    else if (row.record_type === "gcs") await groupCaseSessionApi.delete(id, conversion)
    else if (row.record_type === "ers") await emotionalReleaseSessionApi.delete(id, conversion)
    else if (row.record_type === "eks") await energyKnotSessionApi.delete(id, conversion)
    else if (row.record_type === "ics") await internalCourseSessionApi.delete(id, conversion)
  }, [canEditRow])

  const undo = useCallback(() => {
    if (undoStack.length === 0) return
    const entry = undoStack[undoStack.length - 1]
    // 同步捕获当前快照（在 state 更新前）
    const deletedRowKeys: number[] = []
    const newKeys = new Set(entry.changedKeys || [])
    const entryKeySet = new Set(entry.rows.map(r => r.key))
    for (const key of newKeys) {
      if (!entryKeySet.has(key)) {
        const currentRow = rowsRef.current.find(r => r.key === key)
        if (currentRow?.record_id) {
          deletedRowKeys.push(key)
          deleteRecordFromBackend(currentRow).catch(() => {})
        }
      }
    }
    const currentEntry: HistoryEntry = {
      timestamp: Date.now(), action: "撤回", userName: getUserName(),
      rows: rowsRef.current.map(r => ({ ...r })),
      deletedRowKeys: deletedRowKeys.length > 0 ? deletedRowKeys : undefined,
    }
    setUndoStack(prev => prev.slice(0, -1))
    setRedoStack(prev => [...prev, currentEntry])
    setRows(entry.rows)
    const statuses: Record<number, RowStatus> = {}
    entry.rows.forEach(r => { statuses[r.key] = r.record_id ? "saved" : "idle" })
    setRowStatus(statuses)
    // "编辑" 操作：撤回 = 保存旧数据
    entry.rows.forEach(row => { if (row.record_id && !row.pendingCreate) saveRowRef.current(row).catch(() => {}) })
  }, [undoStack, getUserName, deleteRecordFromBackend])

  const redo = useCallback(() => {
    if (redoStack.length === 0) return
    const entry = redoStack[redoStack.length - 1]
    const currentEntry: HistoryEntry = {
      timestamp: Date.now(), action: "重做", userName: getUserName(),
      rows: rowsRef.current.map(r => ({ ...r }))
    }
    setRedoStack(prev => prev.slice(0, -1))
    setUndoStack(prev => [...prev, currentEntry])
    setRows(entry.rows)
    const statuses: Record<number, RowStatus> = {}
    entry.rows.forEach(r => { statuses[r.key] = r.record_id ? "saved" : "idle" })
    setRowStatus(statuses)
    // "新增" 操作 redo：被 undo 删除的行需要重新创建
    const deletedKeys = new Set(entry.deletedRowKeys || [])
    for (const row of entry.rows) {
      if (deletedKeys.has(row.key) && row.record_id) {
        const freshRow = { ...row, record_id: "", pendingCreate: true }
        setRows(prev => prev.map(r => r.key === row.key ? freshRow : r))
        statuses[row.key] = "saving"
        saveRowRef.current(freshRow).catch(() => {})
      } else if (row.record_id && !row.pendingCreate) {
        saveRowRef.current(row).catch(() => {})
      }
    }
    setRowStatus(statuses)
  }, [redoStack, getUserName])

  // 通知父组件撤回/重做状态和历史记录
  useEffect(() => {
    onUndoRedoChange?.(undoStack.length > 0, redoStack.length > 0, undo, redo, undoStack)
  }, [undoStack, redoStack, undo, redo, onUndoRedoChange])

  // 恢复历史版本函数（async，等待所有保存完成）
  const restoreFromHistory = useCallback(async (entry: HistoryEntry) => {
    pushHistory("恢复了历史版本")
    // 在 setRows 之前捕获当前行，用于找出需要删除的行
    const currentRows = rowsRef.current
    // 将快照中的行分为两类：已有记录（update）和未创建记录（create）
    const rowsToRestore = entry.rows.map(r => {
      if (!r.record_id || r.pendingCreate) {
        return { ...r, pendingCreate: true, record_id: "" }
      }
      return r
    })
    setRows(rowsToRestore)
    const statuses: Record<number, RowStatus> = {}
    rowsToRestore.forEach(r => { statuses[r.key] = "saving" })
    setRowStatus(statuses)
    // 删除当前存在但快照中没有的行（快照之后新增的行）
    const snapshotRecordIds = new Set(entry.rows.filter(r => r.record_id).map(r => r.record_id))
    const rowsToDelete = currentRows.filter(r => r.record_id && !snapshotRecordIds.has(r.record_id))
    // 保存每行：如果 update 失败（record_id 已失效），删除旧记录后降级为 create
    const savePromises = rowsToRestore.map(async (row) => {
      try {
        return await saveRowRef.current(row)
      } catch (e: any) {
        const msg = e?.message || ""
        if (row.record_id && (msg.includes("404") || msg.includes("不存在"))) {
          await deleteRecordFromBackend(row).catch(() => {})
          return await saveRowRef.current({ ...row, record_id: "", pendingCreate: true })
        }
        throw e
      }
    })
    // 等待所有保存 + 删除完成
    const results = await Promise.allSettled([
      ...savePromises,
      ...rowsToDelete.map(row => deleteRecordFromBackend(row)),
    ])
    // 根据结果更新最终状态
    const finalStatuses: Record<number, RowStatus> = {}
    rowsToRestore.forEach((r, i) => {
      finalStatuses[r.key] = results[i]?.status === "fulfilled" ? "saved" : "error"
    })
    setRowStatus(finalStatuses)
  }, [pushHistory, deleteRecordFromBackend])

  // 捕获当前状态到历史记录（打开历史面板时调用）
  const captureCurrentState = useCallback(() => {
    const currentRows = rowsRef.current
    if (currentRows.length === 0) return
    let newEntry: HistoryEntry | null = null
    setUndoStack(prev => {
      if (prev.length > 0) {
        const last = prev[prev.length - 1]
        const isSame = last.rows.length === currentRows.length &&
          last.rows.every((r, i) => JSON.stringify(r) === JSON.stringify(currentRows[i]))
        if (isSame) return prev
      }
      newEntry = {
        timestamp: Date.now(),
        action: "当前状态",
        userName: getUserName(),
        rows: currentRows.map(r => ({ ...r })),
      }
      return [...prev, newEntry]
    })
    if (newEntry) onHistoryPushed?.(newEntry)
  }, [getUserName, onHistoryPushed])

  // 暴露函数给父组件
  useEffect(() => {
    onRestoreRef?.(restoreFromHistory)
  }, [restoreFromHistory, onRestoreRef])

  useEffect(() => {
    onCaptureRef?.(captureCurrentState)
  }, [captureCurrentState, onCaptureRef])

  // 加载活动类型（沙龙子类型）
  useEffect(() => {
    courseTypeApi.list().then(setCourseTypes).catch(() => {})
  }, [])

  // 动态构建类型选项
  const typeOptions = useMemo(() => {
    const classChildren = courseTypes.filter(t => t.category !== "other").map(t => ({ value: `class:${t.name}`, label: t.name }))
    return [
      { value: "class", label: "沙龙活动", children: classChildren },
      { value: "gcs", label: "觉醒游戏" },
      { value: "ers", label: "情绪释放" },
      { value: "eks", label: "能量结" },
      { value: "ics:疗愈师课程", label: "疗愈师课程" },
      { value: "ics:商业框架陪跑", label: "商业框架陪跑" },
      { value: "ics:落地赋能班", label: "落地赋能班" },
    ]
  }, [courseTypes])

  // 报告保存状态
  useEffect(() => {
    const savingCount = Object.values(rowStatus).filter(s => s === "saving").length
    onSavingCountChange?.(savingCount)
  }, [rowStatus, onSavingCountChange])

  useEffect(() => {
    const savedCount = Object.values(rowStatus).filter(s => s === "saved").length
    onSavedCountChange?.(savedCount)
  }, [rowStatus, onSavedCountChange])

  const rowsRef = useRef(rows)
  rowsRef.current = rows
  const timersRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({})

  const fetchRemaining = useCallback(async (type: string, customerId: string) => {
    if (!customerId) return
    try {
      let results: any[] = []
      if (type === "eks") results = await energyKnotSessionApi.searchCustomers("", date)
      else if (type === "gcs") results = await groupCaseSessionApi.searchCustomers("", date)
      else if (type === "ers") results = await emotionalReleaseSessionApi.searchCustomers("", date)
      else return
      const map: Record<string, number> = {}
      for (const r of results) map[r.id] = r.remaining
      setRemainingMap(prev => ({ ...prev, [type]: { ...prev[type], ...map } }))
    } catch {}
  }, [date])

  // 从 records 加载行数据（优先从 API 获取排序，fallback 到 localStorage）
  const prevRecordsRef = useRef<string | null>(null)
  useEffect(() => {
    const sig = records.map(r => `${r.type}-${r.data.id}`).join(",")
    if (prevRecordsRef.current !== null && sig === prevRecordsRef.current) return
    prevRecordsRef.current = sig

    const buildRows = (order: string[]) => {
      let items = records.map(r => {
        const row = recordToRow(r.type, r.data, courses, spaceId || "", spaces)
        if (r.type === "eks" && r.data.id) {
          const edit = eksEditsRef.current.get(r.data.id)
          if (edit) {
            row.owner_id = edit.owner_id
            row.owner_name = edit.owner_name
            row.billing_description = edit.billing_description
          }
        }
        return row
      })
      if (order.length) {
        const orderMap = new Map(order.map((id, i) => [id, i]))
        items.sort((a, b) => (orderMap.get(`${a.record_type}-${a.record_id}`) ?? 999) - (orderMap.get(`${b.record_type}-${b.record_id}`) ?? 999))
      }
      if (items.length === 0) {
        const defaultCourseType = courseTypes.find(ct => ct.name === "读书会")?.name || courseTypes[0]?.name || ""
        const fresh = createFreshRow("class", spaceId || "", spaces)
        if (defaultCourseType) {
          fresh.class_course_type = defaultCourseType
          fresh.name = defaultCourseType
        }
        items = [fresh]
      }
      setRows(items)
      const statuses: Record<number, RowStatus> = {}
      items.forEach(r => { statuses[r.key] = r.record_id ? "saved" : "idle" })
      setRowStatus(statuses)
    }

    // 先用 localStorage 排序立即渲染
    const orderKey = `daily_activity_order_${date}_${spaceId || ""}`
    let localOrder: string[] = []
    try { localOrder = JSON.parse(localStorage.getItem(orderKey) || "[]") } catch {}
    buildRows(localOrder)

    // 再从 API 获取排序（覆盖 localStorage）
    activityOrderApi.get(date, spaceId || "").then(apiOrder => {
      if (apiOrder.length > 0) {
        buildRows(apiOrder)
        // 同步回 localStorage
        try { localStorage.setItem(orderKey, JSON.stringify(apiOrder)) } catch {}
      }
    }).catch(() => {})
  }, [records, courses, date, spaceId, spaces, courseTypes])

  // 保存单行（返回 API 结果，供 handleCreate 获取 record_id）
  const saveRowInner = useCallback(async (row: ActivityRow, conversion = false): Promise<any> => {
    rowStatusRef.current = { ...rowStatusRef.current, [row.key]: "saving" }
    setRowStatus(prev => ({ ...prev, [row.key]: "saving" }))
    try {
      const type = row.record_type
      const space = spaces.find(s => s.id === row.space_id)
      const room = space?.rooms?.find(r => r.id === row.room_id)
      const common = {
        start_time: row.start_time || null,
        end_time: row.end_time || null,
        is_published: row.is_published,
        space_id: row.space_id || undefined,
        room_id: row.room_id || undefined,
        space_name: space?.name || undefined,
        room_name: room?.name || undefined,
        ...(canEditRow(row) ? {
          activity_mode: row.activity_mode,
          membership_deduction_count: type === "eks" || type === "ics" || row.is_public_welfare
            ? 0
            : row.membership_deduction_count,
        } : {}),
      }

      if (row.pendingCreate) {
        // 新建记录
        const createData: any = { date, ...common, participant_ids: row.participant_ids }

        if (type === "class") {
          const course = courses.find(c => c.id === row.course_id)
          createData.course_id = row.course_id || ""
          createData.course_name = course?.name || row.name || ""
          createData.course_type = row.class_course_type || ""
          createData.course_description = row.description || ""
          createData.teacher_ids = row.host_ids
          createData.is_public_welfare = row.is_public_welfare
        } else if (type === "gcs" || type === "ers") {
          createData.name = row.name || ""
          createData.owner_id = row.owner_id || ""
          createData.owner_name = row.owner_name || ""
          createData.teacher_ids = row.host_ids
          createData.description = row.description || ""
        } else if (type === "eks") {
          createData.owner_id = row.owner_id || ""
          createData.owner_name = row.owner_name || ""
          createData.name = row.name || ""
          createData.teacher_ids = row.host_ids
          createData.description = serializeEksDescription(
            row.owner_id,
            row.owner_name,
            Math.max(1, Number(row.deduction_count) || 1),
          )
          createData.course_description = row.description || ""
        } else if (type === "ics") {
          createData.course_type = row.ics_course_key?.replace("ics:", "") || ""
          createData.course_name = row.name || ""
          createData.course_description = row.description || ""
          createData.teacher_ids = row.host_ids
        }

        let result: any
        if (type === "class") result = await classRecordApi.create(createData, conversion)
        else if (type === "gcs") result = await groupCaseSessionApi.create(createData, conversion)
        else if (type === "ers") result = await emotionalReleaseSessionApi.create(createData, conversion)
        else if (type === "eks") result = await energyKnotSessionApi.create(createData, conversion)
        else if (type === "ics") result = await internalCourseSessionApi.create(createData, conversion)

        // 更新行：标记为已创建。先同步 rowsRef，避免 React 批处理期间再次被当成未创建记录。
        const rowsWithCreatedRecord = rowsRef.current.map(r => r.key === row.key ? {
          ...r,
          record_id: result?.id || "",
          created_by_id: result?.created_by_id || currentActorId,
          created_by: result?.created_by || currentActorName,
          pendingCreate: false,
          raw: result || {},
        } : r)
        rowsRef.current = rowsWithCreatedRecord
        setRows(rowsWithCreatedRecord)
        // 保存顺序
        const orderKey = `daily_activity_order_${date}_${spaceId || ""}`
        try {
          const order = rowsWithCreatedRecord.map(r => `${r.record_type}-${r.record_id}`)
          localStorage.setItem(orderKey, JSON.stringify(order))
        } catch {}
        rowStatusRef.current = { ...rowStatusRef.current, [row.key]: "saved" }
        setRowStatus(prev => ({ ...prev, [row.key]: "saved" }))
        if (["eks", "gcs", "ers"].includes(row.record_type)) {
          // 余额列表数据量较大，不阻塞场次创建和旧类型清理。
          void fetchRemaining(row.record_type, "all")
        }
        return result
      } else {
        // 更新已有记录
        const id = row.record_id
        if (type === "class") {
          const course = courses.find(c => c.id === row.course_id)
          await classRecordApi.update(id, {
            ...common,
            ...(canEditRow(row) ? {
              course_id: row.course_id,
              course_name: course?.name || row.name,
              course_type: row.class_course_type || "",
              course_description: row.description,
              teacher_ids: row.host_ids,
            } : {}),
            is_public_welfare: row.is_public_welfare,
            participant_ids: row.participant_ids,
          }, conversion)
        } else if (type === "gcs") {
          await groupCaseSessionApi.update(id, {
            ...common,
            ...(canEditRow(row) ? {
              name: row.name,
              owner_id: row.owner_id || "",
              owner_name: row.owner_name || "",
              teacher_ids: row.host_ids,
              description: row.description,
            } : {}),
            participant_ids: row.participant_ids,
          })
        } else if (type === "ers") {
          await emotionalReleaseSessionApi.update(id, {
            ...common,
            ...(canEditRow(row) ? {
              name: row.name,
              owner_id: row.owner_id || "",
              owner_name: row.owner_name || "",
              teacher_ids: row.host_ids,
              description: row.description,
            } : {}),
            participant_ids: row.participant_ids,
          })
        } else if (type === "eks") {
          await energyKnotSessionApi.update(id, {
            ...common,
            ...(canEditRow(row) ? {
              owner_id: row.owner_id || "",
              owner_name: row.owner_name || "",
              name: row.name || "",
              teacher_ids: row.host_ids,
              description: serializeEksDescription(
                row.owner_id,
                row.owner_name,
                Math.max(1, Number(row.deduction_count) || 1),
              ),
              course_description: row.description,
            } : {}),
            participant_ids: row.participant_ids,
          })
        } else if (type === "ics") {
          await internalCourseSessionApi.update(id, {
            ...common,
            ...(canEditRow(row) ? {
              course_type: row.ics_course_key?.replace("ics:", "") || "",
              course_name: row.name,
              course_description: row.description,
              teacher_ids: row.host_ids,
            } : {}),
            participant_ids: row.participant_ids,
          }, conversion)
        }
      }

      rowStatusRef.current = { ...rowStatusRef.current, [row.key]: "saved" }
      setRowStatus(prev => ({ ...prev, [row.key]: "saved" }))
      historyPushedRef.current.delete(row.key)
      if (row.record_type === "eks" && row.record_id) eksEditsRef.current.delete(row.record_id)
      // 保存后刷新剩余次数（fetchRemaining 会获取该类型所有客户，调一次即可）
      if (["eks", "gcs", "ers"].includes(row.record_type)) {
        if (row.owner_id || prevOwnerRef.current[row.key]) {
          delete prevOwnerRef.current[row.key]
        }
        fetchRemaining(row.record_type, "all")
      }
    } catch (e: any) {
      const msg = e?.message || ""
      // 404 = record_id 已失效（记录被删后重建），降级为 create
      if (row.record_id && !row.pendingCreate && (msg.includes("404") || msg.includes("不存在"))) {
        await deleteRecordFromBackend(row).catch(() => {})
        return await saveRowInner({ ...row, record_id: "", pendingCreate: true }, conversion)
      }
      console.error("[SAVE] error", { key: row.key, type: row.record_type, id: row.record_id, error: e?.message })
      rowStatusRef.current = { ...rowStatusRef.current, [row.key]: "error" }
      setRowStatus(prev => ({ ...prev, [row.key]: "error" }))
      throw e
    }
  }, [courses, spaceId, spaces, date, fetchRemaining, canEditRow, currentActorId, currentActorName])

  // saveRow 包装：加 15 秒超时，防止 API 挂起时 status 永远停在 "saving"
  const saveRow = useCallback(async (row: ActivityRow, conversion = false): Promise<any> => {
    const key = row.key
    const timer = setTimeout(() => {
      // 仅当状态仍为 "saving" 时才改为 "error"
      if (rowStatusRef.current[key] === "saving") {
        rowStatusRef.current = { ...rowStatusRef.current, [key]: "error" }
        setRowStatus(prev => ({ ...prev, [key]: "error" }))
      }
    }, 15000)
    try {
      return await saveRowInner(row, conversion)
    } finally {
      clearTimeout(timer)
    }
  }, [saveRowInner])

  // 同步 saveRow 到 ref，供 undo/redo 使用
  useEffect(() => { saveRowRef.current = saveRow }, [saveRow])

  const scheduleSave = useCallback((key: number) => {
    if (timersRef.current[key]) clearTimeout(timersRef.current[key])
    timersRef.current[key] = setTimeout(() => {
      const row = rowsRef.current.find(r => r.key === key)
      if (row && rowStatusRef.current[key] !== "saving") saveRowRef.current(row).catch(() => {})
      delete timersRef.current[key]
    }, 500)
  }, [])

  const FIELD_LABELS: Record<string, string> = {
    name: "名称", start_time: "时间", end_time: "时间",
    activity_mode: "活动方式", description: "简介", is_published: "发布",
    is_public_welfare: "公益", participant_ids: "参与人",
    membership_deduction_count: "扣卡次数",
    host_ids: "老师", host_names: "老师",
    owner_id: "案主", owner_name: "案主",
    space_id: "空间", room_id: "空间",
    deduction_count: "部位数",
  }

  const updateRow = useCallback((key: number, field: keyof ActivityRow, value: any) => {
    const editableRow = rowsRef.current.find(r => r.key === key)
    if (!editableRow || !canEditField(editableRow, field)) return
    // 首次编辑时记录历史
    if (rowStatus[key] === "saved" || rowStatus[key] === "error") {
      if (!historyPushedRef.current.has(key)) {
        const row = rowsRef.current.find(r => r.key === key)
        const rowName = row?.name || ""
        const label = FIELD_LABELS[field as string] || "活动"
        let desc = `编辑了「${rowName}」的${label}`
        // 名称编辑显示新旧值
        if (field === "name" && row) {
          const oldName = row.name || ""
          const newName = String(value || "")
          if (oldName && newName && oldName !== newName) {
            desc = `将「${oldName}」改为「${newName}」`
          }
        }
        // 参与人/老师/案主编辑显示具体人员
        if ((field === "participant_ids" || field === "host_ids") && row) {
          const oldIds: string[] = row[field] as string[] || []
          const newIds: string[] = Array.isArray(value) ? value : []
          const added = newIds.filter(id => !oldIds.includes(id)).map(id => getMemberName(id)).filter(Boolean)
          const removed = oldIds.filter(id => !newIds.includes(id)).map(id => getMemberName(id)).filter(Boolean)
          const parts: string[] = []
          if (added.length) parts.push(`新增 ${added.join("、")}`)
          if (removed.length) parts.push(`移除 ${removed.join("、")}`)
          if (parts.length) desc = `编辑了「${rowName}」的${label}：${parts.join("；")}`
        }
        if ((field === "owner_id" || field === "owner_name") && row) {
          const oldName = field === "owner_name" ? (row.owner_name || "") : getMemberName(row.owner_id || "")
          const newName = field === "owner_name" ? String(value || "") : getMemberName(String(value || ""))
          if (newName && newName !== oldName) {
            desc = `编辑了「${rowName}」的案主：${oldName || "无"} → ${newName}`
          }
        }
        // 传入编辑前的行快照（用于 undo 恢复）
        const preRows = rowsRef.current.map(r => ({ ...r }))
        pushHistory("编辑了活动", [key], desc, preRows, [{ rowKey: key, fields: [field as string] }])
      }
      setRowStatus(prev => ({ ...prev, [key]: "idle" }))
    }
    setRows(prev => prev.map(r => r.key === key ? { ...r, [field]: value } : r))
    scheduleSave(key)
  }, [rowStatus, scheduleSave, pushHistory, canEditField])

  // 批量修改行字段（用于一次修改多个关联字段的场景，如 eks 案主+描述）
  const updateRowMulti = useCallback((key: number, changes: Partial<ActivityRow>, desc?: string) => {
    const editableRow = rowsRef.current.find(r => r.key === key)
    if (!editableRow || !canEditChanges(editableRow, changes)) return
    if (rowStatus[key] === "saved" || rowStatus[key] === "error") {
      if (!historyPushedRef.current.has(key)) {
        const row = rowsRef.current.find(r => r.key === key)
        const rowName = row?.name || ""
        const preRows = rowsRef.current.map(r => ({ ...r }))
        pushHistory("编辑了活动", [key], desc || `编辑了「${rowName}」`, preRows)
      }
      setRowStatus(prev => ({ ...prev, [key]: "idle" }))
    }
    setRows(prev => prev.map(r => r.key === key ? { ...r, ...changes } : r))
    scheduleSave(key)
  }, [rowStatus, scheduleSave, pushHistory, canEditChanges])

  // 删除按钮
  const handleDelete = useCallback((row: ActivityRow) => {
    if (!canEditRow(row)) return
    // 不在确认前移除行，等父组件确认后由 loadDateData 同步
    if (row.record_type === "class") callbacks.onDeleteClass(row.record_id)
    else if (row.record_type === "gcs") callbacks.onDeleteGcs(row.record_id)
    else if (row.record_type === "ers") callbacks.onDeleteErs(row.record_id)
    else if (row.record_type === "eks") callbacks.onDeleteEks(row.record_id)
    else if (row.record_type === "ics") callbacks.onDeleteIcs(row.record_id)
  }, [callbacks, canEditRow])

  // 类型切换 → 先创建新记录，成功后再删除旧记录（防止数据丢失）
  const handleTypeChange = useCallback(async (rowKey: number, newType: string) => {
    // 同一行的类型转换必须串行执行，避免连续切换时留下中间类型的孤立场次。
    if (typeChangeKeysRef.current.has(rowKey) || rowStatusRef.current[rowKey] === "saving") return
    const row = rowsRef.current.find(r => r.key === rowKey)
    if (!row || !canEditRow(row)) return
    // 解析复合值，如 "ics:疗愈师课程"
    const [parsedType, parsedCourse] = newType.includes(":") ? newType.split(":") : [newType, ""]
    const oldName = row.name || "未命名活动"
    const newTypeName = parsedCourse || TYPE_NAMES[parsedType as ActivityType] || parsedType
    const type = parsedType as ActivityType
    // 同类型且同课程 → 忽略（在 pushHistory 之前检查，避免污染 undo 栈）
    const currentCourse = row.record_type === "ics"
      ? row.ics_course_key?.replace("ics:", "")
      : row.record_type === "class"
        ? row.class_course_type
        : ""
    if (type === row.record_type && (!["class", "ics"].includes(type) || parsedCourse === currentCourse)) return

    typeChangeKeysRef.current.add(rowKey)

    if (timersRef.current[rowKey]) {
      clearTimeout(timersRef.current[rowKey])
      delete timersRef.current[rowKey]
    }
    // 存 pre-change 快照用于 undo
    const preRows = rowsRef.current.map(r => ({ ...r }))

    // 保留已有数据，只更新活动名称和类型相关字段
    const updatesExistingSubtype = ["class", "ics"].includes(type)
      && type === row.record_type
      && Boolean(row.record_id)
      && !row.pendingCreate
    const updated: ActivityRow = {
      ...row,
      record_type: type,
      ics_course_key: type === "ics" ? newType : "",
      class_course_type: type === "class" ? parsedCourse : "",
      record_id: updatesExistingSubtype ? row.record_id : "",
      pendingCreate: !updatesExistingSubtype,
      name: parsedCourse || TYPE_NAMES[type] || "",
      course_id: "",
      raw: updatesExistingSubtype ? row.raw : {},
      membership_deduction_count: updatesExistingSubtype
        ? row.membership_deduction_count
        : (type === "eks" || type === "ics" ? 0 : 1),
      deduction_count: type === "eks" ? 2 : 1,
    }

    // 草稿阶段允许案主为空；选中案主时仍由前后端共同校验当天邀约名单。
    if (["gcs", "ers", "eks"].includes(type) && !invitedOwnerCustomers.some(customer => customer.id === updated.owner_id)) {
      updated.owner_id = ""
      updated.owner_name = ""
    }
    const rowsWithUpdatedType = rowsRef.current.map(r => r.key === rowKey ? updated : r)
    rowsRef.current = rowsWithUpdatedType
    setRows(rowsWithUpdatedType)
    rowStatusRef.current = { ...rowStatusRef.current, [rowKey]: "idle" }
    setRowStatus(prev => ({ ...prev, [rowKey]: "idle" }))
    lastEditedEksRef.current = null
    // 先保存新记录，再删除旧记录；任一步失败都回滚新记录并恢复旧行。
    try {
      const result = await saveRow(updated, true)
      const savedId = updatesExistingSubtype ? updated.record_id : (result?.id || "")
      if (!savedId) throw new Error("新活动创建失败")
      // 新记录创建成功，删除旧记录
      if (!updatesExistingSubtype && row.record_id && !row.pendingCreate) {
        try {
          await deleteRecordFromBackend(row, true)
        } catch (deleteError) {
          // 旧记录删除失败时撤销刚创建的新记录，避免刷新后出现重复活动。
          await deleteRecordFromBackend({
            ...updated,
            record_id: savedId,
            pendingCreate: false,
          }, true).catch(() => {})
          throw deleteError
        }
        // 旧专项类型的余额也要刷新，否则界面会暂时显示未返还。
        if (["eks", "gcs", "ers"].includes(row.record_type)) {
          void fetchRemaining(row.record_type, "all")
        }
      }
      pushHistory("切换了类型", [rowKey], `将「${oldName}」切换为${newTypeName}`, preRows, [{ rowKey, fields: ["record_type", "name"] }])
    } catch {
      // 新记录创建失败，恢复旧行状态
      const restoredRows = rowsRef.current.map(r => r.key === rowKey ? row : r)
      rowsRef.current = restoredRows
      setRows(restoredRows)
      rowStatusRef.current = { ...rowStatusRef.current, [rowKey]: row.record_id ? "saved" : "idle" }
      setRowStatus(prev => ({ ...prev, [rowKey]: row.record_id ? "saved" : "idle" }))
    } finally {
      typeChangeKeysRef.current.delete(rowKey)
    }
  }, [deleteRecordFromBackend, fetchRemaining, invitedOwnerCustomers, saveRow, pushHistory, canEditRow])

  const selectOwner = useCallback((row: ActivityRow, customer: CustomerLight) => {
    const ownerId = customer.id
    const ownerName = customer.nickname || customer.name || ""
    if (row.record_type === "eks") {
      delete prevOwnerRef.current[row.key]
      const currentRow = rowsRef.current.find(r => r.key === row.key)
      const eksDesc = parseEksDescription(currentRow?.billing_description || row.billing_description)
      const newDesc = serializeEksDescription(ownerId, ownerName, eksDesc.count)
      lastEditedEksRef.current = { ...(currentRow || row), owner_id: ownerId, owner_name: ownerName, billing_description: newDesc }
      if (row.record_id) eksEditsRef.current.set(row.record_id, { owner_id: ownerId, owner_name: ownerName, billing_description: newDesc })
      updateRowMulti(row.key, { owner_id: ownerId, owner_name: ownerName, billing_description: newDesc })
    } else {
      updateRowMulti(row.key, { owner_id: ownerId, owner_name: ownerName })
    }
  }, [updateRowMulti])

  // 拖拽排序
  const handleDragStart = useCallback((key: number) => {
    if (rowsRef.current.some(row => row.key === key)) dragKeyRef.current = key
  }, [])
  const handleDragOver = useCallback((e: React.DragEvent, key: number) => {
    e.preventDefault()
    if (dragKeyRef.current !== key) setDragOverKey(key)
  }, [])
  const handleDragEnd = useCallback(() => { dragKeyRef.current = null; setDragOverKey(null) }, [])
  const handleDrop = useCallback((targetKey: number, e?: React.DragEvent) => {
    const sourceKey = dragKeyRef.current
    // 外部拖入（添加参与者）
    if (sourceKey === null && e) {
      try {
        const data = JSON.parse(e.dataTransfer.getData("text/plain"))
        if (data.customer_id) {
          const targetRow = rowsRef.current.find(r => r.key === targetKey)
          if (!targetRow || !canEditField(targetRow, "participant_ids")) { setDragOverKey(null); return }
          const alreadyInRow = targetRow.owner_id === data.customer_id || targetRow.host_ids.includes(data.customer_id) || targetRow.participant_ids.includes(data.customer_id)
          if (!alreadyInRow) {
            const newParticipantIds = [...targetRow.participant_ids, data.customer_id]
            updateRow(targetKey, "participant_ids", newParticipantIds)
          }
        }
      } catch {}
      setDragOverKey(null)
      return
    }
    // 内部排序
    if (sourceKey === null || sourceKey === targetKey) { setDragOverKey(null); return }
    const sourceRow = rowsRef.current.find(r => r.key === sourceKey)
    if (!sourceRow) {
      setDragOverKey(null)
      return
    }
    const visibleRows = viewSegment === "mine"
      ? rowsRef.current.filter(isOwnRow)
      : rowsRef.current
    const sourceIndex = visibleRows.findIndex(row => row.key === sourceKey)
    const targetIndex = visibleRows.findIndex(row => row.key === targetKey)
    if (sourceIndex === -1 || targetIndex === -1) { setDragOverKey(null); return }
    const subject = sourceRow.name || TYPE_NAMES[sourceRow.record_type] || "未命名课程"
    pushHistory(
      "调整了排序",
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
      const orderKey = `daily_activity_order_${date}_${spaceId || ""}`
      const order = next.map(r => `${r.record_type}-${r.record_id}`)
      try { localStorage.setItem(orderKey, JSON.stringify(order)) } catch {}
      // 持久化到后端
      activityOrderApi.save(date, spaceId || "", order, {
        movedName: subject,
        fromPosition: sourceIndex + 1,
        toPosition: targetIndex + 1,
      }).catch(() => {})
      return next
    })
    dragKeyRef.current = null
    setDragOverKey(null)
  }, [date, spaceId, updateRow, saveRow, pushHistory, canEditField, viewSegment, isOwnRow])

  // 获取 host 显示名称
  const getHostDisplay = useCallback((row: ActivityRow): string[] => {
    const pool = row.record_type === "class" ? teachers : customers
    return row.host_ids.map(id => {
      const c = pool.find(c => c.id === id)
      return c?.nickname || c?.name || ""
    }).filter(Boolean)
  }, [teachers, customers])

  // 会员身份类型映射：身份名称 → "老人" | "新人"
  const identityTypeMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const identity of memberIdentities || []) {
      if (identity.type && identity.name) {
        map[identity.name] = identity.type
      }
    }
    return map
  }, [memberIdentities])

  // 按身份类型分组参与者
  const splitParticipants = useCallback((ids: string[]): { oldMembers: { id: string; name: string }[]; newMembers: { id: string; name: string }[] } => {
    const oldMembers: { id: string; name: string }[] = []
    const newMembers: { id: string; name: string }[] = []
    for (const id of ids) {
      const name = getMemberName(id)
      const customer = customers.find(c => c.id === id)
      const memberType = customer?.member_type || ""
      const identityType = identityTypeMap[memberType]
      if (identityType === "新人") {
        newMembers.push({ id, name })
      } else {
        oldMembers.push({ id, name })
      }
    }
    return { oldMembers, newMembers }
  }, [getMemberName, customers, identityTypeMap])

  // 预加载案主剩余次数（组件挂载后立即加载，确保首次搜索即可显示）
  useEffect(() => {
    fetchedRemainingRef.current.clear()
    setRemainingMap({})
    const types = ["eks", "gcs", "ers"] as const
    for (const type of types) {
      if (fetchedRemainingRef.current.has(type)) continue
      fetchedRemainingRef.current.add(type)
      ;(async () => {
        try {
          const results = type === "eks"
            ? await energyKnotSessionApi.searchCustomers("", date)
            : type === "gcs"
              ? await groupCaseSessionApi.searchCustomers("", date)
              : await emotionalReleaseSessionApi.searchCustomers("", date)
          const map: Record<string, number> = {}
          for (const r of results) map[r.id] = r.remaining
          setRemainingMap(prev => ({ ...prev, [type]: { ...prev[type], ...map } }))
        } catch {
          fetchedRemainingRef.current.delete(type)
        }
      })()
    }
  }, [date])

  const handleCreate = async (type: string, classCourseType?: string) => {
    const fresh = createFreshRow(type as ActivityType, spaceId || "", spaces)
    const newName = classCourseType || fresh.name || TYPE_NAMES[type as ActivityType] || "活动"
    if (classCourseType) {
      fresh.class_course_type = classCourseType
      fresh.name = classCourseType
    }
    // eks 类型新建行时继承最近编辑的案主和部位数
    if (type === "eks") {
      const src = lastEditedEksRef.current || [...rowsRef.current].reverse().find(r => r.record_type === "eks")
      if (src) {
        fresh.owner_id = src.owner_id
        fresh.owner_name = src.owner_name
        fresh.billing_description = src.billing_description
        fresh.deduction_count = parseEksDescription(src.billing_description).count
      }
    }
    // 先捕获 pre-change 快照（与 updateRow/handleTypeChange 一致）
    const preRows = rowsRef.current.map(r => ({ ...r }))
    const allFields = ["name", "record_type", "start_time", "end_time", "activity_mode", "membership_deduction_count", "description", "host_names", "owner_name", "participant_ids", "is_public_welfare", "is_published", "space_id"]
    pushHistory("新增了活动", [fresh.key], `新增了「${newName}」`, preRows, [{ rowKey: fresh.key, fields: allFields }])
    pendingScrollToBottomRef.current = true
    setRows(prev => [...prev, fresh])
    setRowStatus(prev => ({ ...prev, [fresh.key]: "idle" }))
    try { await saveRow(fresh) } catch { /* saveRow handles its own errors */ }
  }

  useLayoutEffect(() => {
    if (!pendingScrollToBottomRef.current) return
    pendingScrollToBottomRef.current = false
    const scrollContainer = scrollRef.current
    if (!scrollContainer) return
    scrollContainer.scrollTo({ top: scrollContainer.scrollHeight, behavior: "smooth" })
  }, [rows.length])

  const hasEks = rows.some(r => r.record_type === "eks")
  const hasOwnerType = rows.some(r => r.record_type !== "class" && r.record_type !== "ics")
  const tableMinWidth = hasOwnerType ? 1413 : 1257
  const fixedColumnWidth = 867 + (hasOwnerType ? 86 : 0) + (hasEks ? 40 : 0)
  const participantColumnWidth = (tableMinWidth - fixedColumnWidth) / 2
  const columnWidths = [
    24, 46, 122, 80, 126,
    ...(hasOwnerType ? [86] : []),
    ...(hasEks ? [40] : []),
    57, 62, 80, 160, participantColumnWidth, participantColumnWidth, 42, 68,
  ]

  const handleTableScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const header = headerScrollRef.current
    if (header && header.scrollLeft !== event.currentTarget.scrollLeft) {
      header.scrollLeft = event.currentTarget.scrollLeft
    }
  }, [])

  // 预览模式：使用预览行数据
  const isPreview = !!previewRows
  const isLocked = locked || isPreview
  const allDisplayRows = previewRows || rows
  const mineDisplayRows = useMemo(
    () => allDisplayRows.filter(isOwnRow),
    [allDisplayRows, isOwnRow],
  )
  const displayRows = viewSegment === "mine" ? mineDisplayRows : allDisplayRows
  const changedKeySet = new Set(previewChangedKeys || [])
  // 单元格级别的变更标记：rowKey -> Set<fieldName>
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
    try { localStorage.setItem("activity_view_segment", viewSegment) } catch {}
  }, [viewSegment])

  const closeDescriptionDialog = () => {
    setEditingDescriptionKey(null)
    setDescriptionDraft("")
  }

  const saveDescription = () => {
    if (editingDescriptionKey === null) return
    const editingRow = rows.find(row => row.key === editingDescriptionKey)
    if (editingRow && editingRow.description !== descriptionDraft) {
      updateRow(editingDescriptionKey, "description", descriptionDraft)
    }
    closeDescriptionDialog()
  }

  return (
    <div className={`relative flex min-h-0 flex-1 flex-col rounded-[2px] bg-white ${isLocked ? "activity-table-locked" : ""}`}>
      {isPreview && (
        <div className="px-3 py-2 bg-[#f5eeff] border-b border-[#e0d0f5]">
          <span className="text-[12px] text-[#7c3aed]">正在预览历史版本</span>
        </div>
      )}
      {isLocked && (
        <style>{`
          .activity-table-locked input,
          .activity-table-locked select,
          .activity-table-locked textarea,
          .activity-table-locked button,
          .activity-table-locked [role="combobox"],
          .activity-table-locked [data-dropdown] {
            pointer-events: none !important;
            opacity: 0.6;
          }
          .activity-table-locked [draggable="true"] {
            pointer-events: none !important;
          }
        `}</style>
      )}
      <div className="flex h-10 shrink-0 items-center gap-3 border-b border-[#f0f0f0] px-3.5">
        {toolbarLeading && (
          <>
            <div className="flex shrink-0 items-center gap-2">{toolbarLeading}</div>
            <span className="h-3.5 w-px shrink-0 bg-[#e8eaed]" aria-hidden="true" />
          </>
        )}
        <div className="flex items-center gap-1.5" aria-label="课表记录范围">
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
          <TooltipContent>公益、时间、类型、名称、老师、方式、扣卡、案主、部位、简介及删除仅创建人可操作</TooltipContent>
        </Tooltip>
        <div className="ml-auto flex shrink-0 items-center gap-1">{toolbarTrailing}</div>
      </div>
      {toolbarSupplement}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div ref={headerScrollRef} className="shrink-0 overflow-hidden">
          <div style={{ minWidth: tableMinWidth }}>
            <table className="w-full border-separate border-spacing-y-[6px] text-[12px]" style={{ tableLayout: "fixed" }}>
              <colgroup>
                {columnWidths.map((width, index) => <col key={index} style={{ width }} />)}
              </colgroup>
          <thead>
            <tr className="bg-[#f7f8fa] text-[#8f959e]">
              <th></th>
              <th className="px-1.5 py-2 text-center font-normal">公益</th>
              <th className="px-1 py-2 text-left font-normal">时间</th>
              <th className="px-1 py-2 text-left font-normal">类型</th>
              <th className="px-1 py-2 text-left font-normal">活动名称</th>
              {hasOwnerType && <th className="px-1 py-2 text-left font-normal">案主</th>}
              {hasEks && <th className="py-2 text-center font-normal">部位</th>}
              <th className="px-1 py-2 text-left font-normal">方式</th>
              <th className="px-1 py-2 text-center font-normal">扣卡次数</th>
              <th className="px-1 py-2 text-left font-normal">老师</th>
              <th className="px-1 py-2 text-left font-normal">简介</th>
              <th className="px-1 py-2 text-left font-normal">老人</th>
              <th className="px-1 py-2 text-left font-normal">新人</th>
              <th className="sticky right-[68px] z-10 w-[42px] bg-[#f7f8fa] px-1 py-2 text-center font-normal">发布</th>
              <th className="sticky right-0 z-10 w-[68px] bg-[#f7f8fa] px-1 py-2 text-center font-normal">操作</th>
            </tr>
          </thead>
            </table>
          </div>
        </div>
        <div ref={scrollRef} onScroll={handleTableScroll} className="min-h-0 flex-1 overflow-auto overscroll-contain scrollbar-hide">
          <div style={{ minWidth: tableMinWidth }}>
            <table className="w-full border-separate border-spacing-y-[6px] text-[12px]" style={{ tableLayout: "fixed" }}>
              <colgroup>
                {columnWidths.map((width, index) => <col key={index} style={{ width }} />)}
              </colgroup>
          <tbody>
            {displayRows.map((row) => {
              const isChanged = changedKeySet.has(row.key)
              const rowChangedFields = changedCellMap.get(row.key)
              const hasCellChanges = !!rowChangedFields && rowChangedFields.size > 0
              const { oldMembers, newMembers } = splitParticipants(row.participant_ids)
              const rowReadOnly = !canEditRow(row)
              const typeLabel = row.record_type === "class"
                ? (row.class_course_type || "沙龙")
                : row.record_type === "ics"
                  ? (row.ics_course_key.replace("ics:", "") || "内部课程")
                  : TYPE_NAMES[row.record_type]
              const hostDisplayText = getHostDisplay(row).join("、")
              return (
                <tr
                  key={row.key}
                  className={`${isChanged && !hasCellChanges ? "bg-[#f5eeff]" : "hover:bg-[#fafbfc]"} ${dragOverKey === row.key ? "border-t-2 border-t-[#3370ff]" : ""}`}
                  onDragOver={(e) => handleDragOver(e, row.key)}
                  onDrop={(e) => handleDrop(row.key, e)}
                >
                  {/* 拖动 */}
                  <td
                    className="px-1 py-0.5 cursor-grab active:cursor-grabbing text-center align-top"
                    draggable
                    onDragStart={() => handleDragStart(row.key)}
                    onDragEnd={handleDragEnd}
                  >
                    <GripVertical className="h-3.5 w-3.5 text-[#c9cdd4] mx-auto" />
                  </td>

                  {/* 公益 */}
                  <td className={`px-1 py-0.5 text-center align-top ${isCellChanged(row.key, "is_public_welfare") ? "bg-[#f5eeff] rounded" : ""}`}>
                    <div className="flex items-center justify-center h-7">
                    {row.record_type === "class" ? (
                      rowReadOnly ? (
                        <span className={row.is_public_welfare ? "text-[#2b2f36]" : "text-[#c9cdd4]"}>
                          {row.is_public_welfare ? "公益" : "-"}
                        </span>
                      ) : (
                        <input
                          type="checkbox"
                          checked={row.is_public_welfare}
                          onChange={(e) => {
                            const checked = e.target.checked
                            updateRowMulti(
                              row.key,
                              {
                                is_public_welfare: checked,
                                membership_deduction_count: checked ? 0 : 1,
                              },
                              `编辑了「${row.name || ""}」的公益状态与扣卡次数`,
                            )
                          }}
                          className="h-3.5 w-3.5 appearance-none border border-[#e8eaed] rounded-[2px] bg-white checked:bg-white checked:border-[#e8eaed] checked:bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2012%2012%22%3E%3Crect%20x%3D%223.5%22%20y%3D%223.5%22%20width%3D%225%22%20height%3D%225%22%20rx%3D%221%22%20fill%3D%22%23a0a5ab%22%2F%3E%3C%2Fsvg%3E')] bg-center bg-no-repeat cursor-pointer"
                        />
                      )
                    ) : null}
                    </div>
                  </td>

                  {/* 时间 */}
                  <td className={`px-1 py-0.5 align-top ${isCellChanged(row.key, "start_time") || isCellChanged(row.key, "end_time") ? "bg-[#f5eeff] rounded" : ""}`}>
                    {rowReadOnly ? (
                      <span className={`inline-flex h-7 w-full items-center text-[12px] tabular-nums ${row.start_time || row.end_time ? "text-[#2b2f36]" : "text-[#c9cdd4]"}`}>
                        {row.start_time || "-"}{row.end_time ? ` - ${row.end_time}` : ""}
                      </span>
                    ) : (
                      <div className="flex items-center h-7 rounded-[2px] border-[0.5px] border-[#e8eaed] focus-within:border-[#3370ff] overflow-hidden time-no-icon">
                        <input
                          type="time"
                          value={row.start_time}
                          onChange={(e) => updateRow(row.key, "start_time", e.target.value)}
                          className={`h-full flex-1 min-w-0 bg-transparent px-1.5 outline-none border-none ${!row.start_time ? "text-[#c9cdd4]" : "text-[#2b2f36]"}`}
                        />
                        <span className="text-[10px] text-[#c9cdd4] shrink-0 px-0.5">-</span>
                        <input
                          type="time"
                          value={row.end_time}
                          onChange={(e) => updateRow(row.key, "end_time", e.target.value)}
                          className={`h-full flex-1 min-w-0 bg-transparent px-1.5 outline-none border-none ${!row.end_time ? "text-[#c9cdd4]" : "text-[#2b2f36]"}`}
                        />
                      </div>
                    )}
                  </td>

                  {/* 类型 */}
                  <td className={`px-1 py-0.5 align-top ${isCellChanged(row.key, "record_type") ? "bg-[#f5eeff] rounded" : ""}`}>
                    {rowReadOnly ? (
                      <span className="inline-flex h-7 w-full items-center truncate text-[12px] text-[#2b2f36]" title={typeLabel}>
                        {typeLabel}
                      </span>
                    ) : (
                      <SelectDropdown rounded="[2px]"
                        size="sm"
                        value={getTypeSelectValue(row.record_type, row.name, row.class_course_type)}
                        options={typeOptions}
                        onChange={(v) => handleTypeChange(row.key, v)}
                        disabled={isLocked || rowStatus[row.key] === "saving"}
                        className="[&_button]:border-[0.5px] [&_button]:h-7 [&_button]:text-[12px]"
                        hideChevron
                        dropdownWidth={110}
                      />
                    )}
                  </td>

                  {/* 活动名称 */}
                  <td className={`px-1 py-0.5 align-top ${isCellChanged(row.key, "name") ? "bg-[#f5eeff] rounded" : ""}`}>
                    {rowReadOnly ? (
                      <span className={`inline-flex h-7 w-full items-center truncate text-[12px] ${row.name ? "text-[#2b2f36]" : "text-[#c9cdd4]"}`} title={row.name}>
                        {row.name || "-"}
                      </span>
                    ) : ["class", "ics", "gcs", "ers", "eks"].includes(row.record_type) ? (
                      <Input rounded="[2px]"
                        value={row.name}
                        onChange={(e) => updateRow(row.key, "name", e.target.value)}
                        placeholder=""
                        className="h-7 text-[12px] [&]:border-[0.5px]"
                      />
                    ) : (
                      <span className="text-[#2b2f36] truncate block">{row.name || <span className="text-[#c9cdd4]">-</span>}</span>
                    )}
                  </td>

                  {/* 案主 */}
                  {hasOwnerType && <td className={`pl-1.5 pr-0 py-0.5 w-[60px] align-top ${isCellChanged(row.key, "owner_name") || isCellChanged(row.key, "owner_id") ? "bg-[#f5eeff] rounded" : ""}`}>
                    {rowReadOnly ? (
                      <span className={`inline-flex h-7 w-full items-center truncate text-[12px] ${row.owner_name ? "text-[#2b2f36]" : "text-[#c9cdd4]"}`} title={row.owner_name}>
                        {row.owner_name || "-"}
                      </span>
                    ) : (row.record_type === "gcs" || row.record_type === "ers") ? (
                      <CustomerSearchInput rounded="2px"
                        customers={invitedOwnerCustomers}
                        value={row.owner_name || ""}
                        showClear={false}
                        excludeIds={[...row.host_ids, ...row.participant_ids]}
                        rightLabelMap={remainingMap[row.record_type] ? Object.fromEntries(Object.entries(remainingMap[row.record_type]).map(([id, n]) => [id, `余${n}`])) : undefined}
                        warnLabelIds={remainingMap[row.record_type] ? Object.entries(remainingMap[row.record_type]).filter(([, n]) => n <= 0).map(([id]) => id) : undefined}
                        onChange={(v) => {
                          const name = typeof v === "string" ? v : v[0] || ""
                          if (!name) {
                            updateRowMulti(row.key, { owner_id: "", owner_name: "" })
                          }
                        }}
                        onSelectItem={(c) => {
                          selectOwner(row, c)
                        }}
                        onBlur={(v) => {
                          if (v && !invitedOwnerCustomers.some(c => c.nickname === v || c.name === v)) {
                            updateRowMulti(row.key, { owner_id: "", owner_name: "" })
                          }
                        }}
                        placeholder=""
                        className="h-7 w-[74px] [&]:border-[0.5px] [&]:text-[12px]"
                        dropdownWidth={114}
                      />
                    ) : row.record_type === "eks" ? (
                      <div className="flex items-center gap-1 min-w-0">
                        <CustomerSearchInput rounded="2px"
                          customers={invitedOwnerCustomers}
                          value={row.owner_name || ""}
                          showClear={false}
                          excludeIds={[...row.host_ids, ...row.participant_ids]}
                          rightLabelMap={remainingMap.eks ? Object.fromEntries(Object.entries(remainingMap.eks).map(([id, n]) => [id, `余${n}`])) : undefined}
                          warnLabelIds={remainingMap.eks ? Object.entries(remainingMap.eks).filter(([, n]) => n <= 0).map(([id]) => id) : undefined}
                          onChange={(v) => {
                            const name = typeof v === "string" ? v : v[0] || ""
                            if (!name) {
                              if (row.owner_id) prevOwnerRef.current[row.key] = row.owner_id
                              const currentRow = rowsRef.current.find(r => r.key === row.key)
                              const eksDesc = parseEksDescription(currentRow?.billing_description || row.billing_description)
                              updateRowMulti(row.key, { owner_id: "", owner_name: "", billing_description: serializeEksDescription("", "", eksDesc.count) })
                            }
                          }}
                          onSelectItem={(c) => {
                            selectOwner(row, c)
                          }}
                          onBlur={(v) => {
                            if (v && !invitedOwnerCustomers.some(c => c.nickname === v || c.name === v)) {
                              const currentRow = rowsRef.current.find(r => r.key === row.key)
                              const eksDesc = parseEksDescription(currentRow?.billing_description || row.billing_description)
                              updateRowMulti(row.key, { owner_id: "", owner_name: "", billing_description: serializeEksDescription("", "", eksDesc.count) })
                            }
                          }}
                          placeholder=""
                          className="h-7 w-[74px] [&]:border-[0.5px] [&]:text-[12px]"
                          dropdownWidth={114}
                        />
                      </div>
                    ) : null}
                  </td>}

                  {/* 销卡 */}
                  {hasEks && <td className={`px-0 py-0.5 text-center align-top ${isCellChanged(row.key, "deduction_count") ? "bg-[#f5eeff] rounded" : ""}`}>
                    {row.record_type === "eks" ? (rowReadOnly ? (
                      <span className="inline-flex h-7 items-center text-[12px] text-[#2b2f36] tabular-nums">
                        {row.deduction_count || "-"}
                      </span>
                    ) : (() => {
                      const remaining = row.owner_id ? remainingMap.eks?.[row.owner_id] : undefined
                      return (
                        <input
                          type="number"
                          min={1}
                          value={eksCountEditRef.current[`dc_${row.key}`] ?? row.deduction_count}
                          onChange={(e) => {
                            const raw = e.target.value
                            eksCountEditRef.current[`dc_${row.key}`] = raw
                            const currentRow = rowsRef.current.find(r => r.key === row.key)
                            const eksDesc = parseEksDescription(currentRow?.billing_description || row.billing_description)
                            const ownerId = currentRow?.owner_id ?? row.owner_id
                            const ownerName = currentRow?.owner_name ?? row.owner_name
                            if (raw === "") {
                              const desc = serializeEksDescription(ownerId, ownerName, 0)
                              lastEditedEksRef.current = { ...(currentRow || row), deduction_count: 0, billing_description: desc }
                              if (row.record_id) eksEditsRef.current.set(row.record_id, { owner_id: row.owner_id, owner_name: row.owner_name, billing_description: desc })
                              updateRowMulti(row.key, { deduction_count: 0, billing_description: desc })
                            } else {
                              const count = Math.max(1, parseInt(raw) || 1)
                              const desc = serializeEksDescription(ownerId, ownerName, count)
                              lastEditedEksRef.current = { ...(currentRow || row), deduction_count: count, billing_description: desc }
                              if (row.record_id) eksEditsRef.current.set(row.record_id, { owner_id: row.owner_id, owner_name: row.owner_name, billing_description: desc })
                              updateRowMulti(row.key, { deduction_count: count, billing_description: desc })
                            }
                          }}
                          onBlur={() => {
                            delete eksCountEditRef.current[`dc_${row.key}`]
                            const currentRow = rowsRef.current.find(r => r.key === row.key)
                            const eksDesc = parseEksDescription(currentRow?.billing_description || row.billing_description)
                            const ownerId = currentRow?.owner_id ?? row.owner_id
                            const ownerName = currentRow?.owner_name ?? row.owner_name
                            let count = eksDesc.count
                            if (count < 1) count = 1
                            if (count !== eksDesc.count || eksDesc.id !== ownerId || eksDesc.name !== ownerName) {
                              updateRowMulti(row.key, { deduction_count: count, billing_description: serializeEksDescription(ownerId, ownerName, count) })
                            }
                          }}
                          className="w-[34px] h-7 text-center rounded-[2px] border-[0.5px] border-[#e8eaed] bg-transparent outline-none focus:border-[#3370ff] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        />
                      )
                    })()) : null}
                  </td>}

                  {/* 活动方式 */}
                  <td className={`px-1 py-0.5 align-top ${isCellChanged(row.key, "activity_mode") ? "bg-[#f5eeff] rounded" : ""}`}>
                    {rowReadOnly ? (
                      <span className="inline-flex h-7 items-center text-[12px] text-[#2b2f36]">
                        {row.activity_mode || "-"}
                      </span>
                    ) : (
                      <SelectDropdown rounded="[2px]"
                        size="sm"
                        value={row.activity_mode || "线下"}
                        options={ACTIVITY_MODE_OPTIONS}
                        onChange={(v) => updateRow(row.key, "activity_mode", v)}
                        className="[&_button]:border-[0.5px] [&_button]:h-7 [&_button]:text-[12px]"
                        hideChevron
                      />
                    )}
                  </td>

                  {/* 扣卡次数 */}
                  <td className={`px-1 py-0.5 text-center align-top ${isCellChanged(row.key, "membership_deduction_count") ? "bg-[#f5eeff] rounded" : ""}`}>
                    {row.record_type === "eks" || row.record_type === "ics" ? (
                      <span className="inline-flex h-7 items-center text-[#c9cdd4]">-</span>
                    ) : rowReadOnly ? (
                      <span className="inline-flex h-7 items-center text-[12px] text-[#2b2f36] tabular-nums">
                        {row.is_public_welfare ? 0 : row.membership_deduction_count}
                      </span>
                    ) : (
                      <input
                        type="number"
                        min={row.is_public_welfare ? 0 : 1}
                        value={row.is_public_welfare
                          ? 0
                          : membershipDeductionDrafts[row.key] ?? row.membership_deduction_count}
                        disabled={row.is_public_welfare}
                        onFocus={(e) => {
                          setMembershipDeductionDrafts(prev => ({
                            ...prev,
                            [row.key]: String(row.membership_deduction_count),
                          }))
                          e.currentTarget.select()
                        }}
                        onChange={(e) => {
                          const raw = e.target.value
                          setMembershipDeductionDrafts(prev => ({ ...prev, [row.key]: raw }))
                          if (raw === "") return
                          const count = Math.max(1, Number.parseInt(raw, 10) || 1)
                          if (count !== row.membership_deduction_count) {
                            updateRow(row.key, "membership_deduction_count", count)
                          }
                        }}
                        onBlur={() => {
                          const raw = membershipDeductionDrafts[row.key]
                          setMembershipDeductionDrafts(prev => {
                            const next = { ...prev }
                            delete next[row.key]
                            return next
                          })
                          if (raw === undefined) return
                          const count = Math.max(1, Number.parseInt(raw, 10) || 1)
                          const currentRow = rowsRef.current.find(item => item.key === row.key)
                          if (count !== currentRow?.membership_deduction_count) {
                            updateRow(row.key, "membership_deduction_count", count)
                          }
                        }}
                        className="h-7 w-[48px] rounded-[2px] border-[0.5px] border-[#e8eaed] bg-transparent text-center text-[12px] text-[#2b2f36] tabular-nums outline-none focus:border-[#3370ff] disabled:cursor-not-allowed disabled:bg-[#f7f8fa] disabled:text-[#8f959e] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      />
                    )}
                  </td>

                  {/* 老师 */}
                  <td className={`px-1 py-0.5 align-top ${isCellChanged(row.key, "host_names") || isCellChanged(row.key, "host_ids") ? "bg-[#f5eeff] rounded" : ""}`}>
                    {rowReadOnly ? (
                      <span className={`inline-flex h-7 w-full items-center truncate text-[12px] ${hostDisplayText ? "text-[#2b2f36]" : "text-[#c9cdd4]"}`} title={hostDisplayText}>
                        {hostDisplayText || "-"}
                      </span>
                    ) : (
                      <CustomerSearchInput rounded="2px"
                        multi
                        compactMulti
                        dropdownWidth={320}
                        customers={customers}
                        value={getHostDisplay(row)}
                        excludeIds={[row.owner_id, ...row.participant_ids].filter(Boolean)}
                        onChange={(v) => {
                          const names = Array.isArray(v) ? v : v ? [v] : []
                          const ids = names.map(n => {
                            const c = customers.find(c => c.nickname === n || c.name === n)
                            return c?.id || ""
                          }).filter(Boolean)
                          updateRow(row.key, "host_ids", ids)
                          setRows(prev => prev.map(r => r.key === row.key ? { ...r, host_names: names } : r))
                        }}
                        positionFilter={TEACHER_POSITION_MAP[row.record_type]}
                        filterSelected
                        placeholder="选择老师"
                        className="h-7 [&]:border-[0.5px] [&]:text-[11px]"
                      />
                    )}
                  </td>

                  {/* 活动简介 */}
                  <td
                    className={`px-1 py-0.5 align-top ${isCellChanged(row.key, "description") ? "bg-[#f5eeff] rounded" : ""}`}
                    style={{ verticalAlign: "top" }}
                  >
                    {rowReadOnly ? (
                      <span className={`inline-flex h-7 w-full items-center truncate text-[12px] ${row.description ? "text-[#2b2f36]" : "text-[#c9cdd4]"}`} title={row.description}>
                        {row.description.replace(/\s+/g, " ").trim() || "-"}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setDescriptionDraft(row.description)
                          setEditingDescriptionKey(row.key)
                        }}
                        title={row.description}
                        className="flex h-7 w-full items-center overflow-hidden rounded-[2px] border-[0.5px] border-input bg-transparent px-2 text-left text-[12px] text-[#2b2f36] outline-none hover:border-[#c9cdd4] focus:border-[#3370ff]"
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {row.description.replace(/\s+/g, " ").trim()}
                        </span>
                      </button>
                    )}
                  </td>

                  {/* 老人 */}
                  <td className={`px-1 py-0.5 ${isCellChanged(row.key, "participant_ids") ? "bg-[#f5eeff] rounded" : ""}`}>
                    <span className="text-[#4e535a]">
                      {oldMembers.map((m, i) => (
                        <span key={m.id}>
                          {i > 0 && "、"}
                          <button
                            onClick={() => {
                              const newIds = row.participant_ids.filter(id => id !== m.id)
                              updateRow(row.key, "participant_ids", newIds)
                            }}
                            className="hover:text-[#e02020] cursor-pointer"
                          >
                            {m.name}
                          </button>
                        </span>
                      ))}
                    </span>
                  </td>

                  {/* 新人 */}
                  <td className={`px-1 py-0.5 ${isCellChanged(row.key, "participant_ids") ? "bg-[#f5eeff] rounded" : ""}`}>
                    <span className="text-[#4e535a]">
                      {newMembers.map((m, i) => (
                        <span key={m.id}>
                          {i > 0 && "、"}
                          <button
                            onClick={() => {
                              const newIds = row.participant_ids.filter(id => id !== m.id)
                              updateRow(row.key, "participant_ids", newIds)
                            }}
                            className="hover:text-[#e02020] cursor-pointer"
                          >
                            {m.name}
                          </button>
                        </span>
                      ))}
                    </span>
                  </td>

                  {/* 发布到客户端 */}
                  <td className={`sticky right-[68px] z-10 px-1 py-0.5 text-center align-top ${isCellChanged(row.key, "is_published") ? "bg-[#f5eeff] rounded" : "bg-white"}`}>
                    <div className="flex h-7 items-center justify-center">
                      <input
                        type="checkbox"
                        checked={row.is_published}
                        onChange={(e) => updateRow(row.key, "is_published", e.target.checked)}
                        aria-label={`发布${row.name || "活动"}`}
                        className="h-3.5 w-3.5 appearance-none border border-[#e8eaed] rounded-[2px] bg-white checked:bg-white checked:border-[#6b9dff] checked:bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2012%2012%22%3E%3Cpath%20fill%3D%22none%22%20stroke%3D%22%236b9dff%22%20stroke-width%3D%221.5%22%20d%3D%22M3%206l2%202%204-4%22%2F%3E%3C%2Fsvg%3E')] bg-center bg-no-repeat cursor-pointer"
                      />
                    </div>
                  </td>

                  {/* 操作 */}
                  <td className="sticky right-0 z-10 w-[68px] bg-white px-1 py-0.5 text-center">
                    {rowReadOnly ? (
                      <span
                        className="inline-flex h-7 max-w-[60px] items-center truncate text-[12px] text-[#8f959e]"
                        title="公益、时间、类型、名称、老师、方式、扣卡、案主、部位、简介及删除仅创建人可操作"
                      >
                        {row.created_by || "未记录"}
                      </span>
                    ) : (
                      <div className="flex h-7 items-center justify-center gap-1">
                        <span className="text-[11px] text-[#8f959e]">自己</span>
                        <button
                          onClick={() => handleDelete(row)}
                          className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-[#8f959e] hover:text-[#e02020]"
                          aria-label="删除"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        </div>
      </div>
      </div>

      <HorizontalScrollbar scrollRef={scrollRef} />

      {!isPreview && (
        <div className="px-3 py-2.5 border-t border-[#f0f1f2] flex items-center">
          <button
            onClick={() => handleCreate("class", courseTypes.length > 0 ? courseTypes[0].name : "")}
            className="flex items-center gap-1 text-[12px] text-[#3370ff] hover:text-[#2860e1]"
          >
            <Plus className="h-3.5 w-3.5" />
            添加一行
          </button>
        </div>
      )}

      <Dialog open={editingDescriptionKey !== null} onOpenChange={(open) => { if (!open) closeDescriptionDialog() }}>
        <DialogContent className="w-[440px] max-w-[90vw] p-0 gap-0">
          <DialogHeader className="px-6 pt-3 pb-2 border-b border-[#f0f0f0]">
            <DialogTitle className="text-[14px] font-normal">小程序活动简介</DialogTitle>
          </DialogHeader>
          <div className="bg-[#f7f8fa] px-5 py-5">
            <div className="mx-auto w-[375px] max-w-full bg-[#f4f5f6] px-[22px] py-[26px]">
              <div className="flex items-center">
                <span className="mr-[10px] h-[14px] w-[3px] shrink-0 rounded-[2px] bg-[#c9f24b]" />
                <span className="text-[15px] font-medium tracking-[1.5px] text-[#212631]">活动介绍</span>
              </div>
              <textarea
                autoFocus
                ref={fitDescriptionPreview}
                value={descriptionDraft}
                onChange={(event) => {
                  fitDescriptionPreview(event.currentTarget)
                  setDescriptionDraft(event.target.value)
                }}
                placeholder="请输入活动简介，支持回车换行"
                className="mt-4 block min-h-[180px] max-h-[440px] w-full resize-none overflow-y-auto whitespace-pre-wrap break-words border-0 bg-transparent p-0 text-[15px] leading-[1.95] tracking-[0.5px] text-[#212631] outline-none placeholder:text-[#a8b1bd]"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-[#f0f0f0] px-5 py-3">
            <Button variant="outline" size="sm" className="h-8 text-[12px]" onClick={closeDescriptionDialog}>取消</Button>
            <Button size="sm" className="h-8 text-[12px]" onClick={saveDescription}>保存</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
