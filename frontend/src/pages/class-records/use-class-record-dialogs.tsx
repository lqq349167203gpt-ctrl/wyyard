import { useState, useRef, useMemo, type ReactNode } from "react"
import { useEnterToNext } from "@/hooks/use-enter-to-next"
import { File, Download, Trash2, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { SelectDropdown } from "@/components/select-dropdown"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  classRecordApi, uploadApi, visitApi,
  type ClassRecord, type Customer, type CustomerSearchResult, type Course,
} from "@/lib/api"

interface DayVisit { id: string; nickname: string; member_type: string }
interface DailyGroup { name: string; leader_id: string; deputy_id: string; member_ids: string[] }

export interface ClassRecordActions {
  handleOpenEdit: (record: ClassRecord) => void
  handleOpenMaterials: (record: ClassRecord) => void
  handleOpenGroups: (record: ClassRecord) => void
  handleDropToClass: (record: ClassRecord, customer: { customer_id: string; nickname: string }) => void
  deleteId: string | null
  setDeleteId: (id: string | null) => void
}

interface UseClassRecordDialogsProps {
  allCustomers: Customer[]
  teachers: Customer[]
  courses: Course[]
  groups: DailyGroup[]
  draggingVisitorId: string | null
  setDraggingVisitorId: (id: string | null) => void
  getMemberName: (id: string) => string
  onReload: () => void
  onApiError: (error: any) => void
}

const today = new Date().toISOString().split("T")[0]

export function useClassRecordDialogs({
  allCustomers, teachers, courses, groups, draggingVisitorId, setDraggingVisitorId,
  getMemberName, onReload, onApiError,
}: UseClassRecordDialogsProps) {
  const enterToNext = useEnterToNext()

  // 编辑弹窗
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<ClassRecord | null>(null)
  const [saving, setSaving] = useState(false)
  const [formDate, setFormDate] = useState(today)
  const [formStartTime, setFormStartTime] = useState("09:00")
  const [formEndTime, setFormEndTime] = useState("10:00")
  const [formCourseId, setFormCourseId] = useState("")
  const [formTeacherId, setFormTeacherId] = useState("")
  const [formDescription, setFormDescription] = useState("")
  const [formIsPublicWelfare, setFormIsPublicWelfare] = useState(false)
  const [showCourseDropdown, setShowCourseDropdown] = useState(false)
  const [showTeacherDropdown, setShowTeacherDropdown] = useState(false)

  // 资料弹窗
  const [materialsDialogOpen, setMaterialsDialogOpen] = useState(false)
  const [materialsRecord, setMaterialsRecord] = useState<ClassRecord | null>(null)
  const [uploading, setUploading] = useState(false)

  // 删除确认
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // 小组人员面板
  const [groupsRecord, setGroupsRecord] = useState<ClassRecord | null>(null)
  const [groupsPanelOpen, setGroupsPanelOpen] = useState(false)
  const [groupSearchKeyword, setGroupSearchKeyword] = useState("")
  const [groupSearchResults, setGroupSearchResults] = useState<CustomerSearchResult[]>([])
  const [groupSearchTarget, setGroupSearchTarget] = useState<{ groupIndex: number; role: "leader" | "deputy" | "member" } | null>(null)
  const groupSearchTimeoutRef = useRef<number | null>(null)
  const groupBlurTimeoutRef = useRef<number | null>(null)
  const [panelDayVisits, setPanelDayVisits] = useState<DayVisit[]>([])

  // ===== Handlers =====
  const handleOpenEdit = (record: ClassRecord) => {
    setEditingRecord(record)
    setFormDate(record.date)
    setFormStartTime(record.start_time || "")
    setFormEndTime(record.end_time || "")
    setFormCourseId(record.course_id)
    setFormTeacherId(record.teacher_ids[0] || "")
    setFormDescription(record.course_description || "")
    setFormIsPublicWelfare(record.is_public_welfare || false)
    setShowCourseDropdown(false)
    setShowTeacherDropdown(false)
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!formCourseId) return
    setSaving(true)
    try {
      const teacherIds = formTeacherId ? [formTeacherId] : []
      if (editingRecord) {
        const course = courses.find(c => c.id === formCourseId)
        await classRecordApi.update(editingRecord.id, {
          date: formDate,
          start_time: formStartTime || null,
          end_time: formEndTime || null,
          course_id: formCourseId,
          course_name: course?.name || editingRecord.course_name,
          course_description: formDescription,
          teacher_ids: teacherIds,
          is_public_welfare: formIsPublicWelfare,
        })
      } else {
        const course = courses.find(c => c.id === formCourseId)
        if (!course) return
        await classRecordApi.create({
          date: formDate,
          start_time: formStartTime || null,
          end_time: formEndTime || null,
          course_id: formCourseId,
          course_name: course.name,
          course_description: formDescription,
          teacher_ids: teacherIds,
          is_public_welfare: formIsPublicWelfare,
        })
      }
      setDialogOpen(false)
      onReload()
    } catch (error) {
      console.error("保存失败:", error)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    await classRecordApi.delete(deleteId)
    setDeleteId(null)
    onReload()
  }

  // 资料
  const handleOpenMaterials = (record: ClassRecord) => {
    setMaterialsRecord(record)
    setMaterialsDialogOpen(true)
  }

  const handleUploadMaterial = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !materialsRecord) return
    setUploading(true)
    try {
      const material = await uploadApi.uploadMaterial(file)
      const newMaterials = [...(materialsRecord.materials || []), material]
      await classRecordApi.update(materialsRecord.id, { materials: newMaterials } as any)
      setMaterialsRecord({ ...materialsRecord, materials: newMaterials })
      onReload()
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
      onReload()
    } catch { }
  }

  // 小组管理
  const handleOpenGroups = (record: ClassRecord) => {
    setGroupsRecord(record)
    setGroupsPanelOpen(true)
    setGroupSearchKeyword("")
    setGroupSearchResults([])
    setGroupSearchTarget(null)
    // 加载当日到场人员
    visitApi.list(record.date).then((visits) => {
      setPanelDayVisits(visits.map(v => ({ id: v.customer_id, nickname: v.nickname, member_type: v.member_type || "" })))
    }).catch(() => { setPanelDayVisits([]) })
  }

  const handleAddGroup = async () => {
    if (!groupsRecord) return
    const newGroups = [...(groupsRecord.groups || []), { name: `小组 ${(groupsRecord.groups || []).length + 1}`, leader_id: "", deputy_id: "", member_ids: [] }]
    try {
      const updated = await classRecordApi.updateGroups(groupsRecord.id, newGroups)
      setGroupsRecord(updated)
      onReload()
    } catch (e) { onApiError(e) }
  }

  const handleRemoveGroup = async (index: number) => {
    if (!groupsRecord) return
    const newGroups = groupsRecord.groups
      .filter((_, i) => i !== index)
      .map((g, i) => ({ ...g, name: `小组 ${i + 1}` }))
    try {
      const updated = await classRecordApi.updateGroups(groupsRecord.id, newGroups)
      setGroupsRecord(updated)
      onReload()
    } catch (e) { onApiError(e) }
  }

  const handleGroupNameChange = (index: number, name: string) => {
    if (!groupsRecord) return
    const newGroups = groupsRecord.groups.map((g, i) => i === index ? { ...g, name } : g)
    setGroupsRecord({ ...groupsRecord, groups: newGroups })
  }

  const handleSaveGroupName = async (_index: number) => {
    if (!groupsRecord) return
    try {
      const updated = await classRecordApi.updateGroups(groupsRecord.id, groupsRecord.groups)
      setGroupsRecord(updated)
      onReload()
    } catch (e) { onApiError(e) }
  }

  const handleGroupSearch = (keyword: string, groupIndex: number, role: "leader" | "deputy" | "member") => {
    setGroupSearchKeyword(keyword)
    setGroupSearchTarget({ groupIndex, role })
    if (groupSearchTimeoutRef.current) clearTimeout(groupSearchTimeoutRef.current)
    if (!keyword.trim()) { setGroupSearchResults([]); return }
    groupSearchTimeoutRef.current = window.setTimeout(async () => {
      try {
        const results = await classRecordApi.searchCustomers(keyword)
        const allAssigned = new Set(
          (groupsRecord?.groups || []).flatMap(g => [g.leader_id, g.deputy_id, ...g.member_ids].filter(Boolean))
        )
        setGroupSearchResults(results.filter(r => !allAssigned.has(r.id)))
      } catch { setGroupSearchResults([]) }
    }, 300)
  }

  const handleAssignGroupMember = async (customer: CustomerSearchResult) => {
    if (!groupsRecord || !groupSearchTarget) return
    const allAssigned = groupsRecord.groups.flatMap(g => [g.leader_id, g.deputy_id, ...g.member_ids].filter(Boolean))
    if (allAssigned.includes(customer.id)) return
    const { groupIndex, role } = groupSearchTarget
    const newGroups = [...groupsRecord.groups]
    const group = { ...newGroups[groupIndex] }

    if (role === "leader") {
      group.leader_id = customer.id
    } else if (role === "deputy") {
      group.deputy_id = customer.id
    } else {
      group.member_ids = [...group.member_ids, customer.id]
    }
    newGroups[groupIndex] = group

    try {
      const updated = await classRecordApi.updateGroups(groupsRecord.id, newGroups)
      setGroupsRecord(updated)
      setGroupSearchKeyword("")
      setGroupSearchResults([])
      setGroupSearchTarget(null)
      onReload()
    } catch (e) { onApiError(e) }
  }

  const handleRemoveGroupMember = async (groupIndex: number, role: "leader" | "deputy" | "member", memberId?: string) => {
    if (!groupsRecord) return
    const newGroups = [...groupsRecord.groups]
    const group = { ...newGroups[groupIndex] }

    if (role === "leader") group.leader_id = ""
    else if (role === "deputy") group.deputy_id = ""
    else group.member_ids = group.member_ids.filter(id => id !== memberId)

    newGroups[groupIndex] = group
    try {
      const updated = await classRecordApi.updateGroups(groupsRecord.id, newGroups)
      setGroupsRecord(updated)
      onReload()
    } catch (e) { onApiError(e) }
  }

  // 拖拽分配到场人员到小组
  const handleDropVisitor = async (groupIndex: number, visitor: { id: string; nickname: string }) => {
    if (!groupsRecord) return
    const allAssigned = groupsRecord.groups.flatMap(g => [g.leader_id, g.deputy_id, ...g.member_ids].filter(Boolean))
    if (allAssigned.includes(visitor.id)) return
    const newGroups = [...groupsRecord.groups]
    const group = { ...newGroups[groupIndex] }
    group.member_ids = [...group.member_ids, visitor.id]
    newGroups[groupIndex] = group
    try {
      const updated = await classRecordApi.updateGroups(groupsRecord.id, newGroups)
      setGroupsRecord(updated)
      onReload()
    } catch (e) { onApiError(e) }
  }

  // 拖拽到活动卡片
  const handleDropToClass = async (record: ClassRecord, customer: { customer_id: string; nickname: string }) => {
    const classGroups = (record.groups || []).map(g => ({ ...g, member_ids: [...(g.member_ids || [])] }))
    const allAssigned = classGroups.flatMap(g => [g.leader_id, g.deputy_id, ...g.member_ids].filter(Boolean))
    if (allAssigned.includes(customer.customer_id)) return

    const saveGroupsAndParticipants = async (finalGroups: any[]) => {
      await classRecordApi.updateGroups(record.id, finalGroups)
      const groupIds = new Set(finalGroups.flatMap((g: any) => [g.leader_id, g.deputy_id, ...(g.member_ids || [])].filter(Boolean)))
      const ungroupedIds = (record.participant_ids || []).filter((id: string) => !groupIds.has(id))
      await classRecordApi.updateParticipants(record.id, [...groupIds, ...ungroupedIds])
      onReload()
    }

    let dailyGroupName = ""
    let dailyRole: "leader" | "deputy" | "member" | "" = ""
    for (const dg of groups) {
      if (dg.leader_id === customer.customer_id) { dailyGroupName = dg.name; dailyRole = "leader"; break }
      if (dg.deputy_id === customer.customer_id) { dailyGroupName = dg.name; dailyRole = "deputy"; break }
      if ((dg.member_ids || []).includes(customer.customer_id)) { dailyGroupName = dg.name; dailyRole = "member"; break }
    }

    if (dailyRole) {
      let targetIdx = classGroups.findIndex(g => g.name === dailyGroupName)
      if (targetIdx === -1) {
        classGroups.push({ name: dailyGroupName, leader_id: "", deputy_id: "", member_ids: [] })
        targetIdx = classGroups.length - 1
      }
      const targetGroup = { ...classGroups[targetIdx], member_ids: [...classGroups[targetIdx].member_ids] }
      // 拖拽只添加为组员，不自动分配组长/副组长
      targetGroup.member_ids = [...targetGroup.member_ids, customer.customer_id]
      classGroups[targetIdx] = targetGroup
      try {
        await saveGroupsAndParticipants(classGroups)
      } catch (e: any) {
        const msg = e?.response?.data?.detail || e?.message || "添加失败"
        alert(msg)
      }
    } else if (classGroups.length === 0) {
      // 创建小组但不自动分配组长
      const newGroups = [{ name: "小组 1", leader_id: "", deputy_id: "", member_ids: [customer.customer_id] }]
      try {
        await saveGroupsAndParticipants(newGroups)
      } catch (e: any) {
        const msg = e?.response?.data?.detail || e?.message || "添加失败"
        alert(msg)
      }
    } else {
      // 只添加为组员，不自动分配组长
      classGroups[0] = { ...classGroups[0], member_ids: [...classGroups[0].member_ids, customer.customer_id] }
      try {
        await saveGroupsAndParticipants(classGroups)
      } catch (e: any) {
        const msg = e?.response?.data?.detail || e?.message || "添加失败"
        alert(msg)
      }
    }
  }

  const actions: ClassRecordActions = useMemo(() => ({
    handleOpenEdit, handleOpenMaterials, handleOpenGroups, handleDropToClass, deleteId, setDeleteId,
  }), [deleteId])

  const selectedCourse = courses.find(c => c.id === formCourseId)

  const dialogs: ReactNode = (
    <>
      {/* 新增/编辑记录弹窗 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-base">{editingRecord ? "编辑活动" : "新增活动"}</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-5" {...enterToNext}>
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">日期</span>
              <Input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
            </div>

            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">时间段</span>
              <div className="flex items-center gap-2">
                <Input type="time" value={formStartTime} onChange={(e) => setFormStartTime(e.target.value)} className="h-8 text-xs flex-1" />
                <span className="text-[12px] text-[#4e535a]">至</span>
                <Input type="time" value={formEndTime} onChange={(e) => setFormEndTime(e.target.value)} className="h-8 text-xs flex-1" />
              </div>
            </div>

            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">课程名称</span>
              <div className="relative">
                <div
                  className="min-h-8 w-full rounded-md border border-input bg-transparent px-2 py-1 text-[12px] cursor-pointer flex items-center justify-between"
                  onClick={() => setShowCourseDropdown(!showCourseDropdown)}
                >
                  <span className={selectedCourse ? "text-[#2b2f36]" : "text-muted-foreground"}>
                    {selectedCourse?.name || "选择课程"}
                  </span>
                </div>
                {showCourseDropdown && courses.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-white border rounded shadow-sm max-h-60 overflow-y-auto">
                    {courses.map((course) => (
                      <div
                        key={course.id}
                        className={`flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-muted ${formCourseId === course.id ? "bg-muted/50" : ""}`}
                        onClick={() => {
                          setFormCourseId(course.id)
                          setShowCourseDropdown(false)
                        }}
                      >
                        <div>
                          <span className="text-[12px]">{course.name}</span>
                          <span className="text-[12px] text-muted-foreground ml-2">{course.type}</span>
                        </div>
                        {formCourseId === course.id && (
                          <span className="text-xs text-primary">已选</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">课程老师</span>
              <div className="relative">
                <div
                  className="min-h-8 w-full rounded-md border border-input bg-transparent px-2 py-1 text-[12px] cursor-pointer flex items-center justify-between"
                  onClick={() => setShowTeacherDropdown(!showTeacherDropdown)}
                >
                  <span className={formTeacherId ? "text-[#2b2f36]" : "text-muted-foreground"}>
                    {formTeacherId ? (() => { const c = allCustomers.find(t => t.id === formTeacherId); return c?.nickname || c?.name || formTeacherId })() : "选择课程老师"}
                  </span>
                </div>
                {showTeacherDropdown && teachers.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-white border rounded shadow-sm max-h-60 overflow-y-auto">
                    {teachers.map((teacher) => (
                      <div
                        key={teacher.id}
                        className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-muted"
                        onClick={() => { setFormTeacherId(teacher.id); setShowTeacherDropdown(false) }}
                      >
                        <span className="text-[12px]">{teacher.nickname || teacher.name || "未命名"}</span>
                      </div>
                    ))}
                  </div>
                )}
                {showTeacherDropdown && teachers.length === 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-white border rounded shadow-sm p-3 text-xs text-muted-foreground text-center">
                    暂无课程老师，请先在疗愈老师中添加
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">是否公益</span>
              <div className="relative">
                <SelectDropdown
                  value={formIsPublicWelfare ? "1" : "0"}
                  options={[{value: "0", label: "否"}, {value: "1", label: "是"}]}
                  onChange={(v) => setFormIsPublicWelfare(v === "1")}
                />
              </div>
            </div>

            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">课程介绍</span>
              <textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="输入课程介绍..."
                rows={4}
                className="w-full rounded-md border border-input bg-transparent px-2 py-2 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>取消</Button>
              <Button size="sm" onClick={handleSave} disabled={saving || !formCourseId}>
                {saving ? "保存中..." : "保存"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 资料弹窗 */}
      <Dialog open={materialsDialogOpen} onOpenChange={setMaterialsDialogOpen}>
        <DialogContent className="max-w-md w-full p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-base">资料管理</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-4 overflow-hidden">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-[#4e535a] truncate">{materialsRecord?.course_name}</span>
              <div className="shrink-0">
                <input type="file" id="materials-upload-cr" className="hidden" onChange={handleUploadMaterial} />
                <Button size="sm" className="h-7 text-xs" disabled={uploading} onClick={() => document.getElementById("materials-upload-cr")?.click()}>
                  {uploading ? "上传中..." : "上传文件"}
                </Button>
              </div>
            </div>
            <div className="space-y-2 max-h-60 overflow-y-auto overflow-x-hidden">
              {(materialsRecord?.materials || []).length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">暂无资料</div>
              ) : (
                (materialsRecord?.materials || []).map((m) => (
                  <div key={m.id} className="flex items-center justify-between px-3 py-2 rounded border gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
                      <File className="h-4 w-4 text-[#8f959e] shrink-0" />
                      <span className="text-xs text-[#2b2f36] truncate">{m.name}</span>
                      <span className="text-[12px] text-[#8f959e] shrink-0">{(m.size / 1024).toFixed(1)}KB</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <a href={`${"http://127.0.0.1:8000"}${m.url}`} download className="h-6 w-6 flex items-center justify-center rounded hover:bg-[#f0f0f0]">
                        <Download className="h-3.5 w-3.5 text-[#8f959e]" />
                      </a>
                      <button className="h-6 w-6 flex items-center justify-center rounded hover:bg-[#f0f0f0]" onClick={() => handleDeleteMaterial(m.url.split("/").pop()!)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除活动</AlertDialogTitle>
            <AlertDialogDescription>确定要删除这条活动吗？此操作不可撤销。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 小组管理面板 */}
      {groupsPanelOpen && groupsRecord && (
        <Dialog open={groupsPanelOpen} onOpenChange={(open) => { setGroupsPanelOpen(open); if (!open) setGroupsRecord(null) }}>
          <DialogContent className="max-w-3xl p-0 gap-0">
            <DialogHeader className="px-6 pt-5 pb-4 border-b">
              <DialogTitle className="text-base">小组管理 — {groupsRecord.course_name}</DialogTitle>
            </DialogHeader>
            <div className="flex max-h-[65vh]">
              {/* 左侧：当日到场人员 */}
              <div className="w-48 shrink-0 border-r border-[#e8e8e8] overflow-y-auto">
                <div className="px-3 py-3 border-b border-[#f0f0f0] bg-[#f7f8fa]">
                  <span className="text-[12px] font-medium text-[#2b2f36]">当日到场</span>
                  <span className="text-[12px] text-[#8f959e] ml-1">{panelDayVisits.length}人</span>
                </div>
                <div className="p-2 space-y-1">
                  {panelDayVisits.length === 0 ? (
                    <p className="text-[12px] text-[#b0b5bb] text-center py-4">暂无到场人员</p>
                  ) : (
                    panelDayVisits.map((v) => {
                      const allAssigned = (groupsRecord.groups || []).flatMap(g => [g.leader_id, g.deputy_id, ...g.member_ids].filter(Boolean))
                      const assigned = allAssigned.includes(v.id)
                      return (
                        <div
                          key={v.id}
                          draggable={!assigned}
                          onDragStart={() => !assigned && setDraggingVisitorId(v.id)}
                          onDragEnd={() => setDraggingVisitorId(null)}
                          className={`flex items-center gap-2 px-2.5 py-1.5 rounded text-[12px] select-none ${
                            assigned
                              ? "bg-[#f5f5f5] text-[#b0b5bb] cursor-not-allowed"
                              : "bg-white hover:bg-[#f0f5ff] cursor-grab active:cursor-grabbing"
                          } ${draggingVisitorId === v.id ? "opacity-50" : ""}`}
                        >
                          <span className="flex-1 truncate">{v.nickname}</span>
                          {assigned && <span className="text-[10px] text-[#b0b5bb]">已分配</span>}
                          {v.member_type && !assigned && <span className="text-[10px] text-[#8f959e]">{v.member_type}</span>}
                        </div>
                      )
                    })
                  )}
                </div>
              </div>

              {/* 右侧：小组管理 */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
                {(groupsRecord.groups || []).length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-[12px] text-muted-foreground mb-3">暂无分组</p>
                    <Button size="sm" className="h-7 text-xs" onClick={handleAddGroup}>新增小组</Button>
                  </div>
                ) : (
                  (groupsRecord.groups || []).map((group, gi) => (
                    <div key={gi} className="border border-[#e8e8e8] rounded-lg bg-white"
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault()
                        const vid = draggingVisitorId
                        if (!vid) return
                        const visitor = panelDayVisits.find(v => v.id === vid)
                        if (visitor) handleDropVisitor(gi, visitor)
                        setDraggingVisitorId(null)
                      }}
                    >
                      <div className="px-3 py-2 border-b border-[#f0f0f0] flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Input
                            value={group.name}
                            onChange={(e) => handleGroupNameChange(gi, e.target.value)}
                            onBlur={() => handleSaveGroupName(gi)}
                            className="h-7 text-[12px] w-32"
                          />
                        </div>
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="ghost" className="h-6 text-[11px] text-[#8f959e]" onClick={() => handleRemoveGroup(gi)}>删除</Button>
                        </div>
                      </div>
                      <div className="px-3 py-2.5 space-y-2">
                        {/* 组长 */}
                        <div className="flex items-center gap-1.5">
                          <span className="text-[12px] text-[#4e535a] shrink-0 w-10">组长</span>
                          {group.leader_id ? (
                            <div className="flex items-center gap-1">
                              <Badge variant="secondary" className="text-[12px] font-normal">{getMemberName(group.leader_id)}</Badge>
                              <button className="h-4 w-4 flex items-center justify-center rounded hover:bg-[#f0f0f0]" onClick={() => handleRemoveGroupMember(gi, "leader")}>
                                <X className="h-2.5 w-2.5 text-[#8f959e]" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex-1 relative">
                              <Input
                                value={groupSearchTarget?.groupIndex === gi && groupSearchTarget.role === "leader" ? groupSearchKeyword : ""}
                                onChange={(e) => handleGroupSearch(e.target.value, gi, "leader")}
                                placeholder="选择组长"
                                className="h-7 text-[12px]"
                                onBlur={() => { if (groupBlurTimeoutRef.current) clearTimeout(groupBlurTimeoutRef.current); groupBlurTimeoutRef.current = window.setTimeout(() => { if (groupSearchTarget?.groupIndex === gi && groupSearchTarget.role === "leader") { setGroupSearchTarget(null); setGroupSearchResults([]) } }, 200) }}
                              />
                              {groupSearchTarget?.groupIndex === gi && groupSearchTarget.role === "leader" && groupSearchResults.length > 0 && (
                                <div className="absolute z-50 w-full mt-1 bg-white border rounded shadow-sm max-h-40 overflow-y-auto">
                                  {groupSearchResults.map((c) => (
                                    <div key={c.id} className="flex items-center px-3 py-1.5 cursor-pointer hover:bg-muted text-[12px]" onMouseDown={(e) => e.preventDefault()} onClick={() => handleAssignGroupMember(c)}>
                                      <span>{c.nickname || c.name}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        {/* 副组长 */}
                        <div className="flex items-center gap-1.5">
                          <span className="text-[12px] text-[#4e535a] shrink-0 w-10">副组长</span>
                          {group.deputy_id ? (
                            <div className="flex items-center gap-1">
                              <Badge variant="secondary" className="text-[12px] font-normal">{getMemberName(group.deputy_id)}</Badge>
                              <button className="h-4 w-4 flex items-center justify-center rounded hover:bg-[#f0f0f0]" onClick={() => handleRemoveGroupMember(gi, "deputy")}>
                                <X className="h-2.5 w-2.5 text-[#8f959e]" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex-1 relative">
                              <Input
                                value={groupSearchTarget?.groupIndex === gi && groupSearchTarget.role === "deputy" ? groupSearchKeyword : ""}
                                onChange={(e) => handleGroupSearch(e.target.value, gi, "deputy")}
                                placeholder="选择副组长"
                                className="h-7 text-[12px]"
                                onBlur={() => { if (groupBlurTimeoutRef.current) clearTimeout(groupBlurTimeoutRef.current); groupBlurTimeoutRef.current = window.setTimeout(() => { if (groupSearchTarget?.groupIndex === gi && groupSearchTarget.role === "deputy") { setGroupSearchTarget(null); setGroupSearchResults([]) } }, 200) }}
                              />
                              {groupSearchTarget?.groupIndex === gi && groupSearchTarget.role === "deputy" && groupSearchResults.length > 0 && (
                                <div className="absolute z-50 w-full mt-1 bg-white border rounded shadow-sm max-h-40 overflow-y-auto">
                                  {groupSearchResults.map((c) => (
                                    <div key={c.id} className="flex items-center px-3 py-1.5 cursor-pointer hover:bg-muted text-[12px]" onMouseDown={(e) => e.preventDefault()} onClick={() => handleAssignGroupMember(c)}>
                                      <span>{c.nickname || c.name}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        {/* 组员 */}
                        <div>
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <span className="text-[12px] text-[#4e535a] shrink-0 w-10">组员</span>
                            <div className="flex-1 relative">
                              <Input
                                value={groupSearchTarget?.groupIndex === gi && groupSearchTarget.role === "member" ? groupSearchKeyword : ""}
                                onChange={(e) => handleGroupSearch(e.target.value, gi, "member")}
                                placeholder="搜索添加组员"
                                className="h-7 text-[12px]"
                                onBlur={() => { if (groupBlurTimeoutRef.current) clearTimeout(groupBlurTimeoutRef.current); groupBlurTimeoutRef.current = window.setTimeout(() => { if (groupSearchTarget?.groupIndex === gi && groupSearchTarget.role === "member") { setGroupSearchTarget(null); setGroupSearchResults([]) } }, 200) }}
                              />
                              {groupSearchTarget?.groupIndex === gi && groupSearchTarget.role === "member" && groupSearchResults.length > 0 && (
                                <div className="absolute z-50 w-full mt-1 bg-white border rounded shadow-sm max-h-40 overflow-y-auto">
                                  {groupSearchResults.map((c) => (
                                    <div key={c.id} className="flex items-center px-3 py-1.5 cursor-pointer hover:bg-muted text-[12px]" onMouseDown={(e) => e.preventDefault()} onClick={() => handleAssignGroupMember(c)}>
                                      <span>{c.nickname || c.name}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                          {group.member_ids.length > 0 && (
                            <div className="flex flex-wrap gap-1 ml-[42px]">
                              {group.member_ids.map((id) => (
                                <Badge key={id} variant="secondary" className="text-[12px] font-normal gap-1 pr-1">
                                  {getMemberName(id)}
                                  <button className="h-3.5 w-3.5 flex items-center justify-center rounded hover:bg-[#e0e0e0]" onClick={() => handleRemoveGroupMember(gi, "member", id)}>
                                    <X className="h-2.5 w-2.5" />
                                  </button>
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
                {(groupsRecord.groups || []).length > 0 && (
                  <div className="flex justify-center pt-2">
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleAddGroup}>新增小组</Button>
                  </div>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  )

  return { actions, dialogs }
}
