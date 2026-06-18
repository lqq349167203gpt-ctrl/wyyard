import { useEffect, useState, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { useEnterToNext } from "@/hooks/use-enter-to-next"
import { Trash2, Edit, ArrowUp, ArrowDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { courseTypeApi, organizationApi, type CourseType, type Organization } from "@/lib/api"
import { SelectDropdown } from "@/components/select-dropdown"

export default function CoursesPage() {
  const enterToNext = useEnterToNext()
  const [courseTypes, setCourseTypes] = useState<CourseType[]>([])
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingType, setDeletingType] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [editingType, setEditingType] = useState<string | null>(null)
  const [formName, setFormName] = useState("")
  const [formOrgId, setFormOrgId] = useState("")
  const [formError, setFormError] = useState("")
  const [typeBlockedOpen, setTypeBlockedOpen] = useState(false)
  const [noOrgDialogOpen, setNoOrgDialogOpen] = useState(false)
  const navigate = useNavigate()

  const loadData = useCallback(() => {
    courseTypeApi.list().then(setCourseTypes).catch(() => {})
    organizationApi.list().then(setOrganizations).catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const getOrgName = (orgId: string) => organizations.find(o => o.id === orgId)?.name || ""

  const handleOpenCreate = () => {
    if (organizations.length === 0) { setNoOrgDialogOpen(true); return }
    setEditingType(null)
    setFormName("")
    setFormOrgId(organizations[0]?.id || "")
    setFormError("")
    setDialogOpen(true)
  }

  const handleOpenEdit = (type: CourseType) => {
    setEditingType(type.name)
    setFormName(type.name)
    setFormOrgId(type.organization_id || "")
    setFormError("")
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!formName.trim()) return
    setSaving(true)
    setFormError("")
    try {
      if (editingType) {
        // 重命名
        if (formName.trim() !== editingType) {
          await courseTypeApi.rename(editingType, formName.trim())
        }
        // 更新组织
        await courseTypeApi.update(formName.trim(), { organization_id: formOrgId })
      } else {
        await courseTypeApi.create(formName.trim(), formOrgId)
      }
      setDialogOpen(false)
      loadData()
    } catch (e: any) {
      setFormError(e?.message || "保存失败")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingType) return
    try {
      await courseTypeApi.delete(deletingType)
      setDeleteDialogOpen(false)
      setDeletingType(null)
      loadData()
    } catch (e: any) {
      if (e?.message?.includes("存在")) {
        setDeleteDialogOpen(false)
        setTypeBlockedOpen(true)
      }
    }
  }

  const handleMoveType = async (typeName: string, direction: "up" | "down") => {
    const names = courseTypes.map(t => t.name)
    const idx = names.indexOf(typeName)
    if (idx < 0) return
    const targetIdx = direction === "up" ? idx - 1 : idx + 1
    if (targetIdx < 0 || targetIdx >= names.length) return
    const reordered = [...names]
    const tmp = reordered[idx]
    reordered[idx] = reordered[targetIdx]
    reordered[targetIdx] = tmp
    try {
      await courseTypeApi.reorder(reordered)
      loadData()
    } catch (error) {
      console.error("排序失败:", error)
    }
  }

  return (
    <>
      <div className="px-6 pt-12 pb-6 space-y-3">
        {/* 页面头部 */}
        <div className="flex items-center justify-between pb-2">
          <div>
            <h1 className="text-lg font-semibold text-left">活动配置</h1>
            <p className="text-xs text-muted-foreground mt-1.5">共 {courseTypes.length} 个活动类型</p>
          </div>
        </div>

        {/* 主内容区 */}
        <div className="bg-white rounded-lg" style={{ minHeight: 'calc(100vh - 180px)' }}>
          <div className="flex items-center justify-between px-4 h-11 border-b border-[#f0f0f0]">
            <span className="text-[13px] font-medium text-[#2b2f36]">活动类型</span>
            <Button variant="ghost" size="sm" className="h-7 text-xs text-[#3370ff] hover:text-[#3370ff] hover:bg-[#f0f5ff]" onClick={handleOpenCreate}>
              新增
            </Button>
          </div>
          <div className="overflow-y-auto">
            {loading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">加载中...</div>
            ) : courseTypes.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">暂无类型</div>
            ) : (
              <div className="py-1">
                {/* 未分类 */}
                {courseTypes.filter(t => t.name === "未分类").map((type) => (
                  <div
                    key={type.name}
                    className="flex items-center justify-between px-4 py-2.5 text-[#646a73]"
                  >
                    <span className="text-[13px] font-light truncate">{type.name}</span>
                    <span className="text-[12px] text-[#8f959e]">{getOrgName(type.organization_id) || "-"}</span>
                  </div>
                ))}
                {/* 分割线 */}
                {courseTypes.filter(t => t.name !== "未分类").length > 0 && courseTypes.some(t => t.name === "未分类") && (
                  <div className="mx-4 my-1 border-t border-[#f0f0f0]" />
                )}
                {/* 用户自定义类型 */}
                {courseTypes.filter(t => t.name !== "未分类").map((type, idx) => (
                  <div
                    key={type.name}
                    className="flex items-center justify-between px-4 py-2.5 text-[#2b2f36] hover:bg-[#f7f8fa] group transition-colors"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className="flex flex-col items-center gap-0 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button className="text-[#8f959e] hover:text-[#3370ff] leading-none" onClick={() => handleMoveType(type.name, "up")}>
                          <ArrowUp className="h-3 w-3" />
                        </button>
                        <button className="text-[#8f959e] hover:text-[#3370ff] leading-none" onClick={() => handleMoveType(type.name, "down")}>
                          <ArrowDown className="h-3 w-3" />
                        </button>
                      </div>
                      <span className="text-[13px] truncate">{type.name}</span>
                      <span className="text-[12px] text-[#8f959e] ml-2">{getOrgName(type.organization_id) || "-"}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      <button
                        className="h-5 w-5 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-[#f0f0f0] transition-all"
                        onClick={() => handleOpenEdit(type)}
                      >
                        <Edit className="h-3 w-3 text-[#8f959e]" />
                      </button>
                      <button
                        className="h-5 w-5 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-[#f0f0f0] transition-all"
                        onClick={() => { setDeletingType(type.name); setDeleteDialogOpen(true) }}
                      >
                        <Trash2 className="h-3 w-3 text-[#8f959e]" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 新增/编辑类型弹窗 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-base">{editingType ? "编辑活动类型" : "新增活动类型"}</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-5" {...enterToNext}>
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">类型名称</span>
              <div>
                <Input value={formName} onChange={(e) => { setFormName(e.target.value); setFormError("") }} placeholder="如：冥想、瑜伽、疗愈" />
                {formError && <p className="text-xs text-destructive mt-1">{formError}</p>}
              </div>
            </div>
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">所属组织</span>
              <SelectDropdown
                value={formOrgId}
                options={organizations.map(o => ({ value: o.id, label: o.name }))}
                placeholder="选择组织"
                onChange={setFormOrgId}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>取消</Button>
              <Button size="sm" onClick={handleSave} disabled={saving || !formName.trim()}>
                {saving ? "保存中..." : "保存"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 删除类型确认弹窗 */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除活动类型</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除类型「{deletingType}」吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <Button variant="destructive" size="sm" onClick={handleDelete}>删除</Button>
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
    </>
  )
}
