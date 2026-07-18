import { useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"

interface PaginationBarProps {
  currentPage: number
  totalPages: number
  totalItems: number
  startIndex: number
  endIndex: number
  onPageChange: (page: number) => void
  /** 计数单位文案，默认「条」；如按天分页可传「天」 */
  unit?: string
}

export function PaginationBar({
  currentPage,
  totalPages,
  totalItems,
  startIndex,
  endIndex,
  onPageChange,
  unit = "条",
}: PaginationBarProps) {
  const [jumpValue, setJumpValue] = useState("")

  if (totalItems === 0) return null

  const getPageNumbers = () => {
    const pages: (number | "ellipsis")[] = []
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i)
    } else {
      pages.push(1)
      if (currentPage > 3) pages.push("ellipsis")
      const start = Math.max(2, currentPage - 1)
      const end = Math.min(totalPages - 1, currentPage + 1)
      for (let i = start; i <= end; i++) pages.push(i)
      if (currentPage < totalPages - 2) pages.push("ellipsis")
      pages.push(totalPages)
    }
    return pages
  }

  const handleJump = () => {
    const page = parseInt(jumpValue)
    if (page >= 1 && page <= totalPages) {
      onPageChange(page)
      setJumpValue("")
    }
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-[#f0f0f0] px-4 pt-[5px] pb-2.5">
      <span className="shrink-0 whitespace-nowrap text-xs text-[#8f959e]">
        共 <span className="text-[#2b2f36] font-medium">{totalItems}</span> {unit}
        {totalPages > 1 && (
          <span className="ml-1">
            ，第 {startIndex}-{endIndex} {unit}
          </span>
        )}
      </span>
      {totalPages > 1 && (
        <div className="ml-auto flex max-w-full items-center gap-1 overflow-x-auto pb-px scrollbar-hide">
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#646a73] transition-colors hover:bg-[#f5f6f7] disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          {getPageNumbers().map((item, i) =>
            item === "ellipsis" ? (
              <span key={`e${i}`} className="flex h-7 w-7 shrink-0 items-center justify-center text-xs text-[#c0c4cc]">
                ···
              </span>
            ) : (
              <button
                key={item}
                onClick={() => onPageChange(item)}
                className={`h-7 w-7 shrink-0 rounded-md text-xs font-medium transition-colors ${
                  item === currentPage
                    ? "bg-[#3370ff] text-white shadow-sm"
                    : "text-[#2b2f36] hover:bg-[#f5f6f7]"
                }`}
              >
                {item}
              </button>
            )
          )}
          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#646a73] transition-colors hover:bg-[#f5f6f7] disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <span className="ml-1 shrink-0 text-[11px] text-[#646a73]">前往</span>
          <input
            value={jumpValue}
            onChange={(e) => setJumpValue(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => { if (e.key === "Enter") handleJump() }}
            placeholder={`${currentPage}`}
            className="h-7 w-[27px] shrink-0 rounded border border-[#e8e8e8] text-center text-xs outline-none focus:border-[#3370ff]"
          />
          <span className="shrink-0 text-[11px] text-[#646a73]">页</span>
        </div>
      )}
    </div>
  )
}
