import { useState, useCallback, useRef } from "react"
import { Bell } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { businessReminderApi, type BusinessReminderItem } from "@/lib/api"
import { useServerPagination } from "@/hooks/use-server-pagination"
import { PaginationBar } from "@/components/pagination-bar"

export default function BusinessRemindersPage() {
  const [tab, setTab] = useState<"pending" | "handled">("pending")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [targetItem, setTargetItem] = useState<BusinessReminderItem | null>(null)
  const [desc, setDesc] = useState("")
  const tabRef = useRef(tab)

  const fetchItems = useCallback(async (page: number, pageSize: number) => {
    const cu = JSON.parse(localStorage.getItem("currentUser") || "{}")
    if (!cu.id || !cu.role) {
      return { items: [], total: 0, page: 1, page_size: pageSize, total_pages: 1 }
    }
    const handled = tabRef.current === "handled"
    return businessReminderApi.listPaginated(cu.id, cu.role, handled, page, pageSize)
  }, [])

  const {
    paginatedItems, currentPage, totalPages, totalItems,
    goToPage, startIndex, endIndex, loading, refresh,
  } = useServerPagination<BusinessReminderItem>(fetchItems, { pageSize: 10 })

  const switchTab = (newTab: "pending" | "handled") => {
    setTab(newTab)
    tabRef.current = newTab
    goToPage(1)
  }

  const openDialog = (item: BusinessReminderItem) => {
    setTargetItem(item)
    setDesc("")
    setDialogOpen(true)
  }

  const handleConfirm = async () => {
    if (!targetItem) return
    const id = targetItem.id
    setDialogOpen(false)
    setTargetItem(null)
    try {
      await businessReminderApi.toggle(id, desc)
      refresh()
    } catch {
      // ignore
    }
  }

  return (
    <div className="px-6 pt-4 pb-6 space-y-3">
      {/* Tab 切换 */}
      <div className="flex items-center border-b border-[#e8e8e8] -mx-6 px-6 min-h-[39px]">
        <div className="flex items-center gap-6">
          <button
            className={`relative px-1 pb-2 text-[14px] transition-colors ${
              tab === "pending" ? "text-[#3370ff]" : "text-[#2b2f36] hover:text-[#4e535a]"
            }`}
            onClick={() => switchTab("pending")}
          >
            未处理
            {tab === "pending" && <span className="absolute bottom-[-5px] left-0 right-0 h-[3px] bg-[#3370ff] rounded-t-sm" />}
          </button>
          <button
            className={`relative px-1 pb-2 text-[14px] transition-colors ${
              tab === "handled" ? "text-[#3370ff]" : "text-[#2b2f36] hover:text-[#4e535a]"
            }`}
            onClick={() => switchTab("handled")}
          >
            已处理
            {tab === "handled" && <span className="absolute bottom-[-5px] left-0 right-0 h-[3px] bg-[#3370ff] rounded-t-sm" />}
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between min-h-[32px]">
        <p className="text-xs text-muted-foreground">
          共 {totalItems} 条{tab === "pending" ? "未处理" : "已处理"}提醒
        </p>
      </div>

      {/* 表格 */}
      <div className="bg-white rounded-lg">
        {loading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">加载中...</div>
        ) : totalItems === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="rounded-full bg-muted p-3 mb-3">
              <Bell className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              {tab === "pending" ? "暂无未处理提醒" : "暂无已处理提醒"}
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">昵称</TableHead>
                <TableHead>提醒名称</TableHead>
                <TableHead>提醒信息</TableHead>
                <TableHead>状态</TableHead>
                {tab === "handled" && <TableHead>处理描述</TableHead>}
                {tab === "pending" && <TableHead className="text-right pr-4">操作</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedItems.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="pl-4 text-[#2b2f36] font-medium">{item.nickname}</TableCell>
                  <TableCell className="text-[#2b2f36]">{item.reminder_name}</TableCell>
                  <TableCell className="text-[#8f959e]">{item.message}</TableCell>
                  <TableCell>
                    {item.handled ? (
                      <span className="text-[#2b2f36]">已处理</span>
                    ) : (
                      <span className="text-[#bfbfbf]">未处理</span>
                    )}
                  </TableCell>
                  {tab === "handled" && (
                    <TableCell className="text-[#8f959e]">{item.description || "-"}</TableCell>
                  )}
                  {tab === "pending" && (
                    <TableCell className="text-right pr-4">
                      <button
                        className="text-[13px] text-[#3370ff] hover:underline"
                        onClick={() => openDialog(item)}
                      >
                        处理
                      </button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <PaginationBar
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={totalItems}
          startIndex={startIndex}
          endIndex={endIndex}
          onPageChange={goToPage}
        />
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-[15px] font-medium">处理信息</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-5">
            <Textarea
              placeholder="请输入处理描述..."
              value={desc}
              onChange={e => setDesc(e.target.value)}
              rows={4}
              className="text-[13px] resize-none placeholder:text-[#c9cdd4]"
            />
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" className="h-8 px-4" onClick={() => setDialogOpen(false)}>取消</Button>
              <Button size="sm" className="h-8 px-4" onClick={handleConfirm}>确定</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
