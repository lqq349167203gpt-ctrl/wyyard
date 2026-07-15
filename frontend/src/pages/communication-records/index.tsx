import { useState, useEffect, useCallback } from "react"
import { Plus } from "lucide-react"
import { communicationRecordApi, type CommunicationRecord, type CommunicationRecordCreate } from "@/lib/api"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { usePagination } from "@/hooks/use-pagination"
import { PaginationBar } from "@/components/pagination-bar"

export default function CommunicationRecordsPage() {
  const [records, setRecords] = useState<CommunicationRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<CommunicationRecordCreate>({ customer_nickname: "", content: "" })
  const [saving, setSaving] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await communicationRecordApi.list()
      setRecords(res)
    } catch {
      setRecords([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const { paginatedItems, currentPage, totalPages, totalItems, goToPage, startIndex, endIndex } = usePagination(records, { pageSize: 10 })

  const handleSave = async () => {
    if (!form.customer_nickname.trim() || !form.content.trim()) return
    setSaving(true)
    try {
      await communicationRecordApi.create(form)
      setDialogOpen(false)
      setForm({ customer_nickname: "", content: "" })
      fetchData()
    } catch {
      // ignore
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-full bg-[#f7f8fa] px-2.5 pt-2.5 pb-6">
      <div className="bg-white rounded-[4px] px-[22px] py-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-[16px] font-medium text-[#1f2329]">沟通记录</h1>
          <button
            onClick={() => setDialogOpen(true)}
            className="h-8 px-4 bg-[#3370ff] text-white text-[12px] rounded-[2px] hover:bg-[#2860e1] flex items-center gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            新增
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-[200px] text-[#8f959e] text-[12px]">加载中...</div>
        ) : records.length === 0 ? (
          <div className="flex items-center justify-center h-[200px] text-[#8f959e] text-[12px]">暂无数据</div>
        ) : (
          <div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-[#e8eaed]">
                    <th className="text-left py-2 px-3 font-medium text-[#646a73] w-[120px]">用户昵称</th>
                    <th className="text-left py-2 px-3 font-medium text-[#646a73]">沟通记录</th>
                    <th className="text-left py-2 px-3 font-medium text-[#646a73] w-[100px]">创建人</th>
                    <th className="text-left py-2 px-3 font-medium text-[#646a73] w-[160px]">创建日期</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedItems.map((record) => (
                    <tr key={record.id} className="border-b border-[#f0f1f3] hover:bg-[#f7f8fa]">
                      <td className="py-2 px-3 text-[#4e535a]">{record.customer_nickname}</td>
                      <td className="py-2 px-3 text-[#4e535a]">{record.content}</td>
                      <td className="py-2 px-3 text-[#4e535a]">{record.creator || "-"}</td>
                      <td className="py-2 px-3 text-[#4e535a]">{record.created_at ? new Date(record.created_at).toLocaleString("zh-CN") : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PaginationBar
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalItems}
              startIndex={startIndex}
              endIndex={endIndex}
              onPageChange={goToPage}
            />
          </div>
        )}
      </div>

      {/* 新增弹窗 */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setForm({ customer_nickname: "", content: "" }) }}>
        <DialogContent className="max-w-[500px] p-0">
          <div className="px-5 py-4 border-b border-[#e8eaed]">
            <div className="text-[14px] font-medium text-[#1f2329]">新增沟通记录</div>
          </div>
          <div className="px-5 py-4">
            <div className="grid grid-cols-[80px_1fr] gap-3 items-start mb-4">
              <label className="text-[12px] text-[#646a73] pt-1.5">用户昵称</label>
              <input
                type="text"
                value={form.customer_nickname}
                onChange={(e) => setForm({ ...form, customer_nickname: e.target.value })}
                placeholder="请输入用户昵称"
                className="h-8 px-3 text-[12px] border border-[#e8eaed] rounded-[2px] outline-none focus:border-[#3370ff]"
              />
            </div>
            <div className="grid grid-cols-[80px_1fr] gap-3 items-start">
              <label className="text-[12px] text-[#646a73] pt-1.5">沟通记录</label>
              <textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder="请输入沟通记录"
                rows={4}
                className="px-3 py-2 text-[12px] border border-[#e8eaed] rounded-[2px] outline-none focus:border-[#3370ff] resize-none"
              />
            </div>
          </div>
          <div className="px-5 py-3 border-t border-[#e8eaed] flex justify-end gap-2">
            <button
              onClick={() => { setDialogOpen(false); setForm({ customer_nickname: "", content: "" }) }}
              className="h-8 px-4 text-[12px] text-[#646a73] border border-[#e8eaed] rounded-[2px] hover:bg-[#f5f6f7]"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={!form.customer_nickname.trim() || !form.content.trim() || saving}
              className="h-8 px-4 text-[12px] text-white bg-[#3370ff] rounded-[2px] hover:bg-[#2860e1] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "保存中..." : "保存"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
