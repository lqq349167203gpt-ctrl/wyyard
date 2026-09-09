import { useEffect, useMemo, useState } from "react"

import { CustomerSearchInput } from "@/components/customer-search-input"
import { SelectDropdown } from "@/components/select-dropdown"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  customerApi,
  projectDeductionApi,
  type CoarseDoorCourseOption,
  type CustomerLight,
  type ProjectDeduction,
} from "@/lib/api"

const EmptyValue = () => <span className="text-[#d0d3d6]">-</span>

interface CoarseDoorCardTabProps {
  presetCustomer?: Pick<CustomerLight, "id" | "nickname"> | null
  formOnly?: boolean
  onSaved?: () => void
}

export function CoarseDoorCardTab({ presetCustomer, formOnly = false, onSaved }: CoarseDoorCardTabProps = {}) {
  const [customers, setCustomers] = useState<CustomerLight[]>([])
  const [customerId, setCustomerId] = useState(presetCustomer?.id || "")
  const [nickname, setNickname] = useState(presetCustomer?.nickname || "")
  const [organizationId, setOrganizationId] = useState("")
  const [courseKey, setCourseKey] = useState("")
  const [organizations, setOrganizations] = useState<{ id: string; name: string }[]>([])
  const [courses, setCourses] = useState<CoarseDoorCourseOption[]>([])
  const [records, setRecords] = useState<ProjectDeduction[]>([])
  const [loadingOptions, setLoadingOptions] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)

  const loadRecords = async () => {
    try {
      const result = await projectDeductionApi.listPaginated(1, 100, {
        project_type: "membership-cards",
        card_type: "粗门次卡",
      })
      setRecords(result.items)
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
    setOrganizationId("")
    setCourseKey("")
    setOrganizations([])
    setCourses([])
    setMessage(null)
    if (!customerId) return
    setLoadingOptions(true)
    projectDeductionApi.getCoarseDoorOptions(customerId)
      .then(data => {
        setOrganizations(data.organizations)
        setCourses(data.courses)
        if (data.organizations.length === 1) setOrganizationId(data.organizations[0].id)
      })
      .catch(error => setMessage({ text: error instanceof Error ? error.message : "课程加载失败", error: true }))
      .finally(() => setLoadingOptions(false))
  }, [customerId])

  const visibleCourses = useMemo(
    () => courses.filter(course => course.organization_ids.includes(organizationId)),
    [courses, organizationId],
  )

  const selectedCourse = visibleCourses.find(course => `${course.record_type}:${course.record_id}` === courseKey)

  const handleSubmit = async () => {
    if (!customerId || !selectedCourse || saving) return
    setSaving(true)
    setMessage(null)
    try {
      await projectDeductionApi.createCoarseDoorCourse({
        customer_id: customerId,
        record_type: selectedCourse.record_type,
        record_id: selectedCourse.record_id,
        organization_id: organizationId,
      })
      const data = await projectDeductionApi.getCoarseDoorOptions(customerId)
      setOrganizations(data.organizations)
      setCourses(data.courses)
      setCourseKey("")
      if (!data.organizations.some(item => item.id === organizationId)) setOrganizationId("")
      if (!formOnly) await loadRecords()
      setMessage({ text: `已抵扣 ${selectedCourse.deduction_count} 次，原会员卡已返还对应次数`, error: false })
      onSaved?.()
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "扣卡失败", error: true })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className={formOnly ? "bg-white px-5 py-4" : "rounded-xl bg-white px-5 py-4 shadow-[0_2px_4px_rgba(33,38,49,.05)]"}>
        <div className="mb-4">
          <div className="text-[14px] font-medium text-[#1f2329]">用粗门次卡抵扣课程</div>
          <div className="mt-1 text-[12px] text-[#8f959e]">选择已参与且扣卡次数大于 0 的课程；抵扣后会返还原会员卡的对应次数</div>
        </div>
        <div className={formOnly ? "grid grid-cols-2 items-end gap-3" : "grid grid-cols-[220px_190px_minmax(260px,1fr)_88px] items-end gap-3"}>
          <label className="space-y-1.5">
            <span className="text-[12px] text-[#4e535a]">用户昵称</span>
            <CustomerSearchInput
              customers={customers}
              value={nickname}
              onChange={value => {
                const next = typeof value === "string" ? value : ""
                setNickname(next)
                if (!next) setCustomerId("")
              }}
              onSelectItem={customer => {
                setNickname(customer.nickname)
                setCustomerId(customer.id)
              }}
              selectionOnly
              disabled={!!presetCustomer}
              placeholder="搜索并选择客户"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-[12px] text-[#4e535a]">所属组织</span>
            <SelectDropdown
              value={organizationId}
              options={organizations.map(item => ({ value: item.id, label: item.name }))}
              onChange={value => { setOrganizationId(value); setCourseKey("") }}
              disabled={!customerId || loadingOptions || organizations.length === 0}
              placeholder={loadingOptions ? "加载中" : "选择组织"}
            />
          </label>
          <label className="min-w-0 space-y-1.5">
            <span className="text-[12px] text-[#4e535a]">所扣课程</span>
            <SelectDropdown
              value={courseKey}
              options={visibleCourses.map(course => ({
                value: `${course.record_type}:${course.record_id}`,
                label: `${course.date} ${course.start_time || ""} · ${course.name} · ${course.deduction_count}次`.trim(),
              }))}
              onChange={setCourseKey}
              disabled={!organizationId || visibleCourses.length === 0}
              placeholder={organizationId && visibleCourses.length === 0 ? "暂无可扣课程" : "选择尚未扣除的课程"}
              dropdownWidth={420}
              menuMaxHeight={280}
            />
          </label>
          <Button className="h-8 bg-[#212631] text-[12px] font-normal hover:bg-[#303641]" disabled={!selectedCourse || saving} onClick={handleSubmit}>
            {saving ? "抵扣中" : selectedCourse ? `抵扣 ${selectedCourse.deduction_count} 次` : "确认抵扣"}
          </Button>
        </div>
        {message && (
          <div className={`mt-3 text-[12px] ${message.error ? "text-[#c4506a]" : "text-[#2f855a]"}`}>{message.text}</div>
        )}
      </div>

      {!formOnly && <div className="min-h-0 flex-1 overflow-hidden rounded-xl bg-white shadow-[0_2px_4px_rgba(33,38,49,.05)]">
        <Table style={{ tableLayout: "fixed" }}>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[110px] pl-4">课程日期</TableHead>
              <TableHead className="w-[110px]">用户</TableHead>
              <TableHead className="w-[150px]">所属组织</TableHead>
              <TableHead>所扣课程</TableHead>
              <TableHead className="w-[80px]">抵扣次数</TableHead>
              <TableHead className="w-[90px]">录入人</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.map(record => (
              <TableRow key={record.id}>
                <TableCell className="pl-4 text-[12px]">{record.source_activity_date || record.deduction_date}</TableCell>
                <TableCell className="truncate text-[12px]" title={record.nickname}>{record.nickname}</TableCell>
                <TableCell className="truncate text-[12px]" title={record.source_organization_name}>{record.source_organization_name || <EmptyValue />}</TableCell>
                <TableCell className="truncate text-[12px]" title={record.source_activity_name}>{record.source_activity_name || record.reason}</TableCell>
                <TableCell className="text-[12px]">{record.count} 次</TableCell>
                <TableCell className="truncate text-[12px] text-[#8f959e]">{record.created_by || <EmptyValue />}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {records.length === 0 && <div className="py-16 text-center text-[12px] text-[#8f959e]">暂无粗门次卡抵扣记录</div>}
      </div>}
    </div>
  )
}
