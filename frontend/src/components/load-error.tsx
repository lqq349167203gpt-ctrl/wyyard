/** 保留已加载内容时，明确提示当前请求失败，并提供同入口重试。 */
export function LoadError({ error, onRetry }: { error: string; onRetry?: () => void }) {
  if (!error) return null
  return <div role="alert" className="px-4 py-3 text-[12px] text-destructive">
    {error}
    {onRetry && <button type="button" className="ml-3 text-[#3370ff]" onClick={onRetry}>重试</button>}
  </div>
}
