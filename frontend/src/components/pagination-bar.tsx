import { ChevronLeft, ChevronRight } from "lucide-react"

interface PaginationBarProps {
  currentPage: number
  totalPages: number
  totalItems: number
  startIndex: number
  endIndex: number
  onPageChange: (page: number) => void
}

export function PaginationBar({
  currentPage,
  totalPages,
  totalItems,
  startIndex,
  endIndex,
  onPageChange,
}: PaginationBarProps) {
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

  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="text-xs text-[#8f959e]">
        共 <span className="text-[#2b2f36] font-medium">{totalItems}</span> 条
        {totalPages > 1 && (
          <span className="ml-1">
            ，第 {startIndex}-{endIndex} 条
          </span>
        )}
      </span>
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="inline-flex items-center justify-center w-7 h-7 rounded-md text-[#646a73] hover:bg-[#f5f6f7] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          {getPageNumbers().map((item, i) =>
            item === "ellipsis" ? (
              <span key={`e${i}`} className="w-7 h-7 flex items-center justify-center text-[#c0c4cc] text-xs">
                ···
              </span>
            ) : (
              <button
                key={item}
                onClick={() => onPageChange(item)}
                className={`w-7 h-7 rounded-md text-xs font-medium transition-colors ${
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
            className="inline-flex items-center justify-center w-7 h-7 rounded-md text-[#646a73] hover:bg-[#f5f6f7] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}
