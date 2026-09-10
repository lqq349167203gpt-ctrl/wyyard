import { useEffect, useRef, useState } from "react"
import { Download, Plus, Save, Trash2, X } from "lucide-react"
import { principalApi, type ConversionAction, type ConversionRule, type PrincipalMetadata, type PrincipalQuery, type PrincipalResult, type PrincipalRow, type SavedConversionRule } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import { SelectDropdown } from "@/components/select-dropdown"
import { EmptyValue } from "@/components/empty-value"
import { PaginationBar } from "@/components/pagination-bar"
import { useServerPagination } from "@/hooks/use-server-pagination"

const INITIAL_RULE: ConversionRule = {
  name: "粗门初次到场 → 会员卡首购",
  source: { kind: "coarse_usage", product: "", subtype: "", occurrence: "first" },
  targets: [{ kind: "purchase", product: "membership", subtype: "", occurrence: "first" }],
  target_mode: "any", window_days: 30, same_organization: true,
}
const TABS = [{ key: "overview", label: "经营概况" }, { key: "courses", label: "课程记录" }, { key: "orders", label: "交易记录" }, { key: "conversion", label: "转化分析" }] as const
const KIND_OPTIONS = [
  { value: "coarse_usage", label: "粗门次卡实际到场" },
  { value: "attendance", label: "课程实际到场" },
  { value: "purchase", label: "购买付费项目" },
]
const OCCURRENCE_OPTIONS = [
  { value: "first", label: "首次" },
  { value: "any", label: "任意一次" },
  { value: "repeat", label: "再次（非首次日）" },
]
const TARGET_MODE_OPTIONS = [
  { value: "any", label: "满足任意目标" },
  { value: "all", label: "满足全部目标" },
]
const STATUS_FILTERS = [
  { value: "", label: "全部" },
  { value: "converted", label: "已转化" },
  { value: "unconverted", label: "未转化" },
  { value: "observing", label: "观察中" },
] as const
const ORDER_FILTER_OPTIONS = [
  { value: "", label: "全部购买类型" },
  { value: "first", label: "首购" },
  { value: "repeat", label: "同类复购" },
  { value: "cross", label: "跨品类首购" },
]
// 与课程记录页列宽对齐：课程名加宽截断，老师/案主/组织/部位数收窄
const COLUMN_WIDTH: Record<string, string> = {
  name: "w-[180px]",
  teachers: "w-[90px]",
  owner: "w-[70px]",
  organization: "w-[100px]",
  parts: "w-[64px]",
  type: "w-[90px]",
  date: "w-[100px]",
  hours: "w-[64px]",
  participants: "w-[88px]",
  new_count: "w-[80px]",
  old_count: "w-[80px]",
  order_count: "w-[100px]",
  customer: "w-[100px]",
  label: "w-[140px]",
  classification: "w-[120px]",
  closers: "w-[110px]",
  source: "w-[140px]",
  deadline: "w-[100px]",
  status_label: "w-[90px]",
  target_count: "w-[90px]",
  same_day: "w-[120px]",
}
const COLUMN_CELL: Record<string, string> = {
  name: "max-w-[180px] truncate font-medium text-[#2b2f36]",
  teachers: "max-w-[90px] truncate",
  owner: "max-w-[70px] truncate",
  organization: "max-w-[100px] truncate",
  label: "max-w-[140px] truncate",
  source: "max-w-[140px] truncate",
  closers: "max-w-[110px] truncate",
}
const NUMBER_COLUMNS = new Set(["hours", "parts", "participants", "new_count", "old_count", "order_count", "target_count"])

function ActionEditor({ value, onChange, metadata }: { value: ConversionAction; onChange: (value: ConversionAction) => void; metadata: PrincipalMetadata }) {
  const options = value.kind === "purchase" ? metadata.products : value.kind === "attendance" ? metadata.activity_types : []
  const subtypes = options.find(item => item.key === value.product)?.subtypes || []
  const btn = "!h-7 !rounded-[4px] !border !border-[#e1e4e7] !bg-white !px-2 !text-[12px] !shadow-none"
  return <div className="flex min-w-0 flex-wrap items-center gap-1.5 rounded-[4px] border border-[#eceef0] bg-[#fbfcfd] px-2 py-1.5">
    <SelectDropdown
      size="sm"
      className="w-[168px] shrink-0"
      value={value.kind}
      options={KIND_OPTIONS}
      onChange={kind => onChange({ ...value, kind: kind as ConversionAction["kind"], product: "", subtype: "" })}
      buttonClassName={btn}
    />
    {options.length > 0 && <SelectDropdown
      size="sm"
      className="w-[140px] shrink-0"
      value={value.product}
      options={[{ value: "", label: "全部类型" }, ...options.map(item => ({ value: item.key, label: item.label }))]}
      onChange={product => onChange({ ...value, product, subtype: "" })}
      buttonClassName={btn}
    />}
    {subtypes.length > 0 && <SelectDropdown
      size="sm"
      className="w-[140px] shrink-0"
      value={value.subtype}
      options={[{ value: "", label: "全部具体产品" }, ...subtypes.map(name => ({ value: name, label: name }))]}
      onChange={subtype => onChange({ ...value, subtype })}
      buttonClassName={btn}
    />}
    <SelectDropdown
      size="sm"
      className="w-[140px] shrink-0"
      value={value.occurrence}
      options={OCCURRENCE_OPTIONS}
      onChange={occurrence => onChange({ ...value, occurrence: occurrence as ConversionAction["occurrence"] })}
      buttonClassName={btn}
    />
  </div>
}

export default function PrincipalPage() {
  const [metadata, setMetadata] = useState<PrincipalMetadata | null>(null)
  const [rules, setRules] = useState<SavedConversionRule[]>([])
  const [ruleId, setRuleId] = useState("")
  const [query, setQuery] = useState<PrincipalQuery>({ organization_id: "", date_from: null, date_to: null, tab: "overview", product: "", order_filter: "", status: "", rule: INITIAL_RULE })
  const [result, setResult] = useState<PrincipalResult | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [detail, setDetail] = useState<PrincipalRow | null>(null)
  const version = useRef(0)
  const pagination = useServerPagination<PrincipalRow>(async (page, size) => {
    const current = ++version.current
    const response = await principalApi.query(query, page, size)
    if (current === version.current) setResult(response)
    return response
  }, { pageSize: 20 })
  useEffect(() => {
    Promise.all([principalApi.metadata(), principalApi.rules()]).then(([meta, saved]) => { setMetadata(meta); setRules(saved) }).catch(e => setError(e.message))
  }, [])
  useEffect(() => { version.current++; setResult(null); setDetail(null); pagination.resetPage() }, [query, pagination.resetPage])
  const update = (data: Partial<PrincipalQuery>) => setQuery(previous => ({ ...previous, ...data, ...(data.tab ? { product: "" } : {}) }))
  const updateRule = (patch: Partial<ConversionRule>) => setQuery(previous => ({ ...previous, rule: { ...previous.rule, ...patch } }))
  async function saveRule(asNew: boolean) {
    const rule = query.rule
    if (!rule.name.trim() || !Number.isInteger(rule.window_days) || rule.window_days < 0 || rule.window_days > 3650) { setError("请填写规则名称，观察天数应为 0～3650 的整数"); return }
    setBusy(true); setError("")
    try {
      const saved = await principalApi.saveRule(rule, asNew ? undefined : ruleId || undefined)
      setRules(await principalApi.rules()); setRuleId(saved.id); update({ rule: saved.rule })
    } catch (e) { setError(e instanceof Error ? e.message : "保存失败") } finally { setBusy(false) }
  }
  async function removeRule() {
    if (!ruleId || !window.confirm("删除这条已保存的转化规则？业务记录不会被删除。")) return
    setBusy(true)
    try { await principalApi.deleteRule(ruleId); setRules(await principalApi.rules()); setRuleId(""); update({ rule: INITIAL_RULE }) }
    catch (e) { setError(e instanceof Error ? e.message : "删除失败") } finally { setBusy(false) }
  }
  async function download() {
    setBusy(true); setError("")
    try { const blob = await principalApi.download(query); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "主理人.xlsx"; link.click(); URL.revokeObjectURL(url) }
    catch (e) { setError(e instanceof Error ? e.message : "导出失败") } finally { setBusy(false) }
  }
  const visibleTabs = TABS.filter(t => metadata?.transaction_access === "detail" || !["orders", "conversion"].includes(t.key))
  return (
    <div className="min-h-full bg-[#f7f8fa] px-2.5 pb-6 pt-2.5">
      <section className="mb-1.5 rounded-[4px] bg-white px-[22px] py-4">
        <h1 className="mb-4 text-lg font-medium text-[#1f2329]">主理人</h1>

        <div className="flex flex-wrap items-center gap-3">
          <SelectDropdown
            size="sm"
            className="w-[160px]"
            value={query.organization_id}
            options={[{ value: "", label: "全部可见组织" }, ...(metadata?.organizations || []).map(org => ({ value: org.id, label: org.name }))]}
            onChange={organization_id => update({ organization_id })}
            buttonClassName="border-[#dee0e3] bg-white"
          />
          <div className="flex h-7 items-center rounded-[4px] border border-[#dee0e3] bg-white">
            <input aria-label="开始日期" type="date" className="w-[112px] bg-transparent px-2 text-[12px] text-[#2b2f36] outline-none" value={query.date_from || ""} onChange={e => update({ date_from: e.target.value || null })} />
            <span className="text-[12px] text-[#8f959e]">~</span>
            <input aria-label="结束日期" type="date" className="w-[112px] bg-transparent px-2 text-[12px] text-[#2b2f36] outline-none" value={query.date_to || ""} onChange={e => update({ date_to: e.target.value || null })} />
          </div>
          <Button variant="ghost" size="sm" className="h-7 px-3 text-[12px] font-normal text-[#4e535a]" onClick={() => update({ date_from: null, date_to: null })}>全部日期</Button>
          {(query.tab === "overview" || query.tab === "orders") && (
            <SelectDropdown
              size="sm"
              className="w-[150px]"
              value={query.product}
              options={[
                { value: "", label: "全部成交产品" },
                ...(metadata?.products || []).map(p => ({ value: p.key, label: p.label })),
                ...(query.tab === "orders" ? [{ value: "coarse", label: "粗门次卡扣卡" }] : []),
              ]}
              onChange={product => update({ product })}
              buttonClassName="border-[#dee0e3] bg-white"
            />
          )}
          {query.tab === "orders" && (
            <SelectDropdown
              size="sm"
              className="w-[140px]"
              value={query.order_filter}
              options={ORDER_FILTER_OPTIONS}
              onChange={order_filter => update({ order_filter: order_filter as PrincipalQuery["order_filter"] })}
              buttonClassName="border-[#dee0e3] bg-white"
            />
          )}
        </div>

        <div className="mt-4 flex items-center gap-5 border-b border-[#e8e8e8]">
          {visibleTabs.map(tab => (
            <button
              key={tab.key}
              className={`relative pb-2 text-[14px] transition-colors ${query.tab === tab.key ? "text-[#3370ff]" : "text-[#2b2f36]"}`}
              onClick={() => update({ tab: tab.key })}
            >
              {tab.label}
              {query.tab === tab.key && <span className="absolute -bottom-px left-0 right-0 h-[2px] rounded-t-sm bg-[#3370ff]" />}
            </button>
          ))}
        </div>

        {query.tab === "conversion" && metadata && (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12px] font-medium text-[#3370ff]">① 转化规则</span>
              <span className="text-[11px] text-[#8f959e]">改完立刻重算；要长期使用再点保存</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-[4px] bg-[#f7f8fa] px-2.5 py-2">
              <span className="mr-1 min-w-[56px] text-[12px] font-medium text-[#4e535a]">已保存</span>
              <SelectDropdown
                size="sm"
                className="w-[220px]"
                value={ruleId}
                options={[
                  { value: "", label: "未保存规则（临时）" },
                  ...rules.map(r => ({ value: r.id, label: r.rule.name })),
                ]}
                onChange={value => { const rule = rules.find(r => r.id === value); setRuleId(value); update({ rule: rule?.rule ? structuredClone(rule.rule) : INITIAL_RULE }) }}
                buttonClassName="!h-7 !rounded-[4px] !border !border-[#e1e4e7] !bg-white !px-2 !text-[12px] !shadow-none"
                placeholder="选择已保存规则"
              />
              <button type="button" disabled={busy} onClick={() => saveRule(false)} className="flex h-7 items-center rounded-[3px] px-2 text-[12px] text-[#3370ff] hover:bg-[#f0f5ff]">
                <Save className="mr-1 h-3.5 w-3.5" />保存
              </button>
              <button type="button" disabled={busy} onClick={() => saveRule(true)} className="flex h-7 items-center rounded-[3px] px-2 text-[12px] text-[#3370ff] hover:bg-[#f0f5ff]">
                <Plus className="mr-1 h-3.5 w-3.5" />另存为新规则
              </button>
              {ruleId && (
                <button type="button" disabled={busy} onClick={removeRule} className="flex h-7 items-center rounded-[3px] px-2 text-[12px] text-[#b0b5bb] hover:bg-[#fff4f4] hover:text-[#d85b65]">
                  <Trash2 className="mr-1 h-3.5 w-3.5" />删除
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="w-[42px] shrink-0 text-[11px] font-medium text-[#4e535a]">名称</span>
              <Input
                className="h-7 w-[240px] rounded-[4px] border-[#e1e4e7] bg-white px-2 text-[12px]"
                value={query.rule.name}
                maxLength={80}
                onChange={e => updateRule({ name: e.target.value })}
                placeholder="给这条规则起个名字"
              />
            </div>

            <div className="space-y-1">
              <div className="flex min-w-0 items-center gap-2">
                <span className="w-[42px] shrink-0 text-[11px] font-medium text-[#3370ff]">起点</span>
                <div className="min-w-0 flex-1">
                  {metadata && <ActionEditor metadata={metadata} value={query.rule.source} onChange={source => updateRule({ source })} />}
                </div>
              </div>
              {query.rule.targets.map((target, index) => (
                <div key={index} className="flex min-w-0 items-center gap-2">
                  <span className="w-[42px] shrink-0 text-[11px] font-medium text-[#4e535a]">目标{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <ActionEditor
                      metadata={metadata}
                      value={target}
                      onChange={action => updateRule({ targets: query.rule.targets.map((item, i) => i === index ? action : item) })}
                    />
                  </div>
                  {query.rule.targets.length > 1 && (
                    <button
                      type="button"
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[3px] text-[#b0b5bb] hover:bg-[#f0f1f3] hover:text-[#4e535a]"
                      aria-label="移除目标"
                      onClick={() => updateRule({ targets: query.rule.targets.filter((_, i) => i !== index) })}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                disabled={query.rule.targets.length >= 8}
                onClick={() => updateRule({ targets: [...query.rule.targets, { kind: "purchase", product: "", subtype: "", occurrence: "any" }] })}
                className="ml-[42px] flex h-7 items-center rounded-[3px] px-1.5 text-[12px] text-[#3370ff] hover:bg-[#f0f5ff] disabled:opacity-40"
              >
                <Plus className="mr-0.5 h-3.5 w-3.5" />加目标
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 rounded-[4px] bg-[#f7f8fa] px-2.5 py-2">
              <span className="mr-1 text-[11px] font-medium text-[#4e535a]">口径</span>
              <SelectDropdown
                size="sm"
                className="w-[140px]"
                value={query.rule.target_mode}
                options={TARGET_MODE_OPTIONS}
                onChange={target_mode => updateRule({ target_mode: target_mode as "any" | "all" })}
                buttonClassName="!h-7 !rounded-[4px] !border !border-[#e1e4e7] !bg-white !px-2 !text-[12px] !shadow-none"
              />
              <span className="text-[12px] text-[#4e535a]">观察天数</span>
              <Input
                type="number"
                min={0}
                max={3650}
                className="h-7 w-20 rounded-[4px] border-[#e1e4e7] bg-white px-2 text-[12px]"
                value={query.rule.window_days}
                onChange={e => updateRule({ window_days: Number(e.target.value) })}
              />
              <label className="flex items-center gap-1.5 text-[12px] text-[#4e535a]">
                <input
                  type="checkbox"
                  checked={query.rule.same_organization}
                  onChange={e => updateRule({ same_organization: e.target.checked })}
                />
                限同一组织
              </label>
            </div>
            <p className="text-[11px] leading-5 text-[#8f959e]">
              按人数去重，每人只取区间内第一个起点；目标可发生在筛选结束日期之后。当天完成不代表因果。0 天表示当天。
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12px] font-medium text-[#4e535a]">② 结果状态</span>
              <div className="flex items-center rounded-[4px] border border-[#e1e4e7] bg-white p-0.5">
                {STATUS_FILTERS.map(item => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => update({ status: item.value as PrincipalQuery["status"] })}
                    className={`h-6 rounded-[3px] px-2.5 text-[11px] ${query.status === item.value ? "bg-[#f0f5ff] text-[#3370ff]" : "text-[#646a73]"}`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <span className="text-[11px] text-[#8f959e]">可只看已转化 / 未转化 / 观察中</span>
            </div>
          </div>
        )}
      </section>

      {(error || pagination.error) && (
        <div className="mb-1.5 rounded-[4px] bg-white px-[22px] py-3">
          <p role="alert" className="text-[13px] text-destructive">{error || pagination.error}</p>
        </div>
      )}
      {metadata && !metadata.organizations.length && (
        <div className="mb-1.5 rounded-[4px] bg-white px-[22px] py-3">
          <p className="text-[13px] text-[#8f959e]">没有可查看的组织。请检查账号归属人与组织成员配置；同名归属人需先消除歧义。</p>
        </div>
      )}

      {!pagination.error && result && (
        <section className="mb-1.5 rounded-[4px] bg-white px-[22px] py-4">
          <div className="mb-3 text-[12px] font-medium text-[#4e535a]">经营概览</div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {Object.entries(result.summary).map(([label, value]) => (
              <div key={label} className="rounded-[2px] border border-[#e8eaed] bg-white px-3 py-2">
                <div className="mb-1 text-[12px] text-[#4e535a]">{label}</div>
                <span className="text-lg font-medium tabular-nums text-[#1f2329]">{value}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-[4px] bg-white px-[22px] py-4">
        <div className="mb-3 flex items-center justify-between gap-4">
          <div className="text-[12px] font-medium text-[#4e535a]">
            {query.tab === "overview" ? "课程列表" : query.tab === "courses" ? "课程列表" : query.tab === "orders" ? "交易列表" : query.tab === "conversion" ? "转化明细" : "数据列表"}
            {result && <span className="font-normal text-[#8f959e]">（{pagination.totalItems} 条）</span>}
          </div>
          <button
            type="button"
            onClick={download}
            disabled={busy || pagination.loading || !!pagination.error}
            className="flex h-7 items-center gap-1 rounded-[4px] border border-input px-3 text-[12px] text-[#4e535a] hover:bg-[#f5f6f7] disabled:cursor-not-allowed disabled:text-[#b7bdc6]"
          >
            <Download className="h-3.5 w-3.5" />
            {busy ? "导出中" : "导出"}
          </button>
        </div>

        {pagination.loading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">加载中…</div>
        ) : !pagination.error ? (
          <>
            <div className="overflow-x-auto">
            <Table className="w-full min-w-[880px] table-fixed">
              <TableHeader className="bg-[#fafafa] [&_tr]:border-[#f0f0f0]">
                <TableRow className="h-9 bg-[#fafafa] hover:bg-[#fafafa]">
                  {result?.columns.map((c, i) => (
                    <TableHead key={c.key} className={`h-9 px-3 text-[11px] font-normal ${i === 0 ? "pl-4" : ""} ${COLUMN_WIDTH[c.key] || ""} ${NUMBER_COLUMNS.has(c.key) ? "text-right" : ""}`}>{c.label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagination.paginatedItems.map(row => {
                  const hasDetails = row.details?.length > 0
                  return (
                  <TableRow key={row.id} className="group h-11 border-[#f0f0f0] text-[12px] last:border-b-0 hover:bg-[#f7f8fa]">
                    {result?.columns.map((c, i) => {
                      const isNumber = NUMBER_COLUMNS.has(c.key) || typeof row[c.key] === "number"
                      // 课时数不参与明细点击，避免误点
                      const clickable = hasDetails && isNumber && c.key !== "hours"
                      return (
                      <TableCell
                        key={c.key}
                        onClick={clickable ? () => setDetail(row) : undefined}
                        title={COLUMN_CELL[c.key] && String(row[c.key] ?? "") ? String(row[c.key]) : undefined}
                        className={`h-11 overflow-hidden px-3 py-0 text-[12px] ${i === 0 ? "pl-4" : ""} ${COLUMN_WIDTH[c.key] || ""} ${COLUMN_CELL[c.key] || ""} ${isNumber ? "text-right tabular-nums" : ""} ${clickable ? "cursor-pointer text-[#3370ff] hover:underline" : ""}`}
                      >
                        {String(row[c.key] ?? "") || <EmptyValue />}
                      </TableCell>
                      )
                    })}
                  </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            </div>
            {!pagination.paginatedItems.length && <div className="py-16 text-center text-sm text-muted-foreground">暂无符合条件的数据</div>}
            <PaginationBar currentPage={pagination.currentPage} totalPages={pagination.totalPages} totalItems={pagination.totalItems} startIndex={pagination.startIndex} endIndex={pagination.endIndex} onPageChange={pagination.goToPage} />
            {result?.notice && <p className="mt-3 text-[11.5px] leading-relaxed text-[#a0a6ad]">{result.notice}</p>}
          </>
        ) : null}
      </section>

    <Dialog open={!!detail} onOpenChange={open => { if (!open) setDetail(null) }}>
      <DialogContent initialFocus={false} className="max-h-[80vh] max-w-[680px] overflow-y-auto">
        <DialogHeader><DialogTitle className="text-[14px] font-normal">关联明细</DialogTitle></DialogHeader>
        {detail?.details.length ? detail.details.map((line, i) => <p key={i} className="whitespace-pre-wrap break-words text-[13px]">{line}</p>) : <p className="text-[13px] text-[#8f959e]">暂无关联明细</p>}
      </DialogContent>
    </Dialog>
    </div>
  )
}
