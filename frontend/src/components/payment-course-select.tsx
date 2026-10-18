import { useEffect, useState } from "react"

import { SelectDropdown } from "@/components/select-dropdown"
import { paymentExportApi } from "@/lib/api"

export const UNSET_DEAL_COURSE = "__unset__"
export const NO_DEAL_COURSE_LABEL = "无"

export function PaymentCourseSelect({ date, customerId, value, name = "", onChange }: {
  date: string
  customerId: string
  value: string
  name?: string
  onChange: (key: string, name: string) => void
}) {
  const [options, setOptions] = useState<Array<{ key: string; name: string }>>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [reload, setReload] = useState(0)
  useEffect(() => {
    let active = true
    setOptions([])
    setError("")
    setLoading(Boolean(date && customerId))
    if (date && customerId) {
      paymentExportApi.courseOptions(date, customerId).then(items => {
        if (active) setOptions(items)
      }).catch(err => {
        if (active) setError(err instanceof Error ? err.message : "课程加载失败")
      }).finally(() => { if (active) setLoading(false) })
    }
    return () => { active = false }
  }, [date, customerId, reload])
  const choices = [{ value: "", label: NO_DEAL_COURSE_LABEL }, ...options.map(item => ({ value: item.key, label: item.name }))]
  if (value && value !== UNSET_DEAL_COURSE && !options.some(item => item.key === value)) {
    choices.push({ value, label: name || "原成交课程（可重新选择）" })
  }
  const placeholder = loading ? "课程加载中…" : customerId ? "选择成交的关联课程" : "请先选择用户"
  return <div className="min-w-0">
    <SelectDropdown
      value={value}
      options={choices}
      disabled={!date || !customerId || loading}
      placeholder={placeholder}
      placeholderColor="text-[#a8b1bd]"
      textColor={value === UNSET_DEAL_COURSE ? undefined : "text-[#2b2f36]"}
      onChange={key => onChange(key, key ? (options.find(item => item.key === key)?.name || name) : "")}
    />
    {error && <button type="button" className="mt-1 text-[11px] text-red-600" onClick={() => setReload(n => n + 1)}>{error}，点击重试</button>}
  </div>
}
