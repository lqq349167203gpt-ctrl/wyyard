import { useEffect, useState } from "react"
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { SelectDropdown } from "@/components/select-dropdown"
import { upsellConfigApi, type UpsellLevel } from "@/lib/api"

type Draft = { id: string; name: string; products: string[] }

/**
 * 升单配置：先把若干付费项目归成一个「大类」并取名，再给这些大类排序；
 * 页面从高档到低档展示；接口仍按低档到高档存储，以保持现有升单统计口径。
 */
export default function UpsellConfigPage() {
  const [levels, setLevels] = useState<UpsellLevel[]>([])
  const [options, setOptions] = useState<{ key: string; label: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<Draft>({ id: "", name: "", products: [] })
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<UpsellLevel | null>(null)

  const labelOf = (key: string) => options.find(item => item.key === key)?.label ?? key
  // 别的档位已经用过的项目：整卡和它的卡种不能分到两档，不同卡种之间可以各占一档
  const takenItems = (exceptId = "") => levels.filter(level => level.id !== exceptId).flatMap(level => level.products)
  const isTaken = (key: string, exceptId = "") => {
    const [product, subtype] = key.split(":")
    return takenItems(exceptId).some(used => {
      const [usedProduct, usedSubtype] = used.split(":")
      if (usedProduct !== product) return false
      if (!subtype) return true
      return !usedSubtype || used === key
    })
  }

  const load = async () => {
    setLoading(true)
    try {
      const data = await upsellConfigApi.get()
      setLevels([...data.levels].reverse())
      setOptions(data.products)
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败")
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const persist = async (nextLevels: UpsellLevel[]) => {
    setSaving(true); setError("")
    try {
      const data = await upsellConfigApi.save([...nextLevels].reverse())
      setLevels([...data.levels].reverse()); setOptions(data.products)
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败")
      return false
    } finally {
      setSaving(false)
    }
  }

  const openCreate = () => {
    setDraft({ id: "", name: "", products: [] })
    setError("")
    setOpen(true)
  }
  const openEdit = (level: UpsellLevel) => {
    setDraft({ id: level.id, name: level.name, products: [...level.products] })
    setError("")
    setOpen(true)
  }
  const move = async (index: number, offset: number) => {
    const target = index + offset
    if (target < 0 || target >= levels.length) return
    const next = [...levels]
    ;[next[index], next[target]] = [next[target], next[index]]
    await persist(next)
  }
  const save = async () => {
    const name = draft.name.trim()
    if (!name) { setError("请填写大类名称"); return }
    if (!draft.products.length) { setError("请至少选一个付费项目"); return }
    const next = draft.id
      ? levels.map(level => level.id === draft.id ? { ...level, name, products: draft.products } : level)
      : [...levels, { id: "", name, products: draft.products }]
    if (await persist(next)) setOpen(false)
  }
  const confirmDelete = async () => {
    if (!deleteTarget) return
    if (await persist(levels.filter(level => level.id !== deleteTarget.id))) setDeleteTarget(null)
  }

  return (
    <div className="min-h-full bg-[#f4f5f6] p-4 pb-6">
      <div className="mb-3 flex h-[52px] items-center justify-between rounded-xl bg-white px-5 shadow-[0_1px_3px_rgba(33,38,49,.06)]">
        <span className="text-[14px] text-[#2b2f36]">升单配置</span>
        <Button size="sm" onClick={openCreate} className="h-8 rounded-[4px] border border-[#3370ff] bg-[#3370ff] px-3 text-[12px] font-normal text-white shadow-none hover:border-[#285dcc] hover:bg-[#285dcc]">
          <Plus className="mr-1 h-3.5 w-3.5" />新增大类
        </Button>
      </div>

      <section className="rounded-xl bg-white px-[22px] py-4 shadow-[0_1px_3px_rgba(33,38,49,.06)]">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-2 text-[13px] font-medium text-[#1f2329]"><span className="h-3 w-[3px] rounded-[1px] bg-[#3370ff]"></span>升单顺序</span>
          <span className="text-[11px] text-[#8f959e]">升单规则，从靠后的大类往前升</span>
        </div>

        {error && <div className="mb-3 rounded-[4px] border border-[#f1d9dc] bg-[#fff8f8] px-3 py-2"><p role="alert" className="text-[12px] text-[#b94a58]">{error}</p></div>}

        <div className="overflow-hidden border-[0.5px] border-[#eceef0]">
          <table className="w-full table-fixed">
            <thead>
              <tr className="h-9 border-b-[0.5px] border-[#f0f0f0] bg-[#fafafa] text-[11px] text-[#646a73]">
                <th className="w-[70px] px-4 text-left font-normal">顺序</th>
                <th className="w-[160px] px-3 text-left font-normal">大类名称</th>
                <th className="px-3 text-left font-normal">包含的付费项目</th>
                <th className="w-[170px] px-3 text-right font-normal">操作</th>
              </tr>
            </thead>
            <tbody>
              {levels.map((level, index) => (
                <tr key={level.id} className="border-b-[0.5px] border-[#f0f0f0] text-[12px] last:border-b-0">
                  <td className="h-11 px-4 tabular-nums text-[#8f959e]">{index + 1}</td>
                  <td className="px-3 font-medium text-[#2b2f36]">{level.name}</td>
                  <td className="px-3 text-[#4e535a]">{level.products.map(labelOf).join("、")}</td>
                  <td className="px-3 text-right">
                    <button type="button" onClick={() => move(index, -1)} disabled={index === 0 || saving} className="mr-2 rounded-[3px] p-1 text-[#646a73] hover:bg-[#f0f1f3] disabled:opacity-30" aria-label="上移"><ArrowUp className="h-3.5 w-3.5" /></button>
                    <button type="button" onClick={() => move(index, 1)} disabled={index === levels.length - 1 || saving} className="mr-3 rounded-[3px] p-1 text-[#646a73] hover:bg-[#f0f1f3] disabled:opacity-30" aria-label="下移"><ArrowDown className="h-3.5 w-3.5" /></button>
                    <button type="button" onClick={() => openEdit(level)} className="mr-3 text-[12px] text-[#3370ff] hover:underline">编辑</button>
                    <button type="button" onClick={() => setDeleteTarget(level)} className="text-[12px] text-[#d85b65] hover:underline">删除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!levels.length && <div className="py-14 text-center text-[13px] text-[#8f959e]">{loading ? "加载中…" : "还没有大类，点右上角「新增大类」，选上付费项目并取名"}</div>}
      </section>

      <Dialog open={open} onOpenChange={value => { if (!saving) setOpen(value) }}>
        <DialogContent initialFocus={false} className="w-[520px] max-w-[92vw] gap-0 rounded-[8px] border-[0.5px] border-[#e8eaed] p-0">
          <DialogHeader className="border-b-[0.5px] border-[#f0f0f0] px-5 py-3">
            <DialogTitle className="text-[14px] font-medium text-[#1f2329]">{draft.id ? "编辑大类" : "新增大类"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 px-5 py-4">
            <div className="flex items-center gap-3">
              <span className="w-20 shrink-0 text-right text-[12px] text-[#4e535a]">大类名称</span>
              <Input value={draft.name} onChange={e => setDraft(current => ({ ...current, name: e.target.value }))} maxLength={20} placeholder="例如：体验档 / 正价档" className="h-8 flex-1 rounded-[4px] border-[0.5px] border-[#e1e4e7] text-[12px] shadow-none focus-visible:ring-0" />
            </div>
            <div className="flex items-start gap-3">
              <span className="mt-1 w-20 shrink-0 text-right text-[12px] text-[#4e535a]">付费项目</span>
              <div className="min-w-0 flex-1 space-y-2">
                <SelectDropdown
                  value={draft.products}
                  options={options
                    .filter(item => !isTaken(item.key, draft.id) || draft.products.includes(item.key))
                    .map(item => ({ value: item.key, label: item.label }))}
                  onChange={value => setDraft(current => ({ ...current, products: value }))}
                  multi
                  placeholder="选择归到这个大类的付费项目"
                  buttonClassName="!h-8 !rounded-[4px] !border-[0.5px] !border-[#e1e4e7] !bg-white !shadow-none"
                  dropdownWidth={220}
                />
                <p className="text-[11px] leading-5 text-[#8f959e]">一个项目只能属于一个大类；同一个大类里放哪些项目不影响顺序，顺序看列表里大类的先后。</p>
              </div>
            </div>
          </div>
          <DialogFooter className="!mx-0 !mb-0 !rounded-b-none !bg-transparent border-t-[0.5px] border-[#f0f0f0] px-5 py-3">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)} className="h-8 rounded-[4px] border-[0.5px] border-[#e1e4e7] bg-white px-4 text-[12px] font-normal text-[#646a73] shadow-none hover:bg-[#f7f8fa]">取消</Button>
            <Button size="sm" onClick={save} disabled={saving} className="h-8 rounded-[4px] border border-[#3370ff] bg-[#3370ff] px-4 text-[12px] font-normal text-white shadow-none hover:border-[#285dcc] hover:bg-[#285dcc]">{saving ? "保存中" : "保存"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={value => { if (!value) setDeleteTarget(null) }}>
        <DialogContent initialFocus={false} className="w-[360px] max-w-[90vw] gap-0 rounded-[8px] border-[0.5px] border-[#e8eaed] p-0">
          <DialogHeader className="border-b-[0.5px] border-[#f0f0f0] px-5 py-3">
            <DialogTitle className="flex items-center gap-2 text-[14px] font-normal"><Trash2 className="h-3.5 w-3.5 text-[#d85b65]" />删除大类</DialogTitle>
          </DialogHeader>
          <div className="px-5 py-5 text-[12px] text-[#4e535a]">确认删除“{deleteTarget?.name}”吗？删掉后它包含的付费项目就不再参与升单判定，后面的档位会自动往前排。</div>
          <DialogFooter className="!mx-0 !mb-0 !rounded-b-none !bg-transparent border-t-[0.5px] border-[#f0f0f0] px-5 py-3">
            <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)} className="h-8 rounded-[4px] border-[0.5px] border-[#e1e4e7] bg-white px-4 text-[12px] font-normal text-[#646a73] shadow-none hover:bg-[#f7f8fa]">取消</Button>
            <Button variant="destructive" size="sm" onClick={confirmDelete} disabled={saving} className="h-8 rounded-[4px] border-[0.5px] border-[#efc9cc] bg-[#fff5f5] px-4 text-[12px] font-normal text-[#c94b55] shadow-none hover:bg-[#ffeded]">删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
