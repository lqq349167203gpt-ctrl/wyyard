import { useCallback, useEffect, useRef, useState } from "react"

/** 小型目录/配置读取共用加载、重试及旧响应保护；业务列表仍使用服务端分页。 */
export function useReadResource<T>(load: () => Promise<T>, initial: T, queryKey = "", enabled = true) {
  const [data, setData] = useState<T>(initial)
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState("")
  const [revision, setRevision] = useState(0)
  const loadRef = useRef(load)
  loadRef.current = load
  useEffect(() => {
    if (!enabled) { setLoading(false); return }
    let current = true
    setLoading(true); setError("")
    loadRef.current().then(result => { if (current) setData(result) })
      .catch(reason => { if (current) setError(reason instanceof Error ? reason.message : "数据加载失败") })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [queryKey, revision, enabled])
  const refresh = useCallback(() => setRevision(value => value + 1), [])
  return { data, setData, loading, error, refresh }
}
