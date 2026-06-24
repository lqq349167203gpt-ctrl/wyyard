import { useState, useMemo, useEffect, useCallback } from "react"

interface UsePaginationOptions {
  pageSize?: number
}

interface UsePaginationReturn<T> {
  paginatedItems: T[]
  currentPage: number
  totalPages: number
  totalItems: number
  goToPage: (page: number) => void
  startIndex: number
  endIndex: number
}

export function usePagination<T>(
  items: T[],
  options: UsePaginationOptions = {}
): UsePaginationReturn<T> {
  const { pageSize = 10 } = options
  const [currentPage, setCurrentPage] = useState(1)

  const totalItems = items.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))

  const clampedPage = Math.min(currentPage, totalPages)

  const paginatedItems = useMemo(() => {
    const start = (clampedPage - 1) * pageSize
    return items.slice(start, start + pageSize)
  }, [items, clampedPage, pageSize])

  const startIndex = totalItems === 0 ? 0 : (clampedPage - 1) * pageSize + 1
  const endIndex = Math.min(clampedPage * pageSize, totalItems)

  const goToPage = useCallback((page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)))
  }, [totalPages])

  return {
    paginatedItems,
    currentPage: clampedPage,
    totalPages,
    totalItems,
    goToPage,
    startIndex,
    endIndex,
  }
}
