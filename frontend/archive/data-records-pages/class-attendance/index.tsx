// [已归档] 原“数据记录”页面内容，2026-08-01 起退出构建。
import { useState, useEffect, useCallback, useMemo } from "react"
import { X } from "lucide-react"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { SelectDropdown } from "@/components/select-dropdown"
import { CustomerSearchInput } from "@/components/customer-search-input"
import { PaginationBar } from "@/components/pagination-bar"
import { useServerPagination } from "@/hooks/use-server-pagination"
import { classRecordApi, customerApi, type CustomerLight, type UnifiedRecord } from "@/lib/api"

const ACTIVITY_TYPES = [
  { value: "class", label: "沙龙" },
  { value: "gcs", label: "觉醒游戏" },
  { value: "ers", label: "情绪释放" },
  { value: "eks", label: "能量结" },
  { value: "ics", label: "内部课程" },
  { value: "ocr", label: "OH卡梳理" },
]

const TYPE_LABELS: Record<string, string> = {
  class: "沙龙",
  gcs: "觉醒游戏",
  ers: "情绪释放",
  eks: "能量结",
  ics: "内部课程",
  ocr: "OH卡梳理",
}

export function ClassAttendanceContent({ embedded }: { embedded?: boolean }) {
  // 筛选
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [activityType, setActivityType] = useState("")
  const [teacherId, setTeacherId] = useState("")
  const [teacherName, setTeacherName] = useState("")
  const [customers, setCustomers] = useState<CustomerLight[]>([])

  useEffect(() => {
    customerApi.light().then(setCustomers).catch(() => {})
  }, [])

  // 构建筛选参数
  const filterParams = useMemo(() => ({
    start_date: startDate || undefined,
    end_date: endDate || undefined,
    type: activityType || undefined,
    teacher_id: teacherId || undefined,
  }), [startDate, endDate, activityType, teacherId])

  // 服务端分页
  const {
    paginatedItems: records, loading,
    currentPage, totalPages, totalItems,
    startIndex, endIndex, goToPage,
  } = useServerPagination<UnifiedRecord>(
    useCallback((page, pageSize) => classRecordApi.listUnified(page, pageSize, filterParams), [filterParams]),
    { pageSize: 10 }
  )

  // 老师名称映射
  const customerMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const c of customers) map[c.id] = c.nickname
    return map
  }, [customers])

  const getTeacherNames = (teacherIds: string[]) => {
    if (!teacherIds || teacherIds.length === 0) return "-"
    return teacherIds.map(id => customerMap[id] || id).join("、")
  }

  const getRecordTitle = (item: UnifiedRecord) => {
    const d = item.data
    switch (item.type) {
      case "class": return d.course_name || "-"
      case "gcs": return `觉醒游戏`
      case "ers": return `情绪释放`
      case "eks": return `能量结`
      case "ics": return d.course_name || "内部课程"
      case "ocr": return `OH卡梳理`
      default: return "-"
    }
  }

  const getOwnerName = (item: UnifiedRecord) => {
    const d = item.data
    if (item.type === "class" || item.type === "ics") return null
    return d.owner_name || null
  }

  const clearFilters = () => {
    setStartDate("")
    setEndDate("")
    setActivityType("")
    setTeacherId("")
    setTeacherName("")
  }

  const hasFilters = startDate || endDate || activityType || teacherId

  return (
    <div className={embedded ? "space-y-3" : "px-6 pt-4 pb-6 space-y-3"}>
      {/* 筛选栏 */}
      <div className="bg-white rounded-lg px-4 py-3 flex items-center gap-3 flex-wrap">
        <div className="w-[160px]">
          <CustomerSearchInput
            customers={customers}
            value={teacherName}
            onChange={(v) => {
              const name = typeof v === "string" ? v : v[0] || ""
              setTeacherName(name)
              if (!name) setTeacherId("")
            }}
            onSelectItem={(c) => { setTeacherId(c.id); setTeacherName(c.nickname) }}
            placeholder="搜索老师"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="h-8 text-[12px] border border-[#dee0e3] rounded px-2" />
          <span className="text-[12px] text-[#8f959e]">至</span>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="h-8 text-[12px] border border-[#dee0e3] rounded px-2" />
        </div>

        <div className="w-[120px]">
          <SelectDropdown
            value={activityType}
            options={ACTIVITY_TYPES}
            placeholder="全部活动"
            onChange={setActivityType}
          />
        </div>

        {hasFilters && (
          <Button variant="ghost" size="sm" className="h-8 text-[12px] text-[#8f959e]" onClick={clearFilters}>
            <X className="h-3.5 w-3.5 mr-1" /> 清除
          </Button>
        )}
      </div>

      {/* 表格 */}
      <div className="bg-white rounded-lg">
        {loading ? (
          <div className="py-16 text-center text-[12px] text-muted-foreground">加载中...</div>
        ) : records.length === 0 ? (
          <div className="py-16 text-center text-[12px] text-muted-foreground">暂无记录</div>
        ) : (
          <Table>
            <TableHeader className="[&_tr]:!h-9">
              <TableRow className="hover:bg-transparent !h-9">
                <TableHead className="pl-4 !h-8 text-[12px]">日期</TableHead>
                <TableHead className="!h-8 text-[12px]">老师</TableHead>
                <TableHead className="!h-8 text-[12px]">活动类型</TableHead>
                <TableHead className="!h-8 text-[12px]">活动名称</TableHead>
                <TableHead className="!h-8 text-[12px]">案主</TableHead>
                <TableHead className="!h-8 text-[12px]">参与人数</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((item: UnifiedRecord, idx: number) => {
                const d = item.data
                const ownerName = getOwnerName(item)
                return (
                  <TableRow key={idx} className="!h-9">
                    <TableCell className="pl-4 py-1.5 text-[12px] text-[#2b2f36]">{d.date}</TableCell>
                    <TableCell className="py-1.5 text-[12px] text-[#2b2f36]">{getTeacherNames(d.teacher_ids || [])}</TableCell>
                    <TableCell className="py-1.5 text-[12px] text-[#4e535a]">{TYPE_LABELS[item.type] || item.type}</TableCell>
                    <TableCell className="py-1.5 text-[12px] text-[#2b2f36]">{getRecordTitle(item)}</TableCell>
                    <TableCell className="py-1.5 text-[12px]">{ownerName ? <span className="text-[#2b2f36]">{ownerName}</span> : <span className="text-[#c0c4cc]">-</span>}</TableCell>
                    <TableCell className="py-1.5 text-[12px] text-[#2b2f36]">{(d.participant_ids || []).length} 人</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}

        {totalItems > 0 && (
          <PaginationBar
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            startIndex={startIndex}
            endIndex={endIndex}
            onPageChange={goToPage}
          />
        )}
      </div>
    </div>
  )
}

export default function ClassAttendancePage() {
  return <ClassAttendanceContent />
}
