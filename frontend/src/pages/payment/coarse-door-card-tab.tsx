import { useEffect, useMemo, useState } from "react"
import { Pencil, Plus, Trash2 } from "lucide-react"

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
import { PaymentScopeFilters, UNASSIGNED_COURSE } from "./payment-scope-filters"

const EmptyValue = () => <span className="text-[#d0d3d6]">-</span>
const today = new Date().toLocaleDateString("sv-SE")

interface CoarseDoorCardTabProps {
  editRecord?: ProjectDeduction | null
  presetCustomer?: Pick<CustomerLight, "id" | "nickname"> | null
  formOnly?: boolean
  showHeader?: boolean
  onSaved?: () => void
  onCancel?: () => void
}

export function CoarseDoorCardTab({ presetCustomer, editRecord, formOnly = false, showHeader = true, onSaved, onCancel }: CoarseDoorCardTabProps = {}) {
  const editPermissions = useEditPermissions()
  const { organizations: settlementOrganizations, loading: loadingOrganizations } = useOrganizations()
  const currentUser = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("currentUser") || "{}") }
    catch { return {} }
  }, [])
  const currentActorName = String(currentUser.owner || currentUser.username || "")
  const [customers, setCustomers] = useState<CustomerLight[]>([])
  const [customerId, setCustomerId] = useState(editRecord?.customer_id || presetCustomer?.id || "")
  const [nickname, setNickname] = useState(editRecord?.nickname || presetCustomer?.nickname || "")
  const [dealDate, setDealDate] = useState(editRecord?.deduction_date || today)
  const [closers, setClosers] = useState<Closer[]>(editRecord?.closers || [])
  const [notes, setNotes] = useState(editRecord?.notes || "")
  const [courseOrganizationId, setCourseOrganizationId] = useState("")
  const [settlementOrganizationId, setSettlementOrganizationId] = useState(editRecord?.organization_id || "")
  const [courseKey, setCourseKey] = useState("")
  const [courseOrganizations, setCourseOrganizations] = useState<{ id: string; name: string }[]>([])
  const [courses, setCourses] = useState<CoarseDoorCourseOption[]>([])
  const [records, setRecords] = useState<ProjectDeduction[]>([])
  const [searchNickname, setSearchNickname] = useState("")
  const [organizationFilter, setOrganizationFilter] = useState("all")
  const [courseFilter, setCourseFilter] = useState("all")
  const [dealCourseOptions, setDealCourseOptions] = useState<{ key: string; name: string }[]>([])
  const [organizationOptions, setOrganizationOptions] = useState<{ id: string; name: string }[]>([])
  const [includeUnassignedCourse, setIncludeUnassignedCourse] = useState(false)
  const [listVersion, setListVersion] = useState(0)
  const [loadingOptions, setLoadingOptions] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const [orgMissing, setOrgMissing] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ProjectDeduction | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState("")
  const [entryOpen, setEntryOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<ProjectDeduction | null>(null)

  const canDeleteRecord = (record: ProjectDeduction) => (
    !record.cancelled && (currentUser.role === "超级管理员"
    || editPermissions.payments === "all"
    || (
      editPermissions.payments === "own"
      && Boolean(record.created_by && currentActorName && record.created_by === currentActorName)
    ))
  )

  useEffect(() => {
    customerApi.light().then(setCustomers).catch(() => setCustomers([]))
  }, [])

  useEffect(() => {
    if (formOnly) return
    let active = true
    const params: Record<string, string> = {
      project_type: "membership-cards",
      card_type: "粗门次卡",
      include_filter_options: "true",
    }
    if (searchNickname) params.nickname = searchNickname
    if (organizationFilter !== "all") params.organization_id = organizationFilter
    if (courseFilter !== "all") params.deal_course_key = courseFilter
    projectDeductionApi.listPaginated(1, 100, params)
      .then(result => {
        if (!active) return
        const page = result as {
          deal_course_options?: { key: string; name: string }[]
          organization_options?: { id: string; name: string }[]
          unassigned_course?: boolean
        }
        if (page.deal_course_options) setDealCourseOptions(page.deal_course_options)
        if (page.organization_options) setOrganizationOptions(page.organization_options)
        setIncludeUnassignedCourse(page.unassigned_course === true)
        setRecords([...result.items].sort((a, b) => (
          (b.deduction_date || b.created_at).localeCompare(a.deduction_date || a.created_at)
          || b.created_at.localeCompare(a.created_at)
        )))
      })
      .catch(() => { if (active) setRecords([]) })
    return () => { active = false }
  }, [formOnly, searchNickname, organizationFilter, courseFilter, listVersion])

  useEffect(() => {
    if (formOnly) return
    if (organizationFilter !== "all" && !organizationOptions.some(org => org.id === organizationFilter)) {
      setOrganizationFilter("all")
    }
    if (courseFilter === UNASSIGNED_COURSE && !includeUnassignedCourse) setCourseFilter("all")
    else if (courseFilter !== "all" && courseFilter !== UNASSIGNED_COURSE && !dealCourseOptions.some(course => course.key === courseFilter)) {
      setCourseFilter("all")
    }
  }, [formOnly, organizationFilter, courseFilter, organizationOptions, dealCourseOptions, includeUnassignedCourse])

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
    let active = true
    projectDeductionApi.getCoarseDoorOptions(customerId, editRecord?.id)
      .then(data => {
        if (!active) return
        const nextCourseOrganizations = data.course_organizations || data.organizations
        setCourseOrganizations(nextCourseOrganizations)
        setCourses(data.courses)
        if (nextCourseOrganizations.length === 1) setCourseOrganizationId(nextCourseOrganizations[0].id)
        if (editRecord) {
          setCourseOrganizationId(editRecord.source_organization_id || "")
          setCourseKey(`${editRecord.source_activity_type}:${editRecord.source_activity_id}`)
        }
      })
      .catch(error => { if (active) setMessage({ text: error instanceof Error ? error.message : "课程加载失败", error: true }) })
      .finally(() => { if (active) setLoadingOptions(false) })
    return () => { active = false }
  }, [customerId, editRecord])

  const visibleCourses = useMemo(
    () => courses.filter(course => course.organization_ids.includes(courseOrganizationId)),
    [courses, courseOrganizationId],
  )

  const selectedCourse = visibleCourses.find(course => `${course.record_type}:${course.record_id}` === courseKey)

  const handleSubmit = async () => {
    if (saving) return
    // 成交归属必填：只有点了保存又没选时才提示
    if (!settlementOrganizationId) { setOrgMissing(true); return }
    setOrgMissing(false)
    if (!customerId || !selectedCourse) return
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
      }, editRecord?.id)
      const data = await projectDeductionApi.getCoarseDoorOptions(customerId)
      const nextCourseOrganizations = data.course_organizations || data.organizations
      setCourseOrganizations(nextCourseOrganizations)
      setCourses(data.courses)
      setCourseKey("")
      setClosers([])
      setNotes("")
      if (!nextCourseOrganizations.some(item => item.id === courseOrganizationId)) setCourseOrganizationId("")
      if (!formOnly) setListVersion(version => version + 1)
      setMessage({ text: editRecord ? "修改已保存，课程抵扣已同步" : `已抵扣 ${selectedCourse.deduction_count} 次，原会员卡已返还对应次数`, error: false })
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
      setListVersion(version => version + 1)
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
    <div className="flex w-full min-w-0 max-w-full min-h-0 flex-1 flex-col gap-3">
      {formOnly && <div className="bg-white">
        {showHeader && <DialogHeader className="border-b px-6 pb-4 pt-5">
          <DialogTitle className="text-base">{editRecord ? "编辑粗门次卡" : "新增粗门次卡"}</DialogTitle>
        </DialogHeader>}
        <div className="space-y-4 px-6 py-5">
          <p className="text-[12px] text-[#8f959e]">成交归属记录本次结算归属，成交课程用于筛选课程；抵扣后会返还原会员卡的对应次数</p>
          <div className="grid grid-cols-[70px_1fr] items-center gap-2">
            <span className="text-right text-[12px] font-light tracking-widest text-[#4e535a]">成交日期</span>
            <Input type="date" value={dealDate} onChange={event => setDealDate(event.target.value)} className="h-8 text-[12px]" />
          </div>
          <div className="grid grid-cols-[70px_1fr] items-center gap-2">
            <span className="text-right text-[12px] font-light tracking-widest text-[#4e535a]">成交归属</span>
            <SelectDropdown value={settlementOrganizationId} options={settlementOrganizations.filter(org => org.status !== "archived" || (editRecord && org.id === settlementOrganizationId)).map(item => ({ value: item.id, label: item.name + (item.status === "archived" ? "（已归档）" : "") }))} onChange={value => { setSettlementOrganizationId(value); setOrgMissing(false) }} disabled={!!editRecord || loadingOrganizations || settlementOrganizations.length === 0} placeholder={loadingOrganizations ? "加载中" : "请选择成交归属"} />
          </div>
          {/* 成交归属是业绩归属依据：默认不预选，点了保存又没选时才提示 */}
          {orgMissing && !settlementOrganizationId && (
            <div className="grid grid-cols-[70px_1fr] items-center gap-2">
              <span />
              <span className="text-[11px] text-[#c4506a]">{settlementOrganizations.length === 0 ? "暂无可选组织，请先到组织管理里添加" : "成交归属为必填，请选择本次结算归属的组织"}</span>
            </div>
          )}
          <div className="ml-[19px] border-b border-[#ebedf0]" style={{ borderBottomWidth: "0.5px" }} />
          <div className="grid grid-cols-[70px_1fr] items-center gap-2">
            <span className="text-right text-[12px] font-light tracking-widest text-[#4e535a]">用户</span>
            <CustomerSearchInput customers={customers} value={nickname} onChange={value => { const next = typeof value === "string" ? value : ""; setNickname(next); if (!next) setCustomerId("") }} onSelectItem={customer => { setNickname(customer.nickname); setCustomerId(customer.id) }} selectionOnly disabled={!!presetCustomer || !!editRecord} placeholder="搜索姓名或昵称" />
          </div>
          <div className="grid grid-cols-[70px_1fr] items-center gap-2">
            <span className="text-right text-[12px] font-light tracking-widest text-[#4e535a]">成交课程</span>
            <SelectDropdown value={courseOrganizationId} options={courseOrganizations.map(item => ({ value: item.id, label: item.name }))} onChange={value => { setCourseOrganizationId(value); setCourseKey("") }} disabled={!customerId || loadingOptions || courseOrganizations.length === 0} placeholder={loadingOptions ? "加载中" : "选择成交课程"} placeholderColor="text-[#a8b1bd]" textColor={courseOrganizationId ? "text-[#2b2f36]" : undefined} />
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
            <Button size="sm" disabled={!dealDate || !selectedCourse || saving} onClick={handleSubmit}>
              {saving ? "保存中..." : editRecord ? "保存修改" : selectedCourse ? `抵扣 ${selectedCourse.deduction_count} 次` : "保存"}
            </Button>
          </div>
        </div>
      </div>}

      {!formOnly && <div className="w-full min-w-0 max-w-full min-h-0 flex-1 overflow-hidden rounded-xl bg-white shadow-[0_2px_4px_rgba(33,38,49,.05)]">
        <div className="flex flex-wrap items-center gap-2 border-b border-[#f0f0f0] px-4 py-2.5">
          <div className="w-[172px]">
            <CustomerSearchInput
              customers={customers}
              value={searchNickname}
              onChange={value => setSearchNickname(typeof value === "string" ? value : "")}
              placeholder="搜索用户"
              filterSelected={false}
              className="border-[#e1e4e7] bg-white px-2.5 placeholder:text-[#a8b1bd]"
              rounded="7px"
            />
          </div>
          <PaymentScopeFilters
            organizationId={organizationFilter}
            courseKey={courseFilter}
            organizations={organizationOptions.map(org => ({
              id: org.id,
              name: org.name || settlementOrganizations.find(item => item.id === org.id)?.name || org.id,
            }))}
            courses={dealCourseOptions}
            includeUnassignedCourse={includeUnassignedCourse}
            onOrganizationChange={setOrganizationFilter}
            onCourseChange={setCourseFilter}
          />
          <div className="flex-1" />
          <Button size="sm" className="h-8 bg-[#212631] text-[12px] font-normal hover:bg-[#303641]" onClick={() => setEntryOpen(true)}>
            <Plus className="mr-1 h-3.5 w-3.5 text-[#a3c0ff]" />新增
          </Button>
        </div>
        <Table style={{ tableLayout: "fixed" }}>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-4" style={{ width: "100px" }}>成交日期</TableHead>
              <TableHead className="w-[110px]">用户</TableHead>
              <TableHead>所扣课程</TableHead>
              <TableHead className="w-[105px]">课程日期</TableHead>
              <TableHead className="w-[80px]">抵扣次数</TableHead>
              <TableHead style={{ width: "100px" }}>成交人</TableHead>
              <TableHead className="w-[120px]">备注</TableHead>
              <TableHead style={{ width: "80px" }}>创建人</TableHead>
              <TableHead className="w-[56px] pr-4 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.map(record => (
              <TableRow key={record.id} className="group">
                <TableCell className="pl-4 text-[12px]">
                  <div className="truncate">{record.deduction_date || <EmptyValue />}</div>
                  <div className="mt-1 truncate text-[12px] text-[#a8adb5]" title={record.organization_name}>{record.organization_name || <EmptyValue />}</div>
                </TableCell>
                <TableCell className="truncate text-[12px]" title={record.nickname}>{record.nickname}</TableCell>
                <TableCell className="text-[12px]">
                  <div className="truncate" title={record.source_activity_name}>{record.source_activity_name || record.reason}</div>
                  <div className="mt-1 truncate text-[12px] text-[#a8adb5]" title={record.source_organization_name}>{record.source_organization_name || <EmptyValue />}</div>
                </TableCell>
                <TableCell className="text-[12px]">{record.source_activity_date || <EmptyValue />}</TableCell>
                <TableCell className="text-[12px]">{record.count} 次{record.cancelled && <div className="text-[12px] text-[#8f959e]">已取消｜已从课程移除</div>}</TableCell>
                <TableCell className="truncate text-[12px]" title={(record.closers || []).map(item => item.name).join("、") || record.closer_name}>
                  {(record.closers || []).map(item => item.name).join("、") || record.closer_name || <EmptyValue />}
                </TableCell>
                <TableCell className="truncate text-[12px]" title={record.notes}>{record.notes || <EmptyValue />}</TableCell>
                <TableCell className="truncate text-[12px] text-[#8f959e]">{record.created_by || <EmptyValue />}</TableCell>
                <TableCell className="pr-4 text-right">
                  {canDeleteRecord(record) && (
                    <div className="flex justify-end">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="编辑" aria-label={`编辑${record.nickname}的粗门抵扣`} onClick={() => { setEditTarget(record); setEntryOpen(true) }}><Pencil className="h-3.5 w-3.5" /></Button>
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

      {!formOnly && <Dialog open={entryOpen} onOpenChange={open => { setEntryOpen(open); if (!open) setEditTarget(null) }}>
        <DialogContent className="max-w-sm gap-0 p-0" initialFocus={false}>
          <CoarseDoorCardTab
            formOnly
            editRecord={editTarget}
            onCancel={() => { setEntryOpen(false); setEditTarget(null) }}
            onSaved={() => {
              setEntryOpen(false)
              setEditTarget(null)
              setListVersion(version => version + 1)
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
