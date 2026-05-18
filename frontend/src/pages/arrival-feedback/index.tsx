import { useEffect, useState } from "react"
import { useParams } from "react-router-dom"
import { visitApi, type VisitRecord } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"

interface ActivityParticipation {
  name: string
  role: string
  type: string
  owner_name: string
  extra_badge: string
  is_welfare: boolean
  participated: boolean
}

export default function ArrivalFeedbackPage() {
  const { visitId } = useParams<{ visitId: string }>()
  const [visit, setVisit] = useState<VisitRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [participation, setParticipation] = useState<ActivityParticipation[]>([])
  const [experience, setExperience] = useState("")

  useEffect(() => {
    document.title = "无忧小院 - 活动参与确认"
  }, [])

  useEffect(() => {
    if (!visitId) return
    visitApi.get(visitId).then((data) => {
      setVisit(data)
      if (data.activity_participation?.length > 0) {
        setParticipation(data.activity_participation as ActivityParticipation[])
      } else {
        setParticipation(
          data.activities.map((a) => ({
            name: a.name, role: a.role, type: a.type || "",
            owner_name: a.owner_name || "", extra_badge: a.extra_badge || "",
            is_welfare: a.is_welfare || false, participated: false,
          }))
        )
      }
      setExperience(data.experience || "")
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [visitId])

  const toggleParticipation = (index: number) => {
    setParticipation((prev) =>
      prev.map((p, i) => (i === index ? { ...p, participated: !p.participated } : p))
    )
    setSaved(false)
  }

  const handleSave = async () => {
    if (!visitId) return
    setSaving(true)
    try {
      await visitApi.update(visitId, { activity_participation: participation, experience } as any)
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
          <h1 className="text-[22px] font-semibold text-[#2b2f36]">活动参与确认</h1>
          <p className="text-[13px] text-[#8f959e] mt-1">确认今日参与的活动并记录体验</p>
        </div>

        {/* 昵称 */}
        <div className="bg-white rounded-2xl px-5 py-4 mb-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-[#8f959e]">昵称</span>
            <span className="text-[18px] font-semibold text-[#2b2f36]">{visit.nickname}</span>
          </div>
        </div>

        {/* 活动列表 */}
        <div className="bg-white rounded-2xl px-5 py-4 mb-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <h2 className="text-[14px] font-medium text-[#2b2f36] mb-4">今日活动</h2>
          {participation.length > 0 ? (
            <div className="space-y-0">
              {participation.map((item, i) => (
                <label
                  key={i}
                  className={`flex items-center gap-3 py-3 cursor-pointer min-h-[44px] transition-colors ${
                    i < participation.length - 1 ? "border-b border-[#f0f0f0]" : ""
                  }`}
                >
                  <div className="flex-1 min-w-0 flex items-center gap-1.5 flex-wrap">
                    {item.is_welfare && (
                      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#f0f1f2] text-[#8f959e]">公益</span>
                    )}
                    <span className="text-[15px] font-medium text-[#2b2f36]">{item.name}</span>
                    {item.owner_name && (
                      <span className="text-[14px] text-[#8f959e]">{item.owner_name}</span>
                    )}
                    {item.extra_badge && (
                      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#f0f1f2] text-[#8f959e]">
                        {item.extra_badge}
                      </span>
                    )}
                  </div>
                  <input
                    type="checkbox"
                    checked={item.participated}
                    onChange={() => toggleParticipation(i)}
                    className="shrink-0 w-5 h-5 rounded border-[#d0d5dd] accent-[#3370ff]"
                  />
                </label>
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-[#b0b5bb] py-4 text-center">暂无活动记录</p>
          )}
        </div>

        {/* 体验输入 */}
        <div className="bg-white rounded-2xl px-5 py-4 mb-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <h2 className="text-[14px] font-medium text-[#2b2f36] mb-3">活动体验</h2>
          <textarea
            value={experience}
            onChange={(e) => { setExperience(e.target.value); setSaved(false) }}
            placeholder="写下今天的活动体验..."
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
        无忧小院数据平台
      </div>
    </div>
  )
}
