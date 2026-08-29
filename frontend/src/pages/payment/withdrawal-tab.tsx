import { useEffect, useMemo, useState } from "react"
import { Inbox, X } from "lucide-react"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { classRecordApi, type WithdrawalRecord } from "@/lib/api"

export function WithdrawalTab() {
  const [records, setRecords] = useState<WithdrawalRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [searchNickname, setSearchNickname] = useState("")
  const [cancelTarget, setCancelTarget] = useState<WithdrawalRecord | null>(null)
  const [cancelling, setCancelling] = useState(false)

  const loadRecords = () => {
    setLoading(true)
    classRecordApi.listWithdrawals().then((data) => {
      setRecords(data)
    }).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => {
    loadRecords()
  }, [])

  const filtered = useMemo(() => {
    return records.filter(r => {
      if (dateFrom && r.date < dateFrom) return false
      if (dateTo && r.date > dateTo) return false
      if (searchNickname && !(r.nickname || "").includes(searchNickname)) return false
      return true
    })
  }, [records, dateFrom, dateTo, searchNickname])

  const handleCancel = async () => {
    if (!cancelTarget || cancelling) return
    setCancelling(true)
    try {
      await classRecordApi.cancelWithdrawal(cancelTarget.record_id, cancelTarget.customer_id)
      setCancelTarget(null)
      loadRecords()
    } catch (error: any) {
      const msg = error?.response?.data?.detail || error?.message || "取消退课失败"
      alert(msg)
    } finally {
      setCancelling(false)
    }
  }

  const handleClear = () => {
    setDateFrom("")
    setDateTo("")
    setSearchNickname("")
  }

  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0">
      <div className="rounded-xl bg-white shadow-[0_2px_4px_rgba(33,38,49,.05)] overflow-hidden flex flex-col flex-1 min-h-0">
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-[#f0f0f0]">
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="h-8 rounded-[4px] border border-[#e1e4e7] bg-white px-2 text-[12px] text-[#2b2f36] outline-none focus:border-[#3370ff]"
          />
          <span className="text-[12px] text-[#8f959e]">至</span>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="h-8 rounded-[4px] border border-[#e1e4e7] bg-white px-2 text-[12px] text-[#2b2f36] outline-none focus:border-[#3370ff]"
          />
          <input
            type="text"
            value={searchNickname}
            onChange={e => setSearchNickname(e.target.value)}
            placeholder="搜索客户"
            className="h-8 w-[160px] rounded-[4px] border border-[#e1e4e7] bg-white px-2.5 text-[12px] text-[#2b2f36] outline-none placeholder:text-[#a8b1bd] focus:border-[#3370ff]"
          />
          <button
            onClick={handleClear}
            className="flex h-8 items-center gap-1 rounded-[4px] border border-[#dee0e3] bg-white px-4 text-[12px] text-[#4e535a] hover:bg-[#f5f6f7]"
          >
            <X className="h-3.5 w-3.5" />
            清空
          </button>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <Inbox className="h-8 w-8 text-[#d0d3d6]" />
            <span className="text-[12px] text-[#8f959e]">加载中...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <Inbox className="h-8 w-8 text-[#d0d3d6]" />
            <span className="text-[12px] text-[#8f959e]">暂无退课记录</span>
          </div>
        ) : (
          <Table style={{ tableLayout: "fixed" }}>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4" style={{ width: "160px" }}>昵称</TableHead>
                <TableHead>课程名称</TableHead>
                <TableHead style={{ width: "120px" }}>日期</TableHead>
                <TableHead style={{ width: "90px" }}>时间</TableHead>
                <TableHead className="text-right pr-4" style={{ width: "120px" }}>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(r => (
                <TableRow key={`${r.record_id}:${r.customer_id}`} className="group hover:bg-[#f7f8fa]">
                  <TableCell className="pl-4">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#eef0f2] text-[12px] font-medium text-[#646a73]">
                        {(r.nickname || "客").charAt(0)}
                      </span>
                      <span className="truncate text-[13px] font-medium text-[#212631]">{r.nickname}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-[12px] text-[#2b2f36] truncate block" title={r.activity_name}>{r.activity_name}</span>
                  </TableCell>
                  <TableCell className="tabular-nums text-[12px] text-[#2b2f36]">{r.date}</TableCell>
                  <TableCell className="tabular-nums text-[12px] text-[#2b2f36]">{r.start_time}</TableCell>
                  <TableCell className="text-right pr-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-[12px] text-[#c4506a] hover:bg-[#fdf0f2]"
                      onClick={() => setCancelTarget(r)}
                    >
                      取消退课
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <AlertDialog open={!!cancelTarget} onOpenChange={(open) => { if (!open) setCancelTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>取消退课</AlertDialogTitle>
            <AlertDialogDescription>
              确定要取消 {cancelTarget?.nickname} 在「{cancelTarget?.activity_name}」的退课吗？取消后将恢复该客户的扣卡记录。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancel} disabled={cancelling}>
              {cancelling ? "处理中..." : "确认取消退课"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
