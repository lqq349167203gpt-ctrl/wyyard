import { useState, useEffect, useMemo, useRef, useCallback } from "react"
import { useEnterToNext } from "@/hooks/use-enter-to-next"
import { ChevronLeft, ChevronRight, ChevronDown, Edit, Trash2, Download, Clock, Undo2, Redo2 } from "lucide-react"
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
import { visitApi, customerApi, accountApi, visitHistoryApi, type VisitRecord, type CustomerLight, type CustomerCreate, type VisitHistoryRecord } from "@/lib/api"
import { CustomerSearchInput } from "@/components/customer-search-input"
import { SelectDropdown } from "@/components/select-dropdown"
import { useCustomerPermissions } from "@/hooks/use-customer-permissions"
import { BatchInputTable, type VisitHistoryEntry, type VisitChangedCell } from "./batch-input-table"

// ===== 三级手风琴组件（天→小时→条目）=====
type VisitHourGroup = { hour: string; entries: VisitHistoryEntry[] }
type VisitDayGroup = { date: string; label: string; hours: VisitHourGroup[] }

function VisitHistoryDayGroup({ day, defaultExpanded, previewEntry, onSelectEntry }: {
  day: VisitDayGroup
  defaultExpanded: boolean
  previewEntry: VisitHistoryEntry | null
  onSelectEntry: (entry: VisitHistoryEntry) => void
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [expandedHours, setExpandedHours] = useState<Set<string>>(() => {
    if (day.hours.length > 0) return new Set([day.hours[day.hours.length - 1].hour])
    return new Set()
  })

  const toggleHour = (hour: string) => {
    setExpandedHours(prev => {
      const next = new Set(prev)
      if (next.has(hour)) next.delete(hour)
      else next.add(hour)
      return next
    })
  }

  return (
    <div className="mb-1">
      <button
        className="w-full flex items-center gap-2 px-2 py-2 rounded hover:bg-[#f7f8fa] text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <ChevronDown className={`h-3.5 w-3.5 text-[#8f959e] shrink-0 transition-transform ${expanded ? "" : "-rotate-90"}`} />
        <span className="text-[13px] font-medium text-[#2b2f36]">{day.label}</span>
        <span className="text-[11px] text-[#b0b5bb] ml-auto">{day.hours.reduce((s, h) => s + h.entries.length, 0)}条</span>
      </button>
      {expanded && (
        <div className="ml-2">
          {day.hours.map(hour => (
            <div key={hour.hour}>
              <button
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[#f7f8fa] text-left"
                onClick={() => toggleHour(hour.hour)}
              >
                <ChevronDown className={`h-3 w-3 text-[#b0b5bb] shrink-0 transition-transform ${expandedHours.has(hour.hour) ? "" : "-rotate-90"}`} />
                <span className="text-[12px] text-[#8f959e]">{hour.hour}:00</span>
                <span className="text-[11px] text-[#b0b5bb] ml-auto">{hour.entries.length}条</span>
              </button>
              {expandedHours.has(hour.hour) && (
                <div className="ml-3">
                  {hour.entries.map((entry, ei) => {
                    const isFirstOfHour = ei === 0
                    const t = new Date(entry.timestamp)
                    const time = `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`
                    const isSelected = previewEntry === entry
                    return (
                      <button
                        key={entry.id || entry.timestamp}
                        className={`w-full flex items-center gap-2 px-2 py-2 rounded text-left transition-colors ${
                          isSelected ? "bg-[#f0f5ff] border border-[#3370ff]" : "hover:bg-[#f7f8fa]"
                        }`}
                        onClick={() => onSelectEntry(entry)}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-[#b0b5bb]">{time}</span>
                            {isFirstOfHour && hour.entries.length > 1 && (
                              <span className="text-[10px] text-[#3370ff] bg-[#f0f5ff] px-1 rounded">最近更新</span>
                            )}
                            <span className="text-[12px] text-[#2b2f36] truncate">{entry.action}</span>
                          </div>
                          <div className="text-[11px] text-[#8f959e] mt-0.5">{entry.userName}</div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

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
  onCustomerEdit?: (customerId: string) => void
  onActivityClick?: (customerId: string) => void
  onDataLoaded?: (visits: VisitRecord[]) => void
  spaceId?: string
  onRequireSpaces?: () => void
  groups?: { name: string; leader_id: string; deputy_id: string; member_ids: string[] }[]
}

export default function DetailView({ externalDate, onExternalDateChange, hideDateBar, onCustomerClick, onCustomerEdit, onActivityClick, onDataLoaded, spaceId, onRequireSpaces, groups = [] }: DetailViewProps = {}) {
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
  const [tableRefreshKey, setTableRefreshKey] = useState(0)

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

  // 撤回/重做/历史记录
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const undoRef = useRef<() => void>(() => {})
  const redoRef = useRef<() => void>(() => {})
  const restoreRef = useRef<((entry: VisitHistoryEntry) => Promise<void>) | null>(null)
  const captureRef = useRef<(() => VisitHistoryEntry) | null>(null)
  const [historyPanelOpen, setHistoryPanelOpen] = useState(false)
  const [historyEntries, setHistoryEntries] = useState<VisitHistoryEntry[]>([])
  const [cloudHistory, setCloudHistory] = useState<VisitHistoryEntry[]>([])
  const [previewEntry, setPreviewEntry] = useState<VisitHistoryEntry | null>(null)
  const [previewRows, setPreviewRows] = useState<any[] | undefined>(undefined)
  const [previewChangedKeys, setPreviewChangedKeys] = useState<number[]>([])

  const handleUndoRedoChange = useCallback((cu: boolean, cr: boolean, u: () => void, r: () => void, history: VisitHistoryEntry[]) => {
    setCanUndo(cu); setCanRedo(cr)
    undoRef.current = u; redoRef.current = r
    setHistoryEntries(history)
  }, [])

  const undo = useCallback(() => { undoRef.current(); setPreviewEntry(null); setPreviewRows(undefined); setPreviewChangedKeys([]) }, [])
  const redo = useCallback(() => { redoRef.current(); setPreviewEntry(null); setPreviewRows(undefined); setPreviewChangedKeys([]) }, [])

  // 快捷键
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) { e.preventDefault(); if (canUndo) undo() }
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && e.shiftKey) { e.preventDefault(); if (canRedo) redo() }
      if ((e.ctrlKey || e.metaKey) && e.key === "y") { e.preventDefault(); if (canRedo) redo() }
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [canUndo, canRedo, undo, redo])

  // 预览历史版本
  const handleSelectHistoryEntry = useCallback((entry: VisitHistoryEntry) => {
    setPreviewEntry(entry)
    setPreviewRows(entry.rows.map(r => ({ ...r })))
    setPreviewChangedKeys(entry.changedKeys || [])
  }, [])

  const cloudSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestEntryRef = useRef<VisitHistoryEntry | null>(null)

  const flushCloudSave = useCallback(() => {
    const entry = latestEntryRef.current
    if (!entry) return
    latestEntryRef.current = null
    visitHistoryApi.create({
      date: selectedDate,
      space_id: spaceId || "",
      action: entry.action,
      user_name: entry.userName,
      rows_snapshot: entry.rows,
      changed_keys: entry.changedKeys || [],
      changed_cells: (entry.changedCells || []).map(cc => ({ rowKey: cc.rowKey, fields: cc.fields })),
    }).catch(() => {})
  }, [selectedDate, spaceId])

  const handleHistoryPushed = useCallback((entry: VisitHistoryEntry) => {
    setHistoryEntries(prev => [...prev, entry])
    latestEntryRef.current = entry
    if (cloudSaveTimerRef.current) clearTimeout(cloudSaveTimerRef.current)
    cloudSaveTimerRef.current = setTimeout(flushCloudSave, 500)
  }, [flushCloudSave])

  // 组件卸载或日期/空间切换时，刷入待保存的云端记录
  useEffect(() => {
    return () => {
      if (cloudSaveTimerRef.current) {
        clearTimeout(cloudSaveTimerRef.current)
        flushCloudSave()
      }
    }
  }, [flushCloudSave])

  // 从云端加载历史记录
  useEffect(() => {
    visitHistoryApi.list(selectedDate, spaceId || undefined)
      .then(records => {
        const entries: VisitHistoryEntry[] = records.map(r => ({
          id: r.id,
          timestamp: new Date(r.created_at).getTime(),
          action: r.action,
          userName: r.user_name,
          rows: r.rows_snapshot,
          changedKeys: r.changed_keys,
          changedCells: r.changed_cells,
        }))
        setCloudHistory(entries)
      })
      .catch(() => {})
  }, [selectedDate, spaceId])

  // 合并本地 + 云端历史（按行数据内容去重）
  const mergedHistory = useMemo(() => {
    const all = [...historyEntries, ...cloudHistory]
    all.sort((a, b) => b.timestamp - a.timestamp)
    const result: VisitHistoryEntry[] = []
    let prevRowsKey = ""
    for (const entry of all) {
      const rowsKey = JSON.stringify(entry.rows)
      if (rowsKey === prevRowsKey) {
        const last = result[result.length - 1]
        if (last.action === "当前状态" && entry.action !== "当前状态") {
          result[result.length - 1] = entry
        }
        continue
      }
      prevRowsKey = rowsKey
      result.push(entry)
    }
    return result.filter((e, i) => e.action !== "当前状态" || i === 0)
  }, [historyEntries, cloudHistory])

  // 动态计算当前条目与上一条的差异
  const computedChangedCells = useMemo(() => {
    if (!previewEntry) return undefined
    const idx = mergedHistory.indexOf(previewEntry)
    if (idx < 0 || idx >= mergedHistory.length - 1) return previewEntry.changedCells
    const prevEntry = mergedHistory[idx + 1]
    const diffCells: { rowKey: number; fields: string[] }[] = []
    const IGNORED_KEYS = new Set(["key"])
    const prevMap = new Map<string, any>()
    for (const r of prevEntry.rows) {
      const id = r.customer_id || `__key_${r.key}`
      prevMap.set(id, r)
    }
    const matchedPrevIds = new Set<string>()
    for (const curRow of previewEntry.rows) {
      const id = curRow.customer_id || `__key_${curRow.key}`
      const prevRow = prevMap.get(id)
      matchedPrevIds.add(id)
      if (!prevRow) {
        diffCells.push({ rowKey: curRow.key, fields: Object.keys(curRow).filter(k => !IGNORED_KEYS.has(k)) })
        continue
      }
      const changedFields: string[] = []
      const cur = curRow as any
      const prev = prevRow as any
      for (const k of Object.keys(cur)) {
        if (IGNORED_KEYS.has(k)) continue
        if (JSON.stringify(cur[k]) !== JSON.stringify(prev[k])) {
          changedFields.push(k)
        }
      }
      if (changedFields.length > 0) {
        diffCells.push({ rowKey: curRow.key, fields: changedFields })
      }
    }
    for (const [id, prevRow] of prevMap) {
      if (!matchedPrevIds.has(id)) {
        diffCells.push({ rowKey: prevRow.key, fields: ["__deleted"] })
      }
    }
    return diffCells
  }, [previewEntry, mergedHistory])

  // 组件挂载时刷新表格数据
  useEffect(() => {
    setTableRefreshKey(k => k + 1)
  }, [])

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
    // 重新加载当日数据，确保导出时使用最新数据
    if (customerListReady) {
      visitApi.list(selectedDate, undefined, spaceId)
        .then(setVisits)
        .catch(() => {})
    }
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
    // 检查是否已存在该客户的到场记录
    if (visits.some(v => v.customer_id === selectedCustomer.id)) {
      setErrorMessage("该客户今日已到场")
      return
    }
    setSaving(true)
    try {
      await visitApi.create({
        visit_date: selectedDate,
        visit_time: visitTime,
        customer_id: selectedCustomer.id,
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

  const handleExport = async () => {
    // 直接从 API 读取最新数据，不依赖状态，确保导出内容是最新的
    const freshVisits = await visitApi.list(selectedDate, undefined, spaceId).catch(() => filteredVisits)
    const visibleIdSet = new Set(customerList.map(c => c.id))
    const latestVisits = freshVisits.filter(v => visibleIdSet.has(v.customer_id))

    const customerMap = new Map(customerList.map(c => [c.id, c]))
    // 构建角色映射
    const roleMap = new Map<string, string>()       // id → "组长"/"副组长"/""
    groups.forEach(g => {
      if (g.leader_id) roleMap.set(g.leader_id, "组长")
      if (g.deputy_id) roleMap.set(g.deputy_id, "副组长")
    })
    // 按后端 sort_order 排序（latestVisits 已是后端返回顺序）
    const rows = latestVisits.map(v => {
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
    <div className="w-full space-y-3 transition-[padding] duration-200" style={{ paddingRight: historyPanelOpen ? 320 : 0 }}>
      {/* 日期条 */}
      {!hideDateBar && (
      <div className="flex items-center gap-1 px-3 py-2">
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
            <button className="h-[22px] text-[11px] text-[#8f959e] hover:text-[#4e535a] ml-[18px] flex items-center gap-1 border-[0.5px] border-[#d0d3d6] rounded px-2" onClick={handleExport}>
              <Download className="h-3 w-3" /> 导出
            </button>
          </div>
          <div className="flex items-center gap-1">
            {/* 历史记录/撤回/重做按钮 */}
            <button
              onClick={() => {
                if (previewEntry) { setPreviewEntry(null); setPreviewRows(undefined); setPreviewChangedKeys([]); setHistoryPanelOpen(false) }
                else { captureRef.current?.(); setHistoryPanelOpen(!historyPanelOpen) }
              }}
              className={`h-6 w-6 flex items-center justify-center rounded hover:bg-[#f0f0f0] ${historyPanelOpen ? "bg-[#f0f0f0]" : ""}`}
              title="历史记录"
            >
              <Clock className="h-3.5 w-3.5 text-[#4e535a]" />
            </button>
            <button
              onClick={undo}
              disabled={!canUndo || !!previewEntry}
              className="h-6 w-6 flex items-center justify-center rounded hover:bg-[#f0f0f0] disabled:opacity-30 disabled:cursor-not-allowed"
              title="撤回 (Ctrl+Z)"
            >
              <Undo2 className="h-3.5 w-3.5 text-[#4e535a]" />
            </button>
            <button
              onClick={redo}
              disabled={!canRedo || !!previewEntry}
              className="h-6 w-6 flex items-center justify-center rounded hover:bg-[#f0f0f0] disabled:opacity-30 disabled:cursor-not-allowed"
              title="重做 (Ctrl+Shift+Z)"
            >
              <Redo2 className="h-3.5 w-3.5 text-[#4e535a]" />
            </button>
          </div>
        </div>
        <BatchInputTable
          date={selectedDate}
          customers={customerList}
          spaceId={spaceId}
          refreshKey={tableRefreshKey}
          onSaved={() => refreshCounts()}
          onSavedCountChange={setTableSavedCount}
          onSavingCountChange={setSavingCount}
          onCustomerClick={onCustomerClick}
          onCustomerEdit={onCustomerEdit}
          onActivityClick={onActivityClick}
          onCreateCustomer={(nickname) => { setCustomerForm({ nickname }); setAgeRange(""); setShowAddUserDialog(true) }}
          onUndoRedoChange={handleUndoRedoChange}
          onRestoreRef={(fn) => { restoreRef.current = fn }}
          onCaptureRef={(fn) => { captureRef.current = fn }}
          onHistoryPushed={handleHistoryPushed}
          previewRows={previewRows}
          previewChangedKeys={previewChangedKeys}
          previewChangedCells={computedChangedCells}
          locked={!!previewEntry}
          onClosePreview={() => { setPreviewEntry(null); setPreviewRows(undefined); setPreviewChangedKeys([]); setHistoryPanelOpen(false) }}
        />
      </div>

      {/* 历史记录面板 */}
      {historyPanelOpen && (
        <div className="fixed top-0 right-0 h-screen w-80 bg-white border-l border-[#e8e8e8] shadow-lg z-50 flex flex-col">
          <div className="px-4 py-3 border-b border-[#f0f1f2] flex items-center justify-between shrink-0">
            <span className="text-[13px] font-medium text-[#2b2f36]">历史记录</span>
            <button className="h-6 w-6 flex items-center justify-center rounded hover:bg-[#f0f0f0]" onClick={() => { setHistoryPanelOpen(false); setPreviewEntry(null); setPreviewRows(undefined); setPreviewChangedKeys([]) }}>
              <span className="text-[#8f959e] text-[16px]">×</span>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {mergedHistory.length === 0 ? (
              <div className="text-[12px] text-[#8f959e] text-center py-8">暂无历史记录</div>
            ) : (
              (() => {
                const todayStr = new Date().toISOString().split("T")[0]
                const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split("T")[0]
                const dayMap = new Map<string, VisitDayGroup>()
                for (const entry of mergedHistory) {
                  const d = new Date(entry.timestamp)
                  const dateKey = d.toISOString().split("T")[0]
                  const hourKey = String(d.getHours()).padStart(2, "0")
                  if (!dayMap.has(dateKey)) {
                    const label = dateKey === todayStr ? "今天" : dateKey === yesterdayStr ? "昨天" : `${parseInt(dateKey.split("-")[1])}月${parseInt(dateKey.split("-")[2])}日`
                    dayMap.set(dateKey, { date: dateKey, label, hours: [] })
                  }
                  const dayGroup = dayMap.get(dateKey)!
                  let hourGroup = dayGroup.hours.find(h => h.hour === hourKey)
                  if (!hourGroup) {
                    hourGroup = { hour: hourKey, entries: [] }
                    dayGroup.hours.push(hourGroup)
                  }
                  hourGroup.entries.push(entry)
                }
                const days = Array.from(dayMap.values())
                return days.map((day, di) => (
                  <VisitHistoryDayGroup
                    key={day.date}
                    day={day}
                    defaultExpanded={di === 0}
                    previewEntry={previewEntry}
                    onSelectEntry={handleSelectHistoryEntry}
                  />
                ))
              })()
            )}
          </div>
          {previewEntry && (
            <div className="border-t border-[#f0f1f2] p-3 shrink-0 flex gap-2">
              <Button size="sm" variant="outline" className="flex-1 h-8 text-[12px]" onClick={() => { setPreviewEntry(null); setPreviewRows(undefined); setPreviewChangedKeys([]); setHistoryPanelOpen(false) }}>返回编辑</Button>
              <Button size="sm" className="flex-1 h-8 text-[12px]" onClick={async () => { await restoreRef.current?.(previewEntry); setPreviewEntry(null); setPreviewRows(undefined); setPreviewChangedKeys([]); setHistoryPanelOpen(false) }}>恢复此版本</Button>
            </div>
          )}
        </div>
      )}

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
              <Input rounded="[2px]" value={editVisit?.nickname || ""} disabled className="h-8 text-xs" />
            </div>
            <div className="grid grid-cols-[70px_1fr] items-center gap-2">
              <span className="text-xs text-[#4e535a] font-light text-right tracking-widest">日期</span>
              <Input rounded="[2px]" type="date" value={editDate} disabled className="h-8 text-xs" />
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
                <Input rounded="[2px]" value={customerForm.nickname || ""} onChange={(e) => { setCustomerForm({ ...customerForm, nickname: e.target.value }); setCustomerFormError("") }} placeholder="请输入" />
                {customerFormError && customerFormError.includes("昵称") && <p className="text-[11px] text-[#f54a45] mt-1">{customerFormError}</p>}
              </div>
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">姓名</span>
              <Input rounded="[2px]" value={customerForm.name || ""} onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })} placeholder="请输入" />

              <span className="text-[12px] text-[#4e535a] font-light block text-right tracking-widest pt-2.5">性别</span>
              <SelectDropdown rounded="[2px]"
                value={customerForm.gender || ""}
                options={[{value: "男", label: "男"}, {value: "女", label: "女"}]}
                placeholder="请选择"
                onChange={(v) => setCustomerForm({ ...customerForm, gender: v })}
              />
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">电话</span>
              <Input rounded="[2px]" value={customerForm.phone || ""} onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })} placeholder="请输入" />

              <span className="text-[12px] text-[#4e535a] font-light block text-right tracking-widest pt-2.5">微信</span>
              <div>
                <Input rounded="[2px]" value={customerForm.wechat || ""} onChange={(e) => { setCustomerForm({ ...customerForm, wechat: e.target.value }); setCustomerFormError("") }} placeholder="请输入" />
                {customerFormError && customerFormError.includes("微信") && <p className="text-[11px] text-[#f54a45] mt-1">{customerFormError}</p>}
              </div>
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">年龄</span>
              <div className="grid grid-cols-2 gap-2">
                <Input rounded="[2px]" value={customerForm.age || ""} onChange={(e) => { const v = e.target.value; const n = parseInt(v); let range = ""; if (n >= 60) range = "60+"; else if (n >= 51) range = "51~60"; else if (n >= 41) range = "41~50"; else if (n >= 31) range = "31~40"; else if (n >= 18) range = "18~30"; setCustomerForm({ ...customerForm, age: v }); setAgeRange(range); }} placeholder="具体年龄" />
                <SelectDropdown rounded="[2px]"
                  value={ageRange}
                  options={["18~30", "31~40", "41~50", "51~60", "60+"].map(v => ({value: v, label: v}))}
                  placeholder="年龄段"
                  onChange={(v) => setAgeRange(v)}
                />
              </div>

              <span className="text-[12px] text-[#4e535a] font-light block text-right tracking-widest pt-2.5">引流人</span>
              <CustomerSearchInput rounded="2px"
                customers={customerList as any[]}
                value={customerForm.referrer || ""}
                onChange={(v) => setCustomerForm({ ...customerForm, referrer: typeof v === "string" ? v : v[0] || "" })}
                placeholder="请搜索"
                filterSelected={false}
              />
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">承接人</span>
              <CustomerSearchInput rounded="2px"
                customers={customerList as any[]}
                value={customerForm.referrer_handler || ""}
                onChange={(v) => setCustomerForm({ ...customerForm, referrer_handler: typeof v === "string" ? v : v[0] || "" })}
                placeholder="请搜索"
                filterSelected={false}
              />
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">流量来源</span>
              <div className="flex items-center gap-2">
                <SelectDropdown rounded="[2px]"
                  className={["小红书", "抖音", "公众号", "视频号"].includes(customerForm.traffic_source || "") ? "w-[calc(50%-3px)] min-w-0" : ["好友推荐", "朋友圈"].includes(customerForm.traffic_source || "") ? "flex-1 min-w-0" : "w-full"}
                  value={customerForm.traffic_source || ""}
                  options={["小红书", "抖音", "公众号", "视频号", "朋友圈", "美团", "大众点评", "好友推荐"].map(v => ({value: v, label: v}))}
                  placeholder="请选择"
                  onChange={(v) => setCustomerForm({ ...customerForm, traffic_source: v, traffic_source_detail: "" })}
                />
                {["小红书", "抖音", "公众号", "视频号"].includes(customerForm.traffic_source || "") && (
                  <Input rounded="[2px]" value={customerForm.traffic_source_detail || ""} onChange={(e) => setCustomerForm({ ...customerForm, traffic_source_detail: e.target.value })} placeholder="内容链接" className="h-8 flex-1 text-[12px]" />
                )}
                {(customerForm.traffic_source || "") === "好友推荐" && (
                  <div className="flex-1 min-w-0">
                    <CustomerSearchInput rounded="2px"
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
                    <CustomerSearchInput rounded="2px"
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
                  <SelectDropdown rounded="[2px]"
                    value={customerForm.work_status || ""}
                    options={[{ value: "在职", label: "在职" }, { value: "离职", label: "离职" }, { value: "自由职业", label: "自由职业" }]}
                    placeholder="是否在职"
                    onChange={(v) => setCustomerForm({ ...customerForm, work_status: v })}
                    className="w-[100px]"
                  />
                  <Input rounded="[2px]" value={customerForm.work_description || ""} onChange={(e) => setCustomerForm({ ...customerForm, work_description: e.target.value })} placeholder="描述工作内容..." className="flex-1" />
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
