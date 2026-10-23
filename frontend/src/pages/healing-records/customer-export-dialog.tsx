import { useCallback, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { SelectDropdown } from "@/components/select-dropdown"
import { customerApi, type CustomerExportColumn, type CustomerExportParams, type CustomerLight } from "@/lib/api"
import { customerReferrers } from "@/lib/customer-referrers"
import { CustomerExportDate } from "./customer-export-date"

interface Props {
  customers: CustomerLight[]
  identityNames: string[]
  cardStatusNames: string[]
  initialFilters: { cardStatus: string; identity: string; teacher: string; referrer: string; handler: string }
  onClose: () => void
}

function names(values: (string | undefined)[]) {
  return [...new Set(values.map(value => value?.trim() || "").filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "zh-CN"))
}

function matchingNames(values: string[], search: string) {
  if (!search.trim()) return []
  const matched = values.filter(value => value.toLowerCase().includes(search.trim().toLowerCase()))
  return matched.length ? matched : [search.trim()]
}

export function CustomerExportDialog({ customers, identityNames, cardStatusNames, initialFilters, onClose }: Props) {
  const options = useMemo(() => ({
    card_statuses: names([...cardStatusNames, ...customers.map(customer => customer.card_status)]),
    member_types: names([...identityNames, ...customers.map(customer => customer.member_type)]),
    service_teachers: names(customers.map(customer => customer.service_teacher)),
    referrers: names(customers.flatMap(customerReferrers)),
    referrer_handlers: names(customers.map(customer => customer.referrer_handler)),
  }), [customers, identityNames, cardStatusNames])
  const [filters, setFilters] = useState<CustomerExportParams>(() => ({
    card_statuses: initialFilters.cardStatus ? [initialFilters.cardStatus] : [],
    member_types: initialFilters.identity ? [initialFilters.identity] : [],
    service_teachers: matchingNames(options.service_teachers, initialFilters.teacher),
    referrers: matchingNames(options.referrers, initialFilters.referrer),
    referrer_handlers: matchingNames(options.referrer_handlers, initialFilters.handler),
  }))
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState("")
  const [columns, setColumns] = useState<CustomerExportColumn[]>([])
  const [selectedColumns, setSelectedColumns] = useState<string[]>([])
  const [columnsLoading, setColumnsLoading] = useState(true)
  const [columnsError, setColumnsError] = useState("")
  const [dateMode, setDateMode] = useState("all")
  const loadColumns = useCallback(async () => {
    setColumnsLoading(true)
    setColumnsError("")
    try {
      const [result, saved] = await Promise.all([customerApi.exportOptions(), customerApi.exportPreferences()])
      setColumns(result)
      setSelectedColumns(result.filter(column => column.default).map(column => column.key))
      setFilters(current => ({ ...current, ...saved }))
      setDateMode(saved.date_from || saved.date_to ? 'custom' : 'all')
    } catch (failure) {
      setColumnsError(failure instanceof Error ? failure.message : "导出信息加载失败")
    } finally { setColumnsLoading(false) }
  }, [])
  useEffect(() => { void loadColumns() }, [loadColumns])
  const columnGroups = [...new Set(columns.map(column => column.group))]
  const update = (value: Partial<CustomerExportParams>) => {
    setFilters(current => ({ ...current, ...value }))
    setError("")
  }
  const handleExport = async () => {
    if (exporting) return
    if (columnsLoading || columnsError) return
    if (!selectedColumns.length) { setError("请至少勾选一项导出信息"); return }
    if (dateMode !== "all" && (!filters.date_from || !filters.date_to)) {
      setError("请选择完整的引流日期范围")
      return
    }
    if (filters.date_from && filters.date_to && filters.date_from > filters.date_to) {
      setError("引流开始日期不能晚于结束日期")
      return
    }
    setExporting(true)
    setError("")
    try {
      const { blob, filename } = await customerApi.export({ ...filters, columns: columns.filter(column => selectedColumns.includes(column.key)).map(column => column.key) })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = filename
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
      onClose()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "导出失败，请重试")
    } finally {
      setExporting(false)
    }
  }

  return <Dialog open onOpenChange={open => { if (!open && !exporting) onClose() }}>
    <DialogContent className="flex w-[580px] max-w-[92vw] max-h-[90vh] flex-col gap-0 overflow-hidden p-0" initialFocus={false}>
      <div className="shrink-0 border-b border-[#f0f0f0] bg-white px-5 py-3">
        <DialogTitle className="text-[14px] font-medium">导出客户资料</DialogTitle>
        <DialogDescription className="mt-1 text-[12px] text-[#8f959e]">按以下条件导出全部匹配客户；可多选，未选表示全部。</DialogDescription>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <fieldset disabled={exporting} className="min-w-0 space-y-4 px-5 py-4">
        <CustomerExportDate key={columnsLoading ? 'loading' : 'ready'} initialMode={dateMode === 'all' ? 'all' : 'custom'} value={{ date_from: filters.date_from || "", date_to: filters.date_to || "" }} onChange={update} onModeChange={setDateMode} />
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          {([
            ["member_types", "会员身份"], ["card_statuses", "卡次状态"],
            ["service_teachers", "Sales"], ["referrers", "引流人"],
            ["referrer_handlers", "承接人"],
          ] as const).map(([key, label]) => <div key={key} className="min-w-0 space-y-1.5">
            <div className="text-[12px] text-[#646a73]">{label}</div>
            <SelectDropdown multi value={filters[key]} options={names([...options[key], ...filters[key]]).map(name => ({ value: name, label: name }))}
              onChange={value => update({ [key]: value })} placeholder={`全部${label}`} clearable
              className="w-full" buttonClassName="!min-h-8 !text-[12px]" singleLineMulti />
          </div>)}
        </div>
        <div className="space-y-2 border-t border-[#eef0f2] pt-3">
          <div className="flex items-center gap-2 text-[12px]">
            <span className="font-medium text-[#4e535a]">导出内容</span>
            <span className="text-[#8f959e]">已选 {selectedColumns.length} 项</span>
            <button type="button" className="ml-auto text-[#646a73] hover:text-[#212631]" disabled={columnsLoading} onClick={() => setSelectedColumns(columns.map(column => column.key))}>全选</button>
            <button type="button" className="text-[#646a73] hover:text-[#212631]" onClick={() => setSelectedColumns([])}>清空</button>
          </div>
          {columnsLoading && <p className="text-[12px] text-[#8f959e]">加载中…</p>}
          {columnsError && <p role="alert" className="text-[12px] text-[#f54a45]">{columnsError}<button type="button" className="ml-2 underline" onClick={() => void loadColumns()}>重试</button></p>}
          {columnGroups.map(group => <details key={group} open={group === "基础资料" ? true : undefined} className="rounded-[4px] border border-[#e8eaed] px-3">
            <summary className="cursor-pointer py-2 text-[12px] text-[#646a73]">{group}<span className="ml-2 text-[#a8b1bd]">{columns.filter(column => column.group === group && selectedColumns.includes(column.key)).length}/{columns.filter(column => column.group === group).length}</span>
              <span className="float-right inline-flex gap-3">
                <button type="button" aria-label={`${group}全选`} onClick={event => {
                  event.preventDefault(); event.stopPropagation()
                  setSelectedColumns(current => [...new Set([...current, ...columns.filter(column => column.group === group).map(column => column.key)])])
                }}>全选</button>
                <button type="button" aria-label={`${group}清空`} onClick={event => {
                  event.preventDefault(); event.stopPropagation()
                  const keys = new Set(columns.filter(column => column.group === group).map(column => column.key))
                  setSelectedColumns(current => current.filter(key => !keys.has(key)))
                }}>清空</button>
              </span>
            </summary>
            <div className="grid grid-cols-3 gap-x-3 gap-y-2 pb-3">
              {columns.filter(column => column.group === group).map(column => <label key={column.key} className="flex cursor-pointer items-start gap-1.5 text-[12px] text-[#4e535a]">
                <input type="checkbox" className="mt-0.5 accent-[#3370ff]" checked={selectedColumns.includes(column.key)} onChange={event => setSelectedColumns(current => event.target.checked ? [...current, column.key] : current.filter(key => key !== column.key))} />
                <span>{column.label}</span>
              </label>)}
            </div>
          </details>)}
        </div>
        {error && <p role="alert" className="text-[12px] text-[#f54a45]">{error}</p>}
      </fieldset>
      </div>
      <div className="flex shrink-0 justify-end gap-2 border-t border-[#f0f0f0] bg-white px-5 py-3">
        <Button variant="outline" size="sm" className="h-8 text-[12px]" disabled={exporting} onClick={onClose}>取消</Button>
        <Button size="sm" className="h-8 bg-[#212631] text-[12px] text-white hover:bg-[#303641]" disabled={exporting || columnsLoading || !!columnsError || !selectedColumns.length} onClick={handleExport}>{exporting ? "导出中…" : "导出 Excel"}</Button>
      </div>
    </DialogContent>
  </Dialog>
}
