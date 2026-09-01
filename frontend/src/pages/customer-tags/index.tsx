import { useEffect, useMemo, useState } from "react"
import { ArrowLeft, LockKeyhole, Plus, Users } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PaginationBar } from "@/components/pagination-bar"
import { usePagination } from "@/hooks/use-pagination"
import { customerTagApi, followUpStatusApi, type CustomerTag, type CustomerTagScope, type FollowUpStatusConfig } from "@/lib/api"

type ScopeFilter = "all" | CustomerTagScope | "follow-up"

export default function CustomerTagsPage() {
  const navigate = useNavigate()
  const [tags, setTags] = useState<CustomerTag[]>([])
  const [statuses, setStatuses] = useState<FollowUpStatusConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("all")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<CustomerTag | null>(null)
  const [editingStatus, setEditingStatus] = useState<FollowUpStatusConfig | null>(null)
  const [name, setName] = useState("")
  const [scope, setScope] = useState<CustomerTagScope>("public")
  const [description, setDescription] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [deleteTarget, setDeleteTarget] = useState<CustomerTag | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const [tagItems, statusItems] = await Promise.all([customerTagApi.list(), followUpStatusApi.list(true)])
      setTags(tagItems)
      setStatuses(statusItems)
    } catch (e) {
      setError(e instanceof Error ? e.message : "标签加载失败")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const filteredTags = useMemo(
    () => tags.filter(tag => scopeFilter === "all" || (scopeFilter !== "follow-up" && tag.scope === scopeFilter)),
    [scopeFilter, tags],
  )
  const { paginatedItems, currentPage, totalPages, totalItems, goToPage, startIndex, endIndex } = usePagination(filteredTags)

  const openCreate = () => {
    setEditing(null)
    setEditingStatus(null)
    setName("")
    setScope("public")
    setDescription("")
    setError("")
    setDialogOpen(true)
  }

  const openEdit = (tag: CustomerTag) => {
    setEditing(tag)
    setEditingStatus(null)
    setName(tag.name)
    setScope(tag.scope)
    setDescription(tag.description)
    setError("")
    setDialogOpen(true)
  }

  const openStatusEdit = (status: FollowUpStatusConfig) => {
    setEditing(null)
    setEditingStatus(status)
    setName(status.name)
    setDescription(status.description)
    setError("")
    setDialogOpen(true)
  }

  const save = async () => {
    const normalizedName = name.trim()
    if (!normalizedName) {
      setError(scopeFilter === "follow-up" ? "请输入状态名称" : "请输入标签名称")
      return
    }
    setSaving(true)
    setError("")
    try {
      if (scopeFilter === "follow-up") {
        if (!description.trim()) {
          setError("请输入状态描述")
          return
        }
        if (editingStatus) {
          await followUpStatusApi.update(editingStatus.id, { name: normalizedName, description: description.trim() })
        } else {
          await followUpStatusApi.create({ name: normalizedName, description: description.trim() })
        }
      } else if (editing) {
        await customerTagApi.update(editing.id, { name: normalizedName, description: description.trim() })
      } else {
        await customerTagApi.create({ name: normalizedName, scope, description: description.trim() })
      }
      setDialogOpen(false)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败")
    } finally {
      setSaving(false)
    }
  }

  const toggleStatus = async (status: FollowUpStatusConfig) => {
    try {
      await followUpStatusApi.update(status.id, { enabled: !status.enabled })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "更新失败")
    }
  }

  const remove = async () => {
    if (!deleteTarget) return
    try {
      await customerTagApi.delete(deleteTarget.id)
      setDeleteTarget(null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "停用失败")
      setDeleteTarget(null)
    }
  }

  return (
    <div className="min-h-full bg-[#f4f5f6] p-4">
      <div className="overflow-hidden rounded-xl bg-white shadow-[0_1px_3px_rgba(33,38,49,.06)]">
        <div className="flex h-[52px] items-center gap-3 border-b border-[#f0f0f0] px-5">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-[#646a73] hover:bg-[#f5f6f7] hover:text-[#1f2329]"
            onClick={() => navigate("/healing-records")}
            aria-label="返回客户资料"
            title="返回客户资料"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-[15px] font-medium text-[#212631]">{scopeFilter === "follow-up" ? "跟进状态配置" : "客户标签"}</h1>
            <p className="mt-0.5 text-[11px] text-[#8f959e]">{scopeFilter === "follow-up" ? "配置客户跟进状态及必填描述" : "公共标签团队共享，我的标签仅自己可见"}</p>
          </div>
          <Button className="ml-auto h-8 bg-[#212631] px-3 text-[12px] text-white hover:bg-[#303641]" onClick={openCreate}>
            <Plus className="mr-1 h-3.5 w-3.5" />{scopeFilter === "follow-up" ? "新建状态" : "新建标签"}
          </Button>
        </div>

        <div className="flex items-center gap-1 border-b border-[#f0f0f0] px-4 py-2.5">
          {([
            ["all", "全部"],
            ["public", "公共标签"],
            ["private", "我的标签"],
            ["follow-up", "跟进状态"],
          ] as [ScopeFilter, string][]).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setScopeFilter(value)}
              className={`h-8 rounded-[6px] px-3 text-[12px] transition-colors ${scopeFilter === value ? "bg-[#eef2f8] text-[#212631]" : "text-[#79838f] hover:bg-[#f7f8fa]"}`}
            >
              {label}
            </button>
          ))}
          {error && <span className="ml-3 text-[11px] text-[#c4506a]">{error}</span>}
        </div>

        {loading ? (
          <div className="py-16 text-center text-[12px] text-[#8f959e]">加载中...</div>
        ) : scopeFilter === "follow-up" ? (
          statuses.length === 0 ? (
            <div className="py-16 text-center text-[12px] text-[#8f959e]">暂无跟进状态</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5">状态名称</TableHead>
                  <TableHead>描述</TableHead>
                  <TableHead className="text-right">使用人数</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="pr-5 text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {statuses.map(status => (
                  <TableRow key={status.id} className="group">
                    <TableCell className="pl-5 text-[13px] font-medium text-[#1f2329]">{status.name}</TableCell>
                    <TableCell className="max-w-[420px] truncate text-[13px] text-[#4e535a]" title={status.description}>{status.description}</TableCell>
                    <TableCell className="text-right tabular-nums text-[#2b2f36]">{status.usage_count} 人</TableCell>
                    <TableCell className={status.enabled ? "text-[#3370ff]" : "text-[#8f959e]"}>{status.enabled ? "启用" : "停用"}</TableCell>
                    <TableCell className="pr-5 text-right">
                      <div className="flex justify-end gap-3 opacity-0 transition-opacity group-hover:opacity-100">
                        <button type="button" className="text-[#3370ff]" onClick={() => openStatusEdit(status)}>编辑</button>
                        <button type="button" className="text-[#8f959e] hover:text-[#c4506a]" onClick={() => toggleStatus(status)}>{status.enabled ? "停用" : "启用"}</button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )
        ) : paginatedItems.length === 0 ? (
          <div className="py-16 text-center text-[12px] text-[#8f959e]">暂无标签</div>
        ) : (
          <Table style={{ tableLayout: "fixed" }}>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5" style={{ width: 190 }}>标签名称</TableHead>
                <TableHead style={{ width: 120 }}>可见范围</TableHead>
                <TableHead>说明</TableHead>
                <TableHead style={{ width: 110 }}>使用人数</TableHead>
                <TableHead style={{ width: 130 }}>创建人</TableHead>
                <TableHead className="pr-5 text-right" style={{ width: 100 }}>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedItems.map(tag => (
                <TableRow key={tag.id} className="hover:bg-[#f7f8fa]">
                  <TableCell className="pl-5">
                    <span className="inline-flex max-w-[160px] items-center rounded-full border border-[#e1e4e7] bg-white px-2.5 py-1 text-[12px] font-medium text-[#2b2f36]">
                      <span className="truncate">{tag.name}</span>
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1 text-[12px] text-[#646a73]">
                      {tag.scope === "public" ? <Users className="h-3.5 w-3.5" /> : <LockKeyhole className="h-3.5 w-3.5" />}
                      {tag.scope === "public" ? "团队共享" : "仅自己"}
                    </span>
                  </TableCell>
                  <TableCell className="truncate text-[12px] text-[#646a73]">{tag.description || <span className="text-[#d0d3d6]">—</span>}</TableCell>
                  <TableCell className="text-[12px] tabular-nums text-[#2b2f36]">{tag.usage_count} 人</TableCell>
                  <TableCell className="truncate text-[12px] text-[#646a73]">{tag.created_by_name || "—"}</TableCell>
                  <TableCell className="pr-5 text-right">
                    <div className="flex items-center justify-end gap-3 text-[12px]">
                      <button type="button" className="text-[#3370ff] hover:text-[#245bdb]" onClick={() => openEdit(tag)}>
                        编辑
                      </button>
                      <button type="button" className="text-[#8f959e] hover:text-[#c4506a]" onClick={() => setDeleteTarget(tag)}>
                        停用
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {scopeFilter !== "follow-up" && <PaginationBar currentPage={currentPage} totalPages={totalPages} totalItems={totalItems} startIndex={startIndex} endIndex={endIndex} onPageChange={goToPage} />}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[420px] max-w-[92vw]">
          <DialogHeader><DialogTitle className="text-[14px] font-medium">{scopeFilter === "follow-up" ? (editingStatus ? "编辑跟进状态" : "新建跟进状态") : (editing ? "编辑标签" : "新建标签")}</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-1">
            <div>
              <label className="mb-1.5 block text-[12px] text-[#4e535a]">{scopeFilter === "follow-up" ? "状态名称" : "标签名称"}</label>
              <Input value={name} maxLength={30} onChange={e => { setName(e.target.value); setError("") }} placeholder={scopeFilter === "follow-up" ? "例如：重点跟进" : "例如：高意向、亲子需求"} />
            </div>
            {scopeFilter !== "follow-up" && !editing && (
              <div>
                <label className="mb-1.5 block text-[12px] text-[#4e535a]">可见范围</label>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    ["public", "公共标签", "团队成员均可查看"],
                    ["private", "我的标签", "只有自己可以查看"],
                  ] as [CustomerTagScope, string, string][]).map(([value, label, hint]) => (
                    <button key={value} type="button" onClick={() => setScope(value)} className={`rounded-[8px] border px-3 py-2.5 text-left ${scope === value ? "border-[#9aabc1] bg-[#f4f7fb]" : "border-[#e1e4e7] bg-white hover:bg-[#f7f8fa]"}`}>
                      <span className="block text-[12px] font-medium text-[#212631]">{label}</span>
                      <span className="mt-0.5 block text-[11px] text-[#8f959e]">{hint}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <label className="mb-1.5 block text-[12px] text-[#4e535a]">说明 {scopeFilter === "follow-up" && <span className="text-[#c4506a]">*</span>} {scopeFilter !== "follow-up" && <span className="text-[#a8b1bd]">（选填）</span>}</label>
              <Textarea value={description} maxLength={200} onChange={e => { setDescription(e.target.value); setError("") }} placeholder={scopeFilter === "follow-up" ? "必填，说明此状态适用于哪类客户" : "说明这个标签适合标记哪类客户"} className="min-h-[86px] resize-none" />
            </div>
            {error && <p className="text-[11px] text-[#c4506a]">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" className="h-8 text-[12px]" onClick={() => setDialogOpen(false)}>取消</Button>
              <Button className="h-8 bg-[#212631] text-[12px] text-white hover:bg-[#303641]" onClick={save} disabled={saving}>{saving ? "保存中..." : "保存"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>停用标签</AlertDialogTitle>
            <AlertDialogDescription>停用「{deleteTarget?.name}」后，客户身上的该标签会被移除，历史客户资料不会删除。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={remove}>确定停用</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
