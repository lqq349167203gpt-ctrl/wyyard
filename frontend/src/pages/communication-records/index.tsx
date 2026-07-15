import { useState, useEffect, useCallback, useMemo } from "react"
import { Plus, X, Pencil, Trash2 } from "lucide-react"
import { communicationRecordApi, customerApi, memberIdentityApi, type CommunicationRecord, type CommunicationRecordCreate, type Customer } from "@/lib/api"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { usePagination } from "@/hooks/use-pagination"
import { PaginationBar } from "@/components/pagination-bar"
import { CustomerSearchInput } from "@/components/customer-search-input"
import { SelectDropdown } from "@/components/select-dropdown"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"

export default function CommunicationRecordsPage() {
  const [records, setRecords] = useState<CommunicationRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<CommunicationRecordCreate>({ customer_nickname: "", content: "" })
  const [saving, setSaving] = useState(false)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [identityNames, setIdentityNames] = useState<string[]>([])

  // 编辑状态
  const [editTarget, setEditTarget] = useState<CommunicationRecord | null>(null)
  const [editForm, setEditForm] = useState<CommunicationRecordCreate>({ customer_nickname: "", content: "" })
  const [editSaving, setEditSaving] = useState(false)

  // 删除状态
  const [deleteTarget, setDeleteTarget] = useState<CommunicationRecord | null>(null)
  const [deleting, setDeleting] = useState(false)

  // 搜索状态
  const [searchNickname, setSearchNickname] = useState("")
  const [searchIdentity, setSearchIdentity] = useState("")

  // 客户昵称→身份映射
  const nicknameToIdentity = useMemo(() => {
    const map: Record<string, string> = {}
    customers.forEach(c => {
      if (c.nickname) map[c.nickname] = c.member_type || ""
    })
    return map
  }, [customers])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await communicationRecordApi.list()
      setRecords(res)
    } catch {
      setRecords([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    customerApi.list().then(setCustomers).catch(() => setCustomers([]))
    memberIdentityApi.list().then(list => setIdentityNames(list.map(i => i.name).reverse())).catch(() => setIdentityNames([]))
  }, [fetchData])

  // 筛选后的记录
  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      if (searchNickname && !r.customer_nickname.includes(searchNickname)) return false
      if (searchIdentity) {
        const identity = nicknameToIdentity[r.customer_nickname] || ""
        if (identity !== searchIdentity) return false
      }
      return true
    })
  }, [records, searchNickname, searchIdentity, nicknameToIdentity])

  const { paginatedItems, currentPage, totalPages, totalItems, goToPage, startIndex, endIndex } = usePagination(filteredRecords, { pageSize: 10 })

  const handleClear = () => {
    setSearchNickname("")
    setSearchIdentity("")
  }

  // 新增
  const handleSave = async () => {
    if (!form.customer_nickname.trim() || !form.content.trim()) return
    setSaving(true)
    try {
      await communicationRecordApi.create(form)
      setDialogOpen(false)
      setForm({ customer_nickname: "", content: "" })
      fetchData()
    } catch {
      // ignore
    } finally {
      setSaving(false)
    }
  }

  // 编辑
  const handleEdit = (record: CommunicationRecord) => {
    setEditTarget(record)
    setEditForm({ customer_nickname: record.customer_nickname, content: record.content })
  }

  const handleEditSave = async () => {
    if (!editTarget || !editForm.customer_nickname.trim() || !editForm.content.trim()) return
    setEditSaving(true)
    try {
      await communicationRecordApi.update(editTarget.id, editForm)
      setEditTarget(null)
      fetchData()
    } catch {
      // ignore
    } finally {
      setEditSaving(false)
    }
  }

  // 删除
  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await communicationRecordApi.delete(deleteTarget.id)
      setDeleteTarget(null)
      fetchData()
    } catch {
      // ignore
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-lg font-semibold">沟通记录</h1>
        <p className="text-xs text-muted-foreground mt-0.5">管理与查看沟通记录</p>
      </div>

      {/* 搜索栏 */}
      <div className="flex items-end gap-3 flex-wrap">
        <div className="w-44">
          <CustomerSearchInput
            customers={customers}
            value={searchNickname}
            onChange={(v) => { setSearchNickname(typeof v === "string" ? v : "") }}
            placeholder="搜索昵称"
            filterSelected={false}
          />
        </div>
        <SelectDropdown
          className="w-36"
          value={searchIdentity}
          options={[{value: "", label: "全部身份"}, ...identityNames.map(id => ({value: id, label: id}))]}
          placeholder="全部身份"
          onChange={(v) => { setSearchIdentity(v) }}
        />
        <button
          onClick={handleClear}
          className="h-8 px-4 rounded-md border border-[#e0e0e0] text-[12px] text-[#4e535a] hover:bg-[#f5f6f7] flex items-center gap-1"
        >
          <X className="h-3.5 w-3.5" />
          清空
        </button>
        <div className="flex-1" />
        <button
          onClick={() => setDialogOpen(true)}
          className="h-8 px-4 bg-[#3370ff] text-white text-[12px] rounded-[2px] hover:bg-[#2860e1] flex items-center gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" />
          新增
        </button>
      </div>

      {/* 表格 */}
      <div className="bg-white rounded-lg">
        {loading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">加载中...</div>
        ) : filteredRecords.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">暂无数据</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4 w-[120px]">用户昵称</TableHead>
                <TableHead className="w-[100px]">身份</TableHead>
                <TableHead>沟通记录</TableHead>
                <TableHead className="w-[100px]">创建人</TableHead>
                <TableHead className="w-[160px]">创建日期</TableHead>
                <TableHead className="w-[80px] text-right pr-4">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedItems.map((record) => (
                <TableRow key={record.id} className="group">
                  <TableCell className="pl-4 text-[#2b2f36]">{record.customer_nickname}</TableCell>
                  <TableCell className="text-[#2b2f36]">{nicknameToIdentity[record.customer_nickname] || "-"}</TableCell>
                  <TableCell className="text-[#2b2f36]">{record.content}</TableCell>
                  <TableCell className="text-[#8f959e]">{record.creator || "-"}</TableCell>
                  <TableCell className="text-[#8f959e]">{record.created_at ? new Date(record.created_at).toLocaleString("zh-CN") : "-"}</TableCell>
                  <TableCell className="text-right pr-4">
                    <div className="flex justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleEdit(record)}
                        className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-[#f5f6f7]"
                      >
                        <Pencil className="h-3.5 w-3.5 text-[#8f959e]" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(record)}
                        className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-[#f5f6f7]"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-[#f54a45]" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <PaginationBar
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={totalItems}
          startIndex={startIndex}
          endIndex={endIndex}
          onPageChange={goToPage}
        />
      </div>

      {/* 新增弹窗 */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setForm({ customer_nickname: "", content: "" }) }}>
        <DialogContent className="max-w-lg p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-base">新增沟通记录</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-4">
            <div className="grid grid-cols-[70px_1fr] items-center gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">用户昵称</span>
              <CustomerSearchInput
                customers={customers}
                value={form.customer_nickname}
                onChange={(v) => setForm({ ...form, customer_nickname: typeof v === "string" ? v : "" })}
                placeholder="搜索昵称"
                filterSelected={false}
              />
            </div>
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2">沟通记录</span>
              <textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder="请输入沟通记录"
                rows={4}
                className="w-full px-3 py-2 text-[12px] border border-[#e8eaed] rounded-[2px] outline-none focus:border-[#3370ff] resize-none"
              />
            </div>
          </div>
          <div className="px-6 py-4 border-t flex justify-end gap-2">
            <button
              onClick={() => { setDialogOpen(false); setForm({ customer_nickname: "", content: "" }) }}
              className="h-9 px-4 text-[13px] text-[#646a73] border border-[#e8eaed] rounded-[4px] hover:bg-[#f5f6f7]"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={!form.customer_nickname.trim() || !form.content.trim() || saving}
              className="h-9 px-4 text-[13px] text-white bg-[#3370ff] rounded-[4px] hover:bg-[#2860e1] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "保存中..." : "保存"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 编辑弹窗 */}
      <Dialog open={!!editTarget} onOpenChange={(open) => { if (!open) setEditTarget(null) }}>
        <DialogContent className="max-w-lg p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-base">编辑沟通记录</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-4">
            <div className="grid grid-cols-[70px_1fr] items-center gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">用户昵称</span>
              <CustomerSearchInput
                customers={customers}
                value={editForm.customer_nickname}
                onChange={(v) => setEditForm({ ...editForm, customer_nickname: typeof v === "string" ? v : "" })}
                placeholder="搜索昵称"
                filterSelected={false}
              />
            </div>
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2">沟通记录</span>
              <textarea
                value={editForm.content}
                onChange={(e) => setEditForm({ ...editForm, content: e.target.value })}
                placeholder="请输入沟通记录"
                rows={4}
                className="w-full px-3 py-2 text-[12px] border border-[#e8eaed] rounded-[2px] outline-none focus:border-[#3370ff] resize-none"
              />
            </div>
          </div>
          <div className="px-6 py-4 border-t flex justify-end gap-2">
            <button
              onClick={() => setEditTarget(null)}
              className="h-9 px-4 text-[13px] text-[#646a73] border border-[#e8eaed] rounded-[4px] hover:bg-[#f5f6f7]"
            >
              取消
            </button>
            <button
              onClick={handleEditSave}
              disabled={!editForm.customer_nickname.trim() || !editForm.content.trim() || editSaving}
              className="h-9 px-4 text-[13px] text-white bg-[#3370ff] rounded-[4px] hover:bg-[#2860e1] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {editSaving ? "保存中..." : "保存"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 删除确认弹窗 */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <DialogContent className="w-[360px] max-w-[90vw] p-0 gap-0">
          <div className="px-5 py-3 border-b border-[#f0f0f0]">
            <h3 className="text-[14px] font-normal">删除沟通记录</h3>
          </div>
          <div className="px-5 py-4">
            <p className="text-[12px] text-[#2b2f36]">
              确定要删除「<span className="font-medium">{deleteTarget?.customer_nickname}</span>」的沟通记录吗？删除后不可恢复。
            </p>
          </div>
          <div className="flex justify-end gap-2 px-5 py-3 border-t border-[#f0f0f0]">
            <button
              onClick={() => setDeleteTarget(null)}
              className="h-9 px-4 text-[13px] text-[#646a73] border border-[#e8eaed] rounded-[4px] hover:bg-[#f5f6f7]"
            >
              取消
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="h-9 px-4 text-[13px] text-white bg-[#f54a45] rounded-[4px] hover:bg-[#e03e3a] disabled:opacity-50"
            >
              {deleting ? "删除中..." : "确定删除"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
