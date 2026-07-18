import { useState, useEffect, useCallback } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { CustomerSearchInput } from "@/components/customer-search-input"
import { SelectDropdown } from "@/components/select-dropdown"
import ListView from "./components/list-view"
import DetailView from "./components/detail-view"
import { customerApi, memberIdentityApi, statisticsApi, type CustomerLight, type DashboardSummary } from "@/lib/api"

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

  // 统计摘要
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const loadSummary = useCallback(() => {
    statisticsApi.dashboard().then(setSummary).catch(() => setSummary(null))
  }, [])

  useEffect(() => {
    customerApi.clearLightCache()
    customerApi.light().then(setCustomers).catch(() => {})
    memberIdentityApi.list().then(list => setIdentityNames(list.map(i => i.name).reverse())).catch(() => {})
    loadSummary()
  }, [loadSummary])

  // 从编辑页返回时自动刷新列表
  useEffect(() => {
    if (location.pathname === "/healing-records") {
      setRefreshKey(k => k + 1)
      customerApi.clearLightCache()
      customerApi.light().then(setCustomers).catch(() => {})
      loadSummary()
    }
  }, [location.key, loadSummary])

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
    <div className="min-h-full space-y-3 bg-[#f4f5f6] p-4">
      {/* V2 页眉横条：标题 + 统计 */}
      <div className="flex items-center flex-wrap gap-2 rounded-xl bg-white shadow-[0_1px_3px_rgba(33,38,49,.06)] px-5 h-[52px]">
        <span className="text-[15px] font-bold text-[#212631] whitespace-nowrap">客户资料</span>
        <span className="text-[11.5px] text-[#a8b1bd] ml-2.5 whitespace-nowrap">管理与查看全部客户关系档案</span>
        <span className="ml-auto flex items-center flex-wrap gap-y-1">
          <span className="flex items-baseline gap-1.5 whitespace-nowrap">
            <span className="text-[11px] text-[#79838f]"><span className="inline-block w-[7px] h-[7px] rounded-full bg-[#3370ff] mr-1 align-[1px]" />客户总数</span>
            <span className="text-[14px] font-semibold text-[#212631] tabular-nums">{summary ? summary.total_customers.toLocaleString() : "-"}</span>
          </span>
          <span className="w-px h-3.5 bg-[#f0f0f0] mx-5" />
          <span className="flex items-baseline gap-1.5 whitespace-nowrap">
            <span className="text-[11px] text-[#79838f]">本月到店</span>
            <span className="text-[14px] font-semibold text-[#212631] tabular-nums">{summary ? `${summary.arrived_customers_this_month.toLocaleString()} 人` : "-"}</span>
          </span>
          <span className="w-px h-3.5 bg-[#f0f0f0] mx-5" />
          <span className="flex items-baseline gap-1.5 whitespace-nowrap">
            <span className="text-[11px] text-[#79838f]">本月消费额</span>
            <span className="text-[14px] font-semibold text-[#212631] tabular-nums">{summary ? `¥${summary.revenue_this_month.toLocaleString()}` : "-"}</span>
          </span>
          <span className="w-px h-3.5 bg-[#f0f0f0] mx-5" />
          <span className="flex items-baseline gap-1.5 whitespace-nowrap">
            <span className="text-[11px] text-[#79838f]">待跟进</span>
            <span className="text-[14px] font-semibold text-[#212631] tabular-nums">{summary ? `${summary.not_arrived_customers.toLocaleString()} 人` : "-"}</span>
          </span>
        </span>
      </div>

      {/* 表格卡：筛选条 + 数据表 */}
      <div className="rounded-xl bg-white shadow-[0_2px_4px_rgba(33,38,49,.05)] overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-[#f0f0f0]">
          <div className="w-[172px]">
            <CustomerSearchInput
              customers={customers}
              value={searchNickname}
              onChange={(v) => { setSearchNickname(typeof v === "string" ? v : "") }}
              placeholder="搜索用户昵称或姓名"
              filterSelected={false}
              className="border-[#e1e4e7] bg-white px-2.5 placeholder:text-[#a8b1bd]"
              rounded="7px"
            />
          </div>
          <SelectDropdown
            className="w-[138px]"
            buttonClassName="border-[#e1e4e7] bg-white px-2.5"
            rounded="7px"
            value={searchIdentity}
            options={[{value: "", label: "全部身份"}, ...identityNames.map(id => ({value: id, label: id}))]}
            placeholder="全部身份"
            textColor={searchIdentity ? "text-[#2b2f36]" : "text-[#a8b1bd]"}
            onChange={(v) => { setSearchIdentity(v) }}
          />
          <div className="w-[138px]">
            <CustomerSearchInput
              customers={customers}
              value={searchReferrer}
              onChange={(v) => { setSearchReferrer(typeof v === "string" ? v : "") }}
              placeholder="引流人"
              filterSelected={false}
              className="border-[#e1e4e7] bg-white px-2.5 placeholder:text-[#a8b1bd]"
              rounded="7px"
            />
          </div>
          <div className="w-[138px]">
            <CustomerSearchInput
              customers={customers}
              value={searchReferrerHandler}
              onChange={(v) => { setSearchReferrerHandler(typeof v === "string" ? v : "") }}
              placeholder="承接人"
              filterSelected={false}
              className="border-[#e1e4e7] bg-white px-2.5 placeholder:text-[#a8b1bd]"
              rounded="7px"
            />
          </div>
          <button
            onClick={handleClear}
            className="flex h-8 items-center gap-1 rounded-[4px] border border-[#dee0e3] bg-white px-4 text-[12px] text-[#4e535a] hover:bg-[#f5f6f7]"
          >
            <X className="h-3.5 w-3.5" />
            清空
          </button>
          <div className="flex-1" />
          <Button size="sm" className="h-8 bg-[#212631] text-[12px] text-white hover:bg-[#303641]" onClick={handleAddNew}>
            <Plus className="mr-1 h-3.5 w-3.5 text-[#a3c0ff]" /> 新建客户
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
          summary={summary}
        />
      </div>

      {/* 客户详情弹窗 */}
      <Dialog open={detailOpen} onOpenChange={(open) => { setDetailOpen(open); if (!open) setSelectedCustomerId(null) }}>
        <DialogContent className="max-w-[1180px] max-h-[90vh] overflow-y-auto p-0 gap-0">
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
