import { useEffect, useRef, useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SelectDropdown } from "@/components/select-dropdown"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { upsellConfigApi, type PurchaseRule, type PurchaseRuleKey } from "@/lib/api"

const RULES: { key: PurchaseRuleKey; name: string }[] = [
  { key: "experience", name: "体验" }, { key: "conversion", name: "转化" },
  { key: "upsell", name: "升单" }, { key: "repurchase", name: "复购" },
]
type PriorMode = "any" | "first" | "specific"

function priorModeOf(condition: PurchaseRule["conditions"][number]): PriorMode {
  if (condition.first_purchase) return "first"
  return condition.previous_products?.length ? "specific" : "any"
}

export default function UpsellConfigPage() {
  const [rules, setRules] = useState<PurchaseRule[]>(RULES.map(rule => ({ key: rule.key, conditions: [] })))
  const [recommended, setRecommended] = useState<PurchaseRule[]>([])
  const [products, setProducts] = useState<{ key: string; label: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [configured, setConfigured] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [priorModeOverrides, setPriorModeOverrides] = useState<Record<string, PriorMode>>({})
  const [previewRows, setPreviewRows] = useState<{ journey: string; classification: string }[]>([])
  const [previewing, setPreviewing] = useState(false)
  const previewRevision = useRef(0)

  const clearPreview = () => {
    previewRevision.current += 1
    setPreviewRows([]); setPreviewing(false)
  }

  useEffect(() => {
    let current = true
    upsellConfigApi.get().then(data => {
      if (!current) return
      setRules(data.rules); setRecommended(data.recommended_rules || []); setProducts(data.products); setConfigured(data.configured); setLoaded(true)
    }).catch(error => { if (current) setError(error instanceof Error ? error.message : "加载失败") })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false; previewRevision.current += 1 }
  }, [])

  const update = (key: PurchaseRuleKey, conditions: PurchaseRule["conditions"]) => {
    clearPreview()
    setRules(current => current.map(rule => rule.key === key ? { ...rule, conditions } : rule))
    setDirty(true); setMessage(""); setError("")
  }
  const updateStage = (key: PurchaseRuleKey, patch: Partial<PurchaseRule>) => {
    clearPreview()
    setRules(current => current.map(rule => rule.key === key ? { ...rule, ...patch } : rule))
    setDirty(true); setMessage(""); setError("")
  }
  const removeCondition = (key: PurchaseRuleKey, index: number, conditions: PurchaseRule["conditions"]) => {
    setPriorModeOverrides(current => {
      const next = { ...current }
      for (let position = index; position < conditions.length; position += 1) {
        const target = `${key}:${position}`
        const following = current[`${key}:${position + 1}`]
        if (following) next[target] = following
        else delete next[target]
      }
      return next
    })
    update(key, conditions.filter((_, itemIndex) => itemIndex !== index))
  }
  const validate = () => {
    if (rules.some(rule => rule.conditions.some(condition => condition.first_purchase && condition.count !== 1))) {
      setError("客户首次购买只能是第 1 笔"); return false
    }
    if (rules.some(rule => rule.conditions.some((condition, index) =>
      (priorModeOverrides[`${rule.key}:${index}`] ?? priorModeOf(condition)) === "specific" && !condition.previous_products?.length
    ))) {
      setError("请选择客户之前买过的项目"); return false
    }
    if (rules.some(rule => rule.conditions.some(condition => (!condition.product && !condition.products?.length) || !Number.isInteger(condition.count) || condition.count < 1))) {
      setError("请为每条条件选择付费项目，并填写大于零的整数购买笔数"); return false
    }
    if (rules.some(rule => rule.conditions.some(condition => condition.previous_products?.some(product => condition.excluded_previous_products?.includes(product))))) {
      setError("同一项目不能同时选在之前买过和之前没买过中"); return false
    }
    return true
  }
  const preview = async () => {
    if (!validate()) return
    const revision = ++previewRevision.current
    setPreviewing(true); setError("")
    try {
      const data = await upsellConfigApi.previewRules(rules)
      if (revision === previewRevision.current) setPreviewRows(data.items)
    } catch (error) {
      if (revision === previewRevision.current) setError(error instanceof Error ? error.message : "预览失败")
    } finally {
      if (revision === previewRevision.current) setPreviewing(false)
    }
  }
  const save = async () => {
    if (!validate()) return
    setSaving(true); setError(""); setMessage("")
    try {
      const data = await upsellConfigApi.saveRules(rules)
      setRules(data.rules); setPriorModeOverrides({}); setConfigured(true); setDirty(false); setMessage("已保存，历史统计也将按新规则重新计算")
    } catch (error) { setError(error instanceof Error ? error.message : "保存失败") }
    finally { setSaving(false) }
  }

  return <div className="min-h-full space-y-3 bg-[#f4f5f6] p-4 pb-6">
    <div className="flex min-h-[52px] items-center justify-between rounded-xl bg-white px-5 py-3">
      <div className="flex items-center gap-3"><h1 className="text-[14px] text-[#2b2f36]">升单配置</h1><span className="text-[12px] text-[#8f959e]">体验 · 转化 · 升单 · 复购</span></div>
      <div className="flex flex-wrap items-center gap-2"><Button size="sm" variant="outline" disabled={!loaded || saving || !recommended.length} onClick={() => { clearPreview(); setRules(structuredClone(recommended)); setPriorModeOverrides({}); setDirty(true); setError(""); setMessage("已填入：首次购买体验会员或大单算转化，之后购买大单算升单，再购买大单算复购。保存后生效。") }} className="h-8 rounded-[4px] text-[12px] font-normal">填入业务方案</Button>
      <Button size="sm" variant="outline" disabled={!loaded || saving || previewing} onClick={() => previewRows.length ? clearPreview() : void preview()} className="h-8 rounded-[4px] text-[12px] font-normal">{previewing ? "预览中…" : previewRows.length ? "收起示例" : "查看示例"}</Button>
      <Button size="sm" onClick={save} disabled={!loaded || saving || !dirty} className="h-8 rounded-[4px] px-4 text-[12px] font-normal">{saving ? "保存中…" : "保存规则"}</Button></div>
    </div>
    <div className="rounded-xl bg-white px-5 py-4">
      <p className="text-[12px] leading-5 text-[#646a73]">同类条件满足任意一条即可。业务方案按体验 → 转化 → 升单 → 复购递进，一笔成交只计一个阶段；同一用户在周期内可计入多个阶段。</p>
      <p className="mt-1 text-[12px] text-[#646a73]">保存后，历史统计也会按新规则重新计算。</p>
      {!configured && loaded && <p className="mt-2 text-[12px] leading-6 text-[#a18452]">新规则尚未配置，当前统计暂沿用旧档位。填写并保存后启用四类规则，旧配置保留备份，不自动套用。</p>}
      {error && <p role="alert" className="mt-2 text-[12px] text-[#c45b60]">{error}</p>}
      {message && <p role="status" className="mt-2 text-[12px] text-[#588b70]">{message}</p>}
    </div>
    {previewRows.length > 0 && <div className="rounded-xl bg-white px-5 py-4">
      <div className="mb-2 text-[13px] font-medium text-[#2b2f36]">示例结果<span className="ml-2 text-[12px] font-normal text-[#8f959e]">按当前填写规则，显示最后一笔的分类</span></div>
      <Table><TableHeader><TableRow><TableHead>购买顺序</TableHead><TableHead>最后一笔</TableHead></TableRow></TableHeader><TableBody>{previewRows.map(row => <TableRow key={row.journey}><TableCell>{row.journey}</TableCell><TableCell>{row.classification}</TableCell></TableRow>)}</TableBody></Table>
    </div>}
    {loading ? <div className="py-10 text-center text-[12px] text-[#8f959e]">加载中…</div> : RULES.map(({ key, name }) => {
      const rule = rules.find(rule => rule.key === key)!
      return <section key={key} className="overflow-hidden rounded-xl bg-white">
        <div className="flex h-12 items-center justify-between border-b border-[#f0f0f0] px-5">
          <div className="flex items-center gap-2.5"><h2 className="text-[13px] font-medium text-[#2b2f36]">{name}</h2><span className="text-[11px] text-[#a0a7af]">{rule.conditions.length ? `${rule.conditions.length} 条条件 · 任意满足` : "未配置"}</span></div>
          <button type="button" disabled={!loaded || saving} onClick={() => update(key, [...rule.conditions, { product: "", operator: "eq", count: key === "repurchase" ? 2 : 1 }])} className="inline-flex items-center gap-1 text-[12px] text-[#3370ff] disabled:opacity-40"><Plus className="h-3.5 w-3.5" />添加条件</button>
        </div>
        <div className="px-5 py-3">
          <div className="mb-3 flex flex-wrap items-center gap-3 text-[12px] text-[#646a73]">
            <span>此前已完成</span>
            <div className="w-[160px]"><SelectDropdown size="sm" value={rule.previous_stage || ""} disabled={saving} options={[{ value: "", label: "不要求" }, ...RULES.slice(0, RULES.findIndex(item => item.key === key)).map(item => ({ value: item.key, label: item.name }))]} onChange={value => updateStage(key, { previous_stage: value as PurchaseRule["previous_stage"] })} /></div>
            <label className="flex items-center gap-2"><input type="checkbox" checked={!!rule.once} disabled={saving} onChange={event => updateStage(key, { once: event.target.checked })} />仅首次达成时计入</label>
            {rule.previous_stage && <span>须在此前另一笔成交中完成，本笔不能连续跳级</span>}
          </div>
          {!rule.conditions.length && <div className="py-2 text-[12px] text-[#a0a7af]">添加付费项目与购买次数条件；留空则不统计此类。</div>}
          <div className="space-y-3">{rule.conditions.map((condition, index) => {
            const change = (patch: Partial<typeof condition>) => update(key, rule.conditions.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item))
            const priorModeKey = `${key}:${index}`
            const priorMode = priorModeOverrides[priorModeKey] ?? priorModeOf(condition)
            const countScope = condition.count_scope || "subtype"
            const setPriorMode = (mode: PriorMode) => {
              setPriorModeOverrides(current => ({ ...current, [priorModeKey]: mode }))
              change({ first_purchase: mode === "first", previous_products: mode === "specific" ? condition.previous_products || [] : [], ...(mode === "first" ? { count: 1, operator: "eq", excluded_previous_products: [] } : {}) })
            }
            return <div key={index} className="space-y-4 rounded-[4px] border border-[#e8eaed] p-4">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-medium text-[#2b2f36]">{index ? `或者符合条件 ${index + 1}` : "符合以下条件"}</span>
                <button type="button" disabled={saving} onClick={() => removeCondition(key, index, rule.conditions)} aria-label={`删除${name}条件${index + 1}`} className="p-1 text-[#a0a7af] hover:text-[#c45b60]"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-2">
                  <div className="text-[12px] text-[#4e535a]">之前买过</div>
                  <div className="flex flex-wrap gap-2">
                    {([
                      { value: "any", label: "不要求" },
                      { value: "first", label: "从未购买" },
                      { value: "specific", label: "买过指定项目" },
                    ] as const).map(option => <button key={option.value} type="button" aria-pressed={priorMode === option.value} disabled={saving} onClick={() => setPriorMode(option.value)} className={`h-8 rounded-[4px] border px-3 text-[12px] disabled:opacity-50 ${priorMode === option.value ? "border-[#3370ff] bg-[#f0f5ff] text-[#3370ff]" : "border-[#dee0e3] bg-white text-[#4e535a]"}`}>{option.label}</button>)}
                  </div>
                  {priorMode === "specific" && <SelectDropdown size="sm" multi value={condition.previous_products || []} options={products.map(item => ({ value: item.key, label: item.label }))} onChange={previous_products => change({ previous_products })} placeholder="之前买过任意一项即可" disabled={saving} buttonClassName="!h-auto min-h-8" />}
                  {priorMode === "first" && <p className="text-[12px] text-[#646a73]">以前任何项目都没买过</p>}
                </div>
                <div className="space-y-2">
                  <div className="text-[12px] text-[#4e535a]">之前没买</div>
                  {priorMode === "first" ? <div className="py-2 text-[12px] text-[#646a73]">全部项目均未购买</div> : <SelectDropdown size="sm" multi value={condition.excluded_previous_products || []} options={products.map(item => ({ value: item.key, label: item.label }))} onChange={excluded_previous_products => change({ excluded_previous_products })} placeholder="可选：这些项目以前一项都没买过" disabled={saving} buttonClassName="!h-auto min-h-8" />}
                </div>
              </div>

              <div className="grid gap-4 border-t border-[#f0f0f0] pt-3 lg:grid-cols-2">
                <div className="space-y-2">
                  <div className="text-[12px] text-[#4e535a]">本次购买</div>
                  <SelectDropdown size="sm" buttonClassName="!h-auto min-h-8" multi value={condition.products || (condition.product ? [condition.product] : [])} options={products.map(item => ({ value: item.key, label: item.label }))} onChange={selected => change({ product: undefined, products: selected })} placeholder="选择付费项目或卡种" disabled={saving} />
                </div>
                <div className="space-y-2">
                  <div className="text-[12px] text-[#4e535a]">累计范围</div>
                  {priorMode === "first"
                    ? <div className="flex min-h-[48px] items-center rounded-[4px] bg-[#f7f8fa] px-3 text-[12px] text-[#646a73]">首次购买只算第 1 笔，无需选择</div>
                    : <div className="grid grid-cols-2 gap-2">
                        {([
                          { value: "subtype", label: "每种单算", hint: "每种卡或具体项目各从第 1 笔起算" },
                          { value: "group", label: "所选合算", hint: "所选项目放在一起，第 1、2 笔依次算" },
                        ] as const).map(option => <button key={option.value} type="button" aria-pressed={countScope === option.value} disabled={saving} onClick={() => change({ count_scope: option.value })} className={`rounded-[4px] border px-2 py-1.5 text-left disabled:opacity-50 ${countScope === option.value ? "border-[#3370ff] bg-[#f0f5ff]" : "border-[#dee0e3] bg-white"}`}>
                          <span className={`block text-[12px] ${countScope === option.value ? "text-[#3370ff]" : "text-[#2b2f36]"}`}>{option.label}</span>
                          <span className="block text-[11px] text-[#8f959e]">{option.hint}</span>
                        </button>)}
                      </div>}
                </div>
              </div>

              {priorMode !== "first" && <div className="flex flex-wrap items-center gap-2 text-[12px] text-[#4e535a]">
                    <span>买到第</span>
                    <Input aria-label={`${name}条件${index + 1}购买笔数`} type="number" min="1" max="100000" value={condition.count || ""} disabled={saving} onChange={event => change({ count: Number(event.target.value) })} className="h-8 w-[76px] text-[12px]" />
                    <span>笔购买</span>
                    <div className="w-[160px]"><SelectDropdown size="sm" value={condition.operator} options={[{ value: "eq", label: "只算这一笔" }, { value: "gte", label: "从这次起都算" }]} disabled={saving} onChange={operator => change({ operator: operator as "eq" | "gte" })} /></div>
                  </div>}

              <div className="rounded-[4px] bg-[#f7f8fa] px-3 py-2 text-[12px] text-[#4e535a]">
                {priorMode === "first"
                  ? `这条规则：客户第一次购买，买的是所选项目，就计入${name}。`
                  : `所选项目${countScope === "group" ? "一起" : "每种单独"}算，第 ${condition.count || "?"} 笔${condition.operator === "gte" ? "起" : "购买"}，${priorMode === "specific" ? "之前买过任意一项指定项目，" : ""}${condition.excluded_previous_products?.length ? "且未买过排除项目，" : ""}计入${name}。`}
              </div>
            </div>
          })}</div>
        </div>
      </section>
    })}
  </div>
}
