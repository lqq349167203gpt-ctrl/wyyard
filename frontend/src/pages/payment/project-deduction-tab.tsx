import { useEffect, useState, useRef, useCallback } from "react"
import { CreditCard, Download, Pencil, Trash2, Upload } from "lucide-react"
import { useServerPagination } from "@/hooks/use-server-pagination"
import { PaginationBar } from "@/components/pagination-bar"
import ExcelJS from "exceljs"
import { sheetToRows } from "@/lib/excel"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { customerApi, projectDeductionApi, type Customer, type ProjectDeduction } from "@/lib/api"
import { SelectDropdown } from "@/components/select-dropdown"
import { CustomerSearchInput } from "@/components/customer-search-input"
import { useCustomerPermissions } from "@/hooks/use-customer-permissions"

const PROJECT_TYPE_OPTIONS = [
  { value: "membership-cards", label: "会员卡" },
  { value: "group-cases", label: "觉醒游戏" },
  { value: "emotional-releases", label: "情绪释放" },
  { value: "oh-card-readings", label: "OH卡梳理" },
  { value: "energy-knots", label: "能量结" },
  { value: "other-projects", label: "其他项目" },
]

const PROJECT_TYPE_LABELS: Record<string, string> = {
  "membership-cards": "会员卡",
  "group-cases": "觉醒游戏",
  "emotional-releases": "情绪释放",
  "oh-card-readings": "OH卡梳理",
  "energy-knots": "能量结",
  "internal-courses": "内部课程",
  "other-projects": "其他项目",
}

const CARD_TYPE_OPTIONS = [
  { value: "次卡", label: "次卡" },
  { value: "体验会员", label: "体验会员" },
  { value: "月卡", label: "月卡" },
  { value: "12次卡", label: "12次卡" },
  { value: "3月卡", label: "3月卡" },
  { value: "30次卡", label: "30次卡" },
  { value: "半年卡", label: "半年卡" },
  { value: "年卡", label: "年卡" },
]

type AvailableDeductionItem = {
  id: string
  name: string
  remaining_count: number | null
  detail?: string
  card_type?: string
  expiry_date?: string
  project_type: string
  project_type_label: string
  selection_key: string
}

export function ProjectDeductionTab() {
  const { permissions: cp, ready: permReady } = useCustomerPermissions("payment")
  const [customers, setCustomers] = useState<Customer[]>([])

  const cpRef = useRef(cp)
  cpRef.current = cp

  // 搜索
  const [searchNickname, setSearchNickname] = useState("")
  const appliedNicknameRef = useRef("")
  const [searchProjectType, setSearchProjectType] = useState("all")
  const appliedProjectTypeRef = useRef("")
  const [searchCardType, setSearchCardType] = useState("all")
  const appliedCardTypeRef = useRef("")

  // 扣次记录（分页）
  const fetchDeductions = useCallback(async (page: number, pageSize: number) => {
    const params: Record<string, string> = {}
    if (appliedNicknameRef.current) params.nickname = appliedNicknameRef.current
    if (appliedProjectTypeRef.current) params.project_type = appliedProjectTypeRef.current
    if (appliedCardTypeRef.current) params.card_type = appliedCardTypeRef.current
    return projectDeductionApi.listPaginated(page, pageSize, Object.keys(params).length > 0 ? params : undefined)
  }, [])
  const {
    paginatedItems: deductions, currentPage, totalPages, totalItems,
    goToPage, startIndex, endIndex, loading: deductionsLoading, refresh: refreshDeductions,
  } = useServerPagination<ProjectDeduction>(fetchDeductions)

  // 弹窗
  const [dialogOpen, setDialogOpen] = useState(false)
  const [customerId, setCustomerId] = useState("")
  const [customerName, setCustomerName] = useState("")
  const [availableItems, setAvailableItems] = useState<AvailableDeductionItem[]>([])
  const [selectedItemKey, setSelectedItemKey] = useState("")
  const [deductCount, setDeductCount] = useState("1")
  const [deductReason, setDeductReason] = useState("")
  const [deducting, setDeducting] = useState(false)
  const [loadingItems, setLoadingItems] = useState(false)
  const availableItemsRequestRef = useRef(0)

  // 编辑弹窗
  const [editTarget, setEditTarget] = useState<ProjectDeduction | null>(null)
  const [editCount, setEditCount] = useState("1")
  const [editReason, setEditReason] = useState("")
  const [editing, setEditing] = useState(false)

  // 删除确认
  const [deleteTarget, setDeleteTarget] = useState<ProjectDeduction | null>(null)
  const [deleting, setDeleting] = useState(false)

  // 导入
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ success: number; failed: number; errors: string[] } | null>(null)

  const currentUserName = (() => {
    try { return JSON.parse(localStorage.getItem("currentUser") || "{}").owner || "" } catch { return "" }
  })()

  // 搜索
  const handleFilterChange = useCallback((value: string) => {
    setSearchNickname(value)
    appliedNicknameRef.current = value
    refreshDeductions()
  }, [refreshDeductions])

  const handleTypeChange = useCallback((value: string) => {
    setSearchProjectType(value)
    appliedProjectTypeRef.current = value === "all" ? "" : value
    // 切换项目类型时重置卡类型
    setSearchCardType("all")
    appliedCardTypeRef.current = ""
    refreshDeductions()
  }, [refreshDeductions])

  const handleCardTypeChange = useCallback((value: string) => {
    setSearchCardType(value)
    appliedCardTypeRef.current = value === "all" ? "" : value
    refreshDeductions()
  }, [refreshDeductions])

  const handleClearSearch = useCallback(() => {
    setSearchNickname("")
    setSearchProjectType("all")
    setSearchCardType("all")
    appliedNicknameRef.current = ""
    appliedProjectTypeRef.current = ""
    appliedCardTypeRef.current = ""
    refreshDeductions()
  }, [refreshDeductions])

  // 加载客户列表
  useEffect(() => {
    if (!permReady) return
    customerApi.list().then((data) => {
      let filtered = data
      const cu = JSON.parse(localStorage.getItem("currentUser") || "{}")
      if (cu.role !== "超级管理员") {
        if (cpRef.current.length > 0) {
          filtered = data.filter(c => c.member_type && cpRef.current.includes(c.member_type))
        } else {
          filtered = []
        }
      }
      setCustomers(filtered)
    }).catch(() => {})
  }, [permReady])

  // 扣次记录加载由 useServerPagination hook 自动处理

  // 选中用户后加载可销卡项目
  const handleSelectCustomer = useCallback(async (c: Customer) => {
    const requestId = ++availableItemsRequestRef.current
    setCustomerId(c.id)
    setCustomerName(c.nickname)
    setSelectedItemKey("")
    setAvailableItems([])
    setLoadingItems(true)
    const groupedItems = await Promise.all(PROJECT_TYPE_OPTIONS.map(async (option) => {
      try {
        const items = await projectDeductionApi.getAvailableItems(c.id, option.value)
        return items
          .filter((item) => item.remaining_count === null || item.remaining_count > 0)
          .map((item) => ({
            ...item,
            project_type: option.value,
            project_type_label: option.label,
            selection_key: `${option.value}:${item.id}`,
          }))
      } catch {
        return []
      }
    }))
    if (requestId !== availableItemsRequestRef.current) return
    setAvailableItems(groupedItems.flat())
    setLoadingItems(false)
  }, [])

  const handleClearCustomer = useCallback(() => {
    availableItemsRequestRef.current += 1
    setCustomerId("")
    setCustomerName("")
    setSelectedItemKey("")
    setAvailableItems([])
    setLoadingItems(false)
  }, [])

  const selectedItem = availableItems.find(i => i.selection_key === selectedItemKey)

  const handleDeduct = async () => {
    if (!customerId || !selectedItem) return
    const reason = deductReason.trim()
    if (!reason) {
      alert("请填写销卡内容")
      return
    }
    setDeducting(true)
    try {
      await projectDeductionApi.create({
        customer_id: customerId,
        project_type: selectedItem.project_type,
        project_id: selectedItem.id,
        count: parseInt(deductCount) || 1,
        reason,
        created_by: currentUserName,
      })
      setDialogOpen(false)
      setCustomerId("")
      setCustomerName("")
      setSelectedItemKey("")
      setAvailableItems([])
      setDeductCount("1")
      setDeductReason("")
      refreshDeductions()
    } catch (error: any) {
      alert(error?.message || "销卡失败")
    } finally {
      setDeducting(false)
    }
  }

  const handleEdit = async () => {
    if (!editTarget || editing) return
    const reason = editReason.trim()
    if (!reason) {
      alert("请填写销卡内容")
      return
    }
    setEditing(true)
    try {
      await projectDeductionApi.update(editTarget.id, {
        count: parseInt(editCount) || 1,
        reason,
        updated_by: currentUserName,
      })
      setEditTarget(null)
      refreshDeductions()
    } catch (error: any) {
      alert(error?.message || "修改失败")
    } finally {
      setEditing(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget || deleting) return
    setDeleting(true)
    try {
      await projectDeductionApi.delete(deleteTarget.id)
      setDeleteTarget(null)
      refreshDeductions()
    } catch (error: any) {
      alert(error?.message || "删除失败")
    } finally {
      setDeleting(false)
    }
  }


  // 下载导入模板
  const handleDownloadTemplate = async () => {
    const wb = new ExcelJS.Workbook()
    const headerBorder: Partial<ExcelJS.Borders> = {
      top: { style: "thin", color: { argb: "FFC0C4CC" } },
      bottom: { style: "thin", color: { argb: "FFC0C4CC" } },
      left: { style: "thin", color: { argb: "FFC0C4CC" } },
      right: { style: "thin", color: { argb: "FFC0C4CC" } },
    }
    const headerStyle = (cell: ExcelJS.Cell) => {
      cell.font = { bold: true, size: 11 }
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F6F7" } }
      cell.border = headerBorder
      cell.alignment = { vertical: "middle", horizontal: "center" }
    }
    const exampleStyle = (cell: ExcelJS.Cell) => {
      cell.font = { color: { argb: "FF999999" } }
    }

    const HINT_TEXT = "将自动根据同类型的项目中，在有效期内扣除最早的次数"
    const addHintRow = (ws: ExcelJS.Worksheet, colCount: number) => {
      const row = ws.addRow([HINT_TEXT])
      ws.mergeCells(1, 1, 1, colCount)
      row.getCell(1).font = { size: 10, color: { argb: "FF8F959E" }, italic: true }
      row.getCell(1).alignment = { vertical: "middle", horizontal: "left" }
    }

    // 会员卡 sheet
    const wsMc = wb.addWorksheet("会员卡")
    wsMc.getColumn(1).width = 12
    wsMc.getColumn(2).width = 12
    wsMc.getColumn(3).width = 10
    addHintRow(wsMc, 3)
    const mcHeader = wsMc.addRow(["昵称", "卡类型", "销卡次数"])
    mcHeader.eachCell(headerStyle)
    const mcExample = wsMc.addRow(["张三", "体验会员", 1])
    mcExample.eachCell(exampleStyle)
    const cardTypeList = CARD_TYPE_OPTIONS.map(o => o.label).join(",")
    for (let r = 3; r <= 1000; r++) {
      wsMc.getCell(r, 2).dataValidation = {
        type: "list", allowBlank: true,
        formulae: [`"${cardTypeList}"`],
        showErrorMessage: true, errorTitle: "无效输入", error: "请从下拉列表中选择卡类型",
      }
    }

    // 疗愈项目 sheet（觉醒游戏/情绪释放/OH卡梳理/能量结）
    const HEALING_OPTIONS = PROJECT_TYPE_OPTIONS.filter(o => ["group-cases", "emotional-releases", "oh-card-readings", "energy-knots"].includes(o.value))
    const wsHealing = wb.addWorksheet("疗愈项目")
    wsHealing.getColumn(1).width = 12
    wsHealing.getColumn(2).width = 12
    wsHealing.getColumn(3).width = 10
    addHintRow(wsHealing, 3)
    const healingHeader = wsHealing.addRow(["昵称", "项目类型", "销卡次数"])
    healingHeader.eachCell(headerStyle)
    const healingExample = wsHealing.addRow(["张三", "觉醒游戏", 1])
    healingExample.eachCell(exampleStyle)
    const healingTypeList = HEALING_OPTIONS.map(o => o.label).join(",")
    for (let r = 3; r <= 1000; r++) {
      wsHealing.getCell(r, 2).dataValidation = {
        type: "list", allowBlank: true,
        formulae: [`"${healingTypeList}"`],
        showErrorMessage: true, errorTitle: "无效输入", error: "请从下拉列表中选择项目类型",
      }
    }

    // 其他项目 sheet
    const wsOther = wb.addWorksheet("其他项目")
    wsOther.getColumn(1).width = 12
    wsOther.getColumn(2).width = 16
    wsOther.getColumn(3).width = 10
    addHintRow(wsOther, 3)
    const otherHeader = wsOther.addRow(["昵称", "项目名称", "销卡次数"])
    otherHeader.eachCell(headerStyle)
    const otherExample = wsOther.addRow(["张三", "（填写具体项目名称）", 1])
    otherExample.eachCell(exampleStyle)

    const buffer = await wb.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "销卡导入模板.xlsx"
    a.click()
    URL.revokeObjectURL(url)
  }

  // 导入 Excel（自动按最早到期销卡）
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ""
    setImporting(true)
    setImportResult(null)

    // sheet 名 → project_type
    const SHEET_TYPE_MAP: Record<string, string> = {
      "会员卡": "membership-cards",
      "疗愈项目": "__healing__",
      "其他项目": "other-projects",
    }
    const HEALING_LABEL_MAP: Record<string, string> = {
      "觉醒游戏": "group-cases",
      "情绪释放": "emotional-releases",
      "OH卡梳理": "oh-card-readings",
      "能量结": "energy-knots",
    }

    // 可用项目缓存：key = "customerId|projectType|nameFilter"
    const availableCache = new Map<string, { remaining: number | null; label: string }>()
    const getAvailable = async (nickname: string, projectType: string, nameFilter: string = "") => {
      const customer = customers.find(c => c.nickname === nickname)
      if (!customer) return null
      const cacheKey = `${customer.id}|${projectType}|${nameFilter}`
      if (availableCache.has(cacheKey)) return availableCache.get(cacheKey)!
      try {
        const items = await projectDeductionApi.getAvailableItems(customer.id, projectType)
        let filtered = items
        if (nameFilter) {
          if (projectType === "membership-cards") filtered = items.filter(i => i.card_type === nameFilter)
          else if (projectType === "other-projects") filtered = items.filter(i => i.name === nameFilter)
        }
        const hasUnlimited = filtered.some(i => i.remaining_count === null)
        const remaining = hasUnlimited ? null : filtered.reduce((sum, i) => sum + (i.remaining_count || 0), 0)
        const label = nameFilter || PROJECT_TYPE_LABELS[projectType] || projectType
        const result = { remaining, label }
        availableCache.set(cacheKey, result)
        return result
      } catch {
        return null
      }
    }

    try {
      const data = await file.arrayBuffer()
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(data)
      let success = 0
      let failed = 0
      const errors: string[] = []

      let processedSheets = 0
      for (const ws of wb.worksheets) {
        const sheetName = ws.name
        const mappedType = SHEET_TYPE_MAP[sheetName]
        if (!mappedType) continue
        processedSheets++

        // 等价于原 XLSX.utils.sheet_to_json(ws, { header: 1 })
        const rows = sheetToRows(ws)
        if (rows.length < 2) continue

        // 跳过提示文字行（第一行不是表头时）
        const firstRow = rows[0] as any[]
        const headerIdx = firstRow.some((cell: any) => ["昵称", "卡类型", "项目类型", "项目名称", "销卡次数"].includes(String(cell || "").trim())) ? 0 : 1
        const headers = rows[headerIdx] as string[]
        const dataRows = rows.slice(headerIdx + 1).filter(r => r.some(cell => cell))
        const get = (row: any[], col: string) => {
          const idx = headers.indexOf(col)
          return idx >= 0 ? String(row[idx] ?? "").trim() : ""
        }

        for (let i = 0; i < dataRows.length; i++) {
          const row = dataRows[i]
          const rowNum = headerIdx + 2 + i
          const nickname = get(row, "昵称")
          const countStr = get(row, "销卡次数")
          const count = parseInt(countStr) || 1

          if (!nickname) {
            failed++
            errors.push(`[${sheetName}] 第${rowNum}行：昵称为空`)
            continue
          }

          if (mappedType === "__healing__") {
            // 疗愈项目：需要项目类型列
            const typeLabel = get(row, "项目类型")
            const projectType = HEALING_LABEL_MAP[typeLabel]
            if (!projectType) {
              failed++
              errors.push(`[${sheetName}] 第${rowNum}行：项目类型"${typeLabel}"无效`)
              continue
            }
            // 校验次数是否超出
            const avail = await getAvailable(nickname, projectType)
            if (!avail) {
              failed++
              errors.push(`[${sheetName}] 第${rowNum}行：用户"${nickname}"不存在`)
              continue
            }
            if (avail.remaining !== null && count > avail.remaining) {
              failed++
              errors.push(`[${sheetName}] 第${rowNum}行 ${nickname}：销卡次数 ${count} 超出可用 ${avail.remaining} 次（${typeLabel}）`)
              continue
            }
            try {
              await projectDeductionApi.autoDeduct({ nickname, project_type: projectType, count, created_by: currentUserName })
              success++
            } catch (err: any) {
              failed++
              errors.push(`[${sheetName}] 第${rowNum}行 ${nickname}：${err.message || "销卡失败"}`)
            }
          } else {
            // 会员卡按卡类型筛选，其他项目按项目名称筛选
            let nameFilter = ""
            if (mappedType === "membership-cards") {
              nameFilter = get(row, "卡类型")
              if (!nameFilter) {
                failed++
                errors.push(`[${sheetName}] 第${rowNum}行：卡类型为空`)
                continue
              }
            } else if (mappedType === "other-projects") {
              nameFilter = get(row, "项目名称")
              if (!nameFilter) {
                failed++
                errors.push(`[${sheetName}] 第${rowNum}行：项目名称为空`)
                continue
              }
            }
            // 校验次数是否超出
            const avail = await getAvailable(nickname, mappedType, nameFilter)
            if (!avail) {
              failed++
              errors.push(`[${sheetName}] 第${rowNum}行：用户"${nickname}"不存在`)
              continue
            }
            if (avail.remaining !== null && count > avail.remaining) {
              failed++
              errors.push(`[${sheetName}] 第${rowNum}行 ${nickname}：销卡次数 ${count} 超出可用 ${avail.remaining} 次（${avail.label}）`)
              continue
            }
            try {
              await projectDeductionApi.autoDeduct({ nickname, project_type: mappedType, count, created_by: currentUserName, name_filter: nameFilter })
              success++
            } catch (err: any) {
              failed++
              errors.push(`[${sheetName}] 第${rowNum}行 ${nickname}：${err.message || "销卡失败"}`)
            }
          }
        }
      }

      if (processedSheets === 0) {
        errors.push(`未找到有效的 sheet（需要：${Object.keys(SHEET_TYPE_MAP).join("、")}），当前文件 sheet：${wb.worksheets.map(w => w.name).join("、")}`)
      }

      setImportResult({ success, failed, errors })
      if (success > 0) refreshDeductions()
    } catch (err: any) {
      setImportResult({ success: 0, failed: 0, errors: [`文件解析失败：${err.message}`] })
    } finally {
      setImporting(false)
    }
  }

  return (
    <>
      {/* 搜索 + 操作栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-44">
            <CustomerSearchInput
              customers={customers}
              value={searchNickname}
              onChange={(v) => handleFilterChange(typeof v === "string" ? v : "")}
              placeholder="搜索用户"
              filterSelected={false}
            />
          </div>
          <div className="w-36">
            <SelectDropdown
              value={searchProjectType}
              options={[
                { value: "all", label: "全部类型" },
                ...PROJECT_TYPE_OPTIONS,
              ]}
              onChange={handleTypeChange}
            />
          </div>
          {searchProjectType === "membership-cards" && (
            <div className="w-32">
              <SelectDropdown
                value={searchCardType}
                options={[
                  { value: "all", label: "全部卡类型" },
                  ...CARD_TYPE_OPTIONS,
                ]}
                onChange={handleCardTypeChange}
              />
            </div>
          )}
          <button onClick={handleClearSearch} className="h-8 px-4 rounded-md border border-[#e0e0e0] text-[12px] text-[#4e535a] hover:bg-[#f5f6f7]">
            清空
          </button>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleDownloadTemplate}>
            <Download className="mr-1 h-3.5 w-3.5" /> 下载模板
          </Button>
          {/* 导入功能暂时隐藏
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => fileInputRef.current?.click()} disabled={importing}>
            <Upload className="mr-1 h-3.5 w-3.5" /> 导入
          </Button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />
          */}
          <Button size="sm" className="h-8 text-xs" onClick={() => setDialogOpen(true)}>
            <CreditCard className="mr-1 h-3.5 w-3.5" /> 销卡
          </Button>
        </div>
      </div>

      {/* 统计 */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground mt-[6px]">
          {totalItems > 0 && <span>共 {totalItems} 条记录</span>}
        </p>
      </div>

      {/* 扣次记录表格 */}
      <div className="bg-white rounded-lg">
        {deductionsLoading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">加载中...</div>
        ) : totalItems === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <CreditCard className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">暂无销卡记录</p>
            <p className="text-xs text-muted-foreground mt-1">点击上方"销卡"按钮操作</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">昵称</TableHead>
                <TableHead>项目类型</TableHead>
                <TableHead>项目名称</TableHead>
                <TableHead>销卡次数</TableHead>
                <TableHead>销卡日期</TableHead>
                <TableHead>销卡内容</TableHead>
                <TableHead>该卡剩余</TableHead>
                <TableHead>创建人</TableHead>
                <TableHead className="w-20">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deductions.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="pl-4 text-[#2b2f36]">{d.nickname}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-[11px] font-normal">
                      {PROJECT_TYPE_LABELS[d.project_type] || d.project_type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-[#2b2f36]">{d.project_name}</TableCell>
                  <TableCell className="text-[#2b2f36]">{d.count} 次</TableCell>
                  <TableCell className="text-[#2b2f36]">{d.deduction_date}</TableCell>
                  <TableCell className={d.reason ? "text-[#4e535a]" : "text-[#d0d3d6]"}>
                    {d.reason || "-"}
                  </TableCell>
                  <TableCell className="text-[#2b2f36]">
                    {d.remaining_after === null || d.remaining_after === undefined ? "不限" : d.remaining_after < 0 ? <span className="text-[#c4506a]">{d.remaining_after} 次</span> : `${d.remaining_after} 次`}
                  </TableCell>
                  <TableCell className="text-[#8f959e]">{d.created_by || "-"}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <button className="p-1 hover:bg-[#f0f1f2] rounded" onClick={() => {
                        setEditTarget(d)
                        setEditCount(String(d.count))
                        setEditReason(d.reason || "")
                      }}>
                        <Pencil className="h-3.5 w-3.5 text-[#8f959e]" />
                      </button>
                      <button className="p-1 hover:bg-[#fef0f0] rounded" onClick={() => setDeleteTarget(d)}>
                        <Trash2 className="h-3.5 w-3.5 text-[#c4506a]" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
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

      {/* 销卡弹窗 */}
      <Dialog open={dialogOpen} onOpenChange={(open) => {
        setDialogOpen(open)
        if (!open) {
          availableItemsRequestRef.current += 1
          setCustomerId(""); setCustomerName(""); setSelectedItemKey("")
          setAvailableItems([]); setLoadingItems(false); setDeductCount("1"); setDeductReason("")
        }
      }}>
        <DialogContent className="w-[400px] max-w-[90vw] p-0 gap-0" initialFocus={false}>
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-[14px] font-normal">项目销卡</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-4">
            {/* 用户搜索 */}
            <div className="grid grid-cols-[70px_1fr] items-center gap-2">
              <span className="text-[12px] text-[#4e535a] text-right tracking-widest">用户</span>
              <CustomerSearchInput
                customers={customers}
                value={customerName || ""}
                onChange={(v) => {
                  const name = typeof v === "string" ? v : v[0] || ""
                  if (!name) handleClearCustomer()
                }}
                onSelectItem={handleSelectCustomer}
               
              />
            </div>

            {/* 可扣项目 */}
            <div className="grid grid-cols-[70px_1fr] items-center gap-2">
              <span className="text-[12px] text-[#4e535a] text-right tracking-widest">可扣项目</span>
              {!customerId ? (
                <div className="h-8 flex items-center text-[12px] text-[#8f959e]">请先选择用户</div>
              ) : loadingItems ? (
                <div className="h-8 flex items-center text-[12px] text-[#8f959e]">正在加载可扣项目...</div>
              ) : availableItems.length === 0 ? (
                <div className="h-8 flex items-center text-[12px] text-[#8f959e]">该用户暂无可扣项目</div>
              ) : (
                <SelectDropdown
                  value={selectedItemKey}
                  options={availableItems.map((item) => ({
                    value: item.selection_key,
                    label: `${item.project_type_label} · ${item.name} · ${item.detail || (item.remaining_count === null ? "不限" : `剩余 ${item.remaining_count} 次`)}`,
                  }))}
                  placeholder="请选择可扣项目"
                  onChange={setSelectedItemKey}
                />
              )}
            </div>

            {/* 项目详情 */}
            {selectedItem && (
              <div className="bg-[#f7f8fa] rounded-md p-3 text-[12px] space-y-1">
                <div className="flex justify-between"><span className="text-[#8f959e]">项目类型</span><span>{selectedItem.project_type_label}</span></div>
                <div className="flex justify-between"><span className="text-[#8f959e]">项目名称</span><span>{selectedItem.name}</span></div>
                <div className="flex justify-between"><span className="text-[#8f959e]">剩余次数</span><span>{selectedItem.remaining_count === null ? "不限" : `${selectedItem.remaining_count} 次`}</span></div>
                {selectedItem.expiry_date && (
                  <div className="flex justify-between"><span className="text-[#8f959e]">到期日期</span><span>{selectedItem.expiry_date}</span></div>
                )}
              </div>
            )}

            {/* 次数 */}
            <div className="grid grid-cols-[70px_1fr] items-center gap-2">
              <span className="text-[12px] text-[#4e535a] text-right tracking-widest">次数</span>
              <Input
                type="text"
                inputMode="numeric"
                value={deductCount}
                onChange={(e) => setDeductCount(e.target.value.replace(/[^0-9]/g, ""))}
                className="h-8 text-xs"
              />
            </div>

            <div className="grid grid-cols-[70px_1fr] items-center gap-2">
              <span className="text-[12px] text-[#4e535a] text-right tracking-widest">销卡内容</span>
              <Input
                value={deductReason}
                maxLength={200}
                placeholder="必填，请填写本次销卡内容"
                onChange={(e) => setDeductReason(e.target.value)}
                className="h-8 text-xs"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>取消</Button>
              <Button size="sm" onClick={handleDeduct} disabled={deducting || !customerId || !selectedItem || !deductReason.trim()}>
                {deducting ? "销卡中..." : "确认销卡"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 编辑弹窗 */}
      <Dialog open={!!editTarget} onOpenChange={(open) => {
        if (!open) {
          setEditTarget(null)
          setEditReason("")
        }
      }}>
        <DialogContent className="max-w-xs p-0 gap-0" initialFocus={false}>
          <DialogHeader className="px-5 pt-4 pb-3 border-b">
            <DialogTitle className="text-[13px]">修改销卡次数</DialogTitle>
          </DialogHeader>
          <div className="px-5 py-4 space-y-3">
            <div className="text-[12px] text-[#8f959e]">
              {editTarget?.nickname} — {editTarget?.project_name}
            </div>
            <div className="grid grid-cols-[56px_1fr] items-center gap-2">
              <span className="text-[12px] text-[#4e535a] text-right tracking-widest">次数</span>
              <Input
                type="text"
                inputMode="numeric"
                value={editCount}
                onChange={(e) => setEditCount(e.target.value.replace(/[^0-9]/g, ""))}
                className="h-8 text-[12px]"
              />
            </div>
            <div className="grid grid-cols-[56px_1fr] items-center gap-2">
              <span className="text-[12px] text-[#4e535a] text-right tracking-widest">销卡内容</span>
              <Input
                value={editReason}
                maxLength={200}
                placeholder="请输入销卡内容"
                onChange={(e) => setEditReason(e.target.value)}
                className="h-8 text-[12px]"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => setEditTarget(null)}>取消</Button>
              <Button size="sm" onClick={handleEdit} disabled={editing || !editCount || !editReason.trim()}>
                {editing ? "保存中..." : "保存"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除 {deleteTarget?.nickname} 的「{deleteTarget?.project_name}」销卡记录吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}>
              {deleting ? "删除中..." : "删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 导入结果 */}
      <AlertDialog open={!!importResult} onOpenChange={(open) => { if (!open) setImportResult(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>导入完成</AlertDialogTitle>
            <AlertDialogDescription>
              成功 <span className="text-[#34c724] font-medium">{importResult?.success}</span> 条
              {importResult && importResult.failed > 0 && <>, 失败 <span className="text-[#c4506a] font-medium">{importResult.failed}</span> 条</>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {importResult && importResult.errors.length > 0 && (
            <div className="max-h-40 overflow-y-auto text-xs text-[#c4506a] space-y-0.5 px-1">
              {importResult.errors.map((err, i) => <div key={i}>{err}</div>)}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setImportResult(null)}>确定</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
