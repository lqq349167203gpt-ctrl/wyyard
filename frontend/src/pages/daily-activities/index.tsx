import { useEffect, useState, useRef, useMemo, useCallback, memo } from "react"
import { Plus, Trash2, Edit, ChevronRight, ChevronLeft, FileUp, Download, File, ChevronDown, Loader2, BookOpen, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  classRecordApi, groupCaseSessionApi,
  emotionalReleaseSessionApi,
  energyKnotSessionApi, energyKnotApi,
  internalCourseSessionApi, courseApi, customerApi, uploadApi, spaceApi,
  type ClassRecord, type GroupCaseSession, type EmotionalReleaseSession,
  type EnergyKnotSession, type InternalCourseSession,
  type Course, type CustomerLight, type Space,
  type InternalCourseSessionCustomerSearchResult,
  type GroupCaseCustomerSearchResult,
} from "@/lib/api"

// ===== Date utilities =====
const today = new Date().toISOString().split("T")[0]

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0]
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

// ===== Pure helpers =====
function getTeacherNames(teacherIds: string[], teachers: CustomerLight[]) {
  return teacherIds.map(id => teachers.find(t => t.id === id)).filter(Boolean).map(t => t!.nickname || t!.name || "未命名")
}

// ===== Memoized card components (extracted to avoid re-render on dropdown state changes) =====

interface CardCallbacks {
  onEditClass: (r: ClassRecord) => void
  onDeleteClass: (id: string) => void
  onMaterialsClass: (r: ClassRecord) => void
  onEditGcs: (s: GroupCaseSession) => void
  onDeleteGcs: (id: string) => void
  onMaterialsGcs: (s: GroupCaseSession) => void
  onEditErs: (s: EmotionalReleaseSession) => void
  onDeleteErs: (id: string) => void
  onEditEks: (s: EnergyKnotSession) => void
  onDeleteEks: (id: string) => void
  onEditIcs: (s: InternalCourseSession) => void
  onDeleteIcs: (id: string) => void
  onMaterialsIcs: (s: InternalCourseSession) => void
  teachers: CustomerLight[]
}

const SalonCard = memo(({ record, teachers, onEdit, onDelete, onMaterials }: {
  record: ClassRecord; teachers: CustomerLight[]
  onEdit: (r: ClassRecord) => void; onDelete: (id: string) => void; onMaterials: (r: ClassRecord) => void
}) => (
  <div key={`class-${record.id}`} className="bg-white">
    <div className="flex">
      <div className="shrink-0 w-16 flex flex-col items-center justify-center gap-1 px-2 py-3.5">
        {record.start_time && <span className="text-[11px] text-[#8f959e] font-light">{record.start_time}</span>}
        {record.start_time && record.end_time && <span className="text-[10px] text-[#c9cdd4]">~</span>}
        {record.end_time && <span className="text-[11px] text-[#8f959e] font-light">{record.end_time}</span>}
      </div>
      <div className="flex-1 min-w-0 pl-3 pr-5 py-3.5 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-600">沙龙</span>
          {record.is_public_welfare && <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#e8f5e9] text-[#4caf50]">公益</span>}
          <span className="text-[14px] font-medium text-[#2b2f36] truncate">{record.course_name}</span>
          {getTeacherNames(record.teacher_ids, teachers).length > 0 && (
            <span className="inline-block ml-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-[#a0a5ac]">课程老师：{getTeacherNames(record.teacher_ids, teachers).join("、")}</span>
          )}
        </div>
        {record.course_description && <p className="text-[12px] text-[#8f959e] leading-relaxed">{record.course_description}</p>}
      </div>
      <div className="shrink-0 grid grid-cols-3 items-center justify-items-center gap-1 px-2 py-3.5">
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onMaterials(record)}>
          <FileUp className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onEdit(record)}>
          <Edit className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onDelete(record.id)}>
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </Button>
      </div>
    </div>
  </div>
))

const GcsCard = memo(({ session, onEdit, onDelete, onMaterials }: {
  session: GroupCaseSession
  onEdit: (s: GroupCaseSession) => void; onDelete: (id: string) => void; onMaterials: (s: GroupCaseSession) => void
}) => (
  <div key={`gcs-${session.id}`} className="bg-white">
    <div className="flex">
      <div className="shrink-0 w-16 flex flex-col items-center justify-center gap-1 px-2 py-3.5">
        {session.start_time && <span className="text-[11px] text-[#8f959e] font-light">{session.start_time}</span>}
        {session.start_time && session.end_time && <span className="text-[10px] text-[#c9cdd4]">~</span>}
        {session.end_time && <span className="text-[11px] text-[#8f959e] font-light">{session.end_time}</span>}
      </div>
      <div className="flex-1 min-w-0 pl-3 pr-5 py-3.5 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-purple-600">觉醒</span>
          <span className="text-[14px] font-medium text-[#2b2f36] truncate">觉醒游戏</span>
          <span className="text-[14px] font-bold text-[#2b2f36] mx-0.5">·</span>
          <span className="text-[14px] font-medium text-[#2b2f36]">{session.owner_name || "未分配"}</span>
          {session.achiever_name && <span className="inline-block ml-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-[#a0a5ac]">成就君：{session.achiever_name}</span>}
        </div>
        {session.description && <p className="text-[12px] text-[#8f959e] leading-relaxed">{session.description}</p>}
      </div>
      <div className="shrink-0 grid grid-cols-3 items-center justify-items-center gap-1 px-2 py-3.5">
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onMaterials(session)}>
          <FileUp className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onEdit(session)}>
          <Edit className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onDelete(session.id)}>
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </Button>
      </div>
    </div>
  </div>
))

const ErsCard = memo(({ session, onEdit, onDelete }: {
  session: EmotionalReleaseSession
  onEdit: (s: EmotionalReleaseSession) => void; onDelete: (id: string) => void
}) => (
  <div key={`ers-${session.id}`} className="bg-white">
    <div className="flex">
      <div className="shrink-0 w-16 flex flex-col items-center justify-center gap-1 px-2 py-3.5">
        {session.start_time && <span className="text-[11px] text-[#8f959e] font-light">{session.start_time}</span>}
        {session.start_time && session.end_time && <span className="text-[10px] text-[#c9cdd4]">~</span>}
        {session.end_time && <span className="text-[11px] text-[#8f959e] font-light">{session.end_time}</span>}
      </div>
      <div className="flex-1 min-w-0 pl-3 pr-5 py-3.5 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-50 text-orange-600">情绪</span>
          <span className="text-[14px] font-medium text-[#2b2f36] truncate">情绪释放</span>
          <span className="text-[14px] font-bold text-[#2b2f36] mx-0.5">·</span>
          <span className="text-[14px] font-medium text-[#2b2f36]">{session.owner_name || "未分配"}</span>
          {session.achiever_name && <span className="inline-block ml-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-[#a0a5ac]">成就君：{session.achiever_name}</span>}
        </div>
        {session.description && <p className="text-[12px] text-[#8f959e] leading-relaxed">{session.description}</p>}
      </div>
      <div className="shrink-0 grid grid-cols-2 items-center justify-items-center gap-1 px-2 py-3.5">
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onEdit(session)}>
          <Edit className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onDelete(session.id)}>
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </Button>
      </div>
    </div>
  </div>
))

const EksCard = memo(({ session, onEdit, onDelete }: {
  session: EnergyKnotSession
  onEdit: (s: EnergyKnotSession) => void; onDelete: (id: string) => void
}) => {
  let eksNames: string[] = []
  let ownerDescs: { id: string; name: string; description: string }[] = []
  try {
    const items = JSON.parse(session.description || "[]")
    if (Array.isArray(items)) { ownerDescs = items; eksNames = items.map((d: any) => d.name).filter(Boolean) }
  } catch {}
  return (
    <div key={`eks-${session.id}`} className="bg-white">
      <div className="flex">
        <div className="shrink-0 w-16 flex flex-col items-center justify-center gap-1 px-2 py-3.5">
          {session.start_time && <span className="text-[11px] text-[#8f959e] font-light">{session.start_time}</span>}
          {session.start_time && session.end_time && <span className="text-[10px] text-[#c9cdd4]">~</span>}
          {session.end_time && <span className="text-[11px] text-[#8f959e] font-light">{session.end_time}</span>}
        </div>
        <div className="flex-1 min-w-0 pl-3 pr-5 py-3.5 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-yellow-50 text-yellow-600">能量</span>
            <span className="text-[14px] font-medium text-[#2b2f36] truncate">能量结</span>
            <span className="text-[14px] font-bold text-[#2b2f36] mx-0.5">·</span>
            <span className="text-[14px] font-medium text-[#2b2f36]">{eksNames.length > 0 ? eksNames.join("、") : session.owner_name || "未分配"}</span>
            {session.host_names?.length > 0 && <span className="inline-block ml-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-[#a0a5ac]">课程老师：{session.host_names.join("、")}</span>}
          </div>
          {ownerDescs.filter(d => d.description).length > 0 && (
            <div className="space-y-1">
              {ownerDescs.filter(d => d.description).map((d, i) => (
                <p key={i} className="text-[12px] text-[#8f959e] leading-relaxed">
                  <span>{d.name || eksNames[i] || "未知"}：</span>{d.description}
                </p>
              ))}
            </div>
          )}
        </div>
        <div className="shrink-0 grid grid-cols-2 items-center justify-items-center gap-1 px-2 py-3.5">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onEdit(session)}>
            <Edit className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onDelete(session.id)}>
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
      </div>
    </div>
  )
})

const IcsCard = memo(({ session, onEdit, onDelete, onMaterials }: {
  session: InternalCourseSession
  onEdit: (s: InternalCourseSession) => void; onDelete: (id: string) => void; onMaterials: (s: InternalCourseSession) => void
}) => (
  <div key={`ics-${session.id}`} className="bg-white">
    <div className="flex">
      <div className="shrink-0 w-16 flex flex-col items-center justify-center gap-1 px-2 py-3.5">
        {session.start_time && <span className="text-[11px] text-[#8f959e] font-light">{session.start_time}</span>}
        {session.start_time && session.end_time && <span className="text-[10px] text-[#c9cdd4]">~</span>}
        {session.end_time && <span className="text-[11px] text-[#8f959e] font-light">{session.end_time}</span>}
      </div>
      <div className="flex-1 min-w-0 pl-3 pr-5 py-3.5 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-50 text-green-600">内部</span>
          <span className="text-[14px] font-medium text-[#2b2f36] truncate">{session.course_name}</span>
          <span className="text-[14px] font-medium text-[#2b2f36]">丨课程老师：{session.host_names?.length > 0 ? session.host_names.join("、") : "暂无"}</span>
          {session.course_type && <span className="text-[12px] text-[#4e535a]">{session.course_type}</span>}
        </div>
        {session.course_description && <p className="text-[11px] text-[#8f959e] font-light leading-relaxed">{session.course_description}</p>}
      </div>
      <div className="shrink-0 grid grid-cols-3 items-center justify-items-center gap-1 px-2 py-3.5">
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onMaterials(session)}>
          <FileUp className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onEdit(session)}>
          <Edit className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onDelete(session.id)}>
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </Button>
      </div>
    </div>
  </div>
))

// ===== GCS Dialog (独立组件，避免父组件 state 变化导致重渲染) =====
const GcsDialog = memo(({ open, date, spaces, allCustomers, achieverCustomers, session, onClose }: {
  open: boolean; date: string; spaces: Space[]; allCustomers: CustomerLight[]
  achieverCustomers: CustomerLight[]; session?: GroupCaseSession | null; onClose: () => void
}) => {
  const [editingRecord, setEditingRecord] = useState<GroupCaseSession | null>(null)
  const [saving, setSaving] = useState(false)
  const [formDate, setFormDate] = useState(date)
  const [formStartTime, setFormStartTime] = useState("09:00")
  const [formEndTime, setFormEndTime] = useState("10:00")
  const [formOwnerId, setFormOwnerId] = useState("")
  const [formOwnerName, setFormOwnerName] = useState("")
  const [formAchieverId, setFormAchieverId] = useState("")
  const [formAchieverName, setFormAchieverName] = useState("")
  const [formDescription, setFormDescription] = useState("")
  const [searchKeyword, setSearchKeyword] = useState("")
  const [showDropdown, setShowDropdown] = useState(false)
  const [ownerRemaining, setOwnerRemaining] = useState<number | null>(null)
  const [remainingMap, setRemainingMap] = useState<Record<string, number>>({})
  const [spaceId, setSpaceId] = useState("")
  const [roomId, setRoomId] = useState("")
  const [showSpaceDropdown, setShowSpaceDropdown] = useState(false)
  const [showRoomDropdown, setShowRoomDropdown] = useState(false)
  const [showAchieverDropdown, setShowAchieverDropdown] = useState(false)
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
        setFormAchieverId(session.achiever_id || ""); setFormAchieverName(session.achiever_name || "")
        setFormDescription(session.description || "")
        setSpaceId(session.space_id || (spaces[0]?.id || ""))
        setRoomId(session.room_id || "")
        setSearchKeyword(""); setShowDropdown(false)
        setOwnerRemaining(null)
        if (session.owner_id && session.owner_name) {
          groupCaseSessionApi.searchCustomers(session.owner_name).then(results => {
            const found = results.find(r => r.id === session.owner_id)
            if (found) setOwnerRemaining(found.remaining)
          }).catch(() => {})
        }
      } else {
        setEditingRecord(null)
        setFormDate(date)
        setFormStartTime("09:00"); setFormEndTime("10:00")
        setFormOwnerId(""); setFormOwnerName("")
        setFormAchieverId(""); setFormAchieverName("")
        setFormDescription("")
        setSearchKeyword(""); setShowDropdown(false)
        setOwnerRemaining(null)
        const ds = spaces[0]?.id || ""; const dr = ds ? spaces[0]?.rooms?.[0]?.id || "" : ""
        setSpaceId(ds); setRoomId(dr)
      }
    }
  }, [open, date, spaces, session])

  // Fetch remaining counts for dropdown
  useEffect(() => {
    if (!showDropdown && !formOwnerId) return
    const fetchId = ++remainingFetchRef.current
    const timer = window.setTimeout(async () => {
      try {
        const results = await groupCaseSessionApi.searchCustomers(searchKeyword)
        if (fetchId !== remainingFetchRef.current) return
        const map: Record<string, number> = {}
        results.forEach(r => { map[r.id] = r.remaining })
        setRemainingMap(map)
      } catch {}
    }, 200)
    return () => clearTimeout(timer)
  }, [searchKeyword, showDropdown, formOwnerId])

  // Click outside to close dropdowns
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest("[data-dropdown]")) return
      setShowDropdown(false); setShowSpaceDropdown(false)
      setShowRoomDropdown(false); setShowAchieverDropdown(false)
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
        achiever_id: formAchieverId || undefined, achiever_name: formAchieverName || undefined,
        space_id: spaceId || undefined, room_id: roomId || undefined,
      }
      if (editingRecord) {
        await groupCaseSessionApi.update(editingRecord.id, data)
      } else {
        await groupCaseSessionApi.create(data)
      }
      onClose()
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
        <div className="px-6 py-5 space-y-5">
          <div className="grid grid-cols-[70px_1fr] items-center gap-3">
            <span className="text-[12px] text-[#8f959e] text-right">日期</span>
            <Input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} className="h-8 text-[12px]" />
          </div>
          <div className="grid grid-cols-[70px_1fr] items-center gap-3">
            <span className="text-[12px] text-[#8f959e] text-right">时间</span>
            <div className="flex items-center gap-2">
              <Input type="time" value={formStartTime} onChange={(e) => setFormStartTime(e.target.value)} className="h-8 text-[12px] w-28" />
              <span className="text-[12px] text-[#8f959e]">至</span>
              <Input type="time" value={formEndTime} onChange={(e) => setFormEndTime(e.target.value)} className="h-8 text-[12px] w-28" />
            </div>
          </div>
          <div className="grid grid-cols-[70px_1fr] items-center gap-3">
            <span className="text-[12px] text-[#8f959e] text-right">空间</span>
            <div className="flex items-center gap-2">
              <div data-dropdown className="relative flex-1">
                <button type="button"
                  className="flex items-center justify-between w-full h-8 px-3 rounded-md border border-input bg-transparent text-[12px]"
                  onMouseDown={(e) => e.stopPropagation()} onClick={() => { setShowRoomDropdown(false); setShowAchieverDropdown(false); setShowDropdown(false); setShowSpaceDropdown(!showSpaceDropdown) }}
                >
                  <span className={spaceId ? "text-[#2b2f36]" : "text-[#8f959e]"}>
                    {spaceId ? spaces.find(s => s.id === spaceId)?.name || "选择空间" : "选择空间"}
                  </span>
                  <ChevronDown className="h-3 w-3 text-[#8f959e]" />
                </button>
                {showSpaceDropdown && (
                  <div className="absolute top-full left-0 mt-1 w-full bg-white rounded-md border border-[#e8e8e8] shadow-lg z-50 max-h-[200px] overflow-y-auto" onMouseDown={(e) => e.stopPropagation()}>
                    {spaces.map(s => (
                      <button key={s.id} className="flex items-center justify-between w-full px-3 py-2 text-[12px] hover:bg-[#f7f8fa]"
                        onClick={() => { setSpaceId(s.id); setRoomId(s.rooms?.[0]?.id || ""); setShowSpaceDropdown(false) }}>
                        <span>{s.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div data-dropdown className="relative flex-1">
                <button type="button"
                  className="flex items-center justify-between w-full h-8 px-3 rounded-md border border-input bg-transparent text-[12px]"
                  onMouseDown={(e) => e.stopPropagation()} onClick={() => { setShowSpaceDropdown(false); setShowAchieverDropdown(false); setShowDropdown(false); setShowRoomDropdown(!showRoomDropdown) }}
                >
                  <span className={roomId ? "text-[#2b2f36]" : "text-[#8f959e]"}>
                    {roomId ? (spaces.find(s => s.id === spaceId)?.rooms || []).find(r => r.id === roomId)?.name || "选择房间" : "选择房间"}
                  </span>
                  <ChevronDown className="h-3 w-3 text-[#8f959e]" />
                </button>
                {showRoomDropdown && (
                  <div className="absolute top-full left-0 mt-1 w-full bg-white rounded-md border border-[#e8e8e8] shadow-lg z-50 max-h-[200px] overflow-y-auto" onMouseDown={(e) => e.stopPropagation()}>
                    {(spaces.find(s => s.id === spaceId)?.rooms || []).length === 0 ? (
                      <span className="block w-full px-3 py-2 text-[12px] text-[#8f959e] cursor-default">无房间</span>
                    ) : (
                      (spaces.find(s => s.id === spaceId)?.rooms || []).map(r => (
                        <button key={r.id} className="flex items-center justify-between w-full px-3 py-2 text-[12px] hover:bg-[#f7f8fa]"
                          onClick={() => { setRoomId(r.id); setShowRoomDropdown(false) }}>
                          <span>{r.name}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-[70px_1fr] items-start gap-3">
            <span className="text-[12px] text-[#8f959e] text-right mt-2">案主</span>
            <div data-dropdown className="relative" onMouseDown={(e) => e.stopPropagation()}>
              <div className="relative">
                <Input
                  value={formOwnerId ? formOwnerName : searchKeyword}
                  onChange={(e) => {
                    setSearchKeyword(e.target.value)
                    if (formOwnerId) { setFormOwnerId(""); setFormOwnerName(""); setOwnerRemaining(null) }
                    setShowDropdown(true)
                  }}
                  onFocus={() => setShowDropdown(true)}
                  onClick={() => setShowDropdown(true)}
                  placeholder={formOwnerId ? "" : "选择案主"}
                  className="h-8 text-[12px] pr-20"
                  autoComplete="off"
                />
                {formOwnerId && ownerRemaining !== null && (
                  <span className={`absolute right-7 top-1/2 -translate-y-1/2 text-[11px] ${ownerRemaining <= 0 ? "text-red-500" : "text-[#8f959e]"}`}>
                    剩余{ownerRemaining}次
                  </span>
                )}
                {formOwnerId && (
                  <button className="absolute right-2 top-1/2 -translate-y-1/2 text-[#8f959e] hover:text-[#2b2f36]"
                    onClick={() => { setFormOwnerId(""); setFormOwnerName(""); setSearchKeyword(""); setOwnerRemaining(null) }}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {showDropdown && (() => {
                const kw = searchKeyword.trim().toLowerCase()
                const filtered = kw
                  ? allCustomers.filter(c => (c.nickname || "").toLowerCase().includes(kw) || (c.name || "").toLowerCase().includes(kw))
                  : allCustomers
                return (
                <div className="absolute top-full left-0 mt-1 w-full bg-white rounded-md border border-[#e8e8e8] shadow-lg z-50 max-h-[200px] overflow-y-auto" onMouseDown={(e) => e.stopPropagation()}>
                  {filtered.length === 0 ? (
                    <div className="px-3 py-2 text-[12px] text-[#8f959e]">无匹配客户</div>
                  ) : (
                    filtered.map(c => {
                      const remaining = remainingMap[c.id]
                      const isDepleted = remaining !== undefined && remaining <= 0
                      return (
                        <button key={c.id}
                          className={`flex items-center justify-between w-full px-3 py-2 text-[12px] ${isDepleted ? "cursor-not-allowed" : "hover:bg-[#f7f8fa]"}`}
                          disabled={isDepleted}
                          onClick={() => {
                            if (isDepleted) return
                            setFormOwnerId(c.id)
                            setFormOwnerName(c.nickname || c.name || "")
                            setSearchKeyword("")
                            setShowDropdown(false)
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
          <div className="grid grid-cols-[70px_1fr] items-center gap-3">
            <span className="text-[12px] text-[#8f959e] text-right">成就君</span>
            <div data-dropdown className="relative">
              <button type="button"
                className="flex items-center justify-between w-full h-8 px-3 rounded-md border border-input bg-transparent text-[12px]"
                onMouseDown={(e) => e.stopPropagation()} onClick={() => { setShowRoomDropdown(false); setShowSpaceDropdown(false); setShowDropdown(false); setShowAchieverDropdown(!showAchieverDropdown) }}
              >
                <span className={formAchieverId ? "text-[#2b2f36]" : "text-[#8f959e]"}>
                  {formAchieverId ? formAchieverName : "选择成就君"}
                </span>
                <ChevronDown className="h-3 w-3 text-[#8f959e]" />
              </button>
              {showAchieverDropdown && (
                <div className="absolute top-full left-0 mt-1 w-full bg-white rounded-md border border-[#e8e8e8] shadow-lg z-50 max-h-[200px] overflow-y-auto" onMouseDown={(e) => e.stopPropagation()}>
                  {achieverCustomers.filter(c => c.id !== formOwnerId).map(c => (
                    <button key={c.id} className="flex items-center justify-between w-full px-3 py-2 text-[12px] hover:bg-[#f7f8fa]"
                      onClick={() => {
                        setFormAchieverId(c.id)
                        setFormAchieverName(c.nickname || c.name || "")
                        setShowAchieverDropdown(false)
                      }}>
                      <span>{c.nickname || c.name}</span>
                    </button>
                  ))}
                </div>
              )}
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
const ErsDialog = memo(({ open, date, spaces, allCustomers, achieverCustomers, session, onClose }: {
  open: boolean; date: string; spaces: Space[]; allCustomers: CustomerLight[]
  achieverCustomers: CustomerLight[]; session?: EmotionalReleaseSession | null; onClose: () => void
}) => {
  const [editingRecord, setEditingRecord] = useState<EmotionalReleaseSession | null>(null)
  const [saving, setSaving] = useState(false)
  const [formDate, setFormDate] = useState(date)
  const [formStartTime, setFormStartTime] = useState("09:00")
  const [formEndTime, setFormEndTime] = useState("10:00")
  const [formOwnerId, setFormOwnerId] = useState("")
  const [formOwnerName, setFormOwnerName] = useState("")
  const [formAchieverId, setFormAchieverId] = useState("")
  const [formAchieverName, setFormAchieverName] = useState("")
  const [formDescription, setFormDescription] = useState("")
  const [searchKeyword, setSearchKeyword] = useState("")
  const [showDropdown, setShowDropdown] = useState(false)
  const [ownerRemaining, setOwnerRemaining] = useState<number | null>(null)
  const [remainingMap, setRemainingMap] = useState<Record<string, number>>({})
  const [spaceId, setSpaceId] = useState("")
  const [roomId, setRoomId] = useState("")
  const [showSpaceDropdown, setShowSpaceDropdown] = useState(false)
  const [showRoomDropdown, setShowRoomDropdown] = useState(false)
  const [showAchieverDropdown, setShowAchieverDropdown] = useState(false)
  const remainingFetchRef = useRef(0)

  useEffect(() => {
    if (open) {
      if (session) {
        setEditingRecord(session)
        setFormDate(session.date)
        setFormStartTime(session.start_time || "09:00")
        setFormEndTime(session.end_time || "10:00")
        setFormOwnerId(session.owner_id); setFormOwnerName(session.owner_name || "")
        setFormAchieverId(session.achiever_id || ""); setFormAchieverName(session.achiever_name || "")
        setFormDescription(session.description || "")
        setSpaceId(session.space_id || (spaces[0]?.id || ""))
        setRoomId(session.room_id || "")
        setSearchKeyword(""); setShowDropdown(false)
        setOwnerRemaining(null)
        if (session.owner_id && session.owner_name) {
          emotionalReleaseSessionApi.searchCustomers(session.owner_name).then(results => {
            const found = results.find(r => r.id === session.owner_id)
            if (found) setOwnerRemaining(found.remaining)
          }).catch(() => {})
        }
      } else {
        setEditingRecord(null)
        setFormDate(date)
        setFormStartTime("09:00"); setFormEndTime("10:00")
        setFormOwnerId(""); setFormOwnerName("")
        setFormAchieverId(""); setFormAchieverName("")
        setFormDescription("")
        setSearchKeyword(""); setShowDropdown(false)
        setOwnerRemaining(null)
        const ds = spaces[0]?.id || ""; const dr = ds ? spaces[0]?.rooms?.[0]?.id || "" : ""
        setSpaceId(ds); setRoomId(dr)
      }
    }
  }, [open, date, spaces, session])

  useEffect(() => {
    if (!showDropdown && !formOwnerId) return
    const fetchId = ++remainingFetchRef.current
    const timer = window.setTimeout(async () => {
      try {
        const results = await emotionalReleaseSessionApi.searchCustomers(searchKeyword)
        if (fetchId !== remainingFetchRef.current) return
        const map: Record<string, number> = {}
        results.forEach(r => { map[r.id] = r.remaining })
        setRemainingMap(map)
      } catch {}
    }, 200)
    return () => clearTimeout(timer)
  }, [searchKeyword, showDropdown, formOwnerId])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest("[data-dropdown]")) return
      setShowDropdown(false); setShowSpaceDropdown(false)
      setShowRoomDropdown(false); setShowAchieverDropdown(false)
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
        achiever_id: formAchieverId || undefined, achiever_name: formAchieverName || undefined,
        space_id: spaceId || undefined, room_id: roomId || undefined,
      }
      if (editingRecord) {
        await emotionalReleaseSessionApi.update(editingRecord.id, data)
      } else {
        await emotionalReleaseSessionApi.create(data)
      }
      onClose()
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
        <div className="px-6 py-5 space-y-5">
          <div className="grid grid-cols-[70px_1fr] items-center gap-3">
            <span className="text-[12px] text-[#8f959e] text-right">日期</span>
            <Input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} className="h-8 text-[12px]" />
          </div>
          <div className="grid grid-cols-[70px_1fr] items-center gap-3">
            <span className="text-[12px] text-[#8f959e] text-right">时间</span>
            <div className="flex items-center gap-2">
              <Input type="time" value={formStartTime} onChange={(e) => setFormStartTime(e.target.value)} className="h-8 text-[12px] w-28" />
              <span className="text-[12px] text-[#8f959e]">至</span>
              <Input type="time" value={formEndTime} onChange={(e) => setFormEndTime(e.target.value)} className="h-8 text-[12px] w-28" />
            </div>
          </div>
          <div className="grid grid-cols-[70px_1fr] items-center gap-3">
            <span className="text-[12px] text-[#8f959e] text-right">空间</span>
            <div className="flex items-center gap-2">
              <div data-dropdown className="relative flex-1">
                <button type="button"
                  className="flex items-center justify-between w-full h-8 px-3 rounded-md border border-input bg-transparent text-[12px]"
                  onMouseDown={(e) => e.stopPropagation()} onClick={() => { setShowRoomDropdown(false); setShowAchieverDropdown(false); setShowDropdown(false); setShowSpaceDropdown(!showSpaceDropdown) }}
                >
                  <span className={spaceId ? "text-[#2b2f36]" : "text-[#8f959e]"}>
                    {spaceId ? spaces.find(s => s.id === spaceId)?.name || "选择空间" : "选择空间"}
                  </span>
                  <ChevronDown className="h-3 w-3 text-[#8f959e]" />
                </button>
                {showSpaceDropdown && (
                  <div className="absolute top-full left-0 mt-1 w-full bg-white rounded-md border border-[#e8e8e8] shadow-lg z-50 max-h-[200px] overflow-y-auto" onMouseDown={(e) => e.stopPropagation()}>
                    {spaces.map(s => (
                      <button key={s.id} className="flex items-center justify-between w-full px-3 py-2 text-[12px] hover:bg-[#f7f8fa]"
                        onClick={() => { setSpaceId(s.id); setRoomId(s.rooms?.[0]?.id || ""); setShowSpaceDropdown(false) }}>
                        <span>{s.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div data-dropdown className="relative flex-1">
                <button type="button"
                  className="flex items-center justify-between w-full h-8 px-3 rounded-md border border-input bg-transparent text-[12px]"
                  onMouseDown={(e) => e.stopPropagation()} onClick={() => { setShowSpaceDropdown(false); setShowAchieverDropdown(false); setShowDropdown(false); setShowRoomDropdown(!showRoomDropdown) }}
                >
                  <span className={roomId ? "text-[#2b2f36]" : "text-[#8f959e]"}>
                    {roomId ? (spaces.find(s => s.id === spaceId)?.rooms || []).find(r => r.id === roomId)?.name || "选择房间" : "选择房间"}
                  </span>
                  <ChevronDown className="h-3 w-3 text-[#8f959e]" />
                </button>
                {showRoomDropdown && (
                  <div className="absolute top-full left-0 mt-1 w-full bg-white rounded-md border border-[#e8e8e8] shadow-lg z-50 max-h-[200px] overflow-y-auto" onMouseDown={(e) => e.stopPropagation()}>
                    {(spaces.find(s => s.id === spaceId)?.rooms || []).length === 0 ? (
                      <span className="block w-full px-3 py-2 text-[12px] text-[#8f959e] cursor-default">无房间</span>
                    ) : (
                      (spaces.find(s => s.id === spaceId)?.rooms || []).map(r => (
                        <button key={r.id} className="flex items-center justify-between w-full px-3 py-2 text-[12px] hover:bg-[#f7f8fa]"
                          onClick={() => { setRoomId(r.id); setShowRoomDropdown(false) }}>
                          <span>{r.name}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-[70px_1fr] items-start gap-3">
            <span className="text-[12px] text-[#8f959e] text-right mt-2">案主</span>
            <div data-dropdown className="relative" onMouseDown={(e) => e.stopPropagation()}>
              <div className="relative">
                <Input
                  value={formOwnerId ? formOwnerName : searchKeyword}
                  onChange={(e) => {
                    setSearchKeyword(e.target.value)
                    if (formOwnerId) { setFormOwnerId(""); setFormOwnerName(""); setOwnerRemaining(null) }
                    setShowDropdown(true)
                  }}
                  onFocus={() => setShowDropdown(true)}
                  onClick={() => setShowDropdown(true)}
                  placeholder={formOwnerId ? "" : "选择案主"}
                  className="h-8 text-[12px] pr-20"
                  autoComplete="off"
                />
                {formOwnerId && ownerRemaining !== null && (
                  <span className={`absolute right-7 top-1/2 -translate-y-1/2 text-[11px] ${ownerRemaining <= 0 ? "text-red-500" : "text-[#8f959e]"}`}>
                    剩余{ownerRemaining}次
                  </span>
                )}
                {formOwnerId && (
                  <button className="absolute right-2 top-1/2 -translate-y-1/2 text-[#8f959e] hover:text-[#2b2f36]"
                    onClick={() => { setFormOwnerId(""); setFormOwnerName(""); setSearchKeyword(""); setOwnerRemaining(null) }}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {showDropdown && (() => {
                const kw = searchKeyword.trim().toLowerCase()
                const filtered = kw
                  ? allCustomers.filter(c => (c.nickname || "").toLowerCase().includes(kw) || (c.name || "").toLowerCase().includes(kw))
                  : allCustomers
                return (
                <div className="absolute top-full left-0 mt-1 w-full bg-white rounded-md border border-[#e8e8e8] shadow-lg z-50 max-h-[200px] overflow-y-auto" onMouseDown={(e) => e.stopPropagation()}>
                  {filtered.length === 0 ? (
                    <div className="px-3 py-2 text-[12px] text-[#8f959e]">无匹配客户</div>
                  ) : (
                    filtered.map(c => {
                      const remaining = remainingMap[c.id]
                      const isDepleted = remaining !== undefined && remaining <= 0
                      return (
                        <button key={c.id}
                          className={`flex items-center justify-between w-full px-3 py-2 text-[12px] ${isDepleted ? "cursor-not-allowed" : "hover:bg-[#f7f8fa]"}`}
                          disabled={isDepleted}
                          onClick={() => {
                            if (isDepleted) return
                            setFormOwnerId(c.id)
                            setFormOwnerName(c.nickname || c.name || "")
                            setSearchKeyword("")
                            setShowDropdown(false)
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
          <div className="grid grid-cols-[70px_1fr] items-center gap-3">
            <span className="text-[12px] text-[#8f959e] text-right">成就君</span>
            <div data-dropdown className="relative">
              <button type="button"
                className="flex items-center justify-between w-full h-8 px-3 rounded-md border border-input bg-transparent text-[12px]"
                onMouseDown={(e) => e.stopPropagation()} onClick={() => { setShowRoomDropdown(false); setShowSpaceDropdown(false); setShowDropdown(false); setShowAchieverDropdown(!showAchieverDropdown) }}
              >
                <span className={formAchieverId ? "text-[#2b2f36]" : "text-[#8f959e]"}>
                  {formAchieverId ? formAchieverName : "选择成就君"}
                </span>
                <ChevronDown className="h-3 w-3 text-[#8f959e]" />
              </button>
              {showAchieverDropdown && (
                <div className="absolute top-full left-0 mt-1 w-full bg-white rounded-md border border-[#e8e8e8] shadow-lg z-50 max-h-[200px] overflow-y-auto" onMouseDown={(e) => e.stopPropagation()}>
                  {achieverCustomers.filter(c => c.id !== formOwnerId).map(c => (
                    <button key={c.id} className="flex items-center justify-between w-full px-3 py-2 text-[12px] hover:bg-[#f7f8fa]"
                      onClick={() => {
                        setFormAchieverId(c.id)
                        setFormAchieverName(c.nickname || c.name || "")
                        setShowAchieverDropdown(false)
                      }}>
                      <span>{c.nickname || c.name}</span>
                    </button>
                  ))}
                </div>
              )}
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
const EksDialog = memo(({ open, date, spaces, allCustomers, hostCustomers, session, onClose }: {
  open: boolean; date: string; spaces: Space[]; allCustomers: CustomerLight[]
  hostCustomers: CustomerLight[]; session?: EnergyKnotSession | null; onClose: () => void
}) => {
  const [editingRecord, setEditingRecord] = useState<EnergyKnotSession | null>(null)
  const [saving, setSaving] = useState(false)
  const [formDate, setFormDate] = useState(date)
  const [formStartTime, setFormStartTime] = useState("09:00")
  const [formEndTime, setFormEndTime] = useState("10:00")
  const [formOwnerIds, setFormOwnerIds] = useState<string[]>([])
  const [formOwnerNames, setFormOwnerNames] = useState<string[]>([])
  const [formOwnerDescriptions, setFormOwnerDescriptions] = useState<{ id: string; name: string; description: string }[]>([])
  const [searchKeyword, setSearchKeyword] = useState("")
  const [showDropdown, setShowDropdown] = useState(false)
  const [remainingMap, setRemainingMap] = useState<Record<string, number>>({})
  const [formHostIds, setFormHostIds] = useState<string[]>([])
  const [formHostNames, setFormHostNames] = useState<string[]>([])
  const [spaceId, setSpaceId] = useState("")
  const [roomId, setRoomId] = useState("")
  const [showSpaceDropdown, setShowSpaceDropdown] = useState(false)
  const [showRoomDropdown, setShowRoomDropdown] = useState(false)
  const [showHostDropdown, setShowHostDropdown] = useState(false)
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
        let descs: { id: string; name: string; description: string }[] = []
        try { const items = JSON.parse(session.description || "[]"); if (Array.isArray(items)) descs = items } catch {}
        setFormOwnerDescriptions(descs)
        setFormOwnerIds(descs.map(d => d.id).filter(Boolean))
        setFormOwnerNames(descs.map(d => d.name).filter(Boolean))
        setFormHostIds([]); setFormHostNames([])
        setSpaceId(session.space_id || (spaces[0]?.id || ""))
        setRoomId(session.room_id || "")
      } else {
        setEditingRecord(null)
        setFormDate(date)
        setFormStartTime("09:00"); setFormEndTime("10:00")
        setFormOwnerIds([]); setFormOwnerNames([]); setFormOwnerDescriptions([])
        setFormHostIds([]); setFormHostNames([])
        const ds = spaces[0]?.id || ""; const dr = ds ? spaces[0]?.rooms?.[0]?.id || "" : ""
        setSpaceId(ds); setRoomId(dr)
      }
      setSearchKeyword(""); setShowDropdown(false)
    }
  }, [open, date, spaces, session])

  useEffect(() => {
    if (!showDropdown) return
    const fetchId = ++remainingFetchRef.current
    const timer = window.setTimeout(async () => {
      try {
        const results = await energyKnotSessionApi.searchCustomers(searchKeyword)
        if (fetchId !== remainingFetchRef.current) return
        const map: Record<string, number> = {}
        results.forEach(r => { map[r.id] = r.remaining })
        setRemainingMap(map)
      } catch {}
    }, 200)
    return () => clearTimeout(timer)
  }, [searchKeyword, showDropdown])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest("[data-dropdown]")) return
      setShowDropdown(false); setShowSpaceDropdown(false)
      setShowRoomDropdown(false); setShowHostDropdown(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const selectOwner = (customer: CustomerLight) => {
    if (formOwnerIds.includes(customer.id)) return
    const remaining = remainingMap[customer.id]
    if (remaining !== undefined && remaining !== -1 && remaining <= 0) {
      setPendingOwner({ id: customer.id, nickname: customer.nickname, name: customer.name })
      setPurchaseDialogOpen(true)
      setShowDropdown(false)
      return
    }
    setFormOwnerIds([...formOwnerIds, customer.id])
    setFormOwnerNames([...formOwnerNames, customer.nickname || customer.name || ""])
    setFormOwnerDescriptions([...formOwnerDescriptions, { id: customer.id, name: customer.nickname || customer.name || "", description: "" }])
    setSearchKeyword(""); setShowDropdown(false)
    setTimeout(() => searchInputRef.current?.blur(), 0)
  }

  const addPurchase = async () => {
    if (!pendingOwner || !purchaseCount) return
    setPurchaseSaving(true)
    try {
      await energyKnotApi.create({
        customer_id: pendingOwner.id, nickname: pendingOwner.nickname,
        purchase_count: parseInt(purchaseCount) || 0, amount: parseFloat(purchaseAmount) || 0,
      })
      setFormOwnerIds([...formOwnerIds, pendingOwner.id])
      setFormOwnerNames([...formOwnerNames, pendingOwner.nickname])
      setFormOwnerDescriptions([...formOwnerDescriptions, { id: pendingOwner.id, name: pendingOwner.nickname, description: "" }])
      setPurchaseDialogOpen(false); setPendingOwner(null)
    } catch (e) { console.error("新增购买失败:", e) }
    finally { setPurchaseSaving(false) }
  }

  const handleSave = async () => {
    if (formOwnerIds.length === 0) return
    setSaving(true)
    try {
      const data = {
        date: formDate, start_time: formStartTime || null, end_time: formEndTime || null,
        owner_id: formOwnerIds[0], owner_name: formOwnerNames.join("、"),
        description: JSON.stringify(formOwnerDescriptions),
        host_ids: formHostIds, host_names: formHostNames,
        space_id: spaceId || undefined, room_id: roomId || undefined,
      }
      if (editingRecord) {
        await energyKnotSessionApi.update(editingRecord.id, data)
      } else {
        await energyKnotSessionApi.create(data)
      }
      onClose()
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
        <div className="px-6 py-5 space-y-5">
          <div className="grid grid-cols-[70px_1fr] items-center gap-3">
            <span className="text-[12px] text-[#8f959e] text-right">日期</span>
            <Input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} className="h-8 text-[12px]" />
          </div>
          <div className="grid grid-cols-[70px_1fr] items-center gap-3">
            <span className="text-[12px] text-[#8f959e] text-right">时间</span>
            <div className="flex items-center gap-2">
              <Input type="time" value={formStartTime} onChange={(e) => setFormStartTime(e.target.value)} className="h-8 text-[12px] w-28" />
              <span className="text-[12px] text-[#8f959e]">至</span>
              <Input type="time" value={formEndTime} onChange={(e) => setFormEndTime(e.target.value)} className="h-8 text-[12px] w-28" />
            </div>
          </div>
          <div className="grid grid-cols-[70px_1fr] items-center gap-3">
            <span className="text-[12px] text-[#8f959e] text-right">空间</span>
            <div className="flex items-center gap-2">
              <div data-dropdown className="relative flex-1">
                <button type="button"
                  className="flex items-center justify-between w-full h-8 px-3 rounded-md border border-input bg-transparent text-[12px]"
                  onMouseDown={(e) => e.stopPropagation()} onClick={() => { setShowRoomDropdown(false); setShowHostDropdown(false); setShowDropdown(false); setShowSpaceDropdown(!showSpaceDropdown) }}
                >
                  <span className={spaceId ? "text-[#2b2f36]" : "text-[#8f959e]"}>
                    {spaceId ? spaces.find(s => s.id === spaceId)?.name || "选择空间" : "选择空间"}
                  </span>
                  <ChevronDown className="h-3 w-3 text-[#8f959e]" />
                </button>
                {showSpaceDropdown && (
                  <div className="absolute top-full left-0 mt-1 w-full bg-white rounded-md border border-[#e8e8e8] shadow-lg z-50 max-h-[200px] overflow-y-auto" onMouseDown={(e) => e.stopPropagation()}>
                    {spaces.map(s => (
                      <button key={s.id} className="flex items-center justify-between w-full px-3 py-2 text-[12px] hover:bg-[#f7f8fa]"
                        onClick={() => { setSpaceId(s.id); setRoomId(s.rooms?.[0]?.id || ""); setShowSpaceDropdown(false) }}>
                        <span>{s.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div data-dropdown className="relative flex-1">
                <button type="button"
                  className="flex items-center justify-between w-full h-8 px-3 rounded-md border border-input bg-transparent text-[12px]"
                  onMouseDown={(e) => e.stopPropagation()} onClick={() => { setShowSpaceDropdown(false); setShowHostDropdown(false); setShowDropdown(false); setShowRoomDropdown(!showRoomDropdown) }}
                >
                  <span className={roomId ? "text-[#2b2f36]" : "text-[#8f959e]"}>
                    {roomId ? (spaces.find(s => s.id === spaceId)?.rooms || []).find(r => r.id === roomId)?.name || "选择房间" : "选择房间"}
                  </span>
                  <ChevronDown className="h-3 w-3 text-[#8f959e]" />
                </button>
                {showRoomDropdown && (
                  <div className="absolute top-full left-0 mt-1 w-full bg-white rounded-md border border-[#e8e8e8] shadow-lg z-50 max-h-[200px] overflow-y-auto" onMouseDown={(e) => e.stopPropagation()}>
                    {(spaces.find(s => s.id === spaceId)?.rooms || []).length === 0 ? (
                      <span className="block w-full px-3 py-2 text-[12px] text-[#8f959e] cursor-default">无房间</span>
                    ) : (
                      (spaces.find(s => s.id === spaceId)?.rooms || []).map(r => (
                        <button key={r.id} className="flex items-center justify-between w-full px-3 py-2 text-[12px] hover:bg-[#f7f8fa]"
                          onClick={() => { setRoomId(r.id); setShowRoomDropdown(false) }}>
                          <span>{r.name}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-[70px_1fr] items-center gap-3">
            <span className="text-[12px] text-[#8f959e] text-right">案主</span>
            <div data-dropdown className="relative" onMouseDown={(e) => e.stopPropagation()}>
              <Input
                ref={searchInputRef}
                value={searchKeyword}
                onChange={(e) => { setSearchKeyword(e.target.value); setShowDropdown(true) }}
                onFocus={() => setShowDropdown(true)}
                onClick={() => setShowDropdown(true)}
                placeholder="选择案主"
                className="h-8 text-[12px]"
                autoComplete="off"
              />
              {showDropdown && (() => {
                const kw = searchKeyword.trim().toLowerCase()
                const filtered = kw
                  ? allCustomers.filter(c => (c.nickname || "").toLowerCase().includes(kw) || (c.name || "").toLowerCase().includes(kw))
                  : allCustomers
                return (
                <div className="absolute top-full left-0 mt-1 w-full bg-white rounded-md border border-[#e8e8e8] shadow-lg z-50 max-h-[200px] overflow-y-auto" onMouseDown={(e) => e.stopPropagation()}>
                  {filtered.length === 0 ? (
                    <div className="px-3 py-2 text-[12px] text-[#8f959e]">无匹配客户</div>
                  ) : (
                    filtered.map(c => {
                      const remaining = remainingMap[c.id]
                      const isDepleted = remaining !== undefined && remaining <= 0
                      const alreadySelected = formOwnerIds.includes(c.id)
                      return (
                        <button key={c.id}
                          className={`flex items-center justify-between w-full px-3 py-2 text-[12px] ${isDepleted || alreadySelected ? "cursor-not-allowed" : "hover:bg-[#f7f8fa]"}`}
                          disabled={isDepleted || alreadySelected}
                          onClick={() => {
                            if (isDepleted || alreadySelected) return
                            selectOwner(c)
                          }}>
                          <span className={isDepleted || alreadySelected ? "text-[#b0b5bb]" : ""}>{c.nickname || c.name}</span>
                          <span className={`text-[#8f959e] ${isDepleted ? "text-red-500" : ""}`}>
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
            <div className="grid grid-cols-[70px_1fr] gap-3">
              <span />
              <div className="space-y-2">
                {formOwnerNames.map((name, i) => (
                  <div key={i} className="bg-gray-50 rounded p-2 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] font-medium">{name}</span>
                      <button onClick={() => {
                        setFormOwnerIds(formOwnerIds.filter((_, j) => j !== i))
                        setFormOwnerNames(formOwnerNames.filter((_, j) => j !== i))
                        setFormOwnerDescriptions(formOwnerDescriptions.filter((_, j) => j !== i))
                      }}><X className="h-3 w-3 text-[#8f959e]" /></button>
                    </div>
                    <Input
                      placeholder={`${name}的情况介绍...`}
                      value={formOwnerDescriptions[i]?.description || ""}
                      onChange={(e) => {
                        const next = [...formOwnerDescriptions]
                        next[i] = { ...next[i], description: e.target.value }
                        setFormOwnerDescriptions(next)
                      }}
                      className="h-8 text-[12px]"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="grid grid-cols-[70px_1fr] items-center gap-3">
            <span className="text-[12px] text-[#8f959e] text-right">能量结老师</span>
            <div className="space-y-2">
              {formHostNames.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {formHostNames.map((name, i) => (
                    <span key={i} className="inline-flex items-center gap-1 bg-gray-50 rounded px-2 py-1 text-[12px]">
                      {name}
                      <button onClick={() => {
                        setFormHostIds(formHostIds.filter((_, j) => j !== i))
                        setFormHostNames(formHostNames.filter((_, j) => j !== i))
                      }}><X className="h-3 w-3 text-[#8f959e]" /></button>
                    </span>
                  ))}
                </div>
              )}
              <div data-dropdown className="relative">
                <button type="button"
                  className="flex items-center justify-between w-full h-8 px-3 rounded-md border border-input bg-transparent text-[12px]"
                  onMouseDown={(e) => e.stopPropagation()} onClick={() => { setShowRoomDropdown(false); setShowSpaceDropdown(false); setShowDropdown(false); setShowHostDropdown(!showHostDropdown) }}
                >
                  <span className="text-[#8f959e]">选择能量结老师</span>
                  <ChevronDown className="h-3 w-3 text-[#8f959e]" />
                </button>
                {showHostDropdown && (
                  <div className="absolute top-full left-0 mt-1 w-full bg-white rounded-md border border-[#e8e8e8] shadow-lg z-50 max-h-[200px] overflow-y-auto" onMouseDown={(e) => e.stopPropagation()}>
                    {hostCustomers.map(c => (
                      <button key={c.id}
                        className={`flex items-center justify-between w-full px-3 py-2 text-[12px] ${formHostIds.includes(c.id) ? "text-[#b0b5bb] cursor-default" : "hover:bg-[#f7f8fa]"}`}
                        onClick={() => {
                          if (formHostIds.includes(c.id)) return
                          setFormHostIds([...formHostIds, c.id])
                          setFormHostNames([...formHostNames, c.nickname || c.name || ""])
                          setShowHostDropdown(false)
                        }}>
                        <span>{c.nickname || c.name}</span>
                        {formHostIds.includes(c.id) && <span className="text-[10px]">已添加</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
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
          <div className="px-6 py-5 space-y-4">
            <div className="grid grid-cols-[70px_1fr] items-center gap-3">
              <span className="text-[12px] text-[#8f959e] text-right">客户</span>
              <span className="text-[12px]">{pendingOwner?.nickname || ""}</span>
            </div>
            <div className="grid grid-cols-[70px_1fr] items-center gap-3">
              <span className="text-[12px] text-[#8f959e] text-right">购买次数</span>
              <Input type="number" value={purchaseCount} onChange={(e) => setPurchaseCount(e.target.value)} className="h-8 text-[12px]" min="1" />
            </div>
            <div className="grid grid-cols-[70px_1fr] items-center gap-3">
              <span className="text-[12px] text-[#8f959e] text-right">金额</span>
              <Input type="number" value={purchaseAmount} onChange={(e) => setPurchaseAmount(e.target.value)} className="h-8 text-[12px]" placeholder="可选" />
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
const IcsDialog = memo(({ open, date, spaces, teachers, session, onClose }: {
  open: boolean; date: string; spaces: Space[]; teachers: CustomerLight[]
  session?: InternalCourseSession | null; onClose: () => void
}) => {
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
  const [spaceId, setSpaceId] = useState("")
  const [roomId, setRoomId] = useState("")
  const [showSpaceDropdown, setShowSpaceDropdown] = useState(false)
  const [showRoomDropdown, setShowRoomDropdown] = useState(false)
  const [showCourseTypeDropdown, setShowCourseTypeDropdown] = useState(false)
  const [showTeacherDropdown, setShowTeacherDropdown] = useState(false)

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
        setFormHostId(""); setFormHostName("")
        setSpaceId(session.space_id || (spaces[0]?.id || ""))
        setRoomId(session.room_id || "")
      } else {
        setEditingRecord(null)
        setFormDate(date)
        setFormStartTime("09:00"); setFormEndTime("10:00")
        setFormCourseType(ICS_COURSE_TYPES[0]); setFormCourseName(""); setFormDescription("")
        setFormHostId(""); setFormHostName("")
        const ds = spaces[0]?.id || ""; const dr = ds ? spaces[0]?.rooms?.[0]?.id || "" : ""
        setSpaceId(ds); setRoomId(dr)
      }
    }
  }, [open, date, spaces, session])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest("[data-dropdown]")) return
      setShowSpaceDropdown(false); setShowRoomDropdown(false)
      setShowCourseTypeDropdown(false); setShowTeacherDropdown(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const hostIds = formHostId ? [formHostId] : []
      const hostNames = formHostName ? [formHostName] : []
      const data = {
        date: formDate, start_time: formStartTime || null, end_time: formEndTime || null,
        course_type: formCourseType, course_name: formCourseName,
        course_description: formDescription || undefined,
        host_ids: hostIds, host_names: hostNames,
        space_id: spaceId || undefined, room_id: roomId || undefined,
      }
      if (editingRecord) {
        await internalCourseSessionApi.update(editingRecord.id, data)
      } else {
        await internalCourseSessionApi.create(data)
      }
      onClose()
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
        <div className="px-6 py-5 space-y-5">
          <div className="grid grid-cols-[70px_1fr] items-center gap-3">
            <span className="text-[12px] text-[#8f959e] text-right">日期</span>
            <Input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} className="h-8 text-[12px]" />
          </div>
          <div className="grid grid-cols-[70px_1fr] items-center gap-3">
            <span className="text-[12px] text-[#8f959e] text-right">时间</span>
            <div className="flex items-center gap-2">
              <Input type="time" value={formStartTime} onChange={(e) => setFormStartTime(e.target.value)} className="h-8 text-[12px] w-28" />
              <span className="text-[12px] text-[#8f959e]">至</span>
              <Input type="time" value={formEndTime} onChange={(e) => setFormEndTime(e.target.value)} className="h-8 text-[12px] w-28" />
            </div>
          </div>
          <div className="grid grid-cols-[70px_1fr] items-center gap-3">
            <span className="text-[12px] text-[#8f959e] text-right">空间</span>
            <div className="flex items-center gap-2">
              <div data-dropdown className="relative flex-1">
                <button type="button"
                  className="flex items-center justify-between w-full h-8 px-3 rounded-md border border-input bg-transparent text-[12px]"
                  onMouseDown={(e) => e.stopPropagation()} onClick={() => { setShowRoomDropdown(false); setShowCourseTypeDropdown(false); setShowTeacherDropdown(false); setShowSpaceDropdown(!showSpaceDropdown) }}
                >
                  <span className={spaceId ? "text-[#2b2f36]" : "text-[#8f959e]"}>
                    {spaceId ? spaces.find(s => s.id === spaceId)?.name || "选择空间" : "选择空间"}
                  </span>
                  <ChevronDown className="h-3 w-3 text-[#8f959e]" />
                </button>
                {showSpaceDropdown && (
                  <div className="absolute top-full left-0 mt-1 w-full bg-white rounded-md border border-[#e8e8e8] shadow-lg z-50 max-h-[200px] overflow-y-auto" onMouseDown={(e) => e.stopPropagation()}>
                    {spaces.map(s => (
                      <button key={s.id} className="flex items-center justify-between w-full px-3 py-2 text-[12px] hover:bg-[#f7f8fa]"
                        onClick={() => { setSpaceId(s.id); setRoomId(s.rooms?.[0]?.id || ""); setShowSpaceDropdown(false) }}>
                        <span>{s.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div data-dropdown className="relative flex-1">
                <button type="button"
                  className="flex items-center justify-between w-full h-8 px-3 rounded-md border border-input bg-transparent text-[12px]"
                  onMouseDown={(e) => e.stopPropagation()} onClick={() => { setShowSpaceDropdown(false); setShowCourseTypeDropdown(false); setShowTeacherDropdown(false); setShowRoomDropdown(!showRoomDropdown) }}
                >
                  <span className={roomId ? "text-[#2b2f36]" : "text-[#8f959e]"}>
                    {roomId ? (spaces.find(s => s.id === spaceId)?.rooms || []).find(r => r.id === roomId)?.name || "选择房间" : "选择房间"}
                  </span>
                  <ChevronDown className="h-3 w-3 text-[#8f959e]" />
                </button>
                {showRoomDropdown && (
                  <div className="absolute top-full left-0 mt-1 w-full bg-white rounded-md border border-[#e8e8e8] shadow-lg z-50 max-h-[200px] overflow-y-auto" onMouseDown={(e) => e.stopPropagation()}>
                    {(spaces.find(s => s.id === spaceId)?.rooms || []).length === 0 ? (
                      <span className="block w-full px-3 py-2 text-[12px] text-[#8f959e] cursor-default">无房间</span>
                    ) : (
                      (spaces.find(s => s.id === spaceId)?.rooms || []).map(r => (
                        <button key={r.id} className="flex items-center justify-between w-full px-3 py-2 text-[12px] hover:bg-[#f7f8fa]"
                          onClick={() => { setRoomId(r.id); setShowRoomDropdown(false) }}>
                          <span>{r.name}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-[70px_1fr] items-center gap-3">
            <span className="text-[12px] text-[#8f959e] text-right">课程类型</span>
            <div data-dropdown className="relative">
              <button type="button"
                className="flex items-center justify-between w-full h-8 px-3 rounded-md border border-input bg-transparent text-[12px]"
                onMouseDown={(e) => e.stopPropagation()} onClick={() => { setShowRoomDropdown(false); setShowSpaceDropdown(false); setShowTeacherDropdown(false); setShowCourseTypeDropdown(!showCourseTypeDropdown) }}
              >
                <span className="text-[#2b2f36]">{formCourseType}</span>
                <ChevronDown className="h-3 w-3 text-[#8f959e]" />
              </button>
              {showCourseTypeDropdown && (
                <div className="absolute top-full left-0 mt-1 w-full bg-white rounded-md border border-[#e8e8e8] shadow-lg z-50 max-h-[200px] overflow-y-auto" onMouseDown={(e) => e.stopPropagation()}>
                  {ICS_COURSE_TYPES.map(t => (
                    <button key={t}
                      className="flex items-center justify-between w-full px-3 py-2 text-[12px] hover:bg-[#f7f8fa]"
                      onClick={() => { setFormCourseType(t); setShowCourseTypeDropdown(false) }}>
                      <span>{t}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="grid grid-cols-[70px_1fr] items-center gap-3">
            <span className="text-[12px] text-[#8f959e] text-right">课程名称</span>
            <Input value={formCourseName} onChange={(e) => setFormCourseName(e.target.value)} className="h-8 text-[12px]" placeholder="输入课程名称" />
          </div>
          <div className="grid grid-cols-[70px_1fr] items-center gap-3">
            <span className="text-[12px] text-[#8f959e] text-right">课程老师</span>
            <div data-dropdown className="relative">
              <button type="button"
                className="flex items-center justify-between w-full h-8 px-3 rounded-md border border-input bg-transparent text-[12px]"
                onMouseDown={(e) => e.stopPropagation()} onClick={() => { setShowRoomDropdown(false); setShowSpaceDropdown(false); setShowCourseTypeDropdown(false); setShowTeacherDropdown(!showTeacherDropdown) }}
              >
                <span className={formHostId ? "text-[#2b2f36]" : "text-[#8f959e]"}>
                  {formHostId ? formHostName : "选择老师"}
                </span>
                <ChevronDown className="h-3 w-3 text-[#8f959e]" />
              </button>
              {showTeacherDropdown && (
                <div className="absolute top-full left-0 mt-1 w-full bg-white rounded-md border border-[#e8e8e8] shadow-lg z-50 max-h-[200px] overflow-y-auto" onMouseDown={(e) => e.stopPropagation()}>
                  {teachers.map(c => (
                    <button key={c.id}
                      className="flex items-center justify-between w-full px-3 py-2 text-[12px] hover:bg-[#f7f8fa]"
                      onClick={() => { setFormHostId(c.id); setFormHostName(c.nickname || c.name || ""); setShowTeacherDropdown(false) }}>
                      <span>{c.nickname || c.name}</span>
                    </button>
                  ))}
                </div>
              )}
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
          <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? "保存中..." : "保存"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
})

// ===== Salon Dialog (独立组件) =====
const SalonDialog = memo(({ open, date, spaces, courses, teachers, session, onClose }: {
  open: boolean; date: string; spaces: Space[]; courses: Course[]
  teachers: CustomerLight[]; session?: ClassRecord | null; onClose: () => void
}) => {
  const [editingRecord, setEditingRecord] = useState<ClassRecord | null>(null)
  const [saving, setSaving] = useState(false)
  const [formDate, setFormDate] = useState(date)
  const [formStartTime, setFormStartTime] = useState("09:00")
  const [formEndTime, setFormEndTime] = useState("10:00")
  const [formCourseId, setFormCourseId] = useState("")
  const [formTeacherId, setFormTeacherId] = useState("")
  const [formDescription, setFormDescription] = useState("")
  const [formIsPublicWelfare, setFormIsPublicWelfare] = useState(false)
  const [spaceId, setSpaceId] = useState("")
  const [roomId, setRoomId] = useState("")
  const [showCourseDropdown, setShowCourseDropdown] = useState(false)
  const [showTeacherDropdown, setShowTeacherDropdown] = useState(false)
  const [showSpaceDropdown, setShowSpaceDropdown] = useState(false)
  const [showRoomDropdown, setShowRoomDropdown] = useState(false)
  const [showWelfareDropdown, setShowWelfareDropdown] = useState(false)

  useEffect(() => {
    if (open) {
      if (session) {
        setEditingRecord(session)
        setFormDate(session.date)
        setFormStartTime(session.start_time || "")
        setFormEndTime(session.end_time || "")
        setFormCourseId(session.course_id)
        setFormTeacherId(session.teacher_ids[0] || "")
        setFormDescription(session.course_description || "")
        setFormIsPublicWelfare(session.is_public_welfare || false)
        setSpaceId(session.space_id || (spaces[0]?.id || ""))
        setRoomId(session.room_id || "")
      } else {
        setEditingRecord(null)
        setFormDate(date)
        setFormStartTime("09:00"); setFormEndTime("10:00")
        setFormCourseId(""); setFormTeacherId("")
        setFormDescription(""); setFormIsPublicWelfare(false)
        const ds = spaces[0]?.id || ""; const dr = ds ? spaces[0]?.rooms?.[0]?.id || "" : ""
        setSpaceId(ds); setRoomId(dr)
      }
      setShowCourseDropdown(false); setShowTeacherDropdown(false)
      setShowSpaceDropdown(false); setShowRoomDropdown(false); setShowWelfareDropdown(false)
    }
  }, [open, date, spaces, session])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest("[data-dropdown]")) return
      setShowCourseDropdown(false); setShowTeacherDropdown(false)
      setShowSpaceDropdown(false); setShowRoomDropdown(false); setShowWelfareDropdown(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const selectedCourse = courses.find(c => c.id === formCourseId)

  const handleSave = async () => {
    if (!formCourseId) return
    setSaving(true)
    try {
      const teacherIds = formTeacherId ? [formTeacherId] : []
      if (editingRecord) {
        const course = courses.find(c => c.id === formCourseId)
        await classRecordApi.update(editingRecord.id, {
          date: formDate, start_time: formStartTime || null, end_time: formEndTime || null,
          course_id: formCourseId, course_name: course?.name || editingRecord.course_name,
          course_description: formDescription, teacher_ids: teacherIds,
          is_public_welfare: formIsPublicWelfare,
          space_id: spaceId || undefined, room_id: roomId || undefined,
        })
      } else {
        const course = courses.find(c => c.id === formCourseId)
        if (!course) return
        await classRecordApi.create({
          date: formDate, start_time: formStartTime || null, end_time: formEndTime || null,
          course_id: formCourseId, course_name: course.name,
          course_description: formDescription, teacher_ids: teacherIds,
          is_public_welfare: formIsPublicWelfare,
          space_id: spaceId || undefined, room_id: roomId || undefined,
        })
      }
      onClose()
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
        <div className="px-6 py-5 space-y-5">
          <div className="grid grid-cols-[70px_1fr] items-center gap-3">
            <span className="text-[12px] text-[#8f959e] text-right">日期</span>
            <Input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} className="h-8 text-[12px]" />
          </div>
          <div className="grid grid-cols-[70px_1fr] items-center gap-3">
            <span className="text-[12px] text-[#8f959e] text-right">时间</span>
            <div className="flex items-center gap-2">
              <Input type="time" value={formStartTime} onChange={(e) => setFormStartTime(e.target.value)} className="h-8 text-[12px] w-28" />
              <span className="text-[12px] text-[#8f959e]">至</span>
              <Input type="time" value={formEndTime} onChange={(e) => setFormEndTime(e.target.value)} className="h-8 text-[12px] w-28" />
            </div>
          </div>
          <div className="grid grid-cols-[70px_1fr] items-center gap-3">
            <span className="text-[12px] text-[#8f959e] text-right">空间</span>
            <div className="flex items-center gap-2">
              <div data-dropdown className="relative flex-1">
                <button type="button"
                  className="flex items-center justify-between w-full h-8 px-3 rounded-md border border-input bg-transparent text-[12px]"
                  onMouseDown={(e) => e.stopPropagation()} onClick={() => { setShowRoomDropdown(false); setShowCourseDropdown(false); setShowTeacherDropdown(false); setShowWelfareDropdown(false); setShowSpaceDropdown(!showSpaceDropdown) }}
                >
                  <span className={spaceId ? "text-[#2b2f36]" : "text-[#8f959e]"}>
                    {spaceId ? spaces.find(s => s.id === spaceId)?.name || "选择空间" : "选择空间"}
                  </span>
                  <ChevronDown className="h-3 w-3 text-[#8f959e]" />
                </button>
                {showSpaceDropdown && (
                  <div className="absolute top-full left-0 mt-1 w-full bg-white rounded-md border border-[#e8e8e8] shadow-lg z-50 max-h-[200px] overflow-y-auto" onMouseDown={(e) => e.stopPropagation()}>
                    {spaces.map(s => (
                      <button key={s.id} className="flex items-center justify-between w-full px-3 py-2 text-[12px] hover:bg-[#f7f8fa]"
                        onClick={() => { setSpaceId(s.id); setRoomId(s.rooms?.[0]?.id || ""); setShowSpaceDropdown(false) }}>
                        <span>{s.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div data-dropdown className="relative flex-1">
                <button type="button"
                  className="flex items-center justify-between w-full h-8 px-3 rounded-md border border-input bg-transparent text-[12px]"
                  onMouseDown={(e) => e.stopPropagation()} onClick={() => { setShowSpaceDropdown(false); setShowCourseDropdown(false); setShowTeacherDropdown(false); setShowWelfareDropdown(false); setShowRoomDropdown(!showRoomDropdown) }}
                >
                  <span className={roomId ? "text-[#2b2f36]" : "text-[#8f959e]"}>
                    {roomId ? (spaces.find(s => s.id === spaceId)?.rooms || []).find(r => r.id === roomId)?.name || "选择房间" : "选择房间"}
                  </span>
                  <ChevronDown className="h-3 w-3 text-[#8f959e]" />
                </button>
                {showRoomDropdown && (
                  <div className="absolute top-full left-0 mt-1 w-full bg-white rounded-md border border-[#e8e8e8] shadow-lg z-50 max-h-[200px] overflow-y-auto" onMouseDown={(e) => e.stopPropagation()}>
                    {(spaces.find(s => s.id === spaceId)?.rooms || []).length === 0 ? (
                      <span className="block w-full px-3 py-2 text-[12px] text-[#8f959e] cursor-default">无房间</span>
                    ) : (
                      (spaces.find(s => s.id === spaceId)?.rooms || []).map(r => (
                        <button key={r.id} className="flex items-center justify-between w-full px-3 py-2 text-[12px] hover:bg-[#f7f8fa]"
                          onClick={() => { setRoomId(r.id); setShowRoomDropdown(false) }}>
                          <span>{r.name}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-[70px_1fr] items-center gap-3">
            <span className="text-[12px] text-[#8f959e] text-right">课程</span>
            <div data-dropdown className="relative">
              <button type="button"
                className="flex items-center justify-between w-full h-8 px-3 rounded-md border border-input bg-transparent text-[12px]"
                onMouseDown={(e) => e.stopPropagation()} onClick={() => { setShowRoomDropdown(false); setShowSpaceDropdown(false); setShowTeacherDropdown(false); setShowWelfareDropdown(false); setShowCourseDropdown(!showCourseDropdown) }}
              >
                <span className={formCourseId ? "text-[#2b2f36]" : "text-[#8f959e]"}>
                  {selectedCourse ? selectedCourse.name : "选择课程"}
                </span>
                <ChevronDown className="h-3 w-3 text-[#8f959e]" />
              </button>
              {showCourseDropdown && (
                <div className="absolute top-full left-0 mt-1 w-full bg-white rounded-md border border-[#e8e8e8] shadow-lg z-50 max-h-[200px] overflow-y-auto" onMouseDown={(e) => e.stopPropagation()}>
                  {courses.map(c => (
                    <button key={c.id} className="flex items-center justify-between w-full px-3 py-2 text-[12px] hover:bg-[#f7f8fa]"
                      onClick={() => { setFormCourseId(c.id); setShowCourseDropdown(false) }}>
                      <span>{c.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="grid grid-cols-[70px_1fr] items-center gap-3">
            <span className="text-[12px] text-[#8f959e] text-right">老师</span>
            <div data-dropdown className="relative">
              <button type="button"
                className="flex items-center justify-between w-full h-8 px-3 rounded-md border border-input bg-transparent text-[12px]"
                onMouseDown={(e) => e.stopPropagation()} onClick={() => { setShowRoomDropdown(false); setShowSpaceDropdown(false); setShowCourseDropdown(false); setShowWelfareDropdown(false); setShowTeacherDropdown(!showTeacherDropdown) }}
              >
                <span className={formTeacherId ? "text-[#2b2f36]" : "text-[#8f959e]"}>
                  {formTeacherId ? teachers.find(t => t.id === formTeacherId)?.nickname || teachers.find(t => t.id === formTeacherId)?.name || "选择老师" : "选择老师"}
                </span>
                <ChevronDown className="h-3 w-3 text-[#8f959e]" />
              </button>
              {showTeacherDropdown && (
                <div className="absolute top-full left-0 mt-1 w-full bg-white rounded-md border border-[#e8e8e8] shadow-lg z-50 max-h-[200px] overflow-y-auto" onMouseDown={(e) => e.stopPropagation()}>
                  {teachers.map(c => (
                    <button key={c.id} className="flex items-center justify-between w-full px-3 py-2 text-[12px] hover:bg-[#f7f8fa]"
                      onClick={() => { setFormTeacherId(c.id); setShowTeacherDropdown(false) }}>
                      <span>{c.nickname || c.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="grid grid-cols-[70px_1fr] items-center gap-3">
            <span className="text-[12px] text-[#8f959e] text-right">公益</span>
            <div data-dropdown className="relative">
              <button type="button"
                className="flex items-center justify-between w-full h-8 px-3 rounded-md border border-input bg-transparent text-[12px]"
                onMouseDown={(e) => e.stopPropagation()} onClick={() => { setShowRoomDropdown(false); setShowSpaceDropdown(false); setShowCourseDropdown(false); setShowTeacherDropdown(false); setShowWelfareDropdown(!showWelfareDropdown) }}
              >
                <span className="text-[#2b2f36]">{formIsPublicWelfare ? "是" : "否"}</span>
                <ChevronDown className="h-3 w-3 text-[#8f959e]" />
              </button>
              {showWelfareDropdown && (
                <div className="absolute top-full left-0 mt-1 w-full bg-white rounded-md border border-[#e8e8e8] shadow-lg z-50 max-h-[200px] overflow-y-auto" onMouseDown={(e) => e.stopPropagation()}>
                  {[false, true].map(v => (
                    <button key={String(v)} className="flex items-center justify-between w-full px-3 py-2 text-[12px] hover:bg-[#f7f8fa]"
                      onClick={() => { setFormIsPublicWelfare(v); setShowWelfareDropdown(false) }}>
                      <span>{v ? "是" : "否"}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="grid grid-cols-[70px_1fr] items-start gap-3">
            <span className="text-[12px] text-[#8f959e] text-right mt-1">备注</span>
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
  <div className="flex items-center justify-between gap-1 mt-2">
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
            className={`shrink-0 flex flex-col items-center justify-center w-10 h-12 rounded-md transition-colors ${
              isSelected ? "bg-[#3370ff] text-white" : isToday ? "bg-[#f0f5ff]" : "hover:bg-[#f7f8fa]"
            }`}
            onClick={() => onSelectDate(d)}
          >
            <span className={`text-[10px] leading-none ${isSelected ? "text-white/80" : "text-[#8f959e]"}`}>
              {getWeekday(d)}
            </span>
            <span className="text-[14px] font-medium leading-tight">{d.split("-")[2]}</span>
            {dayCount > 0 && (
              <span className={`text-[9px] leading-none mt-0.5 ${isSelected ? "text-white/80" : "text-[#8f959e]"}`}>
                {dayCount}场
              </span>
            )}
          </button>
        )
      })}
    </div>
    <button className="h-7 w-7 flex items-center justify-center rounded hover:bg-[#f0f0f0] shrink-0" onClick={onNext}>
      <ChevronRight className="h-4 w-4 text-[#4e535a]" />
    </button>
  </div>
))

const ActivityCardList = memo(({ records, callbacks }: {
  records: { type: "class" | "gcs" | "ers" | "eks" | "ics"; data: any }[]
  callbacks: CardCallbacks
}) => {
  const [visibleCount, setVisibleCount] = useState(15)
  const sentinelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || visibleCount >= records.length) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisibleCount(prev => Math.min(prev + 15, records.length))
        }
      },
      { rootMargin: "200px" }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [visibleCount, records.length])

  return (
  <div className="divide-y divide-[#e8e8e8] border-y border-[#e8e8e8]">
    {records.slice(0, visibleCount).map((ur) => {
      if (ur.type === "class") {
        return <SalonCard key={`class-${(ur.data as ClassRecord).id}`} record={ur.data as ClassRecord} teachers={callbacks.teachers} onEdit={callbacks.onEditClass} onDelete={callbacks.onDeleteClass} onMaterials={callbacks.onMaterialsClass} />
      }
      if (ur.type === "gcs") {
        return <GcsCard key={`gcs-${(ur.data as GroupCaseSession).id}`} session={ur.data as GroupCaseSession} onEdit={callbacks.onEditGcs} onDelete={callbacks.onDeleteGcs} onMaterials={callbacks.onMaterialsGcs} />
      }
      if (ur.type === "ers") {
        return <ErsCard key={`ers-${(ur.data as EmotionalReleaseSession).id}`} session={ur.data as EmotionalReleaseSession} onEdit={callbacks.onEditErs} onDelete={callbacks.onDeleteErs} />
      }
      if (ur.type === "eks") {
        return <EksCard key={`eks-${(ur.data as EnergyKnotSession).id}`} session={ur.data as EnergyKnotSession} onEdit={callbacks.onEditEks} onDelete={callbacks.onDeleteEks} />
      }
      if (ur.type === "ics") {
        return <IcsCard key={`ics-${(ur.data as InternalCourseSession).id}`} session={ur.data as InternalCourseSession} onEdit={callbacks.onEditIcs} onDelete={callbacks.onDeleteIcs} onMaterials={callbacks.onMaterialsIcs} />
      }
      return null
    })}
    {visibleCount < records.length && (
      <div ref={sentinelRef} className="h-4" />
    )}
  </div>
  )
})

export default function DailyActivitiesPage() {
  // ===== Core state =====
  const [detailDate, setDetailDate] = useState(today)
  const [dateRangeStart, setDateRangeStart] = useState(() => formatDate(addDays(new Date(), -7)))
  const [showCalendarPicker, setShowCalendarPicker] = useState(false)
  const [calendarPickerMonth, setCalendarPickerMonth] = useState(() => today.substring(0, 7))
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [allCustomers, setAllCustomers] = useState<CustomerLight[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [teachers, setTeachers] = useState<CustomerLight[]>([])
  const [calendarCounts, setCalendarCounts] = useState<Record<string, number>>({})
  const [spaces, setSpaces] = useState<Space[]>([])
  const [selectedSpaceId, setSelectedSpaceId] = useState(() => {
    try { return localStorage.getItem("daily-activities-space") || "" } catch { return "" }
  })
  const [showSpaceDropdown, setShowSpaceDropdown] = useState(false)
  const spaceDropdownRef = useRef<HTMLDivElement | null>(null)

  // Activity data (5 types from dashboard)
  const [detailRecords, setDetailRecords] = useState<ClassRecord[]>([])
  const [detailGcsSessions, setDetailGcsSessions] = useState<GroupCaseSession[]>([])
  const [detailErsSessions, setDetailErsSessions] = useState<EmotionalReleaseSession[]>([])
  const [detailEksSessions, setDetailEksSessions] = useState<EnergyKnotSession[]>([])
  const [detailIcsSessions, setDetailIcsSessions] = useState<InternalCourseSession[]>([])

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

  // ===== Permissions =====
  const userPermissions = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("userPermissions") || "[]") } catch { return [] }
  }, [])
  const currentUser = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("currentUser") || "{}") } catch { return {} }
  }, [])
  const isSuperAdmin = currentUser?.role === "超级管理员"

  // ===== Refs =====
  const calendarPickerRef = useRef<HTMLDivElement | null>(null)

  // ===== Derived data =====
  const dateRange = Array.from({ length: 21 }, (_, i) => formatDate(addDays(new Date(dateRangeStart), i)))

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

  // Memoized customer lists — avoid re-filtering hundreds of customers on every render
  const achieverCustomers = useMemo(() => allCustomers.filter(c => c.positions?.includes("成就君")), [allCustomers])
  const eksHostCustomers = useMemo(() => allCustomers.filter(c => c.positions?.includes("能量结老师")), [allCustomers])

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
    setDetailLoading(true)
    try {
      const dashboard = await classRecordApi.dashboard(date)
      const { class_records: records, gcs_sessions: gcs, ers_sessions: ers, eks_sessions: eks, ics_sessions: ics } = dashboard

      setDetailRecords(records)
      setDetailGcsSessions(gcs)
      setDetailErsSessions(ers)
      setDetailEksSessions(eks)
      setDetailIcsSessions(ics)
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
        if (s.achiever_id) ids.add(s.achiever_id)
        if (s.host_id) ids.add(s.host_id)
        for (const pid of (s.participant_ids || [])) ids.add(pid)
      }
      for (const s of ers) {
        if (s.owner_id) ids.add(s.owner_id)
        if (s.achiever_id) ids.add(s.achiever_id)
        if (s.host_id) ids.add(s.host_id)
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
        // Merge into allCustomers without overwriting (teachers loaded separately via load())
        setAllCustomers(prev => {
          const existingIds = new Set(prev.map(c => c.id))
          const newCustomers = customers.filter(c => !existingIds.has(c.id))
          return newCustomers.length > 0 ? [...prev, ...newCustomers] : prev
        })
      }
    } finally {
      setDetailLoading(false)
      setLoading(false)
    }
  }

  const load = () => {
    courseApi.list().then(setCourses).catch(() => {})
    spaceApi.list().then(setSpaces).catch(() => {})
    customerApi.light()
      .then((customers) => {
        setAllCustomers(customers)
        setTeachers(customers.filter(c => c.positions?.includes("课程老师")))
      })
      .catch(() => {})
  }

  useEffect(() => { load() }, [])
  useEffect(() => { loadDateData(detailDate) }, [detailDate])

  // Helper: close all dropdowns (used by toggle buttons to avoid mousedown flash)
  const closeAllDropdowns = () => {
    setShowCalendarPicker(false)
    setShowSpaceDropdown(false)
  }

  // Click outside to close all dropdowns
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest("[data-dropdown]")) return
      setShowCalendarPicker(false)
      setShowSpaceDropdown(false)
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
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
      const newMaterials = (materialsRecord.materials || []).filter(m => !m.url.includes(filename))
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
      const newMaterials = (gcsMaterialsRecord.materials || []).filter(m => !m.url.includes(filename))
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
      const newMaterials = (icsMaterialsRecord.materials || []).filter(m => !m.url.includes(filename))
      await internalCourseSessionApi.update(icsMaterialsRecord.id, { materials: newMaterials } as any)
      setIcsMaterialsRecord({ ...icsMaterialsRecord, materials: newMaterials })
      loadDateData(detailDate)
    } catch {}
  }

  // ===== Render helpers =====
  const cardCallbacks = useMemo(() => ({
    teachers,
    onEditClass: handleOpenEdit,
    onDeleteClass: setDeleteId,
    onMaterialsClass: handleOpenMaterials,
    onEditGcs: handleOpenGcsEdit,
    onDeleteGcs: setGcsDeleteId,
    onMaterialsGcs: handleOpenGcsMaterials,
    onEditErs: handleOpenErsEdit,
    onDeleteErs: setErsDeleteId,
    onEditEks: handleOpenEksEdit,
    onDeleteEks: setEksDeleteId,
    onEditIcs: handleOpenIcsEdit,
    onDeleteIcs: setIcsDeleteId,
    onMaterialsIcs: handleOpenIcsMaterials,
  } as CardCallbacks), [teachers, handleOpenEdit, handleOpenMaterials, handleOpenGcsEdit, handleOpenGcsMaterials, handleOpenErsEdit, handleOpenEksEdit, handleOpenIcsEdit, handleOpenIcsMaterials])

  // ===== JSX =====
  return (
    <div className="px-6 pt-4 pb-6 flex flex-col min-h-0" style={{ height: 'calc(100vh - 48px)' }}>
      <div className="flex flex-col min-h-0 flex-1 gap-2">
        <div>
          {/* Date picker + action buttons */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
            <div className="relative inline-block">
              <button
                className="flex items-center gap-1 px-1 py-0.5 rounded hover:bg-[#f7f8fa] transition-colors"
                onClick={() => {
                  setCalendarPickerMonth(detailDate.substring(0, 7))
                  setShowCalendarPicker(!showCalendarPicker)
                }}
              >
                <span className="text-[16px] text-[#2b2f36] font-medium whitespace-nowrap">
                  {formatDateChinese(detailDate)}
                </span>
                <ChevronDown className="h-4 w-4 text-[#8f959e]" />
              </button>
              {showCalendarPicker && (
                <div data-dropdown ref={calendarPickerRef} className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-lg border border-[#e8e8e8] p-3 z-50 w-[280px]" onMouseDown={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-between mb-3">
                    <button
                      className="h-6 w-6 flex items-center justify-center rounded hover:bg-[#f0f0f0]"
                      onClick={() => {
                        const [y, m] = calendarPickerMonth.split("-").map(Number)
                        setCalendarPickerMonth(`${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, "0")}`)
                      }}
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <span className="text-[13px] font-medium text-[#2b2f36]">
                      {calendarPickerMonth.split("-")[0]}年{parseInt(calendarPickerMonth.split("-")[1])}月
                    </span>
                    <button
                      className="h-6 w-6 flex items-center justify-center rounded hover:bg-[#f0f0f0]"
                      onClick={() => {
                        const [y, m] = calendarPickerMonth.split("-").map(Number)
                        setCalendarPickerMonth(`${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}`)
                      }}
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-7 gap-0.5 mb-1">
                    {["日", "一", "二", "三", "四", "五", "六"].map((w) => (
                      <div key={w} className="text-center text-[10px] text-[#8f959e] py-1">{w}</div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-0.5">
                    {(() => {
                      const [year, month] = calendarPickerMonth.split("-").map(Number)
                      const firstDay = new Date(year, month - 1, 1)
                      const lastDay = new Date(year, month, 0)
                      const startWeekday = firstDay.getDay()
                      const daysInMonth = lastDay.getDate()
                      const cells: (number | null)[] = []
                      for (let i = 0; i < startWeekday; i++) cells.push(null)
                      for (let d = 1; d <= daysInMonth; d++) cells.push(d)
                      return cells.map((day, i) => {
                        if (!day) return <div key={`empty-${i}`} className="h-7" />
                        const dateStr = `${calendarPickerMonth}-${String(day).padStart(2, "0")}`
                        const isSelected = dateStr === detailDate
                        const isTodayDate = dateStr === today
                        return (
                          <button
                            key={dateStr}
                            className={`h-7 flex items-center justify-center rounded text-[12px] transition-colors ${
                              isSelected ? "bg-[#3370ff] text-white" : isTodayDate ? "bg-[#f0f5ff] text-[#3370ff]" : "hover:bg-[#f7f8fa] text-[#2b2f36]"
                            }`}
                            onClick={() => {
                              setDetailDate(dateStr)
                              setShowCalendarPicker(false)
                            }}
                          >
                            {day}
                          </button>
                        )
                      })
                    })()}
                  </div>
                </div>
              )}
            </div>
              {spaces.length > 0 && (
                <div data-dropdown className="relative" ref={spaceDropdownRef}>
                  <button
                    className="flex items-center gap-1 px-1 py-0.5 rounded hover:bg-[#f7f8fa] transition-colors"
                    onMouseDown={(e) => e.stopPropagation()} onClick={() => { closeAllDropdowns(); setShowSpaceDropdown(!showSpaceDropdown) }}
                  >
                    <span className="text-[16px] text-[#2b2f36] font-medium whitespace-nowrap">
                      {selectedSpaceId ? spaces.find(s => s.id === selectedSpaceId)?.name || "全部空间" : "全部空间"}
                    </span>
                    <ChevronDown className="h-4 w-4 text-[#8f959e]" />
                  </button>
                  {showSpaceDropdown && (
                    <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-lg border border-[#e8e8e8] py-1 z-50 min-w-[140px]" onMouseDown={(e) => e.stopPropagation()}>
                      <button
                        className="w-full text-left px-4 py-2 text-[13px] hover:bg-[#f7f8fa] text-[#2b2f36]"
                        onClick={() => { setSelectedSpaceId(""); localStorage.setItem("daily-activities-space", ""); setShowSpaceDropdown(false) }}
                      >
                        全部空间
                      </button>
                      {spaces.map(s => (
                        <button
                          key={s.id}
                          className={`w-full text-left px-4 py-2 text-[13px] hover:bg-[#f7f8fa] ${s.id === selectedSpaceId ? "text-[#3370ff] bg-[#f0f5ff]" : "text-[#2b2f36]"}`}
                          onClick={() => { setSelectedSpaceId(s.id); localStorage.setItem("daily-activities-space", s.id); setShowSpaceDropdown(false) }}
                        >
                          {s.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger>
                  <Button size="sm" className="text-xs">
                    <Plus className="mr-1 h-3.5 w-3.5" /> 新增 <ChevronDown className="ml-1 h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleOpenCreate(detailDate)}>沙龙活动</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleOpenGcsCreate(detailDate)}>觉醒游戏</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleOpenErsCreate(detailDate)}>情绪释放</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleOpenEksCreate(detailDate)}>能量结</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleOpenIcsCreate(detailDate)}>内部课程</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          {/* Date scroll bar */}
          <DateScroller
            dateRange={dateRange}
            calendarCounts={calendarCounts}
            detailDate={detailDate}
            todayStr={today}
            onPrev={onDateScrollerPrev}
            onNext={onDateScrollerNext}
            onSelectDate={onDateScrollerSelect}
          />
        </div>

        {/* Activity cards */}
        <div className="flex-1 overflow-y-auto" onMouseDown={(e) => e.stopPropagation()}>
          {detailLoading ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Loader2 className="h-8 w-8 text-muted-foreground mb-2 animate-spin" />
              <p className="text-sm text-muted-foreground">加载中...</p>
            </div>
          ) : unifiedDetailRecords.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <BookOpen className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">{detailDate === today ? "今天暂无记录" : `${detailDate} 暂无记录`}</p>
            </div>
          ) : (
            <ActivityCardList records={unifiedDetailRecords} callbacks={cardCallbacks} />
          )}
        </div>
      </div>

      {/* ===== Salon Dialog ===== */}
      <SalonDialog
        open={dialogOpen}
        date={detailDate}
        spaces={spaces}
        courses={courses}
        teachers={teachers}
        session={salonEditSession}
        onClose={() => { setDialogOpen(false); loadDateData(detailDate) }}
      />

      {/* ===== GCS Dialog ===== */}
      <GcsDialog
        open={gcsDialogOpen}
        date={detailDate}
        spaces={spaces}
        allCustomers={allCustomers}
        achieverCustomers={achieverCustomers}
        session={gcsEditSession}
        onClose={() => { setGcsDialogOpen(false); loadDateData(detailDate) }}
      />

      {/* ===== ERS Dialog ===== */}
      <ErsDialog
        open={ersDialogOpen}
        date={detailDate}
        spaces={spaces}
        allCustomers={allCustomers}
        achieverCustomers={achieverCustomers}
        session={ersEditSession}
        onClose={() => { setErsDialogOpen(false); loadDateData(detailDate) }}
      />

      {/* ===== EKS Dialog ===== */}
      <EksDialog
        open={eksDialogOpen}
        date={detailDate}
        spaces={spaces}
        allCustomers={allCustomers}
        hostCustomers={eksHostCustomers}
        session={eksEditSession}
        onClose={() => { setEksDialogOpen(false); loadDateData(detailDate) }}
      />

      {/* ===== ICS Dialog ===== */}
      <IcsDialog
        open={icsDialogOpen}
        date={detailDate}
        spaces={spaces}
        teachers={teachers}
        session={icsEditSession}
        onClose={() => { setIcsDialogOpen(false); loadDateData(detailDate) }}
      />

      {/* ===== Salon Delete Dialog ===== */}
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

      {/* ===== Salon Materials Dialog ===== */}
      {materialsDialogOpen && (
      <Dialog open={materialsDialogOpen} onOpenChange={(open) => { if (!open) setMaterialsDialogOpen(false) }}>
        <DialogContent className="max-w-md p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-4 border-b flex flex-row items-center justify-between">
            <DialogTitle className="text-[15px]">资料管理</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-4">
            {(materialsRecord?.materials || []).length === 0 ? (
              <p className="text-[12px] text-[#8f959e] text-center py-4">暂无资料</p>
            ) : (
              <div className="space-y-2">
                {(materialsRecord?.materials || []).map((m, i) => (
                  <div key={i} className="flex items-center gap-3 bg-gray-50 rounded px-3 py-2">
                    <File className="h-4 w-4 text-[#8f959e] shrink-0" />
                    <span className="text-[12px] text-[#2b2f36] truncate flex-1">{m.name || m.url.split("/").pop() || "文件"}</span>
                    <a href={m.url} target="_blank" rel="noreferrer"><Download className="h-4 w-4 text-[#8f959e] hover:text-[#3370ff]" /></a>
                    <button onClick={() => handleDeleteMaterial(m.url.split("/").pop() || "")}><Trash2 className="h-4 w-4 text-destructive" /></button>
                  </div>
                ))}
              </div>
            )}
            <label className="flex items-center justify-center gap-2 h-10 rounded-md border border-dashed border-[#e8e8e8] text-[12px] text-[#8f959e] cursor-pointer hover:bg-[#f7f8fa]">
              <FileUp className="h-3.5 w-3.5" />
              {uploading ? "上传中..." : "上传文件"}
              <input type="file" className="hidden" onChange={handleUploadMaterial} disabled={uploading} />
            </label>
          </div>
        </DialogContent>
      </Dialog>
      )}

      {/* ===== GCS Materials Dialog ===== */}
      {gcsMaterialsDialogOpen && (
      <Dialog open={gcsMaterialsDialogOpen} onOpenChange={(open) => { if (!open) setGcsMaterialsDialogOpen(false) }}>
        <DialogContent className="max-w-md p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-4 border-b flex flex-row items-center justify-between">
            <DialogTitle className="text-[15px]">资料管理</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-4">
            {(gcsMaterialsRecord?.materials || []).length === 0 ? (
              <p className="text-[12px] text-[#8f959e] text-center py-4">暂无资料</p>
            ) : (
              <div className="space-y-2">
                {(gcsMaterialsRecord?.materials || []).map((m, i) => (
                  <div key={i} className="flex items-center gap-3 bg-gray-50 rounded px-3 py-2">
                    <File className="h-4 w-4 text-[#8f959e] shrink-0" />
                    <span className="text-[12px] text-[#2b2f36] truncate flex-1">{m.name || m.url.split("/").pop() || "文件"}</span>
                    <a href={m.url} target="_blank" rel="noreferrer"><Download className="h-4 w-4 text-[#8f959e] hover:text-[#3370ff]" /></a>
                    <button onClick={() => handleDeleteGcsMaterial(m.url.split("/").pop() || "")}><Trash2 className="h-4 w-4 text-destructive" /></button>
                  </div>
                ))}
              </div>
            )}
            <label className="flex items-center justify-center gap-2 h-10 rounded-md border border-dashed border-[#e8e8e8] text-[12px] text-[#8f959e] cursor-pointer hover:bg-[#f7f8fa]">
              <FileUp className="h-3.5 w-3.5" />
              {uploading ? "上传中..." : "上传文件"}
              <input type="file" className="hidden" onChange={handleUploadGcsMaterial} disabled={uploading} />
            </label>
          </div>
        </DialogContent>
      </Dialog>
      )}

      {/* ===== ICS Materials Dialog ===== */}
      {icsMaterialsDialogOpen && (
      <Dialog open={icsMaterialsDialogOpen} onOpenChange={(open) => { if (!open) setIcsMaterialsDialogOpen(false) }}>
        <DialogContent className="max-w-md p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-4 border-b flex flex-row items-center justify-between">
            <DialogTitle className="text-[15px]">资料管理</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-4">
            {(icsMaterialsRecord?.materials || []).length === 0 ? (
              <p className="text-[12px] text-[#8f959e] text-center py-4">暂无资料</p>
            ) : (
              <div className="space-y-2">
                {(icsMaterialsRecord?.materials || []).map((m, i) => (
                  <div key={i} className="flex items-center gap-3 bg-gray-50 rounded px-3 py-2">
                    <File className="h-4 w-4 text-[#8f959e] shrink-0" />
                    <span className="text-[12px] text-[#2b2f36] truncate flex-1">{m.name || m.url.split("/").pop() || "文件"}</span>
                    <a href={m.url} target="_blank" rel="noreferrer"><Download className="h-4 w-4 text-[#8f959e] hover:text-[#3370ff]" /></a>
                    <button onClick={() => handleDeleteIcsMaterial(m.url.split("/").pop() || "")}><Trash2 className="h-4 w-4 text-destructive" /></button>
                  </div>
                ))}
              </div>
            )}
            <label className="flex items-center justify-center gap-2 h-10 rounded-md border border-dashed border-[#e8e8e8] text-[12px] text-[#8f959e] cursor-pointer hover:bg-[#f7f8fa]">
              <FileUp className="h-3.5 w-3.5" />
              {uploading ? "上传中..." : "上传文件"}
              <input type="file" className="hidden" onChange={handleUploadIcsMaterial} disabled={uploading} />
            </label>
          </div>
        </DialogContent>
      </Dialog>
      )}

      {/* ===== Warning Dialog ===== */}
      {warningOpen && (
      <AlertDialog open={warningOpen} onOpenChange={setWarningOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>操作提示</AlertDialogTitle>
            <AlertDialogDescription>{warningMsg}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setWarningOpen(false)}>知道了</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      )}
    </div>
  )
}
