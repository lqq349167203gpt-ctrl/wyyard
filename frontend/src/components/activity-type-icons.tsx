import { useEffect, useRef, useState } from "react"
import { activityIconApi, type ActivityTypeIcon } from "@/lib/api"
import { Button } from "@/components/ui/button"

export function ActivityTypeIcons() {
  const [items, setItems] = useState<ActivityTypeIcon[]>([])
  const [canEdit, setCanEdit] = useState(false)
  const [busy, setBusy] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState("")
  const fileInput = useRef<HTMLInputElement>(null)
  const target = useRef("")
  const load = async () => {
    setLoading(true); setError("")
    try { const data = await activityIconApi.list(); setItems(data.items); setCanEdit(data.can_edit) }
    catch (e) { setError(e instanceof Error ? e.message : "图标读取失败") }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])
  const change = async (key: string, file?: File) => {
    if (busy || !canEdit) return
    if (file && (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 2 * 1024 * 1024)) {
      setError("请选择 2MB 以内的 PNG、JPG 或 WebP 图片"); return
    }
    setBusy(key); setError(""); setMessage("")
    try {
      const icon = file ? await activityIconApi.upload(key, file) : await activityIconApi.reset(key)
      setItems(current => current.map(item => item.key === key ? icon : item))
      setMessage(`${icon.label}图标已${file ? "更换" : "恢复默认"}，新旧课程统一使用`)
    } catch (e) { setError(e instanceof Error ? e.message : "保存失败，请重试") }
    finally { setBusy("") }
  }
  return <section className="mb-4 rounded-lg border border-[#e8eaed] bg-white p-4">
    <div className="text-[13px] font-medium text-[#2b2f36]">活动类型图标</div>
    <p className="mb-4 mt-1 text-[12px] text-[#8f959e]">用于小程序课表、名单和课程详情。上传后居中裁成正方形；下方为实际显示大小。</p>
    {loading && <div className="text-[12px] text-[#8f959e]">读取中…</div>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{items.map(item => <div key={item.key} className="flex items-start gap-3">
      <img src={item.url} alt={item.label} width={28} height={28} className="mt-0.5 h-7 w-7 shrink-0 rounded-md object-cover" onError={event => { if (!event.currentTarget.dataset.fallback) { event.currentTarget.dataset.fallback = "1"; event.currentTarget.src = item.default_url } }} key={`${item.key}:${item.url}`} />
      <div><div className="text-[13px] text-[#2b2f36]">{item.label}</div>
        {canEdit && <div className="mt-1 flex gap-2"><button className="text-[12px] text-[#3370ff] disabled:opacity-40" disabled={!!busy} onClick={() => { target.current = item.key; fileInput.current?.click() }}>{busy === item.key ? "保存中…" : "更换"}</button><button className="text-[12px] text-[#646a73] disabled:opacity-40" disabled={!!busy || !item.custom} onClick={() => void change(item.key)}>恢复默认</button></div>}
      </div>
    </div>)}</div>
    <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" aria-label="选择活动类型图标" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void change(target.current, file) }} />
    {error && <div role="alert" className="mt-3 text-[12px] text-[#c45b60]">{error}{!items.length && <Button size="sm" variant="ghost" onClick={() => void load()}>重试</Button>}</div>}
    {message && <p role="status" className="mt-3 text-[12px] text-[#588b70]">{message}</p>}
  </section>
}
