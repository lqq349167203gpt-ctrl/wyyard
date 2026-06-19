import { useEffect, useState, useRef, useCallback } from "react"
import { CreditCard, Download, Pencil, Trash2, Upload } from "lucide-react"
import * as XLSX from "xlsx-js-style"
import ExcelJS from "exceljs"
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
  "other-projects": "其他项目",
}

const CARD_TYPE_OPTIONS = [
  { value: "次卡", label: "次卡" },
  { value: "体验会员", label: "体验会员" },
  { value: "月卡", label: "月卡" },
  { value: "3月卡", label: "3月卡" },
  { value: "30次卡", label: "30次卡" },
  { value: "半年卡", label: "半年卡" },
  { value: "年卡", label: "年卡" },
]

export function ProjectDeductionTab() {
  const { permissions: cp, ready: permReady } = useCustomerPermissions("payment")
  const [customers, setCustomers] = useState<Customer[]>([])

  const cpRef = useRef(cp)
  cpRef.current = cp

  // 扣次记录
  const [deductions, setDeductions] = useState<ProjectDeduction[]>([])
  const [deductionsLoading, setDeductionsLoading] = useState(true)

  // 弹窗
  const [dialogOpen, setDialogOpen] = useState(false)
  const [customerId, setCustomerId] = useState("")
  const [customerName, setCustomerName] = useState("")
  const [projectType, setProjectType] = useState("")
  const [cardType, setCardType] = useState("")
  const [availableItems, setAvailableItems] = useState<{ id: string; name: string; remaining_count: number; detail?: string; card_type?: string; expiry_date?: string }[]>([])
  const [selectedItemId, setSelectedItemId] = useState("")
  const [deductCount, setDeductCount] = useState("1")
  const [deducting, setDeducting] = useState(false)
  const [loadingItems, setLoadingItems] = useState(false)

  // 编辑弹窗
  const [editTarget, setEditTarget] = useState<ProjectDeduction | null>(null)
  const [editCount, setEditCount] = useState("1")
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

  // 加载扣次记录
  const refreshDeductions = useCallback(async () => {
    setDeductionsLoading(true)
    try {
      const data = await projectDeductionApi.list()
      setDeductions(data)
    } catch {
      setDeductions([])
    }
    setDeductionsLoading(false)
  }, [])

  useEffect(() => {
    refreshDeductions()
  }, [refreshDeductions])

  // 选中用户后加载可销卡项目
  const handleSelectCustomer = useCallback(async (c: Customer) => {
    setCustomerId(c.id)
    setCustomerName(c.nickname)
    setProjectType("")
    setCardType("")
    setSelectedItemId("")
    setAvailableItems([])
  }, [])

  const handleClearCustomer = useCallback(() => {
    setCustomerId("")
    setCustomerName("")
    setProjectType("")
    setCardType("")
    setSelectedItemId("")
    setAvailableItems([])
  }, [])

  // 选择项目类型后加载可销卡项目
  const handleProjectTypeChange = useCallback(async (type: string) => {
    setProjectType(type)
    setCardType("")
    setSelectedItemId("")
    setAvailableItems([])
    if (!customerId || !type) return
    setLoadingItems(true)
    try {
      const items = await projectDeductionApi.getAvailableItems(customerId, type)
      setAvailableItems(items)
    } catch {
      setAvailableItems([])
    }
    setLoadingItems(false)
  }, [customerId])

  // 选择卡类型后筛选（不选卡类型时显示全部）
  const filteredItems = projectType === "membership-cards" && cardType
    ? availableItems.filter(i => i.card_type === cardType)
    : projectType === "membership-cards"
    ? availableItems
    : availableItems

  const selectedItem = availableItems.find(i => i.id === selectedItemId)

  const handleDeduct = async () => {
    if (!customerId || !selectedItemId || !projectType) return
    setDeducting(true)
    try {
      await projectDeductionApi.create({
        customer_id: customerId,
        project_type: projectType,
        project_id: selectedItemId,
        count: parseInt(deductCount) || 1,
        operator_name: currentUserName,
      })
      setDialogOpen(false)
      setCustomerId("")
      setCustomerName("")
      setProjectType("")
      setCardType("")
      setSelectedItemId("")
      setAvailableItems([])
      setDeductCount("1")
      refreshDeductions()
    } catch (error: any) {
      alert(error?.message || "销卡失败")
    } finally {
      setDeducting(false)
    }
  }

  const handleEdit = async () => {
    if (!editTarget || editing) return
    setEditing(true)
    try {
      await projectDeductionApi.update(editTarget.id, {
        count: parseInt(editCount) || 1,
        operator_name: currentUserName,
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

  // 导出销卡记录
  const handleExport = () => {
    if (deductions.length === 0) return
    const wb = XLSX.utils.book_new()
    // 疗愈项目类型（合并到一个 sheet）
    const HEALING_TYPES = ["group-cases", "emotional-releases", "oh-card-readings", "energy-knots"]
    // 分组：会员卡 / 疗愈项目 / 其他项目
    const grouped: Record<string, ProjectDeduction[]> = {
      "membership-cards": [],
      "healing": [],
      "other-projects": [],
    }
    for (const d of deductions) {
      if (HEALING_TYPES.includes(d.project_type)) grouped["healing"].push(d)
      else if (grouped[d.project_type]) grouped[d.project_type].push(d)
      else grouped["other-projects"].push(d)
    }
    const thinBorder = { style: "thin", color: { rgb: "C0C4CC" } }
    const baseStyle = {
      font: { sz: 11, color: { rgb: "000000" } },
      alignment: { vertical: "center", wrapText: true },
      border: { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder },
    }
    const headerExtra = {
      font: { bold: true, sz: 11, color: { rgb: "000000" } },
      fill: { fgColor: { rgb: "F5F6F7" } },
    }
    const applySheetStyle = (ws: XLSX.WorkSheet, cols: { wch: number }[]) => {
      ws['!sheetPr'] = { showGridLines: false }
      ws['!cols'] = cols
      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
      ws['!rows'] = Array.from({ length: range.e.r + 1 }, () => ({ hpt: 30 }))
      for (let row = 0; row <= range.e.r; row++) {
        for (let col = range.s.c; col <= range.e.c; col++) {
          const cellRef = XLSX.utils.encode_cell({ r: row, c: col })
          if (ws[cellRef]) ws[cellRef].s = { ...ws[cellRef].s, ...baseStyle }
        }
      }
      for (let col = range.s.c; col <= range.e.c; col++) {
        const cellRef = XLSX.utils.encode_cell({ r: 0, c: col })
        if (ws[cellRef]) ws[cellRef].s = { ...ws[cellRef].s, ...headerExtra }
      }
    }
    // 会员卡 sheet
    if (grouped["membership-cards"].length > 0) {
      const rows = grouped["membership-cards"].map(d => ({
        "昵称": d.nickname, "项目名称": d.project_name, "销卡次数": d.count,
        "销卡日期": d.deduction_date, "该卡剩余": d.remaining_after, "操作人": d.operator_name || "-",
      }))
      const ws = XLSX.utils.json_to_sheet(rows, { cellStyles: true })
      applySheetStyle(ws, [{ wch: 12 }, { wch: 16 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 10 }])
      XLSX.utils.book_append_sheet(wb, ws, "会员卡")
    }
    // 疗愈项目 sheet（觉醒游戏/情绪释放/OH卡梳理/能量结）
    if (grouped["healing"].length > 0) {
      const rows = grouped["healing"].map(d => ({
        "昵称": d.nickname, "项目类型": PROJECT_TYPE_LABELS[d.project_type] || d.project_type,
        "项目名称": d.project_name, "销卡次数": d.count,
        "销卡日期": d.deduction_date, "该卡剩余": d.remaining_after, "操作人": d.operator_name || "-",
      }))
      const ws = XLSX.utils.json_to_sheet(rows, { cellStyles: true })
      applySheetStyle(ws, [{ wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 10 }])
      XLSX.utils.book_append_sheet(wb, ws, "疗愈项目")
    }
    // 其他项目 sheet
    if (grouped["other-projects"].length > 0) {
      const rows = grouped["other-projects"].map(d => ({
        "昵称": d.nickname, "项目名称": d.project_name, "销卡次数": d.count,
        "销卡日期": d.deduction_date, "该卡剩余": d.remaining_after, "操作人": d.operator_name || "-",
      }))
      const ws = XLSX.utils.json_to_sheet(rows, { cellStyles: true })
      applySheetStyle(ws, [{ wch: 12 }, { wch: 16 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 10 }])
      XLSX.utils.book_append_sheet(wb, ws, "其他项目")
    }
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "")
    XLSX.writeFile(wb, `销卡记录_${today}.xlsx`)
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

    // 会员卡 sheet
    const wsMc = wb.addWorksheet("会员卡")
    wsMc.columns = [
      { header: "昵称", key: "nickname", width: 12 },
      { header: "销卡次数", key: "count", width: 10 },
    ]
    wsMc.addRow({ nickname: "张三", count: 1 })
    wsMc.getRow(1).eachCell(headerStyle)
    wsMc.getRow(2).eachCell(exampleStyle)

    // 疗愈项目 sheet（觉醒游戏/情绪释放/OH卡梳理/能量结）
    const HEALING_OPTIONS = PROJECT_TYPE_OPTIONS.filter(o => ["group-cases", "emotional-releases", "oh-card-readings", "energy-knots"].includes(o.value))
    const wsHealing = wb.addWorksheet("疗愈项目")
    wsHealing.columns = [
      { header: "昵称", key: "nickname", width: 12 },
      { header: "项目类型", key: "project_type", width: 12 },
      { header: "销卡次数", key: "count", width: 10 },
    ]
    wsHealing.addRow({ nickname: "张三", project_type: "觉醒游戏", count: 1 })
    wsHealing.getRow(1).eachCell(headerStyle)
    wsHealing.getRow(2).eachCell(exampleStyle)
    const healingTypeList = HEALING_OPTIONS.map(o => o.label).join(",")
    for (let r = 2; r <= 1000; r++) {
      wsHealing.getCell(r, 2).dataValidation = {
        type: "list", allowBlank: true,
        formulae: [`"${healingTypeList}"`],
        showErrorMessage: true, errorTitle: "无效输入", error: "请从下拉列表中选择项目类型",
      }
    }

    // 其他项目 sheet
    const wsOther = wb.addWorksheet("其他项目")
    wsOther.columns = [
      { header: "昵称", key: "nickname", width: 12 },
      { header: "销卡次数", key: "count", width: 10 },
    ]
    wsOther.addRow({ nickname: "张三", count: 1 })
    wsOther.getRow(1).eachCell(headerStyle)
    wsOther.getRow(2).eachCell(exampleStyle)

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

    try {
      const data = await file.arrayBuffer()
      const wb = XLSX.read(data, { type: "array" })
      let success = 0
      let failed = 0
      const errors: string[] = []

      for (const sheetName of wb.SheetNames) {
        const mappedType = SHEET_TYPE_MAP[sheetName]
        if (!mappedType) continue

        const ws = wb.Sheets[sheetName]
        const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1 })
        if (rows.length < 2) continue

        const headers = rows[0] as string[]
        const dataRows = rows.slice(1).filter(r => r.some(cell => cell))
        const get = (row: any[], col: string) => {
          const idx = headers.indexOf(col)
          return idx >= 0 ? String(row[idx] ?? "").trim() : ""
        }

        for (let i = 0; i < dataRows.length; i++) {
          const row = dataRows[i]
          const rowNum = i + 2
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
            try {
              await projectDeductionApi.autoDeduct({ nickname, project_type: projectType, count, operator_name: currentUserName })
              success++
            } catch (err: any) {
              failed++
              errors.push(`[${sheetName}] 第${rowNum}行 ${nickname}：${err.message || "销卡失败"}`)
            }
          } else {
            try {
              await projectDeductionApi.autoDeduct({ nickname, project_type: mappedType, count, operator_name: currentUserName })
              success++
            } catch (err: any) {
              failed++
              errors.push(`[${sheetName}] 第${rowNum}行 ${nickname}：${err.message || "销卡失败"}`)
            }
          }
        }
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
      {/* 销卡按钮 */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {deductions.length > 0 && <span>共 {deductions.length} 条记录</span>}
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleDownloadTemplate}>
            <Download className="mr-1 h-3.5 w-3.5" /> 下载模板
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => fileInputRef.current?.click()} disabled={importing}>
            <Upload className="mr-1 h-3.5 w-3.5" /> 导入
          </Button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleExport} disabled={deductions.length === 0}>
            <Download className="mr-1 h-3.5 w-3.5" /> 导出
          </Button>
          <Button size="sm" className="h-8 text-xs" onClick={() => setDialogOpen(true)}>
            <CreditCard className="mr-1 h-3.5 w-3.5" /> 销卡
          </Button>
        </div>
      </div>

      {/* 扣次记录表格 */}
      <div className="bg-white rounded-lg">
        {deductionsLoading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">加载中...</div>
        ) : deductions.length === 0 ? (
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
                <TableHead>该卡剩余</TableHead>
                <TableHead>操作人</TableHead>
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
                  <TableCell className="text-[#2b2f36]">
                    {d.remaining_after < 0 ? <span className="text-[#c4506a]">{d.remaining_after} 次</span> : `${d.remaining_after} 次`}
                  </TableCell>
                  <TableCell className="text-[#8f959e]">{d.operator_name || "-"}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <button className="p-1 hover:bg-[#f0f1f2] rounded" onClick={() => { setEditTarget(d); setEditCount(String(d.count)) }}>
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

      {/* 销卡弹窗 */}
      <Dialog open={dialogOpen} onOpenChange={(open) => {
        setDialogOpen(open)
        if (!open) {
          setCustomerId(""); setCustomerName(""); setProjectType(""); setCardType("")
          setSelectedItemId(""); setAvailableItems([]); setDeductCount("1")
        }
      }}>
        <DialogContent className="max-w-sm p-0 gap-0" initialFocus={false}>
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-base">项目销卡</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-4">
            {/* 用户搜索 */}
            <div className="grid grid-cols-[70px_1fr] items-center gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">用户</span>
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

            {/* 项目类型 */}
            <div className="grid grid-cols-[70px_1fr] items-center gap-[14px]">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">类型</span>
              {!customerId ? (
                <div className="h-8 flex items-center text-[12px] text-[#8f959e]">请先选择用户</div>
              ) : (
                <SelectDropdown
                  value={projectType}
                  options={PROJECT_TYPE_OPTIONS}
                  placeholder="选择项目类型"
                  onChange={handleProjectTypeChange}
                />
              )}
            </div>

            {/* 会员卡卡类型子选项 */}
            {projectType === "membership-cards" && (
              <div className="grid grid-cols-[70px_1fr] items-start gap-2">
                <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">卡类型</span>
                <SelectDropdown
                  value={cardType}
                  options={CARD_TYPE_OPTIONS}
                  placeholder="选择卡类型"
                  onChange={(v) => { setCardType(v); setSelectedItemId("") }}
                />
              </div>
            )}

            {/* 选择项目 */}
            {projectType && (
              <div className="grid grid-cols-[70px_1fr] items-start gap-2">
                <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">项目</span>
                {loadingItems ? (
                  <div className="h-8 flex items-center text-[12px] text-[#8f959e]">加载中...</div>
                ) : filteredItems.length === 0 ? (
                  <div className="h-8 flex items-center text-[12px] text-[#8f959e]">该用户无可销卡项目</div>
                ) : (
                  <SelectDropdown
                    value={selectedItemId}
                    options={filteredItems.map((i) => ({
                      value: i.id,
                      label: `${i.name} - ${i.detail || `剩余${i.remaining_count}次`}`,
                    }))}
                    placeholder="请选择项目"
                    onChange={setSelectedItemId}
                  />
                )}
              </div>
            )}

            {/* 项目详情 */}
            {selectedItem && (
              <div className="bg-[#f7f8fa] rounded-md p-3 text-[12px] space-y-1">
                <div className="flex justify-between"><span className="text-[#8f959e]">项目名称</span><span>{selectedItem.name}</span></div>
                <div className="flex justify-between"><span className="text-[#8f959e]">剩余次数</span><span>{selectedItem.remaining_count} 次</span></div>
                {selectedItem.expiry_date && (
                  <div className="flex justify-between"><span className="text-[#8f959e]">到期日期</span><span>{selectedItem.expiry_date}</span></div>
                )}
              </div>
            )}

            {/* 次数 */}
            <div className="grid grid-cols-[70px_1fr] items-center gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">次数</span>
              <Input
                type="text"
                inputMode="numeric"
                value={deductCount}
                onChange={(e) => setDeductCount(e.target.value.replace(/[^0-9]/g, ""))}
                className="h-8 text-xs"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>取消</Button>
              <Button size="sm" onClick={handleDeduct} disabled={deducting || !customerId || !selectedItemId}>
                {deducting ? "销卡中..." : "确认销卡"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 编辑弹窗 */}
      <Dialog open={!!editTarget} onOpenChange={(open) => { if (!open) setEditTarget(null) }}>
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
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => setEditTarget(null)}>取消</Button>
              <Button size="sm" onClick={handleEdit} disabled={editing || !editCount}>
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
              成功 {importResult?.success} 条{importResult && importResult.failed > 0 ? `，失败 ${importResult.failed} 条` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {importResult && importResult.errors.length > 0 && (
            <div className="max-h-40 overflow-y-auto text-xs text-[#8f959e] space-y-0.5 px-1">
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
