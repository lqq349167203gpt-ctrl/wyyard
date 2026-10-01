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
  enabled?: boolean
  /** 查询条件的稳定标识；变更时自动请求第一页，旧调用方可继续手动 resetPage。 */
  queryKey?: string
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
  error: string
  refresh: () => void
}

export function useServerPagination<T>(
  fetchFn: (page: number, pageSize: number, isCurrent: () => boolean) => Promise<PaginatedResponse<T>>,
  options: UseServerPaginationOptions = {}
): UseServerPaginationReturn<T> {
  const { pageSize = 10, queryKey, enabled = true } = options
  const [requestPage, setRequestPage] = useState({ key: queryKey, page: 1 })
  const requestedPage = requestPage.key === queryKey ? requestPage.page : 1
  const [currentPage, setCurrentPage] = useState(1)
  const [items, setItems] = useState<T[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [refreshKey, setRefreshKey] = useState(0)
  const fetchRef = useRef(fetchFn)
  const requestSequenceRef = useRef(0)
  const requestedPageRef = useRef(1)

  fetchRef.current = fetchFn

  const fetchData = useCallback(async (page: number) => {
    const requestSequence = ++requestSequenceRef.current
    setLoading(true)
    setError("")
    try {
      const res = await fetchRef.current(page, pageSize, () => requestSequence === requestSequenceRef.current)
      if (requestSequence !== requestSequenceRef.current) return
      setItems(res.items)
      setTotal(res.total)
      setTotalPages(res.total_pages)
      setCurrentPage(res.page)
      requestedPageRef.current = res.page
      if (res.page !== page) setRequestPage({ key: queryKey, page: res.page })
    } catch (requestError) {
      if (requestSequence !== requestSequenceRef.current) return
      setError(requestError instanceof Error ? requestError.message : "数据加载失败，请稍后重试")
    } finally {
      if (requestSequence === requestSequenceRef.current) {
        setLoading(false)
      }
    }
  }, [pageSize, queryKey])

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return
    }
    // 记住当前查询的第一页，避免切回旧条件时恢复之前的页码。
    setRequestPage(previous => previous.key === queryKey ? previous : { key: queryKey, page: 1 })
    requestedPageRef.current = requestedPage
    fetchData(requestedPage)
    // 卸载、切换条件或翻页后，旧响应不再改变列表/错误/加载状态。
    return () => { requestSequenceRef.current++ }
  }, [requestedPage, fetchData, refreshKey, queryKey, enabled])

  const goToPage = useCallback((page: number) => {
    const p = Math.max(1, page)
    if (requestedPageRef.current === p) {
      // 已在当前页，强制重新请求。
      setRefreshKey(k => k + 1)
      return
    }
    requestedPageRef.current = p
    setRequestPage({ key: queryKey, page: p })
  }, [queryKey])

  const refresh = useCallback(() => {
    setRefreshKey(k => k + 1)
  }, [])

  const resetPage = useCallback(() => {
    const alreadyRequestedFirst = requestedPageRef.current === 1
    requestedPageRef.current = 1
    setRequestPage({ key: queryKey, page: 1 })
    if (alreadyRequestedFirst) setRefreshKey(k => k + 1)
  }, [queryKey])

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
    error,
    refresh,
  }
}
