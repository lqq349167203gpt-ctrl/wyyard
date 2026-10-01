import { PAGE_LOADERS } from "@/lib/page-registry"
/** 菜单有明确点击意图时，仅预加载页面代码，不请求业务数据。 */
export function prefetchRoute(path: string) {
  const loaders: Record<string, () => Promise<unknown>> = PAGE_LOADERS
  void loaders[path]?.().catch(() => { /* 实际导航时由页面边界展示可重试错误 */ })
}
