import { useState, useEffect } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { CustomerSearchInput } from "@/components/customer-search-input"
import { SelectDropdown } from "@/components/select-dropdown"
import ListView from "./components/list-view"
import DetailView from "./components/detail-view"
import { customerApi, memberIdentityApi, type CustomerLight } from "@/lib/api"

export default function HealingRecordsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; nickname: string } | null>(null)
  const [deleteConfirmName, setDeleteConfirmName] = useState("")
  const [deleteError, setDeleteError] = useState("")
  const [customers, setCustomers] = useState<CustomerLight[]>([])
  const [identityNames, setIdentityNames] = useState<string[]>([])

  // 搜索状态
  const [searchNickname, setSearchNickname] = useState("")
  const [searchIdentity, setSearchIdentity] = useState("")
  const [searchReferrer, setSearchReferrer] = useState("")
  const [searchReferrerHandler, setSearchReferrerHandler] = useState("")

  useEffect(() => {
    customerApi.clearLightCache()
    customerApi.light().then(setCustomers).catch(() => {})
    memberIdentityApi.list().then(list => setIdentityNames(list.map(i => i.name).reverse())).catch(() => {})
  }, [])

  // 从编辑页返回时自动刷新列表
  useEffect(() => {
    if (location.pathname === "/healing-records") {
      setRefreshKey(k => k + 1)
      customerApi.clearLightCache()
      customerApi.light().then(setCustomers).catch(() => {})
    }
  }, [location.key])

  const handleClear = () => {
    setSearchNickname("")
    setSearchIdentity("")
    setSearchReferrer("")
    setSearchReferrerHandler("")
  }

  const handleSelectCustomer = (customerId: string) => {
    setSelectedCustomerId(customerId)
    setDetailOpen(true)
  }

  const handleAddNew = () => navigate("/healing-records/new")
  const handleEditCustomer = (id: string) => navigate(`/healing-records/${id}/edit`)

  const handleDeleteCustomer = (id: string, nickname: string) => {
    setDeleteTarget({ id, nickname })
    setDeleteConfirmName("")
  }

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return
    setDeleteError("")
    try {
      await customerApi.delete(deleteTarget.id)
      setDeleteTarget(null)
      setDeleteConfirmName("")
      setRefreshKey(k => k + 1)
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "删除失败")
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
            onChange={(v) => { setSearchNickname(typeof v === "string" ? v : "") }}
            placeholder="搜索昵称"
            filterSelected={false}
          />
        </div>
        <SelectDropdown
          className="w-36"
          value={searchIdentity}
          options={[{value: "", label: "全部身份"}, ...identityNames.map(id => ({value: id, label: id}))]}
          placeholder="全部身份"
          onChange={(v) => { setSearchIdentity(v) }}
        />
        <div className="w-44">
          <CustomerSearchInput
            customers={customers}
            value={searchReferrer}
            onChange={(v) => { setSearchReferrer(typeof v === "string" ? v : "") }}
            placeholder="搜索引流人"
            filterSelected={false}
          />
        </div>
        <div className="w-44">
          <CustomerSearchInput
            customers={customers}
            value={searchReferrerHandler}
            onChange={(v) => { setSearchReferrerHandler(typeof v === "string" ? v : "") }}
            placeholder="搜索承接人"
            filterSelected={false}
          />
        </div>
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
        refreshKey={refreshKey}
        onSelectCustomer={handleSelectCustomer}
        onDeleteCustomer={handleDeleteCustomer}
        onEditCustomer={handleEditCustomer}
        filterNickname={searchNickname}
        filterIdentity={searchIdentity}
        filterReferrer={searchReferrer}
        filterReferrerHandler={searchReferrerHandler}
      />

      {/* 客户详情弹窗 */}
      <Dialog open={detailOpen} onOpenChange={(open) => { setDetailOpen(open); if (!open) setSelectedCustomerId(null) }}>
        <DialogContent className="max-w-[1000px] max-h-[85vh] overflow-y-auto p-0 gap-0">
          <DetailView
            selectedCustomerId={selectedCustomerId}
            onClearSelection={() => setDetailOpen(false)}
            hideSearch
          />
        </DialogContent>
      </Dialog>

      {/* 删除确认弹窗 */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) { setDeleteTarget(null); setDeleteConfirmName(""); setDeleteError("") } }}>
        <DialogContent className="w-[360px] max-w-[90vw] p-0 gap-0">
          <div className="px-5 py-3 border-b border-[#f0f0f0]">
            <h3 className="text-[14px] font-normal">删除客户</h3>
          </div>
          <div className="px-5 py-4 space-y-3">
            <p className="text-[12px] text-[#2b2f36]">
              确定要删除「<span className="font-medium">{deleteTarget?.nickname || deleteTarget?.id}</span>」吗？删除后不可恢复。
            </p>
            <div>
              <label className="text-[11px] text-[#8f959e] mb-1 block">请输入客户昵称确认删除</label>
              <Input
                value={deleteConfirmName}
                onChange={(e) => { setDeleteConfirmName(e.target.value); setDeleteError("") }}
                placeholder={deleteTarget?.nickname || "请输入昵称"}
                className="h-8"
              />
            </div>
            {deleteError && <p className="text-[11px] text-[#f54a45]">{deleteError}</p>}
          </div>
          <div className="flex justify-end gap-2 px-5 py-3 border-t border-[#f0f0f0]">
            <Button variant="outline" size="sm" onClick={() => { setDeleteTarget(null); setDeleteConfirmName(""); setDeleteError("") }}>取消</Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleConfirmDelete}
              disabled={!deleteTarget?.nickname || deleteConfirmName !== deleteTarget?.nickname}
            >
              确定删除
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
