import { Edit, Trash2, FileText, Film } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { HealingRecord } from "@/lib/api"

export default function HealingRecordCard({
  record,
  onEdit,
  onDelete,
}: {
  record: HealingRecord
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className="border rounded-lg p-3 space-y-2">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[#8f959e]">{record.date}</span>
            <span className="text-[13px] text-[#2b2f36] font-medium">{record.title}</span>
          </div>
          {record.teacher && (
            <span className="text-[11px] text-[#4e535a]">老师: {record.teacher}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onEdit}>
            <Edit className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
      </div>

      {record.growth_record && (
        <p className="text-xs text-[#4e535a] whitespace-pre-wrap leading-relaxed">{record.growth_record}</p>
      )}

      {record.materials && record.materials.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {record.materials.map((m) => (
            <a
              key={m.id}
              href={m.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-2 py-1 rounded bg-[#f5f6f7] text-[11px] text-[#4e535a] hover:bg-[#eff0f1] transition-colors"
            >
              {m.name.match(/\.(mp4|mov|avi|mkv)$/i) ? (
                <Film className="h-3 w-3" />
              ) : (
                <FileText className="h-3 w-3" />
              )}
              {m.name}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
