import { useState, useEffect, useMemo, useRef } from "react"
import { useEnterToNext } from "@/hooks/use-enter-to-next"
import { ChevronLeft, ChevronRight, Edit, Trash2, Download } from "lucide-react"
import * as XLSX from "xlsx-js-style"
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
import { visitApi, customerApi, accountApi, type VisitRecord, type CustomerLight, type CustomerCreate } from "@/lib/api"
import { CustomerSearchInput } from "@/components/customer-search-input"
import { SelectDropdown } from "@/components/select-dropdown"
import { useCustomerPermissions } from "@/hooks/use-customer-permissions"
import { BatchInputTable } from "./batch-input-table"

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
  onRequireSpaces?: () => void
  groups?: { name: string; leader_id: string; deputy_id: string; member_ids: string[] }[]
}

export default function DetailView({ externalDate, onExternalDateChange, hideDateBar, onCustomerClick, onDataLoaded, spaceId, onRequireSpaces, groups = [] }: DetailViewProps = {}) {
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
  const [referrerHandler, setReferrerHandler] = useState(() => {
    try {
      const cu = JSON.parse(localStorage.getItem("currentUser") || "{}")
      return cu.owner || cu.nickname || ""
    } catch { return "" }
  })
  const [selectedReferrerHandler, setSelectedReferrerHandler] = useState<CustomerLight | null>(null)
  const [saving, setSaving] = useState(false)
  const [tableSavedCount, setTableSavedCount] = useState(0)
  const [savingCount, setSavingCount] = useState(0)
  const [errorMessage, setErrorMessage] = useState("")
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const [editVisit, setEditVisit] = useState<VisitRecord | null>(null)
  const [editDate, setEditDate] = useState("")
  const [editNeeds, setEditNeeds] = useState("")
  const [editSaving, setEditSaving] = useState(false)
  const [showAddUserDialog, setShowAddUserDialog] = useState(false)
  const [showConfirmNewUser, setShowConfirmNewUser] = useState(false)
  const [customerForm, setCustomerForm] = useState<Partial<CustomerCreate>>({})
  const [ageRange, setAgeRange] = useState("")
  const [creatingCustomer, setCreatingCustomer] = useState(false)
  const [customerFormError, setCustomerFormError] = useState("")

  // 如果 localStorage 中没有 owner，从账号列表获取当前用户的归属人
  useEffect(() => {
    if (!referrerHandler) {
      const cu = JSON.parse(localStorage.getItem("currentUser") || "{}")
      if (cu.id) {
        accountApi.list().then(accounts => {
          const me = accounts.find((a: any) => a.id === cu.id)
          if (me?.owner) setReferrerHandler(me.owner)
        }).catch(() => {})
      }
    }
  }, [])

  const { permissions: cp, ready: permReady } = useCustomerPermissions("class_records")
  const [customerListReady, setCustomerListReady] = useState(false)

  const visibleIds = useMemo(() => new Set(customerList.map(c => c.id)), [customerList])
  const _addedCustomerIds = useMemo(() => visits.map(v => v.customer_id), [visits])
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
        if (cu.role !== "超级管理员" && cp.length > 0) {
          filtered = data.filter(c => !c.member_type || cp.includes(c.member_type))
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
    if (onRequireSpaces) {
      onRequireSpaces()
      return
    }
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
        referrer_handler: selectedReferrerHandler?.nickname || referrerHandler || "",
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
      setErrorMessage(e instanceof Error ? e.message : "添加失败")
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
      const data = { ...customerForm }
      if (ageRange) {
        data.age = data.age ? `${data.age} (${ageRange})` : ageRange
      }
      // 新增客户时自动设置当前空间
      try { data.space_id = localStorage.getItem("selected-space-id") || "" } catch {}
      const created = await customerApi.create(data)
      setShowAddUserDialog(false)
      setSelectedCustomer(created)
      setSearchKeyword(created.nickname)
      setCustomerList(prev => [...prev, created])
      customerApi.clearLightCache()
    } catch (e) {
      setCustomerFormError(e instanceof Error ? e.message : "创建失败")
    } finally {
      setCreatingCustomer(false)
    }
  }

  const handleExport = () => {
    const customerMap = new Map(customerList.map(c => [c.id, c]))
    // 构建角色映射
    const roleMap = new Map<string, string>()       // id → "组长"/"副组长"/""
    groups.forEach(g => {
      if (g.leader_id) roleMap.set(g.leader_id, "组长")
      if (g.deputy_id) roleMap.set(g.deputy_id, "副组长")
    })
    // 未分组的用 is_leader 字段兜底
    const rows = filteredVisits.map(v => {
      const role = roleMap.get(v.customer_id) || (v.is_leader ? "组长" : "")
      return {
        "引流人": customerMap.get(v.customer_id)?.referrer || "-",
        "客户昵称": v.nickname,
        "预计时间": v.visit_time || "",
        "参与次数": v.visit_count || 0,
        "会员身份": v.member_type || "",
        "当日需求": v.needs || "",
        "组长情况": role || "-",
        "组长获得的信息": "",
        "邀约人": v.referrer_handler || "",
      }
    })
    if (!rows.length) return
    const ws = XLSX.utils.json_to_sheet(rows, { cellStyles: true })
    ws['!cols'] = [
      { wch: 10 }, // 引流人
      { wch: 12 }, // 客户昵称
      { wch: 10 }, // 预计时间
      { wch: 10 }, // 参与次数
      { wch: 12 }, // 会员身份
      { wch: 40 }, // 当日需求
      { wch: 10 }, // 组长情况
      { wch: 30 }, // 组长获得的信息
      { wch: 10 }, // 邀约人
    ]
    ws['!sheetPr'] = { showGridLines: false }
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
    // 按内容自动计算行高
    const colWidths = ws['!cols']?.map(c => c.wch || 10) || []
    ws['!rows'] = Array.from({ length: range.e.r + 1 }, (_, row) => {
      let maxLines = 1
      for (let col = range.s.c; col <= range.e.c; col++) {
        const cellRef = XLSX.utils.encode_cell({ r: row, c: col })
        const cell = ws[cellRef]
        if (!cell?.v) continue
        const text = String(cell.v)
        const wch = colWidths[col] || 10
        // 估算每行能放的字符数（中文约2字符宽度）
        let lineLen = 0, lines = 1
        for (const ch of text) {
          lineLen += ch.charCodeAt(0) > 127 ? 2 : 1
          if (lineLen > wch) { lines++; lineLen = ch.charCodeAt(0) > 127 ? 2 : 1 }
        }
        if (lines > maxLines) maxLines = lines
      }
      return { hpt: Math.max(30, maxLines * 18) }
    })
    const thinBorder = { style: "thin", color: { rgb: "C0C4CC" } }
    const baseStyle = {
      alignment: { vertical: "center", wrapText: true },
      border: { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder },
    }
    for (let row = 0; row <= range.e.r; row++) {
      for (let col = range.s.c; col <= range.e.c; col++) {
        const cellRef = XLSX.utils.encode_cell({ r: row, c: col })
        if (ws[cellRef]) ws[cellRef].s = { ...ws[cellRef].s, ...baseStyle }
      }
    }
    // 参与次数列（第3列）内容左对齐
    const countColStyle = { alignment: { vertical: "center", horizontal: "left", wrapText: true } }
    for (let row = 1; row <= range.e.r; row++) {
      const cellRef = XLSX.utils.encode_cell({ r: row, c: 3 })
      if (ws[cellRef]) ws[cellRef].s = { ...ws[cellRef].s, ...countColStyle }
    }
    const headerStyle = { font: { bold: true }, fill: { fgColor: { rgb: "D0D3D6" } } }
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellRef = XLSX.utils.encode_cell({ r: 0, c: col })
      if (ws[cellRef]) ws[cellRef].s = { ...ws[cellRef].s, ...headerStyle }
    }
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "邀约到场")
    XLSX.writeFile(wb, `邀约到场_${selectedDate}.xlsx`)
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
      <div className="bg-white rounded-lg overflow-x-auto">
        <div className="px-4 py-3 flex items-center justify-between overflow-visible">
          <div className="flex items-center shrink-0">
            <span className="text-xs font-medium text-[#2b2f36]">预计到场</span>
            <span className="text-xs text-[#2b2f36] ml-2">{filteredVisits.length} 人</span>
            {savingCount > 0 ? (
              <span className="text-[11px] text-[#3370ff] ml-3">保存中...</span>
            ) : tableSavedCount > 0 ? (
              <span className="text-[11px] text-[#8f959e] ml-3">已保存在云端</span>
            ) : null}
          </div>
          <Button size="sm" variant="outline" className="h-6 text-xs" onClick={handleExport}>
            <Download className="mr-1 h-3 w-3" /> 导出
          </Button>
        </div>
        <BatchInputTable date={selectedDate} customers={customerList} spaceId={spaceId} onSaved={() => {
          refreshCounts()
        }} onSavedCountChange={setTableSavedCount} onSavingCountChange={setSavingCount} onCustomerClick={onCustomerClick} onCreateCustomer={(nickname) => { setCustomerForm({ nickname }); setAgeRange(""); setShowAddUserDialog(true) }} />
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

      {/* 错误提示 */}
      <AlertDialog open={!!errorMessage} onOpenChange={(open) => !open && setErrorMessage("")}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>提示</AlertDialogTitle>
            <AlertDialogDescription>{errorMessage}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setErrorMessage("")}>确定</AlertDialogAction>
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
            <AlertDialogAction onClick={() => { setShowConfirmNewUser(false); setCustomerForm({ nickname: searchKeyword.trim() }); setAgeRange(""); setShowAddUserDialog(true) }}>确定</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 新增用户弹窗 */}
      <Dialog open={showAddUserDialog} onOpenChange={setShowAddUserDialog}>
        <DialogContent className="w-[640px] max-w-[90vw] p-0 gap-0">
          <div className="px-6 pt-3 pb-2 border-b border-[#f0f0f0]">
            <h3 className="text-[14px] font-normal">新建用户</h3>
          </div>
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
              <SelectDropdown
                value={customerForm.gender || ""}
                options={[{value: "男", label: "男"}, {value: "女", label: "女"}]}
                placeholder="请选择"
                onChange={(v) => setCustomerForm({ ...customerForm, gender: v })}
              />
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">电话</span>
              <Input value={customerForm.phone || ""} onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })} placeholder="请输入" />

              <span className="text-[12px] text-[#4e535a] font-light block text-right tracking-widest pt-2.5">微信</span>
              <div>
                <Input value={customerForm.wechat || ""} onChange={(e) => { setCustomerForm({ ...customerForm, wechat: e.target.value }); setCustomerFormError("") }} placeholder="请输入" />
                {customerFormError && customerFormError.includes("微信") && <p className="text-[11px] text-[#f54a45] mt-1">{customerFormError}</p>}
              </div>
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">年龄</span>
              <div className="grid grid-cols-2 gap-2">
                <Input value={customerForm.age || ""} onChange={(e) => { const v = e.target.value; const n = parseInt(v); let range = ""; if (n >= 60) range = "60+"; else if (n >= 51) range = "51~60"; else if (n >= 41) range = "41~50"; else if (n >= 31) range = "31~40"; else if (n >= 18) range = "18~30"; setCustomerForm({ ...customerForm, age: v }); setAgeRange(range); }} placeholder="具体年龄" />
                <SelectDropdown
                  value={ageRange}
                  options={["18~30", "31~40", "41~50", "51~60", "60+"].map(v => ({value: v, label: v}))}
                  placeholder="年龄段"
                  onChange={(v) => setAgeRange(v)}
                />
              </div>

              <span className="text-[12px] text-[#4e535a] font-light block text-right tracking-widest pt-2.5">引流人</span>
              <CustomerSearchInput
                customers={customerList as any[]}
                value={customerForm.referrer || ""}
                onChange={(v) => setCustomerForm({ ...customerForm, referrer: typeof v === "string" ? v : v[0] || "" })}
                placeholder="请搜索"
                filterSelected={false}
              />
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">承接人</span>
              <CustomerSearchInput
                customers={customerList as any[]}
                value={customerForm.referrer_handler || ""}
                onChange={(v) => setCustomerForm({ ...customerForm, referrer_handler: typeof v === "string" ? v : v[0] || "" })}
                placeholder="请搜索"
                filterSelected={false}
              />
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">流量来源</span>
              <div className="flex items-center gap-2">
                <SelectDropdown
                  className={["小红书", "抖音", "公众号", "视频号"].includes(customerForm.traffic_source || "") ? "w-[calc(50%-3px)] min-w-0" : ["好友推荐", "朋友圈"].includes(customerForm.traffic_source || "") ? "flex-1 min-w-0" : "w-full"}
                  value={customerForm.traffic_source || ""}
                  options={["小红书", "抖音", "公众号", "视频号", "朋友圈", "美团", "大众点评", "好友推荐"].map(v => ({value: v, label: v}))}
                  placeholder="请选择"
                  onChange={(v) => setCustomerForm({ ...customerForm, traffic_source: v, traffic_source_detail: "" })}
                />
                {["小红书", "抖音", "公众号", "视频号"].includes(customerForm.traffic_source || "") && (
                  <Input value={customerForm.traffic_source_detail || ""} onChange={(e) => setCustomerForm({ ...customerForm, traffic_source_detail: e.target.value })} placeholder="内容链接" className="h-8 flex-1 text-[12px]" />
                )}
                {(customerForm.traffic_source || "") === "好友推荐" && (
                  <div className="flex-1 min-w-0">
                    <CustomerSearchInput
                      customers={customerList as any[]}
                      value={customerForm.traffic_source_detail || ""}
                      onChange={(v) => setCustomerForm({ ...customerForm, traffic_source_detail: typeof v === "string" ? v : v[0] || "" })}
                      placeholder="好友昵称"
                      filterSelected={false}
                    />
                  </div>
                )}
                {(customerForm.traffic_source || "") === "朋友圈" && (
                  <div className="flex-1 min-w-0">
                    <CustomerSearchInput
                      customers={customerList as any[]}
                      value={customerForm.traffic_source_detail || ""}
                      onChange={(v) => setCustomerForm({ ...customerForm, traffic_source_detail: typeof v === "string" ? v : v[0] || "" })}
                      placeholder="所属人"
                      filterSelected={false}
                    />
                  </div>
                )}
              </div>
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
