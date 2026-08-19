import { useEffect, useState } from "react"
import { useParams } from "react-router-dom"
import { visitApi, type VisitRecord } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"

export default function ArrivalFeedbackPage() {
  const { visitId } = useParams<{ visitId: string }>()
  const [visit, setVisit] = useState<VisitRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [experience, setExperience] = useState("")

  useEffect(() => {
    document.title = "无忧茶院 - 反馈记录"
  }, [])

  useEffect(() => {
    if (!visitId) return
    visitApi.get(visitId).then((data) => {
      setVisit(data)
      setExperience(data.experience || "")
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [visitId])

  const handleSave = async () => {
    if (!visitId) return
    setSaving(true)
    try {
      await visitApi.update(visitId, { experience } as any)
      setSaved(true)
    } catch {} finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f6f7]">
        <Loader2 className="h-6 w-6 animate-spin text-[#8f959e]" />
      </div>
    )
  }

  if (!visit) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f6f7]">
        <p className="text-sm text-[#8f959e]">记录不存在</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f5f6f7] flex flex-col">
      <div className="h-1 bg-[#3370ff]" />

      <div className="max-w-lg w-full mx-auto flex-1 p-4 md:p-6">
        {/* 标题 */}
        <div className="mb-6">
          <h1 className="text-[22px] font-semibold text-[#2b2f36]">反馈记录</h1>
          <p className="text-[13px] text-[#8f959e] mt-1">记录客户反馈与体验</p>
        </div>

        {/* 昵称 + 到店日期 */}
        <div className="bg-white rounded-2xl px-5 py-4 mb-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-[#8f959e]">昵称</span>
            <span className="text-[18px] font-semibold text-[#2b2f36]">{visit.nickname}</span>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-[12px] text-[#8f959e]">到店日期</span>
            <span className="text-[13px] text-[#2b2f36]">{visit.visit_date}</span>
          </div>
        </div>

        {/* 今日活动 */}
        {visit.activities.length > 0 && (
          <div className="bg-white rounded-2xl px-5 py-4 mb-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <h2 className="text-[14px] font-medium text-[#2b2f36] mb-3">今日活动</h2>
            <div className="space-y-2">
              {visit.activities.map((a, i) => (
                <div key={i} className="flex items-center justify-between text-[13px]">
                  <div className="flex items-center gap-1.5">
                    {a.is_welfare && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#f0f1f2] text-[#8f959e]">公益</span>
                    )}
                    <span className="text-[#2b2f36]">{a.name}</span>
                  </div>
                  <span className="text-[#8f959e]">{a.owner_name || ""}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 反馈输入 */}
        <div className="bg-white rounded-2xl px-5 py-4 mb-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <h2 className="text-[14px] font-medium text-[#2b2f36] mb-3">客户反馈</h2>
          <textarea
            value={experience}
            onChange={(e) => { setExperience(e.target.value); setSaved(false) }}
            placeholder="写下客户的反馈与体验..."
            rows={4}
            className="w-full rounded-xl border border-[#e8eaed] p-4 text-[16px] text-[#2b2f36] placeholder:text-[#b0b5bb] resize-none focus:outline-none focus:ring-1 focus:ring-[#3370ff] focus:border-[#3370ff]"
          />
        </div>

        <Button
          onClick={handleSave}
          disabled={saving}
          className="w-full h-[50px] text-[16px] font-medium rounded-2xl shadow-[0_2px_8px_rgba(51,112,255,0.25)]"
        >
          {saving ? "保存中..." : saved ? "已保存 ✓" : "保存"}
        </Button>
      </div>

      <div className="text-center py-5 text-[11px] text-[#b0b5bb]">
        无忧茶院数据平台
      </div>
    </div>
  )
}
