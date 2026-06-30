import { useState, useEffect } from "react"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { customerApi } from "@/lib/api"

export default function TrackingPlan({
  customerId,
  value,
  onChange,
}: {
  customerId: string
  value: string
  onChange: (val: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    setDraft(value)
  }, [value])

  const handleSave = async () => {
    setSaving(true)
    setError("")
    try {
      await customerApi.update(customerId, { tracking_plan: draft })
      onChange(draft)
      setEditing(false)
    } catch {
      setError("保存失败，请重试")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-lg">
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <h3 className="text-[13px] font-medium text-[#2b2f36]">服务 / 追踪方案</h3>
        {!editing && (
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setEditing(true)}>
            编辑
          </Button>
        )}
      </div>
      <div className="p-4">
        {editing ? (
          <div className="space-y-2">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="输入服务/追踪方案"
              rows={4}
              className="text-xs resize-none"
            />
            {error && <p className="text-[11px] text-[#f54a45]">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { setEditing(false); setDraft(value); setError("") }}>
                取消
              </Button>
              <Button size="sm" className="h-7 text-xs" onClick={handleSave} disabled={saving}>
                {saving ? "保存中..." : "保存"}
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-[#4e535a] whitespace-pre-wrap leading-relaxed">{value || "暂无追踪方案"}</p>
        )}
      </div>
    </div>
  )
}
