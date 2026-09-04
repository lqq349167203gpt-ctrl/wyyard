import { useCallback, useEffect, useMemo, useState } from "react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { CustomerSearchInput } from "@/components/customer-search-input"
import { PaginationBar } from "@/components/pagination-bar"
import { SelectDropdown } from "@/components/select-dropdown"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { useServerPagination } from "@/hooks/use-server-pagination"
import {
  serviceTeacherCustomerApi,
  type CustomerLight,
  type ServiceTeacherCustomerItem,
  type ServiceTeacherCustomerSummary,
  type ServiceTeacherFollowUpFilter,
} from "@/lib/api"
import DetailView from "@/pages/healing-records/components/detail-view"

const PAGE_SIZE = 20

function currentOwner(): string {
  try {
    const currentUser = JSON.parse(localStorage.getItem("currentUser") || "{}")
    return String(currentUser.owner || currentUser.username || "").trim()
  } catch {
    return ""
  }
}

function teacherOption(name: string): CustomerLight {
  return {
    id: `teacher-${name}`,
    nickname: name,
    name: "",
    member_type: "",
    positions: [],
    position_sort_orders: {},
    created_at: "",
    traffic_source: "",
    traffic_source_detail: "",
    referrer: "",
    referral_date: "",
    space_id: "",
  }
}

function formatDateTime(value: string): string {
  if (!value) return ""
  return new Date(value).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).replaceAll("/", "-")
}

function daysSince(value: string): string {
  if (!value) return "从未跟进"
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime())
  const days = Math.floor(elapsed / 86_400_000)
  if (days === 0) return "今天"
  return `${days} 天前`
}

function EmptyDash() {
  return <span className="text-[#d0d3d6]">-</span>
}

export default function ServiceTeachersPage() {
  const [teacher, setTeacher] = useState(currentOwner)
  const [teacherNames, setTeacherNames] = useState<string[]>([])
  const [followUpFilter, setFollowUpFilter] = useState<ServiceTeacherFollowUpFilter>("inactive_30")
  const [summary, setSummary] = useState<ServiceTeacherCustomerSummary>({ total: 0, active_30: 0, inactive_30: 0 })
  const [metadataError, setMetadataError] = useState("")
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)

  useEffect(() => {
    serviceTeacherCustomerApi.metadata()
      .then(metadata => {
        setTeacherNames(metadata.teachers)
        setTeacher(current => current || metadata.current_teacher)
      })
      .catch(error => setMetadataError(error instanceof Error ? error.message : "服务老师列表加载失败"))
  }, [])

  const fetchCustomers = useCallback(async (page: number, pageSize: number) => {
    const result = await serviceTeacherCustomerApi.list({
      service_teacher: teacher,
      follow_up_filter: followUpFilter,
      page,
      page_size: pageSize,
    })
    setSummary(result.summary)
    return result
  }, [followUpFilter, teacher])

  const pagination = useServerPagination<ServiceTeacherCustomerItem>(fetchCustomers, { pageSize: PAGE_SIZE })

  useEffect(() => {
    pagination.resetPage()
  }, [teacher, followUpFilter, pagination.resetPage])

  const teacherCustomers = useMemo(() => {
    const names = new Set(teacherNames)
    if (teacher) names.add(teacher)
    return [...names].map(teacherOption)
  }, [teacher, teacherNames])

  const summaryItems = [
    { label: "负责客户", value: summary.total, hint: "当前服务老师" },
    { label: "近 30 天已跟进", value: summary.active_30, hint: "三类信息任一有更新" },
    { label: "近 30 天未跟进", value: summary.inactive_30, hint: "包含从未录入" },
  ]

  return (
    <div className="space-y-4 px-6 pb-6 pt-12">
      <div>
        <h1 className="text-lg font-medium text-[#1f2329]">服务老师</h1>
        <p className="mt-1.5 text-[12px] text-[#8f959e]">查看服务老师本人对负责客户的跟进覆盖情况</p>
      </div>

      <div className="grid grid-cols-3 border border-[#f0f0f0] bg-white">
        {summaryItems.map((item, index) => (
          <div key={item.label} className={`px-4 py-3 ${index ? "border-l border-[#f0f0f0]" : ""}`}>
            <div className="text-[12px] text-[#8f959e]">{item.label}</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-lg font-medium tabular-nums text-[#1f2329]">{item.value.toLocaleString()}</span>
              <span className="text-[12px] text-[#8f959e]">人</span>
            </div>
            <div className="mt-1 text-[12px] text-[#8f959e]">{item.hint}</div>
          </div>
        ))}
      </div>

      <div className="overflow-hidden border border-[#f0f0f0] bg-white">
        <div className="flex items-center justify-between gap-4 border-b border-[#f0f0f0] px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-[12px] text-[#4e535a]">服务老师</span>
            <div className="w-[210px]">
              <CustomerSearchInput
                customers={teacherCustomers}
                value={teacher}
                onChange={value => setTeacher(typeof value === "string" ? value : value[0] || "")}
                placeholder="搜索服务老师"
                selectionOnly
                filterSelected={false}
                showClear={false}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-[12px] text-[#4e535a]">跟进情况</span>
            <SelectDropdown
              className="w-[168px]"
              value={followUpFilter}
              options={[
                { value: "inactive_30", label: "近 30 天未跟进" },
                { value: "active_30", label: "近 30 天已跟进" },
                { value: "all", label: "全部客户" },
              ]}
              onChange={value => setFollowUpFilter(value as ServiceTeacherFollowUpFilter)}
            />
          </div>
        </div>

        {metadataError || pagination.error ? (
          <div className="py-16 text-center text-sm text-muted-foreground">{metadataError || pagination.error}</div>
        ) : pagination.loading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">加载中...</div>
        ) : pagination.paginatedItems.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            {teacher ? "当前筛选下暂无客户" : "当前账号未关联所属人，请先选择服务老师"}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">客户昵称</TableHead>
                <TableHead>会员身份</TableHead>
                <TableHead>跟进阶段</TableHead>
                <TableHead>最近录入类型</TableHead>
                <TableHead>最近跟进时间</TableHead>
                <TableHead className="pr-4 text-right">距今</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagination.paginatedItems.map(item => (
                <TableRow key={item.id} className="group">
                  <TableCell className="pl-4">
                    <button type="button" onClick={() => setSelectedCustomerId(item.id)} className="text-[13px] font-medium text-[#2b2f36] hover:text-[#3370ff]">
                      {item.nickname || item.name || <EmptyDash />}
                    </button>
                  </TableCell>
                  <TableCell className="text-[#4e535a]">{item.member_type || <EmptyDash />}</TableCell>
                  <TableCell className="text-[#4e535a]">{item.follow_up_status || <EmptyDash />}</TableCell>
                  <TableCell className="text-[#4e535a]">{item.last_follow_up_category || <EmptyDash />}</TableCell>
                  <TableCell className="text-[12px] text-[#8f959e]">{item.last_follow_up_at ? formatDateTime(item.last_follow_up_at) : <EmptyDash />}</TableCell>
                  <TableCell className={`pr-4 text-right text-[12px] tabular-nums ${item.is_active_30 ? "text-[#8f959e]" : "text-[#c4506a]"}`}>
                    {daysSince(item.last_follow_up_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <PaginationBar
          currentPage={pagination.currentPage}
          totalPages={pagination.totalPages}
          totalItems={pagination.totalItems}
          startIndex={pagination.startIndex}
          endIndex={pagination.endIndex}
          onPageChange={pagination.goToPage}
          unit="人"
        />
      </div>

      <Dialog open={!!selectedCustomerId} onOpenChange={open => { if (!open) setSelectedCustomerId(null) }}>
        <DialogContent className="max-h-[90vh] max-w-[1180px] gap-0 overflow-y-auto p-0">
          <DetailView selectedCustomerId={selectedCustomerId} onClearSelection={() => setSelectedCustomerId(null)} hideSearch />
        </DialogContent>
      </Dialog>
    </div>
  )
}
