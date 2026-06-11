import { useEffect, useState, useRef, useMemo, useCallback, memo, startTransition } from "react"
import { useNavigate } from "react-router-dom"
import { useEnterToNext } from "@/hooks/use-enter-to-next"
import { Plus, Trash2, Edit, ChevronRight, ChevronLeft, FileUp, Download, File, ChevronDown, Loader2, BookOpen, X, Users, Sparkles, Heart, Zap, GraduationCap, Layers } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
  internalCourseSessionApi, courseApi, customerApi, uploadApi, spaceApi,
  activityThemeApi, ohCardReadingSessionApi,
  type ClassRecord, type GroupCaseSession, type EmotionalReleaseSession,
  type EnergyKnotSession, type InternalCourseSession, type OhCardReadingSession,
  type Course, type CustomerLight, type Space,
  type InternalCourseSessionCustomerSearchResult,
  type GroupCaseCustomerSearchResult,
  type ActivityTheme,
} from "@/lib/api"
import { SpaceDropdown } from "@/components/space-dropdown"
import { CalendarDatePicker } from "@/components/calendar-date-picker"

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
  onEditOcr: (s: OhCardReadingSession) => void
  onDeleteOcr: (id: string) => void
  onMaterialsOcr: (s: OhCardReadingSession) => void
  teachers: CustomerLight[]
  spaces: Space[]
  courseMap: Record<string, string>
}

const SalonCard = memo(({ record, teachers, spaces, courseMap, onEdit, onDelete, onMaterials }: {
  record: ClassRecord; teachers: CustomerLight[]; spaces: Space[]; courseMap: Record<string, string>
  onEdit: (r: ClassRecord) => void; onDelete: (id: string) => void; onMaterials: (r: ClassRecord) => void
}) => (
  <div key={`class-${record.id}`} className="bg-white">
    <div className="flex">
      <div className="shrink-0 w-16 flex flex-col items-center justify-center gap-1 px-2 py-3.5">
        {record.start_time && <span className="text-[11px] text-[#8f959e] font-light">{record.start_time}</span>}
        {record.start_time && record.end_time && <span className="text-[10px] text-[#c9cdd4]">~</span>}
        {record.end_time && <span className="text-[11px] text-[#8f959e] font-light">{record.end_time}</span>}
      </div>
      <div className="flex-1 min-w-0 pl-[7px] pr-5 py-3.5 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-normal bg-[#f8faff] text-[#3370ff]">沙龙</span>
          {record.is_public_welfare && <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-normal bg-[#f8fdf8] text-[#4caf50]">公益</span>}
          <span className="text-[14px] font-medium text-[#2b2f36] truncate">{courseMap[record.course_id] || record.course_name}</span>
          {getTeacherNames(record.teacher_ids, teachers).length > 0 && (
            <span className="inline-block ml-1 px-1.5 py-0.5 rounded text-[10px] font-normal bg-[#fafbfc] text-[#787f88]">课程老师：{getTeacherNames(record.teacher_ids, teachers).join("、")}</span>
          )}
          {getRoomLabel(record.space_id, record.room_id, spaces, record.room_name, record.space_name) && (
            <span className="inline-block ml-1 px-1.5 py-0.5 rounded text-[10px] font-normal bg-[#fafbfc] text-[#787f88]">{getRoomLabel(record.space_id, record.room_id, spaces, record.room_name, record.space_name)}</span>
          )}
          {record.activity_mode && record.activity_mode !== "线下" && (
            <span className="inline-block ml-1 px-1.5 py-0.5 rounded text-[10px] font-normal bg-[#fafbfc] text-[#787f88]">线上</span>
          )}
        </div>
        {record.course_description && <p className="text-[12px] text-[#8f959e] font-light leading-relaxed">{record.course_description}</p>}
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

const GcsCard = memo(({ session, spaces, onEdit, onDelete, onMaterials }: {
  session: GroupCaseSession; spaces: Space[]
  onEdit: (s: GroupCaseSession) => void; onDelete: (id: string) => void; onMaterials: (s: GroupCaseSession) => void
}) => (
  <div key={`gcs-${session.id}`} className="bg-white">
    <div className="flex">
      <div className="shrink-0 w-16 flex flex-col items-center justify-center gap-1 px-2 py-3.5">
        {session.start_time && <span className="text-[11px] text-[#8f959e] font-light">{session.start_time}</span>}
        {session.start_time && session.end_time && <span className="text-[10px] text-[#c9cdd4]">~</span>}
        {session.end_time && <span className="text-[11px] text-[#8f959e] font-light">{session.end_time}</span>}
      </div>
      <div className="flex-1 min-w-0 pl-[7px] pr-5 py-3.5 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-normal bg-[#f8f5ff] text-[#7c5cfc]">觉醒</span>
          <span className="text-[14px] font-medium text-[#2b2f36] truncate">觉醒游戏</span>
          <span className="text-[14px] font-bold text-[#2b2f36] mx-0.5">·</span>
          <span className="text-[14px] font-medium text-[#2b2f36]">{session.owner_name || "未分配"}</span>
          {session.achiever_name && <span className="inline-block ml-1 px-1.5 py-0.5 rounded text-[10px] font-normal bg-[#fafbfc] text-[#787f88]">成就君：{session.achiever_name}</span>}
          {getRoomLabel(session.space_id, session.room_id, spaces, session.room_name, session.space_name) && (
            <span className="inline-block ml-1 px-1.5 py-0.5 rounded text-[10px] font-normal bg-[#fafbfc] text-[#787f88]">{getRoomLabel(session.space_id, session.room_id, spaces, session.room_name, session.space_name)}</span>
          )}
          {session.activity_mode && session.activity_mode !== "线下" && (
            <span className="inline-block ml-1 px-1.5 py-0.5 rounded text-[10px] font-normal bg-[#fafbfc] text-[#787f88]">线上</span>
          )}
        </div>
        {session.description && <p className="text-[12px] text-[#8f959e] font-light leading-relaxed">{session.description}</p>}
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

const ErsCard = memo(({ session, spaces, onEdit, onDelete }: {
  session: EmotionalReleaseSession; spaces: Space[]
  onEdit: (s: EmotionalReleaseSession) => void; onDelete: (id: string) => void
}) => (
  <div key={`ers-${session.id}`} className="bg-white">
    <div className="flex">
      <div className="shrink-0 w-16 flex flex-col items-center justify-center gap-1 px-2 py-3.5">
        {session.start_time && <span className="text-[11px] text-[#8f959e] font-light">{session.start_time}</span>}
        {session.start_time && session.end_time && <span className="text-[10px] text-[#c9cdd4]">~</span>}
        {session.end_time && <span className="text-[11px] text-[#8f959e] font-light">{session.end_time}</span>}
      </div>
      <div className="flex-1 min-w-0 pl-[7px] pr-5 py-3.5 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-normal bg-[#fff8f0] text-[#f59e0b]">情绪</span>
          <span className="text-[14px] font-medium text-[#2b2f36] truncate">情绪释放</span>
          <span className="text-[14px] font-bold text-[#2b2f36] mx-0.5">·</span>
          <span className="text-[14px] font-medium text-[#2b2f36]">{session.owner_name || "未分配"}</span>
          {session.achiever_name && <span className="inline-block ml-1 px-1.5 py-0.5 rounded text-[10px] font-normal bg-[#fafbfc] text-[#787f88]">成就君：{session.achiever_name}</span>}
          {getRoomLabel(session.space_id, session.room_id, spaces, session.room_name, session.space_name) && (
            <span className="inline-block ml-1 px-1.5 py-0.5 rounded text-[10px] font-normal bg-[#fafbfc] text-[#787f88]">{getRoomLabel(session.space_id, session.room_id, spaces, session.room_name, session.space_name)}</span>
          )}
          {session.activity_mode && session.activity_mode !== "线下" && (
            <span className="inline-block ml-1 px-1.5 py-0.5 rounded text-[10px] font-normal bg-[#fafbfc] text-[#787f88]">线上</span>
          )}
        </div>
        {session.description && <p className="text-[12px] text-[#8f959e] font-light leading-relaxed">{session.description}</p>}
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

const OcrCard = memo(({ session, spaces, onEdit, onDelete, onMaterials }: {
  session: OhCardReadingSession; spaces: Space[]
  onEdit: (s: OhCardReadingSession) => void; onDelete: (id: string) => void; onMaterials: (s: OhCardReadingSession) => void
}) => (
  <div key={`ocr-${session.id}`} className="bg-white">
    <div className="flex">
      <div className="shrink-0 w-16 flex flex-col items-center justify-center gap-1 px-2 py-3.5">
        {session.start_time && <span className="text-[11px] text-[#8f959e] font-light">{session.start_time}</span>}
        {session.start_time && session.end_time && <span className="text-[10px] text-[#c9cdd4]">~</span>}
        {session.end_time && <span className="text-[11px] text-[#8f959e] font-light">{session.end_time}</span>}
      </div>
      <div className="flex-1 min-w-0 pl-[7px] pr-5 py-3.5 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-normal bg-[#f0f7ff] text-[#2b7fff]">OH</span>
          <span className="text-[14px] font-medium text-[#2b2f36] truncate">OH卡梳理</span>
          <span className="text-[14px] font-bold text-[#2b2f36] mx-0.5">·</span>
          <span className="text-[14px] font-medium text-[#2b2f36]">{session.owner_name || "未分配"}</span>
          {session.achiever_name && <span className="inline-block ml-1 px-1.5 py-0.5 rounded text-[10px] font-normal bg-[#fafbfc] text-[#787f88]">成就君：{session.achiever_name}</span>}
          {getRoomLabel(session.space_id, session.room_id, spaces, session.room_name, session.space_name) && (
            <span className="inline-block ml-1 px-1.5 py-0.5 rounded text-[10px] font-normal bg-[#fafbfc] text-[#787f88]">{getRoomLabel(session.space_id, session.room_id, spaces, session.room_name, session.space_name)}</span>
          )}
          {session.activity_mode && session.activity_mode !== "线下" && (
            <span className="inline-block ml-1 px-1.5 py-0.5 rounded text-[10px] font-normal bg-[#fafbfc] text-[#787f88]">线上</span>
          )}
        </div>
        {session.description && <p className="text-[12px] text-[#8f959e] font-light leading-relaxed">{session.description}</p>}
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

const EksCard = memo(({ session, spaces, onEdit, onDelete }: {
  session: EnergyKnotSession; spaces: Space[]
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
        <div className="flex-1 min-w-0 pl-[7px] pr-5 py-3.5 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-normal bg-[#fefce8] text-[#ca8a04]">能量</span>
            <span className="text-[14px] font-medium text-[#2b2f36] truncate">能量结</span>
            <span className="text-[14px] font-bold text-[#2b2f36] mx-0.5">·</span>
            <span className="text-[14px] font-medium text-[#2b2f36]">{eksNames.length > 0 ? eksNames.join("、") : session.owner_name || "未分配"}</span>
            {session.host_names?.length > 0 && <span className="inline-block ml-1 px-1.5 py-0.5 rounded text-[10px] font-normal bg-[#fafbfc] text-[#787f88]">课程老师：{session.host_names.join("、")}</span>}
            {getRoomLabel(session.space_id, session.room_id, spaces, session.room_name, session.space_name) && (
              <span className="inline-block ml-1 px-1.5 py-0.5 rounded text-[10px] font-normal bg-[#fafbfc] text-[#787f88]">{getRoomLabel(session.space_id, session.room_id, spaces, session.room_name, session.space_name)}</span>
            )}
            {session.activity_mode && session.activity_mode !== "线下" && (
              <span className="inline-block ml-1 px-1.5 py-0.5 rounded text-[10px] font-normal bg-[#fafbfc] text-[#787f88]">线上</span>
            )}
          </div>
          {ownerDescs.filter(d => d.description).length > 0 && (
            <div className="space-y-1">
              {ownerDescs.filter(d => d.description).map((d, i) => (
                <p key={i} className="text-[12px] text-[#8f959e] font-light leading-relaxed">
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

const IcsCard = memo(({ session, spaces, onEdit, onDelete, onMaterials }: {
  session: InternalCourseSession; spaces: Space[]
  onEdit: (s: InternalCourseSession) => void; onDelete: (id: string) => void; onMaterials: (s: InternalCourseSession) => void
}) => (
  <div key={`ics-${session.id}`} className="bg-white">
    <div className="flex">
      <div className="shrink-0 w-16 flex flex-col items-center justify-center gap-1 px-2 py-3.5">
        {session.start_time && <span className="text-[11px] text-[#8f959e] font-light">{session.start_time}</span>}
        {session.start_time && session.end_time && <span className="text-[10px] text-[#c9cdd4]">~</span>}
        {session.end_time && <span className="text-[11px] text-[#8f959e] font-light">{session.end_time}</span>}
      </div>
      <div className="flex-1 min-w-0 pl-[7px] pr-5 py-3.5 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-normal bg-[#f0fdf4] text-[#22c55e]">内部</span>
          <span className="text-[14px] font-medium text-[#2b2f36] truncate">{session.course_name}</span>
          <span className="text-[14px] font-medium text-[#2b2f36]">丨课程老师：{session.host_names?.length > 0 ? session.host_names.join("、") : "暂无"}</span>
          {session.course_type && <span className="text-[12px] text-[#4e535a]">{session.course_type}</span>}
          {getRoomLabel(session.space_id, session.room_id, spaces, session.room_name, session.space_name) && (
            <span className="inline-block ml-1 px-1.5 py-0.5 rounded text-[10px] font-normal bg-[#fafbfc] text-[#787f88]">{getRoomLabel(session.space_id, session.room_id, spaces, session.room_name, session.space_name)}</span>
          )}
          {session.activity_mode && session.activity_mode !== "线下" && (
            <span className="inline-block ml-1 px-1.5 py-0.5 rounded text-[10px] font-normal bg-[#fafbfc] text-[#787f88]">线上</span>
          )}
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
const GcsDialog = memo(({ open, date, spaces, allCustomers, achieverCustomers, session, defaultSpaceId, onClose, onSaved }: {
  open: boolean; date: string; spaces: Space[]; allCustomers: CustomerLight[]
  achieverCustomers: CustomerLight[]; session?: GroupCaseSession | null; defaultSpaceId?: string; onClose: () => void
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
  const [formAchieverId, setFormAchieverId] = useState("")
  const [formAchieverName, setFormAchieverName] = useState("")
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
        setFormAchieverId(session.achiever_id || ""); setFormAchieverName(session.achiever_name || "")
        setFormDescription(session.description || "")
        setFormActivityMode(session.activity_mode || "线下")
        setSpaceId(session.space_id || (spaces[0]?.id || ""))
        setRoomId(session.room_id || "")
        setSearchKeyword(""); setOwnerRemaining(null)
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
        const results = await groupCaseSessionApi.searchCustomers(searchKeyword)
        if (fetchId !== remainingFetchRef.current) return
        const map: Record<string, number> = {}
        results.forEach(r => { map[r.id] = r.remaining })
        setRemainingMap(map)
      } catch {}
    }, 200)
    return () => clearTimeout(timer)
  }, [searchKeyword, formOwnerId])

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
        achiever_id: formAchieverId || undefined, achiever_name: formAchieverName || undefined,
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
              <SelectDropdown
                className="w-[122px]"
                value={spaceId}
                options={spaces.map(s => ({value: s.id, label: s.name}))}
                placeholder="选择空间"
                onChange={(v) => { setSpaceId(v); setRoomId(spaces.find(s => s.id === v)?.rooms?.[0]?.id || "") }}
              />
              <SelectDropdown
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
            <SelectDropdown
              value={formActivityMode}
              options={[{value: "线下", label: "线下"}, {value: "线上", label: "线上"}]}
              onChange={setFormActivityMode}
            />
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
                  }}
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
              {searchKeyword.trim().length > 0 && (() => {
                const kw = searchKeyword.trim().toLowerCase()
                const filtered = allCustomers.filter(c =>
                  (c.nickname || "").toLowerCase().includes(kw) || (c.name || "").toLowerCase().includes(kw)
                ).sort((a, b) => {
                  const ra = remainingMap[a.id]; const rb = remainingMap[b.id]
                  const sa = ra !== undefined && ra > 0 ? 0 : ra !== undefined && ra <= 0 ? 1 : 2
                  const sb = rb !== undefined && rb > 0 ? 0 : rb !== undefined && rb <= 0 ? 1 : 2
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
            <SelectDropdown
              value={formAchieverId}
              options={achieverCustomers.filter(c => c.id !== formOwnerId).map(c => ({value: c.id, label: c.nickname || c.name || ""}))}
              placeholder="选择成就君"
              onChange={(v) => { setFormAchieverId(v); setFormAchieverName(achieverCustomers.find(c => c.id === v)?.nickname || achieverCustomers.find(c => c.id === v)?.name || "") }}
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
          <Button size="sm" onClick={handleSave} disabled={saving || !formOwnerId}>{saving ? "保存中..." : "保存"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
})

// ===== ERS Dialog (独立组件) =====
const ErsDialog = memo(({ open, date, spaces, allCustomers, achieverCustomers, session, defaultSpaceId, onClose, onSaved }: {
  open: boolean; date: string; spaces: Space[]; allCustomers: CustomerLight[]
  achieverCustomers: CustomerLight[]; session?: EmotionalReleaseSession | null; defaultSpaceId?: string; onClose: () => void
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
  const [formAchieverId, setFormAchieverId] = useState("")
  const [formAchieverName, setFormAchieverName] = useState("")
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
        setFormAchieverId(session.achiever_id || ""); setFormAchieverName(session.achiever_name || "")
        setFormDescription(session.description || "")
        setFormActivityMode(session.activity_mode || "线下")
        setSpaceId(session.space_id || (spaces[0]?.id || ""))
        setRoomId(session.room_id || "")
        setSearchKeyword(""); setOwnerRemaining(null)
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
        const results = await emotionalReleaseSessionApi.searchCustomers(searchKeyword)
        if (fetchId !== remainingFetchRef.current) return
        const map: Record<string, number> = {}
        results.forEach(r => { map[r.id] = r.remaining })
        setRemainingMap(map)
      } catch {}
    }, 200)
    return () => clearTimeout(timer)
  }, [searchKeyword, formOwnerId])

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
        achiever_id: formAchieverId || undefined, achiever_name: formAchieverName || undefined,
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
            <SelectDropdown
              value={formActivityMode}
              options={[{value: "线下", label: "线下"}, {value: "线上", label: "线上"}]}
              onChange={setFormActivityMode}
            />
          </div>
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
              <SelectDropdown
                className="w-[122px]"
                value={spaceId}
                options={spaces.map(s => ({value: s.id, label: s.name}))}
                placeholder="选择空间"
                onChange={(v) => { setSpaceId(v); setRoomId(spaces.find(s => s.id === v)?.rooms?.[0]?.id || "") }}
              />
              <SelectDropdown
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
            <SelectDropdown
              value={formActivityMode}
              options={[{value: "线下", label: "线下"}, {value: "线上", label: "线上"}]}
              onChange={setFormActivityMode}
            />
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
                  }}
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
              {searchKeyword.trim().length > 0 && (() => {
                const kw = searchKeyword.trim().toLowerCase()
                const filtered = allCustomers.filter(c =>
                  (c.nickname || "").toLowerCase().includes(kw) || (c.name || "").toLowerCase().includes(kw)
                ).sort((a, b) => {
                  const ra = remainingMap[a.id]; const rb = remainingMap[b.id]
                  const sa = ra !== undefined && ra > 0 ? 0 : ra !== undefined && ra <= 0 ? 1 : 2
                  const sb = rb !== undefined && rb > 0 ? 0 : rb !== undefined && rb <= 0 ? 1 : 2
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
            <SelectDropdown
              value={formAchieverId}
              options={achieverCustomers.filter(c => c.id !== formOwnerId).map(c => ({value: c.id, label: c.nickname || c.name || ""}))}
              placeholder="选择成就君"
              onChange={(v) => { setFormAchieverId(v); setFormAchieverName(achieverCustomers.find(c => c.id === v)?.nickname || achieverCustomers.find(c => c.id === v)?.name || "") }}
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
          <Button size="sm" onClick={handleSave} disabled={saving || !formOwnerId}>{saving ? "保存中..." : "保存"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
})

// ===== OCR Dialog (独立组件) =====
const OcrDialog = memo(({ open, date, spaces, allCustomers, achieverCustomers, session, defaultSpaceId, onClose, onSaved }: {
  open: boolean; date: string; spaces: Space[]; allCustomers: CustomerLight[]
  achieverCustomers: CustomerLight[]; session?: OhCardReadingSession | null; defaultSpaceId?: string; onClose: () => void
  onSaved: (record: OhCardReadingSession) => void
}) => {
  const enterToNext = useEnterToNext()
  const [editingRecord, setEditingRecord] = useState<OhCardReadingSession | null>(null)
  const [saving, setSaving] = useState(false)
  const [formDate, setFormDate] = useState(date)
  const [formStartTime, setFormStartTime] = useState("09:00")
  const [formEndTime, setFormEndTime] = useState("10:00")
  const [formOwnerId, setFormOwnerId] = useState("")
  const [formOwnerName, setFormOwnerName] = useState("")
  const [formAchieverId, setFormAchieverId] = useState("")
  const [formAchieverName, setFormAchieverName] = useState("")
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
        setFormAchieverId(session.achiever_id || ""); setFormAchieverName(session.achiever_name || "")
        setFormDescription(session.description || "")
        setFormActivityMode(session.activity_mode || "线下")
        setSpaceId(session.space_id || (spaces[0]?.id || ""))
        setRoomId(session.room_id || "")
        setSearchKeyword(""); setOwnerRemaining(null)
        if (session.owner_id && session.owner_name) {
          ohCardReadingSessionApi.searchCustomers(session.owner_name).then(results => {
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
        const results = await ohCardReadingSessionApi.searchCustomers(searchKeyword)
        if (fetchId !== remainingFetchRef.current) return
        const map: Record<string, number> = {}
        results.forEach(r => { map[r.id] = r.remaining })
        setRemainingMap(map)
      } catch {}
    }, 200)
    return () => clearTimeout(timer)
  }, [searchKeyword, formOwnerId])

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
        achiever_id: formAchieverId || undefined, achiever_name: formAchieverName || undefined,
        activity_mode: formActivityMode,
        space_id: spaceId || undefined, room_id: roomId || undefined,
        room_name: (spaces.find(s => s.id === spaceId)?.rooms || []).find(r => r.id === roomId)?.name || "",
        space_name: spaces.find(s => s.id === spaceId)?.name || "",
      }
      let result: OhCardReadingSession
      if (editingRecord) {
        result = await ohCardReadingSessionApi.update(editingRecord.id, data)
      } else {
        result = await ohCardReadingSessionApi.create(data)
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
          <DialogTitle className="text-[15px]">{editingRecord ? "编辑OH卡梳理" : "新增OH卡梳理"}</DialogTitle>
        </DialogHeader>
        <div className="px-6 py-5 space-y-5" {...enterToNext}>
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
              <SelectDropdown
                className="w-[122px]"
                value={spaceId}
                options={spaces.map(s => ({value: s.id, label: s.name}))}
                placeholder="选择空间"
                onChange={(v) => { setSpaceId(v); setRoomId(spaces.find(s => s.id === v)?.rooms?.[0]?.id || "") }}
              />
              <SelectDropdown
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
            <SelectDropdown
              value={formActivityMode}
              options={[{value: "线下", label: "线下"}, {value: "线上", label: "线上"}]}
              onChange={setFormActivityMode}
            />
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
                  }}
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
              {searchKeyword.trim().length > 0 && (() => {
                const kw = searchKeyword.trim().toLowerCase()
                const filtered = allCustomers.filter(c =>
                  (c.nickname || "").toLowerCase().includes(kw) || (c.name || "").toLowerCase().includes(kw)
                ).sort((a, b) => {
                  const ra = remainingMap[a.id]; const rb = remainingMap[b.id]
                  const sa = ra !== undefined && ra > 0 ? 0 : ra !== undefined && ra <= 0 ? 1 : 2
                  const sb = rb !== undefined && rb > 0 ? 0 : rb !== undefined && rb <= 0 ? 1 : 2
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
            <SelectDropdown
              value={formAchieverId}
              options={achieverCustomers.filter(c => c.id !== formOwnerId).map(c => ({value: c.id, label: c.nickname || c.name || ""}))}
              placeholder="选择成就君"
              onChange={(v) => { setFormAchieverId(v); setFormAchieverName(achieverCustomers.find(c => c.id === v)?.nickname || achieverCustomers.find(c => c.id === v)?.name || "") }}
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
        setFormHostIds([]); setFormHostNames([])
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
      setSearchKeyword("")}
  }, [open, date, spaces, session, defaultSpaceId])

  useEffect(() => {
    if (!searchKeyword.trim()) return
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
  }, [searchKeyword])

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
    if (remaining !== undefined && remaining !== -1 && remaining <= 0) {
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
      setFormOwnerIds([...formOwnerIds, pendingOwner.id])
      setFormOwnerNames([...formOwnerNames, pendingOwner.nickname])
      setFormOwnerDescriptions([...formOwnerDescriptions, { id: pendingOwner.id, name: pendingOwner.nickname, description: "", count: 1 }])
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
              <SelectDropdown
                className="w-[122px]"
                value={spaceId}
                options={spaces.map(s => ({value: s.id, label: s.name}))}
                placeholder="选择空间"
                onChange={(v) => { setSpaceId(v); setRoomId(spaces.find(s => s.id === v)?.rooms?.[0]?.id || "") }}
              />
              <SelectDropdown
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
            <SelectDropdown
              value={formActivityMode}
              options={[{value: "线下", label: "线下"}, {value: "线上", label: "线上"}]}
              onChange={setFormActivityMode}
            />
          </div>
          <div className="grid grid-cols-[70px_1fr] items-center gap-3">
            <span className="text-[12px] text-[#8f959e] text-right">案主</span>
            <div data-dropdown className="relative" onMouseDown={(e) => e.stopPropagation()}>
              <Input
                ref={searchInputRef}
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                placeholder="选择案主"
                className="h-8 text-[12px]"
                autoComplete="off"
              />
              {searchKeyword.trim().length > 0 && (() => {
                const kw = searchKeyword.trim().toLowerCase()
                const filtered = allCustomers.filter(c =>
                  (c.nickname || "").toLowerCase().includes(kw) || (c.name || "").toLowerCase().includes(kw)
                ).sort((a, b) => {
                  const ra = remainingMap[a.id]; const rb = remainingMap[b.id]
                  const sa = ra !== undefined && ra > 0 ? 0 : ra !== undefined && ra <= 0 ? 1 : 2
                  const sb = rb !== undefined && rb > 0 ? 0 : rb !== undefined && rb <= 0 ? 1 : 2
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
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-[12px] font-medium shrink-0">{name}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-[11px] text-[#8f959e]">部位数</span>
                      <Input
                        type="number"
                        min={1}
                        value={formOwnerDescriptions[i]?.count ?? 1}
                        onChange={(e) => {
                          const next = [...formOwnerDescriptions]
                          next[i] = { ...next[i], count: Math.max(1, parseInt(e.target.value) || 1) }
                          setFormOwnerDescriptions(next)
                        }}
                        className="w-9 h-7 text-[12px] text-center"
                      />
                    </div>
                    <Input
                      placeholder="情况介绍..."
                      value={formOwnerDescriptions[i]?.description || ""}
                      onChange={(e) => {
                        const next = [...formOwnerDescriptions]
                        next[i] = { ...next[i], description: e.target.value }
                        setFormOwnerDescriptions(next)
                      }}
                      className="flex-1 h-7 text-[12px]"
                    />
                    <button className="shrink-0" onClick={() => {
                      setFormOwnerIds(formOwnerIds.filter((_, j) => j !== i))
                      setFormOwnerNames(formOwnerNames.filter((_, j) => j !== i))
                      setFormOwnerDescriptions(formOwnerDescriptions.filter((_, j) => j !== i))
                    }}><X className="h-3 w-3 text-[#8f959e]" /></button>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="grid grid-cols-[70px_1fr] items-start gap-3">
            <span className="text-[12px] text-[#8f959e] text-right pt-2">能量结老师</span>
            <SelectDropdown
              value={formHostIds}
              options={hostCustomers.map(c => ({value: c.id, label: c.nickname || c.name || ""}))}
              placeholder="选择能量结老师"
              onChange={(v) => {
                const ids = Array.isArray(v) ? v : [v]
                setFormHostIds(ids)
                setFormHostNames(ids.map(id => hostCustomers.find(c => c.id === id)?.nickname || hostCustomers.find(c => c.id === id)?.name || "").filter(Boolean))
              }}
              multi={true}
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
        setFormHostId(""); setFormHostName("")
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
      const hostIds = formHostId ? [formHostId] : []
      const hostNames = formHostName ? [formHostName] : []
      const data = {
        date: formDate, start_time: formStartTime || null, end_time: formEndTime || null,
        course_type: formCourseType, course_name: formCourseName,
        course_description: formDescription || undefined,
        host_ids: hostIds, host_names: hostNames,
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
              <SelectDropdown
                className="w-[122px]"
                value={spaceId}
                options={spaces.map(s => ({value: s.id, label: s.name}))}
                placeholder="选择空间"
                onChange={(v) => { setSpaceId(v); setRoomId(spaces.find(s => s.id === v)?.rooms?.[0]?.id || "") }}
              />
              <SelectDropdown
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
            <SelectDropdown
              value={formCourseType}
              options={ICS_COURSE_TYPES.map(t => ({value: t, label: t}))}
              onChange={(v) => setFormCourseType(v)}
            />
          </div>
          <div className="grid grid-cols-[70px_1fr] items-center gap-3">
            <span className="text-[12px] text-[#8f959e] text-right">课程名称</span>
            <Input value={formCourseName} onChange={(e) => setFormCourseName(e.target.value)} className="h-8 text-[12px]" placeholder="输入课程名称" />
          </div>
          <div className="grid grid-cols-[70px_1fr] items-center gap-3">
            <span className="text-[12px] text-[#8f959e] text-right">活动方式</span>
            <SelectDropdown
              value={formActivityMode}
              options={[{value: "线下", label: "线下"}, {value: "线上", label: "线上"}]}
              onChange={setFormActivityMode}
            />
          </div>
          <div className="grid grid-cols-[70px_1fr] items-center gap-3">
            <span className="text-[12px] text-[#8f959e] text-right">课程老师</span>
            <SelectDropdown
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
  open: boolean; date: string; spaces: Space[]; courses: Course[]
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
        setFormCourseId(session.course_id)
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
              <SelectDropdown
                className="w-[122px]"
                value={spaceId}
                options={spaces.map(s => ({value: s.id, label: s.name}))}
                placeholder="选择空间"
                onChange={(v) => { setSpaceId(v); setRoomId(spaces.find(s => s.id === v)?.rooms?.[0]?.id || "") }}
              />
              <SelectDropdown
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
            <SelectDropdown
              value={formCourseId}
              options={courses.map(c => ({value: c.id, label: c.name}))}
              placeholder="选择课程"
              onChange={(v) => setFormCourseId(v)}
            />
          </div>
          <div className="grid grid-cols-[70px_1fr] items-center gap-3">
            <span className="text-[12px] text-[#8f959e] text-right">活动方式</span>
            <SelectDropdown
              value={formActivityMode}
              options={[{value: "线下", label: "线下"}, {value: "线上", label: "线上"}]}
              onChange={setFormActivityMode}
            />
          </div>
          <div className="grid grid-cols-[70px_1fr] items-start gap-3">
            <span className="text-[12px] text-[#8f959e] text-right pt-2">老师</span>
            <SelectDropdown
              value={formTeacherIds}
              options={teachers.map(c => ({value: c.id, label: c.nickname || c.name || ""}))}
              placeholder="选择老师"
              onChange={(v) => setFormTeacherIds(Array.isArray(v) ? v : [v])}
              multi={true}
            />
          </div>
          <div className="grid grid-cols-[70px_1fr] items-center gap-3">
            <span className="text-[12px] text-[#8f959e] text-right">公益</span>
            <SelectDropdown
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
            className={`shrink-0 flex flex-col items-center justify-center w-10 h-12 rounded-md transition-colors ${
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

const ActivityCardList = memo(({ records, callbacks }: {
  records: { type: "class" | "gcs" | "ers" | "eks" | "ics" | "ocr"; data: any }[]
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
        return <SalonCard key={`class-${(ur.data as ClassRecord).id}`} record={ur.data as ClassRecord} teachers={callbacks.teachers} spaces={callbacks.spaces} courseMap={callbacks.courseMap} onEdit={callbacks.onEditClass} onDelete={callbacks.onDeleteClass} onMaterials={callbacks.onMaterialsClass} />
      }
      if (ur.type === "gcs") {
        return <GcsCard key={`gcs-${(ur.data as GroupCaseSession).id}`} session={ur.data as GroupCaseSession} spaces={callbacks.spaces} onEdit={callbacks.onEditGcs} onDelete={callbacks.onDeleteGcs} onMaterials={callbacks.onMaterialsGcs} />
      }
      if (ur.type === "ers") {
        return <ErsCard key={`ers-${(ur.data as EmotionalReleaseSession).id}`} session={ur.data as EmotionalReleaseSession} spaces={callbacks.spaces} onEdit={callbacks.onEditErs} onDelete={callbacks.onDeleteErs} />
      }
      if (ur.type === "eks") {
        return <EksCard key={`eks-${(ur.data as EnergyKnotSession).id}`} session={ur.data as EnergyKnotSession} spaces={callbacks.spaces} onEdit={callbacks.onEditEks} onDelete={callbacks.onDeleteEks} />
      }
      if (ur.type === "ics") {
        return <IcsCard key={`ics-${(ur.data as InternalCourseSession).id}`} session={ur.data as InternalCourseSession} spaces={callbacks.spaces} onEdit={callbacks.onEditIcs} onDelete={callbacks.onDeleteIcs} onMaterials={callbacks.onMaterialsIcs} />
      }
      if (ur.type === "ocr") {
        return <OcrCard key={`ocr-${(ur.data as OhCardReadingSession).id}`} session={ur.data as OhCardReadingSession} spaces={callbacks.spaces} onEdit={callbacks.onEditOcr} onDelete={callbacks.onDeleteOcr} onMaterials={callbacks.onMaterialsOcr} />
      }
      return null
    })}
    {visibleCount < records.length && (
      <div ref={sentinelRef} className="h-4" />
    )}
  </div>
  )
})

// ===== WeekThemeDialog =====
const WeekThemeDialog = memo(({ open, weekIndex, weekDays, themeMap, spaces, onClose, onSaved }: {
  open: boolean
  weekIndex: number
  weekDays: { date: string; weekday: string }[]
  themeMap: Map<string, ActivityTheme>
  spaces: Space[]
  onClose: () => void
  onSaved: (themes: { date: string; space_id: string; week_theme: string; day_theme: string }[]) => Promise<void>
}) => {
  const [weekTheme, setWeekTheme] = useState("")
  const [dayThemes, setDayThemes] = useState<Record<string, string>>({})
  const [selectedSpaceIds, setSelectedSpaceIds] = useState<string[]>([])
  const [spaceDropdownOpen, setSpaceDropdownOpen] = useState(false)
  const spaceDropdownRef = useRef<HTMLDivElement>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!spaceDropdownOpen) return
    const h = (e: MouseEvent) => {
      if (spaceDropdownRef.current && !spaceDropdownRef.current.contains(e.target as Node)) {
        setSpaceDropdownOpen(false)
      }
    }
    document.addEventListener("mousedown", h)
    return () => document.removeEventListener("mousedown", h)
  }, [spaceDropdownOpen])

  useEffect(() => {
    if (open) {
      const firstTheme = themeMap.get(weekDays[0]?.date || "")
      setWeekTheme(firstTheme?.week_theme || "")
      const dt: Record<string, string> = {}
      for (const day of weekDays) {
        dt[day.date] = themeMap.get(day.date)?.day_theme || ""
      }
      setDayThemes(dt)
      // 初始化已选空间：从当前主题的 space_id 读取
      const spaceIds = new Set<string>()
      for (const day of weekDays) {
        const t = themeMap.get(day.date)
        if (t?.space_id) spaceIds.add(t.space_id)
      }
      setSelectedSpaceIds(Array.from(spaceIds))
    }
  }, [open, weekDays, themeMap])

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
          date: day.date, space_id: sid, week_theme: weekTheme, day_theme: dayThemes[day.date] || "",
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
      <DialogContent className="max-w-sm p-0 gap-0" initialFocus={false}>
        <DialogHeader className="px-6 pt-5 pb-4 border-b">
          <DialogTitle className="text-[15px]">第{weekIndex + 1}周 {dateRangeLabel}</DialogTitle>
        </DialogHeader>
        <div className="px-6 py-5 space-y-5">
          <div className="grid grid-cols-[80px_1fr] items-start gap-3">
            <span className="text-[12px] text-[#8f959e] text-right font-light pt-2">所属空间</span>
            <div className="space-y-1.5">
              <div ref={spaceDropdownRef} className="relative">
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
                  <div className="absolute top-full left-0 mt-1 w-full bg-white rounded-md border border-[#e8e8e8] shadow-lg z-50 max-h-[200px] overflow-y-auto">
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
          <div className="grid grid-cols-[80px_1fr] items-center gap-3">
            <span className="text-[12px] text-[#8f959e] text-right font-light">周主题</span>
            <Input
              value={weekTheme}
              onChange={(e) => setWeekTheme(e.target.value)}
              placeholder="输入本周主题"
              className="h-8 text-[12px]"
            />
          </div>
          <div className="space-y-3">
            <span className="text-[12px] text-[#8f959e] font-light">每日主题</span>
            <div className="space-y-2">
              {weekDays.map((day) => (
                <div key={day.date} className="grid grid-cols-[80px_1fr] items-center gap-3">
                  <span className="text-[12px] text-[#8f959e] text-right font-light">
                    {day.date.split("-").slice(1).join("/")} 周{day.weekday}
                  </span>
                  <Input
                    value={dayThemes[day.date] || ""}
                    onChange={(e) => setDayThemes(prev => ({ ...prev, [day.date]: e.target.value }))}
                    placeholder="输入每日主题"
                    className="h-8 text-[12px]"
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

export default function DailyActivitiesPage() {
  const navigate = useNavigate()
  // ===== Core state =====
  const [detailDate, setDetailDate] = useState(today)
  const [monthPickerOpen, setMonthPickerOpen] = useState(false)
  const [dateRangeStart, setDateRangeStart] = useState(() => formatDate(addDays(new Date(), -7)))
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [allCustomers, setAllCustomers] = useState<CustomerLight[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [teachers, setTeachers] = useState<CustomerLight[]>([])
  const [calendarCounts, setCalendarCounts] = useState<Record<string, number>>({})
  const [spaces, setSpaces] = useState<Space[]>([])
  const [noSpacesDialogOpen, setNoSpacesDialogOpen] = useState(false)
  const [selectedSpaceId, setSelectedSpaceId] = useState(() => {
    try { return localStorage.getItem("selected-space-id") || "" } catch { return "" }
  })
  // Activity data (5 types from dashboard)
  const [detailRecords, setDetailRecords] = useState<ClassRecord[]>([])
  const [detailGcsSessions, setDetailGcsSessions] = useState<GroupCaseSession[]>([])
  const [detailErsSessions, setDetailErsSessions] = useState<EmotionalReleaseSession[]>([])
  const [detailEksSessions, setDetailEksSessions] = useState<EnergyKnotSession[]>([])
  const [detailIcsSessions, setDetailIcsSessions] = useState<InternalCourseSession[]>([])
  const [detailOcrSessions, setDetailOcrSessions] = useState<OhCardReadingSession[]>([])

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

  // ===== OCR dialog state =====
  const [ocrDialogOpen, setOcrDialogOpen] = useState(false)
  const [ocrEditSession, setOcrEditSession] = useState<OhCardReadingSession | null>(null)
  const [ocrDeleteId, setOcrDeleteId] = useState<string | null>(null)
  const [ocrMaterialsDialogOpen, setOcrMaterialsDialogOpen] = useState(false)
  const [ocrMaterialsRecord, setOcrMaterialsRecord] = useState<OhCardReadingSession | null>(null)


  // ===== Warning dialog =====
  const [warningOpen, setWarningOpen] = useState(false)
  const [warningMsg, setWarningMsg] = useState("")

  // ===== Theme state =====
  const [themes, setThemes] = useState<ActivityTheme[]>([])
  const [themeEditWeekIndex, setThemeEditWeekIndex] = useState<number | null>(null)

  const themeMonthStart = useMemo(() => {
    const d = new Date(detailDate)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`
  }, [detailDate])
  const themeMonthEnd = useMemo(() => {
    const d = new Date(detailDate)
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`
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

  // 加载主题（按空间筛选）
  useEffect(() => {
    const spaceFilter = selectedSpaceId ? [selectedSpaceId] : undefined
    activityThemeApi.list(themeMonthStart, themeMonthEnd, spaceFilter).then(setThemes).catch(() => setThemes([]))
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

  const saveBatchThemes = async (themes: { date: string; space_id: string; week_theme: string; day_theme: string }[]) => {
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
  const dateRange = Array.from({ length: 21 }, (_, i) => formatDate(addDays(new Date(dateRangeStart), i)))

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
      ...detailOcrSessions.map(s => ({ type: "ocr" as const, data: s })),
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
  }, [detailRecords, detailGcsSessions, detailErsSessions, detailEksSessions, detailIcsSessions, detailOcrSessions, selectedSpaceId])

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
      const dashboard = await classRecordApi.dashboard(date, selectedSpaceId || undefined)
      const { class_records: records, gcs_sessions: gcs, ers_sessions: ers, eks_sessions: eks, ics_sessions: ics, ocr_sessions: ocr } = dashboard

      setDetailRecords(records)
      setDetailGcsSessions(gcs)
      setDetailErsSessions(ers)
      setDetailEksSessions(eks)
      setDetailIcsSessions(ics)
      setDetailOcrSessions(ocr || [])
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
      for (const s of (ocr || [])) {
        if (s.owner_id) ids.add(s.owner_id)
        if (s.achiever_id) ids.add(s.achiever_id)
        if (s.host_id) ids.add(s.host_id)
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

  // ===== useCallback 稳定 onClose/onSaved 引用，避免 memo 子组件无效重渲染 =====
  const handleSalonClose = useCallback(() => { setDialogOpen(false) }, [])
  const handleGcsClose = useCallback(() => { setGcsDialogOpen(false) }, [])
  const handleErsClose = useCallback(() => { setErsDialogOpen(false) }, [])
  const handleEksClose = useCallback(() => { setEksDialogOpen(false) }, [])
  const handleIcsClose = useCallback(() => { setIcsDialogOpen(false) }, [])
  const handleOcrClose = useCallback(() => { setOcrDialogOpen(false) }, [])

  const handleSalonSaved = useCallback((record: ClassRecord) => {
    setDetailRecords(prev => prev.some(r => r.id === record.id) ? prev.map(r => r.id === record.id ? record : r) : [record, ...prev])
    setCalendarCounts(prev => ({ ...prev, [record.date]: (prev[record.date] || 0) + 1 }))
    setDialogOpen(false)
  }, [])
  const handleGcsSaved = useCallback((record: GroupCaseSession) => {
    setDetailGcsSessions(prev => prev.some(r => r.id === record.id) ? prev.map(r => r.id === record.id ? record : r) : [record, ...prev])
    setCalendarCounts(prev => ({ ...prev, [record.date]: (prev[record.date] || 0) + 1 }))
    setGcsDialogOpen(false)
  }, [])
  const handleErsSaved = useCallback((record: EmotionalReleaseSession) => {
    setDetailErsSessions(prev => prev.some(r => r.id === record.id) ? prev.map(r => r.id === record.id ? record : r) : [record, ...prev])
    setCalendarCounts(prev => ({ ...prev, [record.date]: (prev[record.date] || 0) + 1 }))
    setErsDialogOpen(false)
  }, [])
  const handleEksSaved = useCallback((record: EnergyKnotSession) => {
    setDetailEksSessions(prev => prev.some(r => r.id === record.id) ? prev.map(r => r.id === record.id ? record : r) : [record, ...prev])
    setCalendarCounts(prev => ({ ...prev, [record.date]: (prev[record.date] || 0) + 1 }))
    setEksDialogOpen(false)
  }, [])
  const handleIcsSaved = useCallback((record: InternalCourseSession) => {
    setDetailIcsSessions(prev => prev.some(r => r.id === record.id) ? prev.map(r => r.id === record.id ? record : r) : [record, ...prev])
    setCalendarCounts(prev => ({ ...prev, [record.date]: (prev[record.date] || 0) + 1 }))
    setIcsDialogOpen(false)
  }, [])
  const handleOcrSaved = useCallback((record: OhCardReadingSession) => {
    setDetailOcrSessions(prev => prev.some(r => r.id === record.id) ? prev.map(r => r.id === record.id ? record : r) : [record, ...prev])
    setCalendarCounts(prev => ({ ...prev, [record.date]: (prev[record.date] || 0) + 1 }))
    setOcrDialogOpen(false)
  }, [])

  const load = () => {
    courseApi.list().then(setCourses).catch(() => {})
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
        setTeachers(customers.filter(c => c.positions?.includes("课程老师")))
      })
      .catch(() => {})
  }

  useEffect(() => { load() }, [])
  useEffect(() => { loadDateData(detailDate) }, [detailDate, selectedSpaceId])

  const handleSpaceSelect = useCallback((id: string) => {
    startTransition(() => {
      setSelectedSpaceId(id)
    })
    localStorage.setItem("selected-space-id", id)
  }, [])

  // 新增活动类型选择下拉
  const [addMenuOpen, setAddMenuOpen] = useState(false)

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

  // ===== OCR handlers =====
  const handleOpenOcrCreate = (date?: string) => {
    setOcrEditSession(null)
    setOcrDialogOpen(true)
  }

  const handleOpenOcrEdit = useCallback((session: OhCardReadingSession) => {
    setOcrEditSession(session)
    setOcrDialogOpen(true)
  }, [])

  const handleOcrDelete = async () => {
    if (!ocrDeleteId) return
    try {
      await ohCardReadingSessionApi.delete(ocrDeleteId)
      setOcrDeleteId(null)
      loadDateData(detailDate)
    } catch (e) { handleApiError(e) }
  }

  const handleOpenOcrMaterials = useCallback((session: OhCardReadingSession) => {
    setOcrMaterialsRecord(session)
    setOcrMaterialsDialogOpen(true)
  }, [])

  const handleUploadOcrMaterial = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !ocrMaterialsRecord) return
    setUploading(true)
    try {
      const material = await uploadApi.uploadMaterial(file)
      const newMaterials = [...(ocrMaterialsRecord.materials || []), material]
      await ohCardReadingSessionApi.update(ocrMaterialsRecord.id, { materials: newMaterials } as any)
      setOcrMaterialsRecord({ ...ocrMaterialsRecord, materials: newMaterials })
      loadDateData(detailDate)
    } catch { alert("上传失败，请重试") }
    finally { setUploading(false); e.target.value = "" }
  }

  const handleDeleteOcrMaterial = async (filename: string) => {
    if (!ocrMaterialsRecord) return
    try {
      await uploadApi.deleteMaterial(filename)
      const newMaterials = (ocrMaterialsRecord.materials || []).filter(m => !m.url.includes(filename))
      await ohCardReadingSessionApi.update(ocrMaterialsRecord.id, { materials: newMaterials } as any)
      setOcrMaterialsRecord({ ...ocrMaterialsRecord, materials: newMaterials })
      loadDateData(detailDate)
    } catch {}
  }

  // ===== Render helpers =====
  const courseMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const c of courses) map[c.id] = c.name
    return map
  }, [courses])

  const cardCallbacks = useMemo(() => ({
    teachers,
    spaces,
    courseMap,
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
    onEditOcr: handleOpenOcrEdit,
    onDeleteOcr: setOcrDeleteId,
    onMaterialsOcr: handleOpenOcrMaterials,
  } as CardCallbacks), [teachers, spaces, courseMap, handleOpenEdit, handleOpenMaterials, handleOpenGcsEdit, handleOpenGcsMaterials, handleOpenErsEdit, handleOpenEksEdit, handleOpenIcsEdit, handleOpenIcsMaterials, handleOpenOcrEdit, handleOpenOcrMaterials])

  // ===== JSX =====
  return (
    <div className="px-6 pt-4 pb-6 flex flex-col min-h-0" style={{ height: 'calc(100vh - 48px)' }}>
      <div className="flex flex-col min-h-0 flex-1 gap-2">
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
        </div>

        {/* 周视图日历 */}
        <div className="border border-[#e8e8e8] rounded overflow-x-auto">
          <table className="border-collapse" style={{ tableLayout: "fixed", width: "100%", minWidth: "600px" }}>
            <colgroup>
              <col style={{ width: "80px" }} />
              {Array.from({ length: 7 }, (_, i) => <col key={i} style={{ width: `${(100 - 13.33) / 7}%` }} />)}
            </colgroup>
            <thead>
              <tr className="bg-[#f8faff]">
                <th className="px-2 py-1.5 text-center text-[12px] text-[#8f959e] font-normal" style={{ borderRight: "0.5px solid #f0f0f0" }}>周主题</th>
                {["一", "二", "三", "四", "五", "六", "日"].map(d => (
                  <th key={d} className="px-1 py-1.5 text-center text-[11px] text-[#8f959e] font-normal">{d}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {themeWeeks.flatMap((week, wi) => {
                const firstTheme = themeMap.get(week.days[0]?.date || "")
                const weekThemeText = firstTheme?.week_theme || ""
                const isLastWeek = wi === themeWeeks.length - 1
                const dateRow = (
                  <tr key={`date-${wi}`}>
                    <td
                      rowSpan={2}
                      className="px-2 text-center text-[12px] text-[#2b2f36] cursor-pointer hover:bg-[#f0f5ff] overflow-hidden text-ellipsis whitespace-nowrap"
                      style={{ height: "28px", borderRight: "0.5px solid #f0f0f0", borderBottom: isLastWeek ? "none" : "0.5px solid #f0f0f0" }}
                      onClick={() => { if (spaces.length === 0) { setNoSpacesDialogOpen(true); return } setThemeEditWeekIndex(wi) }}
                    >
                      {weekThemeText}
                    </td>
                    {week.days.map((day) => {
                      const dayNum = day.date.split("-")[2].replace(/^0/, "")
                      const isSelected = day.date === detailDate
                      const isToday = day.date === today
                      return (
                        <td
                          key={`date-${day.date}`}
                          className={`px-1 text-center text-[10px] cursor-pointer transition-colors ${
                            !day.inMonth ? "bg-[#fafafa]" : isToday ? "bg-[#f0f5ff] text-[#3370ff]" : "bg-[#fafafa] text-[#b0b5bb]"
                          }`}
                          style={{ height: "20px" }}
                          onClick={() => day.inMonth && setDetailDate(day.date)}
                        >
                          {day.inMonth ? <div className="relative w-full h-full flex flex-col items-center justify-center"><span className={`${(calendarCounts[day.date] || 0) > 0 ? "text-[#2b2f36]" : "text-[#b0b5bb]"}`}>{dayNum}</span>{(calendarCounts[day.date] || 0) > 0 && <span className="w-2 h-px bg-[#dde8ff] mt-px" />}</div> : ""}
                        </td>
                      )
                    })}
                  </tr>
                )
                const themeRow = (
                  <tr key={`theme-${wi}`}>
                    {week.days.map((day) => {
                      const dayTheme = themeMap.get(day.date)?.day_theme || ""
                      const isSelected = day.date === detailDate
                      return (
                        <td
                          key={`theme-${day.date}`}
                          className={`px-1 text-center text-[12px] cursor-pointer overflow-hidden text-ellipsis whitespace-nowrap ${
                            !day.inMonth ? "" : ""
                          }`}
                          style={{ height: "30px", borderBottom: isLastWeek ? "none" : "0.5px solid #f0f0f0", boxShadow: isSelected ? "inset 0 -1.5px 0 0 #a8c8ff" : "none" }}
                          onClick={() => day.inMonth && setDetailDate(day.date)}
                        >
                          {day.inMonth ? (dayTheme || "") : ""}
                        </td>
                      )
                    })}
                  </tr>
                )
                return [dateRow, themeRow]
              })}
            </tbody>
          </table>
        </div>

        {/* 新增按钮 */}
        <div className="flex items-center justify-between relative mt-2.5">
          <span className="text-[14px] font-medium text-[#2b2f36] pl-2">当日活动</span>
          <Button size="sm" className="text-xs" onClick={() => { if (spaces.length === 0) { setNoSpacesDialogOpen(true); return } setAddMenuOpen(!addMenuOpen) }}>
            <Plus className="mr-1 h-3.5 w-3.5" /> 新增 <ChevronDown className="ml-1 h-3 w-3" />
          </Button>
          {addMenuOpen && (
            <div className="absolute top-full right-0 mt-1 bg-white rounded-lg shadow-lg border border-[#e8e8e8] px-2 py-3 z-[100] w-[250px]">
              <div className="grid grid-cols-3 gap-0">
                {[
                  { label: "沙龙活动", icon: BookOpen, color: "#3370ff", bg: "#f8faff", onClick: () => handleOpenCreate(detailDate) },
                  { label: "觉醒游戏", icon: Sparkles, color: "#3370ff", bg: "#f8faff", onClick: () => handleOpenGcsCreate(detailDate) },
                  { label: "情绪释放", icon: Heart, color: "#3370ff", bg: "#f8faff", onClick: () => handleOpenErsCreate(detailDate) },
                  { label: "能量结", icon: Zap, color: "#3370ff", bg: "#f8faff", onClick: () => handleOpenEksCreate(detailDate) },
                  { label: "内部课程", icon: GraduationCap, color: "#3370ff", bg: "#f8faff", onClick: () => handleOpenIcsCreate(detailDate) },
                  { label: "OH卡梳理", icon: Layers, color: "#3370ff", bg: "#f8faff", onClick: () => handleOpenOcrCreate(detailDate) },
                ].map((item) => (
                  <button
                    key={item.label}
                    className="flex flex-col items-center gap-1 py-2 rounded-lg hover:bg-[#f7f8fa] transition-colors"
                    onClick={() => { item.onClick(); setAddMenuOpen(false) }}
                  >
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: item.bg }}>
                      <item.icon className="h-4.5 w-4.5" style={{ color: item.color }} />
                    </div>
                    <span className="text-[11px] text-[#2b2f36]">{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {addMenuOpen && (
            <div className="fixed inset-0 z-[99]" onClick={() => setAddMenuOpen(false)} />
          )}
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

      {/* ===== Theme Edit Dialog ===== */}
      {themeEditWeekIndex !== null && themeWeeks[themeEditWeekIndex] && (
        <WeekThemeDialog
          open={themeEditWeekIndex !== null}
          weekIndex={themeEditWeekIndex}
          weekDays={themeWeeks[themeEditWeekIndex].days.filter(d => d.inMonth)}
          themeMap={themeMap}
          spaces={spaces}
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
        achieverCustomers={achieverCustomers}
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
        achieverCustomers={achieverCustomers}
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

      {/* ===== OCR Dialog ===== */}
      <OcrDialog
        open={ocrDialogOpen}
        date={detailDate}
        spaces={spaces}
        allCustomers={allCustomers}
        achieverCustomers={achieverCustomers}
        session={ocrEditSession}
        defaultSpaceId={selectedSpaceId}
        onClose={handleOcrClose}
        onSaved={handleOcrSaved}
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

      {/* ===== OCR Delete Dialog ===== */}
      {!!ocrDeleteId && (
      <AlertDialog open={!!ocrDeleteId} onOpenChange={(open) => !open && setOcrDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除OH卡梳理</AlertDialogTitle>
            <AlertDialogDescription>确定要删除这条OH卡梳理记录吗？此操作不可撤销。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleOcrDelete}>删除</AlertDialogAction>
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

      {/* ===== OCR Materials Dialog ===== */}
      {ocrMaterialsDialogOpen && (
      <Dialog open={ocrMaterialsDialogOpen} onOpenChange={(open) => { if (!open) setOcrMaterialsDialogOpen(false) }}>
        <DialogContent className="max-w-md p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-4 border-b flex flex-row items-center justify-between">
            <DialogTitle className="text-[15px]">资料管理</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-4">
            {(ocrMaterialsRecord?.materials || []).length === 0 ? (
              <p className="text-[12px] text-[#8f959e] text-center py-4">暂无资料</p>
            ) : (
              <div className="space-y-2">
                {(ocrMaterialsRecord?.materials || []).map((m, i) => (
                  <div key={i} className="flex items-center gap-3 bg-gray-50 rounded px-3 py-2">
                    <File className="h-4 w-4 text-[#8f959e] shrink-0" />
                    <span className="text-[12px] text-[#2b2f36] truncate flex-1">{m.name || m.url.split("/").pop() || "文件"}</span>
                    <a href={m.url} target="_blank" rel="noreferrer"><Download className="h-4 w-4 text-[#8f959e] hover:text-[#3370ff]" /></a>
                    <button onClick={() => handleDeleteOcrMaterial(m.url.split("/").pop() || "")}><Trash2 className="h-4 w-4 text-destructive" /></button>
                  </div>
                ))}
              </div>
            )}
            <label className="flex items-center justify-center gap-2 h-10 rounded-md border border-dashed border-[#e8e8e8] text-[12px] text-[#8f959e] cursor-pointer hover:bg-[#f7f8fa]">
              <FileUp className="h-3.5 w-3.5" />
              {uploading ? "上传中..." : "上传文件"}
              <input type="file" className="hidden" onChange={handleUploadOcrMaterial} disabled={uploading} />
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

      {/* ===== 空间未配置提示 ===== */}
      <AlertDialog open={noSpacesDialogOpen} onOpenChange={setNoSpacesDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>提示</AlertDialogTitle>
            <AlertDialogDescription>需要先配置空间，才能配置活动和设置主题。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setNoSpacesDialogOpen(false); navigate("/courses/spaces") }}>
              前往配置
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
