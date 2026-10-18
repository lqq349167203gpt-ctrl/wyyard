import { useEffect, useState } from "react"

import { SelectDropdown } from "@/components/select-dropdown"
import { paymentExportApi } from "@/lib/api"

export function PaymentCourseSelect({ date, value, name = "", onChange }: {
  date: string; value: string; name?: string; onChange: (key: string, name: string) => void
}) {
  const [options, setOptions] = useState<Array<{ key: string; name: string }>>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [reload, setReload] = useState(0)
  useEffect(() => {
    let active = true
    setOptions([])
    setError("")
    setLoading(Boolean(date))
    if (date) paymentExportApi.courseOptions(date).then(items => {
      if (active) setOptions(items)
    }).catch(err => {
      if (active) setError(err instanceof Error ? err.message : "课程加载失败")
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [date, reload])
  const choices = [{ value: "", label: "与课程无关" }, ...options.map(item => ({ value: item.key, label: item.name }))]
  if (value && !options.some(item => item.key === value)) choices.push({ value, label: name || "原成交课程（可重新选择）" })
  return <div className="min-w-0">
    <SelectDropdown value={value} options={choices} disabled={!date || loading} placeholder={loading ? "课程加载中…" : "与课程无关"} onChange={key => onChange(key, options.find(item => item.key === key)?.name || "")} />
    {error && <button type="button" className="mt-1 text-[11px] text-red-600" onClick={() => setReload(n => n + 1)}>{error}，点击重试</button>}
  </div>
}
