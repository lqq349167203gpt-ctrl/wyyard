import { useState, useEffect, useCallback, useMemo } from "react"
import { Plus, X, Edit, Trash2, Inbox } from "lucide-react"
import { communicationRecordApi, customerApi, memberIdentityApi, type CommunicationRecord, type CommunicationRecordCreate, type Customer } from "@/lib/api"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
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

  const nicknameToName = useMemo(() => {
    const map: Record<string, string> = {}
    customers.forEach(c => {
      if (c.nickname && c.name && c.name !== c.nickname) map[c.nickname] = c.name
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
    <div className="dv-root bg-[#f4f5f6] h-full p-4 flex flex-col gap-3">
      <style>{`.dv-root { font-family: -apple-system, "PingFang SC", "Helvetica Neue", sans-serif; }`}</style>
      {/* 标题栏 */}
      <div className="flex items-center flex-wrap gap-2 rounded-xl bg-white shadow-[0_1px_3px_rgba(33,38,49,.06)] px-5 h-[52px]">
        <span className="text-[15px] font-bold text-[#212631] whitespace-nowrap">沟通记录</span>
        <span className="text-[11.5px] text-[#a8b1bd] ml-2.5 whitespace-nowrap">管理与查看全部客户沟通记录</span>
      </div>
      {/* 表格卡：筛选条 + 数据表 */}
      <div className="rounded-xl bg-white shadow-[0_2px_4px_rgba(33,38,49,.05)] overflow-hidden flex flex-col flex-1 min-h-0">
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-[#f0f0f0]">
          <div className="w-[172px]">
            <CustomerSearchInput
              customers={customers}
              value={searchNickname}
              onChange={(v) => { setSearchNickname(typeof v === "string" ? v : "") }}
              placeholder="搜索昵称"
              filterSelected={false}
              className="border-[#e1e4e7] bg-white px-2.5 placeholder:text-[#a8b1bd]"
              rounded="7px"
            />
          </div>
          <SelectDropdown
            className="w-[138px]"
            buttonClassName="border-[#e1e4e7] bg-white px-2.5"
            rounded="7px"
            value={searchIdentity}
            options={[{value: "", label: "全部身份"}, ...identityNames.map(id => ({value: id, label: id}))]}
            placeholder="全部身份"
            textColor={searchIdentity ? "text-[#2b2f36]" : "text-[#a8b1bd]"}
            onChange={(v) => { setSearchIdentity(v) }}
          />
          <button
            onClick={handleClear}
            className="flex h-8 items-center gap-1 rounded-[4px] border border-[#dee0e3] bg-white px-4 text-[12px] text-[#4e535a] hover:bg-[#f5f6f7]"
          >
            <X className="h-3.5 w-3.5" />
            清空
          </button>
          <div className="flex-1" />
          <Button size="sm" className="h-8 bg-[#212631] text-[12px] text-white hover:bg-[#303641]" onClick={() => setDialogOpen(true)}>
            <Plus className="mr-1 h-3.5 w-3.5 text-[#a3c0ff]" /> 新增
          </Button>
        </div>
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2"><Inbox className="h-8 w-8 text-[#d0d3d6]" /><span className="text-[12px] text-[#8f959e]">加载中...</span></div>
        ) : filteredRecords.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2"><Inbox className="h-8 w-8 text-[#d0d3d6]" /><span className="text-[12px] text-[#8f959e]">暂无数据</span></div>
        ) : (
          <Table style={{ tableLayout: "fixed" }}>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4" style={{ width: "140px" }}>客户</TableHead>
                <TableHead style={{ width: "110px" }}>身份</TableHead>
                <TableHead>沟通记录</TableHead>
                <TableHead style={{ width: "80px" }}>创建人</TableHead>
                <TableHead style={{ width: "110px" }}>创建日期</TableHead>
                <TableHead className="text-right pr-4" style={{ width: "88px" }}>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedItems.map((record) => (
                <TableRow key={record.id} className="group hover:bg-[#f7f8fa]">
                  <TableCell className="pl-4">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#eef0f2] text-[12px] font-medium text-[#646a73]">
                        {(record.customer_nickname || "客").charAt(0)}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-medium text-[#212631]">{record.customer_nickname}</span>
                        {nicknameToName[record.customer_nickname] && (
                          <span className="mt-0.5 block truncate text-[12px] text-[#a8b1bd]">{nicknameToName[record.customer_nickname]}</span>
                        )}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {nicknameToIdentity[record.customer_nickname] ? (
                      <span className="inline-flex rounded-full border border-[#e1e4e7] bg-white px-2 py-0.5 text-[12px] text-[#4e535a]">{nicknameToIdentity[record.customer_nickname]}</span>
                    ) : (
                      <span className="text-[12px] text-[#a8b1bd]">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-[12px] text-[#4e535a] whitespace-normal break-words">{record.content}</TableCell>
                  <TableCell className="text-[12px] text-[#a8b1bd]">{record.creator || "-"}</TableCell>
                  <TableCell className="text-[12px] text-[#a8b1bd] tabular-nums">{record.created_at ? new Date(record.created_at).toLocaleDateString("zh-CN") : "-"}</TableCell>
                  <TableCell className="text-right pr-4">
                    <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleEdit(record)}>
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setDeleteTarget(record)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
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
        <DialogContent className="w-[480px] max-w-[90vw] p-0 gap-0" initialFocus={false}>
          <div className="px-5 py-3 border-b border-[#f0f0f0]">
            <h3 className="text-[12px] font-normal">新增沟通记录</h3>
          </div>
          <div className="px-5 py-4 space-y-3">
            <div className="grid grid-cols-[56px_1fr] items-center gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">昵称</span>
              <CustomerSearchInput
                customers={customers}
                value={form.customer_nickname}
                onChange={(v) => setForm({ ...form, customer_nickname: typeof v === "string" ? v : "" })}
                placeholder="搜索昵称"
                filterSelected={false}
              />
            </div>
            <div className="grid grid-cols-[56px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2">记录</span>
              <textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder="请输入沟通记录"
                rows={4}
                className="w-full px-2 py-1 text-[12px] border border-[#e8eaed] rounded-[2px] outline-none focus:border-[#3370ff] resize-none placeholder:text-[#c0c4cc]"
              />
            </div>
          </div>
          <div className="px-5 py-3 border-t-[0.5px] border-[#f0f0f0] flex justify-end gap-2">
            <Button variant="outline" size="sm" className="h-7 text-[12px]" onClick={() => { setDialogOpen(false); setForm({ customer_nickname: "", content: "" }) }}>
              取消
            </Button>
            <Button size="sm" className="h-7 text-[12px]" onClick={handleSave} disabled={!form.customer_nickname.trim() || !form.content.trim() || saving}>
              {saving ? "保存中..." : "保存"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 编辑弹窗 */}
      <Dialog open={!!editTarget} onOpenChange={(open) => { if (!open) setEditTarget(null) }}>
        <DialogContent className="w-[480px] max-w-[90vw] p-0 gap-0" initialFocus={false}>
          <div className="px-5 py-3 border-b border-[#f0f0f0]">
            <h3 className="text-[12px] font-normal">编辑沟通记录</h3>
          </div>
          <div className="px-5 py-4 space-y-3">
            <div className="grid grid-cols-[56px_1fr] items-center gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">昵称</span>
              <CustomerSearchInput
                customers={customers}
                value={editForm.customer_nickname}
                onChange={(v) => setEditForm({ ...editForm, customer_nickname: typeof v === "string" ? v : "" })}
                placeholder="搜索昵称"
                filterSelected={false}
              />
            </div>
            <div className="grid grid-cols-[56px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2">记录</span>
              <textarea
                value={editForm.content}
                onChange={(e) => setEditForm({ ...editForm, content: e.target.value })}
                placeholder="请输入沟通记录"
                rows={4}
                className="w-full px-2 py-1 text-[12px] border border-[#e8eaed] rounded-[2px] outline-none focus:border-[#3370ff] resize-none placeholder:text-[#c0c4cc]"
              />
            </div>
          </div>
          <div className="px-5 py-3 border-t-[0.5px] border-[#f0f0f0] flex justify-end gap-2">
            <Button variant="outline" size="sm" className="h-7 text-[12px]" onClick={() => setEditTarget(null)}>
              取消
            </Button>
            <Button size="sm" className="h-7 text-[12px]" onClick={handleEditSave} disabled={!editForm.customer_nickname.trim() || !editForm.content.trim() || editSaving}>
              {editSaving ? "保存中..." : "保存"}
            </Button>
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
            <p className="text-[12px] text-[#212631]">
              确定要删除「<span className="font-medium">{deleteTarget?.customer_nickname}</span>」的沟通记录吗？删除后不可恢复。
            </p>
          </div>
          <div className="flex justify-end gap-2 px-5 py-3 border-t border-[#f0f0f0]">
            <Button variant="outline" size="sm" className="h-7 text-[12px]" onClick={() => setDeleteTarget(null)}>
              取消
            </Button>
            <Button size="sm" className="h-7 text-[12px] bg-[#f54a45] hover:bg-[#e03e3a]" onClick={handleDelete} disabled={deleting}>
              {deleting ? "删除中..." : "确定删除"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
