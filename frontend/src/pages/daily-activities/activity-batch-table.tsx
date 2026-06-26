import { useState, useCallback, useRef, useEffect, useMemo } from "react"
import { GripVertical, Trash2, Plus } from "lucide-react"
import { Input } from "@/components/ui/input"
import {
  classRecordApi, groupCaseSessionApi, emotionalReleaseSessionApi,
  energyKnotSessionApi, internalCourseSessionApi, ohCardReadingSessionApi,
  courseTypeApi,
  type CustomerLight, type Space, type MemberIdentity, type CourseType,
} from "@/lib/api"
import { CustomerSearchInput } from "@/components/customer-search-input"
import { SelectDropdown } from "@/components/select-dropdown"
import { SpaceRoomDropdown } from "@/components/space-room-dropdown"
import type { CardCallbacks } from "./index"

type ActivityType = "class" | "gcs" | "ers" | "eks" | "ics" | "ocr"

const TYPE_BADGES: Record<ActivityType, { label: string; color: string; bg: string }> = {
  class: { label: "沙龙", color: "#8f959e", bg: "#f5f6f7" },
  gcs: { label: "觉醒", color: "#8f959e", bg: "#f5f6f7" },
  ers: { label: "情绪", color: "#8f959e", bg: "#f5f6f7" },
  eks: { label: "能量", color: "#8f959e", bg: "#f5f6f7" },
  ics: { label: "内部", color: "#8f959e", bg: "#f5f6f7" },
  ocr: { label: "OH卡", color: "#8f959e", bg: "#f5f6f7" },
}

const TYPE_NAMES: Record<ActivityType, string> = {
  class: "沙龙", gcs: "觉醒游戏", ers: "情绪释放", eks: "能量结", ics: "内部课程", ocr: "OH卡梳理",
}

const ICS_COURSE_LABELS: Record<string, string> = {
  "疗愈师课程": "疗愈师", "疗愈师课程：自爱力构建": "疗愈师",
  "商业框架陪跑": "陪跑", "商业框架陪跑：自觉力提升": "陪跑",
  "落地赋能班": "赋能班", "落地赋能班：自洽力整合": "赋能班",
}

function getTypeBadge(type: ActivityType, courseName?: string, classCourseType?: string): { label: string; color: string; bg: string } {
  if (type === "class" && classCourseType) {
    return { ...TYPE_BADGES.class, label: classCourseType.length > 3 ? classCourseType.slice(0, 3) : classCourseType }
  }
  if (type === "ics" && courseName) {
    const label = ICS_COURSE_LABELS[courseName]
    if (label) return { ...TYPE_BADGES.ics, label }
    if (courseName.startsWith("疗愈师")) return { ...TYPE_BADGES.ics, label: "疗愈师" }
    if (courseName.startsWith("商业框架") || courseName.startsWith("陪跑")) return { ...TYPE_BADGES.ics, label: "陪跑" }
    if (courseName.startsWith("落地赋能") || courseName.startsWith("赋能")) return { ...TYPE_BADGES.ics, label: "赋能班" }
  }
  return TYPE_BADGES[type]
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

const TYPE_OPTIONS = [
  { value: "class", label: "沙龙活动" },
  { value: "gcs", label: "觉醒游戏" },
  { value: "ers", label: "情绪释放" },
  { value: "ocr", label: "OH卡梳理" },
  { value: "eks", label: "能量结" },
  { value: "ics:疗愈师课程", label: "疗愈师课程" },
  { value: "ics:商业框架陪跑", label: "商业框架陪跑" },
  { value: "ics:落地赋能班", label: "落地赋能班" },
]

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
const TEACHER_POSITION_MAP: Record<string, string> = {
  class: "课程老师",
  gcs: "成就君",
  ocr: "成就君",
  ers: "成就君",
  eks: "能量结老师",
  ics: "课程老师",
}

const ACTIVITY_MODE_OPTIONS = [
  { value: "线下", label: "线下" },
  { value: "线上", label: "线上" },
]

interface ActivityRow {
  key: number
  record_id: string
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
  deduction_count: number
  space_id: string
  room_id: string
  description: string
  pendingCreate: boolean
  raw: any
}

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
  } else if (type === "gcs" || type === "ers" || type === "ocr") {
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
  } else if (type === "gcs" || type === "ocr") {
    participantIds = [...(data.participant_ids || [])].filter(Boolean)
  } else if (type === "ers") {
    participantIds = [...(data.participant_ids || [])].filter(Boolean)
  } else if (type === "eks") {
    participantIds = [...(data.participant_ids || [])].filter(Boolean)
  } else if (type === "ics") {
    participantIds = [...(data.participant_ids || [])].filter(Boolean)
  }

  const desc = (type === "class" || type === "ics") ? (data.course_description || "") : (data.description || "")
  const sid = data.space_id || defaultSpaceId || ""
  const rid = data.room_id || (spaces.find(s => s.id === sid)?.rooms?.[0]?.id || "")

  return {
    key, record_id: data.id, record_type: type,
    ics_course_key: type === "ics" ? resolveIcsCourseKey(name) : "",
    class_course_type: type === "class" ? classCourseType : "",
    start_time: data.start_time || "", end_time: data.end_time || "",
    name, course_id: type === "class" ? (data.course_id || "") : "",
    owner_id: ownerId, owner_name: ownerName,
    host_ids: hostIds, host_names: hostNames,
    participant_ids: participantIds,
    activity_mode: data.activity_mode || "线下",
    is_public_welfare: data.is_public_welfare || false,
    deduction_count: type === "eks" ? parseEksDescription(data.description || "").count : (data.is_public_welfare ? 0 : 1),
    space_id: sid, room_id: rid,
    description: desc,
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
    ics_course_key: "", class_course_type: "",
    start_time: "", end_time: "",
    name: "", course_id: "",
    owner_id: "", owner_name: "",
    host_ids: [], host_names: [],
    participant_ids: [],
    activity_mode: "线下",
    is_public_welfare: false,
    deduction_count: 1,
    space_id: sid, room_id: rid,
    description: "",
    pendingCreate: true,
    raw: {},
  }
}

type RowStatus = "idle" | "saving" | "saved" | "error"

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
}

interface ActivityBatchTableProps {
  date: string
  courses: {id: string, name: string}[]
  customers: CustomerLight[]
  teachers: CustomerLight[]
  spaces: Space[]
  spaceId?: string
  records: { type: "class" | "gcs" | "ers" | "eks" | "ics" | "ocr"; data: any }[]
  onReload: () => void
  callbacks: CardCallbacks
  getMemberName: (id: string) => string
  memberIdentities?: MemberIdentity[]
  onSavingCountChange?: (count: number) => void
  onSavedCountChange?: (count: number) => void
  onUndoRedoChange?: (canUndo: boolean, canRedo: boolean, undo: () => void, redo: () => void, history: HistoryEntry[]) => void
  onRestoreRef?: (restore: (entry: HistoryEntry) => void) => void
  onCaptureRef?: (capture: () => void) => void
  onHistoryPushed?: (entry: HistoryEntry) => void
  previewRows?: ActivityRow[]
  previewChangedKeys?: number[]
  previewChangedCells?: ChangedCell[]
  locked?: boolean
  onClosePreview?: () => void
}

export function ActivityBatchTable({
  date, courses, customers, teachers, spaces, spaceId,
  records, onReload, callbacks, getMemberName, memberIdentities,
  onSavingCountChange, onSavedCountChange, onUndoRedoChange, onRestoreRef, onCaptureRef, onHistoryPushed,
  previewRows, previewChangedKeys, previewChangedCells, locked, onClosePreview,
}: ActivityBatchTableProps) {
  const [rows, setRows] = useState<ActivityRow[]>([])
  const [rowStatus, setRowStatus] = useState<Record<number, RowStatus>>({})
  const [dragOverKey, setDragOverKey] = useState<number | null>(null)
  const dragKeyRef = useRef<number | null>(null)
  const eksCountEditRef = useRef<Record<string, string>>({})
  const lastEditedEksRef = useRef<ActivityRow | null>(null)
  const eksEditsRef = useRef<Map<string, { owner_id: string; owner_name: string; description: string }>>(new Map())
  const [remainingMap, setRemainingMap] = useState<Record<string, Record<string, number>>>({})
  const fetchedRemainingRef = useRef<Set<string>>(new Set())
  const prevOwnerRef = useRef<Record<number, string>>({})
  const [courseTypes, setCourseTypes] = useState<CourseType[]>([])

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
  const historyPushedRef = useRef(false)
  const saveRowRef = useRef<(row: ActivityRow) => Promise<void>>(() => Promise.resolve())

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
    historyPushedRef.current = true
    onHistoryPushed?.(entry)
  }, [getUserName, onHistoryPushed])

  const undo = useCallback(() => {
    setUndoStack(prev => {
      if (prev.length === 0) return prev
      const entry = prev[prev.length - 1]
      const currentEntry: HistoryEntry = {
        timestamp: Date.now(), action: "撤回", userName: getUserName(),
        rows: rowsRef.current.map(r => ({ ...r }))
      }
      setRedoStack(r => [...r, currentEntry])
      setRows(entry.rows)
      const statuses: Record<number, RowStatus> = {}
      entry.rows.forEach(r => { statuses[r.key] = r.record_id ? "saved" : "idle" })
      setRowStatus(statuses)
      entry.rows.forEach(row => { if (row.record_id && !row.pendingCreate) saveRowRef.current(row) })
      return prev.slice(0, -1)
    })
  }, [getUserName])

  const redo = useCallback(() => {
    setRedoStack(prev => {
      if (prev.length === 0) return prev
      const entry = prev[prev.length - 1]
      const currentEntry: HistoryEntry = {
        timestamp: Date.now(), action: "重做", userName: getUserName(),
        rows: rowsRef.current.map(r => ({ ...r }))
      }
      setUndoStack(u => [...u, currentEntry])
      setRows(entry.rows)
      const statuses: Record<number, RowStatus> = {}
      entry.rows.forEach(r => { statuses[r.key] = r.record_id ? "saved" : "idle" })
      setRowStatus(statuses)
      entry.rows.forEach(row => { if (row.record_id && !row.pendingCreate) saveRowRef.current(row) })
      return prev.slice(0, -1)
    })
  }, [getUserName])

  // 通知父组件撤回/重做状态和历史记录
  useEffect(() => {
    onUndoRedoChange?.(undoStack.length > 0, redoStack.length > 0, undo, redo, undoStack)
  }, [undoStack, redoStack, undo, redo, onUndoRedoChange])

  // 恢复历史版本函数
  const restoreFromHistory = useCallback((entry: HistoryEntry) => {
    pushHistory("恢复了历史版本")
    setRows(entry.rows)
    const statuses: Record<number, RowStatus> = {}
    entry.rows.forEach(r => { statuses[r.key] = r.record_id ? "saved" : "idle" })
    setRowStatus(statuses)
    entry.rows.forEach(row => { if (row.record_id && !row.pendingCreate) saveRowRef.current(row) })
  }, [pushHistory])

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
    const classChildren = courseTypes.map(t => ({ value: `class:${t.name}`, label: t.name }))
    return [
      { value: "class", label: "沙龙活动", children: classChildren },
      { value: "gcs", label: "觉醒游戏" },
      { value: "ers", label: "情绪释放" },
      { value: "ocr", label: "OH卡梳理" },
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

  const REMAINING_APIS: Record<string, (kw: string) => Promise<any[]>> = {
    eks: (kw) => energyKnotSessionApi.searchCustomers(kw),
    gcs: (kw) => groupCaseSessionApi.searchCustomers(kw),
    ers: (kw) => emotionalReleaseSessionApi.searchCustomers(kw),
    ocr: (kw) => ohCardReadingSessionApi.searchCustomers(kw),
  }

  const fetchRemaining = useCallback(async (type: string, customerId: string) => {
    if (!customerId) return
    const api = REMAINING_APIS[type]
    if (!api) return
    try {
      const results = await api("")
      const map: Record<string, number> = {}
      for (const r of results) map[r.id] = r.remaining
      setRemainingMap(prev => ({ ...prev, [type]: { ...prev[type], ...map } }))
    } catch {}
  }, [])

  // 从 records 加载行数据
  const prevRecordsRef = useRef<string | null>(null)
  useEffect(() => {
    const sig = records.map(r => `${r.type}-${r.data.id}`).join(",")
    if (prevRecordsRef.current !== null && sig === prevRecordsRef.current) return
    prevRecordsRef.current = sig

    const orderKey = `daily_activity_order_${date}_${spaceId || ""}`
    let savedOrder: string[] = []
    try { savedOrder = JSON.parse(localStorage.getItem(orderKey) || "[]") } catch {}

    let items = records.map(r => {
      const row = recordToRow(r.type, r.data, courses, spaceId || "", spaces)
      // 恢复 eks 编辑中的案主和部位数
      if (r.type === "eks" && r.data.id) {
        const edit = eksEditsRef.current.get(r.data.id)
        if (edit) {
          row.owner_id = edit.owner_id
          row.owner_name = edit.owner_name
          row.description = edit.description
        }
      }
      return row
    })
    if (savedOrder.length) {
      const orderMap = new Map(savedOrder.map((id, i) => [id, i]))
      items.sort((a, b) => (orderMap.get(`${a.record_type}-${a.record_id}`) ?? 999) - (orderMap.get(`${b.record_type}-${b.record_id}`) ?? 999))
    }

    // 无记录时默认一行
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
  }, [records, courses, date, spaceId, spaces, courseTypes])

  // 保存单行
  const saveRow = useCallback(async (row: ActivityRow) => {
    setRowStatus(prev => ({ ...prev, [row.key]: "saving" }))
    try {
      const type = row.record_type
      const space = spaces.find(s => s.id === row.space_id)
      const room = space?.rooms?.find(r => r.id === row.room_id)
      const common = {
        start_time: row.start_time || null,
        end_time: row.end_time || null,
        activity_mode: row.activity_mode,
        space_id: row.space_id || undefined,
        room_id: row.room_id || undefined,
        space_name: space?.name || undefined,
        room_name: room?.name || undefined,
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
        } else if (type === "gcs" || type === "ers" || type === "ocr") {
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
          createData.description = row.description || ""
        } else if (type === "ics") {
          createData.course_type = row.ics_course_key?.replace("ics:", "") || ""
          createData.course_name = row.name || ""
          createData.course_description = row.description || ""
          createData.teacher_ids = row.host_ids
        }

        let result: any
        if (type === "class") result = await classRecordApi.create(createData)
        else if (type === "gcs") result = await groupCaseSessionApi.create(createData)
        else if (type === "ers") result = await emotionalReleaseSessionApi.create(createData)
        else if (type === "eks") result = await energyKnotSessionApi.create(createData)
        else if (type === "ics") result = await internalCourseSessionApi.create(createData)
        else if (type === "ocr") result = await ohCardReadingSessionApi.create(createData)

        // 更新行：标记为已创建
        setRows(prev => {
          const next = prev.map(r => r.key === row.key ? {
            ...r, record_id: result?.id || "", pendingCreate: false, raw: result || {},
          } : r)
          // 保存顺序
          const orderKey = `daily_activity_order_${date}_${spaceId || ""}`
          try {
            const order = next.map(r => `${r.record_type}-${r.record_id}`)
            localStorage.setItem(orderKey, JSON.stringify(order))
          } catch {}
          return next
        })
      } else {
        // 更新已有记录
        const id = row.record_id
        if (type === "class") {
          const course = courses.find(c => c.id === row.course_id)
          await classRecordApi.update(id, {
            ...common,
            course_id: row.course_id,
            course_name: course?.name || row.name,
            course_type: row.class_course_type || "",
            course_description: row.description,
            teacher_ids: row.host_ids,
            is_public_welfare: row.is_public_welfare,
            participant_ids: row.participant_ids,
          })
        } else if (type === "gcs") {
          await groupCaseSessionApi.update(id, {
            ...common,
            name: row.name,
            owner_id: row.owner_id || row.raw.owner_id,
            owner_name: row.owner_name || row.raw.owner_name,
            teacher_ids: row.host_ids,
            participant_ids: row.participant_ids,
            description: row.description,
          })
        } else if (type === "ers") {
          await emotionalReleaseSessionApi.update(id, {
            ...common,
            name: row.name,
            owner_id: row.owner_id || row.raw.owner_id,
            owner_name: row.owner_name || row.raw.owner_name,
            teacher_ids: row.host_ids,
            description: row.description,
            participant_ids: row.participant_ids,
          })
        } else if (type === "eks") {
          await energyKnotSessionApi.update(id, {
            ...common,
            owner_id: row.owner_id || "",
            owner_name: row.owner_name || "",
            name: row.name || "",
            teacher_ids: row.host_ids,
            description: row.description,
            participant_ids: row.participant_ids,
          })
        } else if (type === "ics") {
          await internalCourseSessionApi.update(id, {
            ...common,
            course_type: row.ics_course_key?.replace("ics:", "") || "",
            course_name: row.name,
            course_description: row.description,
            teacher_ids: row.host_ids,
            participant_ids: row.participant_ids,
          })
        } else if (type === "ocr") {
          await ohCardReadingSessionApi.update(id, {
            ...common,
            name: row.name,
            owner_id: row.owner_id || row.raw.owner_id,
            owner_name: row.owner_name || row.raw.owner_name,
            teacher_ids: row.host_ids,
            description: row.description,
            participant_ids: row.participant_ids,
          })
        }
      }

      setRowStatus(prev => ({ ...prev, [row.key]: "saved" }))
      historyPushedRef.current = false
      if (row.record_type === "eks" && row.record_id) eksEditsRef.current.delete(row.record_id)
      // 保存后刷新剩余次数
      if (["eks", "gcs", "ers", "ocr"].includes(row.record_type)) {
        const customerId = row.owner_id || prevOwnerRef.current[row.key]
        if (customerId) {
          fetchRemaining(row.record_type, customerId)
          delete prevOwnerRef.current[row.key]
        }
        // 刷新所有参与者的剩余次数
        for (const pid of row.participant_ids) {
          fetchRemaining(row.record_type, pid)
        }
      }
    } catch (e: any) {
      console.error("[ACT] 保存失败:", e)
      setRowStatus(prev => ({ ...prev, [row.key]: "error" }))
    }
  }, [courses, spaceId, spaces, date, fetchRemaining])

  // 同步 saveRow 到 ref，供 undo/redo 使用
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
    name: "名称", start_time: "时间", end_time: "时间",
    activity_mode: "活动方式", description: "简介",
    is_public_welfare: "公益", participant_ids: "参与人",
    host_ids: "老师", host_names: "老师",
    owner_id: "案主", owner_name: "案主",
    space_id: "空间", room_id: "空间",
    deduction_count: "部位数",
  }

  const updateRow = useCallback((key: number, field: keyof ActivityRow, value: any) => {
    // 首次编辑时记录历史
    if (rowStatus[key] === "saved" || rowStatus[key] === "error") {
      if (!historyPushedRef.current) {
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
        // 传入编辑后的行快照
        const postRows = rowsRef.current.map(r => r.key === key ? { ...r, [field]: value } : { ...r })
        pushHistory("编辑了活动", [key], desc, postRows, [{ rowKey: key, fields: [field as string] }])
      }
      setRowStatus(prev => ({ ...prev, [key]: "idle" }))
    }
    setRows(prev => prev.map(r => r.key === key ? { ...r, [field]: value } : r))
    scheduleSave(key)
  }, [rowStatus, scheduleSave, pushHistory])

  // 删除按钮
  const handleDelete = useCallback((row: ActivityRow) => {
    // 不在确认前移除行，等父组件确认后由 loadDateData 同步
    if (row.record_type === "class") callbacks.onDeleteClass(row.record_id)
    else if (row.record_type === "gcs") callbacks.onDeleteGcs(row.record_id)
    else if (row.record_type === "ers") callbacks.onDeleteErs(row.record_id)
    else if (row.record_type === "eks") callbacks.onDeleteEks(row.record_id)
    else if (row.record_type === "ics") callbacks.onDeleteIcs(row.record_id)
    else if (row.record_type === "ocr") callbacks.onDeleteOcr(row.record_id)
  }, [callbacks])

  // 类型切换 → 删除旧记录 + 重置为新类型行
  const handleTypeChange = useCallback(async (rowKey: number, newType: string) => {
    const row = rowsRef.current.find(r => r.key === rowKey)
    if (!row) return
    // 解析复合值，如 "ics:疗愈师课程"
    const [parsedType, parsedCourse] = newType.includes(":") ? newType.split(":") : [newType, ""]
    const oldName = row.name || "未命名活动"
    const newTypeName = parsedCourse || TYPE_NAMES[parsedType as ActivityType] || parsedType
    const type = parsedType as ActivityType
    // 构造切换后的行，用于历史快照
    const switchedRow: ActivityRow = {
      ...row,
      record_type: type,
      ics_course_key: type === "ics" ? newType : "",
      class_course_type: type === "class" ? parsedCourse : "",
      record_id: "",
      pendingCreate: true,
      name: parsedCourse || TYPE_NAMES[type] || "",
      course_id: "",
      raw: {},
      deduction_count: type === "eks" ? 2 : 1,
    }
    const postRows = rowsRef.current.map(r => r.key === rowKey ? switchedRow : { ...r })
    pushHistory("切换了类型", [rowKey], `将「${oldName}」切换为${newTypeName}`, postRows, [{ rowKey, fields: ["record_type", "name"] }])
    // 同类型且同课程 → 忽略
    if (type === row.record_type && parsedCourse && parsedCourse === row.ics_course_key?.replace("ics:", "")) return

    // 删除旧记录（如果已保存到后端）
    if (row.record_id && !row.pendingCreate) {
      try {
        if (row.record_type === "class") await classRecordApi.delete(row.record_id)
        else if (row.record_type === "gcs") await groupCaseSessionApi.delete(row.record_id)
        else if (row.record_type === "ers") await emotionalReleaseSessionApi.delete(row.record_id)
        else if (row.record_type === "eks") await energyKnotSessionApi.delete(row.record_id)
        else if (row.record_type === "ics") await internalCourseSessionApi.delete(row.record_id)
        else if (row.record_type === "ocr") await ohCardReadingSessionApi.delete(row.record_id)
      } catch (e) {
        console.error("[ACT] 删除旧记录失败:", e)
      }
    }

    // 保留已有数据，只更新活动名称和类型相关字段
    const updated: ActivityRow = {
      ...row,
      record_type: type,
      ics_course_key: type === "ics" ? newType : "",
      class_course_type: type === "class" ? parsedCourse : "",
      record_id: "",
      pendingCreate: true,
      name: parsedCourse || TYPE_NAMES[type] || "",
      course_id: "",
      raw: {},
      deduction_count: type === "eks" ? 2 : 1,
    }
    setRows(prev => prev.map(r => r.key === rowKey ? updated : r))
    setRowStatus(prev => ({ ...prev, [rowKey]: "idle" }))
    lastEditedEksRef.current = null
    // 保存新记录
    try { await saveRow(updated) } catch { /* saveRow handles its own errors */ }
  }, [spaceId, spaces, saveRow, pushHistory])

  // 拖拽排序
  const handleDragStart = useCallback((key: number) => { dragKeyRef.current = key }, [])
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
          if (!targetRow) { setDragOverKey(null); return }
          const alreadyInRow = targetRow.owner_id === data.customer_id || targetRow.host_ids.includes(data.customer_id) || targetRow.participant_ids.includes(data.customer_id)
          if (!alreadyInRow) {
            const newParticipantIds = [...targetRow.participant_ids, data.customer_id]
            updateRow(targetKey, "participant_ids", newParticipantIds)
            saveRow({ ...targetRow, participant_ids: newParticipantIds })
          }
        }
      } catch {}
      setDragOverKey(null)
      return
    }
    // 内部排序
    if (sourceKey === null || sourceKey === targetKey) { setDragOverKey(null); return }
    pushHistory("调整了排序")
    setRows(prev => {
      const srcIdx = prev.findIndex(r => r.key === sourceKey)
      const tgtIdx = prev.findIndex(r => r.key === targetKey)
      if (srcIdx === -1 || tgtIdx === -1) return prev
      const next = [...prev]
      const [moved] = next.splice(srcIdx, 1)
      next.splice(tgtIdx, 0, moved)
      const orderKey = `daily_activity_order_${date}_${spaceId || ""}`
      try {
        const order = next.map(r => `${r.record_type}-${r.record_id}`)
        localStorage.setItem(orderKey, JSON.stringify(order))
      } catch {}
      return next
    })
    dragKeyRef.current = null
    setDragOverKey(null)
  }, [date, spaceId, updateRow, saveRow, pushHistory])

  // 获取 host 显示名称
  const getHostDisplay = useCallback((row: ActivityRow): string[] => {
    const pool = row.record_type === "class" ? teachers : customers
    return row.host_ids.map(id => {
      const c = pool.find(c => c.id === id)
      return c?.nickname || c?.name || ""
    }).filter(Boolean)
  }, [teachers, customers])

  const getParticipantNames = useCallback((ids: string[]): string[] => {
    return ids.map(id => getMemberName(id))
  }, [getMemberName])

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
    const types = ["eks", "gcs", "ers", "ocr"] as const
    for (const type of types) {
      if (fetchedRemainingRef.current.has(type)) continue
      fetchedRemainingRef.current.add(type)
      const api = REMAINING_APIS[type]
      if (!api) continue
      ;(async () => {
        try {
          const results = await api("")
          const map: Record<string, number> = {}
          for (const r of results) map[r.id] = r.remaining
          setRemainingMap(prev => ({ ...prev, [type]: { ...prev[type], ...map } }))
        } catch {
          fetchedRemainingRef.current.delete(type)
        }
      })()
    }
  }, [])

  const handleCreate = async (type: string, classCourseType?: string) => {
    const fresh = createFreshRow(type as ActivityType, spaceId || "", spaces)
    const newName = classCourseType || fresh.name || TYPE_NAMES[type as ActivityType] || "活动"
    const allFields = ["name", "record_type", "start_time", "end_time", "activity_mode", "description", "host_names", "owner_name", "participant_ids", "is_public_welfare", "space_id"]
    pushHistory("新增了活动", undefined, `新增了「${newName}」`, undefined, [{ rowKey: fresh.key, fields: allFields }])
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
        fresh.description = src.description
        fresh.deduction_count = parseEksDescription(src.description).count
      }
    }
    setRows(prev => [...prev, fresh])
    setRowStatus(prev => ({ ...prev, [fresh.key]: "idle" }))
    try { await saveRow(fresh) } catch { /* saveRow handles its own errors */ }
  }

  const hasEks = rows.some(r => r.record_type === "eks")
  const hasOwnerType = rows.some(r => r.record_type !== "class" && r.record_type !== "ics")

  // 预览模式：使用预览行数据
  const isPreview = !!previewRows
  const isLocked = locked || isPreview
  const displayRows = previewRows || rows
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

  return (
    <div className={`bg-white rounded-[2px] relative ${isLocked ? "activity-table-locked" : ""}`}>
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
      <div className="overflow-x-auto" style={{ scrollbarColor: "rgba(0,0,0,0.15) transparent" }}>
        <div className={hasOwnerType ? "min-w-[1367px]" : "min-w-[1211px]"}>
          <table className="text-[12px] w-full border-separate border-spacing-y-[6px]" style={{ tableLayout: "fixed" }}>
          <thead>
            <tr className="bg-[#f7f8fa] text-[#8f959e]">
              <th className="w-[24px]"></th>
              <th className="px-1.5 py-2 text-center font-normal w-[46px]">公益</th>
              <th className="px-1 py-2 text-left font-normal w-[122px]">时间</th>
              <th className="px-1 py-2 text-left font-normal w-[80px]">类型</th>
              <th className="px-1 py-2 text-left font-normal w-[140px]">活动名称</th>
              {hasOwnerType && <th className="px-1 py-2 text-left font-normal w-[86px]">案主</th>}
              {hasEks && <th className="py-2 text-center font-normal w-[40px]">销卡</th>}
              <th className="px-1 py-2 text-left font-normal w-[57px]">方式</th>
              <th className="px-1 py-2 text-left font-normal w-[110px]">老师</th>
              <th className="px-1 py-2 text-left font-normal w-[200px]">简介</th>
              <th className="px-1 py-2 text-left font-normal flex-1">老人</th>
              <th className="px-1 py-2 text-left font-normal flex-1">新人</th>
              <th className="px-1.5 py-2 text-center font-normal w-[42px] sticky right-0 bg-[#f7f8fa] z-10 relative before:content-[''] before:absolute before:top-0 before:bottom-0 before:-left-2 before:w-2 before:[background:linear-gradient(to_left,rgba(0,0,0,0.02),transparent)]">操作</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row) => {
              const isChanged = changedKeySet.has(row.key)
              const rowChangedFields = changedCellMap.get(row.key)
              const hasCellChanges = !!rowChangedFields && rowChangedFields.size > 0
              const badge = getTypeBadge(row.record_type, row.record_type === "ics" ? (row.ics_course_key?.replace("ics:", "") || row.name || "") : row.name, row.class_course_type)
              const participantNames = getParticipantNames(row.participant_ids)
              const { oldMembers, newMembers } = splitParticipants(row.participant_ids)
              const currentSpace = spaces.find(s => s.id === row.space_id)
              const roomOptions = (currentSpace?.rooms || []).map(r => ({ value: r.id, label: r.name }))
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
                      <input
                        type="checkbox"
                        checked={row.is_public_welfare}
                        onChange={(e) => updateRow(row.key, "is_public_welfare", e.target.checked)}
                        className="h-3.5 w-3.5 appearance-none border border-[#e8eaed] rounded-[2px] bg-white checked:bg-white checked:border-[#e8eaed] checked:bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2012%2012%22%3E%3Crect%20x%3D%223.5%22%20y%3D%223.5%22%20width%3D%225%22%20height%3D%225%22%20rx%3D%221%22%20fill%3D%22%23a0a5ab%22%2F%3E%3C%2Fsvg%3E')] bg-center bg-no-repeat cursor-pointer"
                      />
                    ) : null}
                    </div>
                  </td>

                  {/* 时间 */}
                  <td className={`px-1 py-0.5 align-top ${isCellChanged(row.key, "start_time") || isCellChanged(row.key, "end_time") ? "bg-[#f5eeff] rounded" : ""}`}>
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
                  </td>

                  {/* 类型 */}
                  <td className={`px-1 py-0.5 align-top ${isCellChanged(row.key, "record_type") ? "bg-[#f5eeff] rounded" : ""}`}>
                    <SelectDropdown rounded="[2px]"
                      size="sm"
                      value={getTypeSelectValue(row.record_type, row.name, row.class_course_type)}
                      options={typeOptions}
                      onChange={(v) => handleTypeChange(row.key, v)}
                      className="[&_button]:border-[0.5px] [&_button]:h-7 [&_button]:text-[12px]"
                      hideChevron
                      dropdownWidth={110}
                    />
                  </td>

                  {/* 活动名称 */}
                  <td className={`px-1 py-0.5 align-top ${isCellChanged(row.key, "name") ? "bg-[#f5eeff] rounded" : ""}`}>
                    {["class", "ics", "gcs", "ers", "ocr", "eks"].includes(row.record_type) ? (
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
                    {(row.record_type === "gcs" || row.record_type === "ers" || row.record_type === "ocr") ? (
                      <CustomerSearchInput rounded="2px"
                        customers={customers}
                        value={row.owner_name || ""}
                        showClear={false}
                        excludeIds={[...row.host_ids, ...row.participant_ids]}
                        rightLabelMap={remainingMap[row.record_type] ? Object.fromEntries(Object.entries(remainingMap[row.record_type]).map(([id, n]) => [id, `余${n}`])) : undefined}
                        warnLabelIds={remainingMap[row.record_type] ? Object.entries(remainingMap[row.record_type]).filter(([, n]) => n <= 0).map(([id]) => id) : undefined}
                        onChange={(v) => {
                          const name = typeof v === "string" ? v : v[0] || ""
                          if (!name) {
                            setRows(prev => prev.map(r => r.key === row.key ? { ...r, owner_id: "", owner_name: "" } : r))
                            scheduleSave(row.key)
                          }
                        }}
                        onSelectItem={(c) => {
                          setRows(prev => prev.map(r => r.key === row.key ? { ...r, owner_id: c.id, owner_name: c.nickname || c.name || "" } : r))
                          if (rowStatus[row.key] === "saved" || rowStatus[row.key] === "error") {
                            setRowStatus(prev => ({ ...prev, [row.key]: "idle" }))
                          }
                          scheduleSave(row.key)
                        }}
                        onBlur={(v) => {
                          if (v && !customers.some(c => c.nickname === v || c.name === v)) {
                            setRows(prev => prev.map(r => r.key === row.key ? { ...r, owner_id: "", owner_name: "" } : r))
                            scheduleSave(row.key)
                          }
                        }}
                        placeholder=""
                        className="h-7 w-[74px] [&]:border-[0.5px] [&]:text-[12px]"
                        dropdownWidth={114}
                      />
                    ) : row.record_type === "eks" ? (
                      <div className="flex items-center gap-1 min-w-0">
                        <CustomerSearchInput rounded="2px"
                          customers={customers}
                          value={row.owner_name || ""}
                          showClear={false}
                          excludeIds={[...row.host_ids, ...row.participant_ids]}
                          rightLabelMap={remainingMap.eks ? Object.fromEntries(Object.entries(remainingMap.eks).map(([id, n]) => [id, `余${n}`])) : undefined}
                          warnLabelIds={remainingMap.eks ? Object.entries(remainingMap.eks).filter(([, n]) => n <= 0).map(([id]) => id) : undefined}
                          onChange={(v) => {
                            const name = typeof v === "string" ? v : v[0] || ""
                            if (!name) {
                              if (row.owner_id) prevOwnerRef.current[row.key] = row.owner_id
                              setRows(prev => prev.map(r => {
                                if (r.key !== row.key) return r
                                const eksDesc = parseEksDescription(r.description)
                                return { ...r, owner_id: "", owner_name: "", description: serializeEksDescription("", "", eksDesc.count) }
                              }))
                              scheduleSave(row.key)
                            }
                          }}
                          onSelectItem={(c) => {
                            delete prevOwnerRef.current[row.key]
                            const eksDesc = parseEksDescription(row.description)
                            const newDesc = serializeEksDescription(c.id, c.nickname || c.name || "", eksDesc.count)
                            const updated = { ...row, owner_id: c.id, owner_name: c.nickname || c.name || "", description: newDesc }
                            lastEditedEksRef.current = updated
                            if (row.record_id) eksEditsRef.current.set(row.record_id, { owner_id: updated.owner_id, owner_name: updated.owner_name, description: updated.description })
                            setRows(prev => prev.map(r => r.key === row.key ? updated : r))
                            if (rowStatus[row.key] === "saved" || rowStatus[row.key] === "error") {
                              setRowStatus(prev => ({ ...prev, [row.key]: "idle" }))
                            }
                            scheduleSave(row.key)
                          }}
                          onBlur={(v) => {
                            if (v && !customers.some(c => c.nickname === v || c.name === v)) {
                              setRows(prev => prev.map(r => {
                                if (r.key !== row.key) return r
                                const eksDesc = parseEksDescription(r.description)
                                return { ...r, owner_id: "", owner_name: "", description: serializeEksDescription("", "", eksDesc.count) }
                              }))
                              scheduleSave(row.key)
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
                    {row.record_type === "eks" ? (() => {
                      const remaining = row.owner_id ? remainingMap.eks?.[row.owner_id] : undefined
                      return (
                        <input
                          type="number"
                          min={1}
                          value={eksCountEditRef.current[`dc_${row.key}`] ?? row.deduction_count}
                          onChange={(e) => {
                            const raw = e.target.value
                            eksCountEditRef.current[`dc_${row.key}`] = raw
                            if (raw === "") {
                              setRows(prev => prev.map(r => {
                                if (r.key !== row.key) return r
                                const eksDesc = parseEksDescription(r.description)
                                const updated = { ...r, deduction_count: 0, description: serializeEksDescription(eksDesc.id, eksDesc.name, 0) }
                                lastEditedEksRef.current = updated
                                if (r.record_id) eksEditsRef.current.set(r.record_id, { owner_id: r.owner_id, owner_name: r.owner_name, description: updated.description })
                                return updated
                              }))
                            } else {
                              const count = Math.max(1, parseInt(raw) || 1)
                              setRows(prev => prev.map(r => {
                                if (r.key !== row.key) return r
                                const eksDesc = parseEksDescription(r.description)
                                const updated = { ...r, deduction_count: count, description: serializeEksDescription(eksDesc.id, eksDesc.name, count) }
                                lastEditedEksRef.current = updated
                                if (r.record_id) eksEditsRef.current.set(r.record_id, { owner_id: r.owner_id, owner_name: r.owner_name, description: updated.description })
                                return updated
                              }))
                            }
                            if (rowStatus[row.key] === "saved" || rowStatus[row.key] === "error") {
                              setRowStatus(prev => ({ ...prev, [row.key]: "idle" }))
                            }
                            scheduleSave(row.key)
                          }}
                          onBlur={() => {
                            delete eksCountEditRef.current[`dc_${row.key}`]
                            const eksDesc = parseEksDescription(row.description)
                            let count = eksDesc.count
                            if (count < 1) count = 1
                            if (count !== eksDesc.count) {
                              setRows(prev => prev.map(r => {
                                if (r.key !== row.key) return r
                                return { ...r, deduction_count: count, description: serializeEksDescription(eksDesc.id, eksDesc.name, count) }
                              }))
                              scheduleSave(row.key)
                            }
                          }}
                          className="w-[34px] h-7 text-center rounded-[2px] border-[0.5px] border-[#e8eaed] bg-transparent outline-none focus:border-[#3370ff] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        />
                      )
                    })() : null}
                  </td>}

                  {/* 活动方式 */}
                  <td className={`px-1 py-0.5 align-top ${isCellChanged(row.key, "activity_mode") ? "bg-[#f5eeff] rounded" : ""}`}>
                    <SelectDropdown rounded="[2px]"
                      size="sm"
                      value={row.activity_mode || "线下"}
                      options={ACTIVITY_MODE_OPTIONS}
                      onChange={(v) => updateRow(row.key, "activity_mode", v)}
                      className="[&_button]:border-[0.5px] [&_button]:h-7 [&_button]:text-[12px]"
                      hideChevron
                    />
                  </td>

                  {/* 老师 */}
                  <td className={`px-1 py-0.5 align-top ${isCellChanged(row.key, "host_names") || isCellChanged(row.key, "host_ids") ? "bg-[#f5eeff] rounded" : ""}`}>
                    <CustomerSearchInput rounded="2px"
                      multi
                      customers={customers}
                      value={getHostDisplay(row)}
                      excludeIds={[row.owner_id, ...row.participant_ids].filter(Boolean)}
                      onChange={(v) => {
                        const names = Array.isArray(v) ? v : v ? [v] : []
                        const ids = names.map(n => {
                          const c = customers.find(c => c.nickname === n || c.name === n)
                          return c?.id || ""
                        }).filter(Boolean)
                        setRows(prev => prev.map(r => r.key === row.key ? { ...r, host_ids: ids, host_names: names } : r))
                        if (rowStatus[row.key] === "saved" || rowStatus[row.key] === "error") {
                          setRowStatus(prev => ({ ...prev, [row.key]: "idle" }))
                        }
                        scheduleSave(row.key)
                      }}
                      positionFilter={TEACHER_POSITION_MAP[row.record_type]}
                      filterSelected
                      className="h-7 [&]:border-[0.5px] [&]:text-[11px]"
                    />
                  </td>

                  {/* 活动简介 */}
                  <td className={`px-1 py-0.5 align-top ${isCellChanged(row.key, "description") ? "bg-[#f5eeff] rounded" : ""}`}>
                    {row.record_type === "eks" ? null : (
                      <Input rounded="[2px]"
                        value={row.description}
                        onChange={(e) => updateRow(row.key, "description", e.target.value)}
                        placeholder=""
                        className="h-7 text-[12px] [&]:border-[0.5px]"
                      />
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
                              saveRow({ ...row, participant_ids: newIds })
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
                              saveRow({ ...row, participant_ids: newIds })
                            }}
                            className="hover:text-[#e02020] cursor-pointer"
                          >
                            {m.name}
                          </button>
                        </span>
                      ))}
                    </span>
                  </td>

                  {/* 操作 */}
                  <td className="px-1 py-0.5 text-center sticky right-0 z-10 bg-white relative align-top before:content-[''] before:absolute before:top-0 before:bottom-0 before:-left-2 before:w-2 before:[background:linear-gradient(to_left,rgba(0,0,0,0.02),transparent)]">
                    <button
                      onClick={() => handleDelete(row)}
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
    </div>
  )
}
