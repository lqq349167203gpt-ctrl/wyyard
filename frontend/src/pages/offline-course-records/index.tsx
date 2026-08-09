import { useState, useEffect, useCallback, useMemo } from "react"
import { Plus, X, Edit, Trash2, Inbox } from "lucide-react"
import { offlineCourseRecordApi, offlineCourseApi, customerApi, type OfflineCourseRecord, type OfflineCourseRecordCreate, type Customer } from "@/lib/api"
import { POSITION_COURSE_TEACHER } from "@/lib/positions"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { usePagination } from "@/hooks/use-pagination"
import { PaginationBar } from "@/components/pagination-bar"
import { SelectDropdown } from "@/components/select-dropdown"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"

export default function OfflineCourseRecordsPage() {
  const [records, setRecords] = useState<OfflineCourseRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<OfflineCourseRecordCreate>({ customer_id: "", customer_nickname: "", record_date: new Date().toLocaleDateString("sv-SE"), teacher: "", content: "", result: "" })
  const [saving, setSaving] = useState(false)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [activeCourseCustomerIds, setActiveCourseCustomerIds] = useState<Set<string>>(new Set())

  const [editTarget, setEditTarget] = useState<OfflineCourseRecord | null>(null)
  const [editForm, setEditForm] = useState<OfflineCourseRecordCreate>({ customer_id: "", customer_nickname: "", record_date: "", teacher: "", content: "", result: "" })
  const [editSaving, setEditSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<OfflineCourseRecord | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [searchCustomerId, setSearchCustomerId] = useState("")
  const [searchTeacher, setSearchTeacher] = useState("")

  // 有"课程老师"身份的客户
  const courseTeachers = useMemo(() => {
    return customers.filter(c => c.positions?.includes(POSITION_COURSE_TEACHER))
  }, [customers])

  const teacherOptions = useMemo(() => [
    { value: "", label: "全部老师" },
    ...courseTeachers.map(c => ({ value: c.nickname, label: c.nickname })),
  ], [courseTeachers])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await offlineCourseRecordApi.list()
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
    offlineCourseApi.list().then(courses => {
      const today = new Date().toLocaleDateString("sv-SE")
      const activeIds = new Set<string>()
      courses.forEach(c => {
        if (!c.effective_date || c.effective_date > today) return
        const eff = new Date(c.effective_date)
        eff.setMonth(eff.getMonth() + (c.validity_value || 1))
        eff.setDate(eff.getDate() - 1)
        const expiry = eff.toLocaleDateString("sv-SE")
        if (expiry >= today) activeIds.add(c.customer_id)
      })
      setActiveCourseCustomerIds(activeIds)
    }).catch(() => {})
  }, [fetchData])

  // 有生效中线下课程的用户
  const courseCustomers = useMemo(() => {
    return customers.filter(c => activeCourseCustomerIds.has(c.id))
  }, [customers, activeCourseCustomerIds])

  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      if (searchCustomerId && r.customer_id !== searchCustomerId) return false
      if (searchTeacher && r.teacher !== searchTeacher) return false
      return true
    })
  }, [records, searchCustomerId, searchTeacher])

  const { paginatedItems, currentPage, totalPages, totalItems, goToPage, startIndex, endIndex } = usePagination(filteredRecords, { pageSize: 10 })

  const handleClear = () => {
    setSearchCustomerId("")
    setSearchTeacher("")
  }

  // 新增
  const handleSave = async () => {
    if (!form.customer_id || !form.record_date) return
    setSaving(true)
    try {
      await offlineCourseRecordApi.create(form)
      setDialogOpen(false)
      setForm({ customer_id: "", customer_nickname: "", record_date: new Date().toLocaleDateString("sv-SE"), teacher: "", content: "", result: "" })
      fetchData()
    } catch {
      // ignore
    } finally {
      setSaving(false)
    }
  }

  // 编辑
  const handleEdit = (record: OfflineCourseRecord) => {
    setEditTarget(record)
    setEditForm({ customer_id: record.customer_id, customer_nickname: record.customer_nickname, record_date: record.record_date, teacher: record.teacher, content: record.content, result: record.result })
  }

  const handleEditSave = async () => {
    if (!editTarget || !editForm.customer_id || !editForm.record_date) return
    setEditSaving(true)
    try {
      await offlineCourseRecordApi.update(editTarget.id, editForm)
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
      await offlineCourseRecordApi.delete(deleteTarget.id)
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
      <div className="flex items-center flex-wrap gap-2 rounded-xl bg-white shadow-[0_1px_3px_rgba(33,38,49,.06)] px-5 h-[52px]">
        <span className="text-[15px] font-bold text-[#212631] whitespace-nowrap">落地课程</span>
        <span className="text-[11.5px] text-[#a8b1bd] ml-2.5 whitespace-nowrap">记录每次线下落地课程的内容与结果</span>
      </div>
      <div className="rounded-xl bg-white shadow-[0_2px_4px_rgba(33,38,49,.05)] overflow-hidden flex flex-col flex-1 min-h-0">
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-[#f0f0f0]">
          <div className="w-[172px]">
            <SelectDropdown
              className="w-full"
              buttonClassName="border-[#e1e4e7] bg-white px-2.5"
              rounded="7px"
              value={searchCustomerId}
              options={[
                { value: "", label: "全部用户" },
                ...courseCustomers.map(c => ({ value: c.id, label: c.nickname })),
              ]}
              placeholder="全部用户"
              textColor={searchCustomerId ? "text-[#2b2f36]" : "text-[#a8b1bd]"}
              onChange={(v) => setSearchCustomerId(v)}
            />
          </div>
          <div className="w-[150px]">
            <SelectDropdown
              className="w-full"
              buttonClassName="border-[#e1e4e7] bg-white px-2.5"
              rounded="7px"
              value={searchTeacher}
              options={teacherOptions}
              placeholder="全部老师"
              textColor={searchTeacher ? "text-[#2b2f36]" : "text-[#a8b1bd]"}
              onChange={(v) => setSearchTeacher(v)}
            />
          </div>
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
                <TableHead className="pl-4" style={{ width: "120px" }}>客户</TableHead>
                <TableHead style={{ width: "100px" }}>上课日期</TableHead>
                <TableHead style={{ width: "90px" }}>课程老师</TableHead>
                <TableHead>课程内容</TableHead>
                <TableHead>课程结果</TableHead>
                <TableHead style={{ width: "80px" }}>创建人</TableHead>
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
                      <span className="block truncate text-[13px] font-medium text-[#212631]">{record.customer_nickname}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-[12px] text-[#4e535a]">{record.record_date || "-"}</TableCell>
                  <TableCell className="text-[12px] text-[#4e535a]">{record.teacher || "-"}</TableCell>
                  <TableCell className="text-[12px] text-[#4e535a] whitespace-normal break-words">{record.content || "-"}</TableCell>
                  <TableCell className="text-[12px] text-[#4e535a] whitespace-normal break-words">{record.result || "-"}</TableCell>
                  <TableCell className="text-[12px] text-[#a8b1bd]">{record.creator || "-"}</TableCell>
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
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setForm({ customer_id: "", customer_nickname: "", record_date: new Date().toLocaleDateString("sv-SE"), teacher: "", content: "", result: "" }) }}>
        <DialogContent className="w-[520px] max-w-[90vw] p-0 gap-0" initialFocus={false}>
          <div className="px-5 py-3 border-b border-[#f0f0f0]">
            <h3 className="text-[12px] font-normal">新增落地课程记录</h3>
          </div>
          <div className="px-5 py-4 space-y-3">
            <div className="grid grid-cols-[70px_1fr] items-center gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">用户</span>
              <SelectDropdown
                className="w-full"
                buttonClassName="border-[#e1e4e7] bg-white px-2.5"
                rounded="2px"
                value={form.customer_id}
                options={courseCustomers.map(c => ({ value: c.id, label: c.nickname }))}
                placeholder="选择用户"
                textColor={form.customer_id ? "text-[#2b2f36]" : "text-[#a8b1bd]"}
                onChange={(v) => {
                  const c = customers.find(c => c.id === v)
                  setForm({ ...form, customer_id: v, customer_nickname: c?.nickname || "" })
                }}
              />
            </div>
            <div className="grid grid-cols-[70px_1fr] items-center gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">上课日期</span>
              <input
                type="date"
                value={form.record_date}
                onChange={(e) => setForm({ ...form, record_date: e.target.value })}
                className="h-8 w-full px-2 text-[12px] border border-[#e8eaed] rounded-[2px] outline-none focus:border-[#3370ff]"
              />
            </div>
            <div className="grid grid-cols-[70px_1fr] items-center gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">课程老师</span>
              <SelectDropdown
                className="w-full"
                buttonClassName="border-[#e1e4e7] bg-white px-2.5"
                rounded="2px"
                value={form.teacher}
                options={courseTeachers.map(c => ({ value: c.nickname, label: c.nickname }))}
                placeholder="选择课程老师"
                textColor={form.teacher ? "text-[#2b2f36]" : "text-[#a8b1bd]"}
                onChange={(v) => setForm({ ...form, teacher: v })}
              />
            </div>
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2">课程内容</span>
              <textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder="请输入课程内容"
                rows={3}
                className="w-full px-2 py-1 text-[12px] border border-[#e8eaed] rounded-[2px] outline-none focus:border-[#3370ff] resize-none placeholder:text-[#c0c4cc]"
              />
            </div>
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2">课程结果</span>
              <textarea
                value={form.result}
                onChange={(e) => setForm({ ...form, result: e.target.value })}
                placeholder="请输入课程结果"
                rows={3}
                className="w-full px-2 py-1 text-[12px] border border-[#e8eaed] rounded-[2px] outline-none focus:border-[#3370ff] resize-none placeholder:text-[#c0c4cc]"
              />
            </div>
          </div>
          <div className="px-5 py-3 border-t-[0.5px] border-[#f0f0f0] flex justify-end gap-2">
            <Button variant="outline" size="sm" className="h-7 text-[12px]" onClick={() => { setDialogOpen(false); setForm({ customer_id: "", customer_nickname: "", record_date: new Date().toLocaleDateString("sv-SE"), teacher: "", content: "", result: "" }) }}>
              取消
            </Button>
            <Button size="sm" className="h-7 text-[12px]" onClick={handleSave} disabled={!form.customer_id || !form.record_date || saving}>
              {saving ? "保存中..." : "保存"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 编辑弹窗 */}
      <Dialog open={!!editTarget} onOpenChange={(open) => { if (!open) setEditTarget(null) }}>
        <DialogContent className="w-[520px] max-w-[90vw] p-0 gap-0" initialFocus={false}>
          <div className="px-5 py-3 border-b border-[#f0f0f0]">
            <h3 className="text-[12px] font-normal">编辑落地课程记录</h3>
          </div>
          <div className="px-5 py-4 space-y-3">
            <div className="grid grid-cols-[70px_1fr] items-center gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">用户</span>
              <SelectDropdown
                className="w-full"
                buttonClassName="border-[#e1e4e7] bg-white px-2.5"
                rounded="2px"
                value={editForm.customer_id}
                options={courseCustomers.map(c => ({ value: c.id, label: c.nickname }))}
                placeholder="选择用户"
                textColor={editForm.customer_id ? "text-[#2b2f36]" : "text-[#a8b1bd]"}
                onChange={(v) => {
                  const c = customers.find(c => c.id === v)
                  setEditForm({ ...editForm, customer_id: v, customer_nickname: c?.nickname || "" })
                }}
              />
            </div>
            <div className="grid grid-cols-[70px_1fr] items-center gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">上课日期</span>
              <input
                type="date"
                value={editForm.record_date}
                onChange={(e) => setEditForm({ ...editForm, record_date: e.target.value })}
                className="h-8 w-full px-2 text-[12px] border border-[#e8eaed] rounded-[2px] outline-none focus:border-[#3370ff]"
              />
            </div>
            <div className="grid grid-cols-[70px_1fr] items-center gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">课程老师</span>
              <SelectDropdown
                className="w-full"
                buttonClassName="border-[#e1e4e7] bg-white px-2.5"
                rounded="2px"
                value={editForm.teacher}
                options={[
                  { value: "", label: "选择课程老师" },
                  ...courseTeachers.map(c => ({ value: c.nickname, label: c.nickname })),
                ]}
                placeholder="选择课程老师"
                textColor={editForm.teacher ? "text-[#2b2f36]" : "text-[#a8b1bd]"}
                onChange={(v) => setEditForm({ ...editForm, teacher: v })}
              />
            </div>
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2">课程内容</span>
              <textarea
                value={editForm.content}
                onChange={(e) => setEditForm({ ...editForm, content: e.target.value })}
                placeholder="请输入课程内容"
                rows={3}
                className="w-full px-2 py-1 text-[12px] border border-[#e8eaed] rounded-[2px] outline-none focus:border-[#3370ff] resize-none placeholder:text-[#c0c4cc]"
              />
            </div>
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2">课程结果</span>
              <textarea
                value={editForm.result}
                onChange={(e) => setEditForm({ ...editForm, result: e.target.value })}
                placeholder="请输入课程结果"
                rows={3}
                className="w-full px-2 py-1 text-[12px] border border-[#e8eaed] rounded-[2px] outline-none focus:border-[#3370ff] resize-none placeholder:text-[#c0c4cc]"
              />
            </div>
          </div>
          <div className="px-5 py-3 border-t-[0.5px] border-[#f0f0f0] flex justify-end gap-2">
            <Button variant="outline" size="sm" className="h-7 text-[12px]" onClick={() => setEditTarget(null)}>
              取消
            </Button>
            <Button size="sm" className="h-7 text-[12px]" onClick={handleEditSave} disabled={!editForm.customer_id || !editForm.record_date || editSaving}>
              {editSaving ? "保存中..." : "保存"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 删除确认弹窗 */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <DialogContent className="w-[360px] max-w-[90vw] p-0 gap-0">
          <div className="px-5 py-3 border-b border-[#f0f0f0]">
            <h3 className="text-[14px] font-normal">删除落地课程记录</h3>
          </div>
          <div className="px-5 py-4">
            <p className="text-[12px] text-[#212631]">
              确定要删除「<span className="font-medium">{deleteTarget?.customer_nickname}</span>」的落地课程记录吗？删除后不可恢复。
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
