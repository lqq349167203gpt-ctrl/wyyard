import { useEffect, useState, useRef, useMemo, useCallback, memo, startTransition } from "react"
import { useNavigate } from "react-router-dom"
import { useEnterToNext } from "@/hooks/use-enter-to-next"
import { Plus, Trash2, Edit, ChevronRight, ChevronLeft, FileUp, Download, File, ChevronDown, Loader2, BookOpen, X, Sparkles, Heart, Zap, GraduationCap, Layers, Undo2, Redo2, Clock, UserMinus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { SelectDropdown } from "@/components/select-dropdown"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  classRecordApi, groupCaseSessionApi,
  emotionalReleaseSessionApi,
  energyKnotSessionApi, energyKnotApi,
  internalCourseSessionApi, courseTypeApi, customerApi, uploadApi, spaceApi,
  activityThemeApi, memberIdentityApi,
  type ClassRecord, type GroupCaseSession, type EmotionalReleaseSession,
  type EnergyKnotSession, type InternalCourseSession,
  type CourseType, type CustomerLight, type Space,
  type InternalCourseSessionCustomerSearchResult,
  type GroupCaseCustomerSearchResult,
  type ActivityTheme, type MemberIdentity,
} from "@/lib/api"
import { SpaceDropdown } from "@/components/space-dropdown"
import { CalendarDatePicker } from "@/components/calendar-date-picker"
import { ActivityBatchTable, type HistoryEntry } from "./activity-batch-table"
import { activityHistoryApi, type ActivityHistoryRecord } from "@/lib/api"
import { POSITION_ENERGY_TEACHER, POSITION_COURSE_TEACHER } from "@/lib/positions"

// ===== Date utilities =====

function formatDate(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r
}
function getWeekday(d: string): string {
  return ["日", "一", "二", "三", "四", "五", "六"][new Date(d).getDay()]
}
function formatDateChinese(d: string): string {
  const date = new Date(d)
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 星期${getWeekday(d)}`
}

const ICS_COURSE_TYPES = ["疗愈师课程", "商业框架陪跑", "落地赋能班"]
const ICS_COURSE_LABELS: Record<string, string> = { "疗愈师课程": "疗愈师", "商业框架陪跑": "陪跑", "落地赋能班": "赋能班" }

function isDepleted(remaining: number | undefined): boolean {
  return remaining !== undefined && remaining !== -1 && remaining <= 0
}

function formatRemaining(remaining: number | undefined): string {
  if (remaining === undefined) return ""
  if (remaining === -1) return ""
  return `余${remaining}`
}
const MAX_OWNER_VISIBLE = 50

// ===== Pure helpers =====
function getTeacherNames(teacherIds: string[], teachers: CustomerLight[]) {
  return teacherIds.map(id => teachers.find(t => t.id === id)).filter(Boolean).map(t => t!.nickname || t!.name || "未命名")
}

function getRoomLabel(spaceId: string | undefined, roomId: string | undefined, spaces: Space[], roomName?: string, spaceName?: string): string {
  if (!spaceId) return ""
  const space = spaces.find(s => s.id === spaceId)
  const sName = space?.name || spaceName
  const rName = roomName || (space && roomId ? space.rooms?.find(r => r.id === roomId)?.name : "")
  if (sName && rName) return `${sName}/${rName}`
  return rName || sName || ""
}

// ===== Memoized card components (extracted to avoid re-render on dropdown state changes) =====

export interface CardCallbacks {
  onCreateClass: () => void
  onEditClass: (r: ClassRecord) => void
  onDeleteClass: (id: string) => void
  onMaterialsClass: (r: ClassRecord) => void
  onCreateGcs: () => void
  onEditGcs: (s: GroupCaseSession) => void
  onDeleteGcs: (id: string) => void
  onMaterialsGcs: (s: GroupCaseSession) => void
  onCreateErs: () => void
  onEditErs: (s: EmotionalReleaseSession) => void
  onDeleteErs: (id: string) => void
  onCreateEks: () => void
  onEditEks: (s: EnergyKnotSession) => void
  onDeleteEks: (id: string) => void
  onCreateIcs: () => void
  onEditIcs: (s: InternalCourseSession) => void
  onDeleteIcs: (id: string) => void
  onMaterialsIcs: (s: InternalCourseSession) => void
  teachers: CustomerLight[]
  spaces: Space[]
  courseMap: Record<string, string>
}

// ===== GCS Dialog (独立组件，避免父组件 state 变化导致重渲染) =====

// ===== GCS Dialog (独立组件，避免父组件 state 变化导致重渲染) =====
const GcsDialog = memo(({ open, date, spaces, allCustomers, session, defaultSpaceId, onClose, onSaved }: {
  open: boolean; date: string; spaces: Space[]; allCustomers: CustomerLight[]
  session?: GroupCaseSession | null; defaultSpaceId?: string; onClose: () => void
  onSaved: (record: GroupCaseSession) => void
}) => {
  const enterToNext = useEnterToNext()
  const [editingRecord, setEditingRecord] = useState<GroupCaseSession | null>(null)
  const [saving, setSaving] = useState(false)
  const [formDate, setFormDate] = useState(date)
  const [formStartTime, setFormStartTime] = useState("09:00")
  const [formEndTime, setFormEndTime] = useState("10:00")
  const [formOwnerId, setFormOwnerId] = useState("")
  const [formOwnerName, setFormOwnerName] = useState("")
  const [formDescription, setFormDescription] = useState("")
  const [formActivityMode, setFormActivityMode] = useState("线下")
  const [searchKeyword, setSearchKeyword] = useState("")
  const [ownerRemaining, setOwnerRemaining] = useState<number | null>(null)
  const [remainingMap, setRemainingMap] = useState<Record<string, number>>({})
  const [spaceId, setSpaceId] = useState("")
  const [roomId, setRoomId] = useState("")
  const remainingFetchRef = useRef(0)

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      if (session) {
        setEditingRecord(session)
        setFormDate(session.date)
        setFormStartTime(session.start_time || "09:00")
        setFormEndTime(session.end_time || "10:00")
        setFormOwnerId(session.owner_id); setFormOwnerName(session.owner_name || "")
        setFormDescription(session.description || "")
        setFormActivityMode(session.activity_mode || "线下")
        setSpaceId(session.space_id || (spaces[0]?.id || ""))
        setRoomId(session.room_id || "")
        setSearchKeyword(""); setOwnerRemaining(null)
        if (session.owner_id && session.owner_name) {
          groupCaseSessionApi.searchCustomers(session.owner_name, session.date).then(results => {
            const found = results.find(r => r.id === session.owner_id)
            if (found) setOwnerRemaining(found.remaining)
          }).catch(() => {})
        }
      } else {
        setEditingRecord(null)
        setFormDate(date)
        setFormStartTime("09:00"); setFormEndTime("10:00")
        setFormOwnerId(""); setFormOwnerName("")
        setFormDescription("")
        setFormActivityMode("线下")
        setSearchKeyword(""); setOwnerRemaining(null)
        const ds = defaultSpaceId || spaces[0]?.id || ""; const dr = ds ? (spaces.find(s => s.id === ds)?.rooms?.[0]?.id || "") : ""
        setSpaceId(ds); setRoomId(dr)
      }
    }
  }, [open, date, spaces, session, defaultSpaceId])

  // Fetch remaining counts for dropdown
  useEffect(() => {
    if (!searchKeyword.trim() && !formOwnerId) return
    const fetchId = ++remainingFetchRef.current
    const timer = window.setTimeout(async () => {
      try {
        const results = await groupCaseSessionApi.searchCustomers(searchKeyword, formDate)
        if (fetchId !== remainingFetchRef.current) return
        const map: Record<string, number> = {}
        results.forEach(r => { map[r.id] = r.remaining })
        setRemainingMap(map)
      } catch {}
    }, 200)
    return () => clearTimeout(timer)
  }, [searchKeyword, formOwnerId, formDate])

  // Click outside to close dropdowns
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest("[data-dropdown]")) return
      setSearchKeyword("")
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  // Expose edit function to parent via ref trick: the parent can call open with initial data
  // Actually, let's handle this via a separate mechanism - the "新增" button in parent
  // will just set open=true, and the dialog initializes blank via the useEffect above.

  const handleSave = async () => {
    if (!formOwnerId) return
    setSaving(true)
    try {
      const data = {
        date: formDate, start_time: formStartTime || null, end_time: formEndTime || null,
        owner_id: formOwnerId, owner_name: formOwnerName,
        description: formDescription || undefined,
        activity_mode: formActivityMode,
        space_id: spaceId || undefined, room_id: roomId || undefined,
        room_name: (spaces.find(s => s.id === spaceId)?.rooms || []).find(r => r.id === roomId)?.name || "",
        space_name: spaces.find(s => s.id === spaceId)?.name || "",
      }
      let result: GroupCaseSession
      if (editingRecord) {
        result = await groupCaseSessionApi.update(editingRecord.id, data)
      } else {
        result = await groupCaseSessionApi.create(data)
      }
      onSaved(result)
    } catch (e: any) {
      const detail = e?.response?.data?.detail
      if (typeof detail === "string") alert(detail)
    } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-sm p-0 gap-0" initialFocus={false}>
        <DialogHeader className="px-6 pt-5 pb-4 border-b">
          <DialogTitle className="text-[15px]">{editingRecord ? "编辑觉醒游戏" : "新增觉醒游戏"}</DialogTitle>
        </DialogHeader>
        <div className="px-6 py-5 space-y-5" {...enterToNext}>
          <div className="grid grid-cols-[70px_1fr] items-center gap-3">
            <span className="text-[12px] text-[#8f959e] text-right">日期</span>
            <Input rounded="[2px]" type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} className="h-8 text-[12px]" />
          </div>
          <div className="grid grid-cols-[70px_1fr] items-center gap-3">
            <span className="text-[12px] text-[#8f959e] text-right">时间</span>
            <div className="flex items-center gap-2">
              <Input rounded="[2px]" type="time" value={formStartTime} onChange={(e) => setFormStartTime(e.target.value)} className="h-8 text-[12px] w-28" />
              <span className="text-[12px] text-[#8f959e]">至</span>
              <Input rounded="[2px]" type="time" value={formEndTime} onChange={(e) => setFormEndTime(e.target.value)} className="h-8 text-[12px] w-28" />
            </div>
          </div>
          <div className="grid grid-cols-[70px_1fr] items-center gap-3">
            <span className="text-[12px] text-[#8f959e] text-right">空间</span>
            <div className="flex items-center gap-2">
              <SelectDropdown rounded="[2px]"
                className="w-[122px]"
                value={spaceId}
                options={spaces.map(s => ({value: s.id, label: s.name}))}
                placeholder="选择空间"
                onChange={(v) => { setSpaceId(v); setRoomId(spaces.find(s => s.id === v)?.rooms?.[0]?.id || "") }}
              />
              <SelectDropdown rounded="[2px]"
                className="w-[122px]"
                value={roomId}
                options={(spaces.find(s => s.id === spaceId)?.rooms || []).map(r => ({value: r.id, label: r.name}))}
                placeholder={spaceId && (spaces.find(s => s.id === spaceId)?.rooms || []).length === 0 ? "无房间" : "选择房间"}
                disabled={!!spaceId && (spaces.find(s => s.id === spaceId)?.rooms || []).length === 0}
                onChange={(v) => setRoomId(v)}
              />
            </div>
          </div>
          <div className="grid grid-cols-[70px_1fr] items-center gap-3">
            <span className="text-[12px] text-[#8f959e] text-right">活动方式</span>
            <SelectDropdown rounded="[2px]"
              value={formActivityMode}
              options={[{value: "线下", label: "线下"}, {value: "线上", label: "线上"}]}
              onChange={setFormActivityMode}
            />
          </div>
          <div className="grid grid-cols-[70px_1fr] items-start gap-3">
            <span className="text-[12px] text-[#8f959e] text-right mt-2">案主</span>
            <div data-dropdown className="relative" onMouseDown={(e) => e.stopPropagation()}>
              <div className="relative">
                <Input rounded="[2px]"
                  value={formOwnerId ? formOwnerName : searchKeyword}
                  onChange={(e) => {
                    setSearchKeyword(e.target.value)
                    if (formOwnerId) { setFormOwnerId(""); setFormOwnerName(""); setOwnerRemaining(null) }
                  }}
                  placeholder={formOwnerId ? "" : "选择案主"}
                  className="h-8 text-[12px] pr-20"
                  autoComplete="off"
                />
                {formOwnerId && ownerRemaining !== null && (
                  <span className={`absolute right-7 top-1/2 -translate-y-1/2 text-[11px] ${isDepleted(ownerRemaining) ? "text-red-500" : "text-[#8f959e]"}`}>
                    {ownerRemaining === -1 ? "不限次" : `剩余${ownerRemaining}次`}
                  </span>
                )}
                {formOwnerId && (
                  <button className="absolute right-2 top-1/2 -translate-y-1/2 text-[#8f959e] hover:text-[#2b2f36]"
                    onClick={() => { setFormOwnerId(""); setFormOwnerName(""); setSearchKeyword(""); setOwnerRemaining(null) }}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {searchKeyword.trim().length > 0 && (() => {
                const kw = searchKeyword.trim().toLowerCase()
                const filtered = allCustomers.filter(c =>
                  remainingMap[c.id] !== undefined && ((c.nickname || "").toLowerCase().includes(kw) || (c.name || "").toLowerCase().includes(kw))
                ).sort((a, b) => {
                  const ra = remainingMap[a.id]; const rb = remainingMap[b.id]
                  const sa = isDepleted(ra) ? 1 : 0
                  const sb = isDepleted(rb) ? 1 : 0
                  return sa - sb
                })
                const visible = filtered.slice(0, MAX_OWNER_VISIBLE)
                return (
                <div className="absolute top-full left-0 mt-1 w-full bg-white rounded-md border border-[#e8e8e8] shadow-lg z-50 max-h-[200px] overflow-y-auto" onMouseDown={(e) => e.stopPropagation()}>
                  {visible.length === 0 ? (
                    <div className="px-3 py-2 text-[12px] text-[#8f959e]">无匹配客户</div>
                  ) : (
                    visible.map(c => {
                      const remaining = remainingMap[c.id]
                      const isDepleted = remaining !== undefined && remaining !== -1 && remaining <= 0
                      return (
                        <button key={c.id}
                          className={`flex items-center justify-between w-full px-3 py-2 text-[12px] ${isDepleted ? "cursor-not-allowed" : "hover:bg-[#f7f8fa]"}`}
                          disabled={isDepleted}
                          onClick={() => {
                            if (isDepleted) return
                            setFormOwnerId(c.id)
                            setFormOwnerName(c.nickname || c.name || "")
                            setSearchKeyword("")
                            setOwnerRemaining(remaining !== undefined ? remaining : null)
                          }}>
                          <span className={isDepleted ? "text-[#b0b5bb]" : ""}>{c.nickname || c.name}</span>
                          <span className={`text-[#8f959e] ${isDepleted ? "text-red-500" : ""}`}>
                            {remaining !== undefined ? (remaining === -1 ? "" : `余${remaining}`) : ""}
                          </span>
                        </button>
                      )
                    })
                  )}
                </div>
              )})()}
            </div>
          </div>
          <div className="grid grid-cols-[70px_1fr] items-start gap-3">
            <span className="text-[12px] text-[#8f959e] text-right mt-1">描述</span>
            <textarea value={formDescription} onChange={(e) => setFormDescription(e.target.value)}
              className="w-full min-h-[80px] px-3 py-2 rounded-md border border-input text-[12px] resize-none" placeholder="输入课程简介..." />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 pb-5 pt-2">
          <Button variant="outline" size="sm" onClick={onClose}>取消</Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !formOwnerId}>{saving ? "保存中..." : "保存"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
})

// ===== ERS Dialog (独立组件) =====
const ErsDialog = memo(({ open, date, spaces, allCustomers, session, defaultSpaceId, onClose, onSaved }: {
  open: boolean; date: string; spaces: Space[]; allCustomers: CustomerLight[]
  session?: EmotionalReleaseSession | null; defaultSpaceId?: string; onClose: () => void
  onSaved: (record: EmotionalReleaseSession) => void
}) => {
  const enterToNext = useEnterToNext()
  const [editingRecord, setEditingRecord] = useState<EmotionalReleaseSession | null>(null)
  const [saving, setSaving] = useState(false)
  const [formDate, setFormDate] = useState(date)
  const [formStartTime, setFormStartTime] = useState("09:00")
  const [formEndTime, setFormEndTime] = useState("10:00")
  const [formOwnerId, setFormOwnerId] = useState("")
  const [formOwnerName, setFormOwnerName] = useState("")
  const [formDescription, setFormDescription] = useState("")
  const [formActivityMode, setFormActivityMode] = useState("线下")
  const [searchKeyword, setSearchKeyword] = useState("")
  const [ownerRemaining, setOwnerRemaining] = useState<number | null>(null)
  const [remainingMap, setRemainingMap] = useState<Record<string, number>>({})
  const [spaceId, setSpaceId] = useState("")
  const [roomId, setRoomId] = useState("")
  const remainingFetchRef = useRef(0)

  useEffect(() => {
    if (open) {
      if (session) {
        setEditingRecord(session)
        setFormDate(session.date)
        setFormStartTime(session.start_time || "09:00")
        setFormEndTime(session.end_time || "10:00")
        setFormOwnerId(session.owner_id); setFormOwnerName(session.owner_name || "")
        setFormDescription(session.description || "")
        setFormActivityMode(session.activity_mode || "线下")
        setSpaceId(session.space_id || (spaces[0]?.id || ""))
        setRoomId(session.room_id || "")
        setSearchKeyword(""); setOwnerRemaining(null)
        if (session.owner_id && session.owner_name) {
          emotionalReleaseSessionApi.searchCustomers(session.owner_name, session.date).then(results => {
            const found = results.find(r => r.id === session.owner_id)
            if (found) setOwnerRemaining(found.remaining)
          }).catch(() => {})
        }
      } else {
        setEditingRecord(null)
        setFormDate(date)
        setFormStartTime("09:00"); setFormEndTime("10:00")
        setFormOwnerId(""); setFormOwnerName("")
        setFormDescription("")
        setFormActivityMode("线下")
        setSearchKeyword(""); setOwnerRemaining(null)
        const ds = defaultSpaceId || spaces[0]?.id || ""; const dr = ds ? (spaces.find(s => s.id === ds)?.rooms?.[0]?.id || "") : ""
        setSpaceId(ds); setRoomId(dr)
      }
    }
  }, [open, date, spaces, session, defaultSpaceId])

  useEffect(() => {
    if (!searchKeyword.trim() && !formOwnerId) return
    const fetchId = ++remainingFetchRef.current
    const timer = window.setTimeout(async () => {
      try {
        const results = await emotionalReleaseSessionApi.searchCustomers(searchKeyword, formDate)
        if (fetchId !== remainingFetchRef.current) return
        const map: Record<string, number> = {}
        results.forEach(r => { map[r.id] = r.remaining })
        setRemainingMap(map)
      } catch {}
    }, 200)
    return () => clearTimeout(timer)
  }, [searchKeyword, formOwnerId, formDate])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest("[data-dropdown]")) return
      setSearchKeyword("")
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const handleSave = async () => {
    if (!formOwnerId) return
    setSaving(true)
    try {
      const data = {
        date: formDate, start_time: formStartTime || null, end_time: formEndTime || null,
        owner_id: formOwnerId, owner_name: formOwnerName,
        description: formDescription || undefined,
        activity_mode: formActivityMode,
        space_id: spaceId || undefined, room_id: roomId || undefined,
        room_name: (spaces.find(s => s.id === spaceId)?.rooms || []).find(r => r.id === roomId)?.name || "",
        space_name: spaces.find(s => s.id === spaceId)?.name || "",
      }
      let result: EmotionalReleaseSession
      if (editingRecord) {
        result = await emotionalReleaseSessionApi.update(editingRecord.id, data)
      } else {
        result = await emotionalReleaseSessionApi.create(data)
      }
      onSaved(result)
    } catch (e: any) {
      const detail = e?.response?.data?.detail
      if (typeof detail === "string") alert(detail)
    } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-sm p-0 gap-0" initialFocus={false}>
        <DialogHeader className="px-6 pt-5 pb-4 border-b">
          <DialogTitle className="text-[15px]">{editingRecord ? "编辑情绪释放" : "新增情绪释放"}</DialogTitle>
        </DialogHeader>
        <div className="px-6 py-5 space-y-5" {...enterToNext}>
          <div className="grid grid-cols-[70px_1fr] items-center gap-3">
            <span className="text-[12px] text-[#8f959e] text-right">活动方式</span>
            <SelectDropdown rounded="[2px]"
              value={formActivityMode}
              options={[{value: "线下", label: "线下"}, {value: "线上", label: "线上"}]}
              onChange={setFormActivityMode}
            />
          </div>
          <div className="grid grid-cols-[70px_1fr] items-center gap-3">
            <span className="text-[12px] text-[#8f959e] text-right">日期</span>
            <Input rounded="[2px]" type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} className="h-8 text-[12px]" />
          </div>
          <div className="grid grid-cols-[70px_1fr] items-center gap-3">
            <span className="text-[12px] text-[#8f959e] text-right">时间</span>
            <div className="flex items-center gap-2">
              <Input rounded="[2px]" type="time" value={formStartTime} onChange={(e) => setFormStartTime(e.target.value)} className="h-8 text-[12px] w-28" />
              <span className="text-[12px] text-[#8f959e]">至</span>
              <Input rounded="[2px]" type="time" value={formEndTime} onChange={(e) => setFormEndTime(e.target.value)} className="h-8 text-[12px] w-28" />
            </div>
          </div>
          <div className="grid grid-cols-[70px_1fr] items-center gap-3">
            <span className="text-[12px] text-[#8f959e] text-right">空间</span>
            <div className="flex items-center gap-2">
              <SelectDropdown rounded="[2px]"
                className="w-[122px]"
                value={spaceId}
                options={spaces.map(s => ({value: s.id, label: s.name}))}
                placeholder="选择空间"
                onChange={(v) => { setSpaceId(v); setRoomId(spaces.find(s => s.id === v)?.rooms?.[0]?.id || "") }}
              />
              <SelectDropdown rounded="[2px]"
                className="w-[122px]"
                value={roomId}
                options={(spaces.find(s => s.id === spaceId)?.rooms || []).map(r => ({value: r.id, label: r.name}))}
                placeholder={spaceId && (spaces.find(s => s.id === spaceId)?.rooms || []).length === 0 ? "无房间" : "选择房间"}
                disabled={!!spaceId && (spaces.find(s => s.id === spaceId)?.rooms || []).length === 0}
                onChange={(v) => setRoomId(v)}
              />
            </div>
          </div>
          <div className="grid grid-cols-[70px_1fr] items-start gap-3">
            <span className="text-[12px] text-[#8f959e] text-right mt-2">案主</span>
            <div data-dropdown className="relative" onMouseDown={(e) => e.stopPropagation()}>
              <div className="relative">
                <Input rounded="[2px]"
                  value={formOwnerId ? formOwnerName : searchKeyword}
                  onChange={(e) => {
                    setSearchKeyword(e.target.value)
                    if (formOwnerId) { setFormOwnerId(""); setFormOwnerName(""); setOwnerRemaining(null) }
                  }}
                  placeholder={formOwnerId ? "" : "选择案主"}
                  className="h-8 text-[12px] pr-20"
                  autoComplete="off"
                />
                {formOwnerId && ownerRemaining !== null && (
                  <span className={`absolute right-7 top-1/2 -translate-y-1/2 text-[11px] ${isDepleted(ownerRemaining) ? "text-red-500" : "text-[#8f959e]"}`}>
                    {ownerRemaining === -1 ? "不限次" : `剩余${ownerRemaining}次`}
                  </span>
                )}
                {formOwnerId && (
                  <button className="absolute right-2 top-1/2 -translate-y-1/2 text-[#8f959e] hover:text-[#2b2f36]"
                    onClick={() => { setFormOwnerId(""); setFormOwnerName(""); setSearchKeyword(""); setOwnerRemaining(null) }}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {searchKeyword.trim().length > 0 && (() => {
                const kw = searchKeyword.trim().toLowerCase()
                const filtered = allCustomers.filter(c =>
                  remainingMap[c.id] !== undefined && ((c.nickname || "").toLowerCase().includes(kw) || (c.name || "").toLowerCase().includes(kw))
                ).sort((a, b) => {
                  const ra = remainingMap[a.id]; const rb = remainingMap[b.id]
                  const sa = isDepleted(ra) ? 1 : 0
                  const sb = isDepleted(rb) ? 1 : 0
                  return sa - sb
                })
                const visible = filtered.slice(0, MAX_OWNER_VISIBLE)
                return (
                <div className="absolute top-full left-0 mt-1 w-full bg-white rounded-md border border-[#e8e8e8] shadow-lg z-50 max-h-[200px] overflow-y-auto" onMouseDown={(e) => e.stopPropagation()}>
                  {visible.length === 0 ? (
                    <div className="px-3 py-2 text-[12px] text-[#8f959e]">无匹配客户</div>
                  ) : (
                    visible.map(c => {
                      const remaining = remainingMap[c.id]
                      const isDepleted = remaining !== undefined && remaining !== -1 && remaining <= 0
                      return (
                        <button key={c.id}
                          className={`flex items-center justify-between w-full px-3 py-2 text-[12px] ${isDepleted ? "cursor-not-allowed" : "hover:bg-[#f7f8fa]"}`}
                          disabled={isDepleted}
                          onClick={() => {
                            if (isDepleted) return
                            setFormOwnerId(c.id)
                            setFormOwnerName(c.nickname || c.name || "")
                            setSearchKeyword("")
                            setOwnerRemaining(remaining !== undefined ? remaining : null)
                          }}>
                          <span className={isDepleted ? "text-[#b0b5bb]" : ""}>{c.nickname || c.name}</span>
                          <span className={`text-[#8f959e] ${isDepleted ? "text-red-500" : ""}`}>
                            {remaining !== undefined ? (remaining === -1 ? "" : `余${remaining}`) : ""}
                          </span>
                        </button>
                      )
                    })
                  )}
                </div>
              )})()}
            </div>
          </div>
          <div className="grid grid-cols-[70px_1fr] items-start gap-3">
            <span className="text-[12px] text-[#8f959e] text-right mt-1">描述</span>
            <textarea value={formDescription} onChange={(e) => setFormDescription(e.target.value)}
              className="w-full min-h-[80px] px-3 py-2 rounded-md border border-input text-[12px] resize-none" placeholder="输入课程简介..." />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 pb-5 pt-2">
          <Button variant="outline" size="sm" onClick={onClose}>取消</Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !formOwnerId}>{saving ? "保存中..." : "保存"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
})


// ===== EKS Dialog (独立组件) =====
const EksDialog = memo(({ open, date, spaces, allCustomers, hostCustomers, session, defaultSpaceId, onClose, onSaved }: {
  open: boolean; date: string; spaces: Space[]; allCustomers: CustomerLight[]
  hostCustomers: CustomerLight[]; session?: EnergyKnotSession | null; defaultSpaceId?: string; onClose: () => void
  onSaved: (record: EnergyKnotSession) => void
}) => {
  const enterToNext = useEnterToNext()
  const [editingRecord, setEditingRecord] = useState<EnergyKnotSession | null>(null)
  const [saving, setSaving] = useState(false)
  const [formDate, setFormDate] = useState(date)
  const [formStartTime, setFormStartTime] = useState("09:00")
  const [formEndTime, setFormEndTime] = useState("10:00")
  const [formOwnerIds, setFormOwnerIds] = useState<string[]>([])
  const [formOwnerNames, setFormOwnerNames] = useState<string[]>([])
  const [formOwnerDescriptions, setFormOwnerDescriptions] = useState<{ id: string; name: string; description: string; count: number }[]>([])
  const [searchKeyword, setSearchKeyword] = useState("")
  const [remainingMap, setRemainingMap] = useState<Record<string, number>>({})
  const [ownerErrors, setOwnerErrors] = useState<Record<string, string>>({})
  const [formHostIds, setFormHostIds] = useState<string[]>([])
  const [formHostNames, setFormHostNames] = useState<string[]>([])
  const [formActivityMode, setFormActivityMode] = useState("线下")
  const [spaceId, setSpaceId] = useState("")
  const [roomId, setRoomId] = useState("")
  const [purchaseDialogOpen, setPurchaseDialogOpen] = useState(false)
  const [pendingOwner, setPendingOwner] = useState<{ id: string; nickname: string; name: string } | null>(null)
  const [purchaseCount, setPurchaseCount] = useState("1")
  const [purchaseAmount, setPurchaseAmount] = useState("")
  const [purchaseSaving, setPurchaseSaving] = useState(false)
  const remainingFetchRef = useRef(0)
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      if (session) {
        setEditingRecord(session)
        setFormDate(session.date)
        setFormStartTime(session.start_time || "09:00")
        setFormEndTime(session.end_time || "10:00")
        let descs: { id: string; name: string; description: string; count: number }[] = []
        try {
          const items = JSON.parse(session.description || "[]")
          if (Array.isArray(items)) descs = items.map((item: any) => ({ ...item, count: item.count ?? 1 }))
        } catch {}
        setFormOwnerDescriptions(descs)
        setFormOwnerIds(descs.map(d => d.id).filter(Boolean))
        setFormOwnerNames(descs.map(d => d.name).filter(Boolean))
        setFormHostIds(session.teacher_ids || []); setFormHostNames((session.teacher_ids || []).map(id => hostCustomers.find(c => c.id === id)?.nickname || hostCustomers.find(c => c.id === id)?.name || "").filter(Boolean))
        // 编辑时加载案主剩余次数
        if (descs.length > 0) {
          energyKnotSessionApi.searchCustomers("", session.date).then(results => {
            const map: Record<string, number> = {}
            results.forEach(r => { map[r.id] = r.remaining })
            setRemainingMap(map)
          }).catch(() => {})
        }
        setFormActivityMode(session.activity_mode || "线下")
        setSpaceId(session.space_id || (spaces[0]?.id || ""))
        setRoomId(session.room_id || "")
      } else {
        setEditingRecord(null)
        setFormDate(date)
        setFormStartTime("09:00"); setFormEndTime("10:00")
        setFormOwnerIds([]); setFormOwnerNames([]); setFormOwnerDescriptions([])
        setFormHostIds([]); setFormHostNames([])
        setFormActivityMode("线下")
        const ds = defaultSpaceId || spaces[0]?.id || ""; const dr = ds ? (spaces.find(s => s.id === ds)?.rooms?.[0]?.id || "") : ""
        setSpaceId(ds); setRoomId(dr)
      }
      setSearchKeyword("")
    }
  }, [open, date, spaces, session, defaultSpaceId])

  useEffect(() => {
    if (!searchKeyword.trim()) return
    const fetchId = ++remainingFetchRef.current
    const timer = window.setTimeout(async () => {
      try {
        const results = await energyKnotSessionApi.searchCustomers(searchKeyword, formDate)
        if (fetchId !== remainingFetchRef.current) return
        const map: Record<string, number> = {}
        results.forEach(r => { map[r.id] = r.remaining })
        setRemainingMap(prev => ({ ...prev, ...map }))
      } catch {}
    }, 200)
    return () => clearTimeout(timer)
  }, [searchKeyword, formDate])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest("[data-dropdown]")) return
      setSearchKeyword("")
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const selectOwner = (customer: CustomerLight) => {
    if (formOwnerIds.includes(customer.id)) return
    const remaining = remainingMap[customer.id]
    if (isDepleted(remaining)) {
      setPendingOwner({ id: customer.id, nickname: customer.nickname, name: customer.name })
      setPurchaseDialogOpen(true)
      return
    }
    setFormOwnerIds([...formOwnerIds, customer.id])
    setFormOwnerNames([...formOwnerNames, customer.nickname || customer.name || ""])
    setFormOwnerDescriptions([...formOwnerDescriptions, { id: customer.id, name: customer.nickname || customer.name || "", description: "", count: 1 }])
    setSearchKeyword(""); setTimeout(() => searchInputRef.current?.blur(), 0)
  }

  const addPurchase = async () => {
    if (!pendingOwner || !purchaseCount) return
    setPurchaseSaving(true)
    try {
      await energyKnotApi.create({
        customer_id: pendingOwner.id, nickname: pendingOwner.nickname,
        purchase_count: parseInt(purchaseCount) || 0, amount: parseFloat(purchaseAmount) || 0,
      })
      setRemainingMap(prev => ({ ...prev, [pendingOwner.id]: (prev[pendingOwner.id] ?? 0) + (parseInt(purchaseCount) || 0) }))
      setFormOwnerIds(prev => [...prev, pendingOwner.id])
      setFormOwnerNames(prev => [...prev, pendingOwner.nickname])
      setFormOwnerDescriptions(prev => [...prev, { id: pendingOwner.id, name: pendingOwner.nickname, description: "", count: 1 }])
      setPurchaseDialogOpen(false); setPendingOwner(null)
    } catch (e) { console.error("新增购买失败:", e) }
    finally { setPurchaseSaving(false) }
  }

  const handleSave = async () => {
    if (formOwnerIds.length === 0) return
    // 校验部位数是否超过剩余次数
    let oldDescs: {id: string; count: number}[] = []
    if (editingRecord) {
      try { oldDescs = JSON.parse(editingRecord.description || "[]") } catch { oldDescs = [] }
    }
    const errors: Record<string, string> = {}
    for (const desc of formOwnerDescriptions) {
      if (!desc.id) continue
      const remaining = remainingMap[desc.id]
      if (remaining === undefined || remaining === -1) continue
      const oldCount = oldDescs.find(d => d.id === desc.id)?.count ?? 0
      const effective = remaining + oldCount
      if (desc.count > effective) {
        errors[desc.id] = `剩余次数不足（剩余 ${remaining} 次，需要 ${desc.count} 次）`
      }
    }
    if (Object.keys(errors).length > 0) {
      setOwnerErrors(errors)
      return
    }
    setOwnerErrors({})
    setSaving(true)
    try {
      const data = {
        date: formDate, start_time: formStartTime || null, end_time: formEndTime || null,
        owner_id: formOwnerIds[0], owner_name: formOwnerNames.join("、"),
        description: JSON.stringify(formOwnerDescriptions),
        teacher_ids: formHostIds,
        activity_mode: formActivityMode,
        space_id: spaceId || undefined, room_id: roomId || undefined,
        room_name: (spaces.find(s => s.id === spaceId)?.rooms || []).find(r => r.id === roomId)?.name || "",
        space_name: spaces.find(s => s.id === spaceId)?.name || "",
      }
      let result: EnergyKnotSession
      if (editingRecord) {
        result = await energyKnotSessionApi.update(editingRecord.id, data)
      } else {
        result = await energyKnotSessionApi.create(data)
      }
      onSaved(result)
    } catch (e: any) {
      const detail = e?.response?.data?.detail
      if (typeof detail === "string") alert(detail)
    } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-sm p-0 gap-0" initialFocus={false}>
        <DialogHeader className="px-6 pt-5 pb-4 border-b">
          <DialogTitle className="text-[15px]">{editingRecord ? "编辑能量结" : "新增能量结"}</DialogTitle>
        </DialogHeader>
        <div className="px-6 py-5 space-y-5" {...enterToNext}>
          <div className="grid grid-cols-[70px_1fr] items-center gap-3">
            <span className="text-[12px] text-[#8f959e] text-right">日期</span>
            <Input rounded="[2px]" type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} className="h-8 text-[12px]" />
          </div>
          <div className="grid grid-cols-[70px_1fr] items-center gap-3">
            <span className="text-[12px] text-[#8f959e] text-right">时间</span>
            <div className="flex items-center gap-2">
              <Input rounded="[2px]" type="time" value={formStartTime} onChange={(e) => setFormStartTime(e.target.value)} className="h-8 text-[12px] w-28" />
              <span className="text-[12px] text-[#8f959e]">至</span>
              <Input rounded="[2px]" type="time" value={formEndTime} onChange={(e) => setFormEndTime(e.target.value)} className="h-8 text-[12px] w-28" />
            </div>
          </div>
          <div className="grid grid-cols-[70px_1fr] items-center gap-3">
            <span className="text-[12px] text-[#8f959e] text-right">空间</span>
            <div className="flex items-center gap-2">
              <SelectDropdown rounded="[2px]"
                className="w-[122px]"
                value={spaceId}
                options={spaces.map(s => ({value: s.id, label: s.name}))}
                placeholder="选择空间"
                onChange={(v) => { setSpaceId(v); setRoomId(spaces.find(s => s.id === v)?.rooms?.[0]?.id || "") }}
              />
              <SelectDropdown rounded="[2px]"
                className="w-[122px]"
                value={roomId}
                options={(spaces.find(s => s.id === spaceId)?.rooms || []).map(r => ({value: r.id, label: r.name}))}
                placeholder={spaceId && (spaces.find(s => s.id === spaceId)?.rooms || []).length === 0 ? "无房间" : "选择房间"}
                disabled={!!spaceId && (spaces.find(s => s.id === spaceId)?.rooms || []).length === 0}
                onChange={(v) => setRoomId(v)}
              />
            </div>
          </div>
          <div className="grid grid-cols-[70px_1fr] items-center gap-3">
            <span className="text-[12px] text-[#8f959e] text-right">活动方式</span>
            <SelectDropdown rounded="[2px]"
              value={formActivityMode}
              options={[{value: "线下", label: "线下"}, {value: "线上", label: "线上"}]}
              onChange={setFormActivityMode}
            />
          </div>
          <div className="grid grid-cols-[70px_1fr] items-center gap-3">
            <span className="text-[12px] text-[#8f959e] text-right">案主</span>
            <div data-dropdown className="relative" onMouseDown={(e) => e.stopPropagation()}>
              <div className="flex flex-wrap items-center gap-1 min-h-[32px] rounded-md border border-input bg-transparent px-2 py-1">
                {formOwnerNames.map((name, i) => (
                  <span key={i} className="inline-flex items-center gap-1 bg-[#f0f1f2] text-[#2b2f36] text-[11px] px-1.5 py-0.5 rounded">
                    {name}
                    <span className="inline-flex items-center justify-center w-4 h-4 cursor-pointer text-[#8f959e] hover:text-[#f54a45] hover:bg-[#e5e6e8] rounded-sm" onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setFormOwnerIds(formOwnerIds.filter((_, j) => j !== i)); setFormOwnerNames(formOwnerNames.filter((_, j) => j !== i)); setFormOwnerDescriptions(formOwnerDescriptions.filter((_, j) => j !== i)) }}><X className="h-2.5 w-2.5" /></span>
                  </span>
                ))}
                <input
                  ref={searchInputRef}
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  placeholder={formOwnerNames.length === 0 ? "选择案主" : ""}
                  className="flex-1 min-w-[60px] text-[12px] bg-transparent outline-none placeholder:text-[#b0b5bb]"
                  autoComplete="off"
                />
              </div>
              {searchKeyword.trim().length > 0 && (() => {
                const kw = searchKeyword.trim().toLowerCase()
                const filtered = allCustomers.filter(c =>
                  remainingMap[c.id] !== undefined && ((c.nickname || "").toLowerCase().includes(kw) || (c.name || "").toLowerCase().includes(kw))
                ).sort((a, b) => {
                  const ra = remainingMap[a.id]; const rb = remainingMap[b.id]
                  const sa = isDepleted(ra) ? 1 : 0
                  const sb = isDepleted(rb) ? 1 : 0
                  return sa - sb
                })
                const visible = filtered.slice(0, MAX_OWNER_VISIBLE)
                return (
                <div className="absolute top-full left-0 mt-1 w-full bg-white rounded-md border border-[#e8e8e8] shadow-lg z-50 max-h-[200px] overflow-y-auto" onMouseDown={(e) => e.stopPropagation()}>
                  {visible.length === 0 ? (
                    <div className="px-3 py-2 text-[12px] text-[#8f959e]">无匹配客户</div>
                  ) : (
                    visible.map(c => {
                      const remaining = remainingMap[c.id]
                      const dep = isDepleted(remaining)
                      const alreadySelected = formOwnerIds.includes(c.id)
                      return (
                        <button key={c.id}
                          className={`flex items-center justify-between w-full px-3 py-2 text-[12px] ${dep || alreadySelected ? "cursor-not-allowed" : "hover:bg-[#f7f8fa]"}`}
                          disabled={dep || alreadySelected}
                          onClick={() => {
                            if (dep || alreadySelected) return
                            selectOwner(c)
                          }}>
                          <span className={dep || alreadySelected ? "text-[#b0b5bb]" : ""}>{c.nickname || c.name}</span>
                          <span className={`text-[#8f959e] ${dep ? "text-red-500" : ""}`}>
                            {alreadySelected ? "已添加" : remaining !== undefined ? (remaining === -1 ? "" : `余${remaining}`) : ""}
                          </span>
                        </button>
                      )
                    })
                  )}
                </div>
              )})()}
            </div>
          </div>
          {formOwnerNames.length > 0 && (
            <div className="grid grid-cols-[70px_1fr] gap-3 -mt-3">
              <span />
              <div className="space-y-2">
                {formOwnerNames.map((name, i) => {
                  const ownerId = formOwnerDescriptions[i]?.id
                  return (
                    <div key={i}>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] shrink-0">{name}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-[11px] text-[#8f959e]">部位数</span>
                          <Input rounded="[2px]"
                            type="number"
                            min={1}
                            value={formOwnerDescriptions[i]?.count ?? 1}
                            onChange={(e) => {
                              const next = [...formOwnerDescriptions]
                              next[i] = { ...next[i], count: Math.max(1, parseInt(e.target.value) || 1) }
                              setFormOwnerDescriptions(next)
                              if (ownerId) setOwnerErrors(prev => { const n = { ...prev }; delete n[ownerId]; return n })
                            }}
                            className="w-[30px] h-7 text-[11px] text-center [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                          />
                        </div>
                        <Input rounded="[2px]"
                          placeholder="情况介绍..."
                          value={formOwnerDescriptions[i]?.description || ""}
                          onChange={(e) => {
                            const next = [...formOwnerDescriptions]
                            next[i] = { ...next[i], description: e.target.value }
                            setFormOwnerDescriptions(next)
                          }}
                          className="flex-1 h-7 text-[11px]"
                        />
                      </div>
                      {ownerId && ownerErrors[ownerId] && (
                        <div className="text-[11px] text-red-500 mt-0.5 ml-1">{ownerErrors[ownerId]}</div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          <div className="grid grid-cols-[70px_1fr] items-start gap-3">
            <span className="text-[12px] text-[#8f959e] text-right pt-2">能量结老师</span>
            <SelectDropdown rounded="[2px]"
              value={formHostIds}
              options={hostCustomers.map(c => ({value: c.id, label: c.nickname || c.name || ""}))}
              placeholder="选择能量结老师"
              onChange={(v) => {
                const ids = Array.isArray(v) ? v : [v]
                setFormHostIds(ids)
                setFormHostNames(ids.map(id => hostCustomers.find(c => c.id === id)?.nickname || hostCustomers.find(c => c.id === id)?.name || "").filter(Boolean))
              }}
              multi={true}
              hideCheckbox={true}
              hideSelectedStyle={true}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 pb-5 pt-2">
          <Button variant="outline" size="sm" onClick={onClose}>取消</Button>
          <Button size="sm" onClick={handleSave} disabled={saving || formOwnerIds.length === 0}>{saving ? "保存中..." : "保存"}</Button>
        </div>
      </DialogContent>
      {/* Purchase dialog (nested) */}
      <Dialog open={purchaseDialogOpen} onOpenChange={(o) => { if (!o) setPurchaseDialogOpen(false) }}>
        <DialogContent className="max-w-xs p-0 gap-0" initialFocus={false}>
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-[15px]">新增购买</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-4" {...enterToNext}>
            <div className="grid grid-cols-[70px_1fr] items-center gap-3">
              <span className="text-[12px] text-[#8f959e] text-right">客户</span>
              <span className="text-[12px]">{pendingOwner?.nickname || ""}</span>
            </div>
            <div className="grid grid-cols-[70px_1fr] items-center gap-3">
              <span className="text-[12px] text-[#8f959e] text-right">购买场次</span>
              <Input rounded="[2px]" type="number" value={purchaseCount} onChange={(e) => setPurchaseCount(e.target.value)} className="h-8 text-[12px]" min="1" />
            </div>
            <div className="grid grid-cols-[70px_1fr] items-center gap-3">
              <span className="text-[12px] text-[#8f959e] text-right">金额</span>
              <Input rounded="[2px]" type="number" value={purchaseAmount} onChange={(e) => setPurchaseAmount(e.target.value)} className="h-8 text-[12px]" placeholder="可选" />
            </div>
          </div>
          <div className="flex justify-end gap-2 px-6 pb-5 pt-2">
            <Button variant="outline" size="sm" onClick={() => setPurchaseDialogOpen(false)}>取消</Button>
            <Button size="sm" onClick={addPurchase} disabled={purchaseSaving}>{purchaseSaving ? "保存中..." : "保存"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  )
})

// ===== ICS Dialog (独立组件) =====
const IcsDialog = memo(({ open, date, spaces, teachers, session, defaultSpaceId, onClose, onSaved }: {
  open: boolean; date: string; spaces: Space[]; teachers: CustomerLight[]
  session?: InternalCourseSession | null; defaultSpaceId?: string; onClose: () => void
  onSaved: (record: InternalCourseSession) => void
}) => {
  const enterToNext = useEnterToNext()
  const [editingRecord, setEditingRecord] = useState<InternalCourseSession | null>(null)
  const [saving, setSaving] = useState(false)
  const [formDate, setFormDate] = useState(date)
  const [formStartTime, setFormStartTime] = useState("09:00")
  const [formEndTime, setFormEndTime] = useState("10:00")
  const [formCourseType, setFormCourseType] = useState(ICS_COURSE_TYPES[0])
  const [formCourseName, setFormCourseName] = useState("")
  const [formDescription, setFormDescription] = useState("")
  const [formHostId, setFormHostId] = useState("")
  const [formHostName, setFormHostName] = useState("")
  const [formActivityMode, setFormActivityMode] = useState("线下")
  const [spaceId, setSpaceId] = useState("")
  const [roomId, setRoomId] = useState("")

  useEffect(() => {
    if (open) {
      if (session) {
        setEditingRecord(session)
        setFormDate(session.date)
        setFormStartTime(session.start_time || "09:00")
        setFormEndTime(session.end_time || "10:00")
        setFormCourseType(session.course_type || ICS_COURSE_TYPES[0])
        setFormCourseName(session.course_name || "")
        setFormDescription(session.course_description || "")
        setFormHostId(session.host_id || ""); setFormHostName(session.host_name || "")
        setFormActivityMode(session.activity_mode || "线下")
        setSpaceId(session.space_id || (spaces[0]?.id || ""))
        setRoomId(session.room_id || "")
      } else {
        setEditingRecord(null)
        setFormDate(date)
        setFormStartTime("09:00"); setFormEndTime("10:00")
        setFormCourseType(ICS_COURSE_TYPES[0]); setFormCourseName(""); setFormDescription("")
        setFormHostId(""); setFormHostName("")
        setFormActivityMode("线下")
        const ds = defaultSpaceId || spaces[0]?.id || ""; const dr = ds ? (spaces.find(s => s.id === ds)?.rooms?.[0]?.id || "") : ""
        setSpaceId(ds); setRoomId(dr)
      }
    }
  }, [open, date, spaces, session, defaultSpaceId])


  const handleSave = async () => {
    setSaving(true)
    try {
      const data = {
        date: formDate, start_time: formStartTime || null, end_time: formEndTime || null,
        course_type: formCourseType, course_name: formCourseName,
        course_description: formDescription || undefined,
        host_id: formHostId, host_name: formHostName,
        activity_mode: formActivityMode,
        space_id: spaceId || undefined, room_id: roomId || undefined,
        room_name: (spaces.find(s => s.id === spaceId)?.rooms || []).find(r => r.id === roomId)?.name || "",
        space_name: spaces.find(s => s.id === spaceId)?.name || "",
      }
      let result: InternalCourseSession
      if (editingRecord) {
        result = await internalCourseSessionApi.update(editingRecord.id, data)
      } else {
        result = await internalCourseSessionApi.create(data)
      }
      onSaved(result)
    } catch (e: any) {
      const detail = e?.response?.data?.detail
      if (typeof detail === "string") alert(detail)
    } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-sm p-0 gap-0" initialFocus={false}>
        <DialogHeader className="px-6 pt-5 pb-4 border-b">
          <DialogTitle className="text-[15px]">{editingRecord ? "编辑内部课程" : "新增内部课程"}</DialogTitle>
        </DialogHeader>
        <div className="px-6 py-5 space-y-5" {...enterToNext}>
          <div className="grid grid-cols-[70px_1fr] items-center gap-3">
            <span className="text-[12px] text-[#8f959e] text-right">日期</span>
            <Input rounded="[2px]" type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} className="h-8 text-[12px]" />
          </div>
          <div className="grid grid-cols-[70px_1fr] items-center gap-3">
            <span className="text-[12px] text-[#8f959e] text-right">时间</span>
            <div className="flex items-center gap-2">
              <Input rounded="[2px]" type="time" value={formStartTime} onChange={(e) => setFormStartTime(e.target.value)} className="h-8 text-[12px] w-28" />
              <span className="text-[12px] text-[#8f959e]">至</span>
              <Input rounded="[2px]" type="time" value={formEndTime} onChange={(e) => setFormEndTime(e.target.value)} className="h-8 text-[12px] w-28" />
            </div>
          </div>
          <div className="grid grid-cols-[70px_1fr] items-center gap-3">
            <span className="text-[12px] text-[#8f959e] text-right">空间</span>
            <div className="flex items-center gap-2">
              <SelectDropdown rounded="[2px]"
                className="w-[122px]"
                value={spaceId}
                options={spaces.map(s => ({value: s.id, label: s.name}))}
                placeholder="选择空间"
                onChange={(v) => { setSpaceId(v); setRoomId(spaces.find(s => s.id === v)?.rooms?.[0]?.id || "") }}
              />
              <SelectDropdown rounded="[2px]"
                className="w-[122px]"
                value={roomId}
                options={(spaces.find(s => s.id === spaceId)?.rooms || []).map(r => ({value: r.id, label: r.name}))}
                placeholder={spaceId && (spaces.find(s => s.id === spaceId)?.rooms || []).length === 0 ? "无房间" : "选择房间"}
                disabled={!!spaceId && (spaces.find(s => s.id === spaceId)?.rooms || []).length === 0}
                onChange={(v) => setRoomId(v)}
              />
            </div>
          </div>
          <div className="grid grid-cols-[70px_1fr] items-center gap-3">
            <span className="text-[12px] text-[#8f959e] text-right">课程类型</span>
            <SelectDropdown rounded="[2px]"
              value={formCourseType}
              options={ICS_COURSE_TYPES.map(t => ({value: t, label: ICS_COURSE_LABELS[t] || t}))}
              onChange={(v) => setFormCourseType(v)}
            />
          </div>
          <div className="grid grid-cols-[70px_1fr] items-center gap-3">
            <span className="text-[12px] text-[#8f959e] text-right">课程名称</span>
            <Input rounded="[2px]" value={formCourseName} onChange={(e) => setFormCourseName(e.target.value)} className="h-8 text-[12px]" placeholder="输入课程名称" />
          </div>
          <div className="grid grid-cols-[70px_1fr] items-center gap-3">
            <span className="text-[12px] text-[#8f959e] text-right">活动方式</span>
            <SelectDropdown rounded="[2px]"
              value={formActivityMode}
              options={[{value: "线下", label: "线下"}, {value: "线上", label: "线上"}]}
              onChange={setFormActivityMode}
            />
          </div>
          <div className="grid grid-cols-[70px_1fr] items-center gap-3">
            <span className="text-[12px] text-[#8f959e] text-right">课程老师</span>
            <SelectDropdown rounded="[2px]"
              value={formHostId}
              options={teachers.map(c => ({value: c.id, label: c.nickname || c.name || ""}))}
              placeholder="选择老师"
              onChange={(v) => { setFormHostId(v); setFormHostName(teachers.find(c => c.id === v)?.nickname || teachers.find(c => c.id === v)?.name || "") }}
            />
          </div>
          <div className="grid grid-cols-[70px_1fr] items-start gap-3">
            <span className="text-[12px] text-[#8f959e] text-right mt-1">描述</span>
            <textarea value={formDescription} onChange={(e) => setFormDescription(e.target.value)}
              className="w-full min-h-[80px] px-3 py-2 rounded-md border border-input text-[12px] resize-none" placeholder="输入课程简介..." />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 pb-5 pt-2">
          <Button variant="outline" size="sm" onClick={onClose}>取消</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? "保存中..." : "保存"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
})

// ===== Salon Dialog (独立组件) =====
const SalonDialog = memo(({ open, date, spaces, courses, teachers, session, defaultSpaceId, onClose, onSaved }: {
  open: boolean; date: string; spaces: Space[]; courses: {id: string, name: string}[]
  teachers: CustomerLight[]; session?: ClassRecord | null; defaultSpaceId?: string; onClose: () => void
  onSaved: (record: ClassRecord) => void
}) => {
  const enterToNext = useEnterToNext()
  const [editingRecord, setEditingRecord] = useState<ClassRecord | null>(null)
  const [saving, setSaving] = useState(false)
  const [formDate, setFormDate] = useState(date)
  const [formStartTime, setFormStartTime] = useState("09:00")
  const [formEndTime, setFormEndTime] = useState("10:00")
  const [formCourseId, setFormCourseId] = useState("")
  const [formTeacherIds, setFormTeacherIds] = useState<string[]>([])
  const [formDescription, setFormDescription] = useState("")
  const [formIsPublicWelfare, setFormIsPublicWelfare] = useState(false)
  const [formActivityMode, setFormActivityMode] = useState("线下")
  const [spaceId, setSpaceId] = useState("")
  const [roomId, setRoomId] = useState("")

  useEffect(() => {
    if (open) {
      if (session) {
        setEditingRecord(session)
        setFormDate(session.date)
        setFormStartTime(session.start_time || "")
        setFormEndTime(session.end_time || "")
        setFormCourseId(session.course_id || "")
        setFormTeacherIds(session.teacher_ids || [])
        setFormDescription(session.course_description || "")
        setFormIsPublicWelfare(session.is_public_welfare || false)
        setFormActivityMode(session.activity_mode || "线下")
        setSpaceId(session.space_id || (spaces[0]?.id || ""))
        setRoomId(session.room_id || "")
      } else {
        setEditingRecord(null)
        setFormDate(date)
        setFormStartTime("09:00"); setFormEndTime("10:00")
        setFormCourseId(""); setFormTeacherIds([])
        setFormDescription(""); setFormIsPublicWelfare(false)
        setFormActivityMode("线下")
        const ds = defaultSpaceId || spaces[0]?.id || ""; const dr = ds ? (spaces.find(s => s.id === ds)?.rooms?.[0]?.id || "") : ""
        setSpaceId(ds); setRoomId(dr)
      }
    }
  }, [open, date, spaces, session, defaultSpaceId])



  const handleSave = async () => {
    if (!formCourseId) return
    setSaving(true)
    try {
      let result: ClassRecord
      if (editingRecord) {
        const course = courses.find(c => c.id === formCourseId)
        result = await classRecordApi.update(editingRecord.id, {
          date: formDate, start_time: formStartTime || null, end_time: formEndTime || null,
          course_id: formCourseId, course_name: course?.name || editingRecord.course_name,
          course_type: course?.name || editingRecord.course_type || '',
          course_description: formDescription, teacher_ids: formTeacherIds,
          is_public_welfare: formIsPublicWelfare,
          activity_mode: formActivityMode,
          space_id: spaceId || undefined, room_id: roomId || undefined,
          room_name: (spaces.find(s => s.id === spaceId)?.rooms || []).find(r => r.id === roomId)?.name || "",
        space_name: spaces.find(s => s.id === spaceId)?.name || "",
        })
      } else {
        const course = courses.find(c => c.id === formCourseId)
        if (!course) return
        result = await classRecordApi.create({
          date: formDate, start_time: formStartTime || null, end_time: formEndTime || null,
          course_id: formCourseId, course_name: course.name,
          course_type: course.name,
          course_description: formDescription, teacher_ids: formTeacherIds,
          is_public_welfare: formIsPublicWelfare,
          activity_mode: formActivityMode,
          space_id: spaceId || undefined, room_id: roomId || undefined,
          room_name: (spaces.find(s => s.id === spaceId)?.rooms || []).find(r => r.id === roomId)?.name || "",
        space_name: spaces.find(s => s.id === spaceId)?.name || "",
        })
      }
      onSaved(result)
    } catch (e: any) {
      const detail = e?.response?.data?.detail
      if (typeof detail === "string") alert(detail)
    } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-sm p-0 gap-0" initialFocus={false}>
        <DialogHeader className="px-6 pt-5 pb-4 border-b">
          <DialogTitle className="text-[15px]">{editingRecord ? "编辑沙龙活动" : "新增沙龙活动"}</DialogTitle>
        </DialogHeader>
        <div className="px-6 py-5 space-y-5" {...enterToNext}>
          <div className="grid grid-cols-[70px_1fr] items-center gap-3">
            <span className="text-[12px] text-[#8f959e] text-right">日期</span>
            <Input rounded="[2px]" type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} className="h-8 text-[12px]" />
          </div>
          <div className="grid grid-cols-[70px_1fr] items-center gap-3">
            <span className="text-[12px] text-[#8f959e] text-right">时间</span>
            <div className="flex items-center gap-2">
              <Input rounded="[2px]" type="time" value={formStartTime} onChange={(e) => setFormStartTime(e.target.value)} className="h-8 text-[12px] w-28" />
              <span className="text-[12px] text-[#8f959e]">至</span>
              <Input rounded="[2px]" type="time" value={formEndTime} onChange={(e) => setFormEndTime(e.target.value)} className="h-8 text-[12px] w-28" />
            </div>
          </div>
          <div className="grid grid-cols-[70px_1fr] items-center gap-3">
            <span className="text-[12px] text-[#8f959e] text-right">空间</span>
            <div className="flex items-center gap-2">
              <SelectDropdown rounded="[2px]"
                className="w-[122px]"
                value={spaceId}
                options={spaces.map(s => ({value: s.id, label: s.name}))}
                placeholder="选择空间"
                onChange={(v) => { setSpaceId(v); setRoomId(spaces.find(s => s.id === v)?.rooms?.[0]?.id || "") }}
              />
              <SelectDropdown rounded="[2px]"
                className="w-[122px]"
                value={roomId}
                options={(spaces.find(s => s.id === spaceId)?.rooms || []).map(r => ({value: r.id, label: r.name}))}
                placeholder={spaceId && (spaces.find(s => s.id === spaceId)?.rooms || []).length === 0 ? "无房间" : "选择房间"}
                disabled={!!spaceId && (spaces.find(s => s.id === spaceId)?.rooms || []).length === 0}
                onChange={(v) => setRoomId(v)}
              />
            </div>
          </div>
          <div className="grid grid-cols-[70px_1fr] items-center gap-3">
            <span className="text-[12px] text-[#8f959e] text-right">课程</span>
            <SelectDropdown rounded="[2px]"
              value={formCourseId}
              options={courses.map(c => ({value: c.id, label: c.name}))}
              placeholder="选择课程"
              onChange={(v) => setFormCourseId(v)}
            />
          </div>
          <div className="grid grid-cols-[70px_1fr] items-center gap-3">
            <span className="text-[12px] text-[#8f959e] text-right">活动方式</span>
            <SelectDropdown rounded="[2px]"
              value={formActivityMode}
              options={[{value: "线下", label: "线下"}, {value: "线上", label: "线上"}]}
              onChange={setFormActivityMode}
            />
          </div>
          <div className="grid grid-cols-[70px_1fr] items-start gap-3">
            <span className="text-[12px] text-[#8f959e] text-right pt-2">老师</span>
            <SelectDropdown rounded="[2px]"
              value={formTeacherIds}
              options={teachers.map(c => ({value: c.id, label: c.nickname || c.name || ""}))}
              placeholder="选择老师"
              onChange={(v) => setFormTeacherIds(Array.isArray(v) ? v : [v])}
              multi={true}
              hideCheckbox={true}
              hideSelectedStyle={true}
            />
          </div>
          <div className="grid grid-cols-[70px_1fr] items-center gap-3">
            <span className="text-[12px] text-[#8f959e] text-right">公益</span>
            <SelectDropdown rounded="[2px]"
              value={formIsPublicWelfare ? "true" : "false"}
              options={[{value: "false", label: "否"}, {value: "true", label: "是"}]}
              onChange={(v) => setFormIsPublicWelfare(v === "true")}
            />
          </div>
          <div className="grid grid-cols-[70px_1fr] items-start gap-3">
            <span className="text-[12px] text-[#8f959e] text-right mt-1">描述</span>
            <textarea value={formDescription} onChange={(e) => setFormDescription(e.target.value)}
              className="w-full min-h-[80px] px-3 py-2 rounded-md border border-input text-[12px] resize-none" placeholder="输入活动简介..." />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 pb-5 pt-2">
          <Button variant="outline" size="sm" onClick={onClose}>取消</Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !formCourseId}>{saving ? "保存中..." : "保存"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
})

const DateScroller = memo(({ dateRange, calendarCounts, detailDate, todayStr, onPrev, onNext, onSelectDate }: {
  dateRange: string[]; calendarCounts: Record<string, number>; detailDate: string; todayStr: string
  onPrev: () => void; onNext: () => void; onSelectDate: (d: string) => void
}) => (
  <div className="flex items-center justify-between gap-1 mt-1 h-[52px]">
    <button className="h-7 w-7 flex items-center justify-center rounded hover:bg-[#f0f0f0] shrink-0" onClick={onPrev}>
      <ChevronLeft className="h-4 w-4 text-[#4e535a]" />
    </button>
    <div className="flex-1 flex items-center justify-between overflow-x-auto">
      {dateRange.map((d) => {
        const isSelected = d === detailDate
        const isToday = d === todayStr
        const dayCount = calendarCounts[d] || 0
        return (
          <button
            key={d}
            className={`shrink-0 flex flex-col items-center justify-center w-10 h-12 rounded-[2px] transition-colors ${
              isSelected ? "bg-[#3370ff] text-white" : isToday ? "bg-[#f0f5ff]" : "hover:bg-[#f7f8fa]"
            }`}
            onClick={() => onSelectDate(d)}
          >
            <span className={`text-[10px] leading-none h-3 flex items-center ${isSelected ? "text-white/80" : "text-[#8f959e]"}`}>
              {getWeekday(d)}
            </span>
            <span className="text-[14px] font-medium leading-none h-4 flex items-center">{d.split("-")[2]}</span>
            <span className={`text-[9px] leading-none h-3 flex items-center mt-0.5 ${isSelected ? "text-white/80" : dayCount > 0 ? "text-[#b0b5bb]" : "text-transparent"}`}>
              {dayCount > 0 ? `${dayCount}场` : " "}
            </span>
          </button>
        )
      })}
    </div>
    <button className="h-7 w-7 flex items-center justify-center rounded hover:bg-[#f0f0f0] shrink-0" onClick={onNext}>
      <ChevronRight className="h-4 w-4 text-[#4e535a]" />
    </button>
  </div>
))

// ===== WeekThemeDialog =====
const WeekThemeDialog = memo(({ open, weekIndex, weekDays, themeMap, spaces, defaultSpaceId, onClose, onSaved }: {
  open: boolean
  weekIndex: number
  weekDays: { date: string; weekday: string }[]
  themeMap: Map<string, ActivityTheme>
  spaces: Space[]
  defaultSpaceId: string
  onClose: () => void
  onSaved: (themes: {
    date: string
    space_id: string
    week_theme: string
    week_theme_detail: string
    day_theme: string
    day_theme_detail: string
  }[]) => Promise<void>
}) => {
  const [weekTheme, setWeekTheme] = useState("")
  const [weekThemeDetail, setWeekThemeDetail] = useState("")
  const [dayThemes, setDayThemes] = useState<Record<string, string>>({})
  const [dayThemeDetails, setDayThemeDetails] = useState<Record<string, string>>({})
  const [selectedSpaceIds, setSelectedSpaceIds] = useState<string[]>([])
  const [spaceDropdownOpen, setSpaceDropdownOpen] = useState(false)
  const spaceDropdownRef = useRef<HTMLDivElement>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!spaceDropdownOpen) return
    const h = (e: PointerEvent) => {
      if (spaceDropdownRef.current && !spaceDropdownRef.current.contains(e.target as Node)) {
        setSpaceDropdownOpen(false)
      }
    }
    document.addEventListener("pointerdown", h)
    return () => document.removeEventListener("pointerdown", h)
  }, [spaceDropdownOpen])

  useEffect(() => {
    if (open) {
      const firstTheme = weekDays.map(day => themeMap.get(day.date)).find(Boolean)
      setWeekTheme(firstTheme?.week_theme || "")
      setWeekThemeDetail(firstTheme?.week_theme_detail || "")
      const dt: Record<string, string> = {}
      const details: Record<string, string> = {}
      for (const day of weekDays) {
        dt[day.date] = themeMap.get(day.date)?.day_theme || ""
        details[day.date] = themeMap.get(day.date)?.day_theme_detail || ""
      }
      setDayThemes(dt)
      setDayThemeDetails(details)
      // 初始化已选空间：从当前主题的 space_id 读取
      const spaceIds = new Set<string>()
      for (const day of weekDays) {
        const t = themeMap.get(day.date)
        if (t?.space_id) spaceIds.add(t.space_id)
      }
      setSelectedSpaceIds(spaceIds.size > 0 ? Array.from(spaceIds) : (defaultSpaceId ? [defaultSpaceId] : []))
      setSpaceError(false)
    }
  }, [open, weekDays, defaultSpaceId])

  const [spaceError, setSpaceError] = useState(false)

  const handleSave = async () => {
    if (selectedSpaceIds.length === 0) {
      setSpaceError(true)
      return
    }
    setSaving(true)
    try {
      const themes = weekDays.flatMap(day =>
        selectedSpaceIds.map(sid => ({
          date: day.date,
          space_id: sid,
          week_theme: weekTheme,
          week_theme_detail: weekThemeDetail,
          day_theme: dayThemes[day.date] || "",
          day_theme_detail: dayThemeDetails[day.date] || "",
        }))
      )
      await onSaved(themes)
      onClose()
    } catch (e: any) {
      alert(e?.message || "保存失败")
    } finally {
      setSaving(false)
    }
  }

  const dateRangeLabel = `${weekDays[0]?.date.split("-").slice(1).join("/")} - ${weekDays[weekDays.length - 1]?.date.split("-").slice(1).join("/")}`

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-3xl p-0 gap-0" initialFocus={false}>
        <DialogHeader className="px-6 pt-5 pb-4 border-b">
          <DialogTitle className="text-[15px]">第{weekIndex + 1}周 {dateRangeLabel}</DialogTitle>
        </DialogHeader>
        <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-[80px_1fr] items-start gap-3">
            <span className="text-[12px] text-[#8f959e] text-right font-light pt-2">所属空间</span>
            <div className="space-y-1.5">
              <div ref={spaceDropdownRef} className="relative" onPointerDown={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className="flex items-center justify-between w-full h-8 px-2 text-[12px] rounded-md border border-input bg-transparent"
                  onClick={() => setSpaceDropdownOpen(!spaceDropdownOpen)}
                >
                  <span className={`truncate ${selectedSpaceIds.length > 0 ? "text-[#2b2f36]" : "text-[#8f959e]"}`}>
                    {selectedSpaceIds.length > 0 ? `已选 ${selectedSpaceIds.length} 个空间` : "选择空间"}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 text-[#8f959e] shrink-0 ml-1" />
                </button>
                {spaceDropdownOpen && (
                  <div className="absolute top-full left-0 mt-1 w-full bg-white rounded-md border border-[#e8e8e8] shadow-lg z-50 max-h-[200px] overflow-y-auto" onPointerDown={(e) => e.stopPropagation()}>
                    {spaces.map((space) => (
                      <button
                        key={space.id}
                        type="button"
                        className="block w-full text-left px-2 py-2 text-[12px] text-[#2b2f36] hover:bg-[#f7f8fa] truncate"
                        onClick={() => {
                          setSelectedSpaceIds(prev =>
                            prev.includes(space.id) ? prev.filter(id => id !== space.id) : [...prev, space.id]
                          )
                          setSpaceError(false)
                          setSpaceDropdownOpen(false)
                        }}
                      >
                        {space.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {selectedSpaceIds.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {selectedSpaceIds.map(id => {
                    const space = spaces.find(s => s.id === id)
                    if (!space) return null
                    return (
                      <span
                        key={id}
                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-[#f0f5ff] text-[11px] text-[#3370ff]"
                      >
                        {space.name}
                        <button
                          type="button"
                          className="hover:text-[#e02020]"
                          onClick={() => setSelectedSpaceIds(prev => prev.filter(sid => sid !== id))}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    )
                  })}
                </div>
              )}
              {spaceError && <p className="text-xs text-destructive">请选择所属空间</p>}
            </div>
          </div>
          <div className="grid grid-cols-[80px_minmax(0,0.8fr)_minmax(0,1.2fr)] items-start gap-3">
            <span className="pt-2 text-[12px] text-[#8f959e] text-right font-light">周主题</span>
            <Textarea
              value={weekTheme}
              onChange={(e) => setWeekTheme(e.target.value)}
              placeholder="输入本周主题"
              rows={2}
              className="min-h-14 resize-y rounded-[4px]"
            />
            <Textarea
              value={weekThemeDetail}
              onChange={(e) => setWeekThemeDetail(e.target.value)}
              placeholder="输入周主题详情"
              rows={2}
              className="min-h-14 resize-y rounded-[4px]"
            />
          </div>
          <div className="space-y-3">
            <div className="grid grid-cols-[80px_minmax(0,0.8fr)_minmax(0,1.2fr)] gap-3">
              <span className="text-[12px] text-[#8f959e] text-right font-light">日期</span>
              <span className="text-[12px] text-[#8f959e] font-light">每日主题</span>
              <span className="text-[12px] text-[#8f959e] font-light">主题详情</span>
            </div>
            <div className="space-y-2">
              {weekDays.map((day) => (
                <div key={day.date} className="grid grid-cols-[80px_minmax(0,0.8fr)_minmax(0,1.2fr)] items-start gap-3">
                  <span className="pt-2 text-[12px] text-[#8f959e] text-right font-light">
                    {day.date.split("-").slice(1).join("/")} 周{day.weekday}
                  </span>
                  <Textarea
                    value={dayThemes[day.date] || ""}
                    onChange={(e) => setDayThemes(prev => ({ ...prev, [day.date]: e.target.value }))}
                    placeholder="输入每日主题"
                    rows={2}
                    className="min-h-14 resize-y rounded-[4px]"
                  />
                  <Textarea
                    value={dayThemeDetails[day.date] || ""}
                    onChange={(e) => setDayThemeDetails(prev => ({ ...prev, [day.date]: e.target.value }))}
                    placeholder="输入当天主题详情"
                    rows={2}
                    className="min-h-14 resize-y rounded-[4px]"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 pb-5 pt-2">
          <Button variant="outline" size="sm" onClick={onClose}>取消</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? "保存中..." : "保存"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
})

// ===== HistoryDayGroup 三级手风琴组件 =====
type HourGroup = { hour: string; entries: HistoryEntry[] }
type DayGroup = { date: string; label: string; hours: HourGroup[] }

function HistoryDayGroup({ day, defaultExpanded, previewEntry, onSelectEntry }: {
  day: DayGroup
  defaultExpanded: boolean
  previewEntry: HistoryEntry | null
  onSelectEntry: (entry: HistoryEntry) => void
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [expandedHours, setExpandedHours] = useState<Set<string>>(() => {
    // 默认展开最后一个小时
    if (day.hours.length > 0) return new Set([day.hours[day.hours.length - 1].hour])
    return new Set()
  })

  const toggleHour = (hour: string) => {
    setExpandedHours(prev => {
      const next = new Set(prev)
      if (next.has(hour)) next.delete(hour)
      else next.add(hour)
      return next
    })
  }

  return (
    <div className="mb-1">
      {/* 一级：天 */}
      <button
        className="w-full flex items-center gap-2 px-2 py-2 rounded hover:bg-[#f7f8fa] text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <ChevronDown className={`h-3.5 w-3.5 text-[#8f959e] shrink-0 transition-transform ${expanded ? "" : "-rotate-90"}`} />
        <span className="text-[13px] font-medium text-[#2b2f36]">{day.label}</span>
        <span className="text-[11px] text-[#b0b5bb] ml-auto">{day.hours.reduce((s, h) => s + h.entries.length, 0)}条</span>
      </button>
      {expanded && (
        <div className="ml-2">
          {day.hours.map(hour => (
            <div key={hour.hour}>
              {/* 二级：小时 */}
              <button
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[#f7f8fa] text-left"
                onClick={() => toggleHour(hour.hour)}
              >
                <ChevronDown className={`h-3 w-3 text-[#b0b5bb] shrink-0 transition-transform ${expandedHours.has(hour.hour) ? "" : "-rotate-90"}`} />
                <span className="text-[12px] text-[#8f959e]">{hour.hour}:00</span>
                <span className="text-[11px] text-[#b0b5bb] ml-auto">{hour.entries.length}条</span>
              </button>
              {expandedHours.has(hour.hour) && (
                <div className="ml-3">
                  {hour.entries.map((entry, ei) => {
                    const isFirstOfHour = ei === 0
                    const t = new Date(entry.timestamp)
                    const time = `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`
                    const isSelected = previewEntry === entry
                    return (
                      <button
                        key={entry.id || entry.timestamp}
                        className={`w-full flex items-center gap-2 px-2 py-2 rounded text-left transition-colors ${
                          isSelected ? "bg-[#f0f5ff] border border-[#3370ff]" : "hover:bg-[#f7f8fa]"
                        }`}
                        onClick={() => onSelectEntry(entry)}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-[#b0b5bb]">{time}</span>
                            {isFirstOfHour && hour.entries.length > 1 && (
                              <span className="text-[10px] text-[#3370ff] bg-[#f0f5ff] px-1 rounded">最近更新</span>
                            )}
                            <span className="text-[12px] text-[#2b2f36] truncate">{entry.action}</span>
                          </div>
                          <div className="text-[11px] text-[#8f959e] mt-0.5">
                            {entry.userName}{entry.ip ? ` · ${entry.ip}` : ""}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function DailyActivitiesPage() {
  const navigate = useNavigate()
  const today = useMemo(() => formatDate(new Date()), [])
  // ===== Core state =====
  const [detailDate, setDetailDate] = useState(() => {
    try { return localStorage.getItem("shared-selected-date") || localStorage.getItem("daily-activities-date") || today } catch { return today }
  })
  const [monthPickerOpen, setMonthPickerOpen] = useState(false)
  const [dateRangeStart, setDateRangeStart] = useState(() => {
    try {
      const stored = localStorage.getItem("shared-selected-date") || localStorage.getItem("daily-activities-date")
      return formatDate(addDays(stored ? new Date(stored) : new Date(), -7))
    } catch { return formatDate(addDays(new Date(), -7)) }
  })
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [allCustomers, setAllCustomers] = useState<CustomerLight[]>([])
  const [courses, setCourses] = useState<{id: string, name: string}[]>([])
  const [teachers, setTeachers] = useState<CustomerLight[]>([])
  const [calendarCounts, setCalendarCounts] = useState<Record<string, number>>({})
  const [spaces, setSpaces] = useState<Space[]>([])
  const [memberIdentities, setMemberIdentities] = useState<MemberIdentity[]>([])
  const [noSpacesDialogOpen, setNoSpacesDialogOpen] = useState(false)
  const [withdrawalDialogOpen, setWithdrawalDialogOpen] = useState(false)
  const [withdrawalCourseId, setWithdrawalCourseId] = useState("")
  const [withdrawalCustomerId, setWithdrawalCustomerId] = useState("")
  const [withdrawing, setWithdrawing] = useState(false)
  const [selectedSpaceId, setSelectedSpaceId] = useState(() => {
    try { return localStorage.getItem("selected-space-id") || "" } catch { return "" }
  })
  // Activity data (5 types from dashboard)
  const [detailRecords, setDetailRecords] = useState<ClassRecord[]>([])
  const [detailGcsSessions, setDetailGcsSessions] = useState<GroupCaseSession[]>([])
  const [detailErsSessions, setDetailErsSessions] = useState<EmotionalReleaseSession[]>([])
  const [detailEksSessions, setDetailEksSessions] = useState<EnergyKnotSession[]>([])
  const [detailIcsSessions, setDetailIcsSessions] = useState<InternalCourseSession[]>([])
  const [detailVisits, setDetailVisits] = useState<any[]>([])

  // ===== Salon dialog state (minimal - form state lives in SalonDialog) =====
  const [dialogOpen, setDialogOpen] = useState(false)
  const [salonEditSession, setSalonEditSession] = useState<ClassRecord | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [materialsDialogOpen, setMaterialsDialogOpen] = useState(false)
  const [materialsRecord, setMaterialsRecord] = useState<ClassRecord | null>(null)
  const [uploading, setUploading] = useState(false)

  // ===== GCS dialog state (minimal - form state lives in GcsDialog) =====
  const [gcsDialogOpen, setGcsDialogOpen] = useState(false)
  const [gcsEditSession, setGcsEditSession] = useState<GroupCaseSession | null>(null)
  const [gcsDeleteId, setGcsDeleteId] = useState<string | null>(null)
  const [gcsMaterialsDialogOpen, setGcsMaterialsDialogOpen] = useState(false)
  const [gcsMaterialsRecord, setGcsMaterialsRecord] = useState<GroupCaseSession | null>(null)

  // ===== ERS dialog state (minimal - form state lives in ErsDialog) =====
  const [ersDialogOpen, setErsDialogOpen] = useState(false)
  const [ersEditSession, setErsEditSession] = useState<EmotionalReleaseSession | null>(null)
  const [ersDeleteId, setErsDeleteId] = useState<string | null>(null)

  // ===== EKS dialog state (minimal - form state lives in EksDialog) =====
  const [eksDialogOpen, setEksDialogOpen] = useState(false)
  const [eksEditSession, setEksEditSession] = useState<EnergyKnotSession | null>(null)
  const [eksDeleteId, setEksDeleteId] = useState<string | null>(null)

  // ===== ICS dialog state (minimal - form state lives in IcsDialog) =====
  const [icsDialogOpen, setIcsDialogOpen] = useState(false)
  const [icsEditSession, setIcsEditSession] = useState<InternalCourseSession | null>(null)
  const [icsDeleteId, setIcsDeleteId] = useState<string | null>(null)
  const [icsMaterialsDialogOpen, setIcsMaterialsDialogOpen] = useState(false)
  const [icsMaterialsRecord, setIcsMaterialsRecord] = useState<InternalCourseSession | null>(null)


  // ===== Warning dialog =====
  const [warningOpen, setWarningOpen] = useState(false)
  const [warningMsg, setWarningMsg] = useState("")

  // ===== Save status =====
  const [savingCount, setSavingCount] = useState(0)
  const [savedCount, setSavedCount] = useState(0)
  const [restoring, setRestoring] = useState(false)

  // ===== Undo/Redo state =====
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const undoRef = useRef<() => void>(() => {})
  const redoRef = useRef<() => void>(() => {})
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([])
  const [cloudHistory, setCloudHistory] = useState<HistoryEntry[]>([])
  const [historyPanelOpen, setHistoryPanelOpen] = useState(false)
  const [previewEntry, setPreviewEntry] = useState<HistoryEntry | null>(null)
  const restoreRef = useRef<((entry: HistoryEntry) => Promise<void>) | null>(null)
  const captureRef = useRef<(() => void) | null>(null)
  const loadSeqRef = useRef(0)

  const handleUndoRedoChange = useCallback((cu: boolean, cr: boolean, u: () => void, r: () => void, history: HistoryEntry[]) => {
    setCanUndo(cu); setCanRedo(cr)
    undoRef.current = u; redoRef.current = r
    setHistoryEntries(history)
  }, [])

  const undo = useCallback(() => { undoRef.current(); setPreviewEntry(null) }, [])
  const redo = useCallback(() => { redoRef.current(); setPreviewEntry(null) }, [])

  // 键盘快捷键 Ctrl+Z / Ctrl+Shift+Z
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [undo, redo])

  // 从云端加载历史记录
  useEffect(() => {
    if (!selectedSpaceId) { setCloudHistory([]); return }
    activityHistoryApi.list(detailDate, selectedSpaceId)
      .then(records => {
        const entries: HistoryEntry[] = records.map(r => ({
          id: r.id,
          timestamp: new Date(r.created_at).getTime(),
          action: r.action,
          userName: r.user_name,
          ip: r.ip || undefined,
          rows: r.rows_snapshot,
          changedKeys: r.changed_keys,
          changedCells: r.changed_cells,
        }))
        setCloudHistory(entries)
      })
      .catch(() => {})
  }, [detailDate, selectedSpaceId])

  // 合并本地 + 云端历史（按行数据内容去重）
  const mergedHistory = useMemo(() => {
    const all = [...historyEntries, ...cloudHistory]
    all.sort((a, b) => b.timestamp - a.timestamp)
    // 按行数据去重：相同 rows 只保留一条，优先保留有描述操作的条目
    const result: HistoryEntry[] = []
    const seenRowsKeys = new Set<string>()
    for (const entry of all) {
      const rowsKey = JSON.stringify(entry.rows)
      if (seenRowsKeys.has(rowsKey)) {
        // rows 相同时，优先保留有操作描述的条目（非"当前状态"）
        const existingIdx = result.findIndex(e => JSON.stringify(e.rows) === rowsKey)
        if (existingIdx >= 0 && result[existingIdx].action === "当前状态" && entry.action !== "当前状态") {
          result[existingIdx] = entry
        }
        continue
      }
      seenRowsKeys.add(rowsKey)
      result.push(entry)
    }
    // 移除多余的"当前状态"条目（只在第一条时保留）
    return result.filter((e, i) => e.action !== "当前状态" || i === 0)
  }, [historyEntries, cloudHistory])

  // 动态计算当前条目与上一条的差异
  const previewChangedCells = useMemo(() => {
    if (!previewEntry) return undefined
    const idx = mergedHistory.indexOf(previewEntry)
    if (idx < 0 || idx >= mergedHistory.length - 1) return undefined
    const prevEntry = mergedHistory[idx + 1]
    const diffCells: { rowKey: number; fields: string[] }[] = []
    const IGNORED_KEYS = new Set(["key", "raw", "pendingCreate", "course_id", "ics_course_key", "class_course_type"])
    // 用 record_id 匹配行（key 是本地自增 ID，刷新后会变）
    const prevMap = new Map<string, any>()
    for (const r of prevEntry.rows) {
      const id = r.record_id || `__key_${r.key}`
      prevMap.set(id, r)
    }
    const matchedPrevIds = new Set<string>()
    for (const curRow of previewEntry.rows) {
      const id = curRow.record_id || `__key_${curRow.key}`
      const prevRow = prevMap.get(id)
      matchedPrevIds.add(id)
      if (!prevRow) {
        diffCells.push({ rowKey: curRow.key, fields: Object.keys(curRow).filter(k => !IGNORED_KEYS.has(k)) })
        continue
      }
      const changedFields: string[] = []
      for (const k of Object.keys(curRow)) {
        if (IGNORED_KEYS.has(k)) continue
        if (JSON.stringify((curRow as any)[k]) !== JSON.stringify((prevRow as any)[k])) {
          changedFields.push(k)
        }
      }
      if (changedFields.length > 0) diffCells.push({ rowKey: curRow.key, fields: changedFields })
    }
    // 检查被删除的行
    for (const prevRow of prevEntry.rows) {
      const id = prevRow.record_id || `__key_${prevRow.key}`
      if (!matchedPrevIds.has(id)) {
        diffCells.push({ rowKey: prevRow.key, fields: ["__deleted"] })
      }
    }
    return diffCells.length > 0 ? diffCells : undefined
  }, [previewEntry, mergedHistory])

  // 推送历史到云端
  const handleHistoryPushed = useCallback((entry: HistoryEntry) => {
    if (!selectedSpaceId) return
    activityHistoryApi.create({
      date: detailDate,
      space_id: selectedSpaceId,
      action: entry.action,
      user_name: entry.userName,
      ip: entry.ip,
      rows_snapshot: entry.rows,
      changed_keys: entry.changedKeys || [],
      changed_cells: entry.changedCells || [],
    }).catch(() => {})
  }, [detailDate, selectedSpaceId])

  // ===== Theme state =====
  const [themes, setThemes] = useState<ActivityTheme[]>([])
  const [themeEditWeekIndex, setThemeEditWeekIndex] = useState<number | null>(null)
  const [calendarVisible, setCalendarVisible] = useState(() => {
    try { return localStorage.getItem("daily-calendar-visible") !== "false" } catch { return true }
  })

  const themeMonthStart = useMemo(() => {
    const d = new Date(detailDate)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`
  }, [detailDate])
  const themeMonthEnd = useMemo(() => {
    const d = new Date(detailDate)
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`
  }, [detailDate])

  // 持久化当前选中日期
  useEffect(() => {
    try {
      localStorage.setItem("shared-selected-date", detailDate)
      localStorage.setItem("daily-activities-date", detailDate)
    } catch {}
  }, [detailDate])

  const themeMap = useMemo(() => {
    const map = new Map<string, ActivityTheme>()
    for (const t of themes) {
      const existing = map.get(t.date)
      // 优先使用有 space_id 的主题（覆盖旧的无空间数据）
      if (!existing || (t.space_id && !existing.space_id)) {
        map.set(t.date, t)
      }
    }
    return map
  }, [themes])

  const currentTheme = themeMap.get(detailDate)
  const weekThemeStr = currentTheme?.week_theme || ""
  const dayThemeStr = currentTheme?.day_theme || ""

  // 计算当前日期所在周在本月的周索引
  const themeWeeks = useMemo(() => {
    const result: { days: { date: string; weekday: string; inMonth: boolean }[] }[] = []
    const startDate = new Date(themeMonthStart)
    const endDate = new Date(themeMonthEnd)
    const firstDay = new Date(startDate)
    const dayOfWeek = firstDay.getDay()
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
    firstDay.setDate(firstDay.getDate() + mondayOffset)
    let current = new Date(firstDay)
    while (current <= endDate || result.length === 0) {
      const weekDays: { date: string; weekday: string; inMonth: boolean }[] = []
      for (let i = 0; i < 7; i++) {
        const d = new Date(current)
        d.setDate(d.getDate() + i)
        const dateStr = formatDate(d)
        weekDays.push({ date: dateStr, weekday: ["日", "一", "二", "三", "四", "五", "六"][d.getDay()], inMonth: d >= startDate && d <= endDate })
      }
      result.push({ days: weekDays })
      current.setDate(current.getDate() + 7)
      if (current > endDate && current.getDay() === 1) break
    }
    while (result.length > 0 && result[result.length - 1].days.every(d => !d.inMonth)) result.pop()
    return result
  }, [themeMonthStart, themeMonthEnd])

  const currentWeekIndex = useMemo(() => {
    return themeWeeks.findIndex(w => w.days.some(d => d.date === detailDate))
  }, [themeWeeks, detailDate])

  // 加载主题（按空间筛选，带序列号防竞态）
  const themeSeqRef = useRef(0)
  useEffect(() => {
    const seq = ++themeSeqRef.current
    const spaceFilter = selectedSpaceId ? [selectedSpaceId] : undefined
    activityThemeApi.list(themeMonthStart, themeMonthEnd, spaceFilter)
      .then(data => { if (seq === themeSeqRef.current) setThemes(data) })
      .catch(() => { if (seq === themeSeqRef.current) setThemes([]) })
  }, [themeMonthStart, themeMonthEnd, selectedSpaceId])

  const saveTheme = async (date: string, weekTheme: string, dayTheme: string, spaceIds: string[]) => {
    const targetSpaceIds = spaceIds.length > 0 ? spaceIds : (selectedSpaceId ? [selectedSpaceId] : [""])
    for (const sid of targetSpaceIds) {
      const result = await activityThemeApi.save(date, weekTheme, dayTheme, sid)
      setThemes(prev => {
        const idx = prev.findIndex(t => t.date === date && t.space_id === sid)
        if (idx >= 0) { const next = [...prev]; next[idx] = result; return next }
        return [...prev, result]
      })
    }
  }

  const saveBatchThemes = async (themes: {
    date: string
    space_id: string
    week_theme: string
    week_theme_detail: string
    day_theme: string
    day_theme_detail: string
  }[]) => {
    const results = await activityThemeApi.batchSave(themes)
    setThemes(prev => {
      const next = [...prev]
      for (const result of results) {
        const idx = next.findIndex(t => t.date === result.date && t.space_id === result.space_id)
        if (idx >= 0) next[idx] = result
        else next.push(result)
      }
      return next
    })
  }

  // ===== Permissions =====
  const userPermissions = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("userPermissions") || "[]") } catch { return [] }
  }, [])
  const currentUser = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("currentUser") || "{}") } catch { return {} }
  }, [])
  const isSuperAdmin = currentUser?.role === "超级管理员"

  // ===== Derived data =====
  const dateRange = useMemo(() => Array.from({ length: 21 }, (_, i) => formatDate(addDays(new Date(dateRangeStart), i))), [dateRangeStart])

  // detailDate 变化时，确保日期在可视范围内
  useEffect(() => {
    if (detailDate < dateRange[0] || detailDate > dateRange[dateRange.length - 1]) {
      setDateRangeStart(formatDate(addDays(new Date(detailDate), -7)))
    }
  }, [detailDate, dateRange])

  const onDateScrollerPrev = useCallback(() => setDateRangeStart(prev => formatDate(addDays(new Date(prev), -7))), [])
  const onDateScrollerNext = useCallback(() => setDateRangeStart(prev => formatDate(addDays(new Date(prev), 7))), [])
  const onDateScrollerSelect = useCallback((d: string) => setDetailDate(d), [])

  const unifiedDetailRecords = useMemo(() => {
    const all = [
      ...detailRecords.map(r => ({ type: "class" as const, data: r })),
      ...detailGcsSessions.map(s => ({ type: "gcs" as const, data: s })),
      ...detailErsSessions.map(s => ({ type: "ers" as const, data: s })),
      ...detailEksSessions.map(s => ({ type: "eks" as const, data: s })),
      ...detailIcsSessions.map(s => ({ type: "ics" as const, data: s })),
    ]
    const filtered = selectedSpaceId ? all.filter(r => (r.data as any).space_id === selectedSpaceId) : all
    return filtered.sort((a, b) => {
      const at = (a.data as any).start_time || ""
      const bt = (b.data as any).start_time || ""
      if (!at && !bt) return 0
      if (!at) return 1
      if (!bt) return -1
      return at.localeCompare(bt)
    })
  }, [detailRecords, detailGcsSessions, detailErsSessions, detailEksSessions, detailIcsSessions, selectedSpaceId])

  // 当日所有参与者（从到场记录读取，按空间过滤）
  const dayParticipants = useMemo(() => {
    return detailVisits
      .filter(v => !selectedSpaceId || v.space_id === selectedSpaceId)
      .map(v => ({ id: v.customer_id, nickname: v.nickname || v.customer_id }))
      .filter(p => p.nickname)
  }, [detailVisits, selectedSpaceId])

  // Memoized customer lists — avoid re-filtering hundreds of customers on every render
  const eksHostCustomers = useMemo(() => allCustomers.filter(c => c.positions?.includes(POSITION_ENERGY_TEACHER)).sort((a, b) => (a.position_sort_orders?.[POSITION_ENERGY_TEACHER] ?? 9999) - (b.position_sort_orders?.[POSITION_ENERGY_TEACHER] ?? 9999)), [allCustomers])

  // ===== Helpers =====
  const handleApiError = (error: any) => {
    const detail = error?.response?.data?.detail
    if (typeof detail === "string" && detail.includes("已无剩余活动次数")) {
      setWarningMsg(detail)
      setWarningOpen(true)
      return
    }
    const msg = detail || error?.message || "操作失败"
    alert(msg)
  }

  // ===== Data loading =====
  const loadDateData = async (date: string) => {
    const seq = ++loadSeqRef.current
    setDetailLoading(true)
    try {
      const dashboard = await classRecordApi.dashboard(date, selectedSpaceId || undefined)
      if (seq !== loadSeqRef.current) return
      const { class_records: records, gcs_sessions: gcs, ers_sessions: ers, eks_sessions: eks, ics_sessions: ics } = dashboard

      setDetailRecords(records)
      setDetailGcsSessions(gcs)
      setDetailErsSessions(ers)
      setDetailEksSessions(eks)
      setDetailIcsSessions(ics)
      setDetailVisits(dashboard.visits || [])
      setCalendarCounts(dashboard.calendar_counts)

      // Collect unique customer IDs from all records
      const ids = new Set<string>()
      for (const r of records) {
        for (const t of r.teacher_ids) ids.add(t)
        for (const g of (r.groups || [])) {
          if (g.leader_id) ids.add(g.leader_id)
          if (g.deputy_id) ids.add(g.deputy_id)
          for (const mid of g.member_ids) ids.add(mid)
        }
      }
      for (const s of gcs) {
        if (s.owner_id) ids.add(s.owner_id)
        if (s.host_id) ids.add(s.host_id)
        for (const t of (s.teacher_ids || [])) ids.add(t)
        for (const pid of (s.participant_ids || [])) ids.add(pid)
      }
      for (const s of ers) {
        if (s.owner_id) ids.add(s.owner_id)
        if (s.host_id) ids.add(s.host_id)
        for (const t of (s.teacher_ids || [])) ids.add(t)
        for (const pid of (s.participant_ids || [])) ids.add(pid)
      }
      for (const s of eks) {
        for (const pid of (s.participant_ids || [])) ids.add(pid)
      }
      for (const s of ics) {
        for (const pid of (s.participant_ids || [])) ids.add(pid)
      }

      const uniqueIds = [...ids]
      if (uniqueIds.length > 0) {
        const customers = await customerApi.batch(uniqueIds).catch(() => [] as CustomerLight[])
        if (seq !== loadSeqRef.current) return
        // Merge into allCustomers without overwriting (teachers loaded separately via load())
        setAllCustomers(prev => {
          const existingIds = new Set(prev.map(c => c.id))
          const newCustomers = customers.filter(c => !existingIds.has(c.id))
          return newCustomers.length > 0 ? [...prev, ...newCustomers] : prev
        })
      }

    } finally {
      if (seq === loadSeqRef.current) {
        setDetailLoading(false)
        setLoading(false)
      }
    }
  }

  // ===== useCallback 稳定 onClose/onSaved 引用，避免 memo 子组件无效重渲染 =====
  const handleSalonClose = useCallback(() => { setDialogOpen(false) }, [])
  const handleGcsClose = useCallback(() => { setGcsDialogOpen(false) }, [])
  const handleErsClose = useCallback(() => { setErsDialogOpen(false) }, [])
  const handleEksClose = useCallback(() => { setEksDialogOpen(false) }, [])
  const handleIcsClose = useCallback(() => { setIcsDialogOpen(false) }, [])

  const handleSalonSaved = useCallback((record: ClassRecord) => {
    setDetailRecords(prev => {
      const exists = prev.some(r => r.id === record.id)
      if (!exists) setCalendarCounts(c => ({ ...c, [record.date]: (c[record.date] || 0) + 1 }))
      return exists ? prev.map(r => r.id === record.id ? record : r) : [record, ...prev]
    })
    setDialogOpen(false)
  }, [])
  const handleGcsSaved = useCallback((record: GroupCaseSession) => {
    setDetailGcsSessions(prev => {
      const exists = prev.some(r => r.id === record.id)
      if (!exists) setCalendarCounts(c => ({ ...c, [record.date]: (c[record.date] || 0) + 1 }))
      return exists ? prev.map(r => r.id === record.id ? record : r) : [record, ...prev]
    })
    setGcsDialogOpen(false)
  }, [])
  const handleErsSaved = useCallback((record: EmotionalReleaseSession) => {
    setDetailErsSessions(prev => {
      const exists = prev.some(r => r.id === record.id)
      if (!exists) setCalendarCounts(c => ({ ...c, [record.date]: (c[record.date] || 0) + 1 }))
      return exists ? prev.map(r => r.id === record.id ? record : r) : [record, ...prev]
    })
    setErsDialogOpen(false)
  }, [])
  const handleEksSaved = useCallback((record: EnergyKnotSession) => {
    setDetailEksSessions(prev => {
      const exists = prev.some(r => r.id === record.id)
      if (!exists) setCalendarCounts(c => ({ ...c, [record.date]: (c[record.date] || 0) + 1 }))
      return exists ? prev.map(r => r.id === record.id ? record : r) : [record, ...prev]
    })
    setEksDialogOpen(false)
  }, [])
  const handleIcsSaved = useCallback((record: InternalCourseSession) => {
    setDetailIcsSessions(prev => {
      const exists = prev.some(r => r.id === record.id)
      if (!exists) setCalendarCounts(c => ({ ...c, [record.date]: (c[record.date] || 0) + 1 }))
      return exists ? prev.map(r => r.id === record.id ? record : r) : [record, ...prev]
    })
    setIcsDialogOpen(false)
  }, [])
  const load = () => {
    courseTypeApi.list().then(data => setCourses(data.filter(t => t.category !== "other").map(t => ({ id: t.name, name: t.name })))).catch(() => {})
    spaceApi.list().then((list) => {
      setSpaces(list)
      if (list.length > 0) {
        if (!selectedSpaceId || !list.some(s => s.id === selectedSpaceId)) {
          setSelectedSpaceId(list[0].id)
          localStorage.setItem("selected-space-id", list[0].id)
        }
      }
    }).catch(() => {})
    customerApi.light()
      .then((customers) => {
        setAllCustomers(customers)
        setTeachers(customers.filter(c => c.positions?.includes(POSITION_COURSE_TEACHER)).sort((a, b) => (a.position_sort_orders?.[POSITION_COURSE_TEACHER] ?? 9999) - (b.position_sort_orders?.[POSITION_COURSE_TEACHER] ?? 9999)))
      })
      .catch(() => {})
    memberIdentityApi.list().then(setMemberIdentities).catch(() => {})
  }

  useEffect(() => { load() }, [])
  useEffect(() => { loadDateData(detailDate) }, [detailDate, selectedSpaceId])

  const handleSpaceSelect = useCallback((id: string) => {
    startTransition(() => {
      setSelectedSpaceId(id)
    })
    localStorage.setItem("selected-space-id", id)
  }, [])

  // ===== Salon handlers =====
  const handleOpenCreate = (date?: string) => {
    setSalonEditSession(null)
    setDialogOpen(true)
  }

  const handleOpenEdit = useCallback((record: ClassRecord) => {
    setSalonEditSession(record)
    setDialogOpen(true)
  }, [])

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await classRecordApi.delete(deleteId)
      setDeleteId(null)
      loadDateData(detailDate)
    } catch (e) { handleApiError(e) }
  }

  const handleOpenMaterials = useCallback((record: ClassRecord) => {
    setMaterialsRecord(record)
    setMaterialsDialogOpen(true)
  }, [])

  const handleUploadMaterial = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !materialsRecord) return
    setUploading(true)
    try {
      const material = await uploadApi.uploadMaterial(file)
      const newMaterials = [...(materialsRecord.materials || []), material]
      await classRecordApi.update(materialsRecord.id, { materials: newMaterials } as any)
      setMaterialsRecord({ ...materialsRecord, materials: newMaterials })
      loadDateData(detailDate)
    } catch { alert("上传失败，请重试") }
    finally { setUploading(false); e.target.value = "" }
  }

  const handleDeleteMaterial = async (filename: string) => {
    if (!materialsRecord) return
    try {
      await uploadApi.deleteMaterial(filename)
      const newMaterials = (materialsRecord.materials || []).filter(m => (m.url.split("/").pop() || "") !== filename)
      await classRecordApi.update(materialsRecord.id, { materials: newMaterials } as any)
      setMaterialsRecord({ ...materialsRecord, materials: newMaterials })
      loadDateData(detailDate)
    } catch {}
  }

  // ===== GCS handlers =====
  const handleOpenGcsCreate = (date?: string) => {
    setGcsEditSession(null)
    setGcsDialogOpen(true)
  }

  const handleOpenGcsEdit = useCallback((session: GroupCaseSession) => {
    setGcsEditSession(session)
    setGcsDialogOpen(true)
  }, [])

  const handleGcsDelete = async () => {
    if (!gcsDeleteId) return
    try {
      await groupCaseSessionApi.delete(gcsDeleteId)
      setGcsDeleteId(null)
      loadDateData(detailDate)
    } catch (e) { handleApiError(e) }
  }

  const handleOpenGcsMaterials = useCallback((session: GroupCaseSession) => {
    setGcsMaterialsRecord(session)
    setGcsMaterialsDialogOpen(true)
  }, [])

  const handleUploadGcsMaterial = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !gcsMaterialsRecord) return
    setUploading(true)
    try {
      const material = await uploadApi.uploadMaterial(file)
      const newMaterials = [...(gcsMaterialsRecord.materials || []), material]
      await groupCaseSessionApi.update(gcsMaterialsRecord.id, { materials: newMaterials } as any)
      setGcsMaterialsRecord({ ...gcsMaterialsRecord, materials: newMaterials })
      loadDateData(detailDate)
    } catch { alert("上传失败，请重试") }
    finally { setUploading(false); e.target.value = "" }
  }

  const handleDeleteGcsMaterial = async (filename: string) => {
    if (!gcsMaterialsRecord) return
    try {
      await uploadApi.deleteMaterial(filename)
      const newMaterials = (gcsMaterialsRecord.materials || []).filter(m => (m.url.split("/").pop() || "") !== filename)
      await groupCaseSessionApi.update(gcsMaterialsRecord.id, { materials: newMaterials } as any)
      setGcsMaterialsRecord({ ...gcsMaterialsRecord, materials: newMaterials })
      loadDateData(detailDate)
    } catch {}
  }

  // ===== ERS handlers =====
  const handleOpenErsCreate = (date?: string) => {
    setErsEditSession(null)
    setErsDialogOpen(true)
  }

  const handleOpenErsEdit = useCallback((session: EmotionalReleaseSession) => {
    setErsEditSession(session)
    setErsDialogOpen(true)
  }, [])

  const handleErsDelete = async () => {
    if (!ersDeleteId) return
    try {
      await emotionalReleaseSessionApi.delete(ersDeleteId)
      setErsDeleteId(null)
      loadDateData(detailDate)
    } catch (e) { handleApiError(e) }
  }

  // ===== EKS handlers =====
  const handleOpenEksCreate = (date?: string) => {
    setEksEditSession(null)
    setEksDialogOpen(true)
  }

  const handleOpenEksEdit = useCallback((session: EnergyKnotSession) => {
    setEksEditSession(session)
    setEksDialogOpen(true)
  }, [])

  const handleEksDelete = async () => {
    if (!eksDeleteId) return
    try {
      await energyKnotSessionApi.delete(eksDeleteId)
      setEksDeleteId(null)
      loadDateData(detailDate)
    } catch (e) { handleApiError(e) }
  }

  // ===== ICS handlers =====
  const handleOpenIcsCreate = (date?: string) => {
    setIcsEditSession(null)
    setIcsDialogOpen(true)
  }

  const handleOpenIcsEdit = useCallback((session: InternalCourseSession) => {
    setIcsEditSession(session)
    setIcsDialogOpen(true)
  }, [])

  const handleIcsDelete = async () => {
    if (!icsDeleteId) return
    try {
      await internalCourseSessionApi.delete(icsDeleteId)
      setIcsDeleteId(null)
      loadDateData(detailDate)
    } catch (e) { handleApiError(e) }
  }

  const handleOpenIcsMaterials = useCallback((session: InternalCourseSession) => {
    setIcsMaterialsRecord(session)
    setIcsMaterialsDialogOpen(true)
  }, [])

  const handleUploadIcsMaterial = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !icsMaterialsRecord) return
    setUploading(true)
    try {
      const material = await uploadApi.uploadMaterial(file)
      const newMaterials = [...(icsMaterialsRecord.materials || []), material]
      await internalCourseSessionApi.update(icsMaterialsRecord.id, { materials: newMaterials } as any)
      setIcsMaterialsRecord({ ...icsMaterialsRecord, materials: newMaterials })
      loadDateData(detailDate)
    } catch { alert("上传失败，请重试") }
    finally { setUploading(false); e.target.value = "" }
  }

  const handleDeleteIcsMaterial = async (filename: string) => {
    if (!icsMaterialsRecord) return
    try {
      await uploadApi.deleteMaterial(filename)
      const newMaterials = (icsMaterialsRecord.materials || []).filter(m => (m.url.split("/").pop() || "") !== filename)
      await internalCourseSessionApi.update(icsMaterialsRecord.id, { materials: newMaterials } as any)
      setIcsMaterialsRecord({ ...icsMaterialsRecord, materials: newMaterials })
      loadDateData(detailDate)
    } catch {}
  }

  // ===== Render helpers =====
  const courseMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const c of courses) map[c.id] = c.name
    return map
  }, [courses])

  const getMemberName = useCallback((id: string): string => {
    const c = allCustomers.find(c => c.id === id)
    return c?.nickname || c?.name || ""
  }, [allCustomers])

  const withdrawalCourses = useMemo(() => detailRecords.map(record => {
    const groupParticipantIds = (record.groups || []).flatMap(group => [
      group.leader_id,
      group.deputy_id,
      ...(group.member_ids || []),
    ].filter(Boolean))
    const participantIds = [...new Set([...(record.participant_ids || []), ...groupParticipantIds])]
    const withdrawnIds = new Set(record.withdrawn_participant_ids || [])
    const availableParticipantIds = participantIds.filter(id => (
      !withdrawnIds.has(id) && allCustomers.some(customer => customer.id === id)
    ))
    return { record, availableParticipantIds }
  }).filter(item => item.availableParticipantIds.length > 0), [detailRecords, allCustomers])

  const selectedWithdrawalCourse = withdrawalCourses.find(item => item.record.id === withdrawalCourseId)
  const withdrawalCustomers = (selectedWithdrawalCourse?.availableParticipantIds || [])
    .map(id => allCustomers.find(customer => customer.id === id))
    .filter((customer): customer is CustomerLight => Boolean(customer))

  const openWithdrawalDialog = () => {
    const firstCourse = withdrawalCourses[0]
    setWithdrawalCourseId(firstCourse?.record.id || "")
    setWithdrawalCustomerId("")
    setWithdrawalDialogOpen(true)
  }

  const handleCourseWithdrawal = async () => {
    if (!withdrawalCourseId || !withdrawalCustomerId || withdrawing) return
    setWithdrawing(true)
    try {
      await classRecordApi.withdrawParticipant(withdrawalCourseId, withdrawalCustomerId)
      setWithdrawalDialogOpen(false)
      setWithdrawalCourseId("")
      setWithdrawalCustomerId("")
      await loadDateData(detailDate)
    } catch (error) {
      handleApiError(error)
    } finally {
      setWithdrawing(false)
    }
  }

  const cardCallbacks = useMemo(() => ({
    teachers,
    spaces,
    courseMap,
    onCreateClass: handleOpenCreate,
    onEditClass: handleOpenEdit,
    onDeleteClass: setDeleteId,
    onMaterialsClass: handleOpenMaterials,
    onCreateGcs: handleOpenGcsCreate,
    onEditGcs: handleOpenGcsEdit,
    onDeleteGcs: setGcsDeleteId,
    onMaterialsGcs: handleOpenGcsMaterials,
    onCreateErs: handleOpenErsCreate,
    onEditErs: handleOpenErsEdit,
    onDeleteErs: setErsDeleteId,
    onCreateEks: handleOpenEksCreate,
    onEditEks: handleOpenEksEdit,
    onDeleteEks: setEksDeleteId,
    onCreateIcs: handleOpenIcsCreate,
    onEditIcs: handleOpenIcsEdit,
    onDeleteIcs: setIcsDeleteId,
    onMaterialsIcs: handleOpenIcsMaterials,
  }), [teachers, spaces, courseMap])

  // ===== JSX =====
  return (
    <div className="flex flex-col min-h-0 min-w-0" style={{ height: 'calc(100vh - 48px)', paddingRight: historyPanelOpen ? 320 : 0 }}>
      <div className="flex flex-col min-h-0 min-w-0 flex-1 gap-2 px-6 pt-4 pb-6 overflow-x-clip">
        {/* 月份导航 + 空间 */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0 relative">
            <button onClick={() => { const d = new Date(detailDate); d.setMonth(d.getMonth() - 1); d.setDate(1); setDetailDate(formatDate(d)) }} className="p-1 rounded hover:bg-[#f7f8fa] transition-colors">
              <ChevronLeft className="h-4 w-4 text-[#4e535a]" />
            </button>
            <button
              className="text-[16px] font-medium text-[#2b2f36] hover:bg-[#f7f8fa] px-1 rounded transition-colors"
              onClick={() => setMonthPickerOpen(!monthPickerOpen)}
            >
              {new Date(detailDate).getFullYear()}年{new Date(detailDate).getMonth() + 1}月
            </button>
            {monthPickerOpen && (
              <>
                <div className="fixed inset-0 z-[99]" onClick={() => setMonthPickerOpen(false)} />
                <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-lg border border-[#e8e8e8] p-3 z-[100]" style={{ width: "220px" }}>
                  <div className="flex items-center justify-between mb-2">
                    <button className="p-0.5 rounded hover:bg-[#f7f8fa]" onClick={() => { const d = new Date(detailDate); d.setFullYear(d.getFullYear() - 1); setDetailDate(formatDate(d)) }}>
                      <ChevronLeft className="h-3.5 w-3.5 text-[#4e535a]" />
                    </button>
                    <span className="text-[13px] font-medium text-[#2b2f36]">{new Date(detailDate).getFullYear()}年</span>
                    <button className="p-0.5 rounded hover:bg-[#f7f8fa]" onClick={() => { const d = new Date(detailDate); d.setFullYear(d.getFullYear() + 1); setDetailDate(formatDate(d)) }}>
                      <ChevronRight className="h-3.5 w-3.5 text-[#4e535a]" />
                    </button>
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
                      const d = new Date(detailDate)
                      const isSelected = d.getMonth() + 1 === m
                      return (
                        <button
                          key={m}
                          className={`px-1.5 py-1.5 text-[12px] rounded transition-colors whitespace-nowrap ${isSelected ? "bg-[#3370ff] text-white" : "hover:bg-[#f7f8fa] text-[#2b2f36]"}`}
                          onClick={() => { const nd = new Date(d.getFullYear(), m - 1, 1); setDetailDate(formatDate(nd)); setMonthPickerOpen(false) }}
                        >
                          {m}月
                        </button>
                      )
                    })}
                  </div>
                </div>
              </>
            )}
            <button onClick={() => { const d = new Date(detailDate); d.setMonth(d.getMonth() + 1); d.setDate(1); setDetailDate(formatDate(d)) }} className="p-1 rounded hover:bg-[#f7f8fa] transition-colors">
              <ChevronRight className="h-4 w-4 text-[#4e535a]" />
            </button>
            <div className="ml-1.5"><SpaceDropdown spaces={spaces} selectedSpaceId={selectedSpaceId} onSelect={handleSpaceSelect} /></div>
          </div>
          <div className="flex-1" />
          <button
            className="flex items-center gap-1 text-[11px] text-[#8f959e] hover:text-[#4e535a] cursor-pointer px-1 py-0.5"
            onClick={() => { const next = !calendarVisible; setCalendarVisible(next); try { localStorage.setItem("daily-calendar-visible", String(next)) } catch {} }}
          >
            <span style={{
              display: "inline-block",
              width: 0,
              height: 0,
              borderLeft: "4px solid transparent",
              borderRight: "4px solid transparent",
              borderTop: calendarVisible ? "5px solid #8f959e" : "none",
              borderBottom: calendarVisible ? "none" : "5px solid #8f959e",
            }} />
            {calendarVisible ? "隐藏" : "展开"}
          </button>
        </div>

        {/* 周视图日历 */}
        {calendarVisible && <div className="border-[3px] border-[#f7f8fa] rounded-[2px] overflow-x-auto">
          <table className="border-collapse" style={{ tableLayout: "fixed", width: "100%" }}>
            <colgroup>
              <col style={{ width: "80px" }} />
              {Array.from({ length: 7 }, (_, i) => <col key={i} style={{ width: `${(100 - 13.33) / 7}%` }} />)}
            </colgroup>
            <thead>
              <tr className="bg-[#f7f8fa]">
                <th className="px-2 py-1 text-center text-[12px] text-[#8f959e] font-normal" style={{ borderRight: "0.5px solid #f0f0f0" }}>周主题</th>
                {["一", "二", "三", "四", "五", "六", "日"].map(d => (
                  <th key={d} className="px-1 py-1 text-center text-[11px] text-[#8f959e] font-normal">{d}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {themeWeeks.map((week, wi) => {
                const firstTheme = week.days.map(day => themeMap.get(day.date)).find(theme => theme?.week_theme)
                const weekThemeText = firstTheme?.week_theme || ""
                const isLastWeek = wi === themeWeeks.length - 1
                return (
                  <tr key={`week-${wi}`}>
                    <td
                      className="px-2 text-center text-[12px] text-[#2b2f36] cursor-pointer hover:bg-[#f0f5ff] overflow-hidden text-ellipsis whitespace-nowrap"
                      style={{ height: "22px", borderRight: "0.5px solid #f0f0f0", borderBottom: isLastWeek ? "none" : "0.5px solid #f0f0f0" }}
                      onClick={() => { if (spaces.length === 0) { setNoSpacesDialogOpen(true); return } setThemeEditWeekIndex(wi) }}
                    >
                      {weekThemeText}
                    </td>
                    {week.days.map((day) => {
                      const dayNum = day.date.split("-")[2].replace(/^0/, "")
                      const isSelected = day.date === detailDate
                      const isToday = day.date === today
                      const dayTheme = day.inMonth ? themeMap.get(day.date)?.day_theme || "" : ""
                      const hasActivities = (calendarCounts[day.date] || 0) > 0
                      return (
                        <td
                          key={day.date}
                          className={`cursor-pointer overflow-hidden px-1 text-center text-[12px] transition-colors ${
                            !day.inMonth ? "bg-[#fdfdfd] text-[#b0b5bb]" : isToday ? "bg-[#f0f5ff] text-[#3370ff]" : "text-[#2b2f36]"
                          }`}
                          style={{ height: "22px", borderBottom: isLastWeek ? "none" : "0.5px solid #f0f0f0", boxShadow: isSelected ? "inset 0 -1.5px 0 0 #a8c8ff" : "none" }}
                          onClick={() => day.inMonth && setDetailDate(day.date)}
                        >
                          <div className="flex min-w-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap">
                            <span className={`shrink-0 text-[10px] ${
                              !day.inMonth ? "text-[#b0b5bb]" : isToday ? "text-[#3370ff]" : hasActivities ? "text-[#2b2f36]" : "text-[#8f959e]"
                            }`}>{dayNum}</span>
                            {dayTheme && <span className="min-w-0 truncate">{dayTheme}</span>}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>}
        {/* Activity cards */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" onMouseDown={(e) => e.stopPropagation()}>
          {detailLoading ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Loader2 className="h-8 w-8 text-muted-foreground mb-2 animate-spin" />
              <p className="text-sm text-muted-foreground">加载中...</p>
            </div>
          ) : (
            <ActivityBatchTable
              date={detailDate}
              courses={courses}
              customers={allCustomers}
              invitedCustomerIds={detailVisits.map(visit => visit.customer_id)}
              teachers={teachers}
              spaces={spaces}
              spaceId={selectedSpaceId}
              records={unifiedDetailRecords}
              onReload={() => loadDateData(detailDate)}
              callbacks={cardCallbacks}
              getMemberName={getMemberName}
              memberIdentities={memberIdentities}
              onSavingCountChange={setSavingCount}
              onSavedCountChange={setSavedCount}
              onUndoRedoChange={handleUndoRedoChange}
              onRestoreRef={(fn) => { restoreRef.current = fn }}
              onCaptureRef={(fn) => { captureRef.current = fn }}
              onHistoryPushed={handleHistoryPushed}
              previewRows={previewEntry?.rows}
              previewChangedKeys={previewEntry?.changedKeys}
              previewChangedCells={previewChangedCells}
              locked={!!previewEntry}
              onClosePreview={() => setPreviewEntry(null)}
              toolbarLeading={(
                <>
                  <span className="text-[12px] font-medium text-[#2b2f36]">
                    {detailDate.split("-")[1].replace(/^0/, "")}月{detailDate.split("-")[2].replace(/^0/, "")}日活动
                  </span>
                  {savingCount > 0 ? (
                    <span className="hidden items-center gap-1 text-[11px] text-[#8f959e] min-[1100px]:inline-flex">
                      <span className="h-[5px] w-[5px] rounded-full bg-[#3370ff]" />
                      保存中
                    </span>
                  ) : savedCount > 0 ? (
                    <span className="hidden items-center gap-1 text-[11px] text-[#8f959e] min-[1100px]:inline-flex">
                      <span className="h-[5px] w-[5px] rounded-full bg-[#639922]" />
                      已保存
                    </span>
                  ) : null}
                </>
              )}
              toolbarTrailing={(
                <>
                  <button
                    type="button"
                    onClick={openWithdrawalDialog}
                    disabled={withdrawalCourses.length === 0 || !!previewEntry}
                    className="mr-1 flex h-7 items-center gap-1 rounded-[4px] border border-[#dee0e3] bg-white px-2 text-[12px] text-[#4e535a] hover:bg-[#f5f6f7] disabled:cursor-not-allowed disabled:opacity-40"
                    title={withdrawalCourses.length === 0 ? "当前日期没有可办理退课的课程参与人" : "办理退课"}
                  >
                    <UserMinus className="h-3.5 w-3.5" />
                    退课
                  </button>
                  <button
                    onClick={() => {
                      if (previewEntry) { setPreviewEntry(null); setHistoryPanelOpen(false) }
                      else { captureRef.current?.(); setHistoryPanelOpen(!historyPanelOpen) }
                    }}
                    className={`flex h-6 w-6 items-center justify-center rounded hover:bg-[#f0f0f0] ${historyPanelOpen ? "bg-[#f0f0f0]" : ""}`}
                    title="历史记录"
                  >
                    <Clock className="h-3.5 w-3.5 text-[#4e535a]" />
                  </button>
                  <button
                    onClick={undo}
                    disabled={!canUndo || !!previewEntry}
                    className="flex h-6 w-6 items-center justify-center rounded hover:bg-[#f0f0f0] disabled:cursor-not-allowed disabled:opacity-30"
                    title="撤回 (Ctrl+Z)"
                  >
                    <Undo2 className="h-3.5 w-3.5 text-[#4e535a]" />
                  </button>
                  <button
                    onClick={redo}
                    disabled={!canRedo || !!previewEntry}
                    className="flex h-6 w-6 items-center justify-center rounded hover:bg-[#f0f0f0] disabled:cursor-not-allowed disabled:opacity-30"
                    title="重做 (Ctrl+Shift+Z)"
                  >
                    <Redo2 className="h-3.5 w-3.5 text-[#4e535a]" />
                  </button>
                </>
              )}
              toolbarSupplement={dayParticipants.length > 0 ? (
                <div className="mb-2 mt-2.5 flex flex-wrap gap-1 pl-2">
                  {dayParticipants.map(p => (
                    <span
                      key={p.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", JSON.stringify({ customer_id: p.id, nickname: p.nickname }))
                        e.dataTransfer.effectAllowed = "copy"
                      }}
                      className="inline-flex items-center px-2 py-[3px] rounded-sm bg-[#f0f5ff] text-[12px] text-[#3370ff] cursor-grab active:cursor-grabbing hover:bg-[#e0edff] transition-colors"
                    >
                      {p.nickname}
                    </span>
                  ))}
                </div>
              ) : undefined}
            />
          )}
        </div>
      </div>

      <Dialog open={withdrawalDialogOpen} onOpenChange={(open) => { if (!open && !withdrawing) setWithdrawalDialogOpen(false) }}>
        <DialogContent className="w-[400px] max-w-[90vw] gap-0 p-0" initialFocus={false}>
          <DialogHeader className="border-b border-[#f0f0f0] px-5 py-3">
            <DialogTitle className="text-[14px] font-normal text-[#1f2329]">办理退课</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 px-5 py-5">
            <div className="grid grid-cols-[64px_1fr] items-center gap-3">
              <span className="text-right text-[12px] text-[#4e535a]">课程</span>
              <SelectDropdown
                value={withdrawalCourseId}
                options={withdrawalCourses.map(({ record }) => ({
                  value: record.id,
                  label: `${record.start_time ? `${record.start_time} ` : ""}${record.activity_name || record.course_name || "未命名课程"}`,
                }))}
                onChange={value => {
                  setWithdrawalCourseId(value)
                  setWithdrawalCustomerId("")
                }}
                placeholder="选择课程"
                className="w-full"
                buttonClassName="!h-8 !rounded-[4px] !border !border-[#dee0e3] !bg-white !text-[12px] !shadow-none"
              />
            </div>
            <div className="grid grid-cols-[64px_1fr] items-center gap-3">
              <span className="text-right text-[12px] text-[#4e535a]">参与人</span>
              <SelectDropdown
                value={withdrawalCustomerId}
                options={withdrawalCustomers.map(customer => ({
                  value: customer.id,
                  label: customer.nickname || customer.name,
                }))}
                onChange={value => setWithdrawalCustomerId(value)}
                placeholder={withdrawalCourseId ? "选择参与人" : "请先选择课程"}
                disabled={!withdrawalCourseId}
                className="w-full"
                buttonClassName="!h-8 !rounded-[4px] !border !border-[#dee0e3] !bg-white !text-[12px] !shadow-none"
              />
            </div>
            <div className="ml-[76px] text-[12px] leading-5 text-[#8f959e]">
              退课后仍保留在课程参与人记录中并显示“已退课”，本课程已扣卡次会恢复为 0。
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-[#f0f0f0] px-5 py-3">
            <Button variant="outline" size="sm" className="h-8 text-[12px]" onClick={() => setWithdrawalDialogOpen(false)} disabled={withdrawing}>取消</Button>
            <Button size="sm" className="h-8 text-[12px]" onClick={handleCourseWithdrawal} disabled={!withdrawalCourseId || !withdrawalCustomerId || withdrawing}>{withdrawing ? "处理中..." : "确认退课"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== 历史记录面板（固定右侧） ===== */}
      {historyPanelOpen && (
        <div className="fixed top-0 right-0 h-screen w-80 bg-white border-l border-[#e8e8e8] shadow-lg z-50 flex flex-col">
          <div className="px-4 py-3 border-b border-[#f0f1f2] flex items-center justify-between shrink-0">
            <span className="text-[13px] font-medium text-[#2b2f36]">历史记录</span>
            <button
              onClick={() => { setPreviewEntry(null); setHistoryPanelOpen(false) }}
              className="h-6 w-6 flex items-center justify-center rounded hover:bg-[#f0f0f0]"
            >
              <X className="h-4 w-4 text-[#8f959e]" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {mergedHistory.length === 0 ? (
              <div className="text-center text-[12px] text-[#8f959e] py-8">暂无历史记录</div>
            ) : (
              (() => {
                const todayStr = formatDate(new Date())
                const yesterdayStr = formatDate(new Date(Date.now() - 86400000))

                // 三级分组：天 → 小时 → 条目
                type HourGroup = { hour: string; entries: HistoryEntry[] }
                type DayGroup = { date: string; label: string; hours: HourGroup[] }
                const dayMap = new Map<string, DayGroup>()

                for (const entry of mergedHistory) {
                  const d = new Date(entry.timestamp)
                  const dateKey = formatDate(d)
                  const hourKey = String(d.getHours()).padStart(2, "0")

                  if (!dayMap.has(dateKey)) {
                    const label = dateKey === todayStr ? "今天" : dateKey === yesterdayStr ? "昨天" : `${parseInt(dateKey.split("-")[1])}月${parseInt(dateKey.split("-")[2])}日`
                    dayMap.set(dateKey, { date: dateKey, label, hours: [] })
                  }
                  const dayGroup = dayMap.get(dateKey)!

                  let hourGroup = dayGroup.hours.find(h => h.hour === hourKey)
                  if (!hourGroup) {
                    hourGroup = { hour: hourKey, entries: [] }
                    dayGroup.hours.push(hourGroup)
                  }
                  hourGroup.entries.push(entry)
                }

                const days = Array.from(dayMap.values())

                return days.map((day, di) => (
                  <HistoryDayGroup
                    key={day.date}
                    day={day}
                    defaultExpanded={di === 0}
                    previewEntry={previewEntry}
                    onSelectEntry={setPreviewEntry}
                  />
                ))
              })()
            )}
          </div>
          {previewEntry && (
            <div className="border-t border-[#f0f1f2] p-3 shrink-0 flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 h-8 text-[12px]"
                onClick={() => { setPreviewEntry(null); setHistoryPanelOpen(false) }}
              >
                返回编辑
              </Button>
              <Button
                size="sm"
                className="flex-1 h-8 text-[12px]"
                disabled={restoring}
                onClick={async () => {
                  if (restoreRef.current && previewEntry) {
                    setRestoring(true)
                    try {
                      await restoreRef.current(previewEntry)
                    } finally {
                      setRestoring(false)
                    }
                  }
                  setPreviewEntry(null)
                  setHistoryPanelOpen(false)
                }}
              >
                {restoring ? "恢复中..." : "恢复此版本"}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ===== Theme Edit Dialog ===== */}
      {themeEditWeekIndex !== null && themeWeeks[themeEditWeekIndex] && (
        <WeekThemeDialog
          open={themeEditWeekIndex !== null}
          weekIndex={themeEditWeekIndex}
          weekDays={themeWeeks[themeEditWeekIndex].days.filter(d => d.inMonth)}
          themeMap={themeMap}
          spaces={spaces}
          defaultSpaceId={selectedSpaceId}
          onClose={() => setThemeEditWeekIndex(null)}
          onSaved={saveBatchThemes}
        />
      )}

      {/* ===== Salon Dialog ===== */}
      <SalonDialog
        open={dialogOpen}
        date={detailDate}
        spaces={spaces}
        courses={courses}
        teachers={teachers}
        session={salonEditSession}
        defaultSpaceId={selectedSpaceId}
        onClose={handleSalonClose}
        onSaved={handleSalonSaved}
      />

      {/* ===== GCS Dialog ===== */}
      <GcsDialog
        open={gcsDialogOpen}
        date={detailDate}
        spaces={spaces}
        allCustomers={allCustomers}
        session={gcsEditSession}
        defaultSpaceId={selectedSpaceId}
        onClose={handleGcsClose}
        onSaved={handleGcsSaved}
      />

      {/* ===== ERS Dialog ===== */}
      <ErsDialog
        open={ersDialogOpen}
        date={detailDate}
        spaces={spaces}
        allCustomers={allCustomers}
        session={ersEditSession}
        defaultSpaceId={selectedSpaceId}
        onClose={handleErsClose}
        onSaved={handleErsSaved}
      />

      {/* ===== EKS Dialog ===== */}
      <EksDialog
        open={eksDialogOpen}
        date={detailDate}
        spaces={spaces}
        allCustomers={allCustomers}
        hostCustomers={eksHostCustomers}
        session={eksEditSession}
        defaultSpaceId={selectedSpaceId}
        onClose={handleEksClose}
        onSaved={handleEksSaved}
      />

      {/* ===== ICS Dialog ===== */}
      <IcsDialog
        open={icsDialogOpen}
        date={detailDate}
        spaces={spaces}
        teachers={teachers}
        session={icsEditSession}
        defaultSpaceId={selectedSpaceId}
        onClose={handleIcsClose}
        onSaved={handleIcsSaved}
      />

      {!!deleteId && (
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除沙龙活动</AlertDialogTitle>
            <AlertDialogDescription>确定要删除这条沙龙活动记录吗？此操作不可撤销。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      )}

      {/* ===== GCS Delete Dialog ===== */}
      {!!gcsDeleteId && (
      <AlertDialog open={!!gcsDeleteId} onOpenChange={(open) => !open && setGcsDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除觉醒游戏</AlertDialogTitle>
            <AlertDialogDescription>确定要删除这条觉醒游戏记录吗？此操作不可撤销。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleGcsDelete}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      )}

      {/* ===== ERS Delete Dialog ===== */}
      {!!ersDeleteId && (
      <AlertDialog open={!!ersDeleteId} onOpenChange={(open) => !open && setErsDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除情绪释放</AlertDialogTitle>
            <AlertDialogDescription>确定要删除这条情绪释放记录吗？此操作不可撤销。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleErsDelete}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      )}

      {/* ===== EKS Delete Dialog ===== */}
      {!!eksDeleteId && (
      <AlertDialog open={!!eksDeleteId} onOpenChange={(open) => !open && setEksDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除能量结</AlertDialogTitle>
            <AlertDialogDescription>确定要删除这条能量结记录吗？此操作不可撤销。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleEksDelete}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      )}

      {/* ===== ICS Delete Dialog ===== */}
      {!!icsDeleteId && (
      <AlertDialog open={!!icsDeleteId} onOpenChange={(open) => !open && setIcsDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除内部课程</AlertDialogTitle>
            <AlertDialogDescription>确定要删除这条内部课程记录吗？此操作不可撤销。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleIcsDelete}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      )}

    </div>
  )
}
