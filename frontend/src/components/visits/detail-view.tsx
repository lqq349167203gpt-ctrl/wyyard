import { useState, useEffect, useMemo, useRef } from "react"
import { useEnterToNext } from "@/hooks/use-enter-to-next"
import { ChevronLeft, ChevronRight, Edit, Trash2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { visitApi, customerApi, type VisitRecord, type CustomerLight, type CustomerCreate } from "@/lib/api"
import { CustomerSearchInput } from "@/components/customer-search-input"
import { SelectDropdown } from "@/components/select-dropdown"
import { useCustomerPermissions } from "@/hooks/use-customer-permissions"

function formatDate(d: Date): string {
  return d.toLocaleDateString("sv-SE")
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r
}
function getWeekday(d: string): string {
  return ["日", "一", "二", "三", "四", "五", "六"][new Date(d).getDay()]
}

interface DetailViewProps {
  externalDate?: string
  onExternalDateChange?: (date: string) => void
  hideDateBar?: boolean
  onCustomerClick?: (customerId: string) => void
  onDataLoaded?: (visits: VisitRecord[]) => void
  spaceId?: string
}

export default function DetailView({ externalDate, onExternalDateChange, hideDateBar, onCustomerClick, onDataLoaded, spaceId }: DetailViewProps = {}) {
  const enterToNext = useEnterToNext()
  const today = formatDate(new Date())
  const [internalDate, setInternalDate] = useState(today)
  const selectedDate = externalDate ?? internalDate
  const setSelectedDate = (d: string) => {
    if (onExternalDateChange) onExternalDateChange(d)
    if (!externalDate) setInternalDate(d)
  }
  const [dateRangeStart, setDateRangeStart] = useState(formatDate(addDays(new Date(), -7)))
  const [visits, setVisits] = useState<VisitRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [dailyCounts, setDailyCounts] = useState<Record<string, number>>({})

  // 新增表单状态
  const [searchKeyword, setSearchKeyword] = useState("")
  const [customerList, setCustomerList] = useState<CustomerLight[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerLight | null>(null)
  const [visitTime, setVisitTime] = useState("09:00")
  const [needs, setNeeds] = useState("")
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [editVisit, setEditVisit] = useState<VisitRecord | null>(null)
  const [editDate, setEditDate] = useState("")
  const [editNeeds, setEditNeeds] = useState("")
  const [editSaving, setEditSaving] = useState(false)
  const [showAddUserDialog, setShowAddUserDialog] = useState(false)
  const [showConfirmNewUser, setShowConfirmNewUser] = useState(false)
  const [customerForm, setCustomerForm] = useState<Partial<CustomerCreate>>({})
  const [creatingCustomer, setCreatingCustomer] = useState(false)
  const [customerFormError, setCustomerFormError] = useState("")

  const { permissions: cp, ready: permReady } = useCustomerPermissions("class_records")
  const [customerListReady, setCustomerListReady] = useState(false)

  const visibleIds = useMemo(() => new Set(customerList.map(c => c.id)), [customerList])
  const addedCustomerIds = useMemo(() => visits.map(v => v.customer_id), [visits])
  const filteredVisits = useMemo(() => {
    if (!customerListReady) return []
    return visits.filter(v => visibleIds.has(v.customer_id))
  }, [visits, visibleIds, customerListReady])

  const [visibleCount, setVisibleCount] = useState(40)
  const sentinelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || visibleCount >= filteredVisits.length) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisibleCount(prev => Math.min(prev + 40, filteredVisits.length))
        }
      },
      { rootMargin: "200px" }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [visibleCount, filteredVisits.length])

  const dateRange = Array.from({ length: 21 }, (_, i) => formatDate(addDays(new Date(dateRangeStart), i)))

  // 加载当日数据
  const visitsRetryRef = useRef(0)
  useEffect(() => {
    if (!customerListReady) return
    let cancelled = false
    setLoading(true)
    const load = () => {
      visitApi.list(selectedDate, undefined, spaceId)
        .then((data) => { if (!cancelled) setVisits(data) })
        .catch(() => {
          if (!cancelled && visitsRetryRef.current < 2) {
            visitsRetryRef.current++
            load()
          }
        })
        .finally(() => { if (!cancelled) setLoading(false) })
    }
    load()
    return () => { cancelled = true }
  }, [selectedDate, customerListReady, spaceId])

  // 通知父组件已加载的到访数据
  useEffect(() => {
    if (onDataLoaded && visits.length >= 0 && customerListReady) {
      onDataLoaded(visits)
    }
  }, [visits, onDataLoaded, customerListReady])

  // 加载每日到场人数，使用 member_types + 日期范围做权限过滤
  const countsRetryRef = useRef(0)
  const refreshCounts = () => {
    const endDate = formatDate(addDays(new Date(dateRangeStart), 20))
    const memberTypes = cp.join(",")
    const load = () => {
      visitApi.counts({ memberTypes: memberTypes || undefined, startDate: dateRangeStart, endDate, spaceId })
        .then(setDailyCounts)
        .catch(() => {
          if (countsRetryRef.current < 2) {
            countsRetryRef.current++
            load()
          }
        })
    }
    load()
  }
  useEffect(() => { if (permReady) refreshCounts() }, [permReady, dateRangeStart, cp])

  // 加载客户列表供搜索组件使用
  const customerRetryRef = useRef(0)
  useEffect(() => {
    if (!permReady) return
    let cancelled = false
    const load = () => {
      customerApi.light().then((data) => {
        if (cancelled) return
        let filtered = data
        const cu = JSON.parse(localStorage.getItem("currentUser") || "{}")
        if (cu.role !== "超级管理员") {
          if (cp.length > 0) {
            filtered = data.filter(c => c.member_type && cp.includes(c.member_type))
          } else {
            filtered = []
          }
        }
        setCustomerList(filtered)
        setCustomerListReady(true)
      }).catch(() => {
        if (!cancelled && customerRetryRef.current < 2) {
          customerRetryRef.current++
          load()
        } else {
          setCustomerListReady(true)
        }
      })
    }
    load()
    return () => { cancelled = true }
  }, [permReady, cp])

  const handleAdd = async () => {
    if (!selectedCustomer) {
      if (searchKeyword.trim()) setShowConfirmNewUser(true)
      return
    }
    setSaving(true)
    try {
      await visitApi.create({
        visit_date: selectedDate,
        visit_time: visitTime,
        customer_id: selectedCustomer.id,
        nickname: selectedCustomer.nickname,
        member_type: selectedCustomer.member_type,
        needs,
        space_id: spaceId || undefined,
      })
      setSelectedCustomer(null)
      setSearchKeyword("")
      setNeeds("")
      setVisitTime("09:00")
      const data = await visitApi.list(selectedDate, undefined, spaceId)
      setVisits(data)
      refreshCounts()
    } catch (e) {
      alert(e instanceof Error ? e.message : "添加失败")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await visitApi.delete(deleteId)
      setDeleteId(null)
      const data = await visitApi.list(selectedDate, undefined, spaceId)
      setVisits(data)
      refreshCounts()
    } catch (e) {
      alert(e instanceof Error ? e.message : "删除失败")
    }
  }

  const handleUpdate = async () => {
    if (!editVisit) return
    setEditSaving(true)
    try {
      await visitApi.update(editVisit.id, { visit_date: editDate, needs: editNeeds })
      setEditVisit(null)
      const data = await visitApi.list(selectedDate, undefined, spaceId)
      setVisits(data)
    } catch (e) {
      alert(e instanceof Error ? e.message : "更新失败")
    } finally {
      setEditSaving(false)
    }
  }

  const handleCreateCustomer = async () => {
    if (!customerForm.nickname?.trim()) return
    setCreatingCustomer(true)
    setCustomerFormError("")
    try {
      const created = await customerApi.create(customerForm)
      setShowAddUserDialog(false)
      setSelectedCustomer(created)
      setSearchKeyword(created.nickname)
      setCustomerList(prev => [...prev, created])
    } catch (e) {
      setCustomerFormError(e instanceof Error ? e.message : "创建失败")
    } finally {
      setCreatingCustomer(false)
    }
  }

  return (
    <div className="w-full space-y-3">
      {/* 日期条 */}
      {!hideDateBar && (
      <div className="flex items-center gap-1 bg-white rounded-lg px-3 py-2">
        <button className="h-7 w-7 flex items-center justify-center rounded hover:bg-[#f0f0f0] shrink-0" onClick={() => setDateRangeStart(formatDate(addDays(new Date(dateRangeStart), -7)))}>
          <ChevronLeft className="h-4 w-4 text-[#4e535a]" />
        </button>
        <div className="flex-1 flex items-center justify-center gap-0.5 overflow-x-auto">
          {dateRange.map((d) => {
            const isSelected = d === selectedDate
            const isToday = d === today
            const count = dailyCounts[d] || 0
            return (
              <button
                key={d}
                className={`flex flex-col items-center px-2 py-1.5 rounded-lg transition-colors min-w-[48px] ${
                  isSelected ? "bg-[#3370ff] text-white" : "hover:bg-[#f7f8fa]"
                }`}
                onClick={() => setSelectedDate(d)}
              >
                <span className={`text-[10px] ${isSelected ? "text-white/80" : isToday ? "text-[#3370ff]" : "text-[#8f959e]"}`}>
                  {getWeekday(d)}
                </span>
                <span className={`text-[14px] font-medium leading-tight ${isSelected ? "text-white" : isToday ? "text-[#3370ff]" : "text-[#2b2f36]"}`}>
                  {parseInt(d.split("-")[2])}
                </span>
                {count > 0 && (
                  <span className={`text-[9px] leading-tight ${isSelected ? "text-white/70" : "text-[#b0b5bb]"}`}>
                    {count}人
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <button className="h-7 w-7 flex items-center justify-center rounded hover:bg-[#f0f0f0] shrink-0" onClick={() => setDateRangeStart(formatDate(addDays(new Date(dateRangeStart), 7)))}>
          <ChevronRight className="h-4 w-4 text-[#4e535a]" />
        </button>
      </div>
      )}

      {/* 到场人员列表 */}
      <div className="bg-white rounded-lg">
        <div className="px-4 py-3 flex items-center gap-5 overflow-visible">
          <div className="flex items-center shrink-0">
            <span className="text-xs font-medium text-[#2b2f36]">预计到场</span>
            <span className="text-xs text-[#2b2f36] ml-2">{filteredVisits.length} 人</span>
          </div>
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-xs text-[#4e535a] shrink-0">预计时间</span>
          <Input
            type="time"
            value={visitTime}
            onChange={(e) => setVisitTime(e.target.value)}
            className="h-8 text-xs w-24 shrink-0"
          />
          <span className="text-xs text-[#4e535a] shrink-0">人员</span>
          {/* 搜索用户 */}
          <div className="w-36">
            <CustomerSearchInput
              customers={customerList as any[]}
              value={searchKeyword}
              onChange={(v) => setSearchKeyword(v as string)}
              onSelectItem={(customer) => {
                setSelectedCustomer(customer)
                setSearchKeyword(customer.nickname)
              }}
              placeholder="昵称"
              onNoResultsClick={(text) => {
                setCustomerForm({ nickname: text })
                setShowAddUserDialog(true)
              }}
            />
          </div>

          <span className="text-xs text-[#4e535a] shrink-0">需求</span>
          {/* 本次需求 */}
          <div className="w-[400px] min-w-[400px] shrink-0">
            <Textarea
              value={needs}
              onChange={(e) => setNeeds(e.target.value)}
              placeholder="本次到场的需求是..."
              className="h-8 text-xs min-h-[32px] resize-none"
              rows={1}
            />
          </div>

          {/* 新增按钮 */}
          <Button size="sm" className="h-8 text-xs px-6" onClick={handleAdd} disabled={saving}>
            {saving ? "添加中..." : "新增"}
          </Button>
          </div>
        </div>
        {loading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">加载中...</div>
        ) : filteredVisits.length === 0 ? (
          <p className="py-16 text-center text-xs text-[#8f959e]">当日暂无到场人员</p>
        ) : (
          <div className="p-2 space-y-0.5">
            {/* 表头 */}
            <div className="flex items-center px-3 h-[42px] text-[12px] font-normal text-[#8f959e] rounded-t-lg gap-3 bg-[#fafbfc]">
              <span className="w-[80px] shrink-0">昵称</span>
              <span className="flex-1 min-w-[200px]">本次需求</span>
              <span className="w-[88px] shrink-0">会员身份</span>
              <span className="w-[120px] shrink-0">参与活动</span>
              <span className="w-[72px] shrink-0">剩余次数</span>
              <span className="w-[100px] shrink-0">预计时间</span>
              <span className="w-[64px] shrink-0">是否到店</span>
              <span className="w-[72px] shrink-0 text-right">操作</span>
            </div>
            {filteredVisits.slice(0, visibleCount).map((v) => (
              <div key={v.id} className="rounded hover:bg-[#f7f8fa]">
                {/* 主行：固定列宽 */}
                <div className="flex items-center px-3 py-1.5 gap-3">
                  <span
                    className="w-[80px] shrink-0 text-[12px] text-[#2b2f36] truncate cursor-pointer hover:text-[#3370ff]"
                    onClick={() => onCustomerClick?.(v.customer_id)}
                  >{v.nickname}</span>
                  <span className="flex-1 min-w-[200px] text-[12px] text-[#8f959e] break-words">{v.needs || "-"}</span>
                  <span className="w-[88px] shrink-0 text-[12px] text-[#8f959e] truncate">{v.member_type || "-"}</span>
                  <span className="w-[120px] shrink-0 text-[12px] text-[#8f959e]"><span className="text-[#2b2f36]">{v.activity_count}</span> 次{v.welfare_count > 0 && <span className="text-[#8f959e]">（公益<span className="text-[#2b2f36]">{v.welfare_count}</span>次）</span>}</span>
                  <span className="w-[72px] shrink-0 text-[12px] text-[#8f959e]">{v.remaining_count == null ? "无卡" : v.remaining_count === -1 ? "不限" : <><span className="text-[#2b2f36]">{v.remaining_count}</span> 次</>}</span>
                  <span className="w-[100px] shrink-0 text-[12px] text-[#8f959e] whitespace-nowrap">{v.visit_time || "09:00"}</span>
                  <span className={`w-[64px] shrink-0 text-[12px] ${v.arrived ? "text-[#2b2f36]" : "text-[#8f959e]"}`}>
                    {v.arrived ? "到店" : "未到店"}
                  </span>
                  <div className="w-[72px] shrink-0 flex items-center justify-end gap-1">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => { setEditVisit(v); setEditDate(v.visit_date); setEditNeeds(v.needs) }}>
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setDeleteId(v.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            {visibleCount < filteredVisits.length && (
              <div ref={sentinelRef} className="h-4" />
            )}
          </div>
        )}
      </div>

      {/* 删除确认 */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>确定要删除这条到场记录吗？</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 修改需求弹窗 */}
      <Dialog open={!!editVisit} onOpenChange={(open) => !open && setEditVisit(null)}>
        <DialogContent className="w-[480px] max-w-[90vw] p-0 gap-0">
          <DialogHeader className="px-6 pt-3 pb-2 border-b border-[#f0f0f0]">
            <DialogTitle className="text-[14px] font-normal">修改需求</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-4">
            <div className="grid grid-cols-[70px_1fr] items-center gap-2">
              <span className="text-xs text-[#4e535a] font-light text-right tracking-widest">昵称</span>
              <Input value={editVisit?.nickname || ""} disabled className="h-8 text-xs" />
            </div>
            <div className="grid grid-cols-[70px_1fr] items-center gap-2">
              <span className="text-xs text-[#4e535a] font-light text-right tracking-widest">日期</span>
              <Input type="date" value={editDate} disabled className="h-8 text-xs" />
            </div>
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-xs text-[#4e535a] font-light text-right tracking-widest pt-2">需求</span>
              <Textarea value={editNeeds} onChange={(e) => setEditNeeds(e.target.value)} rows={2} className="resize-none text-xs" placeholder="请输入需求" />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-[#f0f0f0]">
              <Button variant="outline" size="sm" onClick={() => setEditVisit(null)}>取消</Button>
              <Button size="sm" onClick={handleUpdate} disabled={editSaving}>
                {editSaving ? "保存中..." : "保存"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 新增用户确认 */}
      <AlertDialog open={showConfirmNewUser} onOpenChange={setShowConfirmNewUser}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>该昵称为新用户，是否需要新增？</AlertDialogTitle>
            <AlertDialogDescription>未找到昵称为「{searchKeyword}」的用户</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setShowConfirmNewUser(false); setCustomerForm({ nickname: searchKeyword.trim() }); setShowAddUserDialog(true) }}>确定</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 新增用户弹窗 */}
      <Dialog open={showAddUserDialog} onOpenChange={setShowAddUserDialog}>
        <DialogContent className="w-[640px] max-w-[90vw] p-0 gap-0">
          <DialogHeader className="px-6 pt-3 pb-2 border-b border-[#f0f0f0]">
            <DialogTitle className="text-[14px] font-normal">新建用户</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-4" {...enterToNext}>
            <div className="grid grid-cols-[70px_1fr_70px_1fr] items-start gap-x-3 gap-y-3">
              <span className="text-[12px] text-[#4e535a] font-light block text-right tracking-widest pt-2.5">昵称</span>
              <div>
                <Input value={customerForm.nickname || ""} onChange={(e) => { setCustomerForm({ ...customerForm, nickname: e.target.value }); setCustomerFormError("") }} placeholder="请输入" />
                {customerFormError && customerFormError.includes("昵称") && <p className="text-[11px] text-[#f54a45] mt-1">{customerFormError}</p>}
              </div>
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">姓名</span>
              <Input value={customerForm.name || ""} onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })} placeholder="请输入" />

              <span className="text-[12px] text-[#4e535a] font-light block text-right tracking-widest pt-2.5">性别</span>
              <select value={customerForm.gender || ""} onChange={(e) => setCustomerForm({ ...customerForm, gender: e.target.value })} className="h-8 w-full rounded-md border border-[#dee0e3] bg-white pl-2 pr-7 text-[12px] text-[#2b2f36] outline-none focus:border-[#3370ff] transition-colors appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%238f959e%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:12px] bg-[right_8px_center] bg-no-repeat">
                <option value="">请选择</option>
                <option value="男">男</option>
                <option value="女">女</option>
              </select>
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">电话</span>
              <Input value={customerForm.phone || ""} onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })} placeholder="请输入" />

              <span className="text-[12px] text-[#4e535a] font-light block text-right tracking-widest pt-2.5">微信</span>
              <div>
                <Input value={customerForm.wechat || ""} onChange={(e) => { setCustomerForm({ ...customerForm, wechat: e.target.value }); setCustomerFormError("") }} placeholder="请输入" />
                {customerFormError && customerFormError.includes("微信") && <p className="text-[11px] text-[#f54a45] mt-1">{customerFormError}</p>}
              </div>
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">年龄</span>
              <Input value={customerForm.age || ""} onChange={(e) => setCustomerForm({ ...customerForm, age: e.target.value })} placeholder="请输入" />

              <span className="text-[12px] text-[#4e535a] font-light block text-right tracking-widest pt-2.5">引流人</span>
              <Input value={customerForm.referrer || ""} onChange={(e) => setCustomerForm({ ...customerForm, referrer: e.target.value })} placeholder="请搜索" />
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">流量来源</span>
              <Input value={customerForm.traffic_source || ""} onChange={(e) => setCustomerForm({ ...customerForm, traffic_source: e.target.value })} placeholder="请输入" />
            </div>

            <div className="border-t border-[#f0f0f0]" />

            <div className="space-y-3">
              <div className="grid grid-cols-[70px_1fr] items-start gap-x-3 gap-y-3">
                <span className="text-[12px] text-[#4e535a] font-light block text-right tracking-widest pt-2.5">工作情况</span>
                <div className="flex gap-2">
                  <SelectDropdown
                    value={customerForm.work_status || ""}
                    options={[{ value: "在职", label: "在职" }, { value: "离职", label: "离职" }, { value: "自由职业", label: "自由职业" }]}
                    placeholder="是否在职"
                    onChange={(v) => setCustomerForm({ ...customerForm, work_status: v })}
                    className="w-[100px]"
                  />
                  <Input value={customerForm.work_description || ""} onChange={(e) => setCustomerForm({ ...customerForm, work_description: e.target.value })} placeholder="描述工作内容..." className="flex-1" />
                </div>
              </div>
              <div className="grid grid-cols-[70px_1fr] items-start gap-x-3 gap-y-3">
                <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">创伤经历</span>
                <Textarea value={customerForm.basic_info || ""} onChange={(e) => setCustomerForm({ ...customerForm, basic_info: e.target.value })} rows={1} className="resize-none min-h-0" placeholder="请输入" />
              </div>
              <div className="grid grid-cols-[70px_1fr] items-start gap-x-3 gap-y-3">
                <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">当下卡点</span>
                <Textarea value={customerForm.assessment || ""} onChange={(e) => setCustomerForm({ ...customerForm, assessment: e.target.value })} rows={1} className="resize-none min-h-0" placeholder="请输入" />
              </div>
              <div className="grid grid-cols-[70px_1fr] items-start gap-x-3 gap-y-3">
                <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">到访目的</span>
                <Textarea value={customerForm.tags || ""} onChange={(e) => setCustomerForm({ ...customerForm, tags: e.target.value })} rows={1} className="resize-none min-h-0" placeholder="请输入" />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#f0f0f0]">
              <Button variant="outline" size="sm" onClick={() => setShowAddUserDialog(false)}>取消</Button>
              <Button size="sm" onClick={handleCreateCustomer} disabled={creatingCustomer || !customerForm.nickname?.trim()}>
                {creatingCustomer ? "创建中..." : "创建"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
