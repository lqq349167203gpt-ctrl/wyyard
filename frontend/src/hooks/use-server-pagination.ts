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
  resetPage: () => void
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
  const requestSequenceRef = useRef(0)

  fetchRef.current = fetchFn

  const fetchData = useCallback(async (page: number) => {
    const requestSequence = ++requestSequenceRef.current
    setLoading(true)
    try {
      const res = await fetchRef.current(page, pageSize)
      if (requestSequence !== requestSequenceRef.current) return
      setItems(res.items)
      setTotal(res.total)
      setTotalPages(res.total_pages)
      setCurrentPage(res.page)
    } catch {
      // 失败时不覆盖已有数据，避免闪现 0 条
    } finally {
      if (requestSequence === requestSequenceRef.current) {
        setLoading(false)
      }
    }
  }, [pageSize])

  useEffect(() => {
    fetchData(currentPage)
  }, [currentPage, fetchData, refreshKey])

  const goToPage = useCallback((page: number) => {
    const p = Math.max(1, page)
    setCurrentPage(prev => {
      if (prev === p) {
        // 已在当前页，强制重新请求
        setRefreshKey(k => k + 1)
      }
      return p
    })
  }, [])

  const refresh = useCallback(() => {
    setRefreshKey(k => k + 1)
  }, [])

  const resetPage = useCallback(() => {
    setCurrentPage(1)
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
    resetPage,
    startIndex,
    endIndex,
    loading,
    refresh,
  }
}
