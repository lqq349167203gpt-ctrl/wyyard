import { useState, useEffect, useRef } from "react"
import { X, Upload } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { uploadApi, type HealingRecord, type Material } from "@/lib/api"

export default function HealingRecordForm({
  open,
  onOpenChange,
  record,
  customerId,
  customerName,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  record: HealingRecord | null
  customerId: string
  customerName: string
  onSave: (data: any) => void
}) {
  const [date, setDate] = useState("")
  const [title, setTitle] = useState("")
  const [teacher, setTeacher] = useState("")
  const [growthRecord, setGrowthRecord] = useState("")
  const [materials, setMaterials] = useState<Material[]>([])
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (record) {
      setDate(record.date)
      setTitle(record.title)
      setTeacher(record.teacher)
      setGrowthRecord(record.growth_record)
      setMaterials(record.materials || [])
    } else {
      setDate(new Date().toLocaleDateString("sv-SE"))
      setTitle("")
      setTeacher("")
      setGrowthRecord("")
      setMaterials([])
    }
  }, [record, open])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const material = await uploadApi.uploadMaterial(file)
      setMaterials((prev) => [...prev, material])
    } catch {} finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const handleRemoveMaterial = (id: string) => {
    setMaterials((prev) => prev.filter((m) => m.id !== id))
  }

  const handleSave = async () => {
    if (!date || !title.trim()) return
    setSaving(true)
    try {
      await onSave({
        customer_id: customerId,
        customer_name: customerName,
        date,
        title: title.trim(),
        teacher: teacher.trim(),
        growth_record: growthRecord,
        materials,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-4 border-b">
          <DialogTitle className="text-base">{record ? "编辑本次信息" : "新增本次信息"}</DialogTitle>
        </DialogHeader>
        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-[70px_1fr] items-center gap-2">
            <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">日期</span>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-8 text-xs"
            />
          </div>

          <div className="grid grid-cols-[70px_1fr] items-center gap-2">
            <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">标题</span>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="记录标题"
              className="h-8 text-xs"
            />
          </div>

          <div className="grid grid-cols-[70px_1fr] items-center gap-2">
            <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">老师</span>
            <Input
              value={teacher}
              onChange={(e) => setTeacher(e.target.value)}
              placeholder="服务老师"
              className="h-8 text-xs"
            />
          </div>

          <div className="grid grid-cols-[70px_1fr] items-start gap-2">
            <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2">当日记录</span>
            <Textarea
              value={growthRecord}
              onChange={(e) => setGrowthRecord(e.target.value)}
              placeholder="详细记录"
              rows={3}
              className="text-[12px] rounded-[4px] resize-none"
            />
          </div>

          <div className="grid grid-cols-[70px_1fr] items-start gap-2">
            <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-1">附件</span>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleUpload}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  <Upload className="h-3 w-3 mr-1" />
                  {uploading ? "上传中..." : "上传文件"}
                </Button>
              </div>
              {materials.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {materials.map((m) => (
                    <span
                      key={m.id}
                      className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#f5f6f7] text-[11px] text-[#4e535a]"
                    >
                      {m.name}
                      <button
                        className="hover:text-[#c4506a]"
                        onClick={() => handleRemoveMaterial(m.id)}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>取消</Button>
            <Button size="sm" onClick={handleSave} disabled={saving || !date || !title.trim()}>
              {saving ? "保存中..." : "保存"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
