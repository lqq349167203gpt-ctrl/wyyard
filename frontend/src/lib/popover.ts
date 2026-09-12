/**
 * 页面上的浮层（下拉、日历）互相协调：任何一个浮层打开时广播一次，
 * 其他浮层收到后自己收起，避免「日历开着、再去点旁边的下拉」两个浮层叠在一起。
 */
const POPOVER_OPEN_EVENT = "wyyard:popover-open"

interface PopoverOpenDetail {
  /** 打开它的那个控件根节点；浮层收到事件时用它判断是不是自己内部的开合 */
  root?: HTMLElement | null
}

export function broadcastPopoverOpen(root?: HTMLElement | null): void {
  window.dispatchEvent(new CustomEvent<PopoverOpenDetail>(POPOVER_OPEN_EVENT, { detail: { root } }))
}

/** 订阅「别的浮层打开了」：来源在自己容器内的（比如日历里的年月下拉）不算，保持当前浮层不关 */
export function onOtherPopoverOpen(container: HTMLElement | null, handler: () => void): () => void {
  const listener = (event: Event) => {
    const source = (event as CustomEvent<PopoverOpenDetail>).detail?.root
    if (container && source && container.contains(source)) return
    handler()
  }
  window.addEventListener(POPOVER_OPEN_EVENT, listener)
  return () => window.removeEventListener(POPOVER_OPEN_EVENT, listener)
}
