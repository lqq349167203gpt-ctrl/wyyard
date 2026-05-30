import { useState, useCallback, useEffect, useRef } from "react"

interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

interface UseServerPaginationOptions {
  pageSize?: number
}

interface UseServerPaginationReturn<T> {
  paginatedItems: T[]
  currentPage: number
  totalPages: number
  totalItems: number
  goToPage: (page: number) => void
  startIndex: number
  endIndex: number
  loading: boolean
  refresh: () => void
}

export function useServerPagination<T>(
  fetchFn: (page: number, pageSize: number) => Promise<PaginatedResponse<T>>,
  options: UseServerPaginationOptions = {}
): UseServerPaginationReturn<T> {
  const { pageSize = 10 } = options
  const [currentPage, setCurrentPage] = useState(1)
  const [items, setItems] = useState<T[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const fetchRef = useRef(fetchFn)

  fetchRef.current = fetchFn

  const fetchData = useCallback(async (page: number) => {
    setLoading(true)
    try {
      const res = await fetchRef.current(page, pageSize)
      setItems(res.items)
      setTotal(res.total)
      setTotalPages(res.total_pages)
      setCurrentPage(res.page)
    } catch {
      // 失败时不覆盖已有数据，避免闪现 0 条
    } finally {
      setLoading(false)
    }
  }, [pageSize])

  useEffect(() => {
    fetchData(currentPage)
  }, [currentPage, fetchData, refreshKey])

  const goToPage = useCallback((page: number) => {
    const p = Math.max(1, page)
    setCurrentPage(p)
    // If already on this page, force a re-fetch via refreshKey
    setCurrentPage(prev => {
      if (prev === p) {
        setRefreshKey(k => k + 1)
      }
      return p
    })
  }, [])

  const refresh = useCallback(() => {
    setRefreshKey(k => k + 1)
  }, [])

  const totalItems = total
  const startIndex = total === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const endIndex = Math.min(currentPage * pageSize, total)

  return {
    paginatedItems: items,
    currentPage,
    totalPages,
    totalItems,
    goToPage,
    startIndex,
    endIndex,
    loading,
    refresh,
  }
}
