import { useState, useEffect, useMemo } from "react"
import { useEnterToNext } from "@/hooks/use-enter-to-next"
import { Plus, Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { CustomerSearchInput } from "@/components/customer-search-input"
import { SelectDropdown } from "@/components/select-dropdown"
import ListView from "./components/list-view"
import DetailView from "./components/detail-view"
import { customerApi, type Customer, type CustomerCreate, type CustomerLight } from "@/lib/api"

const emptyCustomer: Record<string, any> = {
  nickname: "", name: "", gender: "", phone: "", wechat: "", age: "", age_range: "", referrer: "",
  member_type: "", paid_content: [], visit_count: 0,
  basic_info: "", assessment: "", tags: "", traffic_source: "", traffic_source_detail: "",
}

export default function HealingRecordsPage() {
  const enterToNext = useEnterToNext()
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [createOpen, setCreateOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<Record<string, any>>(emptyCustomer)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState("")
  const [referrerError, setReferrerError] = useState("")
  const [referrerHandlerError, setReferrerHandlerError] = useState("")
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; nickname: string } | null>(null)
  const [deleteConfirmName, setDeleteConfirmName] = useState("")
  const [customers, setCustomers] = useState<CustomerLight[]>([])

  // 搜索状态
  const [searchNickname, setSearchNickname] = useState("")
  const [searchIdentity, setSearchIdentity] = useState("")
  const [searchReferrer, setSearchReferrer] = useState("")
  const [searchReferrerHandler, setSearchReferrerHandler] = useState("")
  const [appliedNickname, setAppliedNickname] = useState("")
  const [appliedIdentity, setAppliedIdentity] = useState("")
  const [appliedReferrer, setAppliedReferrer] = useState("")
  const [appliedReferrerHandler, setAppliedReferrerHandler] = useState("")
  const [filterKey, setFilterKey] = useState(0)

  useEffect(() => {
    customerApi.light().then(setCustomers).catch(() => {})
  }, [])

  const identities = useMemo(() =>
    [...new Set(customers.map(c => c.member_type).filter(Boolean))].sort()
  , [customers])

  const handleSearch = () => {
    setAppliedNickname(searchNickname)
    setAppliedIdentity(searchIdentity)
    setAppliedReferrer(searchReferrer)
    setAppliedReferrerHandler(searchReferrerHandler)
    setFilterKey(k => k + 1)
  }

  const handleClear = () => {
    setSearchNickname("")
    setSearchIdentity("")
    setSearchReferrer("")
    setSearchReferrerHandler("")
    setAppliedNickname("")
    setAppliedIdentity("")
    setAppliedReferrer("")
    setAppliedReferrerHandler("")
    setFilterKey(k => k + 1)
  }

  const handleSelectCustomer = (customerId: string) => {
    setSelectedCustomerId(customerId)
    setDetailOpen(true)
  }

  const handleAddNew = () => {
    setEditingId(null)
    setForm(emptyCustomer)
    setCreateOpen(true)
  }

  const handleEditCustomer = async (id: string) => {
    try {
      const c = await customerApi.get(id)
      const ageParts = (c.age || "").match(/^(\d+)(?:\s*\(([^)]+)\))?$/)
      const isRangeOnly = /^\d+~\d+\+?$|^\d+\+$/.test(c.age || "")
      setForm({
        ...emptyCustomer,
        ...c,
        age: ageParts ? ageParts[1] || "" : isRangeOnly ? "" : c.age || "",
        age_range: ageParts?.[2] || (isRangeOnly ? c.age : ""),
      })
      setEditingId(id)
      setCreateOpen(true)
    } catch {
      alert("加载客户信息失败")
    }
  }

  const handleDeleteCustomer = (id: string, nickname: string) => {
    setDeleteTarget({ id, nickname })
    setDeleteConfirmName("")
  }

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return
    await customerApi.delete(deleteTarget.id)
    setDeleteTarget(null)
    setRefreshKey(k => k + 1)
  }

  const handleSave = async () => {
    if (!form.nickname?.trim()) return

    // 验证引流人和承接人必须是已有客户昵称
    const nicknames = new Set(customers.map(c => c.nickname))
    let hasError = false
    setReferrerError("")
    setReferrerHandlerError("")

    if (form.referrer?.trim() && !nicknames.has(form.referrer.trim())) {
      setReferrerError("引流人不存在")
      hasError = true
    }
    if (form.referrer_handler?.trim() && !nicknames.has(form.referrer_handler.trim())) {
      setReferrerHandlerError("承接人不存在")
      hasError = true
    }
    if (hasError) return

    setSaving(true)
    setSaveError("")
    try {
      const data = { ...form }
      const range = form.age_range
      if (range) {
        data.age = form.age ? `${form.age} (${range})` : range
      }
      delete data.age_range
      if (editingId) {
        await customerApi.update(editingId, data as Partial<CustomerCreate>)
      } else {
        await customerApi.create(data as Partial<CustomerCreate>)
      }
      setCreateOpen(false)
      setRefreshKey(k => k + 1)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "保存失败")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-lg font-semibold">客户信息</h1>
        <p className="text-xs text-muted-foreground mt-0.5">管理与查看全部客户资料</p>
      </div>

      {/* 搜索栏 */}
      <div className="flex items-end gap-3 flex-wrap">
        <div className="w-44">
          <CustomerSearchInput
            customers={customers}
            value={searchNickname}
            onChange={(v) => setSearchNickname(typeof v === "string" ? v : "")}
            placeholder="搜索昵称"
            filterSelected={false}
          />
        </div>
        <SelectDropdown
          className="w-36"
          value={searchIdentity}
          options={[{value: "", label: "全部身份"}, ...identities.map(id => ({value: id, label: id}))]}
          placeholder="全部身份"
          onChange={(v) => setSearchIdentity(v)}
        />
        <div className="w-44">
          <CustomerSearchInput
            customers={customers}
            value={searchReferrer}
            onChange={(v) => setSearchReferrer(typeof v === "string" ? v : "")}
            placeholder="搜索引流人"
            filterSelected={false}
          />
        </div>
        <div className="w-44">
          <CustomerSearchInput
            customers={customers}
            value={searchReferrerHandler}
            onChange={(v) => setSearchReferrerHandler(typeof v === "string" ? v : "")}
            placeholder="搜索承接人"
            filterSelected={false}
          />
        </div>
        <button
          onClick={handleSearch}
          className="h-8 px-4 rounded-md bg-[#3370ff] text-white text-[12px] hover:bg-[#2860e1] flex items-center gap-1"
        >
          <Search className="h-3.5 w-3.5" />
          查询
        </button>
        <button
          onClick={handleClear}
          className="h-8 px-4 rounded-md border border-[#e0e0e0] text-[12px] text-[#4e535a] hover:bg-[#f5f6f7] flex items-center gap-1"
        >
          <X className="h-3.5 w-3.5" />
          清空
        </button>
        <div className="flex-1" />
        <Button size="sm" className="h-8 text-xs" onClick={handleAddNew}>
          <Plus className="mr-1 h-3.5 w-3.5" /> 新建
        </Button>
      </div>

      <ListView
        key={`${refreshKey}-${filterKey}`}
        onSelectCustomer={handleSelectCustomer}
        onDeleteCustomer={handleDeleteCustomer}
        onEditCustomer={handleEditCustomer}
        filterNickname={appliedNickname}
        filterIdentity={appliedIdentity}
        filterReferrer={appliedReferrer}
        filterReferrerHandler={appliedReferrerHandler}
      />

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
      <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open) }}>
        <DialogContent className="w-[640px] max-w-[90vw] p-0 gap-0">
          <div className="px-6 pt-3 pb-2 border-b border-[#f0f0f0]">
            <h3 className="text-[14px] font-normal">{editingId ? "编辑用户" : "新建用户"}</h3>
          </div>
          <div className="px-6 py-5 space-y-4" {...enterToNext}>
            <div className="grid grid-cols-[70px_1fr_70px_1fr] items-start gap-x-3 gap-y-3">
              <span className="text-[12px] text-[#4e535a] font-light block text-right tracking-widest pt-2.5">昵称</span>
              <div>
                <Input value={form.nickname || ""} onChange={(e) => { setForm({ ...form, nickname: e.target.value }); setSaveError("") }} placeholder="请输入" />
                {saveError && saveError.includes("昵称") && <p className="text-[11px] text-[#f54a45] mt-1">{saveError}</p>}
              </div>
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">姓名</span>
              <Input value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="请输入" />

              <span className="text-[12px] text-[#4e535a] font-light block text-right tracking-widest pt-2.5">性别</span>
              <SelectDropdown
                value={form.gender || ""}
                options={[{value: "男", label: "男"}, {value: "女", label: "女"}]}
                placeholder="请选择"
                onChange={(v) => setForm({ ...form, gender: v })}
              />
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">电话</span>
              <Input value={form.phone || ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="请输入" />

              <span className="text-[12px] text-[#4e535a] font-light block text-right tracking-widest pt-2.5">微信</span>
              <div>
                <Input value={form.wechat || ""} onChange={(e) => { setForm({ ...form, wechat: e.target.value }); setSaveError("") }} placeholder="请输入" />
                {saveError && saveError.includes("微信") && <p className="text-[11px] text-[#f54a45] mt-1">{saveError}</p>}
              </div>
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">年龄</span>
              <div className="grid grid-cols-2 gap-2">
                <Input value={form.age || ""} onChange={(e) => { const v = e.target.value; const n = parseInt(v); let range = ""; if (n >= 60) range = "60+"; else if (n >= 51) range = "51~60"; else if (n >= 41) range = "41~50"; else if (n >= 31) range = "31~40"; else if (n >= 18) range = "18~30"; setForm({ ...form, age: v, age_range: range }); }} placeholder="具体年龄" />
                <SelectDropdown
                  value={form.age_range || ""}
                  options={["18~30", "31~40", "41~50", "51~60", "60+"].map(v => ({value: v, label: v}))}
                  placeholder="年龄段"
                  onChange={(v) => setForm({ ...form, age_range: v })}
                />
              </div>

              <span className="text-[12px] text-[#4e535a] font-light block text-right tracking-widest pt-2.5">引流人</span>
              <div>
                <CustomerSearchInput
                  customers={customers}
                  value={form.referrer || ""}
                  onChange={(v) => { setForm({ ...form, referrer: typeof v === "string" ? v : v[0] || "" }); setReferrerError("") }}
                  placeholder="请搜索"
                  excludeIds={form.id ? [form.id] : []}
                  filterSelected={false}
                />
                {referrerError && <p className="text-[11px] text-[#f54a45] mt-0.5">{referrerError}</p>}
              </div>
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">承接人</span>
              <div>
                <CustomerSearchInput
                  customers={customers}
                  value={form.referrer_handler || ""}
                  onChange={(v) => { setForm({ ...form, referrer_handler: typeof v === "string" ? v : v[0] || "" }); setReferrerHandlerError("") }}
                  placeholder="请搜索"
                  excludeIds={form.id ? [form.id] : []}
                  filterSelected={false}
                />
                {referrerHandlerError && <p className="text-[11px] text-[#f54a45] mt-0.5">{referrerHandlerError}</p>}
              </div>
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">流量来源</span>
              <div className="flex items-center gap-2">
                <SelectDropdown
                  className={["小红书", "抖音", "公众号", "视频号"].includes(form.traffic_source) ? "w-[calc(50%-3px)] min-w-0" : ["好友推荐", "朋友圈"].includes(form.traffic_source) ? "flex-1 min-w-0" : "w-full"}
                  value={form.traffic_source || ""}
                  options={["小红书", "抖音", "公众号", "视频号", "朋友圈", "美团", "大众点评", "好友推荐"].map(v => ({value: v, label: v}))}
                  placeholder="请选择"
                  onChange={(v) => setForm({ ...form, traffic_source: v, traffic_source_detail: "" })}
                />
                {["小红书", "抖音", "公众号", "视频号"].includes(form.traffic_source) && (
                  <Input value={form.traffic_source_detail || ""} onChange={(e) => setForm({ ...form, traffic_source_detail: e.target.value })} placeholder="内容链接" className="h-8 flex-1 text-[12px]" />
                )}
                {form.traffic_source === "好友推荐" && (
                  <div className="flex-1 min-w-0">
                    <CustomerSearchInput
                      customers={customers}
                      value={form.traffic_source_detail || ""}
                      onChange={(v) => setForm({ ...form, traffic_source_detail: typeof v === "string" ? v : v[0] || "" })}
                      placeholder="好友昵称"
                      filterSelected={false}
                    />
                  </div>
                )}
                {form.traffic_source === "朋友圈" && (
                  <div className="flex-1 min-w-0">
                    <CustomerSearchInput
                      customers={customers}
                      value={form.traffic_source_detail || ""}
                      onChange={(v) => setForm({ ...form, traffic_source_detail: typeof v === "string" ? v : v[0] || "" })}
                      placeholder="所属人"
                      filterSelected={false}
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-[#f0f0f0]" />

            <div className="space-y-3">
              <div className="grid grid-cols-[70px_1fr] items-start gap-x-3 gap-y-3">
                <span className="text-[12px] text-[#4e535a] font-light block text-right tracking-widest pt-2.5">工作情况</span>
                <div className="flex gap-2">
                  <SelectDropdown
                    value={form.work_status || ""}
                    options={[{ value: "在职", label: "在职" }, { value: "离职", label: "离职" }, { value: "自由职业", label: "自由职业" }]}
                    placeholder="是否在职"
                    onChange={(v) => setForm({ ...form, work_status: v })}
                    className="w-[100px]"
                  />
                  <Input value={form.work_description || ""} onChange={(e) => setForm({ ...form, work_description: e.target.value })} placeholder="描述工作内容..." className="flex-1" />
                </div>
              </div>
              <div className="grid grid-cols-[70px_1fr] items-start gap-x-3 gap-y-3">
                <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">创伤经历</span>
                <Textarea value={form.basic_info || ""} onChange={(e) => setForm({ ...form, basic_info: e.target.value })} rows={1} className="resize-none min-h-0" placeholder="请输入" />
              </div>
              <div className="grid grid-cols-[70px_1fr] items-start gap-x-3 gap-y-3">
                <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">当下卡点</span>
                <Textarea value={form.assessment || ""} onChange={(e) => setForm({ ...form, assessment: e.target.value })} rows={1} className="resize-none min-h-0" placeholder="请输入" />
              </div>
              <div className="grid grid-cols-[70px_1fr] items-start gap-x-3 gap-y-3">
                <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">到访目的</span>
                <Textarea value={form.tags || ""} onChange={(e) => setForm({ ...form, tags: e.target.value })} rows={1} className="resize-none min-h-0" placeholder="请输入" />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#f0f0f0]">
              <Button variant="outline" size="sm" onClick={() => setCreateOpen(false)}>取消</Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? "保存中..." : editingId ? "保存" : "创建"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 删除确认弹窗 */}
      <Dialog open={!!deleteTarget} onOpenChange={() => { setDeleteTarget(null); setDeleteConfirmName("") }}>
        <DialogContent className="w-[360px] max-w-[90vw] p-0 gap-0">
          <div className="px-5 py-3 border-b border-[#f0f0f0]">
            <h3 className="text-[14px] font-normal">删除客户</h3>
          </div>
          <div className="px-5 py-4 space-y-3">
            <p className="text-[12px] text-[#2b2f36]">
              确定要删除「<span className="font-medium">{deleteTarget?.nickname}</span>」吗？删除后不可恢复。
            </p>
            <div>
              <label className="text-[11px] text-[#8f959e] mb-1 block">请输入客户昵称确认删除</label>
              <Input
                value={deleteConfirmName}
                onChange={(e) => setDeleteConfirmName(e.target.value)}
                placeholder={deleteTarget?.nickname || ""}
                className="h-8"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 px-5 py-3 border-t border-[#f0f0f0]">
            <Button variant="outline" size="sm" onClick={() => { setDeleteTarget(null); setDeleteConfirmName("") }}>取消</Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleConfirmDelete}
              disabled={deleteConfirmName !== deleteTarget?.nickname}
            >
              确定删除
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
