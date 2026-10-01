import { Component, Suspense, type ReactNode } from "react"
import { useLocation } from "react-router-dom"

class PageLoadBoundary extends Component<{ path: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() { return { failed: true } }

  componentDidUpdate(previous: Readonly<{ path: string; children: ReactNode }>) {
    if (previous.path !== this.props.path && this.state.failed) this.setState({ failed: false })
  }

  render() {
    if (this.state.failed) return <div role="alert" className="p-6 text-sm text-[#646a73]">
      页面加载失败，请重试。
      <button className="ml-3 text-[#3370ff]" onClick={() => window.location.reload()}>重新加载</button>
    </div>
    return this.props.children
  }
}

/** 仅替换内容区，页面代码加载时保留菜单、顶部导航和登录守卫。 */
export function RouteContent({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  return <PageLoadBoundary path={pathname}>
    <Suspense fallback={<div role="status" className="p-6 text-sm text-[#8f959e]">页面加载中…</div>}>
      {children}
    </Suspense>
  </PageLoadBoundary>
}
