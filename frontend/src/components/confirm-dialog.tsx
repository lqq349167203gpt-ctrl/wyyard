import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

export type ConfirmDialogOptions = {
  title: string
  /** 标题下面的一句说明；不传就不显示这一行 */
  description?: string
  /** 需要逐条列出来的内容（比如每一个客户的抵扣），一行一条 */
  items?: string[]
  /** 列表下面的补充说明，比如「是否继续？」 */
  hint?: string
  confirmText?: string
  cancelText?: string
}

type PendingConfirm = ConfirmDialogOptions & { resolve: (confirmed: boolean) => void }

let pushConfirm: ((pending: PendingConfirm) => void) | null = null

/**
 * 应用内确认弹窗，替代浏览器自带的 window.confirm。
 * 确认返回 true，取消（含点遮罩、按 ESC）返回 false。
 */
export function confirmDialog(options: ConfirmDialogOptions): Promise<boolean> {
  if (!pushConfirm) {
    // 极少数情况下弹窗容器还没挂载（比如首屏请求就命中），退回浏览器弹窗，不至于卡住操作
    const text = [options.title, options.description, ...(options.items ?? []), options.hint].filter(Boolean).join("\n")
    return Promise.resolve(window.confirm(text))
  }
  return new Promise<boolean>(resolve => pushConfirm!({ ...options, resolve }))
}

/** 挂在 App 根部；全站共用同一个弹窗容器 */
export function ConfirmHost() {
  const [pending, setPending] = useState<PendingConfirm | null>(null)
  useEffect(() => {
    pushConfirm = setPending
    return () => { pushConfirm = null }
  }, [])

  const settle = (confirmed: boolean) => {
    const current = pending
    setPending(null)
    current?.resolve(confirmed)
  }

  if (!pending) return null
  return (
    <Dialog open onOpenChange={open => { if (!open) settle(false) }}>
      <DialogContent
        initialFocus={false}
        className="flex w-[420px] max-w-[92vw] flex-col gap-0 overflow-hidden rounded-[8px] border-[0.5px] border-[#e8eaed] p-0"
      >
        <DialogHeader className="gap-0 border-b-[0.5px] border-[#f0f0f0] px-5 py-3">
          <DialogTitle className="text-[14px] font-medium text-[#1f2329]">{pending.title}</DialogTitle>
          {pending.description && <p className="mt-1 text-[12px] leading-5 text-[#8f959e]">{pending.description}</p>}
        </DialogHeader>
        <div className="flex flex-col gap-2.5 px-5 py-4">
          {!!pending.items?.length && (
            <div className="overflow-hidden rounded-[6px] border border-[#f0f1f3] bg-[#fcfcfd]">
              {pending.items.map((item, index) => (
                <div
                  key={`${index}-${item}`}
                  className={`px-3 py-2 text-[12.5px] leading-5 text-[#2b2f36] ${index ? "border-t border-[#f0f1f3]" : ""}`}
                >
                  {item}
                </div>
              ))}
            </div>
          )}
          {pending.hint && <p className="text-[12.5px] leading-5 text-[#4e535a]">{pending.hint}</p>}
        </div>
        <DialogFooter className="!mx-0 !mb-0 !rounded-b-none !bg-transparent flex-row justify-end gap-2 border-t-[0.5px] border-[#f0f0f0] px-5 py-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => settle(false)}
            className="h-8 rounded-[4px] border-[0.5px] border-[#e1e4e7] bg-white px-4 text-[12px] font-normal text-[#646a73] shadow-none hover:bg-[#f7f8fa]"
          >
            {pending.cancelText || "取消"}
          </Button>
          <Button
            size="sm"
            onClick={() => settle(true)}
            className="h-8 rounded-[4px] border border-[#3370ff] bg-[#3370ff] px-4 text-[12px] font-normal text-white shadow-none hover:border-[#285dcc] hover:bg-[#285dcc]"
          >
            {pending.confirmText || "确认"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
