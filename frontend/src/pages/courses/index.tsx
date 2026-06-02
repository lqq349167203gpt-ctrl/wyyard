import { useEffect, useState } from "react"
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
import { courseApi, courseTypeApi, type Course } from "@/lib/api"
import { SelectDropdown } from "@/components/select-dropdown"
import { usePagination } from "@/hooks/use-pagination"
import { PaginationBar } from "@/components/pagination-bar"

export default function CoursesPage() {
  const [courses, setCourses] = useState<Course[]>([])
  const [courseTypes, setCourseTypes] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedType, setSelectedType] = useState<string>("全部")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [typeDialogOpen, setTypeDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingCourse, setDeletingCourse] = useState<Course | null>(null)
  const [editingCourse, setEditingCourse] = useState<Course | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ type: "", name: "", class_count: 0 })
  const [newTypeName, setNewTypeName] = useState("")
  const [deleteTypeDialogOpen, setDeleteTypeDialogOpen] = useState(false)
  const [deletingType, setDeletingType] = useState<string | null>(null)

  const loadData = () => {
    courseApi.list()
      .then(setCourses)
      .catch(() => {})
      .finally(() => setLoading(false))
    courseTypeApi.list()
      .then(setCourseTypes)
      .catch(() => {})
  }

  useEffect(() => {
    loadData()
  }, [])

  // Get courses for selected type
  const filteredCourses = selectedType === "全部" ? courses : courses.filter(c => c.type === selectedType)

  const { paginatedItems, currentPage, totalPages, totalItems, goToPage, startIndex, endIndex } = usePagination(filteredCourses)

  const handleOpenCreate = () => {
    setEditingCourse(null)
    const defaultType = selectedType === "全部" ? (courseTypes[0] || "") : selectedType
    setForm({ type: defaultType, name: "", class_count: 0 })
    setDialogOpen(true)
  }

  const handleOpenEdit = (course: Course) => {
    setEditingCourse(course)
    setForm({ type: course.type, name: course.name, class_count: course.class_count })
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

  return (
    <div className="px-6 pt-12 pb-6 space-y-3">
      {/* 页面头部 */}
      <div className="flex items-center justify-between pb-2">
        <div>
          <h1 className="text-lg font-semibold text-left">沙龙类型</h1>
          <p className="text-xs text-muted-foreground mt-1.5">
            共 {courseTypes.length} 个类型，{courses.length} 个课程
          </p>
        </div>
      </div>

      {/* 主内容区 - 左右布局 */}
      <div className="flex gap-4" style={{ height: 'calc(100vh - 180px)' }}>
        {/* 左侧 - 课程类型列表 */}
        <div className="w-[234px] bg-white rounded-lg flex flex-col shrink-0">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#f0f0f0]">
            <span className="text-[13px] font-medium text-[#2b2f36]">课程类型</span>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => { setNewTypeName(""); setTypeDialogOpen(true) }}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">加载中...</div>
            ) : courseTypes.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                暂无类型
              </div>
            ) : (
              <div className="py-1">
                {/* 系统类型 */}
                {["全部", ...courseTypes.filter(t => t === "未分类")].map((type) => {
                  const isAll = type === "全部"
                  const count = isAll ? courses.length : courses.filter(c => c.type === type).length
                  return (
                    <div
                      key={type}
                      className={`flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors ${
                        selectedType === type
                          ? "bg-[#f0f5ff] text-[#3370ff]"
                          : "text-[#646a73] hover:bg-[#f7f8fa]"
                      }`}
                      onClick={() => setSelectedType(type)}
                    >
                      <span className="text-[13px] font-light truncate">{type}</span>
                      <Badge variant="secondary" className="text-[11px] font-normal shrink-0 ml-2">
                        {count}
                      </Badge>
                    </div>
                  )
                })}
                {/* 分割线 */}
                {courseTypes.filter(t => t !== "未分类").length > 0 && (
                  <div className="mx-4 my-1 border-t border-[#f0f0f0]" />
                )}
                {/* 用户创建的类型 */}
                {courseTypes.filter(t => t !== "未分类").map((type) => {
                  const count = courses.filter(c => c.type === type).length
                  return (
                    <div
                      key={type}
                      className={`flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors ${
                        selectedType === type
                          ? "bg-[#f0f5ff] text-[#3370ff]"
                          : "text-[#2b2f36] hover:bg-[#f7f8fa]"
                      }`}
                      onClick={() => setSelectedType(type)}
                    >
                      <span className="text-[13px] truncate">{type}</span>
                      <Badge variant="secondary" className="text-[11px] font-normal shrink-0 ml-2">
                        {count}
                      </Badge>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* 右侧 - 课程列表 */}
        <div className="flex-1 bg-white rounded-lg flex flex-col min-w-0">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#f0f0f0]">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-medium text-[#2b2f36]">{selectedType}</span>
              <Badge variant="secondary" className="text-[11px] font-normal">
                {filteredCourses.length} 个课程
              </Badge>
              {selectedType !== "全部" && (
                <button
                  className="h-5 w-5 flex items-center justify-center rounded hover:bg-[#f0f0f0] transition-colors"
                  onClick={() => { setDeletingType(selectedType); setDeleteTypeDialogOpen(true) }}
                >
                  <Trash2 className="h-3 w-3 text-[#8f959e]" />
                </button>
              )}
            </div>
            <Button size="sm" className="h-7 text-xs" onClick={handleOpenCreate}>
              <Plus className="mr-1 h-3 w-3" /> 新增课程
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredCourses.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <BookOpen className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">该类型下暂无课程</p>
                <p className="text-xs text-muted-foreground mt-1">点击上方"新增课程"按钮添加</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-4">课程名称</TableHead>
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

      {/* 新增类型弹窗 */}
      <Dialog open={typeDialogOpen} onOpenChange={setTypeDialogOpen}>
        <DialogContent className="max-w-sm p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-base">新增课程类型</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-5">
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">类型名称</span>
              <Input value={newTypeName} onChange={(e) => setNewTypeName(e.target.value)} placeholder="如：冥想、瑜伽、疗愈" />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => setTypeDialogOpen(false)}>取消</Button>
              <Button size="sm" onClick={handleAddType} disabled={!newTypeName.trim()}>
                添加
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 新增/编辑课程弹窗 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-base">{editingCourse ? "编辑课程" : "新增课程"}</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-5">
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">课程类型</span>
              <SelectDropdown
                value={form.type}
                options={courseTypes.filter(t => t !== "未分类").map(t => ({value: t, label: t}))}
                placeholder="选择课程类型"
                onChange={(v) => setForm({ ...form, type: v })}
              />
            </div>

            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">课程名称</span>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="请输入课程名称" />
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
            <AlertDialogTitle>删除课程</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除课程「{deletingCourse?.name}」吗？此操作不可撤销。
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
            <AlertDialogTitle>删除课程类型</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除类型「{deletingType}」吗？该类型下的课程不会被删除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteType}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
