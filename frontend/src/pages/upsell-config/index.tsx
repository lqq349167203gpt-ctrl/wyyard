import { useEffect, useRef, useState } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SelectDropdown } from "@/components/select-dropdown"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { upsellConfigApi, type PurchaseRule, type PurchaseRuleKey } from "@/lib/api"

const RULES: { key: PurchaseRuleKey; name: string }[] = [
  { key: "experience", name: "体验" }, { key: "conversion", name: "转化" },
  { key: "assessment", name: "梳理" }, { key: "upsell", name: "升单" }, { key: "repurchase", name: "复购" },
]
type PriorMode = "any" | "first" | "specific"

function priorModeOf(condition: PurchaseRule["conditions"][number]): PriorMode {
  if (condition.first_purchase) return "first"
  return condition.previous_products?.length ? "specific" : "any"
}

export default function UpsellConfigPage() {
  const [rules, setRules] = useState<PurchaseRule[]>(RULES.map(rule => ({ key: rule.key, conditions: [] })))
  const [recommendedWarnings, setRecommendedWarnings] = useState<string[]>([])
  const [recommended, setRecommended] = useState<PurchaseRule[]>([])
  const [products, setProducts] = useState<{ key: string; label: string }[]>([])
  const [activities, setActivities] = useState<{ key: string; label: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [configured, setConfigured] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [warnings, setWarnings] = useState<string[]>([])
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
      setRules(RULES.map(rule => data.rules.find(item => item.key === rule.key) || { key: rule.key, conditions: [] })); setRecommended(data.recommended_rules || []); setRecommendedWarnings(data.recommended_warnings || []); setProducts(data.products); setActivities(data.activities || []); setWarnings(data.warnings || []); setConfigured(data.configured); setLoaded(true)
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
      setError("请为每条条件选择项目或课程，并填写大于零的整数次数"); return false
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
      setRules(data.rules); setWarnings(data.warnings || []); setPriorModeOverrides({}); setConfigured(true); setDirty(false); setMessage("已保存并生效。历史统计已切换；旧待办如提示规则变更，请重新核对。")
    } catch (error) { setError(error instanceof Error ? error.message : "保存失败") }
    finally { setSaving(false) }
  }

  return <div className="min-h-full bg-white px-6 py-3 pb-6">
    <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
      <div className="flex items-center gap-3"><h1 className="text-[14px] font-semibold text-[#1f2329]">升单配置</h1><span className="text-[12px] text-[#646a73]">{dirty ? "未保存" : configured ? "已生效" : "待配置"}</span></div>
      <div className="flex flex-wrap items-center gap-2"><Button size="sm" variant="outline" disabled={!loaded || saving || !recommended.length} onClick={() => { clearPreview(); setRules(structuredClone(recommended)); setPriorModeOverrides({}); setDirty(true); setError(""); setMessage(["已填入新方案，请保存生效。", ...recommendedWarnings].join(" ")) }} className="h-7 rounded-[4px] text-[12px] font-normal">填入业务方案</Button>
      <Button size="sm" variant="outline" disabled={!loaded || saving || previewing} onClick={() => previewRows.length ? clearPreview() : void preview()} className="h-7 rounded-[4px] text-[12px] font-normal">{previewing ? "预览中…" : previewRows.length ? "收起示例" : "查看示例"}</Button>
      <Button size="sm" onClick={save} disabled={!loaded || saving || !dirty} className="h-7 rounded-[4px] px-4 text-[12px] font-normal">{saving ? "保存中…" : "保存规则"}</Button></div>
    </div>
    <div className="space-y-2 pb-1 text-[12px] leading-5 text-[#646a73]">
      <details><summary className="w-fit cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-[#3370ff]">配置说明 · 保存后重算历史</summary>
        <div className="mt-2 space-y-1"><p>转化、升单、复购不能重复计入同一笔；体验和梳理独立统计。规则变更的未处理待办需重新核对。</p><p>每种单算：每种卡或课程各自累计。所选合算：所选项目合在一起累计。</p></div>
      </details>
      {!configured && loaded && <p>尚未配置，当前统计沿用旧档位。填写并保存后启用。</p>}
      {warnings.length > 0 && <div role="alert" className="text-[#c45b60]">已保存规则需调整：{warnings.join("；")}</div>}
      {error && <p role="alert" className="text-[#c45b60]">{error}</p>}
      {message && <p role="status" className="text-[#588b70]">{message}</p>}
    </div>
    {previewRows.length > 0 && <div className="rounded-lg bg-white px-4 py-2">
      <div className="mb-2 text-[12px] font-medium text-[#2b2f36]">常见路径示例<span className="ml-2 text-[12px] font-normal text-[#646a73]">最后一次行为的分类，不覆盖所有路径</span></div>
      <Table><TableHeader><TableRow><TableHead>行为顺序</TableHead><TableHead>分类结果</TableHead></TableRow></TableHeader><TableBody>{previewRows.map(row => <TableRow key={row.journey}><TableCell>{row.journey}</TableCell><TableCell>{row.classification}</TableCell></TableRow>)}</TableBody></Table>
    </div>}
    {loading ? <div className="py-10 text-center text-[12px] text-[#8f959e]">加载中…</div> : RULES.map(({ key, name }) => {
      const rule = rules.find(rule => rule.key === key) || { key, conditions: [] }
      return <section key={key} className="@container border-b border-[#eef0f2] py-4 last:border-b-0">
        <div className="grid grid-cols-[1fr_auto] items-center min-h-7 gap-x-4 gap-y-2 @[820px]:grid-cols-[64px_minmax(0,1fr)_auto]">
          <h2 className="order-1 text-[14px] font-semibold text-[#1f2329]">{name}</h2>
          <div className="order-3 col-span-2 flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px] text-[#4e535a] @[820px]:order-2 @[820px]:col-span-1">
            {key !== "experience" && <div className="flex items-center gap-2"><span className="whitespace-nowrap text-[12px] text-[#646a73]">前置阶段</span>
              <div className="w-[130px]"><SelectDropdown size="sm" buttonClassName="!h-7 !border-[#dfe3e8] !bg-white !text-[11px] hover:!border-[#aeb5be]" value={rule.previous_stage || ""} disabled={saving} options={[{ value: "", label: "不要求" }, ...RULES.slice(0, RULES.findIndex(item => item.key === key)).filter(item => item.key !== "assessment").map(item => ({ value: item.key, label: item.name }))]} onChange={value => updateStage(key, { previous_stage: value as PurchaseRule["previous_stage"], count_from: value ? (rule.previous_stage ? rule.count_from || "history" : "previous_stage") : "history" })} /></div>
            </div>}
            {rule.previous_stage && <div className="flex items-center gap-2" title={rule.count_from === "previous_stage" ? "完成前置阶段的那笔不计入，从之后符合项目的第 1 笔开始累计。" : "包含达到前置阶段的购买，次数不会归零。"}><span className="whitespace-nowrap text-[12px] text-[#646a73]">计数起点</span><div className="w-[170px]"><SelectDropdown size="sm" buttonClassName="!h-7 !border-[#dfe3e8] !bg-white !text-[11px] hover:!border-[#aeb5be]" value={rule.count_from || "history"} disabled={saving} options={[{ value: "previous_stage", label: "前置阶段完成后累计" }, { value: "history", label: "全部历史累计" }]} onChange={value => updateStage(key, { count_from: value as PurchaseRule["count_from"] })} /></div></div>}
            <label className="flex items-center gap-2 whitespace-nowrap"><input type="checkbox" checked={!!rule.once} disabled={saving} onChange={event => updateStage(key, { once: event.target.checked })} />仅首次达成</label>
          </div>
          <button type="button" disabled={!loaded || saving} onClick={() => update(key, [...rule.conditions, { product: "", operator: "eq", count: key === "repurchase" ? 2 : 1 }])} className="order-2 inline-flex items-center gap-1 whitespace-nowrap text-[12px] text-[#3370ff] disabled:opacity-40 @[820px]:order-3"><Plus className="h-3.5 w-3.5" />添加条件</button>
        </div>
        <div className="pt-3">
          {!rule.conditions.length && <div className="py-2 text-[12px] text-[#8f959e]">添加条件后参与统计。</div>}
          <div className="space-y-4">{rule.conditions.map((condition, index) => {
            const change = (patch: Partial<typeof condition>) => update(key, rule.conditions.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item))
            const priorModeKey = `${key}:${index}`
            const priorMode = priorModeOverrides[priorModeKey] ?? priorModeOf(condition)
            const attendance = condition.event_kind === "attendance"
            const countScope = condition.count_scope || "subtype"
            const selected = condition.products || (condition.product ? [condition.product] : [])
            const hasRestriction = priorMode !== "any" || !!condition.excluded_previous_products?.length
            const setPriorMode = (mode: PriorMode) => {
              setPriorModeOverrides(current => ({ ...current, [priorModeKey]: mode }))
              change({ first_purchase: mode === "first", previous_products: mode === "specific" ? condition.previous_products || [] : [], ...(mode === "first" ? { count: 1, operator: "eq", excluded_previous_products: [] } : {}) })
            }
            return <div key={index} className="space-y-2">
              {index > 0 && <div className="text-[12px] text-[#646a73]">或满足以下条件</div>}
              <div className="grid items-center gap-x-4 gap-y-2 @[820px]:grid-cols-[128px_minmax(0,1fr)_360px]">
                {key === "experience" ? <SelectDropdown size="sm" buttonClassName="!h-7 !border-[#dfe3e8] !bg-white !text-[11px] hover:!border-[#aeb5be]" value={attendance ? "attendance" : "purchase"} disabled={saving} options={[{ value: "purchase", label: "有效购买／抵扣" }, { value: "attendance", label: "实际上课" }]} onChange={value => {
                  setPriorModeOverrides(current => ({ ...current, [priorModeKey]: "any" }))
                  change({ event_kind: value as "attendance" | "purchase", product: undefined, products: [], public_welfare_only: value === "attendance", first_purchase: false, previous_products: [], count: 1 })
                }} /> : <span className="text-[12px] text-[#646a73]">本次购买</span>}
                <div className="min-w-0"><SelectDropdown size="sm" singleLineMulti buttonClassName="!h-7 !border-[#dfe3e8] !bg-white !text-[11px] hover:!border-[#aeb5be] [&>div>span]:!text-[11px] [&>div>span]:!bg-[#f0f1f3]" multi value={selected} options={(attendance ? activities : products).map(item => ({ value: item.key, label: item.label }))} onChange={selected => change({ product: undefined, products: selected })} placeholder={attendance ? "选择实际参加的课程" : "选择付费项目或卡种"} disabled={saving} /></div>
                {priorMode === "first" ? <div className="flex h-7 items-center text-[12px] text-[#646a73]">首次购买 · 第 1 笔</div> : <div className="flex flex-wrap items-center gap-2 text-[12px] text-[#2b2f36]">
                  <div className="w-[104px]"><SelectDropdown size="sm" buttonClassName="!h-7 !border-[#dfe3e8] !bg-white !text-[11px] hover:!border-[#aeb5be]" value={countScope} disabled={saving} options={[{ value: "subtype", label: "每种单算" }, { value: "group", label: "所选合算" }]} onChange={value => change({ count_scope: value as "subtype" | "group" })} /></div>
                  <div className="flex items-center gap-1 whitespace-nowrap"><span>第</span><Input aria-label={`${name}条件${index + 1}${attendance ? "参与次数" : "购买笔数"}`} type="number" min="1" max="100000" value={condition.count || ""} disabled={saving} onChange={event => change({ count: Number(event.target.value) })} className="h-7 w-[60px] border-[#dfe3e8] bg-white text-[11px] shadow-none" /><span>{attendance ? "次" : "笔"}</span></div>
                  <div className="w-[132px]"><SelectDropdown size="sm" buttonClassName="!h-7 !border-[#dfe3e8] !bg-white !text-[11px] hover:!border-[#aeb5be]" value={condition.operator} options={[{ value: "eq", label: attendance ? "仅这一次" : "仅这一笔" }, { value: "gte", label: "从这次起都算" }]} disabled={saving} onChange={operator => change({ operator: operator as "eq" | "gte" })} /></div>
                </div>}
              </div>
              <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
                {attendance && <label className="flex h-5 items-center gap-1.5 whitespace-nowrap text-[12px] text-[#4e535a]"><input type="checkbox" checked={!!condition.public_welfare_only} disabled={saving} onChange={event => change({ public_welfare_only: event.target.checked })} />仅公益场次</label>}
              <details open={hasRestriction || undefined} className="min-w-0 flex-1 text-[12px] text-[#4e535a]">
                <summary className="w-fit cursor-pointer rounded pr-2 hover:bg-[#f5f6f7] focus-visible:outline-2 focus-visible:outline-[#3370ff]">购买限制<span className="ml-2 text-[12px] text-[#646a73]">{hasRestriction ? [priorMode === "first" ? "从未购买" : priorMode === "specific" ? `买过 ${condition.previous_products?.length || 0} 项中的任意一项` : "", condition.excluded_previous_products?.length ? `排除 ${condition.excluded_previous_products.length} 项` : ""].filter(Boolean).join(" · ") : "不限制"}</span></summary>
              <div className="mt-3 grid gap-3 @[660px]:grid-cols-2">
                <div className="space-y-2">
                  <div className="text-[12px] text-[#4e535a]">之前买过</div>
                  <div className="flex flex-wrap gap-2">
                    {([
                      { value: "any", label: "不要求" },
                      { value: "first", label: "从未购买" },
                      { value: "specific", label: "买过指定项目" },
                    ] as const).filter(option => !attendance || option.value !== "first").map(option => <button key={option.value} type="button" aria-pressed={priorMode === option.value} disabled={saving} onClick={() => setPriorMode(option.value)} className={`h-7 rounded-[4px] border px-3 text-[11px] disabled:opacity-50 ${priorMode === option.value ? "border-[#3370ff] bg-[#f0f5ff] text-[#3370ff]" : "border-[#dee0e3] bg-white text-[#4e535a]"}`}>{option.label}</button>)}
                  </div>
                  {priorMode === "specific" && <SelectDropdown size="sm" multi value={condition.previous_products || []} options={products.map(item => ({ value: item.key, label: item.label }))} onChange={previous_products => change({ previous_products })} placeholder="之前买过任意一项即可" disabled={saving} singleLineMulti buttonClassName="!h-7 !border-[#dfe3e8] !bg-white !text-[11px] hover:!border-[#aeb5be] [&>div>span]:!text-[11px] [&>div>span]:!bg-[#f0f1f3]" />}
                </div>
                <div className="space-y-2">
                  <div className="text-[12px] text-[#4e535a]">之前没买</div>
                  {priorMode === "first" ? <div className="py-2 text-[12px] text-[#646a73]">全部项目均未购买</div> : <SelectDropdown size="sm" multi value={condition.excluded_previous_products || []} options={products.map(item => ({ value: item.key, label: item.label }))} onChange={excluded_previous_products => change({ excluded_previous_products })} placeholder="可选：这些项目以前一项都没买过" disabled={saving} singleLineMulti buttonClassName="!h-7 !border-[#dfe3e8] !bg-white !text-[11px] hover:!border-[#aeb5be] [&>div>span]:!text-[11px] [&>div>span]:!bg-[#f0f1f3]" />}
                </div>
              </div>


              </details>
                <button type="button" disabled={saving} onClick={() => removeCondition(key, index, rule.conditions)} aria-label={`删除${name}条件${index + 1}`} className="rounded px-1 text-[12px] text-[#646a73] hover:bg-[#fff1f0] hover:text-[#c45b60] disabled:opacity-40">删除</button>
              </div>
            </div>
          })}</div>
        </div>
      </section>
    })}
  </div>
}
