import { useEffect, useMemo, useState } from "react"
import { Plus, Trash2 } from "lucide-react"

import { CustomerSearchInput } from "@/components/customer-search-input"
import { CloserInput, type Closer } from "@/components/closer-input"
import { SelectDropdown } from "@/components/select-dropdown"
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
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useEditPermissions } from "@/hooks/use-edit-permissions"
import { useOrganizations } from "@/hooks/use-organizations"
import {
  customerApi,
  projectDeductionApi,
  type CoarseDoorCourseOption,
  type CustomerLight,
  type ProjectDeduction,
} from "@/lib/api"

const EmptyValue = () => <span className="text-[#d0d3d6]">-</span>
const today = new Date().toLocaleDateString("sv-SE")

interface CoarseDoorCardTabProps {
  presetCustomer?: Pick<CustomerLight, "id" | "nickname"> | null
  formOnly?: boolean
  showHeader?: boolean
  onSaved?: () => void
  onCancel?: () => void
}

export function CoarseDoorCardTab({ presetCustomer, formOnly = false, showHeader = true, onSaved, onCancel }: CoarseDoorCardTabProps = {}) {
  const editPermissions = useEditPermissions()
  const { organizations: settlementOrganizations, loading: loadingOrganizations } = useOrganizations()
  const currentUser = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("currentUser") || "{}") }
    catch { return {} }
  }, [])
  const currentActorName = String(currentUser.owner || currentUser.username || "")
  const [customers, setCustomers] = useState<CustomerLight[]>([])
  const [customerId, setCustomerId] = useState(presetCustomer?.id || "")
  const [nickname, setNickname] = useState(presetCustomer?.nickname || "")
  const [dealDate, setDealDate] = useState(today)
  const [closers, setClosers] = useState<Closer[]>([])
  const [notes, setNotes] = useState("")
  const [courseOrganizationId, setCourseOrganizationId] = useState("")
  const [settlementOrganizationId, setSettlementOrganizationId] = useState("")
  const [courseKey, setCourseKey] = useState("")
  const [courseOrganizations, setCourseOrganizations] = useState<{ id: string; name: string }[]>([])
  const [courses, setCourses] = useState<CoarseDoorCourseOption[]>([])
  const [records, setRecords] = useState<ProjectDeduction[]>([])
  const [loadingOptions, setLoadingOptions] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ProjectDeduction | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState("")
  const [entryOpen, setEntryOpen] = useState(false)

  const canDeleteRecord = (record: ProjectDeduction) => (
    currentUser.role === "超级管理员"
    || editPermissions.payments === "all"
    || (
      editPermissions.payments === "own"
      && Boolean(record.created_by && currentActorName && record.created_by === currentActorName)
    )
  )

  const loadRecords = async () => {
    try {
      const result = await projectDeductionApi.listPaginated(1, 100, {
        project_type: "membership-cards",
        card_type: "粗门次卡",
      })
      setRecords([...result.items].sort((a, b) => (
        (b.deduction_date || b.created_at).localeCompare(a.deduction_date || a.created_at)
        || b.created_at.localeCompare(a.created_at)
      )))
    } catch {
      setRecords([])
    }
  }

  useEffect(() => {
    customerApi.light().then(setCustomers).catch(() => setCustomers([]))
    if (!formOnly) loadRecords()
  }, [formOnly])

  useEffect(() => {
    if (!presetCustomer) return
    setCustomerId(presetCustomer.id)
    setNickname(presetCustomer.nickname)
  }, [presetCustomer])

  useEffect(() => {
    setCourseOrganizationId("")
    setCourseKey("")
    setCourseOrganizations([])
    setCourses([])
    setMessage(null)
    if (!customerId) return
    setLoadingOptions(true)
    projectDeductionApi.getCoarseDoorOptions(customerId)
      .then(data => {
        const nextCourseOrganizations = data.course_organizations || data.organizations
        setCourseOrganizations(nextCourseOrganizations)
        setCourses(data.courses)
        if (nextCourseOrganizations.length === 1) setCourseOrganizationId(nextCourseOrganizations[0].id)
      })
      .catch(error => setMessage({ text: error instanceof Error ? error.message : "课程加载失败", error: true }))
      .finally(() => setLoadingOptions(false))
  }, [customerId])

  useEffect(() => {
    if (!settlementOrganizationId && settlementOrganizations.length > 0) {
      setSettlementOrganizationId(settlementOrganizations[0].id)
    }
  }, [settlementOrganizationId, settlementOrganizations])

  const visibleCourses = useMemo(
    () => courses.filter(course => course.organization_ids.includes(courseOrganizationId)),
    [courses, courseOrganizationId],
  )

  const selectedCourse = visibleCourses.find(course => `${course.record_type}:${course.record_id}` === courseKey)

  const handleSubmit = async () => {
    if (!customerId || !selectedCourse || !settlementOrganizationId || saving) return
    setSaving(true)
    setMessage(null)
    try {
      await projectDeductionApi.createCoarseDoorCourse({
        customer_id: customerId,
        record_type: selectedCourse.record_type,
        record_id: selectedCourse.record_id,
        course_organization_id: courseOrganizationId,
        settlement_organization_id: settlementOrganizationId,
        deal_date: dealDate,
        closers,
        notes,
      })
      const data = await projectDeductionApi.getCoarseDoorOptions(customerId)
      const nextCourseOrganizations = data.course_organizations || data.organizations
      setCourseOrganizations(nextCourseOrganizations)
      setCourses(data.courses)
      setCourseKey("")
      setClosers([])
      setNotes("")
      if (!nextCourseOrganizations.some(item => item.id === courseOrganizationId)) setCourseOrganizationId("")
      if (!formOnly) await loadRecords()
      setMessage({ text: `已抵扣 ${selectedCourse.deduction_count} 次，原会员卡已返还对应次数`, error: false })
      onSaved?.()
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "扣卡失败", error: true })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget || !canDeleteRecord(deleteTarget) || deleting) return
    const deletedCustomerId = deleteTarget.customer_id
    setDeleting(true)
    setDeleteError("")
    try {
      await projectDeductionApi.delete(deleteTarget.id)
      setDeleteTarget(null)
      await loadRecords()
      if (customerId === deletedCustomerId) {
        const data = await projectDeductionApi.getCoarseDoorOptions(customerId)
        const nextCourseOrganizations = data.course_organizations || data.organizations
        setCourseOrganizations(nextCourseOrganizations)
        setCourses(data.courses)
        setCourseKey("")
        if (!nextCourseOrganizations.some(item => item.id === courseOrganizationId)) setCourseOrganizationId("")
      }
    } catch (error) {
      setDeleteTarget(null)
      setDeleteError(error instanceof Error ? error.message : "删除失败")
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {formOnly && <div className="bg-white">
        {showHeader && <DialogHeader className="border-b px-6 pb-4 pt-5">
          <DialogTitle className="text-base">新增粗门次卡</DialogTitle>
        </DialogHeader>}
        <div className="space-y-4 px-6 py-5">
          <p className="text-[12px] text-[#8f959e]">所属组织记录本次结算归属，课程所属用于筛选课程；抵扣后会返还原会员卡的对应次数</p>
          <div className="grid grid-cols-[70px_1fr] items-center gap-2">
            <span className="text-right text-[12px] font-light tracking-widest text-[#4e535a]">成交日期</span>
            <Input type="date" value={dealDate} onChange={event => setDealDate(event.target.value)} className="h-8 text-[12px]" />
          </div>
          <div className="grid grid-cols-[70px_1fr] items-center gap-2">
            <span className="text-right text-[12px] font-light tracking-widest text-[#4e535a]">所属组织</span>
            <SelectDropdown value={settlementOrganizationId} options={settlementOrganizations.map(item => ({ value: item.id, label: item.name }))} onChange={setSettlementOrganizationId} disabled={loadingOrganizations || settlementOrganizations.length === 0} placeholder={loadingOrganizations ? "加载中" : "选择所属组织"} />
          </div>
          <div className="ml-[19px] border-b border-[#ebedf0]" style={{ borderBottomWidth: "0.5px" }} />
          <div className="grid grid-cols-[70px_1fr] items-center gap-2">
            <span className="text-right text-[12px] font-light tracking-widest text-[#4e535a]">用户</span>
            <CustomerSearchInput customers={customers} value={nickname} onChange={value => { const next = typeof value === "string" ? value : ""; setNickname(next); if (!next) setCustomerId("") }} onSelectItem={customer => { setNickname(customer.nickname); setCustomerId(customer.id) }} selectionOnly disabled={!!presetCustomer} placeholder="搜索姓名或昵称" />
          </div>
          <div className="grid grid-cols-[70px_1fr] items-center gap-2">
            <span className="text-right text-[12px] font-light tracking-widest text-[#4e535a]">课程所属</span>
            <SelectDropdown value={courseOrganizationId} options={courseOrganizations.map(item => ({ value: item.id, label: item.name }))} onChange={value => { setCourseOrganizationId(value); setCourseKey("") }} disabled={!customerId || loadingOptions || courseOrganizations.length === 0} placeholder={loadingOptions ? "加载中" : "选择课程所属"} />
          </div>
          <div className="grid grid-cols-[70px_1fr] items-center gap-2">
            <span className="text-right text-[12px] font-light tracking-widest text-[#4e535a]">所扣课程</span>
            <SelectDropdown value={courseKey} options={visibleCourses.map(course => ({ value: `${course.record_type}:${course.record_id}`, label: `${course.date} ${course.start_time || ""} · ${course.name} · ${course.deduction_count}次`.trim() }))} onChange={setCourseKey} disabled={!courseOrganizationId || visibleCourses.length === 0} placeholder={courseOrganizationId && visibleCourses.length === 0 ? "暂无可扣课程" : "选择尚未扣除的课程"} dropdownWidth={420} menuMaxHeight={280} />
          </div>
          <div className="grid grid-cols-[70px_1fr] items-start gap-2">
            <span className="mt-2 text-right text-[12px] font-light tracking-widest text-[#4e535a]">成交人</span>
            <CloserInput customers={customers} value={closers} onChange={setClosers} showAmounts={false} />
          </div>
          <div className="grid grid-cols-[70px_1fr] items-center gap-2">
            <span className="text-right text-[12px] font-light tracking-widest text-[#4e535a]">备注</span>
            <Input value={notes} onChange={event => setNotes(event.target.value)} placeholder="额外信息（可选）" className="h-8 text-[12px]" />
          </div>
          {message && <div className={`pl-[78px] text-[12px] ${message.error ? "text-[#c4506a]" : "text-[#2f855a]"}`}>{message.text}</div>}
          <div className="flex justify-end gap-2 border-t pt-2">
            <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>取消</Button>
            <Button size="sm" disabled={!dealDate || !selectedCourse || !settlementOrganizationId || saving} onClick={handleSubmit}>
              {saving ? "保存中..." : selectedCourse ? `抵扣 ${selectedCourse.deduction_count} 次` : "保存"}
            </Button>
          </div>
        </div>
      </div>}

      {!formOnly && <div className="min-h-0 flex-1 overflow-hidden rounded-xl bg-white shadow-[0_2px_4px_rgba(33,38,49,.05)]">
        <div className="flex items-center justify-end border-b border-[#f0f0f0] px-4 py-2.5">
          <Button size="sm" className="h-8 bg-[#212631] text-[12px] font-normal hover:bg-[#303641]" onClick={() => setEntryOpen(true)}>
            <Plus className="mr-1 h-3.5 w-3.5 text-[#a3c0ff]" />新增
          </Button>
        </div>
        <Table style={{ tableLayout: "fixed" }}>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[105px] pl-4">成交日期</TableHead>
              <TableHead className="w-[110px]">用户</TableHead>
              <TableHead className="w-[130px]">所属组织</TableHead>
              <TableHead className="w-[130px]">课程所属</TableHead>
              <TableHead>所扣课程</TableHead>
              <TableHead className="w-[105px]">课程日期</TableHead>
              <TableHead className="w-[80px]">抵扣次数</TableHead>
              <TableHead className="w-[110px]">成交人</TableHead>
              <TableHead className="w-[120px]">备注</TableHead>
              <TableHead className="w-[90px]">创建人</TableHead>
              <TableHead className="w-[56px] pr-4 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.map(record => (
              <TableRow key={record.id} className="group">
                <TableCell className="pl-4 text-[12px]">{record.deduction_date || <EmptyValue />}</TableCell>
                <TableCell className="truncate text-[12px]" title={record.nickname}>{record.nickname}</TableCell>
                <TableCell className="truncate text-[12px]" title={record.organization_name}>{record.organization_name || <EmptyValue />}</TableCell>
                <TableCell className="truncate text-[12px]" title={record.source_organization_name}>{record.source_organization_name || <EmptyValue />}</TableCell>
                <TableCell className="truncate text-[12px]" title={record.source_activity_name}>{record.source_activity_name || record.reason}</TableCell>
                <TableCell className="text-[12px]">{record.source_activity_date || <EmptyValue />}</TableCell>
                <TableCell className="text-[12px]">{record.count} 次</TableCell>
                <TableCell className="truncate text-[12px]" title={(record.closers || []).map(item => item.name).join("、") || record.closer_name}>
                  {(record.closers || []).map(item => item.name).join("、") || record.closer_name || <EmptyValue />}
                </TableCell>
                <TableCell className="truncate text-[12px]" title={record.notes}>{record.notes || <EmptyValue />}</TableCell>
                <TableCell className="truncate text-[12px] text-[#8f959e]">{record.created_by || <EmptyValue />}</TableCell>
                <TableCell className="pr-4 text-right">
                  {canDeleteRecord(record) && (
                    <div className="flex justify-end opacity-0 transition-opacity group-hover:opacity-100">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => setDeleteTarget(record)}
                        aria-label={`删除${record.nickname}的粗门次卡抵扣记录`}
                        title="删除"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {records.length === 0 && <div className="py-16 text-center text-[12px] text-[#8f959e]">暂无粗门次卡抵扣记录</div>}
      </div>}

      {!formOnly && <Dialog open={entryOpen} onOpenChange={setEntryOpen}>
        <DialogContent className="max-w-sm gap-0 p-0" initialFocus={false}>
          <CoarseDoorCardTab
            formOnly
            onCancel={() => setEntryOpen(false)}
            onSaved={() => {
              setEntryOpen(false)
              loadRecords()
              onSaved?.()
            }}
          />
        </DialogContent>
      </Dialog>}

      <AlertDialog open={!!deleteTarget} onOpenChange={open => { if (!open && !deleting) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除粗门次卡抵扣记录</AlertDialogTitle>
            <AlertDialogDescription>
              确定删除 {deleteTarget?.nickname} 的「{deleteTarget?.source_activity_name || "所选课程"}」抵扣记录吗？删除后课程会恢复为可抵扣状态，原会员卡将重新扣回 {deleteTarget?.count || 0} 次。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <AlertDialogAction className="bg-[#f54a45] hover:bg-[#e03e3a]" onClick={handleDelete} disabled={deleting}>
              {deleting ? "删除中..." : "确定删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteError} onOpenChange={open => { if (!open) setDeleteError("") }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>无法删除</AlertDialogTitle>
            <AlertDialogDescription>{deleteError}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setDeleteError("")}>知道了</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
