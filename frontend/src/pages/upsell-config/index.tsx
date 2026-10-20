import { useEffect, useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SelectDropdown } from "@/components/select-dropdown"
import { upsellConfigApi, type PurchaseRule, type PurchaseRuleKey } from "@/lib/api"

const RULES: { key: PurchaseRuleKey; name: string }[] = [
  { key: "experience", name: "体验" }, { key: "conversion", name: "转化" },
  { key: "upsell", name: "升单" }, { key: "repurchase", name: "复购" },
]

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

  useEffect(() => {
    let current = true
    upsellConfigApi.get().then(data => {
      if (!current) return
      setRules(data.rules); setRecommended(data.recommended_rules || []); setProducts(data.products); setConfigured(data.configured); setLoaded(true)
    }).catch(error => { if (current) setError(error instanceof Error ? error.message : "加载失败") })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [])

  const update = (key: PurchaseRuleKey, conditions: PurchaseRule["conditions"]) => {
    setRules(current => current.map(rule => rule.key === key ? { ...rule, conditions } : rule))
    setDirty(true); setMessage("")
  }
  const save = async () => {
    if (rules.some(rule => rule.conditions.some(condition => (!condition.product && !condition.products?.length) || !Number.isInteger(condition.count) || condition.count < 1))) {
      setError("请为每条条件选择付费项目，并填写大于零的整数购买次数"); return
    }
    setSaving(true); setError(""); setMessage("")
    try {
      const data = await upsellConfigApi.saveRules(rules)
      setRules(data.rules); setConfigured(true); setDirty(false); setMessage("已保存，统计将按成交日期匹配新规则")
    } catch (error) { setError(error instanceof Error ? error.message : "保存失败") }
    finally { setSaving(false) }
  }

  return <div className="min-h-full space-y-3 bg-[#f4f5f6] p-4 pb-6">
    <div className="flex min-h-[52px] items-center justify-between rounded-xl bg-white px-5 py-3">
      <div className="flex items-center gap-3"><h1 className="text-[14px] text-[#2b2f36]">升单配置</h1><span className="text-[12px] text-[#8f959e]">体验 · 转化 · 升单 · 复购</span></div>
      <div className="flex items-center gap-2"><Button size="sm" variant="outline" disabled={!loaded || saving || !recommended.length} onClick={() => { setRules(structuredClone(recommended)); setDirty(true); setError(""); setMessage("已填入：次卡/粗门体验、体验会员或首购大单转化、体验会员后升单、跨大单复购。检查后点击保存规则生效。") }} className="h-8 rounded-[4px] text-[12px] font-normal">填入业务方案</Button>
      <Button size="sm" onClick={save} disabled={!loaded || saving || !dirty} className="h-8 rounded-[4px] px-4 text-[12px] font-normal">{saving ? "保存中…" : "保存规则"}</Button></div>
    </div>
    <div className="rounded-xl bg-white px-5 py-4">
      <p className="text-[12px] leading-6 text-[#8f959e]">按完整成交历史判断先后，统计周期只筛选成交日期。可按具体类型分别累计，也可将所选大单合并计次；“此前购买”不包含本笔。同日按录入时间、流水顺序判断。每组任意满足，同一笔可同时命中升单与复购。</p>
      {!configured && loaded && <p className="mt-2 text-[12px] leading-6 text-[#a18452]">新规则尚未配置，当前统计暂沿用旧档位。填写并保存后启用四类规则，旧配置保留备份，不自动套用。</p>}
      {error && <p role="alert" className="mt-2 text-[12px] text-[#c45b60]">{error}</p>}
      {message && <p role="status" className="mt-2 text-[12px] text-[#588b70]">{message}</p>}
    </div>
    {loading ? <div className="py-10 text-center text-[12px] text-[#8f959e]">加载中…</div> : RULES.map(({ key, name }) => {
      const rule = rules.find(rule => rule.key === key)!
      return <section key={key} className="overflow-hidden rounded-xl bg-white">
        <div className="flex h-12 items-center justify-between border-b border-[#f0f0f0] px-5">
          <div className="flex items-center gap-2.5"><h2 className="text-[13px] font-medium text-[#2b2f36]">{name}</h2><span className="text-[11px] text-[#a0a7af]">{rule.conditions.length ? `${rule.conditions.length} 条条件 · 任意满足` : "未配置"}</span></div>
          <button type="button" disabled={!loaded || saving} onClick={() => update(key, [...rule.conditions, { product: "", operator: "eq", count: key === "repurchase" ? 2 : 1 }])} className="inline-flex items-center gap-1 text-[12px] text-[#3370ff] disabled:opacity-40"><Plus className="h-3.5 w-3.5" />添加条件</button>
        </div>
        <div className="px-5 py-3">
          {!rule.conditions.length && <div className="py-2 text-[12px] text-[#a0a7af]">添加付费项目与购买次数条件；留空则不统计此类。</div>}
          <div className="space-y-3">{rule.conditions.map((condition, index) => {
            const change = (patch: Partial<typeof condition>) => update(key, rule.conditions.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item))
            return <div key={index} className="space-y-2.5 rounded-[4px] border border-[#e8eaed] p-3"><div className="flex flex-wrap items-center gap-2.5">
              <span className="w-8 text-[11px] text-[#a0a7af]">{index ? "或" : "购买"}</span>
              <div className="min-w-[250px] max-w-[420px] flex-1"><SelectDropdown size="sm" buttonClassName="!h-auto min-h-7" multi value={condition.products || (condition.product ? [condition.product] : [])} options={products.map(item => ({ value: item.key, label: item.label }))} onChange={selected => change({ product: undefined, products: selected })} placeholder="选择付费项目 / 子类型" disabled={saving} /></div>
              <div className="w-[140px]"><SelectDropdown size="sm" value={condition.count_scope || "subtype"} options={[{ value: "subtype", label: "按具体类型分别累计" }, { value: "group", label: "所选项目合并累计" }]} disabled={saving} onChange={value => change({ count_scope: value as "subtype" | "group" })} /></div>
              <span className="text-[12px] text-[#646a73]">第</span>
              <Input aria-label={`${name}条件${index + 1}购买次数`} type="number" min="1" max="100000" value={condition.count || ""} disabled={saving} onChange={event => change({ count: Number(event.target.value) })} className="h-7 w-[70px] text-[12px]" />
              <div className="w-[100px]"><SelectDropdown size="sm" value={condition.operator} options={[{ value: "eq", label: "次" }, { value: "gte", label: "次及以上" }]} disabled={saving} onChange={operator => change({ operator: operator as "eq" | "gte" })} /></div>
              <button type="button" disabled={saving} onClick={() => update(key, rule.conditions.filter((_, itemIndex) => itemIndex !== index))} aria-label={`删除${name}条件${index + 1}`} className="ml-auto p-1 text-[#a0a7af] hover:text-[#c45b60]"><Trash2 className="h-3.5 w-3.5" /></button>
            </div><div className="flex flex-wrap items-center gap-3 pl-[42px] text-[12px] text-[#646a73]">
              <label className="inline-flex items-center gap-1.5"><input type="checkbox" disabled={saving} checked={!!condition.first_purchase} onChange={event => change({ first_purchase: event.target.checked, ...(event.target.checked ? { previous_products: [] } : {}) })} className="accent-[#646a73]" />仅客户首次购买</label>
              <span>且此前买过</span><div className="min-w-[240px] max-w-[500px] flex-1"><SelectDropdown size="sm" multi value={condition.previous_products || []} options={products.map(item => ({ value: item.key, label: item.label }))} onChange={previous_products => change({ previous_products })} placeholder="不限；可选择体验会员等前置购买" disabled={saving || !!condition.first_purchase} buttonClassName="!h-auto min-h-7" /></div>
            </div></div>
          })}</div>
        </div>
      </section>
    })}
  </div>
}
