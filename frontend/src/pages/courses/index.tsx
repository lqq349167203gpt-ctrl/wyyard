import { useEffect, useState, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { useEnterToNext } from "@/hooks/use-enter-to-next"
import { Plus, Trash2, Edit, BookOpen } from "lucide-react"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { courseApi, courseTypeApi, organizationApi, type Course, type Organization } from "@/lib/api"
import { SelectDropdown } from "@/components/select-dropdown"
import { usePagination } from "@/hooks/use-pagination"
import { PaginationBar } from "@/components/pagination-bar"

export default function CoursesPage() {
  const enterToNext = useEnterToNext()
  const [courses, setCourses] = useState<Course[]>([])
  const [courseTypes, setCourseTypes] = useState<string[]>([])
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedType, setSelectedType] = useState<string>("全部")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [typeDialogOpen, setTypeDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingCourse, setDeletingCourse] = useState<Course | null>(null)
  const [editingCourse, setEditingCourse] = useState<Course | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ type: "", name: "", class_count: 0, organization_id: "" })
  const [newTypeName, setNewTypeName] = useState("")
  const [deleteTypeDialogOpen, setDeleteTypeDialogOpen] = useState(false)
  const [deletingType, setDeletingType] = useState<string | null>(null)
  const [typeBlockedOpen, setTypeBlockedOpen] = useState(false)
  const [noOrgDialogOpen, setNoOrgDialogOpen] = useState(false)
  const [editTypeDialogOpen, setEditTypeDialogOpen] = useState(false)
  const [editingType, setEditingType] = useState<string | null>(null)
  const [editTypeName, setEditTypeName] = useState("")
  const [editTypeError, setEditTypeError] = useState("")
  const navigate = useNavigate()

  const loadData = useCallback(() => {
    courseApi.list().then(setCourses).catch(() => {})
    courseTypeApi.list().then(setCourseTypes).catch(() => {})
    organizationApi.list().then(setOrganizations).catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const filteredCourses = selectedType === "全部" ? courses : courses.filter(c => c.type === selectedType)
  const { paginatedItems, currentPage, totalPages, totalItems, goToPage, startIndex, endIndex } = usePagination(filteredCourses)

  const handleOpenCreate = () => {
    if (organizations.length === 0) { setNoOrgDialogOpen(true); return }
    setEditingCourse(null)
    const defaultType = selectedType === "全部" ? (courseTypes[0] || "") : selectedType
    const defaultOrgId = organizations.length > 0 ? organizations[0].id : ""
    setForm({ type: defaultType, name: "", class_count: 0, organization_id: defaultOrgId })
    setDialogOpen(true)
  }

  const handleOpenEdit = (course: Course) => {
    setEditingCourse(course)
    setForm({ type: course.type, name: course.name, class_count: course.class_count, organization_id: course.organization_id || "" })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!form.name || !form.type) return
    setSaving(true)
    try {
      if (editingCourse) {
        await courseApi.update(editingCourse.id, form)
      } else {
        await courseApi.create(form)
      }
      setDialogOpen(false)
      loadData()
    } catch (error) {
      console.error("保存失败:", error)
    } finally {
      setSaving(false)
    }
  }

  const handleAddType = async () => {
    if (!newTypeName.trim()) return
    try {
      await courseTypeApi.create(newTypeName.trim())
      setSelectedType(newTypeName.trim())
      setNewTypeName("")
      setTypeDialogOpen(false)
      loadData()
    } catch (error) {
      console.error("添加类型失败:", error)
    }
  }

  const handleDelete = async () => {
    if (!deletingCourse) return
    await courseApi.delete(deletingCourse.id)
    setDeleteDialogOpen(false)
    setDeletingCourse(null)
    loadData()
  }

  const handleDeleteType = async () => {
    if (!deletingType) return
    const count = courses.filter(c => c.type === deletingType).length
    if (count > 0) {
      setDeleteTypeDialogOpen(false)
      setTypeBlockedOpen(true)
      return
    }
    try {
      await courseTypeApi.delete(deletingType)
      if (selectedType === deletingType) setSelectedType("全部")
      setDeleteTypeDialogOpen(false)
      setDeletingType(null)
      loadData()
    } catch (error) {
      console.error("删除类型失败:", error)
    }
  }

  const handleRenameType = async () => {
    if (!editingType || !editTypeName.trim()) return
    if (editTypeName.trim() === editingType) { setEditTypeDialogOpen(false); return }
    setSaving(true)
    setEditTypeError("")
    try {
      await courseTypeApi.rename(editingType, editTypeName.trim())
      if (selectedType === editingType) setSelectedType(editTypeName.trim())
      setEditTypeDialogOpen(false)
      setEditingType(null)
      loadData()
    } catch (e: any) {
      setEditTypeError(e?.message || "重命名失败")
    } finally {
      setSaving(false)
    }
  }

  const getOrgName = (orgId: string) => organizations.find(o => o.id === orgId)?.name || ""

  return (
    <>
      <div className="px-6 pt-12 pb-6 space-y-3">
        {/* 页面头部 */}
        <div className="flex items-center justify-between pb-2">
          <div>
            <h1 className="text-lg font-semibold text-left">活动配置</h1>
            <p className="text-xs text-muted-foreground mt-1.5">共 {courses.length} 个活动</p>
          </div>
        </div>

        {/* 主内容区 - 左右布局 */}
        <div className="flex gap-4" style={{ height: 'calc(100vh - 180px)' }}>
        {/* 左侧 - 课程类型列表 */}
        <div className="w-[234px] bg-white rounded-lg flex flex-col shrink-0">
          <div className="flex items-center justify-between px-4 h-11 border-b border-[#f0f0f0]">
            <span className="text-[13px] font-medium text-[#2b2f36]">活动类型</span>
            <Button variant="ghost" size="sm" className="h-7 text-xs text-[#3370ff] hover:text-[#3370ff] hover:bg-[#f0f5ff]" onClick={() => { setNewTypeName(""); setTypeDialogOpen(true) }}>
              新增
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">加载中...</div>
            ) : courseTypes.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">暂无类型</div>
            ) : (
              <div className="py-1">
                {["全部", ...courseTypes.filter(t => t === "未分类")].map((type) => {
                  const isAll = type === "全部"
                  const count = isAll ? courses.length : courses.filter(c => c.type === type).length
                  return (
                    <div
                      key={type}
                      className={`flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors group ${
                        selectedType === type
                          ? "bg-[#f0f5ff] text-[#3370ff]"
                          : "text-[#646a73] hover:bg-[#f7f8fa]"
                      }`}
                      onClick={() => setSelectedType(type)}
                    >
                      <span className="text-[13px] font-light truncate">{type}</span>
                      <div className="flex items-center gap-1 shrink-0 ml-2">
                        {!isAll && (
                          <button
                            className="h-5 w-5 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-[#f0f0f0] transition-all"
                            onClick={(e) => {
                              e.stopPropagation()
                              const count = courses.filter(c => c.type === type).length
                              if (count > 0) {
                                setTypeBlockedOpen(true)
                              } else {
                                setDeletingType(type)
                                setDeleteTypeDialogOpen(true)
                              }
                            }}
                          >
                            <Trash2 className="h-3 w-3 text-[#8f959e]" />
                          </button>
                        )}
                        <Badge variant="secondary" className="text-[11px] font-normal">
                          {count}
                        </Badge>
                      </div>
                    </div>
                  )
                })}
                {courseTypes.filter(t => t !== "未分类").length > 0 && (
                  <div className="mx-4 my-1 border-t border-[#f0f0f0]" />
                )}
                {courseTypes.filter(t => t !== "未分类").map((type) => {
                  const count = courses.filter(c => c.type === type).length
                  return (
                    <div
                      key={type}
                      className={`flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors group ${
                        selectedType === type
                          ? "bg-[#f0f5ff] text-[#3370ff]"
                          : "text-[#2b2f36] hover:bg-[#f7f8fa]"
                      }`}
                      onClick={() => setSelectedType(type)}
                    >
                      <span className="text-[13px] truncate">{type}</span>
                      <div className="flex items-center gap-1 shrink-0 ml-2">
                        <button
                          className="h-5 w-5 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-[#f0f0f0] transition-all"
                          onClick={(e) => {
                            e.stopPropagation()
                            setEditingType(type)
                            setEditTypeName(type)
                            setEditTypeError("")
                            setEditTypeDialogOpen(true)
                          }}
                        >
                          <Edit className="h-3 w-3 text-[#8f959e]" />
                        </button>
                        <button
                          className="h-5 w-5 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-[#f0f0f0] transition-all"
                          onClick={(e) => {
                              e.stopPropagation()
                              const count = courses.filter(c => c.type === type).length
                              if (count > 0) {
                                setTypeBlockedOpen(true)
                              } else {
                                setDeletingType(type)
                                setDeleteTypeDialogOpen(true)
                              }
                            }}
                        >
                          <Trash2 className="h-3 w-3 text-[#8f959e]" />
                        </button>
                        <Badge variant="secondary" className="text-[11px] font-normal">
                          {count}
                        </Badge>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* 右侧 - 课程列表 */}
        <div className="flex-1 bg-white rounded-lg flex flex-col min-w-0">
          <div className="flex items-center justify-between px-4 h-11 border-b border-[#f0f0f0]">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-medium text-[#2b2f36]">活动列表</span>
              <Badge variant="secondary" className="text-[11px] font-normal">
                {filteredCourses.length} 个活动
              </Badge>
            </div>
            <Button size="sm" className="h-7 text-xs" onClick={handleOpenCreate}>
              <Plus className="mr-1 h-3 w-3" /> 新增
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredCourses.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <BookOpen className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">该类型下暂无活动</p>
                <p className="text-xs text-muted-foreground mt-1">点击上方"新增"按钮添加</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-4">活动名称</TableHead>
                    <TableHead>活动类型</TableHead>
                    <TableHead>所属组织</TableHead>
                    <TableHead>已上课数</TableHead>
                    <TableHead className="text-right pr-4">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedItems.map((course) => (
                    <TableRow key={course.id}>
                      <TableCell className="pl-4">
                        <span className="text-[13px] text-[#2b2f36] font-medium">{course.name}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-[13px] text-[#8f959e]">{course.type || "-"}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-[13px] text-[#8f959e]">{getOrgName(course.organization_id) || "-"}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-[13px] text-[#2b2f36]">{course.class_count}</span>
                      </TableCell>
                      <TableCell className="text-right pr-4">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleOpenEdit(course)}>
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => { setDeletingCourse(course); setDeleteDialogOpen(true) }}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
          <PaginationBar
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            startIndex={startIndex}
            endIndex={endIndex}
            onPageChange={goToPage}
          />
        </div>
      </div>
      </div>

      {/* 新增类型弹窗 */}
      <Dialog open={typeDialogOpen} onOpenChange={setTypeDialogOpen}>
        <DialogContent className="max-w-sm p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-base">新增活动类型</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-5" {...enterToNext}>
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">类型名称</span>
              <Input value={newTypeName} onChange={(e) => setNewTypeName(e.target.value)} placeholder="如：冥想、瑜伽、疗愈" />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => setTypeDialogOpen(false)}>取消</Button>
              <Button size="sm" onClick={handleAddType} disabled={!newTypeName.trim()}>添加</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 新增/编辑课程弹窗 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-base">{editingCourse ? "编辑活动" : "新增活动"}</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-5" {...enterToNext}>
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">活动类型</span>
              <SelectDropdown
                value={form.type}
                options={courseTypes.filter(t => t !== "未分类").map(t => ({value: t, label: t}))}
                placeholder="选择活动类型"
                onChange={(v) => setForm({ ...form, type: v })}
              />
            </div>
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">活动名称</span>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="请输入活动名称" />
            </div>
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">所属组织</span>
              <SelectDropdown
                value={form.organization_id || ""}
                options={[
                  { value: "", label: "无" },
                  ...organizations.map(o => ({ value: o.id, label: o.name })),
                ]}
                placeholder="选择组织"
                onChange={(v) => setForm({ ...form, organization_id: v })}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>取消</Button>
              <Button size="sm" onClick={handleSave} disabled={saving || !form.name || !form.type}>
                {saving ? "保存中..." : "保存"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 删除课程确认弹窗 */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除活动</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除活动「{deletingCourse?.name}」吗？此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 删除类型确认弹窗 */}
      <AlertDialog open={deleteTypeDialogOpen} onOpenChange={setDeleteTypeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除活动类型</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除类型「{deletingType}」吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <Button variant="destructive" size="sm" onClick={handleDeleteType}>删除</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={typeBlockedOpen} onOpenChange={setTypeBlockedOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>无法删除</AlertDialogTitle>
            <AlertDialogDescription>
              该活动类型存在具体活动，无法删除
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>知道了</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={noOrgDialogOpen} onOpenChange={setNoOrgDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>需要先配置组织</AlertDialogTitle>
            <AlertDialogDescription>系统中暂无组织信息，请先前往组织管理页面配置组织。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => navigate("/organizations")}>前往配置</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 编辑类型弹窗 */}
      <Dialog open={editTypeDialogOpen} onOpenChange={setEditTypeDialogOpen}>
        <DialogContent className="max-w-sm p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-base">编辑活动类型</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-5" {...enterToNext}>
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">类型名称</span>
              <div>
                <Input value={editTypeName} onChange={(e) => { setEditTypeName(e.target.value); setEditTypeError("") }} placeholder="请输入类型名称" />
                {editTypeError && <p className="text-xs text-destructive mt-1">{editTypeError}</p>}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => { setEditTypeDialogOpen(false); setEditingType(null); setEditTypeError("") }}>取消</Button>
              <Button size="sm" onClick={handleRenameType} disabled={saving || !editTypeName.trim()}>
                {saving ? "保存中..." : "保存"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
