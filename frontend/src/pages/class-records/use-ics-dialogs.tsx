import { useState, useRef, useMemo, type ReactNode } from "react"
import { useEnterToNext } from "@/hooks/use-enter-to-next"
import { X, Trash2 } from "lucide-react"
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
  internalCourseSessionApi, uploadApi,
  type InternalCourseSession, type Customer, type InternalCourseSessionCustomerSearchResult,
} from "@/lib/api"

interface DayVisit { id: string; nickname: string; member_type: string }

export interface IcsActions {
  handleOpenEdit: (session: InternalCourseSession) => void
  handleOpenMaterials: (session: InternalCourseSession) => void
  handleOpenMembers: (session: InternalCourseSession) => void
  handleDrop: (session: InternalCourseSession, customer: { customer_id: string }) => void
  deleteId: string | null
  setDeleteId: (id: string | null) => void
}

interface UseIcsDialogsProps {
  allCustomers: Customer[]
  dayVisits: DayVisit[]
  draggingVisitorId: string | null
  setDraggingVisitorId: (id: string | null) => void
  getMemberName: (id: string) => string
  onReload: () => void
}

const today = new Date().toISOString().split("T")[0]
const ICS_COURSE_TYPES = ["疗愈师课程", "商业框架陪跑", "落地赋能班"]

export function useIcsDialogs({
  allCustomers, dayVisits, draggingVisitorId, setDraggingVisitorId,
  getMemberName, onReload,
}: UseIcsDialogsProps) {
  const enterToNext = useEnterToNext()

  // 编辑弹窗
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<InternalCourseSession | null>(null)
  const [saving, setSaving] = useState(false)
  const [formDate, setFormDate] = useState(today)
  const [formStartTime, setFormStartTime] = useState("09:00")
  const [formEndTime, setFormEndTime] = useState("10:00")
  const [formCourseType, setFormCourseType] = useState("")
  const [formCourseName, setFormCourseName] = useState("")
  const [formDescription, setFormDescription] = useState("")
  const [formHostId, setFormHostId] = useState("")
  const [formHostName, setFormHostName] = useState("")
  const [searchField, setSearchField] = useState<"host" | null>(null)
  const [searchKeyword, setSearchKeyword] = useState("")
  const [searchResults, setSearchResults] = useState<InternalCourseSessionCustomerSearchResult[]>([])
  const [, setSearching] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const searchTimeoutRef = useRef<number | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // 资料弹窗
  const [materialsDialogOpen, setMaterialsDialogOpen] = useState(false)
  const [materialsRecord, setMaterialsRecord] = useState<InternalCourseSession | null>(null)
  const [uploading, setUploading] = useState(false)

  // 删除确认
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // 成员弹窗
  const [membersDialogOpen, setMembersDialogOpen] = useState(false)
  const [membersRecord, setMembersRecord] = useState<InternalCourseSession | null>(null)
  const [memberSearchKeyword, setMemberSearchKeyword] = useState("")
  const [memberSearchResults, setMemberSearchResults] = useState<InternalCourseSessionCustomerSearchResult[]>([])
  const [, setMemberSearching] = useState(false)
  const [memberShowDropdown, setMemberShowDropdown] = useState(false)
  const memberSearchTimeoutRef = useRef<number | null>(null)
  const memberDropdownRef = useRef<HTMLDivElement>(null)

  // ===== Handlers =====
  const handleSearch = (keyword: string) => {
    setSearchKeyword(keyword)
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    if (!keyword.trim()) { setSearchResults([]); setShowDropdown(false); return }
    searchTimeoutRef.current = window.setTimeout(async () => {
      setSearching(true)
      try {
        const results = await internalCourseSessionApi.searchCustomers(keyword)
        setSearchResults(results.filter(r => r.id !== formHostId))
        setShowDropdown(true)
      } catch { setSearchResults([]) }
      finally { setSearching(false) }
    }, 300)
  }

  const handleSelectHost = (customer: InternalCourseSessionCustomerSearchResult) => {
    setFormHostId(customer.id)
    setFormHostName(customer.nickname || customer.name)
    setSearchKeyword("")
    setSearchResults([])
    setShowDropdown(false)
    setSearchField(null)
  }

  const handleOpenEdit = (session: InternalCourseSession) => {
    setEditingRecord(session)
    setFormDate(session.date)
    setFormStartTime(session.start_time || "09:00")
    setFormEndTime(session.end_time || "10:00")
    setFormCourseType(session.course_type || "")
    setFormCourseName(session.course_name)
    setFormDescription(session.course_description || "")
    setFormHostId(session.host_id || "")
    setFormHostName(session.host_name || "")
    setSearchField(null)
    setSearchKeyword("")
    setSearchResults([])
    setShowDropdown(false)
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!formCourseName) return
    setSaving(true)
    try {
      const data = {
        date: formDate,
        start_time: formStartTime || null,
        end_time: formEndTime || null,
        course_type: formCourseType,
        course_name: formCourseName,
        course_description: formDescription,
        host_id: formHostId || "",
        host_name: formHostName || "",
      }
      if (editingRecord) {
        await internalCourseSessionApi.update(editingRecord.id, data)
      } else {
        await internalCourseSessionApi.create(data)
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
    try {
      await internalCourseSessionApi.delete(deleteId)
      setDeleteId(null)
      onReload()
    } catch { alert("删除失败，请重试") }
  }

  // 资料
  const handleOpenMaterials = (session: InternalCourseSession) => {
    setMaterialsRecord(session)
    setMaterialsDialogOpen(true)
  }

  const handleUploadMaterial = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !materialsRecord) return
    setUploading(true)
    try {
      const material = await uploadApi.uploadMaterial(file)
      const newMaterials = [...(materialsRecord.materials || []), material]
      await internalCourseSessionApi.update(materialsRecord.id, { materials: newMaterials } as any)
      setMaterialsRecord({ ...materialsRecord, materials: newMaterials })
      onReload()
    } catch { alert("上传失败，请重试") }
    finally { setUploading(false); e.target.value = "" }
  }

  const handleDeleteMaterial = async (filename: string) => {
    if (!materialsRecord) return
    try {
      const newMaterials = (materialsRecord.materials || []).filter(m => !m.url.includes(filename))
      await internalCourseSessionApi.update(materialsRecord.id, { materials: newMaterials } as any)
      setMaterialsRecord({ ...materialsRecord, materials: newMaterials })
      onReload()
      uploadApi.deleteMaterial(filename).catch(() => {})
    } catch { alert("删除失败，请重试") }
  }

  // 成员
  const handleOpenMembers = (session: InternalCourseSession) => {
    setMembersRecord(session)
    setMembersDialogOpen(true)
    setMemberSearchKeyword("")
    setMemberSearchResults([])
    setMemberShowDropdown(false)
  }

  const handleMemberSearch = (keyword: string) => {
    setMemberSearchKeyword(keyword)
    if (memberSearchTimeoutRef.current) clearTimeout(memberSearchTimeoutRef.current)
    if (!keyword.trim()) { setMemberSearchResults([]); setMemberShowDropdown(false); return }
    memberSearchTimeoutRef.current = window.setTimeout(async () => {
      setMemberSearching(true)
      try {
        const results = await internalCourseSessionApi.searchCustomers(keyword)
        setMemberSearchResults(results.filter(r => !(membersRecord?.participant_ids || []).includes(r.id)))
        setMemberShowDropdown(true)
      } catch { setMemberSearchResults([]) }
      finally { setMemberSearching(false) }
    }, 300)
  }

  const handleAddParticipant = async (customer: InternalCourseSessionCustomerSearchResult) => {
    if (!membersRecord) return
    const newIds = [...(membersRecord.participant_ids || []), customer.id]
    try {
      await internalCourseSessionApi.update(membersRecord.id, { participant_ids: newIds } as any)
      setMembersRecord({ ...membersRecord, participant_ids: newIds })
      setMemberSearchKeyword("")
      setMemberSearchResults([])
      setMemberShowDropdown(false)
      onReload()
    } catch { alert("添加失败，请重试") }
  }

  const handleRemoveParticipant = async (id: string) => {
    if (!membersRecord) return
    const newIds = (membersRecord.participant_ids || []).filter(pid => pid !== id)
    try {
      await internalCourseSessionApi.update(membersRecord.id, { participant_ids: newIds } as any)
      setMembersRecord({ ...membersRecord, participant_ids: newIds })
      onReload()
    } catch { alert("移除失败，请重试") }
  }

  const handleDrop = async (session: InternalCourseSession, customer: { customer_id: string }) => {
    const ids = session.participant_ids || []
    if (ids.includes(customer.customer_id)) return
    try {
      await internalCourseSessionApi.update(session.id, { participant_ids: [...ids, customer.customer_id] } as any)
      onReload()
    } catch { alert("添加失败，请重试") }
  }

  const actions: IcsActions = useMemo(() => ({
    handleOpenEdit, handleOpenMaterials, handleOpenMembers, handleDrop, deleteId, setDeleteId,
  }), [deleteId, onReload])

  const dialogs: ReactNode = (
    <>
      {/* 编辑弹窗 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-base">{editingRecord ? "编辑内部课程" : "新增内部课程"}</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-4" {...enterToNext}>
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">日期</span>
              <Input rounded="[2px]" type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
            </div>
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">时间段</span>
              <div className="flex items-center gap-2">
                <Input rounded="[2px]" type="time" value={formStartTime} onChange={(e) => setFormStartTime(e.target.value)} className="h-8 text-xs flex-1" />
                <span className="text-[12px] text-[#4e535a]">至</span>
                <Input rounded="[2px]" type="time" value={formEndTime} onChange={(e) => setFormEndTime(e.target.value)} className="h-8 text-xs flex-1" />
              </div>
            </div>
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">课程类型</span>
              <SelectDropdown
                rounded="[2px]"
                value={formCourseType}
                options={[{value: "", label: "选择类型"}, ...ICS_COURSE_TYPES.map(t => ({value: t, label: t}))]}
                placeholder="选择类型"
                onChange={(v) => setFormCourseType(v)}
              />
            </div>
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">课程名称</span>
              <Input rounded="[2px]" value={formCourseName} onChange={(e) => setFormCourseName(e.target.value)} placeholder="输入课程名称" className="h-8 text-xs" />
            </div>
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">课程老师</span>
              <div className="relative" ref={dropdownRef}>
                {searchField === "host" ? (
                  <Input
                    rounded="[2px]"
                    value={searchKeyword}
                    onChange={(e) => handleSearch(e.target.value)}
                    placeholder="搜索课程老师..."
                    className="h-8 text-xs"
                    autoFocus
                    onBlur={() => { setTimeout(() => { setSearchField(null); setShowDropdown(false) }, 200) }}
                  />
                ) : (
                  <div
                    className="min-h-8 w-full rounded-md border border-input bg-transparent px-2 py-1 text-[12px] cursor-pointer flex items-center justify-between"
                    onClick={() => { setSearchField("host"); setSearchKeyword(formHostName); setSearchResults([]); setShowDropdown(false); if (formHostName) handleSearch(formHostName) }}
                  >
                    <span className={formHostId ? "text-[#2b2f36]" : "text-muted-foreground"}>
                      {formHostName || "选择课程老师"}
                    </span>
                  </div>
                )}
                {showDropdown && searchField === "host" && searchResults.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-white border rounded shadow-sm max-h-40 overflow-y-auto">
                    {searchResults.map((c) => (
                      <div key={c.id} className="flex items-center justify-between px-3 py-1.5 cursor-pointer hover:bg-muted text-[12px]" onMouseDown={(e) => e.preventDefault()} onClick={() => handleSelectHost(c)}>
                        <span>{c.nickname || c.name}</span>
                      </div>
                    ))}
                  </div>
                )}
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
              <Button size="sm" onClick={handleSave} disabled={saving || !formCourseName}>
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
              <span className="text-[12px] text-[#4e535a]">已上传 {materialsRecord?.materials?.length || 0} 个文件</span>
              <label className="cursor-pointer">
                <input type="file" className="hidden" onChange={handleUploadMaterial} />
                <Button size="sm" variant="outline" className="h-7 text-xs" disabled={uploading}>
                  {uploading ? "上传中..." : "上传文件"}
                </Button>
              </label>
            </div>
            {(materialsRecord?.materials || []).length === 0 ? (
              <p className="text-[12px] text-muted-foreground text-center py-8">暂无资料</p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {materialsRecord!.materials.map((m, i) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded border">
                    <a href={m.url} target="_blank" rel="noopener noreferrer" className="text-[12px] text-[#3370ff] hover:underline truncate flex-1">{m.name || m.url.split("/").pop()}</a>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 shrink-0" onClick={() => handleDeleteMaterial(m.url.split("/").pop() || "")}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* 成员弹窗 */}
      <Dialog open={membersDialogOpen} onOpenChange={setMembersDialogOpen}>
        <DialogContent className="max-w-3xl p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-base">成员管理</DialogTitle>
          </DialogHeader>
          {membersRecord && (
            <div className="flex max-h-[65vh]">
              {/* 左侧：当日到场人员 */}
              <div className="w-48 shrink-0 border-r border-[#e8e8e8] overflow-y-auto">
                <div className="px-3 py-3 border-b border-[#f0f0f0] bg-[#f7f8fa]">
                  <span className="text-[12px] font-medium text-[#2b2f36]">当日到场</span>
                  <span className="text-[12px] text-[#8f959e] ml-1">{dayVisits.length}人</span>
                </div>
                <div className="p-2 space-y-1">
                  {dayVisits.length === 0 ? (
                    <p className="text-[12px] text-[#b0b5bb] text-center py-4">暂无到场人员</p>
                  ) : (
                    dayVisits.map((v) => {
                      const assigned = membersRecord.participant_ids?.includes(v.id) || membersRecord.host_id === v.id
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

              {/* 右侧：成员管理 */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  const vid = draggingVisitorId
                  if (!vid) return
                  const visitor = dayVisits.find(v => v.id === vid)
                  if (visitor && membersRecord) {
                    const customer = allCustomers.find(c => c.id === vid)
                    if (customer) handleAddParticipant(customer as any)
                  }
                  setDraggingVisitorId(null)
                }}
              >
                {/* 课程老师 */}
                <div>
                  <span className="text-[12px] text-[#4e535a] mb-1.5 block">课程老师</span>
                  {membersRecord.host_id ? (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[12px] font-medium">{membersRecord.host_name || getMemberName(membersRecord.host_id)}</span>
                    </div>
                  ) : (
                    <span className="text-[12px] text-muted-foreground">暂无</span>
                  )}
                </div>

                {/* 参与者 */}
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-[12px] text-[#4e535a] shrink-0">参与者</span>
                    <div className="flex-1 relative" ref={memberDropdownRef}>
                      <Input
                        rounded="[2px]"
                        value={memberSearchKeyword}
                        onChange={(e) => handleMemberSearch(e.target.value)}
                        placeholder="搜索添加参与者"
                        className="h-7 text-[12px]"
                      />
                      {memberShowDropdown && memberSearchResults.length > 0 && (
                        <div className="absolute z-50 w-full mt-1 bg-white border rounded shadow-sm max-h-40 overflow-y-auto">
                          {memberSearchResults.map((c) => (
                            <div key={c.id} className="flex items-center px-3 py-1.5 cursor-pointer hover:bg-muted text-[12px]" onClick={() => handleAddParticipant(c)}>
                              <span>{c.nickname || c.name}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  {(membersRecord.participant_ids || []).length > 0 && (
                    <div className="flex flex-wrap gap-1 ml-[42px]">
                      {(membersRecord.participant_ids || []).filter(id => !(membersRecord.teacher_ids || []).includes(id)).map((id) => (
                        <Badge key={id} variant="secondary" className="text-[12px] font-normal gap-1 pr-1">
                          {getMemberName(id)}
                          <button className="h-3.5 w-3.5 flex items-center justify-center rounded hover:bg-[#e0e0e0]" onClick={() => handleRemoveParticipant(id)}>
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除内部课程</AlertDialogTitle>
            <AlertDialogDescription>确定要删除这条内部课程记录吗？此操作不可撤销。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )

  return { actions, dialogs }
}
