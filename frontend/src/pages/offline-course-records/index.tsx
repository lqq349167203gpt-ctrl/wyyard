import { useState, useEffect, useCallback, useMemo } from "react"
import { Plus, X, Edit, Trash2, Inbox } from "lucide-react"
import { offlineCourseRecordApi, customerApi, type OfflineCourseRecord, type OfflineCourseRecordCreate, type CustomerLight } from "@/lib/api"
import { CustomerSearchInput } from "@/components/customer-search-input"
import { usePagePermissions } from "@/hooks/use-page-permissions"
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
  const [form, setForm] = useState<OfflineCourseRecordCreate>({ customer_id: "", customer_nickname: "", participant_ids: [], participant_names: [], course_type: "", course_name: "", record_date: new Date().toLocaleDateString("sv-SE"), teacher: "", content: "", result: "" })
  const [saving, setSaving] = useState(false)
  const [customers, setCustomers] = useState<CustomerLight[]>([])
  const permissions = usePagePermissions()
  const [types, setTypes] = useState<{ id: string; name: string }[]>([])
  const [typeOpen, setTypeOpen] = useState(false)
  const [typeName, setTypeName] = useState("")
  const [editingTypeId, setEditingTypeId] = useState("")
  const [typeError, setTypeError] = useState("")
  const [deleteTypeTarget, setDeleteTypeTarget] = useState<{ id: string; name: string } | null>(null)
  const [typeSaving, setTypeSaving] = useState(false)
  const [error, setError] = useState("")
  const [searchType, setSearchType] = useState("")
  const canManageTypes = permissions.includes("offline-course-types")
  const saveType = async () => {
    setTypeSaving(true); setTypeError("")
    try {
      const oldName = types.find(t => t.id === editingTypeId)?.name
      const item = editingTypeId ? await offlineCourseRecordApi.updateType(editingTypeId, typeName.trim()) : await offlineCourseRecordApi.createType(typeName.trim())
      setTypes(previous => editingTypeId ? previous.map(t => t.id === item.id ? item : t) : [...previous, item])
      if (oldName) {
        setRecords(previous => previous.map(r => r.course_type === oldName ? { ...r, course_type: item.name } : r))
        setForm(previous => previous.course_type === oldName ? { ...previous, course_type: item.name } : previous)
        setEditForm(previous => previous.course_type === oldName ? { ...previous, course_type: item.name } : previous)
        setSearchType(previous => previous === oldName ? item.name : previous)
      }
      setTypeName(""); setEditingTypeId("")
    }
    catch (e) { setTypeError(e instanceof Error ? e.message : "类型保存失败") }
    finally { setTypeSaving(false) }
  }

  const [editTarget, setEditTarget] = useState<OfflineCourseRecord | null>(null)
  const [editForm, setEditForm] = useState<OfflineCourseRecordCreate>({ customer_id: "", customer_nickname: "", participant_ids: [], participant_names: [], course_type: "", course_name: "", record_date: "", teacher: "", content: "", result: "" })
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
      setError("课程记录加载失败，请重试")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    customerApi.light().then(setCustomers).catch(() => setError("人员加载失败，请刷新重试"))
    offlineCourseRecordApi.types().then(setTypes).catch(() => setError("课程类型加载失败"))
  }, [fetchData])
  const courseCustomers = customers

  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      if (searchCustomerId && r.customer_id !== searchCustomerId && !r.participant_ids?.includes(searchCustomerId)) return false
      if (searchType && r.course_type !== searchType) return false
      if (searchTeacher && r.teacher !== searchTeacher) return false
      return true
    })
  }, [records, searchCustomerId, searchTeacher, searchType])

  const { paginatedItems, currentPage, totalPages, totalItems, goToPage, startIndex, endIndex } = usePagination(filteredRecords, { pageSize: 10 })

  const handleClear = () => {
    setSearchCustomerId("")
    setSearchTeacher("")
    setSearchType("")
  }

  // 新增
  const handleSave = async () => {
    if (!form.teacher || !form.record_date) return
    setSaving(true)
    try {
      await offlineCourseRecordApi.create(form)
      setDialogOpen(false)
      setForm({ customer_id: "", customer_nickname: "", participant_ids: [], participant_names: [], course_type: "", course_name: "", record_date: new Date().toLocaleDateString("sv-SE"), teacher: "", content: "", result: "" })
      fetchData()
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败，请重试")
    } finally {
      setSaving(false)
    }
  }

  // 编辑
  const handleEdit = (record: OfflineCourseRecord) => {
    setEditTarget(record)
    setEditForm({ course_name: record.course_name || "", course_type: record.course_type || "", participant_ids: record.participant_ids?.length ? record.participant_ids : record.customer_id ? [record.customer_id] : [], participant_names: record.participant_names?.length ? record.participant_names : record.customer_nickname ? [record.customer_nickname] : [], customer_id: "", customer_nickname: "", record_date: record.record_date, teacher: record.teacher, content: record.content, result: record.result })
  }

  const handleEditSave = async () => {
    if (!editTarget || !editForm.teacher || !editForm.record_date) return
    setEditSaving(true)
    try {
      await offlineCourseRecordApi.update(editTarget.id, editForm)
      setEditTarget(null)
      fetchData()
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败，请重试")
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败，请重试")
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="dv-root bg-[#f4f5f6] h-full p-4 flex flex-col gap-3">
      <style>{`
        .dv-root { font-family: -apple-system, "PingFang SC", "Helvetica Neue", sans-serif; }
        div.offline-course-participants { height: 32px; min-width: 0; padding: 0 10px; border-color: #e1e4e7; }
        div.offline-course-participants:focus-within { border-color: #3370ff; }
        .offline-course-participants input { flex: 1 0 160px; width: 160px; min-width: 160px; font-size: 12px; color: #2b2f36; }
        .offline-course-participants input::placeholder { color: #a8b1bd; }
        .offline-course-participants > span { font-size: 12px; }
      `}</style>
      <div className="flex items-center flex-wrap gap-2 rounded-xl bg-white shadow-[0_1px_3px_rgba(33,38,49,.06)] px-5 h-[52px]">
        <span className="text-[15px] font-bold text-[#212631] whitespace-nowrap">落地课程</span>
        <span className="text-[11.5px] text-[#a8b1bd] ml-2.5 whitespace-nowrap">记录每次线下落地课程的内容与结果</span>
      </div>
      <div className="flex flex-1 min-h-0 min-w-0 gap-3">
        <aside className="w-[168px] shrink-0 rounded-xl bg-white flex flex-col overflow-hidden border border-[#e8eaed]">
          <div className="px-4 py-3 border-b border-[#f0f0f0] text-[13px] text-[#2b2f36]">课程类型</div>
          <nav aria-label="课程类型筛选" className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
            {[{ id: "all", name: "全部", value: "" }, ...types.map(t => ({ ...t, value: t.name }))].map(t => (
              <button
                key={t.id}
                type="button"
                aria-pressed={searchType === t.value}
                title={t.name}
                onClick={() => { setSearchType(t.value); goToPage(1) }}
                className={`w-full rounded-[4px] px-3 py-2.5 text-left text-[13px] break-words transition-colors ${searchType === t.value ? "bg-[#eef3ff] text-[#3370ff]" : "text-[#4e535a] hover:bg-[#f7f8fa]"}`}
              >{t.name}</button>
            ))}
          </nav>
          {canManageTypes && <div className="p-2 border-t border-[#f0f0f0]">
            <Button variant="ghost" size="sm" className="w-full h-8 text-[12px] text-[#646a73]" onClick={() => { setTypeError(""); setEditingTypeId(""); setTypeName(""); setTypeOpen(true) }}><Plus className="h-3.5 w-3.5 mr-1" />类型设置</Button>
          </div>}
        </aside>
      <div className="rounded-xl bg-white shadow-[0_2px_4px_rgba(33,38,49,.05)] overflow-hidden flex flex-col flex-1 min-h-0 min-w-0">
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
                <TableHead className="pl-4" style={{ width: "90px" }}>类型</TableHead>
                <TableHead style={{ width: "140px" }}>课程名称</TableHead>
                <TableHead style={{ width: "90px" }}>老师</TableHead>
                <TableHead style={{ width: "100px" }}>日期</TableHead>
                <TableHead style={{ width: "160px" }}>参与者</TableHead>
                <TableHead>课程内容</TableHead>
                <TableHead>课程结果</TableHead>
                <TableHead style={{ width: "80px" }}>创建人</TableHead>
                <TableHead className="text-right pr-4" style={{ width: "88px" }}>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedItems.map((record) => (
                <TableRow key={record.id} className="group hover:bg-[#f7f8fa]">
                  <TableCell className="pl-4">{record.course_type || <span className="text-[#d0d3d6]">-</span>}</TableCell>
                  <TableCell className="text-[#2b2f36] truncate"><div className="truncate" title={record.course_name}>{record.course_name || <span className="text-[#d0d3d6]">-</span>}</div></TableCell>
                  <TableCell className="text-[#2b2f36] truncate">{record.teacher || "-"}</TableCell>
                  <TableCell className="text-[#2b2f36] truncate">{record.record_date || "-"}</TableCell>
                  <TableCell className="whitespace-normal break-words text-[#2b2f36]">{record.participant_names?.join("、") || record.customer_nickname || <span className="text-[#d0d3d6]">-</span>}</TableCell>
                  <TableCell className="whitespace-normal break-words text-[#2b2f36]">{record.content || "-"}</TableCell>
                  <TableCell className="whitespace-normal break-words text-[#2b2f36]">{record.result || "-"}</TableCell>
                  <TableCell className="text-[#8f959e] truncate">{record.creator || "-"}</TableCell>
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
      </div>

      {error && <p role="alert" className="text-[12px] text-red-600">{error}</p>}
      <Dialog open={typeOpen} onOpenChange={open => { if (!typeSaving) setTypeOpen(open) }}>
        <DialogContent initialFocus={false} className="w-[520px] max-w-[90vw] p-0 gap-0">
          <div className="px-5 py-3 border-b border-[#f0f0f0]"><h3 className="text-[14px] font-normal text-[#2b2f36]">课程类型设置</h3></div>
          <div className="px-5 py-4 space-y-4">
            <div className="space-y-2">
              <label htmlFor="course-type-name" className="text-[12px] text-[#4e535a]">{editingTypeId ? "编辑类型" : "新增类型"}</label>
              <div className="flex items-center gap-2">
                <input id="course-type-name" maxLength={50} value={typeName} onChange={e => setTypeName(e.target.value)} placeholder="请输入课程类型名称" className="h-8 min-w-0 flex-1 rounded-[4px] border border-[#e1e4e7] bg-white px-2.5 text-[12px] outline-none focus:border-[#3370ff] placeholder:text-[#a8b1bd]" onKeyDown={e => { if (e.key === "Enter" && !e.nativeEvent.isComposing && typeName.trim() && !typeSaving) saveType() }} />
                <Button size="sm" className="h-8 text-[12px]" onClick={saveType} disabled={!typeName.trim() || typeSaving}>{typeSaving ? "保存中..." : editingTypeId ? "保存" : "新增"}</Button>
                {editingTypeId && <Button variant="outline" size="sm" className="h-8 text-[12px]" disabled={typeSaving} onClick={() => { setEditingTypeId(""); setTypeName(""); setTypeError("") }}>取消</Button>}
              </div>
            </div>
            <div className="rounded-[4px] border border-[#e8eaed] overflow-hidden">
              <div className="flex justify-between bg-[#f7f8fa] px-3 py-2 text-[12px] text-[#8f959e]"><span>类型名称</span><span>操作</span></div>
              <div className="max-h-[260px] overflow-y-auto divide-y divide-[#f0f0f0]">
                {types.length ? types.map(t => <div key={t.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-[12px]">
                  <span className="min-w-0 break-all text-[#2b2f36]">{t.name}</span>
                  <div className="flex shrink-0 items-center gap-3">
                    <button className="text-[#3370ff] disabled:opacity-50" disabled={typeSaving} onClick={() => { setEditingTypeId(t.id); setTypeName(t.name); setTypeError("") }}>编辑</button>
                    <button className="text-[#646a73] hover:text-red-600 disabled:opacity-50" disabled={typeSaving} onClick={() => { setTypeError(""); setDeleteTypeTarget(t) }}>删除</button>
                  </div>
                </div>) : <p className="py-6 text-center text-[12px] text-[#8f959e]">暂无课程类型，请在上方添加</p>}
              </div>
            </div>
            <p className="text-[12px] text-[#8f959e]">修改名称会同步已有课程；已使用的类型不能删除。</p>
            {typeError && <p role="alert" className="text-red-600 text-[12px]">{typeError}</p>}
          </div>
          <div className="px-5 py-3 border-t border-[#f0f0f0] flex justify-end"><Button variant="outline" size="sm" className="h-7 text-[12px]" disabled={typeSaving} onClick={() => setTypeOpen(false)}>完成</Button></div>
        </DialogContent>
      </Dialog>
      <Dialog open={!!deleteTypeTarget} onOpenChange={open => { if (!open && !typeSaving) setDeleteTypeTarget(null) }}>
        <DialogContent initialFocus={false} className="w-[360px] max-w-[90vw] p-0 gap-0">
          <div className="px-5 py-3 border-b border-[#f0f0f0]"><h3 className="text-[14px] font-normal">删除课程类型</h3></div>
          <div className="px-5 py-4 text-[12px] text-[#4e535a]">确定删除“{deleteTypeTarget?.name}”吗？
            {typeError && <p role="alert" className="mt-2 text-red-600">{typeError}</p>}
          </div>
          <div className="px-5 py-3 border-t border-[#f0f0f0] flex justify-end gap-2">
            <Button variant="outline" size="sm" className="h-7 text-[12px]" disabled={typeSaving} onClick={() => setDeleteTypeTarget(null)}>取消</Button>
            <Button variant="destructive" size="sm" className="h-7 text-[12px]" disabled={typeSaving} onClick={async () => {
              if (!deleteTypeTarget) return
              setTypeSaving(true); setTypeError("")
              try {
                await offlineCourseRecordApi.deleteType(deleteTypeTarget.id)
                setTypes(previous => previous.filter(t => t.id !== deleteTypeTarget.id))
                if (editingTypeId === deleteTypeTarget.id) { setEditingTypeId(""); setTypeName("") }
                setSearchType(previous => previous === deleteTypeTarget.name ? "" : previous)
                setDeleteTypeTarget(null)
              } catch (e) { setTypeError(e instanceof Error ? e.message : "删除失败") }
              finally { setTypeSaving(false) }
            }}>{typeSaving ? "删除中..." : "确定删除"}</Button>
          </div>
        </DialogContent>
      </Dialog>
      {/* 新增弹窗 */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setForm({ customer_id: "", customer_nickname: "", participant_ids: [], participant_names: [], course_type: "", course_name: "", record_date: new Date().toLocaleDateString("sv-SE"), teacher: "", content: "", result: "" }) }}>
        <DialogContent className="w-[520px] max-w-[90vw] p-0 gap-0" initialFocus={false}>
          <div className="px-5 py-3 border-b border-[#f0f0f0]">
            <h3 className="text-[12px] font-normal">新增落地课程记录</h3>
          </div>
          <div className="px-5 py-4 space-y-3">
            <div className="grid grid-cols-[70px_1fr] items-center gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">类型</span>
              <SelectDropdown value={form.course_type || ""} options={types.map(t => ({ value: t.name, label: t.name }))} onChange={v => setForm({ ...form, course_type: v })} placeholder="选择类型" className="w-full" buttonClassName="border-[#e1e4e7] bg-white px-2.5" rounded="4px" textColor={form.course_type ? "text-[#2b2f36]" : "text-[#a8b1bd]"} />
            </div>
            <div className="grid grid-cols-[70px_1fr] items-center gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">课程名称</span>
              <input value={form.course_name || ""} onChange={e => setForm({ ...form, course_name: e.target.value })} placeholder="请输入课程名称" className="h-8 w-full px-2.5 text-[12px] border border-[#e1e4e7] rounded-[4px] outline-none focus:border-[#3370ff] placeholder:text-[#a8b1bd]" />
            </div>
            <div className="grid grid-cols-[70px_1fr] items-center gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">老师</span>
              <SelectDropdown
                className="w-full"
                buttonClassName="border-[#e1e4e7] bg-white px-2.5"
                rounded="4px"
                value={form.teacher}
                options={courseTeachers.map(c => ({ value: c.nickname, label: c.nickname }))}
                placeholder="选择老师"
                textColor={form.teacher ? "text-[#2b2f36]" : "text-[#a8b1bd]"}
                onChange={(v) => setForm({ ...form, teacher: v })}
              />
            </div>
            <div className="grid grid-cols-[70px_1fr] items-center gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">日期</span>
              <input
                type="date"
                value={form.record_date}
                onChange={(e) => setForm({ ...form, record_date: e.target.value })}
                className="h-8 w-full px-2 text-[12px] border border-[#e8eaed] rounded-[4px] outline-none focus:border-[#3370ff]"
              />
            </div>
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="pt-2 text-[12px] text-[#4e535a] font-light text-right tracking-widest">参与者</span>
              <CustomerSearchInput customers={customers} rounded="4px" className="offline-course-participants" multi value={form.participant_names || []} onChange={value => {
                const names = Array.isArray(value) ? value : []
                setForm({ ...form, participant_names: names, participant_ids: names.map(name => customers.find(c => c.nickname === name)?.id || form.participant_ids?.[(form.participant_names || []).indexOf(name)] || "").filter(Boolean) })
              }} placeholder="搜索姓名或昵称，可多选" />
            </div>
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2">课程内容</span>
              <textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder="请输入课程内容"
                rows={3}
                className="w-full px-2 py-1 text-[12px] border border-[#e8eaed] rounded-[4px] outline-none focus:border-[#3370ff] resize-none placeholder:text-[#c0c4cc]"
              />
            </div>
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2">课程结果</span>
              <textarea
                value={form.result}
                onChange={(e) => setForm({ ...form, result: e.target.value })}
                placeholder="请输入课程结果"
                rows={3}
                className="w-full px-2 py-1 text-[12px] border border-[#e8eaed] rounded-[4px] outline-none focus:border-[#3370ff] resize-none placeholder:text-[#c0c4cc]"
              />
            </div>
          </div>
          {error && <p role="alert" className="px-5 text-red-600 text-[12px]">{error}</p>}
          <div className="px-5 py-3 border-t-[0.5px] border-[#f0f0f0] flex justify-end gap-2">
            <Button variant="outline" size="sm" className="h-7 text-[12px]" onClick={() => { setDialogOpen(false); setForm({ customer_id: "", customer_nickname: "", participant_ids: [], participant_names: [], course_type: "", course_name: "", record_date: new Date().toLocaleDateString("sv-SE"), teacher: "", content: "", result: "" }) }}>
              取消
            </Button>
            <Button size="sm" className="h-7 text-[12px]" onClick={handleSave} disabled={!form.teacher || !form.record_date || saving}>
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
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">类型</span>
              <SelectDropdown value={editForm.course_type || ""} options={types.map(t => ({ value: t.name, label: t.name }))} onChange={v => setEditForm({ ...editForm, course_type: v })} placeholder="选择类型" className="w-full" buttonClassName="border-[#e1e4e7] bg-white px-2.5" rounded="4px" textColor={editForm.course_type ? "text-[#2b2f36]" : "text-[#a8b1bd]"} />
            </div>
            <div className="grid grid-cols-[70px_1fr] items-center gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">课程名称</span>
              <input value={editForm.course_name || ""} onChange={e => setEditForm({ ...editForm, course_name: e.target.value })} placeholder="请输入课程名称" className="h-8 w-full px-2.5 text-[12px] border border-[#e1e4e7] rounded-[4px] outline-none focus:border-[#3370ff] placeholder:text-[#a8b1bd]" />
            </div>
            <div className="grid grid-cols-[70px_1fr] items-center gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">老师</span>
              <SelectDropdown
                className="w-full"
                buttonClassName="border-[#e1e4e7] bg-white px-2.5"
                rounded="4px"
                value={editForm.teacher}
                options={[
                  { value: "", label: "选择老师" },
                  ...courseTeachers.map(c => ({ value: c.nickname, label: c.nickname })),
                ]}
                placeholder="选择老师"
                textColor={editForm.teacher ? "text-[#2b2f36]" : "text-[#a8b1bd]"}
                onChange={(v) => setEditForm({ ...editForm, teacher: v })}
              />
            </div>
            <div className="grid grid-cols-[70px_1fr] items-center gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">日期</span>
              <input
                type="date"
                value={editForm.record_date}
                onChange={(e) => setEditForm({ ...editForm, record_date: e.target.value })}
                className="h-8 w-full px-2 text-[12px] border border-[#e8eaed] rounded-[4px] outline-none focus:border-[#3370ff]"
              />
            </div>
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="pt-2 text-[12px] text-[#4e535a] font-light text-right tracking-widest">参与者</span>
              <CustomerSearchInput customers={customers} rounded="4px" className="offline-course-participants" multi value={editForm.participant_names || []} onChange={value => {
                const names = Array.isArray(value) ? value : []
                setEditForm({ ...editForm, participant_names: names, participant_ids: names.map(name => customers.find(c => c.nickname === name)?.id || editForm.participant_ids?.[(editForm.participant_names || []).indexOf(name)] || "").filter(Boolean) })
              }} placeholder="搜索姓名或昵称，可多选" />
            </div>
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2">课程内容</span>
              <textarea
                value={editForm.content}
                onChange={(e) => setEditForm({ ...editForm, content: e.target.value })}
                placeholder="请输入课程内容"
                rows={3}
                className="w-full px-2 py-1 text-[12px] border border-[#e8eaed] rounded-[4px] outline-none focus:border-[#3370ff] resize-none placeholder:text-[#c0c4cc]"
              />
            </div>
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2">课程结果</span>
              <textarea
                value={editForm.result}
                onChange={(e) => setEditForm({ ...editForm, result: e.target.value })}
                placeholder="请输入课程结果"
                rows={3}
                className="w-full px-2 py-1 text-[12px] border border-[#e8eaed] rounded-[4px] outline-none focus:border-[#3370ff] resize-none placeholder:text-[#c0c4cc]"
              />
            </div>
          </div>
          {error && <p role="alert" className="px-5 text-red-600 text-[12px]">{error}</p>}
          <div className="px-5 py-3 border-t-[0.5px] border-[#f0f0f0] flex justify-end gap-2">
            <Button variant="outline" size="sm" className="h-7 text-[12px]" onClick={() => setEditTarget(null)}>
              取消
            </Button>
            <Button size="sm" className="h-7 text-[12px]" onClick={handleEditSave} disabled={!editForm.teacher || !editForm.record_date || editSaving}>
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
              确定要删除「<span className="font-medium">{deleteTarget?.course_type || deleteTarget?.record_date || "本条"}</span>」的落地课程记录吗？删除后不可恢复。
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
