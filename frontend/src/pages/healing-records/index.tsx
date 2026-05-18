import { useState } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import ListView from "./components/list-view"
import DetailView from "./components/detail-view"
import { customerApi, type CustomerCreate } from "@/lib/api"

const emptyCustomer: Partial<CustomerCreate> = {
  nickname: "", name: "", gender: "", phone: "", wechat: "", age: "", referrer: "",
  member_type: "", paid_content: [], visit_count: 0,
  basic_info: "", assessment: "", tags: "", traffic_source: "",
}

export default function HealingRecordsPage() {
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState<Partial<CustomerCreate>>(emptyCustomer)
  const [saving, setSaving] = useState(false)

  const handleSelectCustomer = (customerId: string) => {
    setSelectedCustomerId(customerId)
    setDetailOpen(true)
  }

  const handleAddNew = () => {
    setForm(emptyCustomer)
    setCreateOpen(true)
  }

  const handleDeleteCustomer = async (id: string) => {
    await customerApi.delete(id)
    setRefreshKey(k => k + 1)
  }

  const handleSave = async () => {
    if (!form.nickname?.trim()) return
    setSaving(true)
    try {
      await customerApi.create(form as Partial<CustomerCreate>)
      setCreateOpen(false)
      setRefreshKey(k => k + 1)
    } catch (error) {
      alert(error instanceof Error ? error.message : "保存失败")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="px-6 pt-12 pb-6 space-y-3">
      <div>
        <h1 className="text-lg font-semibold">客户信息</h1>
      </div>

      <div>
        <div className="flex items-center justify-between py-2 border-b border-[#f0f0f0]">
          <div />
          <Button size="sm" className="h-7 text-xs" onClick={handleAddNew}>
            <Plus className="mr-1 h-3.5 w-3.5" /> 新建
          </Button>
        </div>

        <ListView
          key={refreshKey}
          onSelectCustomer={handleSelectCustomer}
          onDeleteCustomer={handleDeleteCustomer}
        />
      </div>

      {/* 客户详情弹窗 */}
      <Dialog open={detailOpen} onOpenChange={(open) => { setDetailOpen(open); if (!open) setSelectedCustomerId(null) }}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto p-0 gap-0">
          <DetailView
            selectedCustomerId={selectedCustomerId}
            onClearSelection={() => setDetailOpen(false)}
            hideSearch
          />
        </DialogContent>
      </Dialog>

      {/* 新建客户弹窗 */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="w-[640px] max-w-[90vw] p-0 gap-0">
          <div className="px-6 pt-3 pb-2 border-b border-[#f0f0f0]">
            <h3 className="text-[14px] font-normal">新建用户</h3>
          </div>
          <div className="px-6 py-5 space-y-4">
            <div className="grid grid-cols-[70px_1fr_70px_1fr] items-start gap-x-3 gap-y-3">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">昵称</span>
              <Input value={form.nickname || ""} onChange={(e) => setForm({ ...form, nickname: e.target.value })} placeholder="请输入" />
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">姓名</span>
              <Input value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="请输入" />

              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">性别</span>
              <select value={form.gender || ""} onChange={(e) => setForm({ ...form, gender: e.target.value })} className="h-8 w-full rounded-md border border-[#dee0e3] bg-white pl-2 pr-7 text-[12px] text-[#2b2f36] outline-none focus:border-[#3370ff] transition-colors appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%238f959e%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:12px] bg-[right_8px_center] bg-no-repeat">
                <option value="">请选择</option>
                <option value="男">男</option>
                <option value="女">女</option>
              </select>
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">电话</span>
              <Input value={form.phone || ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="请输入" />

              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">微信</span>
              <Input value={form.wechat || ""} onChange={(e) => setForm({ ...form, wechat: e.target.value })} placeholder="请输入" />
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">年龄</span>
              <Input value={form.age || ""} onChange={(e) => setForm({ ...form, age: e.target.value })} placeholder="请输入" />

              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">引流人</span>
              <Input value={form.referrer || ""} onChange={(e) => setForm({ ...form, referrer: e.target.value })} placeholder="请输入" />
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">流量来源</span>
              <Input value={form.traffic_source || ""} onChange={(e) => setForm({ ...form, traffic_source: e.target.value })} placeholder="请输入" />
            </div>

            <div className="border-t border-[#f0f0f0]" />

            <div className="space-y-3">
              <div className="grid grid-cols-[70px_1fr] items-start gap-2">
                <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">基础信息</span>
                <Textarea value={form.basic_info || ""} onChange={(e) => setForm({ ...form, basic_info: e.target.value })} rows={1} className="resize-none min-h-0" placeholder="请输入" />
              </div>
              <div className="grid grid-cols-[70px_1fr] items-start gap-2">
                <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">客户评估</span>
                <Textarea value={form.assessment || ""} onChange={(e) => setForm({ ...form, assessment: e.target.value })} rows={1} className="resize-none min-h-0" placeholder="请输入" />
              </div>
              <div className="grid grid-cols-[70px_1fr] items-start gap-2">
                <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">客户标签</span>
                <Textarea value={form.tags || ""} onChange={(e) => setForm({ ...form, tags: e.target.value })} rows={1} className="resize-none min-h-0" placeholder="请输入" />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#f0f0f0]">
              <Button variant="outline" size="sm" onClick={() => setCreateOpen(false)}>取消</Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? "保存中..." : "创建"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
